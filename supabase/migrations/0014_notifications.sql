-- ============================================================
-- Phase 5: 알림. GAS Notifications.gs의 즉시 알림 6종 + 매시간 리마인더 다이제스트를
-- Supabase로 이식한다.
--
--   - 즉시 알림: 각 RPC가 상태를 바꾼 직후 pg_net.http_post로 Edge Function
--     (send-email)을 비동기 호출 — 실패해도 신청/승인 같은 본 동작은 절대 막지 않는다
--     (GAS도 try/catch로 감싸고 실패는 로그만 남겼다. 여기서는 exception when others로 흡수).
--   - 다이제스트: pg_cron이 무료 티어에 없어서, GitHub Actions가 매시간 run-digest
--     Edge Function을 호출 → 그 함수가 run_hourly_notification_check()를 부른다.
-- ============================================================

create extension if not exists pg_net;

-- Edge Function URL/공유 시크릿을 코드에 하드코딩하지 않고 여기 저장한다.
-- RLS만 켜고 정책을 하나도 안 만들어서 PostgREST(anon/authenticated)로는 절대 못 읽고,
-- security definer 함수(테이블 소유자 postgres 권한으로 실행)만 읽을 수 있다.
create table if not exists public.app_secrets (
  key text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;

insert into public.app_secrets (key, value) values
  ('notify_webhook_url', 'https://fzddepepwwasuiouovqt.supabase.co/functions/v1/send-email'),
  ('notify_webhook_secret', 'REPLACE_ME')
on conflict (key) do nothing;

create or replace function public.notify_send_email_(p_to text[], p_subject text, p_body text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
  v_clean text[];
begin
  select array_agg(distinct e) into v_clean from unnest(p_to) e where e is not null and e <> '';
  if v_clean is null or array_length(v_clean, 1) is null then return; end if;

  select value into v_url from public.app_secrets where key = 'notify_webhook_url';
  select value into v_secret from public.app_secrets where key = 'notify_webhook_secret';
  if v_url is null then return; end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    body := jsonb_build_object('to', to_jsonb(v_clean), 'subject', p_subject, 'body', p_body)
  );
exception when others then
  -- 알림 발송 실패가 신청/승인 등 실제 동작을 막으면 안 된다.
  null;
end;
$$;

create or replace function public.member_name_(p_profile_id uuid, p_group_id uuid)
returns text
language sql security definer set search_path = public as $$
  select m.name from public.memberships m
  where m.profile_id = p_profile_id and m.group_id = p_group_id
  limit 1;
$$;

create or replace function public.member_notify_email_(p_profile_id uuid, p_group_id uuid)
returns text
language sql security definer set search_path = public as $$
  select coalesce(m.notify_email, p.email)
  from public.memberships m join public.profiles p on p.id = m.profile_id
  where m.profile_id = p_profile_id and m.group_id = p_group_id
  limit 1;
$$;

-- ============================================================
-- 즉시 알림 6종 — 기존 RPC를 create or replace로 다시 정의하고, 상태 변경 직후에
-- notify_send_email_ 호출만 추가한다. 그 외 로직은 이전 마이그레이션과 동일.
-- ============================================================

-- 1) 읽기 신청 → 책주인에게
create or replace function public.request_to_read_book(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_desired_date date default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_requests jsonb;
begin
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

  perform public.notify_send_email_(
    array[public.member_notify_email_(v_book.owner_id, p_group_id)],
    '[교환독서] ' || coalesce(public.member_name_(p_member_id, p_group_id), '누군가') || '님이 "' || v_book.title || '" 읽기를 신청했어요',
    coalesce(public.member_name_(v_book.owner_id, p_group_id), '책주인') || '님, 안녕하세요!' || E'\n\n'
      || coalesce(public.member_name_(p_member_id, p_group_id), '누군가') || '님이 완독하신 "' || v_book.title || '"을(를) 읽고 싶어해요.' || E'\n'
      || '앱에 들어가서 신청을 승인하거나 거절해주세요.'
  );

  return public.get_state(p_group_id);
end;
$$;

-- 2) 찜(대기) 신청 → 지금 읽는 사람 + 책주인에게
create or replace function public.request_to_join_queue(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_desired_date date default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_existing_entry jsonb;
  v_requests jsonb;
begin
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

  perform public.notify_send_email_(
    array[
      public.member_notify_email_(v_book.current_reader_id, p_group_id),
      public.member_notify_email_(v_book.owner_id, p_group_id)
    ],
    '[교환독서] ' || coalesce(public.member_name_(p_member_id, p_group_id), '누군가') || '님이 "' || v_book.title || '" 대기를 신청했어요',
    coalesce(public.member_name_(v_book.current_reader_id, p_group_id), '독자') || '님, 안녕하세요!' || E'\n\n'
      || coalesce(public.member_name_(p_member_id, p_group_id), '누군가') || '님이 '
      || (case when p_desired_date is not null then to_char(p_desired_date, 'YYYY-MM-DD') || '에' else '날짜는 나중에 정하기로 하고' end)
      || ' "' || v_book.title || '"을(를) 이어 읽고 싶어해요.' || E'\n'
      || '앱에 들어가서 신청을 수락하거나 거절, 또는 다른 날짜를 제안해주세요.'
  );

  return public.get_state(p_group_id);
end;
$$;

-- 3) 책주인이 읽기 신청에 다른 날짜 역제안 → 신청자에게
create or replace function public.counter_read_request_date(p_group_id uuid, p_book_id uuid, p_request_id text, p_owner_id uuid, p_counter_date date)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
begin
  if p_counter_date is null then raise exception '제안할 날짜를 입력해주세요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;
  if p_owner_id is null or p_owner_id <> v_book.owner_id then raise exception '책주인만 다른 날짜를 제안할 수 있어요.'; end if;

  v_target := public.jsonb_array_find_by_id_(v_book.read_requests, p_request_id);
  if v_target is null then raise exception '신청을 찾을 수 없어요.'; end if;
  if v_target->>'counterDate' is not null then raise exception '이미 다른 날짜를 제안했어요. 신청자의 응답을 기다려주세요.'; end if;

  update public.books set read_requests = public.jsonb_array_set_field_by_id_(v_book.read_requests, p_request_id, 'counterDate', to_jsonb(p_counter_date::text))
  where id = p_book_id;

  perform public.notify_send_email_(
    array[public.member_notify_email_((v_target->>'memberId')::uuid, p_group_id)],
    '[교환독서] ' || coalesce(public.member_name_(p_owner_id, p_group_id), '책주인') || '님이 "' || v_book.title || '" 날짜를 다시 제안했어요',
    coalesce(public.member_name_((v_target->>'memberId')::uuid, p_group_id), '신청자') || '님, 안녕하세요!' || E'\n\n'
      || coalesce(public.member_name_(p_owner_id, p_group_id), '책주인') || '님이 "' || v_book.title || '"을(를) ' || to_char(p_counter_date, 'YYYY-MM-DD') || '에 빌려주겠다고 제안했어요.' || E'\n'
      || '앱에 들어가서 이 날짜를 수락하거나 거절해주세요.'
  );

  return public.get_state(p_group_id);
