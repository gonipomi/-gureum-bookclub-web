-- ============================================================
-- 정리 항목 2 (HIGH): "안읽음"을 가리키는 이름이 세 가지였다 — DB 값은 'shelved',
-- 책 추가 모달의 드롭다운 값은 'unread', 화면 글자는 "안 읽음". 코드를 고칠 때마다
-- 머릿속에서 매번 변환해야 했다. 클라이언트는 이미 'shelved'로 통일했고(client.js),
-- 여기서는 add_book이 받는 p_status 값도 'unread' 대신 'shelved'를 정식으로 받도록 맞춘다.
-- ============================================================

create or replace function public.add_book(
  p_group_id uuid,
  p_title text,
  p_author text default null,
  p_owner_membership_id uuid default null, -- 더 이상 안 씀(하위 호환용 시그니처) — 실제 소유자는 auth.uid()
  p_status text default 'shelved',
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
  v_status text := case when p_status in ('shelved', 'reading', 'finished') then p_status else 'shelved' end;
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
