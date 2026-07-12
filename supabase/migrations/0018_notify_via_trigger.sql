-- ============================================================
-- 정리 항목 1 (HIGH): 알림 발송 로직을 각 RPC 몸통에서 books 테이블 트리거로 옮긴다.
--
-- 문제였던 것: notify_send_email_(...) 호출이 request_to_read_book/mark_finished 등
-- 핵심 RPC 안에 직접 박혀있어서, 그 함수의 다른 로직을 고칠 때마다(예: 0015에서
-- mark_finished에 p_end_date 추가) 알림 코드까지 통째로 다시 옮겨 적어야 했다.
-- 이러면 나중에 또 고치다가 알림 호출을 빠뜨릴 위험이 있다.
--
-- 해결: "무엇이 바뀌었는가"(트리거가 OLD/NEW를 비교) 와 "누구에게 어떻게 알릴까"
-- (notify_send_email_)를 분리한다. 트리거는 books 테이블 자체만 보고 그룹 문맥을
-- 모르기 때문에(책은 여러 그룹에 걸칠 수 있음), 각 RPC는 "이 요청이 어느 그룹에서
-- 왔는지"만 트랜잭션-로컬 설정값(app.current_group_id)으로 남겨둔다 — 그래야
-- 알림 문구에 "이 그룹에서의 멤버 이름"을 쓸 수 있다.
-- ============================================================

create or replace function public.books_notify_trigger_()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
  v_item jsonb;
  v_recipients text[];
begin
  v_group_id := nullif(current_setting('app.current_group_id', true), '')::uuid;
  if v_group_id is null then return NEW; end if;

  -- 1) 새 읽기 신청 → 책주인에게
  for v_item in
    select e from jsonb_array_elements(coalesce(NEW.read_requests, '[]'::jsonb)) e
    where not exists (
      select 1 from jsonb_array_elements(coalesce(OLD.read_requests, '[]'::jsonb)) oe
      where oe->>'id' = e->>'id'
    )
  loop
    perform public.notify_send_email_(
      array[public.member_notify_email_(NEW.owner_id, v_group_id)],
      '[교환독서] ' || coalesce(public.member_name_((v_item->>'memberId')::uuid, v_group_id), '누군가') || '님이 "' || NEW.title || '" 읽기를 신청했어요',
      coalesce(public.member_name_(NEW.owner_id, v_group_id), '책주인') || '님, 안녕하세요!' || E'\n\n'
        || coalesce(public.member_name_((v_item->>'memberId')::uuid, v_group_id), '누군가') || '님이 완독하신 "' || NEW.title || '"을(를) 읽고 싶어해요.' || E'\n'
        || '앱에 들어가서 신청을 승인하거나 거절해주세요.'
    );
  end loop;

  -- 2) 새 대기(찜) 신청 → 지금 읽는 사람 + 책주인
  for v_item in
    select e from jsonb_array_elements(coalesce(NEW.queue_requests, '[]'::jsonb)) e
    where not exists (
      select 1 from jsonb_array_elements(coalesce(OLD.queue_requests, '[]'::jsonb)) oe
      where oe->>'id' = e->>'id'
    )
  loop
    perform public.notify_send_email_(
      array[
        public.member_notify_email_(NEW.current_reader_id, v_group_id),
        public.member_notify_email_(NEW.owner_id, v_group_id)
      ],
      '[교환독서] ' || coalesce(public.member_name_((v_item->>'memberId')::uuid, v_group_id), '누군가') || '님이 "' || NEW.title || '" 대기를 신청했어요',
      coalesce(public.member_name_(NEW.current_reader_id, v_group_id), '독자') || '님, 안녕하세요!' || E'\n\n'
        || coalesce(public.member_name_((v_item->>'memberId')::uuid, v_group_id), '누군가') || '님이 '
        || (case when v_item->>'desiredDate' is not null then to_char((v_item->>'desiredDate')::date, 'YYYY-MM-DD') || '에' else '날짜는 나중에 정하기로 하고' end)
        || ' "' || NEW.title || '"을(를) 이어 읽고 싶어해요.' || E'\n'
        || '앱에 들어가서 신청을 수락하거나 거절, 또는 다른 날짜를 제안해주세요.'
    );
  end loop;

  -- 3) 책주인이 읽기 신청에 다른 날짜 역제안 → 신청자에게 (counterDate가 null→값 있음으로 바뀐 항목)
  for v_item in
    select ne from jsonb_array_elements(coalesce(NEW.read_requests, '[]'::jsonb)) ne
    join jsonb_array_elements(coalesce(OLD.read_requests, '[]'::jsonb)) oe on oe->>'id' = ne->>'id'
    where oe->>'counterDate' is null and ne->>'counterDate' is not null
  loop
    perform public.notify_send_email_(
      array[public.member_notify_email_((v_item->>'memberId')::uuid, v_group_id)],
      '[교환독서] ' || coalesce(public.member_name_(NEW.owner_id, v_group_id), '책주인') || '님이 "' || NEW.title || '" 날짜를 다시 제안했어요',
      coalesce(public.member_name_((v_item->>'memberId')::uuid, v_group_id), '신청자') || '님, 안녕하세요!' || E'\n\n'
        || coalesce(public.member_name_(NEW.owner_id, v_group_id), '책주인') || '님이 "' || NEW.title || '"을(를) ' || to_char((v_item->>'counterDate')::date, 'YYYY-MM-DD') || '에 빌려주겠다고 제안했어요.' || E'\n'
        || '앱에 들어가서 이 날짜를 수락하거나 거절해주세요.'
    );
  end loop;

  -- 4) 지금 읽는 사람이 대기 신청에 다른 날짜 역제안 → 신청자에게
  for v_item in
    select ne from jsonb_array_elements(coalesce(NEW.queue_requests, '[]'::jsonb)) ne
    join jsonb_array_elements(coalesce(OLD.queue_requests, '[]'::jsonb)) oe on oe->>'id' = ne->>'id'
    where oe->>'counterDate' is null and ne->>'counterDate' is not null
  loop
    perform public.notify_send_email_(
      array[public.member_notify_email_((v_item->>'memberId')::uuid, v_group_id)],
      '[교환독서] ' || coalesce(public.member_name_(NEW.current_reader_id, v_group_id), '독자') || '님이 "' || NEW.title || '" 날짜를 다시 제안했어요',
      coalesce(public.member_name_((v_item->>'memberId')::uuid, v_group_id), '신청자') || '님, 안녕하세요!' || E'\n\n'
        || coalesce(public.member_name_(NEW.current_reader_id, v_group_id), '독자') || '님이 "' || NEW.title || '"을(를) ' || to_char((v_item->>'counterDate')::date, 'YYYY-MM-DD') || '에 넘겨주겠다고 제안했어요.' || E'\n'
        || '앱에 들어가서 이 날짜를 수락하거나 거절해주세요.'
    );
  end loop;

  -- 5) 완독(반납 필요) → 책주인에게: pending_return이 false→true로 바뀐 경우
  if coalesce(OLD.pending_return, false) = false and coalesce(NEW.pending_return, false) = true then
    perform public.notify_send_email_(
      array[public.member_notify_email_(NEW.owner_id, v_group_id)],
      '[교환독서] ' || coalesce(public.member_name_(NEW.holder_id, v_group_id), '누군가') || '님이 "' || NEW.title || '"을(를) 다 읽었어요',
      coalesce(public.member_name_(NEW.owner_id, v_group_id), '책주인') || '님, 안녕하세요!' || E'\n\n'
        || coalesce(public.member_name_(NEW.holder_id, v_group_id), '누군가') || '님이 "' || NEW.title || '"을(를) 완독했어요. 책을 돌려받으면 앱에서 반납을 확인해주세요.' || E'\n'
        || '반납을 확인해야 다음 대기자에게 넘길 수 있어요.'
    );
  end if;

  -- 6) 반납 확인 → 대기 중인 멤버들에게: pending_return이 true→false로 바뀐 경우
  if coalesce(OLD.pending_return, false) = true and coalesce(NEW.pending_return, false) = false then
    select array_agg(public.member_notify_email_((q->>'memberId')::uuid, v_group_id))
    into v_recipients
    from jsonb_array_elements(coalesce(NEW.queue, '[]'::jsonb)) q;

    if v_recipients is not null then
      perform public.notify_send_email_(
        v_recipients,
        '[교환독서] "' || NEW.title || '"을(를) 이제 받아가실 수 있어요',
        '안녕하세요!' || E'\n\n'
          || coalesce(public.member_name_(NEW.owner_id, v_group_id), '책주인') || '님이 "' || NEW.title || '"의 반납을 확인했어요. 이제 '
          || coalesce(public.member_name_(NEW.owner_id, v_group_id), '책주인') || '님에게서 책을 받아가실 수 있어요.' || E'\n'
          || '앱에 들어가서 받았다고 표시해주세요.'
      );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists books_notify_trigger on public.books;
