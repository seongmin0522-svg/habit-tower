# Stage 1: global groundwork (translation layer, each user's own time zone) — design

Date: 2026-09-30. Stage 1 of `2026-09-30-store-launch-roadmap-design.md`. Korean and English from launch, users
anywhere. Everything later stages build writes strings and date logic on top of this.

## Decisions (도균님, 2026-09-30)

- Translation approach A: the Korean sentence in the code is the key (like a subtitle file). No key names, no library.
- Monster and character names get English in stage 3, when the world is redesigned (the MapleStory look-alikes are
  renamed there anyway). Until then the English screens show their Korean names. Every other name is translated now.

## Translation layer

**`i18n.js`** (new, no dependencies):

- `t` works as a tagged template and as a plain call:
  - ``t`앗! 야생 ${name}이(가) 튀어나왔다!` `` looks up the key `앗! 야생 {0}이(가) 튀어나왔다!` and fills `{0}`,
    `{1}`… from the values in order. English may reorder them (`{1}'s {0}`).
  - `t('사과')` for names and other plain strings (catalog names are looked up where they are shown: `t(m.name)`).
  - An English value is a string, or a function of the values when English needs a plural
    (``'{0}층': (n) => (n === 1 ? '1 floor' : `${n} floors`)``). No plural-rules machinery.
  - A missing English entry falls back to the Korean text: nothing breaks, it just shows Korean.
- Language: the `lang` pref next to the sound prefs (`'auto'` default, `'ko'`, `'en'`). Auto = Korean when the phone's
  language starts with `ko`, English otherwise. `?lang=en` overrides it for testing. Read once at startup, so
  module-level strings (`LEVELS`, `STAT`…) translate too; changing the language in settings reloads the app.
- Dates: month titles and weekday headers from `Intl.DateTimeFormat(lang)` instead of the hard-coded
  `['일', '월', …]` in `ui/windows.js`.

**`lang/en.js`**: the dictionary, Korean key → English. Written by Claude, skimmed by 도균님. Tone matches the
Korean: short, warm, playful.

**What goes through `t`:** every Korean string a user can see — screens, toasts, errors thrown to the UI (`db.js`,
`cloud.js`), `aria-label`s, the collage text drawn on canvas, catalog names (tiers, food, elements and skills,
furniture, buildings, themes, accessories, titles, skins other than characters). Not now: monster and character
names (stage 3), `index.html` title and the web manifest name (native app names are stage 2), the sign-in mail
(stage 2).

**Check (`i18n.test.mjs`, runs with `npm test`):** scans `*.js` and `ui/*.js` for `t` keys and fails when
- a key has no English entry, or an English entry is used nowhere (neither a `t` key in the code nor a name in a
  translated catalog list — those are looked up at run time, so the scan can't see them);
- an English entry's `{n}` placeholders don't match its key's;
- a translated catalog list (above) has a name with no English entry.

## Each user's own time zone

**Phone:**

- `todayKST()` becomes `today(now, tz)`: the phone's own time zone unless `tz` is given (tests pass
  `'Asia/Seoul'`). `hourKST()` becomes the phone's local hour. Callers change name only (`app.js`, `db.js`).
- So the day key, the daily playroom limits (`play/<day>`), the daily maze (same maze for the same local date),
  battle counting, the sky and the pet's sleep hours (23:00–05:59) all follow the phone's clock.
- Coming back to the app already re-checks the date (`visibilitychange`), so travelling just works from the next look.

**Server:**

- `profiles.tz text not null default 'Asia/Seoul'` (IANA name, from `Intl.DateTimeFormat().resolvedOptions()`) and
  `profiles.lang text not null default 'ko' check (lang in ('ko', 'en'))`, sent with the existing profile upsert.
  Column grants for both (profiles writes are granted per column).
- A before insert/update trigger on `profiles` resets an unknown `tz` to `'Asia/Seoul'`. Without it one bad value
  would make the reminder query fail for everyone.
- 9 pm reminder: the cron runs every hour (`0 * * * *`) instead of once at 12:00 UTC. `remind_targets(at timestamptz default now())` returns
  the subscriptions of people whose local hour is 21 and who have no `days` row for their local today. (Half-hour zones
  get it at 21:30; fine.)
- Partner push trigger: "today" is the uploader's local today. It passes `day` to the remind function, which says
  "couple brick done" when the partner also has that day, and writes the message in the partner's `lang`.
- The remind function keeps its messages per language (Korean and English).
- Existing rows: both current users are in Korea, the defaults are Seoul and Korean, so nothing changes for them.

**Couples in two time zones:**

- The couple's today is the earlier of the two local todays: `coupleToday = min(my today, my partner's today)`,
  with the partner's `tz` from their profile row (Seoul if missing).
- The couple tower, its collapse and its half brick are judged with `coupleToday`. Example: at 01:00 in
  Seoul my partner in LA is still on the previous morning and can still certify it, so that day is not missed yet.

**Travel:** flying through a whole local date can break a tower. That is rare and the monthly shield covers it; no
special rule.

## Build order (one plan)

1. Time zones on the phone (`today`, local hour, `coupleToday`) with tests.
2. Server: `tz`/`lang` columns, trigger, hourly cron, `remind_targets()`, partner trigger, remind function messages.
3. `i18n.js`, `lang/en.js`, the check test, the language setting.
4. Strings moved into `t` screen by screen (windows, bag, playroom, battle, maze, room, app, db/cloud errors, collage,
   catalog names).
5. Browser check at phone width in both languages (`?dev&lang=en`): English is longer, so buttons at 360 px are the
   main risk.

## Testing

- Existing tests pass with `tz` given explicitly. New: `today` with other zones, `coupleToday` across the date line,
  the i18n check above.
- Server: SQL checks in a rolled-back transaction as before — `remind_targets(at)` with users in two zones at a fixed
  time, the tz trigger with a bad name, the partner trigger with a past day.
