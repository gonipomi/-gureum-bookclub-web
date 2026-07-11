-- ============================================================
-- 구조 변경: 책은 "그룹 소속"이 아니라 "사람(profile) 소속"으로 바뀐다.
-- 물리책 한 권은 상태(누가 읽는 중인지, 대기열 등)도 하나만 존재해야 하고,
-- 내가 등록한 책은 내가 속한 모든 그룹에 자동으로 보인다.
--
-- 핵심 변경:
--   - books.group_id 컬럼 제거. owner_id/current_reader_id/holder_id는
--     memberships(id)가 아니라 profiles(id)를 참조하도록 변경.
--   - 책 노출 조건: "책 주인이 지금 보는 그룹에도 속해있는가" (book_visible_in_group_)
--   - get_state()의 members[].id도 이제 membership id가 아니라 profile id로 나간다
--     (client.js는 이 id를 그냥 opaque 문자열로만 비교하므로 수정이 필요 없다).
--   - wishlist.requested_by / exchange_proposals.proposed_by도 profiles 참조로 통일
--     (이 두 값도 이제 클라이언트가 "내 profile id"를 보내오기 때문).
--   - wishlist/exchange_proposals 자체는 계속 그룹별로 분리된 채로 남는다
--     ("이 책 찾아요"·교환일 모임은 그 그룹 안에서의 활동이라는 성격이 강해서).
-- ============================================================

-- ---------- 0) 테스트 데이터 정리 (사용자 확인 완료) ----------
-- 지금까지 만든 책/위시/교환일 테스트 데이터는 예전 방식(membership id 기준)으로
-- owner_id/requested_by/proposed_by가 저장돼 있어서, profiles를 참조하는 새 FK와
-- 맞지 않는다. 실제 클럽 데이터는 나중에 Phase 6에서 GAS 쪽에서 새로 가져오므로
-- 지금 이 테스트 데이터는 지우고 새 구조로 다시 테스트한다.
delete from public.books;
delete from public.wishlist;
delete from public.exchange_proposals;

-- ---------- 1) books: group_id 제거 + FK 대상을 profiles로 변경 ----------

drop policy if exists "books_select_group_members" on public.books;

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint c
    where c.conrelid = 'public.books'::regclass and c.contype = 'f'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.conrelid and a.attnum = any(c.conkey)
          and a.attname in ('owner_id', 'current_reader_id', 'holder_id', 'group_id')
      )
  loop
    execute format('alter table public.books drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.books drop column if exists group_id;

alter table public.books
  add constraint books_owner_id_fkey foreign key (owner_id) references public.profiles (id),
  add constraint books_current_reader_id_fkey foreign key (current_reader_id) references public.profiles (id),
  add constraint books_holder_id_fkey foreign key (holder_id) references public.profiles (id);

-- 책 하나가 그룹 g에서 보여야 하는지: 책 주인이 g의 멤버인가
create function public.book_visible_in_group_(p_book_id uuid, p_group_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.books b
    join public.memberships om on om.profile_id = b.owner_id and om.group_id = p_group_id
    where b.id = p_book_id
  );
$$;

create policy "books_select_shared_group" on public.books
  for select using (
    exists (
      select 1 from public.memberships me
      join public.memberships owner_m on owner_m.profile_id = public.books.owner_id and owner_m.group_id = me.group_id
      where me.profile_id = auth.uid()
    )
  );

-- ---------- 2) wishlist.requested_by / exchange_proposals.proposed_by도 profiles 참조로 ----------

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint c
    where c.conrelid = 'public.wishlist'::regclass and c.contype = 'f'
      and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any(c.conkey) and a.attname = 'requested_by')
  loop
    execute format('alter table public.wishlist drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.wishlist add constraint wishlist_requested_by_fkey foreign key (requested_by) references public.profiles (id);

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint c
    where c.conrelid = 'public.exchange_proposals'::regclass and c.contype = 'f'
      and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attnum = any(c.conkey) and a.attname = 'proposed_by')
  loop
    execute format('alter table public.exchange_proposals drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.exchange_proposals add constraint exchange_proposals_proposed_by_fkey foreign key (proposed_by) references public.profiles (id);

-- ---------- 3) avatars 버킷 RLS: 경로 첫 세그먼트가 이제 membership id가 아니라 내 auth uid ----------

