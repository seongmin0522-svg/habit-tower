# Store launch roadmap — design

Date: 2026-09-30. Request from 도균님: take the app from its current state to something that can top the App
Store and Play Store. Honest framing agreed in the session: code cannot make an app #1 by itself (store ranking is
driven by recent install velocity, ratings and retention; the exact formula is not public). Code can make the app
listable, make people stay, and make them bring others. The realistic first target is the top of the Korean
Health & Fitness category.

## Decisions (도균님, 2026-09-30)

- **Audience:** anyone. Solo start; couple mode stays as an option (invite a partner later).
- **Market:** Korea and global at the same time → Korean and English from launch.
- **Money:** free for now. Monetization is decided later from retention data; no payment code, no paid loot boxes.
- **Accounts and costs:** nothing paid yet. Prepare everything that works without store accounts; pay the Google
  ($25 once) and Apple ($99 a year) developer fees at launch. Consequence: Google's 14-day closed test (below)
  starts only once the Google account exists, so it is the last long step, not the first.

## What blocks a store launch today (checked in the code, 2026-09-30)

1. **Not a store app.** The app is a PWA on GitHub Pages. Apple rejects apps that are a repackaged website
   (guideline 4.2). Wrap it with Capacitor and use native features: haptics, notifications, camera. Native haptics
   also likely fixes the vibration that works on neither phone today (iPhone web has no vibration API).
2. **Built for two people.** Sign-up is off in Supabase and there is no first-run path for a stranger starting alone.
3. **Account deletion is incomplete.** Settings' reset deletes records, photos and the couple link but leaves the
   `auth.users` row. Apple requires deleting the account itself in the app (guideline 5.1.1(v)).
4. **Sign-in mail.** One-time codes go out through 도균님's personal Gmail SMTP: daily send limits and a personal
   address are not fit for strangers. Needs a dedicated mail sender or social login (if Google login is offered on
   iOS, Sign in with Apple must be offered too, guideline 4.8).
5. **Free server limits.** Supabase free: 1 GB storage, 5 GB egress a month, 500 MB database, pause after 7 idle
   days. At ~150 KB a photo (estimate) that is roughly 200 users for a month. Pro is $25 a month; decide at launch.
6. **Google Play rule for new personal accounts:** 12 testers opted in for 14 continuous days in a closed test before
   production access (engagement is also checked, per 2026 reports). 도균님 gathers the testers.
7. **Legal pages.** A privacy policy and terms (photos and emails are collected): required by both stores and by
   Korea's Personal Information Protection Act.
8. **Look-alike risk (estimate).** The first monsters (green/blue/red snails, mushroom, slime, stump, pig, king
   slime) and the warrior/thief characters mirror MapleStory's early game. The art is original, but a copycat report
   (guideline 4.1) is possible. The 32×32 redraw is the cheap moment to give the game its own world.
9. **Paid loot boxes need published odds** (Korean Game Industry Act, in force since March 2024; Apple 3.1.1). Boxes
   are free today, so nothing to do until monetization.
10. **Korean only, Korea time only.** About 1,500 Korean words are written straight into the screens, and KST is
    hard-wired on 28 lines: day keys, the 9 pm reminder cron, the partner-notify trigger, the sky, sleep hours.

## Product opinions carried into the stages

- **Too much at once for a newcomer:** tower, photos, couple, boxes, 100 monsters, pet, playroom, battle, maze, shop,
  decorating. Day one shows only "one photo = one brick"; the rest unlocks floor by floor. Nothing is removed.
- **Collapse after one missed day** is dramatic but a likely reason to quit for a general audience: new users get
  extra shields in their first two weeks (exact rule in the first-run stage).
- **Our edge:** couple + pet + photo proof. Precedent: Finch (a pet that grows with self-care) is a popular global app.
- **Growth hooks:** a partner invite link (every couple install brings a second install), a share card of a finished
  tower for Instagram stories (the collage exists), a home-screen widget.

## Stages

Each stage gets its own design → plan → build → phone check. Monetization is not a stage yet.

1. **Global groundwork.** A translation layer (`t()` with Korean and English dictionaries) and every existing
   string moved into it; each user's own time zone instead of KST (day keys, reminders at 9 pm local time via an
   hourly cron, the partner trigger, the sky and sleep hours). First, because every later stage writes new strings
   and date logic, so they are built on it rather than redone. Couples in different time zones are settled here.
2. **Launch groundwork.** Capacitor projects for Android and iOS (buildable and installable on 도균님's own phones
   without paid accounts), native haptics and camera, open sign-up with abuse limits, the sign-in mail question,
   solo first-run flow, full account deletion, privacy policy and terms pages (Korean and English).
3. **Art and brand.** The pixel art overhaul (`2026-09-29-pixel-art-overhaul-design.md`: battle → decorating →
   dungeon → UI) plus an original monster and character world in place of the MapleStory look-alikes, app icon and
   store screenshots.
4. **First run.** Floor-by-floor unlocking, a short tutorial, gentler collapse for new users.
5. **Growth.** Partner invite link, share cards, home-screen widget, native push (FCM/APNs) replacing web push in
   the store builds.
6. **Launch.** Pay the developer fees, Google closed test (12 testers × 14 days), TestFlight, store listings in
   Korean and English, server plan decision.

## Out of scope for now

Payments and ads, friend groups larger than a couple, languages beyond Korean and English.
