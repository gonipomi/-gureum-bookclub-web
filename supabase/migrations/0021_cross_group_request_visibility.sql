-- ============================================================
-- 버그: 책이 사람 소속이라 여러 그룹에 걸쳐 보이다 보니, "다른 그룹"에서 온
-- 읽기/찜 신청이 지금 보고 있는 그룹 화면에서는 신청자 이름을 못 찾아서
-- (get_state가 그 그룹 멤버만 돌려주므로) 목록에서 통째로 안 보였다.
-- 알림 배너("다른 사람이 신청했어요")는 그룹 여부를 안 따져서 떴는데, 정작
-- 신청 목록은 조용히 숨어버려서 사용자가 혼란스러웠던 것.
--
-- 해결: 신청이 "어느 그룹에서 왔는지"를 신청 기록 자체에 남긴다(groupId).
-- 클라이언트는 신청자를 지금 그룹에서 못 찾으면, 이 groupId로 "OOO 모임에서
-- 신청이 왔어요. OOO 모임으로 전환해주세요" 안내 + 전환 버튼을 보여준다.
-- ============================================================

create or replace function public.request_to_read_book(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_desired_date date default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_requests jsonb;
begin
  perform set_config('app.current_group_id', p_group_id::text, true);
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if v_book.current_reader_id is not null then raise exception '지금 읽는 사람이 있는 책이에요.'; end if;
  if coalesce(v_book.pending_return, false) and v_book.holder_id = p_member_id then raise exception '이미 읽은 책이에요.'; end if;
  if v_book.owner_id = p_member_id then raise exception '본인 책은 신청할 수 없어요.'; end if;
  if coalesce(v_book.external_borrow, false) then raise exception '도서관/모임 밖에서 빌려 읽은 책이라 신청할 수 없어요.'; end if;

  v_requests := coalesce(v_book.read_requests, '[]'::jsonb);
  if exists (select 1 from jsonb_array_elements(v_requests) e where (e->>'memberId')::uuid = p_member_id) then
    raise exception '이미 신청했어요.';
  end if;

  v_requests := v_requests || jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid()::text, 'memberId', p_member_id, 'requestedAt', now(), 'desiredDate', p_desired_date, 'counterDate', null, 'groupId', p_group_id
  ));
  update public.books set read_requests = v_requests where id = p_book_id;

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
  perform set_config('app.current_group_id', p_group_id::text, true);
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
    'id', gen_random_uuid()::text, 'memberId', p_member_id, 'requestedAt', now(), 'desiredDate', p_desired_date, 'counterDate', null, 'groupId', p_group_id
  ));
  update public.books set queue_requests = v_requests where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;
