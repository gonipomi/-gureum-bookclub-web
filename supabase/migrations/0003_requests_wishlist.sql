-- ============================================================
-- Phase 3: 읽기신청/찜신청/대기열 워크플로우 + 위시리스트("이 책 찾아요")
-- Books.gs의 requestToReadBook~removeFromQueue, addWishlistItem~deleteWishlistItem을 이식
-- ============================================================

-- ---------- 추가 jsonb 헬퍼 ----------

-- 스칼라 값(uuid) 배열에서 값 제거 (wishlist.owners처럼 객체가 아니라 값만 든 배열용)
create function public.jsonb_array_remove_value_(arr jsonb, val uuid)
returns jsonb
language sql immutable as $$
  select coalesce(
    (select jsonb_agg(e) from jsonb_array_elements_text(coalesce(arr, '[]'::jsonb)) e
     where e::uuid is distinct from val),
    '[]'::jsonb
  );
$$;

create function public.jsonb_array_has_value_(arr jsonb, val uuid)
returns boolean
language sql immutable as $$
  select exists (
    select 1 from jsonb_array_elements_text(coalesce(arr, '[]'::jsonb)) e where e::uuid = val
  );
$$;

-- id 필드로 신청 항목 하나 찾기 (readRequests/queueRequests 공용)
create function public.jsonb_array_find_by_id_(arr jsonb, req_id text)
returns jsonb
language sql immutable as $$
  select e from jsonb_array_elements(coalesce(arr, '[]'::jsonb)) e where e->>'id' = req_id limit 1;
$$;

create function public.jsonb_array_remove_by_id_(arr jsonb, req_id text)
returns jsonb
language sql immutable as $$
  select coalesce(
    (select jsonb_agg(e) from jsonb_array_elements(coalesce(arr, '[]'::jsonb)) e where e->>'id' <> req_id),
    '[]'::jsonb
  );
$$;

create function public.jsonb_array_set_field_by_id_(arr jsonb, req_id text, field text, value jsonb)
returns jsonb
language plpgsql immutable as $$
declare
  result jsonb := coalesce(arr, '[]'::jsonb);
  i int;
  n int := jsonb_array_length(coalesce(arr, '[]'::jsonb));
begin
  for i in 0..n-1 loop
    if (result->i)->>'id' = req_id then
      result := jsonb_set(result, array[i::text, field], value);
    end if;
  end loop;
  return result;
end;
$$;

-- ============================================================
-- 위시리스트 ("이 책 찾아요")
-- ============================================================

-- 위시 항목을 memberId 소유의 실제 책으로 전환한다. toggle_wishlist_owner()가 쓴다.
create function public.convert_wish_to_owned_book_(p_group_id uuid, p_wish public.wishlist, p_member_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_title text := trim(coalesce(p_wish.title, ''));
  v_normalized text;
  v_book_id uuid;
  v_existing public.books;
  v_requester_id uuid := p_wish.requested_by;
  v_queue jsonb;
  v_requester_name text;
  v_photos jsonb;
begin
  if v_title = '' then return; end if;
  v_normalized := lower(regexp_replace(v_title, '\s+', '', 'g'));

  select * into v_existing from public.books
    where group_id = p_group_id and owner_id = p_member_id
      and lower(regexp_replace(title, '\s+', '', 'g')) = v_normalized
    limit 1;

  if found then
    v_book_id := v_existing.id;
  else
    insert into public.books (group_id, title, author, status, owner_id, cover_url, publisher, isbn13, want_to_read)
    values (p_group_id, v_title, p_wish.author, 'shelved', p_member_id, p_wish.cover_url, p_wish.publisher, p_wish.isbn13, true)
    returning id into v_book_id;
  end if;

  if v_requester_id is not null and v_requester_id <> p_member_id then
    select queue, photos into v_queue, v_photos from public.books where id = v_book_id;
    v_queue := coalesce(v_queue, '[]'::jsonb);
    v_photos := coalesce(v_photos, '[]'::jsonb);

    if not exists (select 1 from jsonb_array_elements(v_queue) e where (e->>'memberId')::uuid = v_requester_id) then
      v_queue := v_queue || jsonb_build_array(jsonb_build_object('memberId', v_requester_id, 'desiredDate', null));

      select name into v_requester_name from public.memberships where id = v_requester_id;
      if v_requester_name is not null then
        -- 이 책이 위시리스트("이 책 찾아요")를 통해 매칭됐다는 출처를 책 기록에 한 줄 남긴다.
        v_photos := jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid()::text, 'type', 'comment', 'fileId', null, 'url', null,
          'caption', '📚 ' || v_requester_name || '님이 찾던 책이에요.',
          'authorId', null, 'createdAt', now()
        )) || v_photos;
      end if;

      update public.books set queue = v_queue, photos = v_photos, updated_at = now() where id = v_book_id;
    end if;
  end if;
