-- ============================================================
-- Phase 1: 스키마 + RLS + 인증/그룹 부트스트랩 RPC
-- (책/위시리스트/교환일에 대한 실제 CRUD RPC는 Phase 2~4에서 추가)
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- profiles: 그룹을 넘나드는 "진짜 사람" ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_self" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid());

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
    on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- groups: 클럽 ----------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.groups enable row level security;

-- ---------- memberships: "이 그룹에서의 얼굴" (예전 Members 시트 행) ----------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  color text,
  emoji text,
  bio text,
  notify_time text,
  notify_enabled boolean not null default false,
  notify_days jsonb not null default '[]'::jsonb,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (group_id, profile_id)
);

alter table public.memberships enable row level security;

-- 현재 로그인한 사람이 그룹 g의 멤버인지 (RLS 정책·RPC가 공용으로 쓰는 헬퍼)
create function public.is_member_of(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m
    where m.group_id = g and m.profile_id = auth.uid()
  );
$$;

create policy "groups_select_members" on public.groups
  for select using (public.is_member_of(id));
create policy "memberships_select_same_group" on public.memberships
  for select using (public.is_member_of(group_id));
create policy "memberships_update_self" on public.memberships
  for update using (profile_id = auth.uid());

-- ---------- books / wishlist / exchange_proposals ----------
-- 큐/히스토리/사진/신청 목록은 지금 GAS 코드와 동일하게 jsonb 통짜로 둔다
-- (정규화는 나중에 필요해지면 하는 개선사항이지 지금 필수는 아님).
create table public.books (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null,
  author text,
  current_reader_id uuid references public.memberships (id),
  start_date date,
  next_exchange_date date,
  queue jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  photos jsonb not null default '[]'::jsonb,
  status text not null default 'shelved',
  cover_url text,
  publisher text,
  isbn13 text,
  owner_id uuid references public.memberships (id),
  page_count int,
  current_page int,
  read_requests jsonb not null default '[]'::jsonb,
  queue_requests jsonb not null default '[]'::jsonb,
  want_to_read boolean not null default false,
  holder_id uuid references public.memberships (id),
  pending_return boolean not null default false,
  external_borrow boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.books enable row level security;
create policy "books_select_group_members" on public.books
  for select using (public.is_member_of(group_id));

create table public.wishlist (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null,
  author text,
  requested_by uuid references public.memberships (id),
  note text,
  cover_url text,
  publisher text,
  isbn13 text,
  owners jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.wishlist enable row level security;
create policy "wishlist_select_group_members" on public.wishlist
  for select using (public.is_member_of(group_id));

create table public.exchange_proposals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  date date not null,
  proposed_by uuid references public.memberships (id),
  votes jsonb not null default '[]'::jsonb,
  book_ids_by_member jsonb not null default '{}'::jsonb,
  comments jsonb not null default '[]'::jsonb,
  photos jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (group_id, date)
);

alter table public.exchange_proposals enable row level security;
create policy "exchange_proposals_select_group_members" on public.exchange_proposals
  for select using (public.is_member_of(group_id));

-- ============================================================
-- 그룹 생성 / 초대코드 참가 / 내 그룹 목록 RPC
-- ============================================================

create function public.generate_invite_code_() returns text
language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 0/O/1/I/L처럼 헷갈리는 글자는 제외
  code text := '';
  i int;
begin
  for i in 1..6 loop
    code := code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return code;
end;
$$;

create function public.create_group(p_name text, p_display_name text default null)
returns table (group_id uuid, membership_id uuid, invite_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
  v_code text;
  v_membership_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception '그룹 이름을 입력해주세요.';
  end if;

  loop
    v_code := public.generate_invite_code_();
    begin
      insert into public.groups (name, invite_code, created_by)
        values (trim(p_name), v_code, auth.uid())
        returning id into v_group_id;
      exit;
    exception when unique_violation then
      -- 코드가 겹치면 다시 뽑는다
    end;
  end loop;

  select email into v_email from public.profiles where id = auth.uid();

  insert into public.memberships (group_id, profile_id, name, role)
    values (
      v_group_id,
      auth.uid(),
      coalesce(nullif(trim(p_display_name), ''), split_part(v_email, '@', 1)),
      'owner'
    )
    returning id into v_membership_id;

  return query select v_group_id, v_membership_id, v_code;
end;
$$;

create function public.join_group_with_code(p_code text, p_display_name text default null)
returns table (group_id uuid, membership_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
  v_membership_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요해요.';
  end if;

  select id into v_group_id from public.groups where invite_code = upper(trim(p_code));
  if v_group_id is null then
    raise exception '초대 코드를 찾을 수 없어요.';
  end if;

  select id into v_membership_id from public.memberships
    where group_id = v_group_id and profile_id = auth.uid();
  if v_membership_id is not null then
    return query select v_group_id, v_membership_id;
    return;
  end if;

  select email into v_email from public.profiles where id = auth.uid();

  insert into public.memberships (group_id, profile_id, name)
    values (
      v_group_id,
      auth.uid(),
      coalesce(nullif(trim(p_display_name), ''), split_part(v_email, '@', 1))
    )
    returning id into v_membership_id;

  return query select v_group_id, v_membership_id;
end;
$$;

create function public.my_memberships()
returns table (membership_id uuid, group_id uuid, group_name text, display_name text, role text)
language sql stable security definer set search_path = public as $$
  select m.id, g.id, g.name, m.name, m.role
  from public.memberships m
  join public.groups g on g.id = m.group_id
  where m.profile_id = auth.uid()
  order by m.created_at asc;
$$;

-- ============================================================
-- get_state: 예전 GAS getStateObject_()와 같은 모양의 JSON을 돌려준다
-- (렌더 함수들이 이 모양에만 의존하므로 프론트는 그대로 재사용 가능)
-- ============================================================

create function public.get_state(p_group_id uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  result json;
begin
  if not public.is_member_of(p_group_id) then
    raise exception '이 그룹의 멤버가 아니에요.';
  end if;

  select json_build_object(
    'members', coalesce((
      select json_agg(json_build_object(
        'id', m.id,
        'name', m.name,
        'color', m.color,
        'createdAt', m.created_at,
        'email', p.email,
        'notifyTime', m.notify_time,
        'notifyEnabled', m.notify_enabled,
        'notifyDays', m.notify_days,
        'emoji', m.emoji,
        'bio', m.bio,
        'hasPin', false
      ) order by m.created_at)
      from public.memberships m
      join public.profiles p on p.id = m.profile_id
      where m.group_id = p_group_id
    ), '[]'::json),
    'books', coalesce((
      select json_agg(json_build_object(
        'id', b.id,
        'title', b.title,
        'author', b.author,
        'currentReaderId', b.current_reader_id,
        'startDate', b.start_date,
        'nextExchangeDate', b.next_exchange_date,
        'queue', b.queue,
        'history', b.history,
        'photos', b.photos,
        'status', b.status,
        'createdAt', b.created_at,
        'updatedAt', b.updated_at,
        'coverUrl', b.cover_url,
        'publisher', b.publisher,
        'isbn13', b.isbn13,
        'ownerId', b.owner_id,
        'pageCount', coalesce(b.page_count, 0),
        'currentPage', coalesce(b.current_page, 0),
        'readRequests', b.read_requests,
        'queueRequests', b.queue_requests,
        'wantToRead', b.want_to_read,
        'holderId', coalesce(b.holder_id, b.owner_id),
        'pendingReturn', b.pending_return,
        'externalBorrow', b.external_borrow
      ) order by b.created_at)
      from public.books b where b.group_id = p_group_id
    ), '[]'::json),
    'wishlist', coalesce((
      select json_agg(json_build_object(
        'id', w.id,
        'title', w.title,
        'author', w.author,
        'requestedById', w.requested_by,
        'note', w.note,
        'createdAt', w.created_at,
        'coverUrl', w.cover_url,
        'publisher', w.publisher,
        'isbn13', w.isbn13,
        'owners', w.owners
      ) order by w.created_at)
      from public.wishlist w where w.group_id = p_group_id
    ), '[]'::json),
    'exchangeProposals', coalesce((
      select json_agg(json_build_object(
        'id', e.id,
        'date', e.date,
        'proposedById', e.proposed_by,
        'createdAt', e.created_at,
        'votes', e.votes,
        'bookIdsByMember', e.book_ids_by_member,
        'comments', e.comments,
        'photos', e.photos
      ) order by e.date)
      from public.exchange_proposals e where e.group_id = p_group_id
    ), '[]'::json),
    -- 교환일 확정 로직은 Phase 4(교환일 RPC)에서 채운다
    'nextExchangeDate', null,
    'confirmedExchangeDates', '[]'::json
  ) into result;

  return result;
end;
$$;

-- ============================================================
-- 권한: anon(로그인 전)에는 아무 것도 안 주고, authenticated에만 실행 권한 부여
-- ============================================================

grant usage on schema public to authenticated;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.join_group_with_code(text, text) to authenticated;
grant execute on function public.my_memberships() to authenticated;
grant execute on function public.get_state(uuid) to authenticated;
grant select on public.groups, public.memberships, public.books, public.wishlist, public.exchange_proposals, public.profiles to authenticated;
grant update on public.memberships, public.profiles to authenticated;