drop policy if exists "avatar_upload_own_membership" on storage.objects;
drop policy if exists "avatar_update_own_membership" on storage.objects;
drop policy if exists "avatar_delete_own_membership" on storage.objects;

create policy "avatar_upload_own_profile" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar_update_own_profile" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar_delete_own_profile" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 4) 멤버 프로필/알림 RPC: membership_id 파라미터 대신 auth.uid()로 본인 행을 찾는다 ----------
-- (클라이언트가 이제 프로필 id를 보내오므로, 예전처럼 membership_id로 매칭하면 못 찾는다)

create or replace function public.update_member_profile(
  p_group_id uuid, p_membership_id uuid, p_name text, p_color text default null,
  p_emoji text default null, p_bio text default null, p_photo_url text default null
) returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception '이름을 입력해주세요'; end if;

  update public.memberships set
    name = trim(p_name),
    color = coalesce(p_color, color),
    emoji = nullif(trim(coalesce(p_emoji, '')), ''),
    bio = nullif(trim(coalesce(p_bio, '')), ''),
    photo_url = case when p_photo_url is not null then nullif(p_photo_url, '') else photo_url end
  where group_id = p_group_id and profile_id = auth.uid();
  if not found then raise exception '본인 프로필만 수정할 수 있어요'; end if;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.update_member_notify(
  p_group_id uuid, p_membership_id uuid, p_email text, p_notify_time text, p_notify_days jsonb, p_enabled boolean
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_valid_days text[] := array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  v_filtered jsonb;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;

  if coalesce(p_enabled, false) then
    if coalesce(trim(p_email), '') = '' or p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      raise exception '올바른 이메일 주소를 입력해주세요';
    end if;
    if coalesce(trim(p_notify_time), '') = '' then
      raise exception '알림 시간을 선택해주세요';
    end if;
  end if;

  select coalesce(jsonb_agg(d), '[]'::jsonb) into v_filtered
  from jsonb_array_elements_text(coalesce(p_notify_days, '[]'::jsonb)) d
  where d = any(v_valid_days);

  update public.memberships set
    notify_email = nullif(trim(coalesce(p_email, '')), ''),
    notify_time = nullif(trim(coalesce(p_notify_time, '')), ''),
    notify_days = v_filtered,
    notify_enabled = coalesce(p_enabled, false)
  where group_id = p_group_id and profile_id = auth.uid();
  if not found then raise exception '본인 알림 설정만 바꿀 수 있어요'; end if;

  return public.get_state(p_group_id);
end;
$$;

-- ---------- 5) 책 CRUD (Phase 2) 재작성 ----------

