# 해빗 타워 — 설계

날짜: 2026-09-25 · 상태: 승인됨

## 목표
습관 하나를 정하고, 매일 사진으로 성공을 인증하면 캐릭터와 몬스터 친구가 벽돌을 들고 와서 탑에 한 층 쌓는다. 30층이면 탑 완성. 하루 빼먹으면 쌓던 탑이 무너진다(붕괴 애니메이션). 모든 인증 사진은 앨범에 남는다.

퀘스트 다이어리(`~/quest-diary`)와 별개 앱. 도트(`ui/sprites.js`, `ui/monsters.js`)·폰트·`devdb.js`·Preact+htm 구조만 복사해 재사용.

## 플랫폼
claude.ai 비공개 Artifact. capabilities: `db`(기록), `assets`(사진). 로컬 개발은 `?dev` → `devdb.js` 인메모리 db + 인메모리 가짜 assets(object URL).

## 데이터 (db)
- `habit/me`: `{ title, character, seenFall }`
  - `character`: 캐릭터 id (warrior/thief/magician/bowman).
  - `seenFall`: 붕괴 애니메이션을 이미 본 탑의 마지막 날짜 키(`YYYY-MM-DD`) 또는 `null`.
- `days/{YYYY-MM-DD}` (KST): `{ assetId, at }` — 그날 인증 사진 id, 인증 시각(ISO).
- 탑·층수·앨범은 저장하지 않고 `days`에서 계산.

## 계산 — `logic.js` (순수, 테스트)
- `todayKST`, `addDays`, `daysBetween` (퀘스트 다이어리와 동일).
- `TOWER_HEIGHT = 30`, `MONSTERS` (8종, `ui/monsters.js`가 import).
- `runs(days)` → 연속 성공 구간 `[{ start, end, keys[] }]` 오래된 순.
- `towers(days, today)` → `{ current, past }`
  - 현재 구간 = 오늘 또는 어제로 끝나는 구간. 구간을 30일씩 잘라 탑으로 만든다.
  - `current`: `{ keys }` — 지금 쌓는 탑의 날짜들(1~30개), 없으면 `null`. 30개 채운 탑은 다음 날 블럭이 올라가기 전까지 `current`(깃발 상태).
  - `past`: `[{ keys, kind: 'built' | 'fell' }]` 최신 순. 30개짜리는 `built`, 끊긴 나머지(1~29개)는 `fell`.
- `pendingFall(days, today, seenFall)` → 가장 최근에 끊긴 `fell` 탑이 있고 그 마지막 날 ≠ `seenFall`이고 현재 탑이 없으면 그 탑, 아니면 `null`.
- ~~`buddyFor(floors)`~~ → 2026-09-27 보상 시스템으로 대체: 몬스터 친구는 가방에서 장착 (`2026-09-27-habit-tower-rewards-design.md`).

## 저장 — `db.js`
- `connect()`: `claude.use('db')` / `?dev` devdb / `null`(읽기 전용 배너).
- `connectAssets()`: `claude.use('assets')` / `?dev` 가짜 / `null`(인증 버튼 숨김).
- `subscribe(db, onState)`: `habit/me` + `days` 스냅샷, 둘 다 서버 확정되면 `loaded`.
- actions:
  - `setHabit({ title, character })`
  - `certify(file)`: 사진 축소(긴 변 1280px, JPEG 0.8, canvas) → `assets.upload` → `days/{today}` set. 오늘 이미 있으면(다시 찍기) 새 업로드 성공 후 옛 asset `delete`. 업로드 실패 시 db 쓰기 없음.
  - `ackFall(endKey)`: `habit/me.seenFall = endKey`.

## 화면
- 첫 실행(습관 없음): 설정 창 — 습관 이름 + 캐릭터 4종 선택.
- 메인: 하늘+풀밭 배경, 가운데 탑. 블럭 높이 `clamp(8px, (100vh - 300px) / 30, 16px)`.
  - 탑 왼쪽에 캐릭터, 오른쪽에 몬스터 친구(`buddyFor(현재 층수)`), idle 숨쉬기.
  - 30층이면 꼭대기 깃발.
  - 상단: 습관 이름, `N/30층`, 완성 탑 수 🏰×N, 앨범 버튼, 설정 버튼.
  - 하단: 오늘 미인증이면 `📷 인증하고 쌓기`, 인증했으면 `오늘 완료 ✓` + `다시 찍기`.
  - 블럭 탭 → 사진 모달(날짜, 사진).
- 앨범: 현재 탑 + 지난 탑 목록(🏰 완성 / 💥 N층에서 붕괴), 탑별 사진 격자 → 탭하면 크게.
- 파일 입력: `<input type="file" accept="image/*" capture="environment">`.

