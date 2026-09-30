# Stage 2A: Google sign-in, open sign-up, account deletion, legal pages — design

Date: 2026-09-30. Stage 2 of `2026-09-30-store-launch-roadmap-design.md` is split in two:

- **2A (this spec):** accounts and legal pages. Works in today's web app, no tools to install.
- **2B (next):** the native shell (Capacitor): vendored libraries instead of CDN imports, native haptics, share
  sheet for backup and collage files, Android back button, app ID. Android Studio and Java get installed then.

"A stranger starts alone" already works: without signing in, the first run asks for a habit and a character and
everything stays on the phone. Making that first run better is stage 4.

## Decisions (도균님, 2026-09-30)

- Google sign-in replaces the email code.
- Contact email in the legal pages and store listings: dokyun0813@gmail.com.
- Account deletion is its own button, separate from reset.
- Android Studio and Java are installed when 2B starts.

## Why

- Sign-in codes are mailed through 도균님's personal Gmail (SMTP app password). With sign-up open, anyone could make
  the app send mail to any address from that account, and Gmail may suspend it. Google sign-in sends no mail.
- Apple guideline 5.1.1(v): an app with accounts must let people delete the account itself in the app. Today's reset
  deletes records and photos but leaves the `auth.users` row.
- Both stores and Korea's Personal Information Protection Act need a privacy policy.

## Google sign-in

- **Screen:** in settings → couple, the signed-out part becomes one button, `구글로 로그인`, with a line under it:
  "로그인하면 이용약관과 개인정보처리방침에 동의하게 돼요" (both linked). The email and code inputs and the
  remembered-email key go away.
- **Code:** `cloud.js` `signIn()` calls `signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin +
  location.pathname } })`; the page goes to Google and comes back. The client uses the PKCE flow (a `?code=` comes back;
  the matching secret waits in localStorage), the same flow the native app will use. On return, the launch sync
  creates the client, supabase-js exchanges the code, and the sync goes on as a signed-in one. The `?code=` is then
  removed from the address bar. `sendCode` and `verify` are deleted.
- **Existing accounts:** both are Gmail addresses. Supabase attaches a Google identity to the existing user with the
  same verified email, so user ids, records, the couple and `ADMIN_IDS` all stay.
- **Supabase and Google settings (도균님 in the dashboards, guided step by step):**
  - Google Cloud: an OAuth client (web application) with the redirect URI
    `https://bmghacmswvmrhfiwddie.supabase.co/auth/v1/callback`; the consent screen named "Habit Tower" with the basic
    scopes only (email, profile).
  - Supabase: Google provider on with that client id and secret; Site URL
    `https://seongmin0522-svg.github.io/habit-tower/`; redirect allow list adds `http://localhost:8766/`,
    `http://127.0.0.1:8766/`, `http://[::1]:8766/` for local testing; Email provider off; "Allow new users to sign up" on.
  - Afterwards: remove the Gmail SMTP settings from Supabase and revoke the Gmail app password.
- **Risk [unverified]:** on an iPhone home-screen app, the Google page may finish in Safari instead of the app, so the
  sign-in lands in Safari's storage. The current iPhone user is already signed in and is not affected. Android and
  desktop are checked in this stage; the native app (2B) signs in through an in-app browser and a deep link.

## Abuse limits

- No sign-in mail exists any more.
- Photos: the storage insert policy also requires fewer than 2,000 objects in the user's own folder (about five years
  of daily photos), so one account can't fill the free 1 GB for everyone. The bucket's file size limit stays.
- Error logs: a daily pg_cron job `errors-cleanup` (03:00 UTC) deletes `client_errors` rows older than 90 days, the
  period the privacy policy states.
- Supabase's built-in sign-in rate limits stay at their defaults.

## Account deletion

