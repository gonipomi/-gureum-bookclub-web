-- ============================================================
-- Phase 4 준비: 마이페이지 이름 변경 + 프로필 사진 업로드 + 알림 설정 저장
-- (Members.gs의 updateMemberProfile/updateMemberNotify를 이식하고, 사진은
-- 색깔 동그라미 대신 실제 얼굴 사진을 쓸 수 있게 새로 추가)
-- ============================================================

alter table public.memberships add column if not exists photo_url text;
alter table public.memberships add column if not exists notify_email text;

-- ---------- 아바타 사진 저장용 Storage 버킷 ----------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 경로는 "{membershipId}/파일명" 형태 — 본인 소유 membership 폴더에만 쓸 수 있게 제한한다.
create policy "avatar_upload_own_membership" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] in (
      select id::text from public.memberships where profile_id = auth.uid()
    )
  );

create policy "avatar_update_own_membership" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] in (
      select id::text from public.memberships where profile_id = auth.uid()
    )
  );

create policy "avatar_delete_own_membership" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] in (
      select id::text from public.memberships where profile_id = auth.uid()
    )
  );

create policy "avatar_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

-- ---------- 프로필 수정 (이름·이모지·색상·소개·사진) ----------
-- 예전엔 아무나 다른 멤버 프로필을 고칠 수 있었지만(진짜 로그인이 없었으니까),
-- 이제는 실제 계정이 있으니 본인 것만 고칠 수 있게 막는다.
create function public.update_member_profile(
  p_group_id uuid,
  p_membership_id uuid,
  p_name text,
  p_color text default null,
  p_emoji text default null,
  p_bio text default null,
  p_photo_url text default null
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
  where id = p_membership_id and group_id = p_group_id and profile_id = auth.uid();
  if not found then raise exception '본인 프로필만 수정할 수 있어요'; end if;

  return public.get_state(p_group_id);
end;
$$;

-- ---------- 알림 설정 저장 ----------
create function public.update_member_notify(
  p_group_id uuid,
  p_membership_id uuid,
  p_email text,
  p_notify_time text,
  p_notify_days jsonb,
  p_enabled boolean
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
  where id = p_membership_id and group_id = p_group_id and profile_id = auth.uid();
  if not found then raise exception '본인 알림 설정만 바꿀 수 있어요'; end if;

  return public.get_state(p_group_id);
end;
$$;

-- ---------- get_state에 photoUrl 반영 + email은 notify_email 우선 사용 ----------
create or replace function public.get_state(p_group_id uuid)
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
        'email', coalesce(m.notify_email, p.email),
        'notifyTime', m.notify_time,
        'notifyEnabled', m.notify_enabled,
        'notifyDays', m.notify_days,
        'emoji', m.emoji,
        'bio', m.bio,
        'photoUrl', m.photo_url,
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
    'nextExchangeDate', null,
    'confirmedExchangeDates', '[]'::json
  ) into result;

  return result;
end;
$$;

grant execute on function
  public.update_member_profile(uuid, uuid, text, text, text, text, text),
  public.update_member_notify(uuid, uuid, text, text, jsonb, boolean)
  to authenticated;
