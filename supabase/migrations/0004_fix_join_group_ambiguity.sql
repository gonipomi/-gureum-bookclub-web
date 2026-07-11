-- ============================================================
-- 버그 수정: join_group_with_code()의 "column reference group_id is ambiguous"
-- RETURNS TABLE(group_id uuid, ...)의 출력 컬럼명 group_id가, 함수 본문에서
-- memberships.group_id를 별칭 없이 쓴 부분과 이름이 겹쳐서 모호해졌던 문제.
-- memberships에 별칭(m)을 붙여서 명확히 구분한다.
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