end;
$$;

-- 4) 지금 읽는 사람이 찜 신청에 다른 날짜 역제안 → 신청자에게
create or replace function public.counter_queue_request_date(p_group_id uuid, p_book_id uuid, p_request_id text, p_reader_id uuid, p_counter_date date)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_target jsonb;
begin
  if p_counter_date is null then raise exception '제안할 날짜를 입력해주세요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;
  if p_reader_id is null or p_reader_id <> v_book.current_reader_id then raise exception '지금 읽는 사람만 다른 날짜를 제안할 수 있어요.'; end if;

  v_target := public.jsonb_array_find_by_id_(v_book.queue_requests, p_request_id);
  if v_target is null then raise exception '신청을 찾을 수 없어요.'; end if;
  if v_target->>'counterDate' is not null then raise exception '이미 다른 날짜를 제안했어요. 신청자의 응답을 기다려주세요.'; end if;

  update public.books set queue_requests = public.jsonb_array_set_field_by_id_(v_book.queue_requests, p_request_id, 'counterDate', to_jsonb(p_counter_date::text))
  where id = p_book_id;

  perform public.notify_send_email_(
    array[public.member_notify_email_((v_target->>'memberId')::uuid, p_group_id)],
    '[교환독서] ' || coalesce(public.member_name_(p_reader_id, p_group_id), '독자') || '님이 "' || v_book.title || '" 날짜를 다시 제안했어요',
    coalesce(public.member_name_((v_target->>'memberId')::uuid, p_group_id), '신청자') || '님, 안녕하세요!' || E'\n\n'
      || coalesce(public.member_name_(p_reader_id, p_group_id), '독자') || '님이 "' || v_book.title || '"을(를) ' || to_char(p_counter_date, 'YYYY-MM-DD') || '에 넘겨주겠다고 제안했어요.' || E'\n'
      || '앱에 들어가서 이 날짜를 수락하거나 거절해주세요.'
  );

  return public.get_state(p_group_id);
