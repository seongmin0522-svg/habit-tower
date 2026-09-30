# Stage 2A Accounts and Legal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google sign-in instead of mailed codes, sign-up open to anyone, an in-app account deletion, and privacy/terms pages.

**Architecture:** `cloud.js` signs in with Supabase OAuth (PKCE) and calls a new Edge Function `delete-account` that removes the caller's photos, error logs and auth user (all tables cascade). Two SQL guards bound abuse (photo count per folder, error-log retention). Static `privacy.html`/`terms.html` sit next to the app.

**Tech Stack:** plain ES modules + Preact/htm, supabase-js 2.117.2 (CDN), Supabase Auth/Storage/Edge Functions (Deno), pg_cron, `node --test`.

Spec: `docs/superpowers/specs/2026-09-30-accounts-legal-design.md`.

---

## Ground rules

- Tests: `cd ~/habit-tower && npm test` → baseline `# pass 83`, `# fail 0`.
- Local app: `python3 -m http.server 8766 -d ~/habit-tower`; browser checks with headless Chrome (`--remote-debugging-port=9333`, `--user-data-dir` in the scratchpad) and the scratchpad `cdp.mjs` runner at 360×740. Screenshots go to the scratchpad, never into the repo.
- Supabase project `bmghacmswvmrhfiwddie`; SQL via MCP `apply_migration`/`execute_sql`; functions via `deploy_edge_function`.
- Live actions (migration, function deploy, `git push`) need 도균님's yes right before them.
- Claude never types Google passwords: the Google sign-in itself is 도균님's step.
- Work on branch `feat/accounts-legal`; commit per task.

## File map

| File | Change |
|---|---|
| `supabase/schema.sql` | photo cap in the insert policy, `errors-cleanup` cron |
| `supabase/functions/delete-account/index.ts` (new) | delete photos, error logs, auth user |
| `config.js` | `CONTACT` |
| `cloud.js` | PKCE client, `signIn`, `deleteAccount`, drop `sendCode`/`verify`, clear `?code=` |
| `ui/windows.js` | Google button + consent line, account deletion step, `InfoBox`, `legal()` links |
| `privacy.html`, `terms.html` (new) | legal pages, Korean then English (`#en`) |
| `lang/en.js` | English for the new strings |
| `sw.js` | `CACHE` v17 |

---

### Task 1: Abuse limits in SQL

**Files:** Modify `supabase/schema.sql` (append).

- [ ] **Step 1: Ask 도균님** (live database; nothing user-visible changes).
- [ ] **Step 2: Apply** `apply_migration` name `accounts_abuse_limits`, and append the same SQL to `supabase/schema.sql`:

```sql
-- Stage 2A (2026-09-30): sign-up opens, so one account must not fill the free storage for everyone.
-- A photo upload also needs fewer than 2,000 objects in the uploader's folder (about five years of daily photos).
drop policy "photos insert own" on storage.objects;
create policy "photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select count(*) from storage.objects o
         where o.bucket_id = 'photos' and (storage.foldername(o.name))[1] = (select auth.uid())::text) < 2000);

-- Error logs are kept 90 days (the privacy policy says so).
select cron.schedule('errors-cleanup', '0 3 * * *', $$
  delete from public.client_errors where at < now() - interval '90 days'
$$);
```

- [ ] **Step 3: Check**

```sql
select jobname, schedule from cron.job order by jobname;
select policyname, with_check from pg_policies where tablename = 'objects' and policyname = 'photos insert own';
```

Expected: `errors-cleanup | 0 3 * * *` and `habit-remind | 0 * * * *`; the policy text contains `< 2000`.

- [ ] **Step 4: Commit** `git add supabase/schema.sql && git commit -m "feat(server): photo cap per folder, 90-day error log cleanup"`

---

### Task 2: `delete-account` Edge Function, tested end to end

**Files:** Create `supabase/functions/delete-account/index.ts`.

- [ ] **Step 1: Write the function**

