# 해빗 타워 커플 모드 — 설계

날짜: 2026-09-26 · 상태: 승인됨

## 목표
도균님(안드로이드)과 여자친구(아이폰)가 각자 습관 탑을 쌓으면서, 서로의 탑·인증 사진을 보고, 같은 날 둘 다 인증하면 커플 탑이 한 층 올라간다. 한 명이라도 빼먹으면 커플 탑은 무너진다.

## 결정 사항 (도균님 선택)
- 연결: 이메일 6자리 코드 로그인(비밀번호 없음) + 초대코드.
- 화면: 탭 `[ 나 | ❤ 커플 | 상대 이름 ]`, 기본 커플 탭.
- 습관은 각자 다를 수 있음. 커플 탑 = 같은 KST 날짜에 둘 다 인증한 날의 연속 구간.
- 과거 기록도 포함(연결 전 겹치는 날도 커플 탑에 계산).
- 상대 탭은 읽기 전용. 푸시 알림·하트 반응·3인 이상·습관 여러 개는 제외.

## 구조: 폰 우선(local-first)
- 내 기록·사진의 원본은 지금처럼 폰 IndexedDB. 인증은 오프라인에서도 즉시 쌓임.
- 로그인 상태면 쓰기마다 `outbox`에 적고, 온라인일 때 클라우드로 올림.
- 상대 기록은 클라우드에서 받아 폰에 캐시(`partner` 스토어) → 오프라인에서도 보임.
- 로그인 안 하면 지금 앱과 100% 동일하게 동작(커플 기능만 숨김).

## 클라우드: Supabase (무료 플랜)
도균님이 직접 가입·프로젝트 생성. 앱에는 프로젝트 URL과 anon(공개) 키만 들어감(`config.js`). service_role 키는 앱·저장소에 절대 넣지 않음.

### 스키마 (`supabase/schema.sql`, SQL 에디터에 붙여넣기)
- `profiles(id uuid pk → auth.users, name text ≤20자, character text, habit text, couple_id uuid null, updated_at)`
- `couples(id uuid pk, invite_code text unique, created_at)` — 클라이언트 직접 접근 불가.
- `days(user_id uuid → auth.users, day date, photo_path text, at timestamptz, pk(user_id, day))`
- 함수(security definer, `search_path` 고정):
  - `my_couple()` → 호출자의 couple_id.
  - `create_couple()` → 새 커플 + 6자 초대코드(헷갈리는 0/O/1/I 제외) 반환, 호출자 연결. 이미 커플이면 오류.
  - `join_couple(code)` → 코드의 커플에 호출자 연결. 이미 2명이거나 코드 없음이면 오류.
  - `leave_couple()` → 호출자 couple_id = null.

### 접근 규칙 (RLS)
- `profiles`: 읽기 = 본인 또는 같은 커플. 쓰기 = 본인 행만, `couple_id` 열은 클라이언트가 못 바꿈(함수로만).
- `days`: 읽기 = 본인 또는 같은 커플 상대. 쓰기·삭제 = 본인 행만.
- `couples`: 정책 없음(함수로만).
- Storage 버킷 `photos`(비공개): 경로 `{user_id}/{assetId}.jpg`. 업로드·삭제 = 첫 폴더가 본인 id. 읽기 = 본인 또는 같은 커플 상대 폴더.

## 앱 쪽 변경
- `config.js`: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (없으면 커플 기능 숨김).
- `cloud.js`(신규): supabase-js(`cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`) 래퍼.
  - 로그인: `signInWithOtp({ email })` → `verifyOtp({ email, token, type: 'email' })`. 세션은 supabase-js가 폰에 보관.
  - `sync()`: outbox 비우기(사진 업로드 upsert → `days` upsert → 다시 찍기면 옛 사진 삭제) → 내 프로필 upsert → 상대 프로필·days 받기 → 없는 상대 사진 다운로드해 `partner` 스토어에 저장.
  - 새 폰 로그인: 클라우드에 있는데 폰에 없는 내 기록·사진을 받아 로컬에 복원.
  - 처음 로그인: 폰에 있는 내 기록 전부를 outbox에 넣어 업로드.
  - 호출 시점: 앱 시작, 앱 복귀(visibilitychange), 인증 직후. 실패는 조용히 재시도(다음 호출).
- `localdb.js`: 스토어 추가 `outbox`(day → 1), `partner`(`days` 문서, 사진 Blob). DB 버전 2 업그레이드.
- `logic.js`: `coupleDays(mine, theirs)` = 둘 다 사진 있는 날만 `{ assetId: 내것, partnerAssetId: 상대것 }`. 커플 탑은 기존 `towers()`·`pendingFall()` 재사용.
- `habit/me`에 `seenCoupleFall` 추가(커플 붕괴 연출 1회, 폰별).
- 화면:
  - 탭 바(로그인+커플 연결 시만).
  - 커플 탭: 반반 사진 벽돌(왼쪽 내 사진, 오른쪽 상대 사진), 크루 = 내 캐릭터 + 상대 캐릭터 + 몬스터 친구(커플 층수로 진화). 쌓기·붕괴 연출은 기존 Scene 재사용.
  - 상대 탭: 상대 탑 읽기 전용(인증 버튼 없음, 붕괴 연출 없음·잔해만).
  - 인증 시 오늘 상대도 인증했으면 커플 탭에서 쌓기 연출.
  - 설정 창 "커플" 칸: 로그인(이메일 → 코드), 내 이름, 커플 만들기(초대코드 표시·복사) / 코드 입력, 연결 끊기, 로그아웃.
  - 초기화: 로그인 상태면 내 클라우드 기록·사진도 삭제하고 커플 연결 해제(한 번 더 확인).
- `sw.js`: supabase-js CDN을 셸 캐시에 추가, Supabase API 요청(`*.supabase.co`)은 서비스워커가 건드리지 않음.

## 오류 처리
- 오프라인·업로드 실패: outbox에 남아 다음 sync 때 재시도. 화면엔 "☁ 올릴 기록 N개" 작은 표시.
- 로그인 코드 틀림/만료: 설정 창에 메시지.
- 초대코드 없음/커플 가득: 메시지.
- 세션 만료: supabase-js 자동 갱신, 실패 시 로그아웃 상태로 표시(로컬 기능은 그대로).

## 테스트
- `logic.test.mjs`: `coupleDays` 교집합, 커플 탑(towers 재사용) 경계.
- SQL: 테스트 계정 2개로 RLS 확인(남의 days·사진 읽기/쓰기 거부, 커플 상대만 읽기 가능). 테스트 계정은 도균님이 대시보드에서 만들거나 이메일 2개로 로그인.
- 브라우저: 창 2개(서로 다른 계정)로 인증 → 상대 탭·커플 탑 반영, 오프라인 인증 후 온라인 복귀 시 업로드.
- 폰 실제 확인: 도균님·여자친구.

## 도균님이 해야 할 일 (구현 전/중)
1. supabase.com 가입 → 새 프로젝트(리전 Seoul) 생성.
2. 프로젝트 URL·anon 키 전달.
3. `supabase/schema.sql` 을 SQL 에디터에 붙여넣고 실행.
4. Authentication → Email 템플릿의 "Magic Link" 본문에 `{{ .Token }}` 넣기(6자리 코드가 메일에 보이게).
