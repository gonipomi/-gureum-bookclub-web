-- ============================================================
-- 버그 수정: 0008에서 books/wishlist/exchange_proposals의 FK를 profiles로
-- 바꾸면서 ON DELETE 동작을 안 정해줘서, 책/위시/제안이 하나라도 남아있는
-- 사람은 auth.users에서 계정을 지울 수 없었다("Database error deleting user").
--
-- 정책:
--   - books.owner_id: 주인 계정이 없어지면 그 책도 같이 지운다(CASCADE) —
--     이 모델에서 주인 없는 책은 의미가 없다.
--   - books.current_reader_id / holder_id: 지금 읽는 사람 계정이 없어져도
--     책 자체는 남아야 하니 참조만 비운다(SET NULL).
--   - wishlist.requested_by / exchange_proposals.proposed_by: 요청자/제안자
--     계정이 없어져도 항목 자체(다른 사람의 투표·댓글 등)는 남아야 하니
--     참조만 비운다(SET NULL).
-- ============================================================

alter table public.books drop constraint books_owner_id_fkey;
alter table public.books drop constraint books_current_reader_id_fkey;
alter table public.books drop constraint books_holder_id_fkey;

alter table public.books
  add constraint books_owner_id_fkey foreign key (owner_id) references public.profiles (id) on delete cascade,
  add constraint books_current_reader_id_fkey foreign key (current_reader_id) references public.profiles (id) on delete set null,
  add constraint books_holder_id_fkey foreign key (holder_id) references public.profiles (id) on delete set null;

alter table public.wishlist drop constraint wishlist_requested_by_fkey;
alter table public.wishlist
  add constraint wishlist_requested_by_fkey foreign key (requested_by) references public.profiles (id) on delete set null;

alter table public.exchange_proposals drop constraint exchange_proposals_proposed_by_fkey;
alter table public.exchange_proposals
  add constraint exchange_proposals_proposed_by_fkey foreign key (proposed_by) references public.profiles (id) on delete set null;
