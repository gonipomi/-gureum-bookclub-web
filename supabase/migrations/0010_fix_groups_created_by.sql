-- ============================================================
-- 버그 수정 2: groups.created_by도 ON DELETE 지정이 없어서(0001에서 놓침),
-- 그룹을 만든 사람 계정을 지우려고 하면 여전히 "Database error deleting user"가 난다.
-- 그룹 자체는 만든 사람이 없어져도 남아야 하니 참조만 비운다(SET NULL).
-- ============================================================

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint c
    where c.conrelid = 'public.groups'::regclass and c.contype = 'f'
      and exists (
        select 1 from pg_attribute a
        where a.attrelid = c.conrelid and a.attnum = any(c.conkey) and a.attname = 'created_by'
      )
  loop
    execute format('alter table public.groups drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.groups
  add constraint groups_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;
