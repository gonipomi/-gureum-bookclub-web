-- ============================================================
-- SNS화 제안 #3 (HIGH) — 사회적 알림(댓글·좋아요·추천 받음).
--
-- 지금 있는 즉시 알림 6종은 전부 "물류성"(신청/역제안/반납)이라 그대로 두고,
-- 여기서는 새로 생긴 사회적 신호 3가지만 추가한다:
--   1) 내 사진(책 기록)에 누가 댓글을 달았을 때 → 사진 작성자에게
--   2) 내 사진·댓글에 누가 좋아요를 눌렀을 때 → 그 항목 작성자에게
--   3) 내가 읽는 중인 책을 누가 추천했을 때 → 그 책의 지금 읽는 사람(없으면 책주인)에게
-- 전부 books_notify_trigger_() (0018에서 만든 AFTER UPDATE 트리거)를 그대로 확장해서
-- 붙인다 — "무엇이 바뀌었는가"는 트리거가, "누구에게 보낼까"는 이 함수가 맡는 구조를
-- 그대로 유지.
--
-- 사람마다 3종류를 각각 켜고 끌 수 있어야 한다는 요청이 있어서, 기존 "알림 받기"
-- (notify_enabled, 매시간 다이제스트 전용)와는 별개로 memberships에 세 개의 새 토글을
-- 둔다. 기본값은 true(옵트아웃) — 이미 있는 즉시 알림 6종도 별도 설정 없이 항상
-- 발송되던 것과 같은 기조. 이메일이 없으면 notify_send_email_이 조용히 무시하므로
-- 이메일 유무는 따로 체크할 필요 없다.
--
-- 스코프 제한: 책 사진/댓글/추천만 다룬다. 교환일(모임) 사진·댓글은 exchange_proposals
-- 테이블에 있어서 이 트리거(books 전용) 대상이 아니다 — 다음에 필요하면 그 테이블에
-- 별도 트리거를 하나 더 만들면 된다.
-- ============================================================

alter table public.memberships
  add column if not exists notify_on_comment boolean not null default true,
  add column if not exists notify_on_heart boolean not null default true,
  add column if not exists notify_on_recommend boolean not null default true;

create or replace function public.member_wants_notify_(p_profile_id uuid, p_group_id uuid, p_kind text)
returns boolean
language sql security definer set search_path = public as $$
  select case p_kind
    when 'comment' then coalesce(m.notify_on_comment, true)
    when 'heart' then coalesce(m.notify_on_heart, true)
    when 'recommend' then coalesce(m.notify_on_recommend, true)
    else false
  end
  from public.memberships m
  where m.profile_id = p_profile_id and m.group_id = p_group_id
  limit 1;
$$;

-- ---------- 알림 설정 저장 RPC에 세 토글 추가 ----------

