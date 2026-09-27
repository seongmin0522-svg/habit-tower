# Half brick, tap-to-open boxes, partner push — design

Date: 2026-09-27. Three changes, built and committed in this order, pushed once at the end.

## 1. Couple tab: half brick

Problem: certifying on the couple tab when my partner hasn't yet jumps to the "나" tab (`app.js` onPhoto `setTab(...)`). It feels like the brick went to the wrong place.

- No automatic tab switch after certifying. The app stays on the tab where the button was pressed.
- `logic.js` `halfBrick(mine, theirs, today)` returns `{ side: 'l' | 'r', assetId }` when exactly one of us has a photo for today, otherwise `null`. `l` = mine (my photo is on the left of couple bricks), `r` = partner's.
- Shield days are not photos: a shield on one side and nothing on the other gives `null`.
- The couple `Scene` draws the half brick on top of the tower: one photo half, the other half a dashed outline with "?". It is not in `keys`, so floor count, collapse and completion are unchanged.
- When I certify first on the couple tab, the half brick uses the existing stack animation.
- Tests: `halfBrick` cases in `logic.test.mjs` (mine only, theirs only, both, neither, shield only, photo from another day).

## 2. Box reveal: tap count by tier

Taps to open: common 2, rare 5, epic 20, legend 30 (`TIERS[].taps` in `catalog.js`).

- The roll (`onOpen(box)`) moves to the first tap. It is saved then, so closing the window mid-way still keeps the item. The close button hides once tapping starts.
- Every tap: squash-and-bounce, short vibration, `shake` sound, cracks on the chest grow.
- Tier-up moments: a box that survives tap 2 glows blue (rare), survives tap 5 glows purple (epic), survives tap 20 glows gold (legend). Each tier-up gets a white flash, a stronger vibration and a sound. The number of taps left stays hidden. The suspense comes from the glow changing color.
- Final tap: white flash, screen shake, rotating light rays behind the chest, flying pieces. The effects scale with tier. Then the existing prize card appears. Shiny keeps its sparkle.
- The chest is a 16px pixel sprite drawn like `ui/sprites.js` characters (closed and open frames), not the 🎁 emoji, which looks different on Galaxy and iPhone.
- Vibration: `navigator.vibrate` patterns per event and tier (Android). iPhone Safari has no Vibration API. Try the iOS 18 `<input type="checkbox" switch>` haptic trick: one tick per event, no patterns, unverified until tested on a real iPhone.
- Settings sound section gets a vibration on/off toggle (`vibe` in `sound.js` prefs, default on).
- `prefers-reduced-motion`: no screen shake and a softer flash.
- Sounds: existing files only.

## 3. Partner push

When my partner's photo for today lands in `days`, my phone gets a push.

- Trigger `after insert on public.days` when `photo_path is not null` and `day` = today in KST. It calls `net.http_post` to the `remind` function with `x-cron-secret` from Vault and body `{ "partner_of": "<user id>" }`.
- Insert only: a retake is an update, so each person causes at most one partner push per day. Shield days (no photo) and late uploads of past days (offline) send nothing.
- `remind` gets a new branch for `partner_of`. It finds the partner through `profiles.couple_id`, loads the partner's `push_subs`, and picks the message by whether the partner already has a `days` row for today:
  - not yet: title "🧱 {name} 오늘 인증 완료", body "나도 쌓으러 가기 👉"
  - already: title "💞 커플 벽돌 완성!", body "우리 탑이 한 층 올라갔어요"
  - `{name}` = the certifier's `profiles.name`.
- The payload carries a `tag` ('remind' or 'partner'). `sw.js` uses it so a partner push doesn't replace the 9pm one. Bump the service worker cache version.
- One switch: the existing 9pm push toggle also covers partner pushes.
- Gone subscriptions (404/410) are deleted as they are today.
- Testing: signups are off, so there are no test accounts from email.
  - Trigger path: create two test users in SQL (`auth.users` + `profiles` in their own test couple). Give one a `push_subs` row with a fake https endpoint. Insert a today row for the other. The function answers `{ failed: 1 }` in `net._http_response`, which proves the trigger, partner lookup and message choice ran. Delete the test users after.
  - Delivery: a direct call with DK's real endpoint, after asking DK, to see the notification on the phone.
  - Real use: the first time Tabi certifies.

## Not doing

- Separate toggles for 9pm and partner pushes.
- Pushes for comments and reactions.
- New sound files.