- **Edge Function `delete-account`** (JWT required). It reads the caller from the JWT, then with the service role:
  1. removes every object under `photos/<uid>/` (list and remove until empty; a remove that deletes nothing stops
     with an error, as the reset already guards). Supabase refuses to delete a user who still owns storage objects;
  2. deletes the caller's `client_errors` rows (they have no foreign key);
  3. deletes the user with `auth.admin.deleteUser`. Every table that references `auth.users` does so with
     `on delete cascade` (checked: 11 references), so profiles, days, reactions, push subscriptions, pulls, pets,
     battles, maze clears and purchases go with it. The couple row stays; the partner's app already shows
     "상대와 연결이 끊겼어요" for a couple with one member.
  Returns `{ deleted: true }`.
- **Screen:** settings → couple, signed in, at the bottom: `계정 삭제` → a second step with `정말 삭제` / `취소` and
  "계정과 클라우드 기록·사진을 지워요. 이 폰의 기록은 남아요. 되돌릴 수 없어요." Then `api.deleteAccount()` calls the
  function and forgets the cloud state on this phone, like the end of a reset, without touching the phone's records.
  Offline or failing: an error message, nothing changes.
- **Reset** stays as it is (this phone's records, plus cloud records and photos when signed in; the account stays).

## Legal pages

- `privacy.html` and `terms.html` at the site root (served by Pages next to the app), static HTML in the app's pixel
  font, Korean first and English below under `#en`. No script. Linked from a new settings box "정보"
  (개인정보처리방침 · 이용약관 · 문의 dokyun0813@gmail.com) and from the sign-in line; the English app links to `#en`.
- **Privacy policy** (the items Korea's PIPA expects):
  1. purposes: sign-in, cloud backup and sync, couple sharing, reminders and partner pushes, fixing errors;
  2. items: Google account email; photos; habit title, display name, character; couple link, tower name, reward
     text; notes and reactions; boxes, pets, battles, maze, shop and room records; push subscription address; time
     zone and language; error logs (message, stack, browser, page path, user id). Without signing in nothing leaves
     the phone;
  3. retention: until the account is deleted; error logs 90 days;
  4. no provision to third parties (the partner sees what the couple feature shares, by the user's own linking);
  5. processors and transfer abroad: Supabase Inc. (USA; data stored in the Seoul region), Google LLC (sign-in),
     GitHub Inc. (hosting, access logs), the browser's push service (Google, Apple or Mozilla), with items, purpose,
     timing and method;
  6. destruction: deleted from the database and storage at once; from providers' system backups in turn;
  7. rights: access, correction, deletion, suspension — in the app (reset, account deletion) or by email;
  8. under 14: not allowed to sign up;
  9. safeguards: HTTPS, per-user row access rules, private photo storage;
  10. privacy officer: 유도균, dokyun0813@gmail.com;
  11. where to get help: the standard Korean bodies (개인정보침해신고센터 118, 개인정보분쟁조정위원회 1833-6972,
      대검찰청 1301, 경찰청 182);
  12. effective date.
- **Terms:** the service, accounts, users own their photos (the app stores and shows them to the linked partner only
  to provide the service), prohibited use, free service offered as is, limits of liability, changes and ending of the
  service, leaving (account deletion), Korean law and courts, contact.
- Drafted by Claude; not legal advice. Review before the store launch.

## Strings

All new text goes through `tl` with English in `lang/en.js`; the i18n check test covers it.

## Testing

- **Deletion, end to end, before the email provider is switched off:** create a test user in SQL with a password
  (sign-up is off, but password sign-in for an existing user works), sign in through the Auth API, upload a small
  photo with that token, call `delete-account`, then check that `auth.users`, every public table and
  `storage.objects` have nothing left for that id. Clean up by hand if a step fails.
- **Photo cap:** the test user's upload succeeds with the new policy in place (the cap itself is reviewed in the SQL,
  not filled to 2,000).
- **Cleanup job:** `cron.job` lists `errors-cleanup`.
- **Google sign-in:** the button reaches Google's page with the right client (checked headless). The sign-in itself is
  done by 도균님 on the phone after deploy (Claude does not enter Google passwords): his records, couple and admin
  switch must be unchanged. A new account is tried if a spare Google account is at hand.
- **Legal pages:** both pages at 360 px, Korean and English.
