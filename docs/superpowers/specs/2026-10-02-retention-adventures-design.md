# Keep-coming-back update: roadmap, and part 1 (pet adventures, journal, eggs, greetings) — design

Date: 2026-10-02. 도균님: game quality first — make people care and keep using the app. Server and store work
(stage 2A, branch `feat/accounts-legal`) waits.

## Why (the current game, read from the code)

1. After the day's photo there is no reason to open the app again; the playroom, battles and the maze have weak
   purpose (coins → furniture).
2. Pets don't visibly grow: evolution was removed when boxes came; growth is a level number.
3. Nothing new appears: fixed content is seen in a week or two [estimate].
4. After 30 floors the next goal is unclear (a new tower starts at floor 1).
5. One missed day topples the tower — a likely moment to quit [estimate].

## Decisions (도균님, 2026-10-01/02)

- All four directions, in this order:
  1. **Pet adventures, journal, eggs, greetings** (this spec);
  2. **Daily quests, check-in rewards, gentler failure** (a recovery mission can bring a fallen tower back);
  3. **Halloween event** with the existing pumpkin, ghost, skeleton and bat monsters, timed for late October;
  4. **New monster world** (original names and designs instead of the MapleStory look-alikes) at 32×32, with
     growth stages and evolution — drawn once, at the final resolution;
  5. **Seeing my progress**: weekly report, "a year ago today", finished towers forming a town.
- The failure rule gets gentler (part 2).
- Features first; every new feature is drawn in pixel art from the start (the existing emoji screens are redone in
  the art overhaul later).
- Part 1: the pet returns **3 hours** after it leaves; the partner's adventures show in the couple tab; **8 places**;
  eggs hatch with the **same odds as boxes**.

## Part 1: the daily flow

Check in → the day's **adventure ticket** → `[보내기]` whenever you like (play with the pet first) → 3 hours later
the pet is back with a short story and gifts → `[일지에 넣기]` collects them. Next day, again.

Sending is a tap rather than automatic because a pet away for 3 hours right after the check-in would lock the
playroom, battles and the maze (they all need the pet).

## Adventure rules

- A ticket exists on a day with a photo (not a shield day) and no adventure yet. It is good until local midnight.
- `[보내기]` (on the tower screen card and in the playroom) sends the **equipped pet** (`habit/me.look.monster`).
  Place, story and gifts are rolled at that moment and saved in `adv/<day>`, so reopening the app never rerolls.
- Away: the tower scene shows a pixel signpost with the time left ("모험 중 ⏳ 2:14") instead of the pet; the
  playroom shows the empty spot, the timer, and a hint that another pet can be equipped from the bag. Battles and the
  maze wait while the equipped pet is away. Equipping a different pet brings that pet home to play.
- Back: when the app is open on the tower screen (and no other window or animation is showing) after `returnAt`, the
  **return card** opens: the place's pixel scene, the pet with a happy face, the story, the gifts. `[일지에 넣기]`
  claims the gifts. An unclaimed adventure from an earlier day still opens its card (with its date).
- Admin mode: the pet is back in 10 seconds and nothing is saved, like the other play results.

## Places and stories

- Eight places: 숲 forest, 바닷가 beach, 산 mountain, 동굴 cave, 꽃밭 flower field, 설원 snowfield, 사막 desert,
  하늘섬 sky island.
- Each place: a first-visit story and at least six regular stories, Korean and English, 2–3 short sentences, warm and
  a little funny. `{pet}` is the pet's name, `{habit}` the habit's title; a story may use either. Example:
  "주인님이 {habit} 하는 동안 {pet}은(는) 바닷가에서 반짝이는 조개를 주웠어요. 파도가 발을 간질여서 세 번이나
  넘어졌대요." / "While you did your {habit}, {pet} found a shiny shell on the beach. The waves tickled so much it fell
  over three times."
- Place pick: places not visited yet have three times the weight of visited ones. Story pick: one this place hasn't
  told yet, until all are told, then any. A first visit always tells the first-visit story.
- Stories live in `stories.js` as `{ id, place, first?, text: { ko, en }, line: { ko, en } }` — `line` is the one-line
  summary the partner sees. Shown in the app's language. They are not `tl` keys (long structured content); a test
  checks both languages and matching `{pet}`/`{habit}` in each.

## Gifts

Rolled at sending; the numbers live in one constant to tune later.

