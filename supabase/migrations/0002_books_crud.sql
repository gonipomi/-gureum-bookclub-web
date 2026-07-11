-- ============================================================
-- Phase 2: 책 CRUD RPC (Books.gs의 addBook/updateBookInfo/updateBookCoverInfo/
-- deleteBook/assignReader/markFinished/reshelveBook/updateBookProgress/
-- setBookWantToRead를 1:1로 이식)
-- ============================================================

-- ---------- jsonb 배열 조작 헬퍼 (history/queue 필드용) ----------

-- history 배열에서 memberId가 일치하고 아직 endDate가 없는 "가장 나중" 항목을 닫는다.
-- JS의 [...history].reverse().find(...)와 동일하게, 여러 개면 마지막 것을 찾는다.
create function public.jsonb_history_close_last_open_(arr jsonb, member_id uuid, end_date date, review text default null)
returns jsonb
language plpgsql immutable as $$
declare
  result jsonb := coalesce(arr, '[]'::jsonb);
  i int;
  n int := jsonb_array_length(coalesce(arr, '[]'::jsonb));
  elem jsonb;
  found_idx int := null;
begin
  for i in 0..n-1 loop
    elem := result -> i;
    if (elem->>'memberId')::uuid = member_id and elem->>'endDate' is null then
      found_idx := i;
    end if;
  end loop;
  if found_idx is not null then
    result := jsonb_set(result, array[found_idx::text, 'endDate'], to_jsonb(end_date::text));
    if review is not null and trim(review) <> '' then
      result := jsonb_set(result, array[found_idx::text, 'review'], to_jsonb(left(trim(review), 500)));
    end if;
  end if;
  return result;
end;
$$;

-- history 배열에 memberId가 일치하고 endDate 없는(열려있는) 항목이 하나라도 있는지
create function public.jsonb_array_has_open_(arr jsonb, member_id uuid)
returns boolean
language sql immutable as $$
  select exists (
    select 1 from jsonb_array_elements(coalesce(arr, '[]'::jsonb)) e
    where (e->>'memberId')::uuid = member_id and e->>'endDate' is null
  );
$$;

-- queue 배열에서 memberId가 일치하는 항목을 뺀다 (JS의 queue.filter(q => q.memberId !== id))
create function public.jsonb_array_remove_member_(arr jsonb, member_id uuid)
returns jsonb
language sql immutable as $$
  select coalesce(
    (select jsonb_agg(e) from jsonb_array_elements(coalesce(arr, '[]'::jsonb)) e
     where (e->>'memberId')::uuid is distinct from member_id),
    '[]'::jsonb
  );
$$;