create or replace function public.update_member_notify(
  p_group_id uuid, p_membership_id uuid, p_email text, p_notify_time text, p_notify_days jsonb, p_enabled boolean,
  p_notify_on_comment boolean default true, p_notify_on_heart boolean default true, p_notify_on_recommend boolean default true
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_valid_days text[] := array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  v_filtered jsonb;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;

  if coalesce(p_enabled, false) then
    if coalesce(trim(p_email), '') = '' or p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      raise exception '올바른 이메일 주소를 입력해주세요';
    end if;
    if coalesce(trim(p_notify_time), '') = '' then
      raise exception '알림 시간을 선택해주세요';
    end if;
  end if;

  select coalesce(jsonb_agg(d), '[]'::jsonb) into v_filtered
  from jsonb_array_elements_text(coalesce(p_notify_days, '[]'::jsonb)) d
  where d = any(v_valid_days);

  update public.memberships set
    notify_email = nullif(trim(coalesce(p_email, '')), ''),
    notify_time = nullif(trim(coalesce(p_notify_time, '')), ''),
    notify_days = v_filtered,
    notify_enabled = coalesce(p_enabled, false),
    notify_on_comment = coalesce(p_notify_on_comment, true),
    notify_on_heart = coalesce(p_notify_on_heart, true),
    notify_on_recommend = coalesce(p_notify_on_recommend, true)
  where group_id = p_group_id and profile_id = auth.uid();
  if not found then raise exception '본인 알림 설정만 바꿀 수 있어요'; end if;

  return public.get_state(p_group_id);
end;
$$;

-- ---------- get_state: 세 토글을 members[]에 노출 ----------

create or replace function public.get_state(p_group_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  result json;
  v_confirmed_dates json;
  v_earliest_date date;
begin
  if not public.is_member_of(p_group_id) then
    raise exception '이 그룹의 멤버가 아니에요.';
  end if;

  delete from public.exchange_proposals
  where group_id = p_group_id and date < current_date and coalesce(jsonb_array_length(votes), 0) = 0;

  with book_dates as (
    select b.next_exchange_date as d, b.current_reader_id as member_id
    from public.books b
    where b.status = 'reading' and b.next_exchange_date is not null and b.current_reader_id is not null
      and exists (select 1 from public.memberships om where om.profile_id = b.owner_id and om.group_id = p_group_id)
    union
    select b.next_exchange_date as d, (q->>'memberId')::uuid as member_id
    from public.books b, jsonb_array_elements(coalesce(b.queue, '[]'::jsonb)) q
    where b.status = 'reading' and b.next_exchange_date is not null
      and exists (select 1 from public.memberships om where om.profile_id = b.owner_id and om.group_id = p_group_id)
      and (q->>'desiredDate') is not null and (q->>'desiredDate')::date = b.next_exchange_date
  ),
  proposal_votes as (
    select e.date as d, v::uuid as member_id
    from public.exchange_proposals e, jsonb_array_elements_text(coalesce(e.votes, '[]'::jsonb)) v
    where e.group_id = p_group_id and exists (select 1 from book_dates bd where bd.d = e.date)
  ),
  all_dates as (
    select d, member_id from book_dates
    union
    select d, member_id from proposal_votes
  ),
  grouped as (
    select d, jsonb_agg(distinct member_id) as member_ids
    from all_dates
    group by d
  )
  select coalesce(json_agg(json_build_object('date', d, 'memberIds', member_ids) order by d), '[]'::json), min(d)
  into v_confirmed_dates, v_earliest_date
  from grouped;

  select json_build_object(
    'members', coalesce((
      select json_agg(json_build_object(
        'id', m.profile_id, 'name', m.name, 'color', m.color, 'createdAt', m.created_at,
        'email', coalesce(m.notify_email, p.email), 'notifyTime', m.notify_time,
        'notifyEnabled', m.notify_enabled, 'notifyDays', m.notify_days, 'emoji', m.emoji,
        'bio', m.bio, 'photoUrl', m.photo_url, 'hasPin', false,
        'notifyOnComment', coalesce(m.notify_on_comment, true), 'notifyOnHeart', coalesce(m.notify_on_heart, true),
        'notifyOnRecommend', coalesce(m.notify_on_recommend, true)
      ) order by m.created_at)
      from public.memberships m join public.profiles p on p.id = m.profile_id
      where m.group_id = p_group_id
    ), '[]'::json),
    'books', coalesce((
      select json_agg(json_build_object(
        'id', b.id, 'title', b.title, 'author', b.author, 'currentReaderId', b.current_reader_id,
        'startDate', b.start_date, 'nextExchangeDate', b.next_exchange_date, 'queue', b.queue,
        'history', b.history, 'photos', b.photos, 'status', b.status, 'createdAt', b.created_at,
        'updatedAt', b.updated_at, 'coverUrl', b.cover_url, 'publisher', b.publisher, 'isbn13', b.isbn13,
        'ownerId', b.owner_id, 'pageCount', coalesce(b.page_count, 0), 'currentPage', coalesce(b.current_page, 0),
        'readRequests', b.read_requests, 'queueRequests', b.queue_requests, 'wantToRead', b.want_to_read,
        'holderId', coalesce(b.holder_id, b.owner_id), 'pendingReturn', b.pending_return, 'externalBorrow', b.external_borrow,
        'hearts', b.hearts, 'recommendations', b.recommendations
      ) order by b.created_at)
      from public.books b
      where exists (select 1 from public.memberships om where om.profile_id = b.owner_id and om.group_id = p_group_id)
    ), '[]'::json),
    'wishlist', coalesce((
      select json_agg(json_build_object(
        'id', w.id, 'title', w.title, 'author', w.author, 'requestedById', w.requested_by,
        'note', w.note, 'createdAt', w.created_at, 'coverUrl', w.cover_url, 'publisher', w.publisher,
        'isbn13', w.isbn13, 'owners', w.owners
      ) order by w.created_at)
      from public.wishlist w where w.group_id = p_group_id
    ), '[]'::json),
    'exchangeProposals', coalesce((
      select json_agg(json_build_object(
        'id', e.id, 'date', e.date, 'proposedById', e.proposed_by, 'createdAt', e.created_at,
        'votes', e.votes, 'bookIdsByMember', e.book_ids_by_member, 'comments', e.comments, 'photos', e.photos
      ) order by e.date)
      from public.exchange_proposals e where e.group_id = p_group_id
    ), '[]'::json),
    'nextExchangeDate', v_earliest_date,
    'confirmedExchangeDates', coalesce(v_confirmed_dates, '[]'::json)
  ) into result;

  return result;
end;
$$;

-- ---------- 댓글/추천을 남기는 RPC들이 "어느 그룹에서 왔는지" 트리거에 알려주도록 ----------

create or replace function public.add_record_comment(p_group_id uuid, p_entity_type text, p_entity_id text, p_photo_id text, p_member_id uuid, p_text text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_clean text := left(trim(coalesce(p_text, '')), 300);
  v_comment jsonb;
  v_photos jsonb;
  i int;
  n int;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  if v_clean = '' then raise exception '댓글 내용을 입력해주세요'; end if;
  perform set_config('app.current_group_id', p_group_id::text, true);

  v_comment := jsonb_build_object('id', gen_random_uuid()::text, 'memberId', p_member_id, 'text', v_clean, 'createdAt', now());

  if p_entity_type = 'exchange' then
    select photos into v_photos from public.exchange_proposals where group_id = p_group_id and date = p_entity_id::date;
  else
    if not public.book_visible_in_group_(p_entity_id::uuid, p_group_id) then raise exception '사진을 찾을 수 없어요'; end if;
    select photos into v_photos from public.books where id = p_entity_id::uuid;
  end if;
  if v_photos is null then raise exception '사진을 찾을 수 없어요'; end if;

  n := jsonb_array_length(v_photos);
  for i in 0..n-1 loop
    if (v_photos->i)->>'id' = p_photo_id then
      v_photos := jsonb_set(v_photos, array[i::text, 'comments'], coalesce((v_photos->i)->'comments', '[]'::jsonb) || jsonb_build_array(v_comment));
    end if;
  end loop;

  if p_entity_type = 'exchange' then
    update public.exchange_proposals set photos = v_photos where group_id = p_group_id and date = p_entity_id::date;
  else
    update public.books set photos = v_photos, updated_at = now() where id = p_entity_id::uuid;
  end if;

  return public.get_state(p_group_id);
end;
$$;

create or replace function public.toggle_book_recommend(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_recommended boolean, p_comment text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_recs jsonb;
  v_has_read boolean;
begin
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  perform set_config('app.current_group_id', p_group_id::text, true);
  select * into v_book from public.books where id = p_book_id;

  v_recs := coalesce(v_book.recommendations, '[]'::jsonb);

  if p_recommended then
    v_has_read := v_book.owner_id = p_member_id
      or v_book.current_reader_id = p_member_id
      or exists (select 1 from jsonb_array_elements(coalesce(v_book.history, '[]'::jsonb)) h where (h->>'memberId')::uuid = p_member_id);
    if not v_has_read then raise exception '읽어본 책만 추천할 수 있어요.'; end if;

    v_recs := public.jsonb_array_remove_by_id_(v_recs, p_member_id::text);
    v_recs := jsonb_build_array(jsonb_build_object(
      'id', p_member_id::text, 'memberId', p_member_id, 'comment', nullif(trim(coalesce(p_comment, '')), ''), 'createdAt', now()
    )) || v_recs;
  else
    v_recs := public.jsonb_array_remove_by_id_(v_recs, p_member_id::text);
  end if;

  update public.books set recommendations = v_recs, updated_at = now() where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

-- ---------- books_notify_trigger_ 확장: 댓글·좋아요·추천 알림 3종 추가 ----------

create or replace function public.books_notify_trigger_()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_group_id uuid;
  v_item jsonb;
  v_recipients text[];
  v_pair record;
  v_reply_pair record;
  v_heart_id text;
  v_target_id uuid;
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

  -- 3) 책주인이 읽기 신청에 다른 날짜 역제안 → 신청자에게
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

  -- 5) 완독(반납 필요) → 책주인에게
  if coalesce(OLD.pending_return, false) = false and coalesce(NEW.pending_return, false) = true then
    perform public.notify_send_email_(
      array[public.member_notify_email_(NEW.owner_id, v_group_id)],
      '[교환독서] ' || coalesce(public.member_name_(NEW.holder_id, v_group_id), '누군가') || '님이 "' || NEW.title || '"을(를) 다 읽었어요',
      coalesce(public.member_name_(NEW.owner_id, v_group_id), '책주인') || '님, 안녕하세요!' || E'\n\n'
        || coalesce(public.member_name_(NEW.holder_id, v_group_id), '누군가') || '님이 "' || NEW.title || '"을(를) 완독했어요. 책을 돌려받으면 앱에서 반납을 확인해주세요.' || E'\n'
        || '반납을 확인해야 다음 대기자에게 넘길 수 있어요.'
    );
  end if;

  -- 6) 반납 확인 → 대기 중인 멤버들에게
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

  -- 7) 사진(또는 텍스트메모)에 새 답글 → 원글 작성자에게
  for v_pair in
    select ne.val as new_item, coalesce(oe.val, '{}'::jsonb) as old_item
    from jsonb_array_elements(coalesce(NEW.photos, '[]'::jsonb)) ne(val)
    left join jsonb_array_elements(coalesce(OLD.photos, '[]'::jsonb)) oe(val) on oe.val->>'id' = ne.val->>'id'
  loop
    for v_item in
      select c from jsonb_array_elements(coalesce(v_pair.new_item->'comments', '[]'::jsonb)) c
      where not exists (
        select 1 from jsonb_array_elements(coalesce(v_pair.old_item->'comments', '[]'::jsonb)) oc
        where oc->>'id' = c->>'id'
      )
    loop
      v_target_id := nullif(v_pair.new_item->>'authorId', '')::uuid;
      if v_target_id is not null
         and v_target_id is distinct from (v_item->>'memberId')::uuid
         and public.member_wants_notify_(v_target_id, v_group_id, 'comment') then
        perform public.notify_send_email_(
          array[public.member_notify_email_(v_target_id, v_group_id)],
          '[교환독서] ' || coalesce(public.member_name_((v_item->>'memberId')::uuid, v_group_id), '누군가') || '님이 내 사진에 댓글을 남겼어요',
          coalesce(public.member_name_(v_target_id, v_group_id), '') || '님, 안녕하세요!' || E'\n\n'
            || coalesce(public.member_name_((v_item->>'memberId')::uuid, v_group_id), '누군가') || '님이 "' || NEW.title || '"에 남긴 내 사진에 댓글을 남겼어요: "' || (v_item->>'text') || '"' || E'\n'
            || '앱에 들어가서 확인해보세요.'
        );
      end if;
    end loop;
  end loop;

  -- 8) 사진·댓글에 새 좋아요 → 그 항목 작성자에게 (본인이 누른 건 알리지 않음)
  for v_pair in
    select ne.val as new_item, coalesce(oe.val, '{}'::jsonb) as old_item
    from jsonb_array_elements(coalesce(NEW.photos, '[]'::jsonb)) ne(val)
    left join jsonb_array_elements(coalesce(OLD.photos, '[]'::jsonb)) oe(val) on oe.val->>'id' = ne.val->>'id'
  loop
    -- 8-a) 사진/텍스트메모 자체에 대한 새 좋아요
    for v_heart_id in
      select h from jsonb_array_elements_text(coalesce(v_pair.new_item->'hearts', '[]'::jsonb)) h
      where h not in (select coalesce(oh, '') from jsonb_array_elements_text(coalesce(v_pair.old_item->'hearts', '[]'::jsonb)) oh)
    loop
      v_target_id := nullif(v_pair.new_item->>'authorId', '')::uuid;
      if v_target_id is not null
         and v_target_id is distinct from v_heart_id::uuid
         and public.member_wants_notify_(v_target_id, v_group_id, 'heart') then
        perform public.notify_send_email_(
          array[public.member_notify_email_(v_target_id, v_group_id)],
          '[교환독서] ' || coalesce(public.member_name_(v_heart_id::uuid, v_group_id), '누군가') || '님이 내 사진을 좋아해요',
          coalesce(public.member_name_(v_target_id, v_group_id), '') || '님, 안녕하세요!' || E'\n\n'
            || coalesce(public.member_name_(v_heart_id::uuid, v_group_id), '누군가') || '님이 "' || NEW.title || '"에 남긴 내 사진에 좋아요를 눌렀어요.' || E'\n'
            || '앱에 들어가서 확인해보세요.'
        );
      end if;
    end loop;

    -- 8-b) 그 사진에 달린 댓글들에 대한 새 좋아요
    for v_reply_pair in
      select nc.val as new_c, coalesce(oc.val, '{}'::jsonb) as old_c
      from jsonb_array_elements(coalesce(v_pair.new_item->'comments', '[]'::jsonb)) nc(val)
      left join jsonb_array_elements(coalesce(v_pair.old_item->'comments', '[]'::jsonb)) oc(val) on oc.val->>'id' = nc.val->>'id'
    loop
      for v_heart_id in
        select h from jsonb_array_elements_text(coalesce(v_reply_pair.new_c->'hearts', '[]'::jsonb)) h
        where h not in (select coalesce(oh, '') from jsonb_array_elements_text(coalesce(v_reply_pair.old_c->'hearts', '[]'::jsonb)) oh)
      loop
        v_target_id := nullif(v_reply_pair.new_c->>'memberId', '')::uuid;
        if v_target_id is not null
           and v_target_id is distinct from v_heart_id::uuid
           and public.member_wants_notify_(v_target_id, v_group_id, 'heart') then
          perform public.notify_send_email_(
            array[public.member_notify_email_(v_target_id, v_group_id)],
            '[교환독서] ' || coalesce(public.member_name_(v_heart_id::uuid, v_group_id), '누군가') || '님이 내 댓글을 좋아해요',
            coalesce(public.member_name_(v_target_id, v_group_id), '') || '님, 안녕하세요!' || E'\n\n'
              || coalesce(public.member_name_(v_heart_id::uuid, v_group_id), '누군가') || '님이 "' || NEW.title || '"에 남긴 내 댓글에 좋아요를 눌렀어요: "' || (v_reply_pair.new_c->>'text') || '"' || E'\n'
              || '앱에 들어가서 확인해보세요.'
          );
        end if;
      end loop;
    end loop;
  end loop;

  -- 9) 새 추천 → 지금 읽는 사람(없으면 책주인)에게
  for v_item in
    select r from jsonb_array_elements(coalesce(NEW.recommendations, '[]'::jsonb)) r
    where not exists (
      select 1 from jsonb_array_elements(coalesce(OLD.recommendations, '[]'::jsonb)) orr
      where orr->>'id' = r->>'id'
    )
  loop
    v_target_id := coalesce(NEW.current_reader_id, NEW.owner_id);
    if v_target_id is not null
       and v_target_id is distinct from (v_item->>'memberId')::uuid
       and public.member_wants_notify_(v_target_id, v_group_id, 'recommend') then
      perform public.notify_send_email_(
        array[public.member_notify_email_(v_target_id, v_group_id)],
        '[교환독서] ' || coalesce(public.member_name_((v_item->>'memberId')::uuid, v_group_id), '누군가') || '님이 "' || NEW.title || '"을(를) 추천했어요',
        coalesce(public.member_name_(v_target_id, v_group_id), '') || '님, 안녕하세요!' || E'\n\n'
          || coalesce(public.member_name_((v_item->>'memberId')::uuid, v_group_id), '누군가') || '님이 "' || NEW.title || '"을(를) 추천했어요.'
          || (case when v_item->>'comment' is not null then E'\n"' || (v_item->>'comment') || '"' else '' end) || E'\n'
          || '앱에 들어가서 확인해보세요.'
      );
    end if;
  end loop;

  return NEW;
end;
$$;
