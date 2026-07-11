-- ============================================================
-- Phase 3.5: "찜하기"(약한 위시리스트) vs "읽기 신청"(=교환 신청, 진짜 대여 요청) 위계 분리
--
--   - 찜하기: 승인 없이 자유롭게. 외부 대여 도서·본인 소유 책 제외 모든 책에 적용.
--     쇼핑몰의 "위시리스트"에 해당 — 읽고 싶은 책 목록에 그대로 반영된다.
--   - 읽기 신청(= 교환 신청): 날짜를 반드시 정해야 하고, 책주인(완독 책) 또는
--     지금 읽는 사람(읽는 중인 책)이 수락 + 날짜가 맞아야 대기리스트로 들어간다.
--     쇼핑몰의 "장바구니→결제"에 해당 — 기존 read_requests/queue_requests 로직은
--     그대로 두고, "날짜 없이 신청"(나중에 정하기) 경로만 막는다.
-- ============================================================

alter table public.books add column if not exists hearts jsonb not null default '[]'::jsonb;

create function public.toggle_book_heart(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_hearted boolean)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_hearts jsonb;
begin
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if p_hearted then
    if v_book.owner_id = p_member_id then raise exception '본인 책은 찜할 수 없어요'; end if;
    if coalesce(v_book.external_borrow, false) then raise exception '도서관/모임 밖에서 빌려 읽은 책은 찜할 수 없어요'; end if;
  end if;

  v_hearts := coalesce(v_book.hearts, '[]'::jsonb);
  if p_hearted then
    if not public.jsonb_array_has_value_(v_hearts, p_member_id) then
      v_hearts := v_hearts || jsonb_build_array(to_jsonb(p_member_id::text));
    end if;
  else
    v_hearts := public.jsonb_array_remove_value_(v_hearts, p_member_id);
  end if;

  update public.books set hearts = v_hearts where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

grant execute on function public.toggle_book_heart(uuid, uuid, uuid, boolean) to authenticated;

-- 읽기 신청은 이제 날짜가 필수다 ("날짜는 나중에" 경로 제거)
create or replace function public.request_to_read_book(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_desired_date date default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_requests jsonb;
begin
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  if p_desired_date is null then raise exception '읽고 싶은 날짜를 선택해주세요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if v_book.status <> 'finished' then raise exception '완독된 책만 신청할 수 있어요.'; end if;
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
  if p_desired_date is null then raise exception '읽고 싶은 날짜를 선택해주세요.'; end if;
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

-- get_state에 hearts 반영
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

  delete from public.exchange_proposals
  where group_id = p_group_id and date < current_date and coalesce(jsonb_array_length(votes), 0) = 0;

  with book_dates as (
    select b.next_exchange_date as d, b.current_reader_id as member_id
    from public.books b
    where b.status = 'reading' and b.next_exchange_date is not null and b.current_reader_id is not null
      and exists (select 1 from public.memberships om where om.profile_id = b.owner_id and om.group_id = p_group_id)
    union
    select b.next_exchange_date as d, (q->>'memberId')::uuid as member_id
    from public.books b, jsonb_array_elements(coalesce(b.queue, '[]'::jsonb)) q
    where b.status = 'reading' and b.next_exchange_date is not null
      and exists (select 1 from public.memberships om where om.profile_id = b.owner_id and om.group_id = p_group_id)
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
        'id', m.profile_id, 'name', m.name, 'color', m.color, 'createdAt', m.created_at,
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
        'holderId', coalesce(b.holder_id, b.owner_id), 'pendingReturn', b.pending_return, 'externalBorrow', b.external_borrow,
        'hearts', b.hearts
      ) order by b.created_at)
      from public.books b
      where exists (select 1 from public.memberships om where om.profile_id = b.owner_id and om.group_id = p_group_id)
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
