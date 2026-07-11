# 구름멍멍교환독서클럽 — Supabase 버전 (Phase 1)

기존 Google Apps Script 앱(`gureum-bookclub` 레포)을 여러 그룹(최대 5개)이 쓸 수 있도록
Supabase(Postgres + Auth)로 옮기는 작업의 1단계. 진행 상황은 이 레포의 상위 계획 문서를 참고.

**빌드 도구 없음** — 순수 정적 파일(`web/`)이라 `npm install` 없이 그대로 어디든 올리면 됨
(GitHub Pages 추천). Supabase 클라이언트는 CDN(esm.sh)에서 바로 불러온다.

## 지금 할 수 있는 것 (Phase 1)

- 이메일 매직링크로 로그인
- 그룹 만들기 / 초대 코드로 그룹 참가
- 그룹이 여러 개면 전환(계정 메뉴 > 그룹 전환)
- 그룹 선택 후 예전과 똑같은 화면(홈/서고/이 책 찾아요/...)이 뜸 — 단, 데이터가 비어있음
  (책 추가·읽기신청 등 실제 기능은 Phase 2~4에서 하나씩 연결)

## 처음 설정하는 법 (직접 해야 하는 부분)

1. **Supabase 프로젝트 생성**: https://supabase.com 에서 새 프로젝트 생성 (무료 티어).
2. **마이그레이션 실행**: Supabase 대시보드 > SQL Editor에서
   `supabase/migrations/0001_init.sql` 내용을 그대로 붙여넣고 실행.
   (또는 Supabase CLI가 있다면 `supabase login` 후 `supabase link`, `supabase db push`)
3. **매직링크 이메일 확인**: Authentication > Providers에서 Email이 켜져있는지 확인.
   기본 발신 도메인(무료)은 시간당 발송 제한이 있어 초반 테스트 정도만 가능 — 실제 운영 시
   Authentication > Email Templates > SMTP Settings에서 커스텀 SMTP(예: Resend)로 바꾸는 걸
   권장 (Phase 5에서 트랜잭션 메일도 Resend로 붙일 예정이라 겸사겸사 같이 설정해도 됨).
4. **키 채우기**: Project Settings > API에서 Project URL과 anon public key를 복사해
   `web/config.js`에 붙여넣기.
5. **로컬 확인**: `web/` 폴더를 아무 정적 서버로 띄워서 확인
   (예: `npx serve web` 또는 `python3 -m http.server --directory web 8080`).
6. **배포(GitHub Pages)**: 이 레포를 GitHub에 새로 만들어 push한 뒤,
   Settings > Pages에서 소스를 `/web` 폴더(또는 `main` 브랜치 `/docs`로 옮겨서)로 지정.

## 다음 단계

- Phase 2: 책 CRUD(추가/수정/삭제/읽기시작/완독 등) RPC 이식
- Phase 3: 읽기신청·찜신청·대기열, 위시리스트 자기치유 로직
- Phase 4: 교환일 제안/투표/확정, 사진 업로드(Supabase Storage)
- Phase 5: 알림 이메일(Resend) + GitHub Actions 매시간 다이제스트
- Phase 6: 실제 클럽 데이터 이전 + 컷오버 (기존 GAS 앱은 그때까지 그대로 유지)

## 폴더 구조

```
supabase/migrations/   -- SQL 마이그레이션 (스키마 + RLS + RPC)
web/                   -- 정적 프론트엔드
  index.html
  style.css            -- 기존 Style.html 그대로 이식
  client.js            -- 기존 Client.html 로직 이식 (로그인/서버통신 부분만 교체, 나머지 그대로)
  app.js               -- 신규: Supabase 인증/그룹 부트스트랩, callServer 연결부
  config.js            -- Supabase 프로젝트 URL/anon key (직접 채워야 함)
```
