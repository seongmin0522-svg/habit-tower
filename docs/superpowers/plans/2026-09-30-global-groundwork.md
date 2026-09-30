# Stage 1 Global Groundwork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Korean and English in every screen, and each user's own time zone (phone and server) instead of hard-wired KST.

**Architecture:** `i18n.js` exports `tl`, a tagged-template/plain-call translator whose keys are the Korean text in the code; `lang/en.js` holds the English. `localDay`/`localHour` replace `todayKST`/`hourKST`; couples use the earlier of their two local days. The server stores `profiles.tz`/`lang`, reminds hourly at 21:00 local time, and writes pushes in each person's language.

**Tech Stack:** plain ES modules + Preact/htm (no build), `Intl`, `node --test`, Supabase (Postgres, pg_cron, pg_net, Edge Function in Deno).

Spec: `docs/superpowers/specs/2026-09-30-global-groundwork-design.md`.

---

## Ground rules for this repo

- Run tests: `cd ~/habit-tower && npm test` (= `node --test`). Baseline before this plan: `# pass 77`, `# fail 0`.
- Local app: `python3 -m http.server 8766 -d ~/habit-tower`, open `http://localhost:8766/?dev` (in-memory data, `&seed=30|fall|album` fake records). Python's server lets Chrome cache old JS: after edits run `fetch(f, {cache: 'reload'})` for changed files in the console or hard-reload.
- Supabase project ref: `bmghacmswvmrhfiwddie`. SQL via the Supabase MCP (`execute_sql`, `apply_migration`), Edge Functions via `deploy_edge_function` (the `remind` function has `verify_jwt: false`).
- New files must also go into `SHELL` in `sw.js`, and `CACHE` gets a new version.
- Commit after each task. **Do not `git push`** until the last task, and only after 도균님 says yes (push = live deploy).
- zsh: `grep --include=*.js` fails with "no matches found"; list files instead (`grep -n x *.js ui/*.js`).

## File map

| File | Change |
|---|---|
| `logic.js` | `localDay(now, tz)`, `coupleToday(mine, theirs)` replace `todayKST` |
| `pet.js` | `localHour(now, tz)` replaces `hourKST`; `isNight(now, tz)` |
| `shop.js` | `skyAt(now, tz)` on `localHour` |
| `i18n.js` (new) | `LANG`, `langPref`, `setLang`, `translate`, `tl`, `monthTitle`, `weekdays` |
| `lang/en.js` (new) | `EN` dictionary |
| `i18n.test.mjs` (new) | translator tests + the key check over the code |
| `app.js` | `localDay`, partner/couple days, `<html lang>`, strings |
| `cloud.js` | sends `tz`/`lang`, reads partner `tz`, strings |
| `supabase/schema.sql`, `supabase/functions/remind/index.ts` | tz/lang columns, guard trigger, hourly reminders, partner push `day`, messages per language |
| `ui/*.js`, `catalog.js`, `sound.js`, `db.js`, `localdb.js`, `image.js`, `collage.js` | strings through `tl` |
| `sw.js` | `CACHE` v16, SHELL + `i18n.js`, `lang/en.js` |

---

### Task 1: Phone time zones (`localDay`, `localHour`, `coupleToday`)

**Files:**
- Modify: `logic.js:1-10`, `pet.js:66,84-90`, `shop.js:4,41-44`, `db.js` (import + 7 uses), `app.js:2,35,62`, `ui/maze.js:27` (comment)
- Test: `logic.test.mjs:3,12-15`, `pet.test.mjs:4,94-99`, `shop.test.mjs:43-44`

- [ ] **Step 1: Change the tests first**

In `logic.test.mjs` line 3, replace `todayKST` in the import list with `localDay, coupleToday`. Replace the test at lines 12-15 with:

```js
test('localDay: the given zone, else the phone', () => {
  assert.equal(localDay(new Date('2026-09-23T14:59:00Z'), 'Asia/Seoul'), '2026-09-23');
  assert.equal(localDay(new Date('2026-09-23T15:00:00Z'), 'Asia/Seoul'), '2026-09-24');
  assert.equal(localDay(new Date('2026-09-24T06:59:00Z'), 'America/Los_Angeles'), '2026-09-23');
  assert.equal(localDay(new Date('2026-09-24T07:00:00Z'), 'America/Los_Angeles'), '2026-09-24');
  assert.equal(localDay(new Date('2026-09-23T15:00:00Z'), 'Not/AZone'), '2026-09-24'); // unknown name: Seoul
  assert.equal(localDay(new Date(2026, 8, 23, 12)), '2026-09-23'); // the phone's own noon
});

test('coupleToday: the earlier of our two local days', () => {
  assert.equal(coupleToday('2026-09-24', '2026-09-23'), '2026-09-23');
  assert.equal(coupleToday('2026-09-23', '2026-09-24'), '2026-09-23');
  assert.equal(coupleToday('2026-09-24', null), '2026-09-24');
});
```

In `pet.test.mjs` line 4, add `localHour` to the import list. Replace the `isNight` test (lines 94-99) with:

```js
test('isNight: 23:00–05:59 local time', () => {
  assert.equal(isNight(new Date('2026-09-29T14:00:00Z'), 'Asia/Seoul'), true);  // 23:00
  assert.equal(isNight(new Date('2026-09-29T20:59:00Z'), 'Asia/Seoul'), true);  // 05:59
  assert.equal(isNight(new Date('2026-09-29T21:00:00Z'), 'Asia/Seoul'), false); // 06:00
  assert.equal(isNight(new Date('2026-09-29T13:59:00Z'), 'Asia/Seoul'), false); // 22:59
});

test('localHour: the given zone, else the phone', () => {
  assert.equal(localHour(new Date('2026-09-29T14:00:00Z'), 'Asia/Seoul'), 23);
  assert.equal(localHour(new Date('2026-09-29T15:30:00Z'), 'Asia/Seoul'), 0);
  assert.equal(localHour(new Date('2026-09-29T14:00:00Z'), 'America/Los_Angeles'), 7);
  assert.equal(localHour(new Date(2026, 8, 29, 5, 10)), 5);
});
```