end;
$$;

create function public.add_wishlist_item(
  p_group_id uuid,
  p_title text,
  p_author text default null,
  p_requested_by uuid default null,
  p_note text default null,
  p_cover_url text default null,
  p_publisher text default null,
  p_isbn13 text default null,
  p_already_owned boolean default false
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception '책 제목을 입력해주세요'; end if;

  insert into public.wishlist (group_id, title, author, requested_by, note, cover_url, publisher, isbn13)
  values (
    p_group_id, trim(p_title), nullif(trim(coalesce(p_author, '')), ''), p_requested_by,
    nullif(trim(coalesce(p_note, '')), ''), nullif(p_cover_url, ''), nullif(p_publisher, ''), nullif(p_isbn13, '')
  ) returning id into v_id;

  if p_already_owned and p_requested_by is not null then
    return public.toggle_wishlist_owner(p_group_id, v_id, p_requested_by, true);
  end if;

  return public.get_state(p_group_id);
end;
$$;

create function public.toggle_wishlist_owner(p_group_id uuid, p_wish_id uuid, p_member_id uuid, p_has_it boolean)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_wish public.wishlist;
  v_owners jsonb;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_member_id is null then raise exception '멤버를 선택해주세요'; end if;

  select * into v_wish from public.wishlist where id = p_wish_id and group_id = p_group_id;
  if not found then raise exception '항목을 찾을 수 없어요'; end if;

  v_owners := coalesce(v_wish.owners, '[]'::jsonb);

  if not p_has_it then
    v_owners := public.jsonb_array_remove_value_(v_owners, p_member_id);
    update public.wishlist set owners = v_owners where id = p_wish_id;
    return public.get_state(p_group_id);
  end if;

  if not public.jsonb_array_has_value_(v_owners, p_member_id) then
    v_owners := v_owners || jsonb_build_array(to_jsonb(p_member_id::text));
  end if;
  update public.wishlist set owners = v_owners where id = p_wish_id;

  if coalesce(trim(v_wish.title), '') = '' then raise exception '책 제목이 없어요'; end if;

  perform public.convert_wish_to_owned_book_(p_group_id, v_wish, p_member_id);

  -- 주인이 매칭되면 "이 책 찾아요" 목적은 끝난 것 — 위시리스트 항목 자체는 지운다.
  delete from public.wishlist where id = p_wish_id;

  return public.get_state(p_group_id);
end;
$$;

create function public.delete_wishlist_item(p_group_id uuid, p_wish_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  delete from public.wishlist where id = p_wish_id and group_id = p_group_id;
  return public.get_state(p_group_id);
end;
$$;

-- ============================================================
-- 읽기 신청 (완독된 책 대상)
-- ============================================================

create function public.request_to_read_book(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_desired_date date default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_requests jsonb;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  if v_book.status <> 'finished' then raise exception '완독된 책만 신청할 수 있어요.'; end if;
  if v_book.owner_id = p_member_id then raise exception '본인 책은 신청할 수 없어요.'; end if;
  if coalesce(v_book.external_borrow, false) then raise exception '도서관/모임 밖에서 빌려 읽은 책이라 신청할 수 없어요.'; end if;

  v_requests := coalesce(v_book.read_requests, '[]'::jsonb);
  if exists (select 1 from jsonb_array_elements(v_requests) e where (e->>'memberId')::uuid = p_member_id) then
    raise exception '이미 신청했어요.';
  end if;

  v_requests := v_requests || jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid()::text, 'memberId', p_member_id, 'requestedAt', now(),
    'desiredDate', p_desired_date, 'counterDate', null
  ));
  update public.books set read_requests = v_requests where id = p_book_id;

  -- TODO(Phase 5): 책주인에게 읽기 신청 이메일 발송

  return public.get_state(p_group_id);
end;
$$;

create function public.approve_read_request(p_group_id uuid, p_book_id uuid, p_request_id text, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
  v_final_date date;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  v_target := public.jsonb_array_find_by_id_(v_book.read_requests, p_request_id);
  if v_target is null then raise exception '신청을 찾을 수 없어요.'; end if;

  if v_target->>'counterDate' is not null then
    if p_actor_id is null or p_actor_id <> (v_target->>'memberId')::uuid then
      raise exception '신청한 본인만 수락할 수 있어요.';
    end if;
    v_final_date := (v_target->>'counterDate')::date;
  else
    if p_actor_id is null or p_actor_id <> v_book.owner_id then
      raise exception '책주인만 수락할 수 있어요.';
    end if;
    v_final_date := nullif(v_target->>'desiredDate', '')::date;
  end if;

  update public.books set read_requests = public.jsonb_array_remove_by_id_(v_book.read_requests, p_request_id) where id = p_book_id;

  perform public.assign_reader(p_group_id, p_book_id, (v_target->>'memberId')::uuid, current_date, v_final_date);

  return public.get_state(p_group_id);
end;
$$;

create function public.reject_read_request(p_group_id uuid, p_book_id uuid, p_request_id text, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
  v_is_requester boolean;
  v_is_owner boolean;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  v_target := public.jsonb_array_find_by_id_(v_book.read_requests, p_request_id);
  if v_target is null then raise exception '신청을 찾을 수 없어요.'; end if;

  v_is_requester := p_actor_id is not null and p_actor_id = (v_target->>'memberId')::uuid;
  v_is_owner := p_actor_id is not null and p_actor_id = v_book.owner_id and v_target->>'counterDate' is null;
  if not v_is_requester and not v_is_owner then
    raise exception '이 신청을 거절할 권한이 없어요.';
  end if;

  update public.books set read_requests = public.jsonb_array_remove_by_id_(v_book.read_requests, p_request_id) where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create function public.counter_read_request_date(p_group_id uuid, p_book_id uuid, p_request_id text, p_owner_id uuid, p_counter_date date)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_counter_date is null then raise exception '제안할 날짜를 입력해주세요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;
  if p_owner_id is null or p_owner_id <> v_book.owner_id then
    raise exception '책주인만 다른 날짜를 제안할 수 있어요.';
  end if;

  v_target := public.jsonb_array_find_by_id_(v_book.read_requests, p_request_id);
  if v_target is null then raise exception '신청을 찾을 수 없어요.'; end if;
  if v_target->>'counterDate' is not null then
    raise exception '이미 다른 날짜를 제안했어요. 신청자의 응답을 기다려주세요.';
  end if;

  update public.books set read_requests = public.jsonb_array_set_field_by_id_(v_book.read_requests, p_request_id, 'counterDate', to_jsonb(p_counter_date::text))
  where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

-- ============================================================
-- 찜 신청 (읽는 중인 책 대상) + 대기열 관리
-- ============================================================

create function public.request_to_join_queue(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_desired_date date default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_existing_entry jsonb;
  v_requests jsonb;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  if v_book.current_reader_id is null then raise exception '지금 읽는 사람이 없는 책이에요.'; end if;
  if p_member_id = v_book.current_reader_id then raise exception '이미 읽고 있는 사람이에요'; end if;

  select e into v_existing_entry from jsonb_array_elements(coalesce(v_book.queue, '[]'::jsonb)) e
    where (e->>'memberId')::uuid = p_member_id limit 1;
  if v_existing_entry is not null and v_existing_entry->>'desiredDate' is not null then
    raise exception '이미 대기열에 있어요';
  end if;

  v_requests := coalesce(v_book.queue_requests, '[]'::jsonb);
  if exists (select 1 from jsonb_array_elements(v_requests) e where (e->>'memberId')::uuid = p_member_id) then
    raise exception '이미 신청했어요.';
  end if;

  v_requests := v_requests || jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid()::text, 'memberId', p_member_id, 'requestedAt', now(),
    'desiredDate', p_desired_date, 'counterDate', null
  ));
  update public.books set queue_requests = v_requests where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

-- 리더(readerId)가 신청자(matchedMemberId)를 방금 날짜로 수락했을 때, 두 사람이 서로의 책을
-- 하나씩 찜한 "맞교환" 상황인지 확인해서 같은 날짜로 자동 신청을 만들어준다.
create function public.try_sync_reciprocal_exchange_date_(p_group_id uuid, p_reader_id uuid, p_matched_member_id uuid, p_date date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  rec record;
  v_has_dateless boolean;
begin
  for rec in
    select id, queue from public.books
    where group_id = p_group_id and status = 'reading' and current_reader_id = p_matched_member_id
  loop
    v_has_dateless := exists (
      select 1 from jsonb_array_elements(coalesce(rec.queue, '[]'::jsonb)) e
      where (e->>'memberId')::uuid = p_reader_id and e->>'desiredDate' is null
    );
    if v_has_dateless then
      begin
        perform public.request_to_join_queue(p_group_id, rec.id, p_reader_id, p_date);
      exception when others then
        null; -- 이미 신청 있음 등은 조용히 무시 (원본 GAS도 catch해서 로그만 남김)
      end;
    end if;
  end loop;
end;
$$;

create function public.accept_queue_request(p_group_id uuid, p_book_id uuid, p_request_id text, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
  v_final_date date;
  v_queue jsonb;
  v_member_id uuid;
  v_idx int;
  n int;
  v_found boolean := false;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  v_target := public.jsonb_array_find_by_id_(v_book.queue_requests, p_request_id);
  if v_target is null then raise exception '신청을 찾을 수 없어요.'; end if;
  v_member_id := (v_target->>'memberId')::uuid;

  if v_target->>'counterDate' is not null then
    if p_actor_id is null or p_actor_id <> v_member_id then raise exception '신청한 본인만 수락할 수 있어요.'; end if;
    v_final_date := (v_target->>'counterDate')::date;
  else
    if p_actor_id is null or p_actor_id <> v_book.current_reader_id then raise exception '지금 읽는 사람만 수락할 수 있어요.'; end if;
    v_final_date := nullif(v_target->>'desiredDate', '')::date;
  end if;

  v_queue := coalesce(v_book.queue, '[]'::jsonb);
  n := jsonb_array_length(v_queue);
  for v_idx in 0..n-1 loop
    if ((v_queue->v_idx)->>'memberId')::uuid = v_member_id then
      v_queue := jsonb_set(v_queue, array[v_idx::text], jsonb_build_object('memberId', v_member_id, 'desiredDate', v_final_date));
      v_found := true;
    end if;
  end loop;
  if not v_found then
    v_queue := v_queue || jsonb_build_array(jsonb_build_object('memberId', v_member_id, 'desiredDate', v_final_date));
  end if;

  update public.books set
    queue_requests = public.jsonb_array_remove_by_id_(v_book.queue_requests, p_request_id),
    queue = v_queue,
    updated_at = now(),
    next_exchange_date = case when v_final_date is not null then v_final_date else next_exchange_date end
  where id = p_book_id;

  if v_final_date is not null then
    perform public.try_sync_reciprocal_exchange_date_(p_group_id, v_book.current_reader_id, v_member_id, v_final_date);
  end if;

  return public.get_state(p_group_id);
end;
$$;

create function public.reject_queue_request(p_group_id uuid, p_book_id uuid, p_request_id text, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
  v_is_requester boolean;
  v_is_reader boolean;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  v_target := public.jsonb_array_find_by_id_(v_book.queue_requests, p_request_id);
  if v_target is null then raise exception '신청을 찾을 수 없어요.'; end if;

  v_is_requester := p_actor_id is not null and p_actor_id = (v_target->>'memberId')::uuid;
  v_is_reader := p_actor_id is not null and p_actor_id = v_book.current_reader_id and v_target->>'counterDate' is null;
  if not v_is_requester and not v_is_reader then
    raise exception '이 신청을 거절할 권한이 없어요.';
  end if;

  update public.books set queue_requests = public.jsonb_array_remove_by_id_(v_book.queue_requests, p_request_id) where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create function public.counter_queue_request_date(p_group_id uuid, p_book_id uuid, p_request_id text, p_reader_id uuid, p_counter_date date)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_counter_date is null then raise exception '제안할 날짜를 입력해주세요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;
  if p_reader_id is null or p_reader_id <> v_book.current_reader_id then
    raise exception '지금 읽는 사람만 다른 날짜를 제안할 수 있어요.';
  end if;

  v_target := public.jsonb_array_find_by_id_(v_book.queue_requests, p_request_id);
  if v_target is null then raise exception '신청을 찾을 수 없어요.'; end if;
  if v_target->>'counterDate' is not null then
    raise exception '이미 다른 날짜를 제안했어요. 신청자의 응답을 기다려주세요.';
  end if;

  update public.books set queue_requests = public.jsonb_array_set_field_by_id_(v_book.queue_requests, p_request_id, 'counterDate', to_jsonb(p_counter_date::text))
  where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create function public.propose_date_for_queue_member(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_reader_id uuid, p_date date)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_queue_entry jsonb;
  v_requests jsonb;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_date is null then raise exception '제안할 날짜를 입력해주세요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;
  if p_reader_id is null or p_reader_id <> v_book.current_reader_id then
    raise exception '지금 읽는 사람만 제안할 수 있어요.';
  end if;

  select e into v_queue_entry from jsonb_array_elements(coalesce(v_book.queue, '[]'::jsonb)) e
    where (e->>'memberId')::uuid = p_member_id limit 1;
  if v_queue_entry is null then raise exception '대기열에서 찾을 수 없어요.'; end if;
  if v_queue_entry->>'desiredDate' is not null then raise exception '이미 날짜가 정해져 있어요.'; end if;

  v_requests := coalesce(v_book.queue_requests, '[]'::jsonb);
  if exists (select 1 from jsonb_array_elements(v_requests) e where (e->>'memberId')::uuid = p_member_id) then
    raise exception '이미 대기 중인 제안이 있어요.';
  end if;

  v_requests := v_requests || jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid()::text, 'memberId', p_member_id, 'desiredDate', null, 'counterDate', p_date
  ));
  update public.books set queue_requests = v_requests where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create function public.pass_to_next(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_requester_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_owner_is_holding boolean;
  v_target jsonb;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  v_owner_is_holding := p_requester_id is not null and p_requester_id = v_book.owner_id
    and not coalesce(v_book.pending_return, false)
    and (v_book.current_reader_id is null or v_book.current_reader_id = p_requester_id);
  if not v_owner_is_holding then
    raise exception '책주인만(반납 확인 후) 다음 사람에게 넘길 수 있어요. 다 읽었으면 "완독"으로 책주인에게 반납해주세요.';
  end if;

  select e into v_target from jsonb_array_elements(coalesce(v_book.queue, '[]'::jsonb)) e
    where (e->>'memberId')::uuid = p_member_id limit 1;
  if v_target is null then raise exception '대기열에서 찾을 수 없어요.'; end if;

  update public.books set queue = public.jsonb_array_remove_member_(v_book.queue, p_member_id) where id = p_book_id;

  perform public.assign_reader(p_group_id, p_book_id, p_member_id, current_date, nullif(v_target->>'desiredDate', '')::date);

  return public.get_state(p_group_id);
end;
$$;

create function public.confirm_pickup(p_group_id uuid, p_book_id uuid, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  if coalesce(v_book.pending_return, false) then
    raise exception '책주인이 아직 반납을 확인하지 않았어요.';
  end if;

  select e into v_target from jsonb_array_elements(coalesce(v_book.queue, '[]'::jsonb)) e
    where (e->>'memberId')::uuid = p_actor_id limit 1;
  if v_target is null then raise exception '대기열에서 찾을 수 없어요.'; end if;

  update public.books set queue = public.jsonb_array_remove_member_(v_book.queue, p_actor_id) where id = p_book_id;

  perform public.assign_reader(p_group_id, p_book_id, p_actor_id, current_date, nullif(v_target->>'desiredDate', '')::date);

  return public.get_state(p_group_id);
end;
$$;

create function public.confirm_return(p_group_id uuid, p_book_id uuid, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  if p_actor_id is null or p_actor_id <> v_book.owner_id then raise exception '책주인만 반납을 확인할 수 있어요.'; end if;
  if not coalesce(v_book.pending_return, false) then raise exception '반납 대기 중인 책이 아니에요.'; end if;

  update public.books set pending_return = false, holder_id = v_book.owner_id, updated_at = now() where id = p_book_id;

  -- TODO(Phase 5): 대기열 있으면 수령 가능 이메일 발송

  return public.get_state(p_group_id);
end;
$$;

create function public.remove_from_queue(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_requester_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  if p_requester_id is null or (p_requester_id <> p_member_id and p_requester_id <> v_book.current_reader_id) then
    raise exception '본인 또는 지금 읽는 사람만 뺄 수 있어요.';
  end if;

  update public.books set queue = public.jsonb_array_remove_member_(v_book.queue, p_member_id) where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

-- ============================================================
-- 권한
-- ============================================================
grant execute on function
  public.add_wishlist_item(uuid, text, text, uuid, text, text, text, text, boolean),
  public.toggle_wishlist_owner(uuid, uuid, uuid, boolean),
  public.delete_wishlist_item(uuid, uuid),
  public.request_to_read_book(uuid, uuid, uuid, date),
  public.approve_read_request(uuid, uuid, text, uuid),
  public.reject_read_request(uuid, uuid, text, uuid),
  public.counter_read_request_date(uuid, uuid, text, uuid, date),
  public.request_to_join_queue(uuid, uuid, uuid, date),
  public.accept_queue_request(uuid, uuid, text, uuid),
  public.reject_queue_request(uuid, uuid, text, uuid),
  public.counter_queue_request_date(uuid, uuid, text, uuid, date),
  public.propose_date_for_queue_member(uuid, uuid, uuid, uuid, date),
  public.pass_to_next(uuid, uuid, uuid, uuid),
  public.confirm_pickup(uuid, uuid, uuid),
  public.confirm_return(uuid, uuid, uuid),
  public.remove_from_queue(uuid, uuid, uuid, uuid)
  to authenticated;

grant select on public.wishlist to authenticated;
