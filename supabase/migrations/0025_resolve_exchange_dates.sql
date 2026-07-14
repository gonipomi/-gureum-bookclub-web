-- 지난 교환일이 홈 화면에 계속 "확정된 교환일"로 떠 있는 문제 (날짜가 지나도 자동으로
-- 안 사라짐) 대응: 멤버가 직접 "모임 완료" / "모임 취소"를 눌러 정리할 수 있게 한다.
-- 자동으로 지우지 않는 이유는, 완료된 모임은 사진/후기를 나중에 올릴 수도 있어서
-- 날짜가 지났다고 곧바로 숨기면 안 되기 때문 (사용자와 상의 후 수동 방식으로 결정).

create table public.exchange_date_status (
  group_id uuid not null references public.groups (id) on delete cascade,
  date date not null,
  status text not null check (status in ('completed', 'cancelled')),
  resolved_by uuid references public.profiles (id),
  resolved_at timestamptz not null default now(),
  primary key (group_id, date)
);

alter table public.exchange_date_status enable row level security;
create policy "exchange_date_status_select_group_members" on public.exchange_date_status
  for select using (public.is_member_of(group_id));
grant select on public.exchange_date_status to authenticated;

-- 완료/취소 모두: 해당 날짜로 잡혀 있던 책들의 교환일을 풀고, 그 날짜 제안의 투표를
-- 비워서 "확정된 교환일"·"모집 중" 양쪽 목록에서 빠지게 한다. 사진/댓글은 그대로 둔다 —
-- 지워지면 안 되는 기록이라 get_state의 자동 정리 조건도 아래에서 같이 손본다.
create or replace function public.resolve_exchange_date(p_group_id uuid, p_date date, p_status text, p_member_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  if p_date is null then raise exception '날짜가 없어요'; end if;
  if p_status not in ('completed', 'cancelled') then raise exception '잘못된 상태예요.'; end if;

  insert into public.exchange_date_status (group_id, date, status, resolved_by, resolved_at)
  values (p_group_id, p_date, p_status, p_member_id, now())
  on conflict (group_id, date) do update
    set status = excluded.status, resolved_by = excluded.resolved_by, resolved_at = now();

  update public.books set next_exchange_date = null, updated_at = now()
  where status = 'reading' and next_exchange_date = p_date
    and public.book_visible_in_group_(id, p_group_id);

  update public.exchange_proposals
  set votes = '[]'::jsonb, book_ids_by_member = '{}'::jsonb
  where group_id = p_group_id and date = p_date;

  return public.get_state(p_group_id);
end;
$$;

grant execute on function public.resolve_exchange_date(uuid, date, text, uuid) to authenticated;

-- get_state 자동 정리 조건 보강: 투표 0표인 지난 제안을 지우는 기존 로직이 사진·댓글까지
-- 같이 지워버리는 문제가 있었다 (위 resolve_exchange_date가 투표를 비우면서 드러남).
-- 사진·댓글이 없을 때만 지우도록 조건을 좁힌다.
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