```ts
// Delete the caller's account (stage 2A): their photos, their error logs, then the auth user. Every public table that
// references auth.users does so with on delete cascade, so records, reactions, pulls, pets, battles, maze clears,
// purchases and push subscriptions go with it. Photos go first: Supabase won't delete a user who owns storage objects.
// The JWT is required (verify_jwt on) and decides whose account this is. Called from the browser, so it answers CORS.
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const fail = (error: string, status = 500) => Response.json({ error }, { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) return fail('unauthorized', 401);
  const uid = user.id, bucket = admin.storage.from('photos');
  for (;;) {
    const { data: files, error: e1 } = await bucket.list(uid, { limit: 1000 });
    if (e1) return fail(e1.message);
    if (!files.length) break;
    const { data: gone, error: e2 } = await bucket.remove(files.map((f) => `${uid}/${f.name}`));
    if (e2 || !gone?.length) return fail(e2?.message ?? 'photos not removed'); // a silent refusal would loop forever
  }
  const { error: e3 } = await admin.from('client_errors').delete().eq('user_id', uid); // no foreign key there
  if (e3) return fail(e3.message);
  const { error: e4 } = await admin.auth.admin.deleteUser(uid);
  if (e4) return fail(e4.message);
  return Response.json({ deleted: true }, { headers: cors });
});
```

- [ ] **Step 2: Ask 도균님, then deploy** with `deploy_edge_function`: name `delete-account`, entrypoint `index.ts`, **`verify_jwt: true`**.

