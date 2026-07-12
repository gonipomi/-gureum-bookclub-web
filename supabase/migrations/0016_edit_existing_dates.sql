-- ============================================================
-- 이미 "읽는 중"/"완독"으로 등록된 책의 날짜도 나중에 고칠 수 있게 한다.
-- (등록할 때 날짜를 잘못 눌렀거나, 나중에 정확한 날짜가 기억났을 때 수정하는 용도)
--
--   - 읽는 중: books.start_date를 직접 수정 (책주인 또는 지금 읽는 사람만).
--   - 완독: history 배열의 "가장 최근" 항목(끝난 지 얼마 안 된 그 마지막 독서)만 수정 대상으로
--     한다 — 여러 번 순환된 책의 예전 기록까지 전부 열어주면 복잡해지고, 실제로 고칠 일이
--     있는 건 거의 항상 "방금 등록한 그 완독"이기 때문. 책주인 또는 그 기록의 당사자만 가능.
-- ============================================================

create function public.update_reading_start_date(p_group_id uuid, p_book_id uuid, p_actor_id uuid, p_start_date date)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
begin
  if p_actor_id is null then raise exception '로그인이 필요해요.'; end if;
  if p_start_date is null then raise exception '날짜를 선택해주세요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if v_book.status <> 'reading' then raise exception '지금 읽고 있는 책만 시작일을 고칠 수 있어요.'; end if;
  if p_actor_id <> v_book.owner_id and p_actor_id <> v_book.current_reader_id then
    raise exception '책주인 또는 지금 읽는 사람만 시작일을 고칠 수 있어요.';
  end if;

  update public.books set start_date = p_start_date, updated_at = now() where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

grant execute on function public.update_reading_start_date(uuid, uuid, uuid, date) to authenticated;

create function public.update_last_history_dates(p_group_id uuid, p_book_id uuid, p_actor_id uuid, p_start_date date, p_end_date date)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_history jsonb;
  v_last_idx int;
  v_last_entry jsonb;
begin
  if p_actor_id is null then raise exception '로그인이 필요해요.'; end if;
  if p_start_date is null or p_end_date is null then raise exception '날짜를 선택해주세요.'; end if;
  if p_end_date < p_start_date then raise exception '완독일은 시작일보다 빠를 수 없어요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if v_book.status <> 'finished' then raise exception '완독된 책의 마지막 기록만 고칠 수 있어요.'; end if;

  v_history := coalesce(v_book.history, '[]'::jsonb);
  v_last_idx := jsonb_array_length(v_history) - 1;
  if v_last_idx < 0 then raise exception '고칠 기록이 없어요.'; end if;

  v_last_entry := v_history -> v_last_idx;
  if p_actor_id <> v_book.owner_id and p_actor_id <> (v_last_entry->>'memberId')::uuid then
    raise exception '책주인 또는 그 기록의 당사자만 고칠 수 있어요.';
  end if;

  v_history := jsonb_set(v_history, array[v_last_idx::text, 'startDate'], to_jsonb(p_start_date::text));
  v_history := jsonb_set(v_history, array[v_last_idx::text, 'endDate'], to_jsonb(p_end_date::text));

  update public.books set history = v_history, updated_at = now() where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

grant execute on function public.update_last_history_dates(uuid, uuid, uuid, date, date) to authenticated;