In `shop.test.mjs` line 44, give `skyAt` the zone:

```js
  const at = (h) => skyAt(new Date(Date.UTC(2026, 8, 29, (h - 9 + 24) % 24)), 'Asia/Seoul');
```

- [ ] **Step 2: Run the tests, see them fail**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)|SyntaxError"`
Expected: a `SyntaxError: The requested module './logic.js' does not provide an export named 'coupleToday'` (or `localDay`) and failures.

- [ ] **Step 3: Implement**

`logic.js` — replace lines 1-10 (the header comment, the imports stay as they are, `kstFormat`, `todayKST`) with:

```js
// Pure logic for Habit Tower. No DOM, no db — everything here is unit-tested.
// Day keys are 'YYYY-MM-DD' strings in the phone's own time zone. A day counts when it has a photo.
import { TIERS, SHINY_RATE, DUPS_PER_BONUS, STARTER, ITEMS, MONSTERS, SKINS } from './catalog.js';
import { levelOf, heartsOf, STAR_FULL } from './pet.js';

// One formatter per zone. An unknown zone name (my partner's phone may know zones mine doesn't) counts as Seoul.
const dayFormats = new Map();
function dayFormat(tz) {
  if (!dayFormats.has(tz)) {
    let f;
    try { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }); }
    catch { f = dayFormat('Asia/Seoul'); }
    dayFormats.set(tz, f);
  }
  return dayFormats.get(tz);
}
// Today's key in tz, or in the phone's own zone when tz is left out.
export const localDay = (now = new Date(), tz = undefined) => dayFormat(tz).format(now);
// A couple's today: the earlier of our two local days, so a day isn't over until it is over for both of us.
export const coupleToday = (mine, theirs) => (theirs && theirs < mine ? theirs : mine);
```

`pet.js` line 66 comment: `reset at KST midnight` → `reset at local midnight`. Replace lines 84-90 (`hourKST` and `isNight`) with:

```js
// The hour (0–23) in tz, or on the phone's clock when tz is left out.
export const localHour = (now = new Date(), tz = undefined) => (tz === undefined ? now.getHours()
  : Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now)));

// 23:00–05:59 local time: the pet sleeps.
export function isNight(now = new Date(), tz = undefined) {
  const h = localHour(now, tz);
  return h >= 23 || h < 6;
}
```

`shop.js` line 4: `import { heartsOf, levelOf, localHour } from './pet.js';`. Replace lines 41-43 with:

```js
// The playroom sky follows the phone's local hour.
export function skyAt(now = new Date(), tz = undefined) {
  const h = localHour(now, tz);
```

`db.js` and `app.js` (only a rename; `app.js` gets its partner logic in Task 3):

```bash
cd ~/habit-tower && sed -i '' 's/todayKST/localDay/g' db.js app.js
```

`ui/maze.js` line 27 comment: `day: today (KST)` → `day: today (local)`.

- [ ] **Step 4: Run the tests, see them pass**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)"` and `grep -n "todayKST\|hourKST\|KST" *.js ui/*.js *.mjs`
Expected: `# fail 0`; the grep prints nothing.

- [ ] **Step 5: Commit**

```bash
git add logic.js pet.js shop.js db.js app.js ui/maze.js logic.test.mjs pet.test.mjs shop.test.mjs
git commit -m "feat(time): days and hours follow the phone's time zone (localDay, localHour, coupleToday)"
```

---

### Task 2: Translation core (`i18n.js`, `lang/en.js`, the check test)

**Files:**
- Create: `i18n.js`, `lang/en.js`, `i18n.test.mjs`
- Modify: `sw.js:8,11-16`, `app.js` (imports + one line)

- [ ] **Step 1: Write the test**

Create `i18n.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { translate, monthTitle, weekdays, LANG } from './i18n.js';
import { EN } from './lang/en.js';

test('translate: Korean key, English lookup, values in order, function values, fallback', () => {
  const dict = { '{0}의 {1}!': '{1} of {0}!', '{0}층': (n) => (n === 1 ? '1 floor' : `${n} floors`), '사과': 'Apple' };
  const tag = (s, ...v) => translate(dict, s, v);
  assert.equal(tag`${'나'}의 ${'공격'}!`, '공격 of 나!');
  assert.equal(tag`${1}층`, '1 floor');
  assert.equal(tag`${3}층`, '3 floors');
  assert.equal(translate(dict, '사과', []), 'Apple');
  assert.equal(translate(dict, '없는 말', []), '없는 말');
  assert.equal(translate(null, ['', '층'], [5]), '5층'); // Korean: the template as written
});

test('LANG is Korean under Node, so pure-module tests keep seeing Korean', () => assert.equal(LANG, 'ko'));

test('calendar labels', () => {
  assert.equal(monthTitle('2026-09', 'ko'), '2026년 9월');
  assert.equal(monthTitle('2026-09', 'en'), 'September 2026');
  assert.deepEqual(weekdays('ko'), ['일', '월', '화', '수', '목', '금', '토']);
  assert.deepEqual(weekdays('en'), ['S', 'M', 'T', 'W', 'T', 'F', 'S']);
});

// Every tl key in the code, built like the runtime does: each ${…} becomes {0}, {1}… in order.
function codeKeys() {
  const files = [...readdirSync('.').filter((f) => f.endsWith('.js') && f !== 'i18n.js'),
    ...readdirSync('ui').filter((f) => f.endsWith('.js')).map((f) => `ui/${f}`)];
  const keys = new Map(); // key -> the first file using it
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const [, body] of src.matchAll(/\btl`([^`]*)`/g)) {
      let i = 0;
      const k = body.replace(/\$\{[^}]*\}/g, () => `{${i++}}`);
      if (!keys.has(k)) keys.set(k, f);
    }
    for (const [, s] of src.matchAll(/\btl\('([^'\\]*)'\)/g)) if (!keys.has(s)) keys.set(s, f);
  }
  return keys;
}
const holes = (s) => (s.match(/\{\d+\}/g) ?? []).sort().join();