- Coins: 5–15, always; a first visit to a place adds 10.
- 40%: one extra snack piece, added to the tray of the day it is claimed.
- 10%: a box shard (counts with duplicates and maze clears toward bonus boxes).
- 3%: an egg.
- Coins are derived like the other income: `shop.js` `income()` adds the claimed adventures' coins; shards add to
  `shards()`/`boxes()` next to maze clears.

## Eggs

- Sources: an adventure gift (key `a:<day>`), and every 7th photo day in a row (key `s:<day>`, the 7th day; streaks
  bridged by shields count, like `runs()`), counting only days from the feature's launch date `EGGS_FROM`.
- Derived from records, never stored (like boxes): eggs = adventure eggs + streak eggs − hatched ones.
- An egg hatches after **3 photo days after the day it came**. Then the bag's box tab shows it ready; tapping it opens
  the same tap-to-break reveal as boxes, with egg art and crack stages. The monster is rolled at the reveal with box
  odds (common 70, rare 20, epic 8, legendary 2, shiny 3%); a duplicate gives a shard. The result is a pull with box id
  `e:<egg key>` (e.g. `e:a:2026-10-03`), so it syncs and restores like box pulls.
- The bag's box tab gets a nest row: each egg with its progress (●●○) or "부화!".
- No nest limit: about one egg a week [estimate] and three days to hatch keep the nest small.

## Journal (모험 일지)

- A window: the place collection on top ("3/8", places not visited yet as dark silhouettes), then every adventure,
  newest first: place thumbnail, date, pet, story, gifts.
- Opened from a 📖 button in the playroom toolbar and from the return card.

## Pet greetings on the tower screen

The buddy pet gets a speech bubble and a face. First match wins:

1. returned, unclaimed → "다녀왔어! 선물 있어!" (excited);
2. away → "모험 중…" with the time left (the signpost replaces the pet);
3. ticket ready → "모험 갈 준비 됐어!" (excited);
4. 3+ days since the last photo → "보고 싶었어…" (sad);
5. no photo today, after 18:00 → "벌써 저녁이야… 인증하자!" (worried);
6. no photo today → "오늘도 같이 쌓자!" (joy);
7. a streak of 3+ days → "{n}일 연속! 최고야" (excited);
8. otherwise none.

## Couple

- Server table `adventures` (user_id, day, pet, shiny, place, story, coins, food, shard, egg, depart_at, return_at):
  the owner writes, the owner and the partner read (`partner_id()`), anon nothing. Synced both ways like
  `maze_clears` (a new phone gets its journal back). Story text stays in the app; the server holds ids only.
- Couple tab: under the tower, the partner's newest returned adventure of the last two days as one line, e.g.
  "💞 타비의 달팽이가 바닷가에서 조개를 주웠대요" (the story's `line`).
- Server change: the `adventures` table and `pulls_box_check` accepting `e:[as]:YYYY-MM-DD`. Applied only with
  도균님's yes, at deploy time.

## Art

- `ui/pix.js` from the pixel art spec (`2026-09-29-pixel-art-overhaul-design.md`): art as rows of characters plus a
  palette, painted once to a canvas, cached as a PNG data URL, shown as an `<img>` with `image-rendering: pixelated`.
- To draw: 8 place scenes (64×32, shown about 5×), the egg (16×20) with 3 crack overlays and a few seeded color
  patterns, a signpost and a journal book (16×16).
- **Sample gate:** two place scenes and the egg are shown to 도균님 before the rest are drawn.

## Data

- Local: `adv/<day>` = `{ pet, shiny, place, story, departAt, returnAt, coins, food, shard, egg, claimed }`.
- Pure logic in `adventure.js`: rolls, eggs, hatch progress, greeting choice, income and shard counts.
- Backup export/import includes `adv`.

## Testing

- `adventure.test.mjs`: place weights favor new places; the first visit tells the first-visit story; no repeated
  story until a place's stories are used up; gifts within their ranges and the egg/shard rates over many seeded rolls;
  streak eggs on every 7th day only from `EGGS_FROM`, shields bridging; hatching after exactly 3 later photo days;
  greeting order; income and shards include adventures.
- `stories.js` check: every story has `text` and `line` in `ko` and `en`, the same placeholders, a valid place, one first-visit story per
  place, at least 6 regular stories per place.
- Screens at 360 px, Korean and English: ticket card, away signpost and timer, return card, journal, nest row, egg
  reveal, couple line.
- Server (at deploy): `adventures` RLS in a rolled-back SQL block (owner writes, partner reads, a stranger sees nothing).