create trigger books_notify_trigger
  after update on public.books
  for each row execute function public.books_notify_trigger_();

-- ============================================================
-- 아래 6개 RPC는 이제 notify_send_email_를 직접 안 부르고, 대신 트랜잭션 시작 시
-- "이 요청이 어느 그룹에서 왔는지"만 set_config로 남긴다. 나머지 로직은 그대로.
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
    'id', gen_random_uuid()::text, 'memberId', p_member_id, 'requestedAt', now(), 'desiredDate', p_desired_date, 'counterDate', null
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
    'id', gen_random_uuid()::text, 'memberId', p_member_id, 'requestedAt', now(), 'desiredDate', p_desired_date, 'counterDate', null
  ));
  update public.books set queue_requests = v_requests where id = p_book_id;

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
  perform set_config('app.current_group_id', p_group_id::text, true);
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

create or replace function public.counter_queue_request_date(p_group_id uuid, p_book_id uuid, p_request_id text, p_reader_id uuid, p_counter_date date)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
begin
  perform set_config('app.current_group_id', p_group_id::text, true);
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

create or replace function public.mark_finished(p_group_id uuid, p_book_id uuid, p_requester_id uuid, p_review text default null, p_end_date date default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_effective_owner uuid;
  v_needs_return boolean;
  v_history jsonb;
  v_end_date date;
begin
  perform set_config('app.current_group_id', p_group_id::text, true);
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if p_requester_id is null or p_requester_id <> v_book.current_reader_id then
    raise exception '지금 읽고 있는 사람만 완독 처리할 수 있어요.';
  end if;

  v_end_date := coalesce(p_end_date, current_date);

  v_history := coalesce(v_book.history, '[]'::jsonb);
  if v_book.current_reader_id is not null then
    v_history := public.jsonb_history_close_last_open_(v_history, v_book.current_reader_id, v_end_date, p_review);
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

create or replace function public.confirm_return(p_group_id uuid, p_book_id uuid, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
begin
  perform set_config('app.current_group_id', p_group_id::text, true);
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if p_actor_id is null or p_actor_id <> v_book.owner_id then raise exception '책주인만 반납을 확인할 수 있어요.'; end if;
  if not coalesce(v_book.pending_return, false) then raise exception '반납 대기 중인 책이 아니에요.'; end if;

  update public.books set pending_return = false, holder_id = v_book.owner_id, updated_at = now() where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;