test('every tl key has English, every English entry is used, placeholders match', () => {
  const keys = codeKeys();
  assert.deepEqual([...keys].filter(([k]) => !(k in EN)).map(([k, f]) => `${f}: ${k}`), [], 'missing English');
  assert.deepEqual(Object.keys(EN).filter((k) => !keys.has(k)), [], 'unused English');
  assert.deepEqual(Object.entries(EN).filter(([k, v]) => typeof v === 'string' && holes(k) !== holes(v)).map(([k]) => k), [],
    'placeholders differ');
});
```

- [ ] **Step 2: Run it, see it fail**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)|Cannot find module"`
Expected: `Cannot find module '.../i18n.js'`.

- [ ] **Step 3: Implement**

Create `i18n.js`:

```js
// Translation (spec: docs/superpowers/specs/2026-09-30-global-groundwork-design.md). The Korean text in the code is
// the key and lang/en.js maps it to English: tl`…${x}…` looks up '…{0}…' and fills the values in order, tl('…')
// looks up a plain string, and with no entry the Korean shows. For the check in i18n.test.mjs: inside tl`…` use only
// simple ${expressions} (no braces, no backticks), and tl('…') takes one single-quoted literal.
import { EN } from './lang/en.js';

const KEY = 'habit-tower-lang';
const PREFS = ['auto', 'ko', 'en'];

// 'auto' | 'ko' | 'en', as saved in settings.
export function langPref() {
  try { const p = localStorage.getItem(KEY); return PREFS.includes(p) ? p : 'auto'; } catch { return 'auto'; }
}
// This launch's language: ?lang= (testing), else the saved pref, else the phone's language. Node (tests): Korean.
export const LANG = (() => {
  if (typeof location === 'undefined') return 'ko';
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'ko' || q === 'en') return q;
  const p = langPref();
  if (p !== 'auto') return p;
  return /^ko\b/i.test(navigator.language ?? '') ? 'ko' : 'en';
})();
// Settings: save, then reload so strings built at startup switch too.
export function setLang(pref) {
  try { if (pref === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref); } catch { /* private mode */ }
  location.reload();
}

// strings: a template's string parts, or one plain string. A function entry gets the values (English plurals).
export function translate(dict, strings, vals) {
  const key = typeof strings === 'string' ? strings : strings.reduce((a, s, i) => `${a}{${i - 1}}${s}`);
  const v = dict?.[key];
  if (typeof v === 'function') return v(...vals);
  return (v ?? key).replace(/\{(\d+)\}/g, (m, i) => (i < vals.length ? String(vals[i]) : m));
}
export const tl = (strings, ...vals) => translate(LANG === 'en' ? EN : null, strings, vals);

// Calendar labels. ym: 'YYYY-MM'. Weekdays start on Sunday (2023-01-01 was one).
export const monthTitle = (ym, lang = LANG) =>
  new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));
export const weekdays = (lang = LANG) => Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat(lang, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + i))));
```

Create `lang/en.js`:

```js
// English for the Korean keys in the code (see i18n.js). A key is the Korean text exactly as written, with each ${…}
// as {0}, {1}… in order. A function value gets those values (plurals). i18n.test.mjs fails on a missing or unused entry.
// Grouped by the file that first uses the key.
export const EN = {
};
```

`sw.js`: line 8 → `const CACHE = 'habit-tower-v16';`. In `SHELL`, after `'collage.js',` add `'i18n.js', 'lang/en.js',`.

`app.js`: add `import { LANG } from './i18n.js';` to the imports, and right after the imports:

```js
document.documentElement.lang = LANG; // screen readers and fonts pick the language
```

- [ ] **Step 4: Run the tests, see them pass**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`. If only the `weekdays('ko')` or `monthTitle` expectation differs, print the actual value with `node -e "import('./i18n.js').then(m => console.log(m.weekdays('ko'), m.monthTitle('2026-09','ko')))"`; the values above are what Chrome and Node print with full ICU, so a difference means the runtime lacks ICU data — stop and report.

- [ ] **Step 5: Commit**

```bash
git add i18n.js lang/en.js i18n.test.mjs sw.js app.js
git commit -m "feat(i18n): tl translator keyed by the Korean text, English dictionary, check over every key"
```

---

### Task 3: Couple and partner days in `app.js`

**Files:**
- Modify: `app.js:2` (import), `:34-35` (state), `:59-66` (tick), after `:92` (derived days), `:97-99`, `:108`, `:186-201`, `:231`, `:299`, `:393`

- [ ] **Step 1: Import**

In `app.js` line 2 add `coupleToday` next to `localDay` in the `./logic.js` import.

- [ ] **Step 2: Partner's day as state, refreshed by the same tick**

After `const [today, setToday] = useState(localDay());` add:

```js
  const [partnerToday, setPartnerToday] = useState(null); // my partner's local day (their time zone), null when single
```

Replace the tick effect (the block starting `// Timers sleep while the phone app is in the background` through its `}, []);`) with:

```js
  // Timers sleep while the phone app is in the background: re-check the date on return too.
  // My partner's date follows their own time zone (couples can live apart).
  const partnerTz = cloud?.partner?.tz ?? null;
  useEffect(() => {
    const tick = () => { setToday(localDay()); setPartnerToday(partnerTz && localDay(new Date(), partnerTz)); };
    tick();
    const t = setInterval(tick, 60000);
    const onShow = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onShow);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, [partnerTz]);
```

