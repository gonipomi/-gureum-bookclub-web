-- ============================================================
-- "저도 이 책 있어요" — 다른 멤버가 이미 소장한 일반 책(위시리스트가 아니라 실제
-- 등록된 책)을 볼 때, 나도 같은 책을 갖고 있으면 내 서고에도 바로 등록할 수 있게 한다.
-- "이 책 찾아요"(wishlist) 쪽의 convert_wish_to_owned_book_와 같은 발상이지만, 그건
-- 위시리스트 항목을 소스로 쓰고 이건 이미 존재하는 books 행을 소스로 쓴다는 점만 다르다.
-- ============================================================
create or replace function public.claim_book_copy(p_group_id uuid, p_book_id uuid, p_member_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_source public.books;
  v_normalized text;
begin
  if not public.book_visible_in_group_(p_book_id, p_group_id) then raise exception '책을 찾을 수 없어요'; end if;
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;

  select * into v_source from public.books where id = p_book_id;
  if v_source.owner_id = p_member_id then raise exception '이미 내 책이에요.'; end if;

  v_normalized := lower(regexp_replace(trim(v_source.title), '\s+', '', 'g'));
  if exists (
    select 1 from public.books
    where owner_id = p_member_id
      and lower(regexp_replace(title, '\s+', '', 'g')) = v_normalized
  ) then
    raise exception '이미 내 서고에 있는 책이에요.';
  end if;

  insert into public.books (title, author, status, owner_id, cover_url, publisher, isbn13)
  values (v_source.title, v_source.author, 'shelved', p_member_id, v_source.cover_url, v_source.publisher, v_source.isbn13);

  return public.get_state(p_group_id);
end;
$$;

grant execute on function public.claim_book_copy(uuid, uuid, uuid) to authenticated;
