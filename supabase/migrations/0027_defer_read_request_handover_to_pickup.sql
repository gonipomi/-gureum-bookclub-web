-- ============================================================
-- 버그: 읽기 신청(read_requests, 지금 읽는 사람이 없는 책 — 안읽음/완독)을
-- 책주인이 승인하면 approve_read_request가 곧바로 assign_reader를 호출해서
-- "오늘"부터 읽는 중으로 바뀌었다. 실제로는 책주인과 신청자가 나중에 만나서
-- 책을 건네는 "교환 예정일"에 맞춰 전환돼야 하는데, 승인 = 즉시 전달이 되어버린 것.
--
-- 이미 있는 대기열(queue) 흐름 — accept_queue_request(지금 읽는 사람이 있는 책의
-- queue_requests 승인)는 이 실수를 안 한다: assign_reader를 부르지 않고 queue 배열에
-- 합의된 날짜만 기록해두고, 실제 전환은 나중에 책주인/현재 독자가 "넘기기"
-- (pass_to_next)를 눌러야 일어난다. approve_read_request도 같은 패턴을 따르게 한다.
-- (pass_to_next는 이미 currentReaderId가 null인 경우도 처리하도록 되어 있어서
-- 클라이언트 대기열 UI의 "넘기기" 버튼이 안읽음/완독 책에서도 바로 동작한다.)
-- ============================================================

create or replace function public.approve_read_request(p_group_id uuid, p_book_id uuid, p_request_id text, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
  v_final_date date;
  v_member_id uuid;
  v_queue jsonb;
  v_idx int;
  n int;
  v_found boolean := false;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  v_target := public.jsonb_array_find_by_id_(v_book.read_requests, p_request_id);
  if v_target is null then raise exception '신청을 찾을 수 없어요.'; end if;
  v_member_id := (v_target->>'memberId')::uuid;

  if v_target->>'counterDate' is not null then
    if p_actor_id is null or p_actor_id <> v_member_id then raise exception '신청한 본인만 수락할 수 있어요.'; end if;
    v_final_date := (v_target->>'counterDate')::date;
  else
    if p_actor_id is null or p_actor_id <> v_book.owner_id then raise exception '책주인만 수락할 수 있어요.'; end if;
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
    read_requests = public.jsonb_array_remove_by_id_(v_book.read_requests, p_request_id),
    queue = v_queue, updated_at = now(),
    next_exchange_date = case when v_final_date is not null then v_final_date else next_exchange_date end
  where id = p_book_id;

  if v_final_date is not null then
    perform public.try_sync_reciprocal_exchange_date_(p_group_id, v_book.owner_id, v_member_id, v_final_date);
  end if;

  return public.get_state(p_group_id);
end;
$$;