(`cloud` is declared above this effect, so `partnerTz` can read it.)

- [ ] **Step 3: Use the right day per tower**

After `const cdays = useMemo(...)` add:

```js
  // The couple's day is the earlier of our two local days; my partner's own tower runs on their day.
  const ctoday = coupleToday(today, partnerToday);
  const ptoday = partnerToday ?? today;
```

Replace the `views` memo with:

```js
  const views = useMemo(() => ({
    me: towers(state.days, today, cutMe), couple: towers(cdays, ctoday, cutCouple), partner: towers(pdays, ptoday),
  }), [state.days, cdays, pdays, today, ctoday, ptoday, cutMe, cutCouple]);
```

Half brick: `const half = view === 'couple' ? halfBrick(state.days, pdays, ctoday) : null;`

Collapse check — replace the `check` helper and the `pf` line inside the fall effect, and add `ctoday` to its dependency list:

```js
    const check = (scope, d, seen, cut, day) => {
      if (fallChecked.current[scope] === day) return null;
      fallChecked.current[scope] = day;
      const pf = pendingFall(d, day, seen, cut);
      return pf && { ...pf, scope };
    };
    const pf = check('me', state.days, state.habit.seenFall, cutMe, today)
      ?? (coupled && cloud.synced ? check('couple', cdays, state.habit.seenCoupleFall, cutCouple, ctoday) : null);
```

```js
  }, [state.loaded, state.habit, today, ctoday, anim, fall, coupled, cloud?.synced, cdays, cutCouple]);
```

Shield offer: `const gap = fall && shieldDay(fall, fall.scope === 'couple' ? ctoday : today);`

Poke: `const partnerDone = !!pdays[ptoday]?.assetId;`

Calendar (the `<${Calendar} … today=${today}` line): `today=${{ me: today, couple: ctoday, partner: ptoday }[view]}`.

- [ ] **Step 4: Check nothing broke**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)"` → `# fail 0`.
Browser: `http://localhost:8766/?dev&seed=30` — the tower shows 30 floors, the calendar opens, no console errors (single user: `partnerToday` is null, so every day equals `today`).

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(time): couple tower on the earlier of our two local days, partner tower on theirs"
```

---

### Task 4: Server — time zone, language, hourly reminders

**Files:**
- Modify: `supabase/schema.sql` (append a section), `supabase/functions/remind/index.ts` (whole file)

- [ ] **Step 1: Ask 도균님 before touching the live database**

The migration changes the live project (backward compatible: defaults are Seoul/Korean, so today's two users see no change). Say so in one line and wait for a yes.

- [ ] **Step 2: Apply the migration**

`apply_migration` with name `global_tz_lang` and this SQL; append the same SQL to the end of `supabase/schema.sql`:

```sql
-- Global groundwork (2026-09-30): each user's time zone and language
-- (spec: docs/superpowers/specs/2026-09-30-global-groundwork-design.md).
alter table public.profiles
  add column tz text not null default 'Asia/Seoul' check (char_length(tz) <= 64),
  add column lang text not null default 'ko' check (lang in ('ko', 'en'));
grant insert (tz, lang), update (tz, lang) on public.profiles to authenticated; -- profiles writes are column-granted

-- A zone name Postgres doesn't know would make every local-time query fail: reset it to Seoul on write.
create function public.profiles_tz_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.timezone(new.tz, pg_catalog.now());
  return new;
exception when others then
  new.tz := 'Asia/Seoul';
  return new;
end $$;
revoke execute on function public.profiles_tz_guard() from public, anon, authenticated;
create trigger profiles_tz_guard before insert or update of tz on public.profiles
  for each row execute function public.profiles_tz_guard();

-- 9 pm reminders in each person's own time zone: the cron runs hourly and this picks the people at 21:xx local
-- time with no row in days for their local today. moment: now() from the cron, a fixed time in tests.
drop function public.remind_targets();
create function public.remind_targets(moment timestamptz default pg_catalog.now())
returns table (endpoint text, p256dh text, auth text, lang text)
language sql stable security definer set search_path = '' as $$
  select s.endpoint, s.p256dh, s.auth, coalesce(p.lang, 'ko')
  from public.push_subs s
  left join public.profiles p on p.id = s.user_id
  cross join lateral (select moment at time zone coalesce(p.tz, 'Asia/Seoul') as lt) l
  where extract(hour from l.lt) = 21
    and not exists (select 1 from public.days d where d.user_id = s.user_id and d.day = l.lt::date)
$$;
revoke execute on function public.remind_targets(timestamptz) from public, anon, authenticated;
grant execute on function public.remind_targets(timestamptz) to service_role;

-- Hourly now (was once at 12:00 UTC = 21:00 KST); scheduling the same name replaces the job.
select cron.schedule('habit-remind', '0 * * * *', $$
  select net.http_post(
    url := 'https://bmghacmswvmrhfiwddie.supabase.co/functions/v1/remind',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000)
$$);

-- Partner push: "today" is the uploader's local today, and the day goes along so the function can tell
-- "couple brick done" (my partner has that day too) from a nudge.
create or replace function public.notify_partner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.photo_path is not null and new.day = (now() at time zone
      coalesce((select tz from public.profiles where id = new.user_id), 'Asia/Seoul'))::date then
    perform net.http_post(
      url := 'https://bmghacmswvmrhfiwddie.supabase.co/functions/v1/remind',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
      body := jsonb_build_object('partner_of', new.user_id, 'day', new.day),
      timeout_milliseconds := 10000);
  end if;
  return null;
end $$;
```

- [ ] **Step 3: Check it in a rolled-back block (reminders + guard)**

`execute_sql`:

```sql
do $$
declare
  a uuid := '00000000-0000-0000-0000-0000000000a1';
  b uuid := '00000000-0000-0000-0000-0000000000b2';
  r1 text; r2 text; r3 text; bad text;
