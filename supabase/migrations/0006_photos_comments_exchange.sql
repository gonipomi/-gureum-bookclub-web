-- ============================================================
-- Phase 4: 책/교환일 사진·댓글 + 교환일 제안/투표/참석 워크플로우
-- (Books.gs의 uploadPhoto/deletePhoto/addTextMemo, Records.gs의 addRecordComment,
--  Exchange.gs 전체를 이식)
-- ============================================================

-- ---------- 사진 저장용 Storage 버킷 ----------
-- 경로는 "{groupId}/..." 형태 — 그 그룹 멤버만 올리고 지울 수 있게 제한한다.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "photos_upload_group_member" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and public.is_member_of(((storage.foldername(name))[1])::uuid));

create policy "photos_update_group_member" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and public.is_member_of(((storage.foldername(name))[1])::uuid));

create policy "photos_delete_group_member" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public.is_member_of(((storage.foldername(name))[1])::uuid));

create policy "photos_public_read" on storage.objects
  for select using (bucket_id = 'photos');

-- ============================================================
-- 책 사진 / 텍스트 메모
-- ============================================================

create function public.add_book_photo(p_group_id uuid, p_book_id uuid, p_url text, p_caption text default null, p_author_id uuid default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_photos jsonb;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  select photos into v_photos from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  v_photos := jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid()::text, 'type', 'photo', 'fileId', null, 'url', p_url,
    'caption', coalesce(p_caption, ''), 'authorId', p_author_id, 'createdAt', now(), 'comments', '[]'::jsonb
  )) || coalesce(v_photos, '[]'::jsonb);

  update public.books set photos = v_photos, updated_at = now() where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create function public.delete_book_photo(p_group_id uuid, p_book_id uuid, p_photo_id text)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  update public.books set photos = public.jsonb_array_remove_by_id_(photos, p_photo_id), updated_at = now()
  where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;
  return public.get_state(p_group_id);
end;
$$;

create function public.add_book_text_memo(p_group_id uuid, p_book_id uuid, p_author_id uuid, p_text text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_photos jsonb;
  v_clean text := trim(coalesce(p_text, ''));
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if v_clean = '' then raise exception '메모 내용을 입력해주세요'; end if;

  select photos into v_photos from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  v_photos := jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid()::text, 'type', 'comment', 'fileId', null, 'url', null,
    'caption', v_clean, 'authorId', p_author_id, 'createdAt', now()
  )) || coalesce(v_photos, '[]'::jsonb);

  update public.books set photos = v_photos, updated_at = now() where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

