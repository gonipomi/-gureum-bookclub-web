-- ============================================================
-- 1) "읽는 중 취소" — 잘못 눌러서(예: 대기열에서 너무 일찍 "넘기기") 읽는 중으로
--    바뀐 걸 되돌리는 복구용 액션. 책주인이나 지금 읽는 사람만 할 수 있다.
--    오늘 시작된 읽기 기록(history의 마지막 열린 항목)을 지우고, 책주인 책이 아니었으면
--    (빌려서 읽던 거였으면) 그 사람을 대기열로 되돌려서 나중에 다시 "넘기기"할 수 있게
--    한다 — approve_read_request/accept_queue_request가 이미 queue에 넣어둔 합의된
--    날짜(next_exchange_date)를 그대로 살려서 되돌린다.
-- ============================================================
create or replace function public.cancel_reading(p_group_id uuid, p_book_id uuid, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_new_history jsonb;
  v_new_status text;
  v_queue jsonb;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if v_book.status <> 'reading' then raise exception '지금 읽는 중인 책만 취소할 수 있어요.'; end if;
  if p_actor_id is null or (p_actor_id <> v_book.owner_id and p_actor_id <> v_book.current_reader_id) then
    raise exception '책주인이나 지금 읽는 사람만 취소할 수 있어요.';
  end if;

  v_new_history := coalesce((
    select jsonb_agg(h) from jsonb_array_elements(coalesce(v_book.history, '[]'::jsonb)) h
    where not ((h->>'memberId')::uuid = v_book.current_reader_id and h->>'endDate' is null)
  ), '[]'::jsonb);

  v_new_status := case when jsonb_array_length(v_new_history) > 0 then 'finished' else 'shelved' end;

  v_queue := coalesce(v_book.queue, '[]'::jsonb);
  if v_book.current_reader_id <> v_book.owner_id then
    v_queue := v_queue || jsonb_build_array(jsonb_build_object('memberId', v_book.current_reader_id, 'desiredDate', v_book.next_exchange_date));
  end if;

  update public.books set
    current_reader_id = null,
    holder_id = owner_id,
    start_date = null,
    status = v_new_status,
    history = v_new_history,
    queue = v_queue,
    updated_at = now()
  where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

grant execute on function public.cancel_reading(uuid, uuid, uuid) to authenticated;

-- ============================================================
-- 2) "교환 제안" — 지금까지는 읽고 싶은 사람이 먼저 신청(읽기 신청)해야만 흐름이
--    시작됐는데, 책주인이 먼저 "이거 너 빌려줄까?" 하고 특정 멤버에게 제안할 방법이
--    없었다. lend_offers를 새로 둬서, 책주인이 대상을 골라 제안하면 상대가 수락/거절
--    한다 — 수락하면 read_requests와 마찬가지로 즉시 전달이 아니라 queue에만 들어가고
--    (합의한 날짜와 함께), 실제 전달은 기존 "넘기기"로 한다.
-- ============================================================
alter table public.books add column if not exists lend_offers jsonb not null default '[]'::jsonb;

create or replace function public.propose_book_to_member(p_group_id uuid, p_book_id uuid, p_owner_id uuid, p_member_id uuid, p_desired_date date default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if p_owner_id is null or p_owner_id <> v_book.owner_id then raise exception '책주인만 제안할 수 있어요.'; end if;
  if v_book.current_reader_id is not null then raise exception '지금 읽는 사람이 있는 책이에요.'; end if;
  if coalesce(v_book.pending_return, false) then raise exception '아직 반납 확인이 안 된 책이에요.'; end if;
  if p_member_id is null or p_member_id = p_owner_id then raise exception '빌려줄 멤버를 선택해주세요.'; end if;
  if coalesce(v_book.external_borrow, false) then raise exception '도서관/모임 밖에서 빌려 읽은 책이라 제안할 수 없어요.'; end if;

  if exists (select 1 from jsonb_array_elements(coalesce(v_book.lend_offers, '[]'::jsonb)) e where (e->>'memberId')::uuid = p_member_id) then
    raise exception '이미 제안했어요.';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(v_book.queue, '[]'::jsonb)) e where (e->>'memberId')::uuid = p_member_id) then
    raise exception '이미 대기열에 있어요.';
  end if;

  update public.books set lend_offers = coalesce(lend_offers, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid()::text, 'memberId', p_member_id, 'desiredDate', p_desired_date, 'offeredAt', now()
  )) where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.accept_lend_offer(p_group_id uuid, p_book_id uuid, p_offer_id text, p_member_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  v_target := public.jsonb_array_find_by_id_(v_book.lend_offers, p_offer_id);
  if v_target is null then raise exception '제안을 찾을 수 없어요.'; end if;
  if p_member_id is null or p_member_id <> (v_target->>'memberId')::uuid then raise exception '제안받은 본인만 수락할 수 있어요.'; end if;

  update public.books set
    lend_offers = public.jsonb_array_remove_by_id_(v_book.lend_offers, p_offer_id),
    queue = coalesce(v_book.queue, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('memberId', p_member_id, 'desiredDate', nullif(v_target->>'desiredDate', ''))),
    next_exchange_date = case when nullif(v_target->>'desiredDate', '') is not null then (v_target->>'desiredDate')::date else next_exchange_date end,
    updated_at = now()
  where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.decline_lend_offer(p_group_id uuid, p_book_id uuid, p_offer_id text, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  v_target := public.jsonb_array_find_by_id_(v_book.lend_offers, p_offer_id);
  if v_target is null then raise exception '제안을 찾을 수 없어요.'; end if;
  if p_actor_id is null or (p_actor_id <> (v_target->>'memberId')::uuid and p_actor_id <> v_book.owner_id) then
    raise exception '제안받은 사람이나 책주인만 취소할 수 있어요.';
  end if;

  update public.books set lend_offers = public.jsonb_array_remove_by_id_(v_book.lend_offers, p_offer_id) where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

grant execute on function
  public.propose_book_to_member(uuid, uuid, uuid, uuid, date),
  public.accept_lend_offer(uuid, uuid, text, uuid),
  public.decline_lend_offer(uuid, uuid, text, uuid)
  to authenticated;

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
  where group_id = p_group_id and date < current_date
    and coalesce(jsonb_array_length(votes), 0) = 0
    and coalesce(jsonb_array_length(photos), 0) = 0
    and coalesce(jsonb_array_length(comments), 0) = 0;

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
        'bio', m.bio, 'photoUrl', m.photo_url, 'hasPin', false,
        'notifyOnComment', coalesce(m.notify_on_comment, true), 'notifyOnHeart', coalesce(m.notify_on_heart, true),
        'notifyOnRecommend', coalesce(m.notify_on_recommend, true)
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
        'hearts', b.hearts, 'recommendations', b.recommendations, 'lendOffers', coalesce(b.lend_offers, '[]'::jsonb)
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
    'confirmedExchangeDates', coalesce(v_confirmed_dates, '[]'::json),
    'resolvedExchangeDates', coalesce((
      select json_agg(json_build_object('date', s.date, 'status', s.status) order by s.date)
      from public.exchange_date_status s where s.group_id = p_group_id
    ), '[]'::json)
  ) into result;

  return result;
end;
$$;
