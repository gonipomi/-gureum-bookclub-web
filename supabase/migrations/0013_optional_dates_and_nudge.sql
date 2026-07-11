-- ============================================================
-- 되돌리기 + 보완: "읽기 신청"도 다시 날짜 나중에 정하기가 가능해야 한다
-- (위시매칭으로 자동 대기열에 들어간 사람은 애초에 날짜가 없어서, 무조건
-- 날짜 필수로 만들면 이 흐름과 안 맞았다). 대신 다른 사람이 같은 책에
-- 또 신청하면, 날짜 없이 대기 중인 사람이 화면에서 바로 알아채고
-- 날짜를 정하거나 대기를 포기할 수 있게 한다(자동 취소 타이머는 아직 없음 —
-- 이메일/스케줄러가 붙는 Phase 5 이후에 고려).
--
-- 추가: 본인 소유가 아닌 "안 읽음"(아직 아무도 안 읽은) 책도 이제 읽기 신청 대상.
-- ============================================================

create or replace function public.request_to_read_book(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_desired_date date default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_requests jsonb;
begin
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if v_book.current_reader_id is not null then raise exception '지금 읽는 사람이 있는 책이에요.'; end if;
  if coalesce(v_book.pending_return, false) and v_book.holder_id = p_member_id then raise exception '이미 읽은 책이에요.'; end if;
  if v_book.owner_id = p_member_id then raise exception '본인 책은 신청할 수 없어요.'; end if;
  if coalesce(v_book.external_borrow, false) then raise exception '도서관/모임 밖에서 빌려 읽은 책이라 신청할 수 없어요.'; end if;

  v_requests := coalesce(v_book.read_requests, '[]'::jsonb);
  if exists (select 1 from jsonb_array_elements(v_requests) e where (e->>'memberId')::uuid = p_member_id) then
    raise exception '이미 신청했어요.';
  end if;

  v_requests := v_requests || jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid()::text, 'memberId', p_member_id, 'requestedAt', now(), 'desiredDate', p_desired_date, 'counterDate', null
  ));
  update public.books set read_requests = v_requests where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.request_to_join_queue(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_desired_date date default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_existing_entry jsonb;
  v_requests jsonb;
begin
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if v_book.current_reader_id is null then raise exception '지금 읽는 사람이 없는 책이에요.'; end if;
  if p_member_id = v_book.current_reader_id then raise exception '이미 읽고 있는 사람이에요'; end if;

  select e into v_existing_entry from jsonb_array_elements(coalesce(v_book.queue, '[]'::jsonb)) e where (e->>'memberId')::uuid = p_member_id limit 1;
  if v_existing_entry is not null and v_existing_entry->>'desiredDate' is not null then raise exception '이미 대기열에 있어요'; end if;

  v_requests := coalesce(v_book.queue_requests, '[]'::jsonb);
  if exists (select 1 from jsonb_array_elements(v_requests) e where (e->>'memberId')::uuid = p_member_id) then raise exception '이미 신청했어요.'; end if;

  v_requests := v_requests || jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid()::text, 'memberId', p_member_id, 'requestedAt', now(), 'desiredDate', p_desired_date, 'counterDate', null
  ));
  update public.books set queue_requests = v_requests where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

-- 대기열에 이미 들어간(승인된) 사람이 스스로 날짜를 정한다 — 위시매칭으로 날짜 없이
-- 들어간 경우, 또는 그냥 나중에 정하겠다고 했다가 이제 정하고 싶을 때 쓴다.
create function public.set_my_queue_date(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_date date)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_queue jsonb;
  i int;
  n int;
  v_found boolean := false;
begin
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  if p_date is null then raise exception '날짜를 선택해주세요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  v_queue := coalesce(v_book.queue, '[]'::jsonb);
  n := jsonb_array_length(v_queue);
  for i in 0..n-1 loop
    if ((v_queue->i)->>'memberId')::uuid = p_member_id then
      v_queue := jsonb_set(v_queue, array[i::text, 'desiredDate'], to_jsonb(p_date::text));
      v_found := true;
    end if;
  end loop;
  if not v_found then raise exception '대기열에서 찾을 수 없어요.'; end if;

  update public.books set queue = v_queue, updated_at = now() where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

grant execute on function public.set_my_queue_date(uuid, uuid, uuid, date) to authenticated;

-- ============================================================
-- 위시매칭(“이 책 찾아요”에서 다른 멤버가 “이 책 있어요”를 누른 순간) 때,
-- 찾던 사람을 대기열에 날짜 없이 밀어넣지 않는다. 대기열/신청은 본인이 직접
-- "읽기 신청"을 눌러야 들어가는 게 맞고, 위시매칭은 "이 책 생겼어요" 정도의
-- 약한 관심 표시(찜)로 충분하다 — 그래야 "우리서고 > 읽고 싶은 책"에도 자동으로 뜬다.
-- ============================================================
create or replace function public.convert_wish_to_owned_book_(p_group_id uuid, p_wish public.wishlist, p_member_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_title text := trim(coalesce(p_wish.title, ''));
  v_normalized text;
  v_book_id uuid;
  v_existing public.books;
  v_requester_id uuid := p_wish.requested_by;
  v_hearts jsonb;
  v_requester_name text;
  v_photos jsonb;
begin
  if v_title = '' then return; end if;
  v_normalized := lower(regexp_replace(v_title, '\s+', '', 'g'));

  select * into v_existing from public.books
    where owner_id = p_member_id
      and lower(regexp_replace(title, '\s+', '', 'g')) = v_normalized
    limit 1;

  if found then
    v_book_id := v_existing.id;
  else
    insert into public.books (title, author, status, owner_id, cover_url, publisher, isbn13, want_to_read)
    values (v_title, p_wish.author, 'shelved', p_member_id, p_wish.cover_url, p_wish.publisher, p_wish.isbn13, true)
    returning id into v_book_id;
  end if;

  if v_requester_id is not null and v_requester_id <> p_member_id then
    select hearts, photos into v_hearts, v_photos from public.books where id = v_book_id;
    v_hearts := coalesce(v_hearts, '[]'::jsonb);
    v_photos := coalesce(v_photos, '[]'::jsonb);

    if not public.jsonb_array_has_value_(v_hearts, v_requester_id) then
      v_hearts := v_hearts || jsonb_build_array(to_jsonb(v_requester_id::text));

      -- 요청자 이름은 "이 그룹"에서의 멤버십 이름으로 표시한다(그룹별 얼굴이라는 규칙과 일관되게).
      select name into v_requester_name from public.memberships where profile_id = v_requester_id and group_id = p_group_id;
      if v_requester_name is not null then
        v_photos := jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid()::text, 'type', 'comment', 'fileId', null, 'url', null,
          'caption', '📚 ' || v_requester_name || '님이 찾던 책이에요. 읽고 싶으면 찜하거나 읽기 신청해보세요.',
          'authorId', null, 'createdAt', now()
        )) || v_photos;
      end if;

      update public.books set hearts = v_hearts, photos = v_photos, updated_at = now() where id = v_book_id;
    end if;
  end if;
end;
$$;