end;
$$;

-- 5) 완독(반납 필요) → 책주인에게
create or replace function public.mark_finished(p_group_id uuid, p_book_id uuid, p_requester_id uuid, p_review text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_effective_owner uuid;
  v_needs_return boolean;
  v_history jsonb;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if p_requester_id is null or p_requester_id <> v_book.current_reader_id then
    raise exception '지금 읽고 있는 사람만 완독 처리할 수 있어요.';
  end if;

  v_history := coalesce(v_book.history, '[]'::jsonb);
  if v_book.current_reader_id is not null then
    v_history := public.jsonb_history_close_last_open_(v_history, v_book.current_reader_id, current_date, p_review);
  end if;

  v_effective_owner := coalesce(v_book.owner_id, v_book.current_reader_id);
  v_needs_return := (p_requester_id <> v_effective_owner);

  update public.books set
    history = v_history, current_reader_id = null, start_date = null, next_exchange_date = null,
    status = 'finished', updated_at = now(), holder_id = p_requester_id, pending_return = v_needs_return,
    owner_id = coalesce(v_book.owner_id, v_book.current_reader_id)
  where id = p_book_id;

  if v_needs_return then
    perform public.notify_send_email_(
      array[public.member_notify_email_(v_effective_owner, p_group_id)],
      '[교환독서] ' || coalesce(public.member_name_(p_requester_id, p_group_id), '누군가') || '님이 "' || v_book.title || '"을(를) 다 읽었어요',
      coalesce(public.member_name_(v_effective_owner, p_group_id), '책주인') || '님, 안녕하세요!' || E'\n\n'
        || coalesce(public.member_name_(p_requester_id, p_group_id), '누군가') || '님이 "' || v_book.title || '"을(를) 완독했어요. 책을 돌려받으면 앱에서 반납을 확인해주세요.' || E'\n'
        || '반납을 확인해야 다음 대기자에게 넘길 수 있어요.'
    );
  end if;

  return public.get_state(p_group_id);
end;
$$;

-- 6) 반납 확인 → 대기 중인 멤버들에게 (이제 받아가세요)
create or replace function public.confirm_return(p_group_id uuid, p_book_id uuid, p_actor_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_recipients text[];
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  select * into v_book from public.books where id = p_book_id;

  if p_actor_id is null or p_actor_id <> v_book.owner_id then raise exception '책주인만 반납을 확인할 수 있어요.'; end if;
  if not coalesce(v_book.pending_return, false) then raise exception '반납 대기 중인 책이 아니에요.'; end if;

  update public.books set pending_return = false, holder_id = v_book.owner_id, updated_at = now() where id = p_book_id;

  select array_agg(public.member_notify_email_((q->>'memberId')::uuid, p_group_id))
  into v_recipients
  from jsonb_array_elements(coalesce(v_book.queue, '[]'::jsonb)) q;

  if v_recipients is not null then
    perform public.notify_send_email_(
      v_recipients,
      '[교환독서] "' || v_book.title || '"을(를) 이제 받아가실 수 있어요',
      '안녕하세요!' || E'\n\n'
        || coalesce(public.member_name_(v_book.owner_id, p_group_id), '책주인') || '님이 "' || v_book.title || '"의 반납을 확인했어요. 이제 '
        || coalesce(public.member_name_(v_book.owner_id, p_group_id), '책주인') || '님에게서 책을 받아가실 수 있어요.' || E'\n'
        || '앱에 들어가서 받았다고 표시해주세요.'
    );
  end if;

  return public.get_state(p_group_id);
end;
$$;

-- ============================================================
-- 매시간 리마인더 다이제스트 (GAS runHourlyNotificationCheck 대체)
-- ============================================================

-- 한 사람(profile) 기준으로 지금 읽는 중 / 대기 중 / 반납 대기 목록을 모은다.
-- 책이 사람 소속이라, 이 사람이 속한 그룹 수와 무관하게 한 번만 계산하면 된다.
create or replace function public.get_notification_digest_(p_profile_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reading jsonb;
  v_waiting jsonb;
  v_pending jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'title', b.title, 'author', b.author, 'nextExchangeDate', b.next_exchange_date
  )), '[]'::jsonb) into v_reading
  from public.books b
  where b.current_reader_id = p_profile_id and b.status = 'reading';

  select coalesce(jsonb_agg(jsonb_build_object('title', b.title, 'position', q.ord)), '[]'::jsonb)
  into v_waiting
  from public.books b
  cross join lateral jsonb_array_elements(coalesce(b.queue, '[]'::jsonb)) with ordinality as q(val, ord)
  where (q.val->>'memberId')::uuid = p_profile_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'title', b.title,
    'daysSinceFinished', (
      select (current_date - (h.val->>'endDate')::date)
      from jsonb_array_elements(coalesce(b.history, '[]'::jsonb)) h(val)
      where (h.val->>'memberId')::uuid = b.holder_id and h.val->>'endDate' is not null
      order by (h.val->>'endDate')::date desc limit 1
    )
  )), '[]'::jsonb) into v_pending
  from public.books b
  where b.owner_id = p_profile_id and coalesce(b.pending_return, false);

  return jsonb_build_object('reading', v_reading, 'waiting', v_waiting, 'pendingReturn', v_pending);