- [ ] **Step 3: A test user with a password** (the email provider is still on; sign-up is off, but password sign-in for an existing user works). Generate the password once into a scratchpad file (shell variables don't survive between commands) and never print it in replies: `openssl rand -hex 12 > $SP/pw.txt && chmod 600 $SP/pw.txt` (`SP` = the scratchpad path); read it back with `PW=$(cat $SP/pw.txt)`, and delete the file after Step 5. SQL (`execute_sql`), with `<PW>` the generated value:

```sql
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated',
  'd1@test.invalid', extensions.crypt('<PW>', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1',
  jsonb_build_object('sub', '00000000-0000-0000-0000-0000000000d1', 'email', 'd1@test.invalid'), 'email', now(), now(), now());
insert into public.profiles (id, name) values ('00000000-0000-0000-0000-0000000000d1', 'test');
insert into public.days (user_id, day, shield) values ('00000000-0000-0000-0000-0000000000d1', '2026-09-30', true);
insert into public.client_errors (user_id, message) values ('00000000-0000-0000-0000-0000000000d1', 'test');
```

- [ ] **Step 4: Sign in, upload a photo, delete** (shell; `URL`/`KEY` from `config.js`):

```bash
cd ~/habit-tower
PW=$(cat $SP/pw.txt)
URL=$(node -e "import('./config.js').then(m => console.log(m.SUPABASE_URL))")
KEY=$(node -e "import('./config.js').then(m => console.log(m.SUPABASE_KEY))")
TOKEN=$(curl -s "$URL/auth/v1/token?grant_type=password" -H "apikey: $KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"d1@test.invalid\",\"password\":\"$PW\"}" | node -e "process.stdin.on('data', d => console.log(JSON.parse(d).access_token))")
python3 -c "from PIL import Image; Image.new('RGB', (8, 8), 'red').save('/private/tmp/claude-501/-Users-dk/ed48a2db-8506-4c71-aa18-d6e9fe9b0fcb/scratchpad/t.jpg')"
curl -s -X POST "$URL/storage/v1/object/photos/00000000-0000-0000-0000-0000000000d1/t.jpg" -H "apikey: $KEY" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: image/jpeg' \
  --data-binary @/private/tmp/claude-501/-Users-dk/ed48a2db-8506-4c71-aa18-d6e9fe9b0fcb/scratchpad/t.jpg
curl -s -X POST "$URL/functions/v1/delete-account" -H "apikey: $KEY" -H "Authorization: Bearer $TOKEN"
```

Expected: the upload answers with a `Key`; the function answers `{"deleted":true}`.

- [ ] **Step 5: Nothing left**

```sql
select (select count(*) from auth.users where id = '00000000-0000-0000-0000-0000000000d1') as users,
  (select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000d1') as profiles,
  (select count(*) from public.days where user_id = '00000000-0000-0000-0000-0000000000d1') as days,
  (select count(*) from public.client_errors where user_id = '00000000-0000-0000-0000-0000000000d1') as errors,
  (select count(*) from storage.objects where name like '00000000-0000-0000-0000-0000000000d1/%') as photos;
```

Expected: all `0`. If a step failed, delete the leftovers by hand (storage object via the Storage API with the service role, then `delete from auth.users where id = '…d1'`) and fix before going on.

- [ ] **Step 6: Commit** `git add supabase/functions/delete-account/index.ts && git commit -m "feat(server): delete-account function (photos, error logs, auth user)"`

---

### Task 3: `cloud.js` — Google sign-in and account deletion

**Files:** Modify `config.js`, `cloud.js` (client creation `:88-92`, api `:257-262`, new `deleteAccount` after `signOut`).

- [ ] **Step 1: `config.js`** — add:

```js
export const CONTACT = 'dokyun0813@gmail.com'; // legal pages, settings and store listings
```

- [ ] **Step 2: PKCE client and the returning `?code=`.** Replace the `client` definition with:

```js
  const client = () => (sbP ??= import(SDK).then((m) => {
    // PKCE: Google sends the page back with ?code=, which supabase-js exchanges for a session on start.
    const sb = m.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: 'pkce' } });
    sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') forget(); }); // e.g. refresh token revoked
    if (new URLSearchParams(location.search).has('code')) { // once exchanged, keep the address clean
      sb.auth.getSession().then(() => history.replaceState(history.state, '', location.pathname + location.hash));
    }
    return sb;
  }, (e) => { sbP = null; throw e; }));
```

- [ ] **Step 3: API.** Replace `sendCode` and `verify` with:

```js
    // Google sign-in: the page leaves for Google and comes back to this address; the launch sync picks up the session.
    signIn: call(async () => {
      must(await (await client()).auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }));
    }),
```

After `signOut` add:

```js
    // Account deletion (Edge Function delete-account): the cloud records, photos and the account go; this phone's
    // records stay, so the app goes on alone. The push row goes with the account; this unsubscribes the phone too.
    deleteAccount: call(async () => {
      const sb = await client();
      const { data, error } = await sb.functions.invoke('delete-account');
      if (error || !data?.deleted) throw new Error(tl('계정을 지우지 못했어요'));
      await dropSub(sb).catch(() => {});
      await sb.auth.signOut({ scope: 'local' });
      await forget();
    }),
```

- [ ] **Step 4: Check** `node --check cloud.js config.js` → no output; `grep -n "sendCode\|verifyOtp\|signInWithOtp" *.js ui/*.js` → nothing except the `ui/windows.js` lines Task 4 replaces.

- [ ] **Step 5: Commit** `git add config.js cloud.js && git commit -m "feat(cloud): Google sign-in (PKCE) and account deletion"`

---

### Task 4: Settings — Google button, consent line, account deletion, info box

**Files:** Modify `ui/windows.js` (imports, `CoupleBox`, new `InfoBox` + `legal`, `Setup` renders `InfoBox` after `LangBox`, remove `EMAIL_KEY`/`lastEmail`), `lang/en.js`.

- [ ] **Step 1: Imports and link helper.** Change the i18n import to `import { tl, LANG, langPref, setLang, monthTitle, weekdays } from '../i18n.js';`, add `import { CONTACT } from '../config.js';`, and next to `LangBox`:

```js
// Legal pages next to the app; the English app opens their English half.
const legal = (page) => `${page}.html${LANG === 'en' ? '#en' : ''}`;
const Link = ({ page, children }) => html`<a href=${legal(page)} target="_blank" rel="noopener">${children}</a>`;

// Privacy policy, terms and contact.
function InfoBox() {
  return html`<div class="backup">
    <div class="lbl">${tl('정보')}</div>
    <p class="small"><${Link} page="privacy">${tl('개인정보처리방침')}</${Link}> · <${Link} page="terms">${tl('이용약관')}</${Link}>
      · <a href=${`mailto:${CONTACT}`}>${tl('문의')}</a></p>
  </div>`;
}
```

In `Setup`, after `<${LangBox} />` add `<${InfoBox} />`.

- [ ] **Step 2: `CoupleBox` signed out.** Delete `EMAIL_KEY`, `lastEmail`, the `email` state and the whole `${!cloud.userId && html`<span>… 로그인</button></span>`}` block; put in its place:

```js
    ${!cloud.userId && html`<span><button type="button" class="btn blue sm" disabled=${busy} onClick=${() => act(api.signIn)}>${tl('구글로 로그인')}</button></span>
      <p class="muted small">${tl('로그인하면 이용약관과 개인정보처리방침에 동의하게 돼요')}<br />
        <${Link} page="terms">${tl('이용약관')}</${Link}> · <${Link} page="privacy">${tl('개인정보처리방침')}</${Link}></p>`}
```

(`cloud.email` still shows next to the sign-out button: the sync fills it from the session.)

- [ ] **Step 3: `CoupleBox` account deletion.** Add `const [deleting, setDeleting] = useState(false);` with the other state, and after the `</span>` that closes the sign-out row (inside the signed-in part) add:

```js
      <p>${deleting
        ? html`<span class="small">${tl('계정과 클라우드 기록·사진을 지워요. 이 폰의 기록은 남아요. 되돌릴 수 없어요.')}</span><br />
          <button type="button" class="btn danger sm" disabled=${busy}
            onClick=${() => act(api.deleteAccount, () => { setDeleting(false); setMsg(tl('계정을 지웠어요')); })}>${tl('정말 삭제')}</button>
          <button type="button" class="btn blue sm" onClick=${() => setDeleting(false)}>${tl('취소')}</button>`
        : html`<button type="button" class="btn danger sm" onClick=${() => setDeleting(true)}>${tl('계정 삭제')}</button>`}</p>
```

- [ ] **Step 4: English** — add under `// ui/windows.js` in `lang/en.js`, and remove the entries the check reports as unused (the email/code strings):

```js
  '정보': 'About', '개인정보처리방침': 'Privacy policy', '이용약관': 'Terms', '문의': 'Contact', '구글로 로그인': 'Sign in with Google',
  '로그인하면 이용약관과 개인정보처리방침에 동의하게 돼요': 'By signing in you agree to the Terms and Privacy policy',
  '계정과 클라우드 기록·사진을 지워요. 이 폰의 기록은 남아요. 되돌릴 수 없어요.':
    'This deletes your account and cloud records and photos. Records on this phone stay. This can’t be undone.',
  '계정을 지웠어요': 'Account deleted', '정말 삭제': 'Delete for good', '계정 삭제': 'Delete account',
  '계정을 지우지 못했어요': 'Couldn’t delete the account',
```

- [ ] **Step 5: Check** `npm test 2>&1 | grep -E "^# (pass|fail)|missing|unused"` → `# fail 0`. Headless at 360 px, `?dev&lang=ko` and `?dev&lang=en`: settings shows 정보/About with three links; the couple box (in `?dev` it may be absent; if so, check with the local IndexedDB mode `http://localhost:8766/`) shows the Google button and the consent line.

- [ ] **Step 6: Commit** `git add ui/windows.js lang/en.js && git commit -m "feat(settings): Google sign-in button, account deletion, info box with legal links"`

---

### Task 5: `privacy.html` and `terms.html`

**Files:** Create `privacy.html`, `terms.html`.

- [ ] **Step 1: Page frame** (both pages; title and body differ):

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>해빗 타워 개인정보처리방침 · Habit Tower Privacy Policy</title>
<style>
@font-face { font-family: Galmuri11; src: url(fonts/Galmuri11.woff2) format('woff2'); }
body { margin: 0 auto; max-width: 720px; padding: 16px; font: 14px/1.7 Galmuri11, sans-serif; color: #2b1d14; background: #f5efe0; }
h1 { font-size: 20px; } h2 { font-size: 16px; margin-top: 28px; } table { border-collapse: collapse; width: 100%; font-size: 13px; }
td, th { border: 1px solid #c8b890; padding: 4px 6px; text-align: left; vertical-align: top; } hr { margin: 40px 0; }
</style>
</head>
<body>
<p><a href="#en">English below</a></p>
<!-- Korean sections, then <hr id="en">, then the English sections -->
</body>
</html>
```

- [ ] **Step 2: Privacy policy text**, Korean then the same in English, with these sections and facts (spec "Legal pages"): 처리 목적; 수집 항목 (구글 계정 이메일, 인증 사진, 습관 이름·표시 이름·캐릭터, 커플 연결·우리 탑 이름·보상 문구, 코멘트·반응, 상자·펫·대결·미로·상점·방 기록, 푸시 구독 주소, 시간대·언어, 오류 기록: 메시지·스택·브라우저 정보·페이지 경로·사용자 id; 로그인하지 않으면 아무것도 전송되지 않음); 보유 기간 (계정 삭제 시까지, 오류 기록 90일); 제3자 제공 없음; 처리 위탁·국외 이전 table (Supabase Inc. 미국 — 저장 위치 서울 리전, 데이터베이스·사진 저장 / Google LLC 미국 — 로그인 / GitHub Inc. 미국 — 웹 호스팅·접속 기록 / 브라우저 푸시 서비스(Google·Apple·Mozilla) — 알림 전달; 이전 시기: 서비스 이용 시, 방법: 네트워크 전송); 파기 (즉시 삭제, 서비스 제공자 백업은 순차 삭제); 권리 행사 (앱: 설정 → 초기화·계정 삭제, 메일: dokyun0813@gmail.com); 만 14세 미만 가입 불가; 안전성 확보 조치 (HTTPS, 사용자별 접근 규칙, 비공개 사진 저장소); 개인정보 보호책임자 유도균 · dokyun0813@gmail.com; 권익침해 구제 (개인정보침해신고센터 118, 개인정보분쟁조정위원회 1833-6972, 대검찰청 1301, 경찰청 182); 시행일 2026년 10월 1일. The English half ends with "The Korean version prevails."

- [ ] **Step 3: Terms text**, Korean then English: 서비스 내용 (사진 인증 습관 기록, 커플 공유, 알림, 게임 요소; 무료); 계정 (구글 로그인, 한 사람 한 계정, 만 14세 이상); 이용자 콘텐츠 (사진·글의 권리는 이용자에게, 서비스 제공을 위한 저장·표시와 연결한 상대에게 보여주는 것에 동의); 금지 행위 (타인 사진·불법 콘텐츠, 서비스 방해, 자동화된 대량 이용); 서비스 변경·중단 (무료 서비스로 사전 공지 후 변경·종료 가능); 책임 제한 (있는 그대로 제공, 고의·중과실 외 데이터 손실 책임 제한, 백업 내보내기 권장); 탈퇴 (설정 → 계정 삭제); 준거법·관할 (대한민국 법, 민사소송법상 관할 법원); 문의 dokyun0813@gmail.com; 시행일 2026년 10월 1일.

- [ ] **Step 4: Check** headless at 360 px: both pages render in the pixel font with no horizontal scroll (`document.documentElement.scrollWidth <= 360`), `#en` jumps to the English half. Read both files once more for typos and for any claim the spec doesn't back.

- [ ] **Step 5: Commit** `git add privacy.html terms.html && git commit -m "docs(legal): privacy policy and terms (Korean and English)"`

---

### Task 6: Service worker version

- [ ] `sw.js`: `const CACHE = 'habit-tower-v17';`. `npm test` → `# fail 0`. Commit `chore(sw): v17`.

---

### Task 7: Google and Supabase settings (도균님, guided)

Walk 도균님 through, one screen at a time (menu names may differ slightly in 2026):

- [ ] **Google Cloud console** (`https://console.cloud.google.com/`): new project "Habit Tower" → Google Auth Platform → Branding: app name "Habit Tower", support and developer email dokyun0813@gmail.com → Audience: External, then **Publish app** (testing mode only lets listed testers in) → Clients → Create client: Web application; Authorized redirect URI `https://bmghacmswvmrhfiwddie.supabase.co/auth/v1/callback` → copy the client id and secret into Supabase directly (not into chat).
- [ ] **Supabase dashboard** → Authentication → Sign In / Providers → Google: on, paste id and secret, save. → URL Configuration: Site URL `https://seongmin0522-svg.github.io/habit-tower/`; Redirect URLs `https://seongmin0522-svg.github.io/habit-tower/**`, `http://localhost:8766/**`.
- [ ] **Check headless:** on `http://localhost:8766/`, press 구글로 로그인 and read the address after 2 s: it starts with `https://accounts.google.com/` and carries `client_id=`. (No password is typed.)

---

### Task 8: Deploy

- [ ] Ask 도균님. Then: `git checkout main && git merge --ff-only feat/accounts-legal && npm test && git push`, wait for `gh run list --limit 1` → `completed success`, and `curl` `privacy.html`, `terms.html` → `200`, `sw.js` → `habit-tower-v17`.

---

### Task 9: 도균님 on the phone, then close the email door

- [ ] 도균님 opens the app on the Flip: settings → couple still signed in (existing session). Sign out, then **구글로 로그인** with dokyun0813@gmail.com → the tower, records, couple and the 🛠 admin box are all as before. Check in SQL: `select provider from auth.identities where user_id = '7965ea9f-ead8-46b4-971f-7abf9fabc698'` lists `google` (next to `email`).
- [ ] Then 도균님 in Supabase: Providers → Email **off**; "Allow new users to sign up" **on**; remove the custom SMTP settings. In his Google account: Security → App passwords → revoke the one used for Supabase.
- [ ] If a spare Google account is at hand: sign up with it on the web app, then delete that account with 계정 삭제 and confirm in SQL that nothing is left for its id.

---

### Task 10: Finish

- [ ] `npm test` → `# fail 0`. Update memory (`project_habit_tower.md`): what shipped, the dashboard switches done, the iPhone home-screen sign-in risk still unverified, next = 2B plan.