-- ---------- add_book ----------
create function public.add_book(
  p_group_id uuid,
  p_title text,
  p_author text default null,
  p_owner_membership_id uuid default null,
  p_status text default 'unread',
  p_start_date date default null,
  p_cover_url text default null,
  p_publisher text default null,
  p_isbn13 text default null,
  p_page_count int default 0,
  p_current_page int default 0,
  p_external_borrow boolean default false,
  p_want_to_read boolean default false
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_status text := case when p_status in ('unread', 'reading', 'finished') then p_status else 'unread' end;
  v_today date := current_date;
  v_start_date date := coalesce(p_start_date, v_today);
  v_history jsonb;
  v_book_status text;
  v_current_reader uuid;
  v_row_start date;
  v_external boolean;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception '책 제목을 입력해주세요'; end if;
  if p_owner_membership_id is null then raise exception '책 등록자를 알 수 없어요. 로그인 후 다시 시도해주세요'; end if;

  if v_status = 'reading' then
    v_current_reader := p_owner_membership_id;
    v_row_start := v_start_date;
    v_book_status := 'reading';
    v_history := jsonb_build_array(jsonb_build_object('memberId', p_owner_membership_id, 'startDate', v_start_date, 'endDate', null));
  elsif v_status = 'finished' then
    v_current_reader := null;
    v_row_start := null;
    v_book_status := 'finished';
    v_history := jsonb_build_array(jsonb_build_object('memberId', p_owner_membership_id, 'startDate', v_start_date, 'endDate', v_today));
  else
    v_current_reader := null;
    v_row_start := null;
    v_book_status := 'shelved';
    v_history := '[]'::jsonb;
  end if;

  v_external := (v_status = 'finished') and coalesce(p_external_borrow, false);

  insert into public.books (
    group_id, title, author, current_reader_id, start_date, history, status,
    cover_url, publisher, isbn13, owner_id, page_count, current_page,
    want_to_read, external_borrow
  ) values (
    p_group_id, trim(p_title), nullif(trim(coalesce(p_author, '')), ''), v_current_reader, v_row_start, v_history, v_book_status,
    nullif(p_cover_url, ''), nullif(p_publisher, ''), nullif(p_isbn13, ''), p_owner_membership_id,
    nullif(coalesce(p_page_count, 0), 0), nullif(coalesce(p_current_page, 0), 0),
    coalesce(p_want_to_read, false), v_external
  );

  return public.get_state(p_group_id);
end;
$$;

-- ---------- update_book_info ----------
create function public.update_book_info(p_group_id uuid, p_book_id uuid, p_title text, p_author text default null)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception '책 제목을 입력해주세요'; end if;

  update public.books set
    title = trim(p_title),
    author = nullif(trim(coalesce(p_author, '')), ''),
    updated_at = now()
  where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  return public.get_state(p_group_id);
end;
$$;

-- ---------- update_book_cover_info ----------
create function public.update_book_cover_info(p_group_id uuid, p_book_id uuid, p_cover_url text, p_publisher text, p_isbn13 text)
returns json
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;

  update public.books set
    cover_url = nullif(p_cover_url, ''),
    publisher = nullif(p_publisher, ''),
    isbn13 = nullif(p_isbn13, ''),
    updated_at = now()
  where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  return public.get_state(p_group_id);
end;
$$;

-- ---------- delete_book ----------
create function public.delete_book(p_group_id uuid, p_book_id uuid, p_requester_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;
  if v_book.owner_id is not null and v_book.owner_id <> p_requester_id then
    raise exception '이 책을 등록한 사람만 지울 수 있어요';
  end if;

  delete from public.books where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

-- ---------- assign_reader ----------
create function public.assign_reader(p_group_id uuid, p_book_id uuid, p_member_id uuid, p_start_date date default null, p_exchange_date date default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_history jsonb;
  v_queue jsonb;
  v_new_start date;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  if p_member_id is not null and coalesce(v_book.pending_return, false) then
    raise exception '반납이 확인되지 않았어요. 책주인이 먼저 반납을 확인해야 해요.';
  end if;

  v_history := coalesce(v_book.history, '[]'::jsonb);
  v_queue := coalesce(v_book.queue, '[]'::jsonb);

  if v_book.current_reader_id is not null and v_book.current_reader_id <> p_member_id then
    v_history := public.jsonb_history_close_last_open_(v_history, v_book.current_reader_id, current_date);
  end if;

  v_new_start := coalesce(p_start_date, current_date);

  if p_member_id is not null then
    if not public.jsonb_array_has_open_(v_history, p_member_id) then
      v_history := v_history || jsonb_build_array(jsonb_build_object('memberId', p_member_id, 'startDate', v_new_start, 'endDate', null));
    end if;
    v_queue := public.jsonb_array_remove_member_(v_queue, p_member_id);
  end if;

  update public.books set
    current_reader_id = p_member_id,
    start_date = case when p_member_id is not null then v_new_start else null end,
    queue = v_queue,
    history = v_history,
    status = case when p_member_id is not null then 'reading' else 'shelved' end,
    updated_at = now(),
    holder_id = case when p_member_id is not null then p_member_id else holder_id end,
    pending_return = case when p_member_id is not null then false else pending_return end,
    next_exchange_date = case when p_member_id is not null and p_exchange_date is not null then p_exchange_date else next_exchange_date end
  where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

-- ---------- mark_finished ----------
create function public.mark_finished(p_group_id uuid, p_book_id uuid, p_requester_id uuid, p_review text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_effective_owner uuid;
  v_needs_return boolean;
  v_history jsonb;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  if p_requester_id is null or p_requester_id <> v_book.current_reader_id then
    raise exception '지금 읽고 있는 사람만 완독 처리할 수 있어요.';
  end if;

  v_history := coalesce(v_book.history, '[]'::jsonb);
  if v_book.current_reader_id is not null then
    v_history := public.jsonb_history_close_last_open_(v_history, v_book.current_reader_id, current_date, p_review);
  end if;

  -- 소유자가 없던 책은 완독자가 소유자가 되므로(effectiveOwnerId), 자기 자신에게 반납할 필요는 없다
  v_effective_owner := coalesce(v_book.owner_id, v_book.current_reader_id);
  v_needs_return := (p_requester_id <> v_effective_owner);

  update public.books set
    history = v_history,
    current_reader_id = null,
    start_date = null,
    next_exchange_date = null,
    status = 'finished',
    updated_at = now(),
    holder_id = p_requester_id,
    pending_return = v_needs_return,
    owner_id = coalesce(v_book.owner_id, v_book.current_reader_id)
  where id = p_book_id;

  -- TODO(Phase 5): v_needs_return이면 책주인에게 반납대기 이메일 발송 (Resend 트리거 연동 후 추가)

  return public.get_state(p_group_id);
end;
$$;

-- ---------- reshelve_book ----------
create function public.reshelve_book(p_group_id uuid, p_book_id uuid, p_requester_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;

  if p_requester_id is null or (v_book.owner_id is not null and v_book.owner_id <> p_requester_id) then
    raise exception '책주인만 책장에 다시 꽂을 수 있어요.';
  end if;
  if coalesce(v_book.external_borrow, false) then
    raise exception '도서관/모임 밖에서 빌려 읽은 책은 책장에 꽂을 수 없어요.';
  end if;

  update public.books set status = 'shelved', holder_id = p_requester_id, pending_return = false, updated_at = now()
  where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

-- ---------- update_book_progress ----------
create function public.update_book_progress(p_group_id uuid, p_book_id uuid, p_requester_id uuid, p_current_page int, p_page_count int)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
  v_total int := greatest(coalesce(p_page_count, 0), 0);
  v_current int := greatest(coalesce(p_current_page, 0), 0);
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_requester_id is null then raise exception '로그인이 필요해요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;
  if v_book.current_reader_id is distinct from p_requester_id then
    raise exception '지금 읽고 있는 사람만 진행률을 수정할 수 있어요.';
  end if;
  if v_total > 0 and v_current > v_total then
    v_current := v_total;
  end if;

  update public.books set page_count = nullif(v_total, 0), current_page = nullif(v_current, 0), updated_at = now()
  where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

-- ---------- set_book_want_to_read ----------
create function public.set_book_want_to_read(p_group_id uuid, p_book_id uuid, p_actor_id uuid, p_want_to_read boolean)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_book public.books;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  select * into v_book from public.books where id = p_book_id and group_id = p_group_id;
  if not found then raise exception '책을 찾을 수 없어요'; end if;
  if p_actor_id is null or p_actor_id <> v_book.owner_id then
    raise exception '이 책을 등록한 사람만 표시할 수 있어요';
  end if;

  update public.books set want_to_read = coalesce(p_want_to_read, false) where id = p_book_id;

  return public.get_state(p_group_id);
end;
$$;

-- ============================================================
-- 권한
-- ============================================================
grant execute on function
  public.add_book(uuid, text, text, uuid, text, date, text, text, text, int, int, boolean, boolean),
  public.update_book_info(uuid, uuid, text, text),
  public.update_book_cover_info(uuid, uuid, text, text, text),
  public.delete_book(uuid, uuid, uuid),
  public.assign_reader(uuid, uuid, uuid, date, date),
  public.mark_finished(uuid, uuid, uuid, text),
  public.reshelve_book(uuid, uuid, uuid),
  public.update_book_progress(uuid, uuid, uuid, int, int),
  public.set_book_want_to_read(uuid, uuid, uuid, boolean)
  to authenticated;