end;
$$;

create or replace function public.run_hourly_notification_check()
returns void
language plpgsql security definer set search_path = public as $$
declare
  rec record;
  v_digest jsonb;
  v_lines text[];
  v_body text;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_item jsonb;
  v_dday int;
begin
  for rec in
    select distinct on (p.id) p.id as profile_id, coalesce(m.notify_email, p.email) as email, m.name
    from public.memberships m
    join public.profiles p on p.id = m.profile_id
    where m.notify_enabled = true
      and m.notify_time is not null
      and coalesce(m.notify_email, p.email) is not null
      and substring(m.notify_time from 1 for 2) = to_char(now() at time zone 'Asia/Seoul', 'HH24')
      and (
        coalesce(jsonb_array_length(m.notify_days), 0) = 0
        or m.notify_days ? (array['sun','mon','tue','wed','thu','fri','sat'])[extract(dow from now() at time zone 'Asia/Seoul')::int + 1]
      )
    order by p.id, m.created_at
  loop
    begin
      v_digest := public.get_notification_digest_(rec.profile_id);
      if jsonb_array_length(v_digest->'reading') = 0 and jsonb_array_length(v_digest->'waiting') = 0 and jsonb_array_length(v_digest->'pendingReturn') = 0 then
        continue;
      end if;

      v_lines := array[rec.name || '님, 안녕하세요! 오늘의 교환독서 알림이에요.', ''];

      for v_item in select * from jsonb_array_elements(v_digest->'reading') loop
        v_lines := v_lines || ('📖 지금 읽는 중: ' || (v_item->>'title') || coalesce(' (' || (v_item->>'author') || ')', ''));
        if v_item->>'nextExchangeDate' is not null then
          v_dday := (v_item->>'nextExchangeDate')::date - v_today;
          if v_dday = 0 then
            v_lines := v_lines || '   → 오늘이 이 책 교환일이에요!';
          elsif v_dday > 0 then
            v_lines := v_lines || ('   → 교환일까지 ' || v_dday || '일 남았어요 (' || (v_item->>'nextExchangeDate') || ')');
          else
            v_lines := v_lines || ('   → 교환일이 ' || abs(v_dday) || '일 지났어요. 얼른 교환해주세요!');
          end if;
        end if;
        v_lines := v_lines || '';
      end loop;

      for v_item in select * from jsonb_array_elements(v_digest->'waiting') loop
        v_lines := v_lines || ('⏳ 대기 중: ' || (v_item->>'title') || ' (' || (v_item->>'position') || '번째 순번)');
      end loop;

      if jsonb_array_length(v_digest->'pendingReturn') > 0 then
        v_lines := v_lines || '';
        for v_item in select * from jsonb_array_elements(v_digest->'pendingReturn') loop
          v_lines := v_lines || ('📦 반납 대기: ' || (v_item->>'title')
            || (case when (v_item->>'daysSinceFinished') is not null and (v_item->>'daysSinceFinished')::int > 0
                 then ' (완독 후 ' || (v_item->>'daysSinceFinished') || '일째)' else '' end)
            || ' — 돌려받으면 앱에서 반납 확인해주세요.');
        end loop;
      end if;

      v_body := array_to_string(v_lines, E'\n');
      perform public.notify_send_email_(array[rec.email], '[교환독서] ' || rec.name || '님, 오늘의 리딩 알림', v_body);
    exception when others then
      -- 한 사람 알림이 실패해도 나머지 사람 알림까지 막히면 안 된다.
      null;
    end;
  end loop;
end;
$$;

grant execute on function public.run_hourly_notification_check() to service_role;