## 애니메이션 (CSS keyframes, JS는 단계 class만)
- 쌓기 (인증 성공 직후, 약 2.5s): 캐릭터·몬스터가 양옆에서 벽돌을 머리 위에 들고 걸어옴 → 탑 아래서 점프 → 벽돌이 포물선으로 꼭대기에 착지 → 먼지 + `+1층`. 다시 찍기는 연출 없음.
- 완성 (30층 착지 시): 깃발 + 폭죽.
- 붕괴 (`pendingFall` 있을 때 앱 열면 1회): 쌓였던 탑을 그린 뒤 흔들림 → 블럭마다 다른 방향·회전으로 낙하 → 잔해 더미, 캐릭터·몬스터 머리 위 별 빙빙 → `N층에서 무너졌어요` 메시지 + 확인 버튼 → `ackFall`.
- `prefers-reduced-motion`: 연출 생략, 결과만.

## 오류 처리
- db/assets 없음: 읽기 전용 배너, 인증 버튼 숨김.
- 업로드·저장 실패: 토스트, 상태 변화 없음.
- 사진 아닌 파일/디코드 실패: 토스트.

## 테스트
- `logic.test.mjs`: runs 분할, towers(없음/진행/어제까지/끊김/30 깃발/31/60+2), pendingFall(미확인/확인됨/현재 탑 있음), buddyFor 경계.
- 브라우저 `?dev`: 설정 → 인증(가짜 사진) → 쌓기 연출 → 다시 찍기 → 앨범 → 붕괴(가짜 과거 기록 주입 `?dev&seed=fall`).

## 제외
습관 여러 개, 인증 취소, 알림, 공유, 보너스/업적.

## 변경 (2026-09-25): 사진 벽돌
- 벽돌 120×60px, 인증 사진을 `object-fit: cover`로 채움, 테두리 3px = 층 색(돌/벽돌/금). 1열 유지.
- 탑이 화면보다 높으면 가운데 영역 세로 스크롤. 땅은 배경이 아니라 콘텐츠 바닥(`.ground`). 열면 땅이 보이게 맨 아래로.
- 크루가 드는 벽돌도 같은 크기 + 오늘 사진.
- 쌓기: 비행 시간 `--fd` = 0.6~1.4s(높이 비례), 카메라가 벽돌 따라 꼭대기로 → 착지 후 1.1s 머묾 → 땅으로 복귀 → 연출 종료(Scene의 `onDone`). 앱 타이머는 안전장치(9s).

## 변경 (2026-09-25): 안드로이드 PWA (폰 전용)
- `db.js` 모드: claude.ai → Artifact, `?dev` → 인메모리, 그 외 → `localdb.js`(IndexedDB `docs`·`photos` 스토어). 쓰기는 IndexedDB 먼저, 성공 시 메모리 반영. `navigator.storage.persist()` 요청.
- 사진 Blob을 IndexedDB에 저장, 시작 시 object URL로 매핑.
- `manifest.webmanifest`(standalone, portrait, 아이콘 192/512 maskable) + `sw.js`(앱 셸·CDN stale-while-revalidate). dev/claude.ai에선 SW 등록 안 함.
- 백업: 설정 창에 내보내기(JSON: docs + 사진 dataURL) / 가져오기(검증 `validBackup` 후 병합). 경로는 `habit/me`, `days/YYYY-MM-DD`만 허용.
- 배포: GitHub Pages 공개 저장소 (데이터는 폰에만).

## 변경 (2026-09-26): 아이폰 + 초기화 (1단계)
- 아이폰: `apple-touch-icon`(180), `apple-mobile-web-app-capable/title`, `viewport-fit=cover` + 하단 바 `env(safe-area-inset-bottom)` 여백.
- 사진 축소: `createImageBitmap` 실패 시 `<img>.decode()` 경로.
- 백업 내보내기: `navigator.share({ files })` 가능하면 공유 창(아이폰 "파일에 저장", 안드로이드 드라이브), 아니면 다운로드.
- 설정 창 **초기화**: 한 번 더 확인 → IndexedDB `docs`·`photos` 비우고 새로고침.

## 다음 (2단계, 미설계): 커플 모드
도균님 선택: 각자 탑 + 서로 탑·인증 사진 구경 + 둘 다 인증한 날만 쌓이는 커플 탑(한 명이라도 빼먹으면 붕괴). 두 폰이 데이터를 주고받아야 해서 클라우드 백엔드(Supabase 등, 도균님이 직접 가입) 필요. 1단계 로컬 기록은 클라우드로 옮길 수 있게 설계할 것.
