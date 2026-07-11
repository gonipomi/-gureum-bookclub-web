-- ============================================================
-- 버그 수정: join_group_with_code/create_group에서 표시 이름을 안 넣고
-- 제출하면, profiles.email이 비어있는 경우(어떤 이유로든) split_part 결과도
-- null이 되어 memberships.name NOT NULL 제약에 걸려 "null value in column name"
-- 에러가 났다. 이름을 항상 뭔가 채워지도록 마지막 기본값("멤버")을 추가한다.
-- ============================================================

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
      coalesce(nullif(trim(p_display_name), ''), nullif(split_part(coalesce(v_email, ''), '@', 1), ''), '멤버'),
      public.next_member_color_(v_group_id)
    )
    returning id into v_membership_id;

  return query select v_group_id, v_membership_id;
end;
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
      coalesce(nullif(trim(p_display_name), ''), nullif(split_part(coalesce(v_email, ''), '@', 1), ''), '멤버'),
      public.next_member_color_(v_group_id),
      'owner'
    )
    returning id into v_membership_id;

  return query select v_group_id, v_membership_id, v_code;
end;
$$;
