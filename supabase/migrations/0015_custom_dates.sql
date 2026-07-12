-- ============================================================
-- 완독일도 오늘로 고정하지 않고 직접 고를 수 있게 한다 (읽기 시작일은 assign_reader가
-- 이미 p_start_date를 받고 있어서 서버 변경 없이 클라이언트에서 날짜를 물어보기만 하면 됐지만,
-- mark_finished는 항상 current_date로 못박혀 있어서 p_end_date 파라미터를 추가한다).
-- add_book도 마찬가지 — 책을 처음 등록할 때 바로 "읽는 중"/"완독"으로 등록하면
-- 시작일/완독일이 항상 오늘로 고정돼 있었다.
-- ============================================================

create or replace function public.add_book(
  p_group_id uuid,
  p_title text,
  p_author text default null,
  p_owner_membership_id uuid default null, -- 더 이상 안 씀(하위 호환용 시그니처) — 실제 소유자는 auth.uid()
  p_status text default 'unread',
  p_start_date date default null,
  p_cover_url text default null,
  p_publisher text default null,
  p_isbn13 text default null,
  p_page_count int default 0,
  p_current_page int default 0,
  p_external_borrow boolean default false,
  p_want_to_read boolean default false,
  p_end_date date default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_status text := case when p_status in ('unread', 'reading', 'finished') then p_status else 'unread' end;
  v_today date := current_date;
  v_start_date date := coalesce(p_start_date, v_today);
  v_end_date date := coalesce(p_end_date, v_today);
  v_history jsonb;
  v_book_status text;
  v_current_reader uuid;
  v_row_start date;
  v_external boolean;
  v_owner uuid := auth.uid();
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception '책 제목을 입력해주세요'; end if;
  if v_owner is null then raise exception '책 등록자를 알 수 없어요. 로그인 후 다시 시도해주세요'; end if;

  if v_status = 'reading' then
    v_current_reader := v_owner;
    v_row_start := v_start_date;
    v_book_status := 'reading';
    v_history := jsonb_build_array(jsonb_build_object('memberId', v_owner, 'startDate', v_start_date, 'endDate', null));
  elsif v_status = 'finished' then
    if v_end_date < v_start_date then raise exception '완독일은 시작일보다 빠를 수 없어요.'; end if;
    v_current_reader := null;
    v_row_start := null;
    v_book_status := 'finished';
    v_history := jsonb_build_array(jsonb_build_object('memberId', v_owner, 'startDate', v_start_date, 'endDate', v_end_date));
  else
    v_current_reader := null;
    v_row_start := null;
    v_book_status := 'shelved';
    v_history := '[]'::jsonb;
  end if;

  v_external := (v_status = 'finished') and coalesce(p_external_borrow, false);

  insert into public.books (
    title, author, current_reader_id, start_date, history, status,
    cover_url, publisher, isbn13, owner_id, page_count, current_page,
    want_to_read, external_borrow
  ) values (
    trim(p_title), nullif(trim(coalesce(p_author, '')), ''), v_current_reader, v_row_start, v_history, v_book_status,
    nullif(p_cover_url, ''), nullif(p_publisher, ''), nullif(p_isbn13, ''), v_owner,
    nullif(coalesce(p_page_count, 0), 0), nullif(coalesce(p_current_page, 0), 0),
    coalesce(p_want_to_read, false), v_external
  );

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
