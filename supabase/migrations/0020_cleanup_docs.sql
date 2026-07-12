-- ============================================================
-- 정리 항목 5 (LOW): owner_id/current_reader_id/holder_id의 관계를 테이블/컬럼 코멘트로
-- 한 군데에 정리해둔다. 셋 다 필요한 필드지만(등록자·지금 읽는 사람·지금 실물을
-- 들고 있는 사람이 대여 상황에 따라 다 다를 수 있음), 지금까지는 이 관계 설명이
-- 여러 마이그레이션 파일에 흩어져 있었다. `\d+ books`나 Supabase 테이블 편집기에서
-- 바로 보이는 코멘트로 옮겨서, 다음에 이 스키마를 보는 사람이 한 군데서 확인할 수 있게 한다.
--
-- 상태 전이 요약:
--   shelved(등록만 됨, 아직 아무도 안 읽음)
--     → assign_reader → reading (current_reader_id 설정, holder_id = 그 사람)
--     → mark_finished → finished
--         · 완독한 사람 == owner_id 면 pending_return=false (반납 개념 자체가 없음)
--         · 완독한 사람 != owner_id 면 pending_return=true, holder_id = 완독한 사람
--           (아직 책주인에게 물리적으로 안 돌아온 상태)
--     → confirm_return(책주인만) → pending_return=false, holder_id=owner_id로 리셋
--   그 다음 finished 상태에서 누군가(책주인 포함) request_to_read_book → 승인되면
--   다시 assign_reader → reading으로 순환.
-- ============================================================

comment on column public.books.owner_id is
  '이 책을 처음 등록한 사람(profiles.id). 책 소유 여부와 무관하게 항상 유지되는 값 — '
  '대여/반납이 반복돼도 owner_id는 안 바뀐다.';

comment on column public.books.current_reader_id is
  '지금 이 책을 읽고 있는 사람(profiles.id). null이면 아무도 안 읽는 중(shelved 또는 finished). '
  'assign_reader가 설정하고, mark_finished가 null로 되돌린다.';

comment on column public.books.holder_id is
  '지금 이 책을 물리적으로 들고 있는 사람(profiles.id). current_reader_id와 다를 수 있는 유일한 '
  '경우는 "다 읽었는데 아직 책주인에게 안 돌려준" pending_return=true 상태 — 그 사이엔 '
  'holder_id=완독한 사람, owner_id=책주인으로 서로 다르다. confirm_return이 호출되면 '
  'holder_id를 다시 owner_id와 같게 맞춘다.';

comment on column public.books.pending_return is
  'true면 "완독은 됐지만 아직 책주인에게 물리적으로 반납되지 않음" 상태. 이 기간엔 '
  'holder_id(완독한 사람)와 owner_id(책주인)가 서로 다르다. confirm_return(책주인만 호출 가능)이 '
  '이 값을 false로 되돌리면서 holder_id도 owner_id로 리셋한다.';

comment on column public.books.status is
  '''shelved''(등록만 됨) / ''reading''(누군가 읽는 중) / ''finished''(완독됨, pending_return과 '
  '조합해서 반납 여부까지 표현) 세 값 중 하나. 클라이언트가 책 추가 시 보내는 문자열도 '
  '이 세 값과 통일했다(예전엔 ''unread''라는 네 번째 이름이 같은 상태를 가리켜서 혼란이 있었음).';

-- ============================================================
-- 정리 항목 6 (LOW): "다시 책장에 꽂기" 버튼을 없애면서(완독된 책도 이제 바로 읽기
-- 신청이 가능해져서 재교환에 별도 단계가 필요 없어짐) 더 이상 아무도 호출하지 않는
-- reshelve_book 함수를 정리한다.
-- ============================================================

drop function if exists public.reshelve_book(uuid, uuid, uuid);
