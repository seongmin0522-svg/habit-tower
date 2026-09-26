# 해빗 타워 푸시 알림 — 설계

날짜: 2026-09-27 · 상태: 승인됨

## 목표
밤 9시(KST)까지 오늘 인증을 안 했으면 폰에 알림: "🧱 오늘 벽돌 아직이에요 — 자정 지나면 탑이 무너져요". 알림 누르면 앱이 열린다. 상대 인증 소식·마감 직전 두 번째 알림은 이번 범위 밖(나중에 같은 통로에 붙임).

## 방식
표준 Web Push(VAPID) + Supabase. 외부 알림 서비스(OneSignal/FCM)는 가입·의존성만 늘어서 제외, 서버 없는 Periodic Background Sync는 아이폰 미지원·시각 보장 없음이라 제외.

## 대상
로그인한 사람만(서버가 `days`로 인증 여부를 앎). 로그인 안 한 폰 전용 사용자에게는 알림 줄을 보여주지 않는다.
- 아이폰: iOS 16.4+ 이고 홈 화면에 추가한 앱일 때만 Web Push 가능.
- 알려진 한계: 인증했지만 오프라인이라 아직 업로드 안 된 경우 알림이 갈 수 있다(앱 열면 올라감 — 허용).

## 데이터
`push_subs` 표 (RLS: 본인 행만 insert/delete/select):
- `endpoint text primary key`, `user_id uuid default auth.uid() references auth.users on delete cascade`, `p256dh text`, `auth text`, `created_at timestamptz default now()`.
- 한 사람이 여러 개 가능(폰 교체·재설치).

"오늘 인증" = `days`에 `(user_id, day = (now() at time zone 'Asia/Seoul')::date)` 행이 있음(방어권 행 포함 — 방어권은 어제만 채우므로 오늘엔 영향 없음).

## 서버
- **VAPID 키**: 공개 키는 `config.js`, 비밀 키는 Supabase Vault(`vault.secrets` 이름 `vapid_private`). 저장소가 공개라 비밀 키는 절대 코드에 두지 않는다. Supabase CLI가 없고 MCP엔 Edge Function secret 설정이 없어서 Vault를 쓴다: `remind_config()`(security definer, `service_role`만 실행)가 Vault에서 `vapid_private`·`cron_secret`을 꺼내 준다.
- **Edge Function `remind`**: 헤더 암호(Vault `cron_secret`)가 맞을 때만 동작. Edge Function 기본 env의 service role 키로 "오늘 인증 없는 사람의 `push_subs`"를 읽어 각각 푸시. 응답 404/410이면 그 행 삭제(죽은 주소표). JWT 검증 끔(cron이 부름), 대신 암호로 막음.
- **예약**: `pg_cron` 매일 `0 12 * * *`(UTC = 21:00 KST) → `pg_net`으로 `remind` 호출, 암호 헤더 포함. 암호는 Vault(`vault.secrets`)에서 읽는다.

## 클라이언트
- **설정 창** 커플 칸(로그인 상태) 아래 한 줄: `알림 — 밤 9시, 오늘 벽돌 아직이면 [켜기|끄기]`.
  - `PushManager` 없음(아이폰 Safari 탭 등) → 버튼 대신 "홈 화면에 추가한 앱에서만 알림이 돼요".
  - `Notification.permission === 'denied'` → "폰 설정에서 이 앱 알림을 허용해 주세요".
  - 켜기: 버튼 탭 안에서 권한 요청 → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → `push_subs` upsert.
  - 끄기: `unsubscribe()` + 그 endpoint 행 삭제.
  - 로그아웃: 끄기와 같음(한 폰에서 다른 계정으로 로그인하면 남의 endpoint 행이라 RLS에 막히고, 로그아웃한 사람에게 알림이 가는 것도 막음).
- **앱 실행 시**: 권한 granted이고 로그인 상태면 `getSubscription()` 결과를 upsert(주소표가 몰래 바뀌는 경우 대비).
- **`sw.js`**: `push` → `showNotification`(아이콘 `icons/icon-192.png`), `notificationclick` → 열린 창 focus, 없으면 `./` 열기. 캐시 `habit-tower-v7`.
- localhost에선 SW를 안 켜므로 푸시 테스트는 배포 사이트에서.

## 테스트
1. PC 크롬 → 배포 사이트 도균님 계정 → 알림 켜기 → `remind` 수동 호출 → 알림 뜸.
2. SQL: 오늘 인증 있는 사람은 대상에서 빠짐, 가짜 endpoint 행은 호출 후 삭제됨, 암호 없는 호출은 401.
3. 도균님 플립 실기기. 여자친구는 본인 아이폰(홈 화면 앱)에서 직접 [켜기].

## Supabase 작업(각 단계 전 도균님 확인)
표·함수 마이그레이션, Vault에 `vapid_private`·`cron_secret` 저장, Edge Function 배포, cron 등록. 전부 MCP로.
