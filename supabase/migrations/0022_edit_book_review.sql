-- ============================================================
-- 독서기록 탭 "후기"에서도 바로 후기를 남길 수 있게 — 지금까지는 완독 처리
-- (mark_finished) 순간에만 후기를 적을 수 있어서, 나중에 생각난 소감을 남기거나
-- 깜빡하고 안 적은 후기를 채워 넣을 방법이 없었다. 이미 내가 완독한 책이면
-- 언제든 후기를 새로 쓰거나 고칠 수 있게 한다 — 가장 최근에 닫힌(완독한)
-- history 항목을 찾아 review만 덮어쓴다 (재독 중이면 가장 최근 완독 기록 기준).
-- ============================================================

create function public.set_book_review(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_review text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_history jsonb;
  i int;
  n int;
  elem jsonb;
  found_idx int := null;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;

  select * into v_book from public.books where id = p_book_id;
  v_history := coalesce(v_book.history, '[]'::jsonb);
  n := jsonb_array_length(v_history);
  for i in 0..n - 1 loop
    elem := v_history -> i;
    if (elem ->> 'memberId')::uuid = p_member_id and elem ->> 'endDate' is not null then
      found_idx := i;
    end if;
  end loop;
  if found_idx is null then raise exception '아직 완독한 기록이 없어요.'; end if;

  v_history := jsonb_set(v_history, array[found_idx::text, 'review'], to_jsonb(left(trim(coalesce(p_review, '')), 500)));
  update public.books set history = v_history, updated_at = now() where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

grant execute on function public.set_book_review(uuid, uuid, uuid, text) to authenticated;
