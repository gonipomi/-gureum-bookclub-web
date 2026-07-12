-- ============================================================
-- SNS화 제안 #1 (HIGH) — 사진·댓글에 좋아요(❤️).
-- 댓글을 쓰는 건 진입장벽이 있지만, 버튼 한 번으로 "봤어요/좋아요"를 표시하는 건
-- 훨씬 가볍다. 찜(hearts)/추천(recommendations)과 같은 memberId 배열 패턴을
-- 그대로 재사용한다.
--
-- 좋아요 대상은 books.photos / exchange_proposals.photos 배열 안의 항목들인데,
-- 이 배열엔 두 층위가 있다: 사진·텍스트메모(최상위 항목, type='photo'|'comment')와
-- 그 사진에 달린 댓글(항목.comments[] 안의 중첩 항목). p_parent_photo_id로 어느
-- 층위를 좋아요하는지 구분한다 — null이면 최상위 항목, 값이 있으면 그 사진의
-- 댓글 중 하나.
--
-- get_state는 books.photos/exchange_proposals.photos를 원본 jsonb 그대로
-- 내려주므로(필드별 재조립이 아님), 항목 안에 hearts 필드를 추가해도
-- get_state를 따로 고칠 필요가 없다.
-- ============================================================

create or replace function public.toggle_record_item_heart(
  p_group_id uuid, p_entity_type text, p_entity_id text, p_item_id text,
  p_parent_photo_id text, p_member_id uuid, p_liked boolean
)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_photos jsonb;
  i int;
  n int;
  j int;
  m int;
  v_hearts jsonb;
  v_found boolean := false;
begin
  if not public.is_member_of(p_group_id) then raise exception '이 그룹의 멤버가 아니에요.'; end if;
  if p_member_id is null then raise exception '로그인이 필요해요.'; end if;
  -- books_notify_trigger_가 "어느 그룹에서 온 요청인지" 알 수 있게 남겨둔다 (0018 패턴).
  perform set_config('app.current_group_id', p_group_id::text, true);

  -- books는 person-scoped라 group_id 컬럼이 없다(0008에서 제거) — book_visible_in_group_로
  -- 소유자가 이 그룹 멤버인지 확인한다. exchange_proposals는 그대로 group_id로 스코프.
  if p_entity_type = 'exchange' then
    select photos into v_photos from public.exchange_proposals where group_id = p_group_id and date = p_entity_id::date;
  else
    if not public.book_visible_in_group_(p_entity_id::uuid, p_group_id) then raise exception '기록을 찾을 수 없어요'; end if;
    select photos into v_photos from public.books where id = p_entity_id::uuid;
  end if;
  if v_photos is null then raise exception '기록을 찾을 수 없어요'; end if;

  n := jsonb_array_length(v_photos);
  for i in 0..n - 1 loop
    if p_parent_photo_id is null then
      if (v_photos -> i) ->> 'id' = p_item_id then
        v_hearts := coalesce((v_photos -> i) -> 'hearts', '[]'::jsonb);
        if p_liked then
          if not public.jsonb_array_has_value_(v_hearts, p_member_id) then
            v_hearts := v_hearts || jsonb_build_array(to_jsonb(p_member_id::text));
          end if;
        else
          v_hearts := public.jsonb_array_remove_value_(v_hearts, p_member_id);
        end if;
        v_photos := jsonb_set(v_photos, array[i::text, 'hearts'], v_hearts);
        v_found := true;
      end if;
    elsif (v_photos -> i) ->> 'id' = p_parent_photo_id then
      m := jsonb_array_length(coalesce((v_photos -> i) -> 'comments', '[]'::jsonb));
      for j in 0..m - 1 loop
        if ((v_photos -> i) -> 'comments' -> j) ->> 'id' = p_item_id then
          v_hearts := coalesce((v_photos -> i) -> 'comments' -> j -> 'hearts', '[]'::jsonb);
          if p_liked then
            if not public.jsonb_array_has_value_(v_hearts, p_member_id) then
              v_hearts := v_hearts || jsonb_build_array(to_jsonb(p_member_id::text));
            end if;
          else
            v_hearts := public.jsonb_array_remove_value_(v_hearts, p_member_id);
          end if;
          v_photos := jsonb_set(v_photos, array[i::text, 'comments', j::text, 'hearts'], v_hearts);
          v_found := true;
        end if;
      end loop;
    end if;
  end loop;

  if not v_found then raise exception '대상을 찾을 수 없어요'; end if;

  if p_entity_type = 'exchange' then
    update public.exchange_proposals set photos = v_photos where group_id = p_group_id and date = p_entity_id::date;
  else
    update public.books set photos = v_photos, updated_at = now() where id = p_entity_id::uuid;
  end if;

  return public.get_state(p_group_id);
end;
$$;

grant execute on function public.toggle_record_item_heart(uuid, text, text, text, text, uuid, boolean) to authenticated;
