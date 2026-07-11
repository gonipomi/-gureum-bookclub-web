-- ============================================================
-- 버그 수정: create_group/join_group_with_code가 memberships.color를
-- 안 채워서(NULL), 색깔로 표시되는 아바타/캘린더 참석자 점이 전부 투명하게
-- 보이던 문제. 클라이언트가 쓰는 것과 같은 팔레트를 순환 배정한다.
-- ============================================================

create function public.next_member_color_(p_group_id uuid)
returns text
language sql stable as $$
  select (array[
    'var(--stamp)', 'var(--line-green)', 'var(--ink-soft)', '#C97A3D',
    '#7A5C8A', '#3D7A8A', '#8A5C5C', '#5C6A8A'
  ])[(select count(*) from public.memberships where group_id = p_group_id) % 8 + 1];
$$;

create or replace function public.create_group(p_name text, p_display_name text default null)
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
    end;
  end loop;

  select email into v_email from public.profiles where id = auth.uid();

  insert into public.memberships (group_id, profile_id, name, color, role)
    values (
      v_group_id,
      auth.uid(),
      coalesce(nullif(trim(p_display_name), ''), split_part(v_email, '@', 1)),
      public.next_member_color_(v_group_id),
      'owner'
    )
    returning id into v_membership_id;

  return query select v_group_id, v_membership_id, v_code;
end;
$$;

create or replace function public.join_group_with_code(p_code text, p_display_name text default null)
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

  select m.id into v_membership_id from public.memberships m
    where m.group_id = v_group_id and m.profile_id = auth.uid();
  if v_membership_id is not null then
    return query select v_group_id, v_membership_id;
    return;
  end if;

  select email into v_email from public.profiles where id = auth.uid();

  insert into public.memberships (group_id, profile_id, name, color)
    values (
      v_group_id,
      auth.uid(),
      coalesce(nullif(trim(p_display_name), ''), split_part(v_email, '@', 1)),
      public.next_member_color_(v_group_id)
    )
    returning id into v_membership_id;

  return query select v_group_id, v_membership_id;
end;
$$;

-- 이미 색 없이 만들어진 멤버들도 소급 배정 (그룹별로 가입 순서대로)
with numbered as (
  select id, group_id,
    row_number() over (partition by group_id order by created_at) - 1 as idx
  from public.memberships
  where color is null
)
update public.memberships m
set color = (array[
    'var(--stamp)', 'var(--line-green)', 'var(--ink-soft)', '#C97A3D',
    '#7A5C8A', '#3D7A8A', '#8A5C5C', '#5C6A8A'
  ])[numbered.idx % 8 + 1]
from numbered
where m.id = numbered.id;