begin
  insert into auth.users (id, email) values (a, 'a1@test.invalid'), (b, 'b2@test.invalid');
  insert into public.profiles (id, tz, lang) values (a, 'Asia/Seoul', 'ko'), (b, 'America/Los_Angeles', 'en');
  insert into public.push_subs (endpoint, user_id, p256dh, auth) values
    ('https://example.invalid/a1', a, 'x', 'y'), ('https://example.invalid/b2', b, 'x', 'y');
  -- 12:00 UTC: Seoul 21:00 (a, no brick), LA 05:00
  select string_agg(endpoint || ' ' || lang, ',') into r1 from public.remind_targets('2026-09-30 12:00+00');
  -- 04:00 UTC next day: LA 21:00 on 09-30 (b), Seoul 13:00
  select string_agg(endpoint || ' ' || lang, ',') into r2 from public.remind_targets('2026-10-01 04:00+00');
  -- b's shield on its local 09-30 takes b off the list
  insert into public.days (user_id, day, shield) values (b, '2026-09-30', true);
  select coalesce(string_agg(endpoint, ','), 'none') into r3 from public.remind_targets('2026-10-01 04:00+00');
  update public.profiles set tz = 'Mars/Olympus' where id = a;
  select tz into bad from public.profiles where id = a;
  raise exception 'r1=% | r2=% | r3=% | bad=%', r1, r2, r3, bad;
end $$;
```

Expected error text (the raise rolls everything back): `r1=https://example.invalid/a1 ko | r2=https://example.invalid/b2 en | r3=none | bad=Asia/Seoul`.

