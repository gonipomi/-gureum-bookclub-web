-- ============================================================
-- "이 책 추천해요" — 내가 읽고 있거나 다 읽은 책 중에 좋았던 걸 다른 멤버들에게
-- 추천하는 기능. 찜(hearts)과 구조는 비슷하지만 자격 조건이 다르다: 찜은 "읽고
-- 싶다"는 의사표시라 아무나 누를 수 있지만, 추천은 "내가 실제로 읽어봤다"가
-- 전제라서 지금 읽는 중이거나, 읽은 기록(history)이 있거나, 책주인이어야 한다.
-- ============================================================

alter table public.books add column if not exists recommendations jsonb not null default '[]'::jsonb;

create function public.toggle_book_recommend(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_recommended boolean, p_comment text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_recs jsonb;
  v_has_read boolean;
begin
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  v_recs := coalesce(v_book.recommendations, '[]'::jsonb);

  if p_recommended then
    v_has_read := v_book.owner_id = p_member_id
      or v_book.current_reader_id = p_member_id
      or exists (select 1 from jsonb_array_elements(coalesce(v_book.history, '[]'::jsonb)) h where (h->>'memberId')::uuid = p_member_id);
    if not v_has_read then raise exception '읽어본 책만 추천할 수 있어요.'; end if;

    v_recs := public.jsonb_array_remove_by_id_(v_recs, p_member_id::text);
    v_recs := jsonb_build_array(jsonb_build_object(
      'id', p_member_id::text, 'memberId', p_member_id, 'comment', nullif(trim(coalesce(p_comment, '')), ''), 'createdAt', now()
    )) || v_recs;
  else
    v_recs := public.jsonb_array_remove_by_id_(v_recs, p_member_id::text);
  end if;

  update public.books set recommendations = v_recs, updated_at = now() where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

grant execute on function public.toggle_book_recommend(uuid, uuid, uuid, boolean, text) to authenticated;

-- get_state에 recommendations 반영
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
        'hearts', b.hearts, 'recommendations', b.recommendations
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