create or replace function public.add_book(
  p_group_id uuid,
  p_title text,
  p_author text default null,
  p_owner_membership_id uuid default null, -- 더 이상 안 씀(하위 호환용 시그니처) — 실제 소유자는 auth.uid()
  p_status text default 'unread',
  p_start_date date default null,
  p_cover_url text default null,
  p_publisher text default null,
  p_isbn13 text default null,
  p_page_count int default 0,
  p_current_page int default 0,
  p_external_borrow boolean default false,
  p_want_to_read boolean default false
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_status text := case when p_status in ('unread', 'reading', 'finished') then p_status else 'unread' end;
  v_today date := current_date;
  v_start_date date := coalesce(p_start_date, v_today);
  v_history jsonb;
  v_book_status text;
  v_current_reader uuid;
  v_row_start date;
  v_external boolean;
  v_owner uuid := auth.uid();
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception '책 제목을 입력해주세요'; end if;
  if v_owner is null then raise exception '책 등록자를 알 수 없어요. 로그인 후 다시 시도해주세요'; end if;

  if v_status = 'reading' then
    v_current_reader := v_owner;
    v_row_start := v_start_date;
    v_book_status := 'reading';
    v_history := jsonb_build_array(jsonb_build_object('memberId', v_owner, 'startDate', v_start_date, 'endDate', null));
  elsif v_status = 'finished' then
    v_current_reader := null;
    v_row_start := null;
    v_book_status := 'finished';
    v_history := jsonb_build_array(jsonb_build_object('memberId', v_owner, 'startDate', v_start_date, 'endDate', v_today));
  else
    v_current_reader := null;
    v_row_start := null;
    v_book_status := 'shelved';
    v_history := '[]'::jsonb;
  end if;

  v_external := (v_status = 'finished') and coalesce(p_external_borrow, false);

  insert into public.books (
    title, author, current_reader_id, start_date, history, status,
    cover_url, publisher, isbn13, owner_id, page_count, current_page,
    want_to_read, external_borrow
  ) values (
    trim(p_title), nullif(trim(coalesce(p_author, '')), ''), v_current_reader, v_row_start, v_history, v_book_status,
    nullif(p_cover_url, ''), nullif(p_publisher, ''), nullif(p_isbn13, ''), v_owner,
    nullif(coalesce(p_page_count, 0), 0), nullif(coalesce(p_current_page, 0), 0),
    coalesce(p_want_to_read, false), v_external
  );

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.update_book_info(p_group_id uuid, p_book_id uuid, p_title text, p_author text default null)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception '책 제목을 입력해주세요'; end if;

  update public.books set title = trim(p_title), author = nullif(trim(coalesce(p_author, '')), ''), updated_at = now()
  where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.update_book_cover_info(p_group_id uuid, p_book_id uuid, p_cover_url text, p_publisher text, p_isbn13 text)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;

  update public.books set cover_url = nullif(p_cover_url, ''), publisher = nullif(p_publisher, ''), isbn13 = nullif(p_isbn13, ''), updated_at = now()
  where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.delete_book(p_group_id uuid, p_book_id uuid, p_requester_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;
  if v_book.owner_id is not null and v_book.owner_id <> p_requester_id then
    raise exception '이 책을 등록한 사람만 지울 수 있어요';
  end if;

  delete from public.books where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.assign_reader(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_start_date date default null, p_exchange_date date default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_history jsonb;
  v_queue jsonb;
  v_new_start date;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if p_member_id is not null and coalesce(v_book.pending_return, false) then
    raise exception '반납이 확인되지 않았어요. 책주인이 먼저 반납을 확인해야 해요.';
  end if;

  v_history := coalesce(v_book.history, '[]'::jsonb);
  v_queue := coalesce(v_book.queue, '[]'::jsonb);

  if v_book.current_reader_id is not null and v_book.current_reader_id <> p_member_id then
    v_history := public.jsonb_history_close_last_open_(v_history, v_book.current_reader_id, current_date);
  end if;

  v_new_start := coalesce(p_start_date, current_date);

  if p_member_id is not null then
    if not public.jsonb_array_has_open_(v_history, p_member_id) then
      v_history := v_history || jsonb_build_array(jsonb_build_object('memberId', p_member_id, 'startDate', v_new_start, 'endDate', null));
    end if;
    v_queue := public.jsonb_array_remove_member_(v_queue, p_member_id);
  end if;

  update public.books set
    current_reader_id = p_member_id,
    start_date = case when p_member_id is not null then v_new_start else null end,
    queue = v_queue,
    history = v_history,
    status = case when p_member_id is not null then 'reading' else 'shelved' end,
    updated_at = now(),
    holder_id = case when p_member_id is not null then p_member_id else holder_id end,
    pending_return = case when p_member_id is not null then false else pending_return end,
    next_exchange_date = case when p_member_id is not null and p_exchange_date is not null then p_exchange_date else next_exchange_date end
  where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.mark_finished(p_group_id uuid, p_book_id uuid, p_requester_id uuid, p_review text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_effective_owner uuid;
  v_needs_return boolean;
  v_history jsonb;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if p_requester_id is null or p_requester_id <> v_book.current_reader_id then
    raise exception '지금 읽고 있는 사람만 완독 처리할 수 있어요.';
  end if;

  v_history := coalesce(v_book.history, '[]'::jsonb);
  if v_book.current_reader_id is not null then
    v_history := public.jsonb_history_close_last_open_(v_history, v_book.current_reader_id, current_date, p_review);
  end if;

  v_effective_owner := coalesce(v_book.owner_id, v_book.current_reader_id);
  v_needs_return := (p_requester_id <> v_effective_owner);

  update public.books set
    history = v_history, current_reader_id = null, start_date = null, next_exchange_date = null,
    status = 'finished', updated_at = now(), holder_id = p_requester_id, pending_return = v_needs_return,
    owner_id = coalesce(v_book.owner_id, v_book.current_reader_id)
  where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.reshelve_book(p_group_id uuid, p_book_id uuid, p_requester_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if p_requester_id is null or (v_book.owner_id is not null and v_book.owner_id <> p_requester_id) then
    raise exception '책주인만 책장에 다시 꽂을 수 있어요.';
  end if;
  if coalesce(v_book.external_borrow, false) then
    raise exception '도서관/모임 밖에서 빌려 읽은 책은 책장에 꽂을 수 없어요.';
  end if;

  update public.books set status = 'shelved', holder_id = p_requester_id, pending_return = false, updated_at = now()
  where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.update_book_progress(p_group_id uuid, p_book_id uuid, p_requester_id uuid, p_current_page int, p_page_count int)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_total int := greatest(coalesce(p_page_count, 0), 0);
  v_current int := greatest(coalesce(p_current_page, 0), 0);
begin
  if p_requester_id is null then raise exception '로그인이 필요해요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;
  if v_book.current_reader_id is distinct from p_requester_id then
    raise exception '지금 읽는 사람만 진행률을 수정할 수 있어요.';
  end if;
  if v_total > 0 and v_current > v_total then v_current := v_total; end if;

  update public.books set page_count = nullif(v_total, 0), current_page = nullif(v_current, 0), updated_at = now()
  where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.set_book_want_to_read(p_group_id uuid, p_book_id uuid, p_actor_id uuid, p_want_to_read boolean)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;
  if p_actor_id is null or p_actor_id <> v_book.owner_id then
    raise exception '이 책을 등록한 사람만 표시할 수 있어요';
  end if;

  update public.books set want_to_read = coalesce(p_want_to_read, false) where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

-- ---------- 6) 위시리스트 전환 (Phase 3) 재작성 ----------

create or replace function public.convert_wish_to_owned_book_(p_group_id uuid, p_wish public.wishlist, p_member_id uuid)
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
    select queue, photos into v_queue, v_photos from public.books where id = v_book_id;
    v_queue := coalesce(v_queue, '[]'::jsonb);
    v_photos := coalesce(v_photos, '[]'::jsonb);

    if not exists (select 1 from jsonb_array_elements(v_queue) e where (e->>'memberId')::uuid = v_requester_id) then
      v_queue := v_queue || jsonb_build_array(jsonb_build_object('memberId', v_requester_id, 'desiredDate', null));

      -- 요청자 이름은 "이 그룹"에서의 멤버십 이름으로 표시한다(그룹별 얼굴이라는 규칙과 일관되게).
      select name into v_requester_name from public.memberships where profile_id = v_requester_id and group_id = p_group_id;
      if v_requester_name is not null then
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

-- ---------- 7) 읽기 신청 / 찜 신청 / 대기열 (Phase 3) 재작성 ----------

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

create or replace function public.approve_read_request(p_group_id uuid, p_book_id uuid, p_request_id text, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
  v_final_date date;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  v_target := public.jsonb_array_find_by_id_(v_book.read_requests, p_request_id);
  if v_target is null then raise exception '신청을 찾을 수 없어요.'; end if;

  if v_target->>'counterDate' is not null then
    if p_actor_id is null or p_actor_id <> (v_target->>'memberId')::uuid then raise exception '신청한 본인만 수락할 수 있어요.'; end if;
    v_final_date := (v_target->>'counterDate')::date;
  else
    if p_actor_id is null or p_actor_id <> v_book.owner_id then raise exception '책주인만 수락할 수 있어요.'; end if;
    v_final_date := nullif(v_target->>'desiredDate', '')::date;
  end if;

  update public.books set read_requests = public.jsonb_array_remove_by_id_(v_book.read_requests, p_request_id) where id = p_book_id;

  perform public.assign_reader(p_group_id, p_book_id, (v_target->>'memberId')::uuid, current_date, v_final_date);

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.reject_read_request(p_group_id uuid, p_book_id uuid, p_request_id text, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
  v_is_requester boolean;
  v_is_owner boolean;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  v_target := public.jsonb_array_find_by_id_(v_book.read_requests, p_request_id);
  if v_target is null then raise exception '신청을 찾을 수 없어요.'; end if;

  v_is_requester := p_actor_id is not null and p_actor_id = (v_target->>'memberId')::uuid;
  v_is_owner := p_actor_id is not null and p_actor_id = v_book.owner_id and v_target->>'counterDate' is null;
  if not v_is_requester and not v_is_owner then raise exception '이 신청을 거절할 권한이 없어요.'; end if;

  update public.books set read_requests = public.jsonb_array_remove_by_id_(v_book.read_requests, p_request_id) where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.counter_read_request_date(p_group_id uuid, p_book_id uuid, p_request_id text, p_owner_id uuid, p_counter_date date)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
begin
  if p_counter_date is null then raise exception '제안할 날짜를 입력해주세요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;
  if p_owner_id is null or p_owner_id <> v_book.owner_id then raise exception '책주인만 다른 날짜를 제안할 수 있어요.'; end if;

  v_target := public.jsonb_array_find_by_id_(v_book.read_requests, p_request_id);
  if v_target is null then raise exception '신청을 찾을 수 없어요.'; end if;
  if v_target->>'counterDate' is not null then raise exception '이미 다른 날짜를 제안했어요. 신청자의 응답을 기다려주세요.'; end if;

  update public.books set read_requests = public.jsonb_array_set_field_by_id_(v_book.read_requests, p_request_id, 'counterDate', to_jsonb(p_counter_date::text))
  where id = p_book_id;

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

create or replace function public.try_sync_reciprocal_exchange_date_(p_group_id uuid, p_reader_id uuid, p_matched_member_id uuid, p_date date)
returns void
language plpgsql security definer set search_path = public as $$
declare
  rec record;
  v_has_dateless boolean;
begin
  for rec in
    select b.id, b.queue from public.books b
    where b.status = 'reading' and b.current_reader_id = p_matched_member_id
      and exists (select 1 from public.memberships om where om.profile_id = b.owner_id and om.group_id = p_group_id)
  loop
    v_has_dateless := exists (
      select 1 from jsonb_array_elements(coalesce(rec.queue, '[]'::jsonb)) e
      where (e->>'memberId')::uuid = p_reader_id and e->>'desiredDate' is null
    );
    if v_has_dateless then
      begin
        perform public.request_to_join_queue(p_group_id, rec.id, p_reader_id, p_date);
      exception when others then
        null;
      end;
    end if;
  end loop;
end;
$$;

create or replace function public.accept_queue_request(p_group_id uuid, p_book_id uuid, p_request_id text, p_actor_id uuid)
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
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

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
    queue = v_queue, updated_at = now(),
    next_exchange_date = case when v_final_date is not null then v_final_date else next_exchange_date end
  where id = p_book_id;

  if v_final_date is not null then
    perform public.try_sync_reciprocal_exchange_date_(p_group_id, v_book.current_reader_id, v_member_id, v_final_date);
  end if;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.reject_queue_request(p_group_id uuid, p_book_id uuid, p_request_id text, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
  v_is_requester boolean;
  v_is_reader boolean;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  v_target := public.jsonb_array_find_by_id_(v_book.queue_requests, p_request_id);
  if v_target is null then raise exception '신청을 찾을 수 없어요.'; end if;

  v_is_requester := p_actor_id is not null and p_actor_id = (v_target->>'memberId')::uuid;
  v_is_reader := p_actor_id is not null and p_actor_id = v_book.current_reader_id and v_target->>'counterDate' is null;
  if not v_is_requester and not v_is_reader then raise exception '이 신청을 거절할 권한이 없어요.'; end if;

  update public.books set queue_requests = public.jsonb_array_remove_by_id_(v_book.queue_requests, p_request_id) where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.counter_queue_request_date(p_group_id uuid, p_book_id uuid, p_request_id text, p_reader_id uuid, p_counter_date date)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
begin
  if p_counter_date is null then raise exception '제안할 날짜를 입력해주세요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;
  if p_reader_id is null or p_reader_id <> v_book.current_reader_id then raise exception '지금 읽는 사람만 다른 날짜를 제안할 수 있어요.'; end if;

  v_target := public.jsonb_array_find_by_id_(v_book.queue_requests, p_request_id);
  if v_target is null then raise exception '신청을 찾을 수 없어요.'; end if;
  if v_target->>'counterDate' is not null then raise exception '이미 다른 날짜를 제안했어요. 신청자의 응답을 기다려주세요.'; end if;

  update public.books set queue_requests = public.jsonb_array_set_field_by_id_(v_book.queue_requests, p_request_id, 'counterDate', to_jsonb(p_counter_date::text))
  where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.propose_date_for_queue_member(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_reader_id uuid, p_date date)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_queue_entry jsonb;
  v_requests jsonb;
begin
  if p_date is null then raise exception '제안할 날짜를 입력해주세요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;
  if p_reader_id is null or p_reader_id <> v_book.current_reader_id then raise exception '지금 읽는 사람만 제안할 수 있어요.'; end if;

  select e into v_queue_entry from jsonb_array_elements(coalesce(v_book.queue, '[]'::jsonb)) e where (e->>'memberId')::uuid = p_member_id limit 1;
  if v_queue_entry is null then raise exception '대기열에서 찾을 수 없어요.'; end if;
  if v_queue_entry->>'desiredDate' is not null then raise exception '이미 날짜가 정해져 있어요.'; end if;

  v_requests := coalesce(v_book.queue_requests, '[]'::jsonb);
  if exists (select 1 from jsonb_array_elements(v_requests) e where (e->>'memberId')::uuid = p_member_id) then raise exception '이미 대기 중인 제안이 있어요.'; end if;

  v_requests := v_requests || jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'memberId', p_member_id, 'desiredDate', null, 'counterDate', p_date));
  update public.books set queue_requests = v_requests where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.pass_to_next(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_requester_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_owner_is_holding boolean;
  v_target jsonb;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  v_owner_is_holding := p_requester_id is not null and p_requester_id = v_book.owner_id
    and not coalesce(v_book.pending_return, false)
    and (v_book.current_reader_id is null or v_book.current_reader_id = p_requester_id);
  if not v_owner_is_holding then
    raise exception '책주인만(반납 확인 후) 다음 사람에게 넘길 수 있어요. 다 읽었으면 "완독"으로 책주인에게 반납해주세요.';
  end if;

  select e into v_target from jsonb_array_elements(coalesce(v_book.queue, '[]'::jsonb)) e where (e->>'memberId')::uuid = p_member_id limit 1;
  if v_target is null then raise exception '대기열에서 찾을 수 없어요.'; end if;

  update public.books set queue = public.jsonb_array_remove_member_(v_book.queue, p_member_id) where id = p_book_id;

  perform public.assign_reader(p_group_id, p_book_id, p_member_id, current_date, nullif(v_target->>'desiredDate', '')::date);

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.confirm_pickup(p_group_id uuid, p_book_id uuid, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if coalesce(v_book.pending_return, false) then raise exception '책주인이 아직 반납을 확인하지 않았어요.'; end if;

  select e into v_target from jsonb_array_elements(coalesce(v_book.queue, '[]'::jsonb)) e where (e->>'memberId')::uuid = p_actor_id limit 1;
  if v_target is null then raise exception '대기열에서 찾을 수 없어요.'; end if;

  update public.books set queue = public.jsonb_array_remove_member_(v_book.queue, p_actor_id) where id = p_book_id;

  perform public.assign_reader(p_group_id, p_book_id, p_actor_id, current_date, nullif(v_target->>'desiredDate', '')::date);

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.confirm_return(p_group_id uuid, p_book_id uuid, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if p_actor_id is null or p_actor_id <> v_book.owner_id then raise exception '책주인만 반납을 확인할 수 있어요.'; end if;
  if not coalesce(v_book.pending_return, false) then raise exception '반납 대기 중인 책이 아니에요.'; end if;

  update public.books set pending_return = false, holder_id = v_book.owner_id, updated_at = now() where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.remove_from_queue(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_requester_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if p_requester_id is null or (p_requester_id <> p_member_id and p_requester_id <> v_book.current_reader_id) then
    raise exception '본인 또는 지금 읽는 사람만 뺄 수 있어요.';
  end if;

  update public.books set queue = public.jsonb_array_remove_member_(v_book.queue, p_member_id) where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

-- ---------- 8) 책 사진/댓글 (Phase 4) 재작성 ----------

create or replace function public.add_book_photo(p_group_id uuid, p_book_id uuid, p_url text, p_caption text default null, p_author_id uuid default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_photos jsonb;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select photos into v_photos from public.books where id = p_book_id;

  v_photos := jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid()::text, 'type', 'photo', 'fileId', null, 'url', p_url,
    'caption', coalesce(p_caption, ''), 'authorId', p_author_id, 'createdAt', now(), 'comments', '[]'::jsonb
  )) || coalesce(v_photos, '[]'::jsonb);

  update public.books set photos = v_photos, updated_at = now() where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.delete_book_photo(p_group_id uuid, p_book_id uuid, p_photo_id text)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  update public.books set photos = public.jsonb_array_remove_by_id_(photos, p_photo_id), updated_at = now()
  where id = p_book_id;
  return public.get_state(p_group_id);
end;
$$;

create or replace function public.add_book_text_memo(p_group_id uuid, p_book_id uuid, p_author_id uuid, p_text text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_photos jsonb;
  v_clean text := trim(coalesce(p_text, ''));
begin
  if v_clean = '' then raise exception '메모 내용을 입력해주세요'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select photos into v_photos from public.books where id = p_book_id;

  v_photos := jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid()::text, 'type', 'comment', 'fileId', null, 'url', null,
    'caption', v_clean, 'authorId', p_author_id, 'createdAt', now()
  )) || coalesce(v_photos, '[]'::jsonb);

  update public.books set photos = v_photos, updated_at = now() where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.add_record_comment(p_group_id uuid, p_entity_type text, p_entity_id text, p_photo_id text, p_member_id uuid, p_text text)
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
    if not public.book_visible_in_group_(p_entity_id::uuid, p_group_id) then raise exception '사진을 찾을 수 없어요'; end if;
    select photos into v_photos from public.books where id = p_entity_id::uuid;
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
    update public.books set photos = v_photos, updated_at = now() where id = p_entity_id::uuid;
  end if;

  return public.get_state(p_group_id);
end;
$$;

-- ---------- 9) 교환일 관련 헬퍼/RPC 중 books를 건드리는 부분 재작성 ----------

create or replace function public.apply_exchange_date_to_books_(p_group_id uuid, p_date date, p_book_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_book_ids is null or array_length(p_book_ids, 1) is null then return; end if;
  update public.books set next_exchange_date = p_date, updated_at = now()
  where id = any(p_book_ids) and status = 'reading' and public.book_visible_in_group_(id, p_group_id);
end;
$$;

create or replace function public.clear_exchange_date_for_books_(p_group_id uuid, p_date date, p_book_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_book_ids is null or array_length(p_book_ids, 1) is null then return; end if;
  update public.books set next_exchange_date = null, updated_at = now()
  where id = any(p_book_ids) and next_exchange_date = p_date and public.book_visible_in_group_(id, p_group_id);
end;
$$;

create or replace function public.join_exchange_date(p_group_id uuid, p_date date, p_member_id uuid, p_book_ids uuid[] default array[]::uuid[])
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_member_id is null then raise exception '참여하는 사람을 선택해주세요'; end if;

  if p_book_ids is not null and array_length(p_book_ids, 1) > 0 then
    update public.books set next_exchange_date = p_date, updated_at = now()
    where status = 'reading' and current_reader_id = p_member_id and id = any(p_book_ids)
      and public.book_visible_in_group_(id, p_group_id);
    if not found then
      raise exception '선택한 책 중 지금 읽고 있는 책을 찾을 수 없어요.';
    end if;
  end if;

  perform public.upsert_exchange_vote_(p_group_id, p_date, p_member_id, p_book_ids);

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.leave_exchange_date(p_group_id uuid, p_date date, p_member_id uuid)
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

  update public.books set next_exchange_date = null, updated_at = now()
  where status = 'reading' and current_reader_id = p_member_id and next_exchange_date = p_date
    and public.book_visible_in_group_(id, p_group_id);
  if found then v_did_something := true; end if;

  if not v_did_something then raise exception '해당 교환일에 참석 중이 아니에요'; end if;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.remove_book_from_exchange_date(p_group_id uuid, p_date date, p_book_id uuid, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_proposal public.exchange_proposals;
  v_book_ids_by_member jsonb;
  v_member_books uuid[];
begin
  if p_actor_id is null then raise exception '로그인이 필요해요.'; end if;
  if p_date is null then raise exception '날짜가 없어요'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;
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

-- ---------- 10) get_state 재작성: books는 group_id 대신 "주인이 이 그룹 멤버인가"로 조회 ----------

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
        'holderId', coalesce(b.holder_id, b.owner_id), 'pendingReturn', b.pending_return, 'externalBorrow', b.external_borrow
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

grant execute on function public.book_visible_in_group_(uuid, uuid) to authenticated;