- [ ] **Step 4: Check the partner trigger (today sends, a past day doesn't)**

```sql
do $$
declare
  b uuid := '00000000-0000-0000-0000-0000000000b2';
  lat date := (now() at time zone 'America/Los_Angeles')::date;
  q0 bigint; q1 bigint; q2 bigint;
begin
  insert into auth.users (id, email) values (b, 'b2@test.invalid');
  insert into public.profiles (id, tz) values (b, 'America/Los_Angeles');
  select count(*) into q0 from net.http_request_queue;
  insert into public.days (user_id, day, photo_path) values (b, lat, 'b2/x.jpg');     -- b's local today
  select count(*) into q1 from net.http_request_queue;
  insert into public.days (user_id, day, photo_path) values (b, lat - 1, 'b2/y.jpg'); -- a past day
  select count(*) into q2 from net.http_request_queue;
  raise exception 'today=% past=%', q1 - q0, q2 - q1;
end $$;
```

Expected: `today=1 past=0`.

- [ ] **Step 5: Replace the remind function**

Write `supabase/functions/remind/index.ts`:

```ts
// 9pm reminder in each person's own time zone, called every hour by pg_cron (see supabase/schema.sql) with the
// x-cron-secret header. Pushes to every subscription whose owner is at 21:xx local time with no brick today, in
// their language (profiles.lang); drops subscriptions the push service says are gone.
// Body {"endpoint": "..."} sends to that one subscription only, brick or not (manual test, Korean).
// Body {"partner_of": "<uid>", "day": "YYYY-MM-DD"} (days insert trigger) pushes that user's partner instead.
import * as webpush from 'jsr:@negrel/webpush@0.5.0';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const MESSAGES = {
  ko: {
    remind: { title: '🧱 오늘 벽돌 아직이에요', body: '자정 지나면 탑이 무너져요', tag: 'remind' },
    couple: (name: string) => ({ title: '💞 커플 벽돌 완성!', body: `${name}도 인증해서 우리 탑이 한 층 올라갔어요`, tag: 'partner' }),
    partner: (name: string) => ({ title: `🧱 ${name} 오늘 인증 완료`, body: '나도 쌓으러 가기 👉', tag: 'partner' }),
    someone: '짝꿍',
  },
  en: {
    remind: { title: '🧱 No brick yet today', body: 'Your tower falls at midnight', tag: 'remind' },
    couple: (name: string) => ({ title: '💞 Couple brick done!', body: `${name} checked in too. Our tower grew a floor!`, tag: 'partner' }),
    partner: (name: string) => ({ title: `🧱 ${name} checked in today`, body: 'Your turn to stack 👉', tag: 'partner' }),
    someone: 'Your partner',
  },
};
const msgs = (lang?: string) => MESSAGES[lang === 'en' ? 'en' : 'ko'];

type Sub = { endpoint: string; p256dh: string; auth: string; message: object };

// uid's photo for their local `day` just landed. Push uid's partner: "couple brick done" if the partner has that day
// too, else a nudge.
async function partnerPush(uid: string, day: string): Promise<{ subs: Sub[]; kind: string }> {
  const none = { subs: [], kind: 'none' };
  if (!day) return none;
  const { data: me } = await sb.from('profiles').select('name, couple_id').eq('id', uid).maybeSingle();
  if (!me?.couple_id) return none;
  const { data: partner } = await sb.from('profiles').select('id, lang').eq('couple_id', me.couple_id).neq('id', uid).maybeSingle();
  if (!partner) return none;
  const { data: done } = await sb.from('days').select('day').eq('user_id', partner.id).eq('day', day)
    .not('photo_path', 'is', null).maybeSingle();
  const { data: subs } = await sb.from('push_subs').select('endpoint, p256dh, auth').eq('user_id', partner.id);
  const m = msgs(partner.lang), name = me.name || m.someone, message = done ? m.couple(name) : m.partner(name);
  return { subs: (subs ?? []).map((s) => ({ ...s, message })), kind: done ? 'couple' : 'partner' };
}

Deno.serve(async (req) => {
  const { data: cfg, error } = await sb.rpc('remind_config');
  if (error || !cfg?.cron_secret) return new Response('config missing', { status: 500 });
  if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return new Response('unauthorized', { status: 401 });

  const body = await req.json().catch(() => ({}));
  let subs: Sub[], kind = 'remind';
  if (body?.partner_of) {
    ({ subs, kind } = await partnerPush(body.partner_of, body.day));
  } else if (body?.endpoint) {
    const { data, error: e2 } = await sb.from('push_subs').select('endpoint, p256dh, auth').eq('endpoint', body.endpoint);
    if (e2) return new Response(e2.message, { status: 500 });
    subs = (data ?? []).map((s) => ({ ...s, message: MESSAGES.ko.remind }));
  } else {
    const { data, error: e2 } = await sb.rpc('remind_targets');
    if (e2) return new Response(e2.message, { status: 500 });
    subs = (data ?? []).map((s: Omit<Sub, 'message'> & { lang: string }) =>
      ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, message: msgs(s.lang).remind }));
  }

  const app = await webpush.ApplicationServer.new({
    contactInformation: 'mailto:dokyun0813@gmail.com',
    vapidKeys: await webpush.importVapidKeys(cfg.vapid_keys),
  });
  let sent = 0, gone = 0, failed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      // ttl 3h: a phone that is off until morning shouldn't get last night's push.
      await app.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(JSON.stringify(s.message), { ttl: 10800, urgency: webpush.Urgency.High });
      sent++;
    } catch (e) {
      if (e instanceof webpush.PushMessageError && [404, 410].includes(e.response.status)) {
        await sb.from('push_subs').delete().eq('endpoint', s.endpoint);
        gone++;
      } else {
        failed++;
        console.error(String(e));
      }
    }
  }));
  return Response.json({ kind, sent, gone, failed });
});
```

Deploy with `deploy_edge_function`: name `remind`, entrypoint `index.ts`, `verify_jwt: false`, the file above.

- [ ] **Step 6: Check the deployed function**

```sql
select net.http_post(
  url := 'https://bmghacmswvmrhfiwddie.supabase.co/functions/v1/remind',
  headers := jsonb_build_object('Content-Type', 'application/json',
    'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
  body := jsonb_build_object('endpoint', 'https://example.invalid/none'));
```

Wait ~3 s: `select status_code, content from net._http_response order by id desc limit 1;` → `200`, `{"kind":"remind","sent":0,"gone":0,"failed":0}`.
Same call with `body := jsonb_build_object('partner_of', '00000000-0000-0000-0000-000000000000', 'day', '2026-09-30')` → `{"kind":"none","sent":0,"gone":0,"failed":0}`.
Then `select jobname, schedule from cron.job;` → `habit-remind | 0 * * * *`, and `get_advisors` (security) shows no new warning.

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql supabase/functions/remind/index.ts
git commit -m "feat(server): per-user time zone and language, hourly 9pm-local reminders, partner push carries the day"
```

---

### Task 5: `cloud.js` sends my zone and language, reads my partner's zone

**Files:**
- Modify: `cloud.js` (imports, header comment `:42`, select `:104`, upsert `:179`, partner object `:210`)

- [ ] **Step 1: Edit**

Imports: add `import { LANG } from './i18n.js';`.
Line 42 comment: `partner: {id, name, character, habit, coupleCut, look, pets: …}` → `partner: {id, name, character, habit, coupleCut, look, tz, pets: …}`.
Line 104: `.select('id, name, character, habit, couple_id, couple_cut, look, room, tz')`.
Profile upsert (`must(await sb.from('profiles').upsert({ id: uid, name, …`): add after `room: room ?? {},`:

```js
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: LANG,
```

Partner object in `save({ … partner: partner && { id: partner.id, … } })`: add `tz: partner.tz ?? null,` after `room: partner.room ?? {},`.

- [ ] **Step 2: Check**

Run: `npm test 2>&1 | grep -E "^# (pass|fail)"` → `# fail 0`. `node --check cloud.js` → no output.
(The real check is after deploy, in Task 15: the phones' rows get `tz`/`lang`.)

- [ ] **Step 3: Commit**

```bash
git add cloud.js
git commit -m "feat(cloud): send my time zone and language; read my partner's time zone"
```

---

### Task 6: Language setting

**Files:**
- Modify: `ui/windows.js` (import, after `:45`, new `LangBox` after `SoundBox`), `lang/en.js`

- [ ] **Step 1: Edit**

`ui/windows.js` imports: add `import { tl, langPref, setLang } from '../i18n.js';`.
After `<${SoundBox} />` (line 45) add `<${LangBox} />`. After the `SoundBox` function add:

```js
// Language, per phone. Changing it reloads the app (i18n.js). Language names stay in their own language.
function LangBox() {
  return html`<div class="backup">
    <div class="lbl">${tl('언어')}</div>
    <select class="track" value=${langPref()} aria-label=${tl('언어')} onChange=${(e) => setLang(e.target.value)}>
      <option value="auto">${tl('폰 설정 따라가기')}</option><option value="ko">한국어</option><option value="en">English</option>
    </select>
  </div>`;
}
```

`lang/en.js` inside `EN`:

```js
  // ui/windows.js
  '언어': 'Language',
  '폰 설정 따라가기': 'Same as phone',
```

- [ ] **Step 2: Check**

`npm test` → `# fail 0`. Browser `?dev`: settings shows 언어 with three choices; picking English reloads in English (only these two strings change so far).

- [ ] **Step 3: Commit**

```bash
git add ui/windows.js lang/en.js
git commit -m "feat(i18n): language setting (phone default, Korean, English)"
```

---

## Conversion rules (Tasks 7–13)

About 1,500 Korean words move into `tl`. The dictionary is written while converting; `i18n.test.mjs` is the gate (it lists every missing or unused English entry with its file). Rules:

1. Every Korean text a user can see goes through `tl`: text, `aria-label`, `title`, toasts, `setLine`, notes, errors thrown to the UI (`new Error(tl('…'))`).
2. Values: `tl`…${x}…`` with simple expressions only. If an expression needs braces, backticks or Korean inside it, compute it first or split the sentence:
   - `` `위력 ${k.power}${k.hits ? `×${k.hits}` : ''}` `` → `const hits = k.hits ? `×${k.hits}` : ''; … tl`위력 ${k.power}${hits}``
   - `` `${nm(w)}의 ${STAT[s]}이(가) ${up ? '올라갔다' : '떨어졌다'}!` `` → `up ? tl`${nm(w)}의 ${STAT[s]}이(가) 올라갔다!` : tl`${nm(w)}의 ${STAT[s]}이(가) 떨어졌다!``
3. Plain strings: `tl('…')` with one single-quoted literal (use `` tl`…` `` if the text has a `'`).
4. Markup stays outside `tl`: `html`<b>${tl('승리!')}</b>``, never `tl` around html.
5. Module-level constants and object maps are wrapped where defined: `const STAT = { atk: tl('공격'), def: tl('방어') };` (the language is fixed at startup, so this is safe).
6. Keep Korean particles (`이(가)`, `을(를)`) in the keys; English entries are natural English.
7. English plurals: a function value, `'{0}일 인증': (n) => (n === 1 ? '1 day checked in' : `${n} days checked in`)`.
8. Not converted: monster names (`catalog.js` `M`), character names (`catalog.js` `C`, `ui/sprites.js` `CHARACTERS`), `'한국어'`, comments, `console` text, `report.js` diagnostics (read by us, not users).
9. Emoji stay for now (stage 4 replaces them); keep them inside the key if they are inside the Korean string.
10. Watch local variables named `tl`: `ui/bag.js` has none (`tr` is a different name); if a file has one, rename the local.

English glossary (use the same word everywhere): 인증 → check in / check-in · 벽돌 → brick · 탑 → tower · 층 → floor · 붕괴/무너짐 → fall · 방어권 → shield · 상자 → box · 조각 → shard · 이로치 → shiny · 도감 → collection · 칭호 → title · 꾸미기 → style (room: decorate) · 놀이방 → playroom · 대결 → battle · 미로 → maze · 하트/친밀도 → hearts · 먹이 → snack · 상대/짝꿍/연인 → partner · 우리 탑 → our tower · 콕 찌르기 → nudge · 명예의 전당 → Hall of Fame · 새로 쌓기 → start over · 코인 → coins · 상점 → shop · 동기화 → sync · 백업/복원 → backup/restore. Tone: short, warm, playful, like the Korean.

Each conversion task has the same steps:
- **List:** `grep -n "[가-힣]" <files>`.
- **Convert** by the rules; add the English under a `// <file>` comment in `lang/en.js`.
- **Gate:** `npm test 2>&1 | grep -E "^# (pass|fail)|missing|unused|differ" ` → `# fail 0`.
- **Leftovers:** `grep -n "[가-힣]" <files> | grep -v "tl\`\|tl('"` — every remaining line must be a comment, a monster/character name, or `'한국어'`.
- **Look:** open the screen at `?dev&lang=en` and `?dev` (Korean must look exactly as before).
- **Commit.**

### Task 7: Catalog and track names

**Files:** Modify `catalog.js` (TIERS, FOODS, ELEMENTS, SPECIES `sig(…)`, `S` and `CS` skins, `KIND_NAME`, FURNITURE incl. `act[3]` words, BUILDINGS, THEMES, ACCESSORIES, TITLES `name`/`desc`), `sound.js` (TRACKS), `lang/en.js`.

Examples:
```js
import { tl } from './i18n.js'; // catalog.js, top
{ id: 'rare', name: tl('레어'), weight: 20, color: '#4a9ae8', taps: 5 },
fire: { icon: '🔥', name: tl('불'), skill: tl('불꽃 발사') },
snail: { strong: 'def', sig: sig(tl('껍질 숨기'), 0, 100, { self: { def: 1 } }) },
['flag', 'crown', tl('왕관'), 'legend', { icon: '👑' }],
{ id: 'cushion', icon: '🛋️', name: tl('쿠션'), price: 30, act: ['sleepy', 'sway', 'zzz', tl('쿨쿨')] },
{ id: 'week', name: tl('일주일 개근'), desc: tl('7일 연속 인증') },
{ id: 1, name: tl('마을'), file: 'audio/bgm-town.mp3' }, // sound.js
```
Leave `M` (monsters) and `C` (character colors) untouched. Before committing, check no code compares a catalog name to a fixed Korean string: `grep -n "name === '" *.js ui/*.js` → nothing (the one `s.name === e.skill` in `ui/battle.js` compares two translated names, fine).

Commit: `feat(i18n): catalog and track names in English`.

### Task 8: `ui/windows.js` (settings, album, shelf, calendar, setup and the other windows)

Also the calendar: replace `const WEEK = ['일', …];` with `const WEEK = weekdays();` and the month title text with `monthTitle(ym)` (import both from `../i18n.js`).

Examples:
```js
const sw = (key, label) => html`…>${label} ${p[key] ? tl('켜짐') : tl('꺼짐')}</button>`;
<div class="lbl">${tl('소리')}</div>
${sw('bgm', tl('🎵 배경음악'))}
ok: tl('폰이 진동 요청을 받았어요. 안 떨렸다면 폰 설정 → 소리 및 진동 → 진동 세기에서 터치·시스템 진동을 켜 주세요.'),
? tl`둘 다 ${count(couple, true)}일 · ${names[0]} ${count(mine)}일 · ${names[1]} ${count(theirs)}일`
aria-label=${tl`${k} 사진`}
```

Commit: `feat(i18n): windows in English`.

### Task 9: `ui/bag.js`

Examples:
```js
const boxName = (b) => (b.startsWith('c:') ? tl('💞 커플 상자') : b.startsWith('b:') ? tl('🎁 보너스 상자')
  : b.startsWith('p:') ? tl`🐾 펫 Lv ${b.split(':')[2]} 상자` : tl('🎁 인증 상자'));
const HINT = { rare: tl('빛이 새어 나와요… 레어 이상!'), epic: tl('보랏빛이…! 희귀 이상!'), legend: tl('금빛이다!! 전설 확정!') };
${box.startsWith('d:') || box.startsWith('c:') ? tl`${box.slice(2)} 인증 보상` : tl('조각 10개 보상')}
```

Commit: `feat(i18n): bag in English`.

### Task 10: `ui/playroom.js`, `ui/room.js`

Examples:
```js
feed(1, 'pet').then((n) => gave(n, s.pet.asleep ? tl('쿨쿨…') : tl('헤헤')), () => {});
aria-label=${visit ? tl`${visit.name}의 놀이방` : tl('펫과 놀기')}
const TABS = [['furniture', tl('🛋️ 가구'), FURNITURE], ['building', tl('🏠 건물'), BUILDINGS], ['theme', tl('🌸 테마'), THEMES]];
```

Commit: `feat(i18n): playroom and room in English`.

### Task 11: `ui/battle.js`, `ui/maze.js`

Examples:
```js
const LEVELS = [[tl('쉬움'), -2], [tl('보통'), 0], [tl('어려움'), 2]];
setLine(foe.vs === 'wild' ? tl`앗! 야생 ${nameOf(foe.id)} Lv ${foe.level}이(가) 튀어나왔다!`
  : tl`${foe.label}의 ${nameOf(foe.id)} Lv ${foe.level}이(가) 나타났다!`);
if (wild) begin({ ...wild, acc: null, label: tl('야생'), vs: 'wild' });
const won = r.state.over === 'win', text = won ? tl('승리!') : tl('패배…');
// ui/maze.js: split nested choices into whole sentences
const note = r.admin ? tl`🎉 ${name}을(를) 잡았다! (🛠 저장 안 함)` : !r.caught ? tl('이겼다!')
  : r.dup ? tl`🎉 ${name}을(를) 잡았다! (이미 있어서 조각 +1)` : tl`🎉 ${name}을(를) 잡았다! 도감에 등록!`;
```
(`effectText` and the stat line follow rule 2's examples.)

Commit: `feat(i18n): battle and maze in English`.

### Task 12: `app.js`, `ui/scene.js`, `ui/sprites.js`, `ui/monsters.js`

Examples:
```js
useEffect(() => db ? subscribe(db, setState, (e) => setToast(tl`동기화 오류: ${e.code}`)) : undefined, [db]);
const partnerName = partner?.name || tl('상대');
couple: `❤ ${cloud?.coupleTitle || tl('우리 탑')}`, … }[view] ?? tl('해빗 타워');
const fail = (e) => setToast(tl`실패: ${e?.message ?? e?.code ?? e}`);
<span class="plus">${half ? '½' : tl('+1층')}</span>          // ui/scene.js
aria-label=${shiny ? tl`이로치 ${m.name}` : m.name}          // ui/monsters.js
```
`ui/sprites.js`: only non-name strings (character names wait for stage 3).

Commit: `feat(i18n): tower screen in English`.

### Task 13: `db.js`, `cloud.js`, `localdb.js`, `image.js`, `collage.js`

Examples:
```js
if (!s?.loaded) throw new Error(tl('데이터를 아직 불러오는 중이에요'));
try { data = JSON.parse(await file.text()); } catch { throw new Error(tl('백업 파일을 읽을 수 없어요')); }
ctx.fillText(tl('해빗 타워'), W / 2, c.height - 24);
```

Commit: `feat(i18n): errors and collage in English`.

---

### Task 14: Both languages at phone width

**Files:** none changed unless a problem shows up (then fix, re-run `npm test`, commit `fix(i18n): …`).

- [ ] **Step 1: A 360 px frame** (the Chrome window can't shrink below ~637 px). Create `/private/tmp/claude-501/-Users-dk/ed48a2db-8506-4c71-aa18-d6e9fe9b0fcb/scratchpad/frame.html`:

```html
<!doctype html><meta charset="utf-8"><title>360</title>
<body style="margin:0;background:#333">
<iframe id="f" src="http://localhost:8766/?dev&seed=30&lang=en" style="width:360px;height:740px;border:0;background:#fff"></iframe>
```

Serve it with `python3 -m http.server 8767 -d /private/tmp/claude-501/-Users-dk/ed48a2db-8506-4c71-aa18-d6e9fe9b0fcb/scratchpad` next to the app server on 8766, open `http://localhost:8767/frame.html`.

- [ ] **Step 2: Walk the screens in English**, then with `&lang=ko`: tower + HUD, settings (language box), calendar (month title, weekdays), album, Hall of Fame, bag (4 tabs, a box reveal), playroom (throw, pet, sleep hint), shop, decorate, battle (pick, a full fight, end), maze (walk, a wild battle). Look for: Korean left over (only monster and character names may stay), text overflowing buttons or cards at 360 px, console errors (`read_console_messages` with pattern `Error`).

- [ ] **Step 3: Fix what shows up** — shorter English wording first, CSS second (`font-size`/`white-space` on the one element). Re-check that screen in both languages.

---

### Task 15: Finish

- [ ] **Step 1:** `npm test 2>&1 | grep -E "^# (pass|fail)"` → `# fail 0`, and more passing tests than the baseline 77.
- [ ] **Step 2:** Ask 도균님 to skim `lang/en.js` (tone and words), apply changes, commit.
- [ ] **Step 3:** Ask before pushing (live deploy). On yes: `git push`, then `gh run list --limit 1` until `completed success`.
- [ ] **Step 4:** After 도균님's phone opens the app once: `select id, tz, lang from public.profiles;` → his row has his phone's zone and language.
- [ ] **Step 5:** Update memory (`project_habit_tower.md`): what shipped, the `tl` rules, what's left for stage 2.