-- 책 사진/교환일 사진 둘 다에 쓰는 공용 댓글 함수
create function public.add_record_comment(p_group_id uuid, p_entity_type text, p_entity_id text, p_photo_id text, p_member_id uuid, p_text text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_clean text := left(trim(coalesce(p_text, '')), 300);
  v_comment jsonb;
  v_photos jsonb;
  i int;
  n int;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  if v_clean = '' then raise exception '댓글 내용을 입력해주세요'; end if;

  v_comment := jsonb_build_object('id', gen_random_uuid()::text, 'memberId', p_member_id, 'text', v_clean, 'createdAt', now());

  if p_entity_type = 'exchange' then
    select photos into v_photos from public.exchange_proposals where group_id = p_group_id and date = p_entity_id::date;
  else
    select photos into v_photos from public.books where id = p_entity_id::uuid and group_id = p_group_id;
  end if;
  if v_photos is null then raise exception '사진을 찾을 수 없어요'; end if;

  n := jsonb_array_length(v_photos);
  for i in 0..n-1 loop
    if (v_photos->i)->>'id' = p_photo_id then
      v_photos := jsonb_set(v_photos, array[i::text, 'comments'], coalesce((v_photos->i)->'comments', '[]'::jsonb) || jsonb_build_array(v_comment));
    end if;
  end loop;

  if p_entity_type = 'exchange' then
    update public.exchange_proposals set photos = v_photos where group_id = p_group_id and date = p_entity_id::date;
  else
    update public.books set photos = v_photos, updated_at = now() where id = p_entity_id::uuid and group_id = p_group_id;
  end if;

  return public.get_state(p_group_id);
end;
$$;

-- ============================================================
-- 교환일 헬퍼
-- ============================================================

create function public.apply_exchange_date_to_books_(p_group_id uuid, p_date date, p_book_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_book_ids is null or array_length(p_book_ids, 1) is null then return; end if;
  update public.books set next_exchange_date = p_date, updated_at = now()
  where group_id = p_group_id and id = any(p_book_ids) and status = 'reading';
end;
$$;

create function public.clear_exchange_date_for_books_(p_group_id uuid, p_date date, p_book_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_book_ids is null or array_length(p_book_ids, 1) is null then return; end if;
  update public.books set next_exchange_date = null, updated_at = now()
  where group_id = p_group_id and id = any(p_book_ids) and next_exchange_date = p_date;
end;
$$;

-- 특정 날짜의 참석자로 등록(신규 생성 또는 기존 제안에 합류)한다.
create function public.upsert_exchange_vote_(p_group_id uuid, p_date date, p_member_id uuid, p_book_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_proposal public.exchange_proposals;
  v_votes jsonb;
  v_book_ids_by_member jsonb;
begin
  select * into v_proposal from public.exchange_proposals where group_id = p_group_id and date = p_date;

  if found then
    v_votes := coalesce(v_proposal.votes, '[]'::jsonb);
    if not exists (select 1 from jsonb_array_elements_text(v_votes) e where e::uuid = p_member_id) then
      v_votes := v_votes || jsonb_build_array(to_jsonb(p_member_id::text));
    end if;
    v_book_ids_by_member := coalesce(v_proposal.book_ids_by_member, '{}'::jsonb)
      || jsonb_build_object(p_member_id::text, to_jsonb(coalesce(p_book_ids, array[]::uuid[])));
    update public.exchange_proposals set votes = v_votes, book_ids_by_member = v_book_ids_by_member where id = v_proposal.id;
  else
    insert into public.exchange_proposals (group_id, date, proposed_by, votes, book_ids_by_member)
    values (
      p_group_id, p_date, p_member_id,
      jsonb_build_array(to_jsonb(p_member_id::text)),
      jsonb_build_object(p_member_id::text, to_jsonb(coalesce(p_book_ids, array[]::uuid[])))
    );
  end if;

  perform public.apply_exchange_date_to_books_(p_group_id, p_date, p_book_ids);
end;
$$;

-- ============================================================
-- 교환일 제안 / 투표 / 삭제 / 댓글
-- ============================================================

create function public.propose_exchange_date(p_group_id uuid, p_member_id uuid, p_date date, p_book_ids uuid[] default array[]::uuid[])
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_member_id is null then raise exception '제안하는 사람을 선택해주세요'; end if;
  if p_date is null then raise exception '날짜를 선택해주세요'; end if;

  perform public.upsert_exchange_vote_(p_group_id, p_date, p_member_id, p_book_ids);

  return public.get_state(p_group_id);
end;
$$;

create function public.vote_exchange_proposal(p_group_id uuid, p_proposal_id uuid, p_member_id uuid, p_vote_on boolean, p_book_ids uuid[] default array[]::uuid[])
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_proposal public.exchange_proposals;
  v_votes jsonb;
  v_book_ids_by_member jsonb;
  v_previous_book_ids uuid[];
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_member_id is null then raise exception '투표하는 사람을 선택해주세요'; end if;

  select * into v_proposal from public.exchange_proposals where id = p_proposal_id and group_id = p_group_id;
  if not found then raise exception '제안을 찾을 수 없어요'; end if;

  v_votes := coalesce(v_proposal.votes, '[]'::jsonb);
  v_book_ids_by_member := coalesce(v_proposal.book_ids_by_member, '{}'::jsonb);

  if p_vote_on then
    if not exists (select 1 from jsonb_array_elements_text(v_votes) e where e::uuid = p_member_id) then
      v_votes := v_votes || jsonb_build_array(to_jsonb(p_member_id::text));
    end if;
    v_book_ids_by_member := v_book_ids_by_member || jsonb_build_object(p_member_id::text, to_jsonb(coalesce(p_book_ids, array[]::uuid[])));
    perform public.apply_exchange_date_to_books_(p_group_id, v_proposal.date, p_book_ids);
  else
    select array(select jsonb_array_elements_text(coalesce(v_book_ids_by_member -> p_member_id::text, '[]'::jsonb)))::uuid[] into v_previous_book_ids;
    perform public.clear_exchange_date_for_books_(p_group_id, v_proposal.date, v_previous_book_ids);
    v_votes := public.jsonb_array_remove_value_(v_votes, p_member_id);
    v_book_ids_by_member := v_book_ids_by_member - p_member_id::text;
  end if;

  update public.exchange_proposals set votes = v_votes, book_ids_by_member = v_book_ids_by_member where id = p_proposal_id;

  return public.get_state(p_group_id);
end;
$$;

create function public.delete_exchange_proposal(p_group_id uuid, p_proposal_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  delete from public.exchange_proposals where id = p_proposal_id and group_id = p_group_id;
  return public.get_state(p_group_id);
end;
$$;

create function public.add_exchange_date_comment(p_group_id uuid, p_date date, p_member_id uuid, p_text text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_clean text := left(trim(coalesce(p_text, '')), 300);
  v_comment jsonb;
  v_existing public.exchange_proposals;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  if p_date is null then raise exception '날짜가 없어요.'; end if;
  if v_clean = '' then raise exception '댓글 내용을 입력해주세요'; end if;

  v_comment := jsonb_build_object('id', gen_random_uuid()::text, 'memberId', p_member_id, 'text', v_clean, 'createdAt', now());

  select * into v_existing from public.exchange_proposals where group_id = p_group_id and date = p_date;
  if found then
    update public.exchange_proposals set comments = coalesce(comments, '[]'::jsonb) || jsonb_build_array(v_comment) where id = v_existing.id;
  else
    insert into public.exchange_proposals (group_id, date, proposed_by, comments)
    values (p_group_id, p_date, p_member_id, jsonb_build_array(v_comment));
  end if;

  return public.get_state(p_group_id);
end;
$$;

create function public.add_exchange_photo(p_group_id uuid, p_date date, p_url text, p_caption text default null, p_author_id uuid default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_photo jsonb;
  v_existing public.exchange_proposals;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_date is null then raise exception '날짜가 없어요.'; end if;

  v_photo := jsonb_build_object(
    'id', gen_random_uuid()::text, 'type', 'photo', 'fileId', null, 'url', p_url,
    'caption', coalesce(p_caption, ''), 'authorId', p_author_id, 'createdAt', now(), 'comments', '[]'::jsonb
  );

  select * into v_existing from public.exchange_proposals where group_id = p_group_id and date = p_date;
  if found then
    update public.exchange_proposals set photos = jsonb_build_array(v_photo) || coalesce(photos, '[]'::jsonb) where id = v_existing.id;
  else
    insert into public.exchange_proposals (group_id, date, proposed_by, photos)
    values (p_group_id, p_date, p_author_id, jsonb_build_array(v_photo));
  end if;

  return public.get_state(p_group_id);
end;
$$;

create function public.delete_exchange_photo(p_group_id uuid, p_date date, p_photo_id text)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  update public.exchange_proposals set photos = public.jsonb_array_remove_by_id_(photos, p_photo_id)
  where group_id = p_group_id and date = p_date;
  if not found then raise exception '교환일을 찾을 수 없어요'; end if;
  return public.get_state(p_group_id);
end;
$$;

create function public.join_exchange_date(p_group_id uuid, p_date date, p_member_id uuid, p_book_ids uuid[] default array[]::uuid[])
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_member_id is null then raise exception '참여하는 사람을 선택해주세요'; end if;

  if p_book_ids is not null and array_length(p_book_ids, 1) > 0 then
    update public.books set next_exchange_date = p_date, updated_at = now()
    where group_id = p_group_id and status = 'reading' and current_reader_id = p_member_id and id = any(p_book_ids);
    if not found then
      raise exception '선택한 책 중 지금 읽고 있는 책을 찾을 수 없어요.';
    end if;
  end if;

  perform public.upsert_exchange_vote_(p_group_id, p_date, p_member_id, p_book_ids);

  return public.get_state(p_group_id);
end;
$$;

create function public.leave_exchange_date(p_group_id uuid, p_date date, p_member_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_proposal public.exchange_proposals;
  v_did_something boolean := false;
  v_previous_book_ids uuid[];
  v_votes jsonb;
  v_book_ids_by_member jsonb;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_date is null then raise exception '날짜가 없어요'; end if;
  if p_member_id is null then raise exception '빠지는 사람을 선택해주세요'; end if;

  select * into v_proposal from public.exchange_proposals where group_id = p_group_id and date = p_date;
  if found then
    v_votes := coalesce(v_proposal.votes, '[]'::jsonb);
    if exists (select 1 from jsonb_array_elements_text(v_votes) e where e::uuid = p_member_id) then
      v_book_ids_by_member := coalesce(v_proposal.book_ids_by_member, '{}'::jsonb);
      select array(select jsonb_array_elements_text(coalesce(v_book_ids_by_member -> p_member_id::text, '[]'::jsonb)))::uuid[] into v_previous_book_ids;
      perform public.clear_exchange_date_for_books_(p_group_id, p_date, v_previous_book_ids);
      v_votes := public.jsonb_array_remove_value_(v_votes, p_member_id);
      v_book_ids_by_member := v_book_ids_by_member - p_member_id::text;
      update public.exchange_proposals set votes = v_votes, book_ids_by_member = v_book_ids_by_member where id = v_proposal.id;
      v_did_something := true;
    end if;
  end if;

  -- 안전망: 위 경로에 안 걸렸지만 이 멤버가 이 날짜로 읽고 있는 책이 남아있으면 직접 지운다.
  update public.books set next_exchange_date = null, updated_at = now()
  where group_id = p_group_id and status = 'reading' and current_reader_id = p_member_id and next_exchange_date = p_date;
  if found then v_did_something := true; end if;

  if not v_did_something then
    raise exception '해당 교환일에 참석 중이 아니에요';
  end if;

  return public.get_state(p_group_id);
end;
$$;

create function public.remove_book_from_exchange_date(p_group_id uuid, p_date date, p_book_id uuid, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_proposal public.exchange_proposals;
  v_book_ids_by_member jsonb;
  v_member_books uuid[];
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_date is null then raise exception '날짜가 없어요'; end if;
  if p_actor_id is null then raise exception '로그인이 필요해요.'; end if;

  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;
  if p_actor_id <> v_book.current_reader_id then raise exception '이 책을 읽는 사람만 뺄 수 있어요.'; end if;

  perform public.clear_exchange_date_for_books_(p_group_id, p_date, array[p_book_id]);

  select * into v_proposal from public.exchange_proposals where group_id = p_group_id and date = p_date;
  if found then
    v_book_ids_by_member := coalesce(v_proposal.book_ids_by_member, '{}'::jsonb);
    select array(select jsonb_array_elements_text(coalesce(v_book_ids_by_member -> p_actor_id::text, '[]'::jsonb)))::uuid[] into v_member_books;
    if p_book_id = any(v_member_books) then
      v_member_books := array_remove(v_member_books, p_book_id);
      v_book_ids_by_member := jsonb_set(v_book_ids_by_member, array[p_actor_id::text], to_jsonb(v_member_books));
      update public.exchange_proposals set book_ids_by_member = v_book_ids_by_member where id = v_proposal.id;
    end if;
  end if;

  return public.get_state(p_group_id);
end;
$$;

-- ============================================================
-- get_state 갱신: 지난 날짜·0표 제안 자동 정리 + nextExchangeDate/confirmedExchangeDates 계산
-- (더 이상 순수 조회만 하지 않으므로 stable 표시를 뗀다)
-- ============================================================

create or replace function public.get_state(p_group_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  result json;
  v_confirmed_dates json;
  v_earliest_date date;
begin
  if not public.is_member_of(p_group_id) then
    raise exception '이 그룹의 멤버가 아니에요.';
  end if;

  -- 지난 날짜인데 참석자가 한 명도 없는 제안은 자동으로 지운다.
  delete from public.exchange_proposals
  where group_id = p_group_id and date < current_date and coalesce(jsonb_array_length(votes), 0) = 0;

  with book_dates as (
    select b.next_exchange_date as d, b.current_reader_id as member_id
    from public.books b
    where b.group_id = p_group_id and b.status = 'reading'
      and b.next_exchange_date is not null and b.current_reader_id is not null
    union
    select b.next_exchange_date as d, (q->>'memberId')::uuid as member_id
    from public.books b, jsonb_array_elements(coalesce(b.queue, '[]'::jsonb)) q
    where b.group_id = p_group_id and b.status = 'reading' and b.next_exchange_date is not null
      and (q->>'desiredDate') is not null and (q->>'desiredDate')::date = b.next_exchange_date
  ),
  proposal_votes as (
    select e.date as d, v::uuid as member_id
    from public.exchange_proposals e, jsonb_array_elements_text(coalesce(e.votes, '[]'::jsonb)) v
    where e.group_id = p_group_id and exists (select 1 from book_dates bd where bd.d = e.date)
  ),
  all_dates as (
    select d, member_id from book_dates
    union
    select d, member_id from proposal_votes
  ),
  grouped as (
    select d, jsonb_agg(distinct member_id) as member_ids
    from all_dates
    group by d
  )
  select coalesce(json_agg(json_build_object('date', d, 'memberIds', member_ids) order by d), '[]'::json), min(d)
  into v_confirmed_dates, v_earliest_date
  from grouped;

  select json_build_object(
    'members', coalesce((
      select json_agg(json_build_object(
        'id', m.id, 'name', m.name, 'color', m.color, 'createdAt', m.created_at,
        'email', coalesce(m.notify_email, p.email), 'notifyTime', m.notify_time,
        'notifyEnabled', m.notify_enabled, 'notifyDays', m.notify_days, 'emoji', m.emoji,
        'bio', m.bio, 'photoUrl', m.photo_url, 'hasPin', false
      ) order by m.created_at)
      from public.memberships m join public.profiles p on p.id = m.profile_id
      where m.group_id = p_group_id
    ), '[]'::json),
    'books', coalesce((
      select json_agg(json_build_object(
        'id', b.id, 'title', b.title, 'author', b.author, 'currentReaderId', b.current_reader_id,
        'startDate', b.start_date, 'nextExchangeDate', b.next_exchange_date, 'queue', b.queue,
        'history', b.history, 'photos', b.photos, 'status', b.status, 'createdAt', b.created_at,
        'updatedAt', b.updated_at, 'coverUrl', b.cover_url, 'publisher', b.publisher, 'isbn13', b.isbn13,
        'ownerId', b.owner_id, 'pageCount', coalesce(b.page_count, 0), 'currentPage', coalesce(b.current_page, 0),
        'readRequests', b.read_requests, 'queueRequests', b.queue_requests, 'wantToRead', b.want_to_read,
        'holderId', coalesce(b.holder_id, b.owner_id), 'pendingReturn', b.pending_return, 'externalBorrow', b.external_borrow
      ) order by b.created_at)
      from public.books b where b.group_id = p_group_id
    ), '[]'::json),
    'wishlist', coalesce((
      select json_agg(json_build_object(
        'id', w.id, 'title', w.title, 'author', w.author, 'requestedById', w.requested_by,
        'note', w.note, 'createdAt', w.created_at, 'coverUrl', w.cover_url, 'publisher', w.publisher,
        'isbn13', w.isbn13, 'owners', w.owners
      ) order by w.created_at)
      from public.wishlist w where w.group_id = p_group_id
    ), '[]'::json),
    'exchangeProposals', coalesce((
      select json_agg(json_build_object(
        'id', e.id, 'date', e.date, 'proposedById', e.proposed_by, 'createdAt', e.created_at,
        'votes', e.votes, 'bookIdsByMember', e.book_ids_by_member, 'comments', e.comments, 'photos', e.photos
      ) order by e.date)
      from public.exchange_proposals e where e.group_id = p_group_id
    ), '[]'::json),
    'nextExchangeDate', v_earliest_date,
    'confirmedExchangeDates', coalesce(v_confirmed_dates, '[]'::json)
  ) into result;

  return result;
end;
$$;

grant execute on function
  public.add_book_photo(uuid, uuid, text, text, uuid),
  public.delete_book_photo(uuid, uuid, text),
  public.add_book_text_memo(uuid, uuid, uuid, text),
  public.add_record_comment(uuid, text, text, text, uuid, text),
  public.propose_exchange_date(uuid, uuid, date, uuid[]),
  public.vote_exchange_proposal(uuid, uuid, uuid, boolean, uuid[]),
  public.delete_exchange_proposal(uuid, uuid),
  public.add_exchange_date_comment(uuid, date, uuid, text),
  public.add_exchange_photo(uuid, date, text, text, uuid),
  public.delete_exchange_photo(uuid, date, text),
  public.join_exchange_date(uuid, date, uuid, uuid[]),
  public.leave_exchange_date(uuid, date, uuid),
  public.remove_book_from_exchange_date(uuid, date, uuid, uuid)
  to authenticated;
