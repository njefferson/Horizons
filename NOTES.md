# NOTES.md — Quietkeep

> **The app is Quietkeep.** *"Out of sight. Never out of mind."* /
> *"It holds the rest, so you can rest."* — Noah, 2026-07-28,
> [ADR-0024](docs/adr/0024-name-quietkeep.md). Q-02 is closed.
>
> `Horizons` is now the **repo slug only**, until the GitHub rename. It also survives
> permanently as *domain* vocabulary — *higher horizons* (law 4) and the
> *horizon-integrity engine* keep the word, and `changelog:check` asserts they were not lost to a
> rename.
>
> **The check order that produced it**, kept because it transfers — cheapest and
> most-likely-to-kill first:
> **1. say it aloud** · 2. grep this repo's spec · 3. unscoped name+software search ·
> 4. npm and GitHub · 5. App Store / USPTO on Noah's device.
> Steps 1 and 2 are free and instant, and were being run last or not at all. The full
> record of what was tried is the [graveyard](docs/adr/0020-name-perennial.md) — a trail of
> where the search went, not a proof that nothing else was left.

The repo source of truth. **Read this first, every session** (Doctrine §12).
Thesis, invariants, frozen scope, open questions, Project facts. Settled
decisions live here in summary and in [`docs/adr/`](docs/adr/) in full.

---

## Thesis

Most planners are built for someone whose problem is *organising* what they
already remember. This one is built for someone whose problem is that a thing
leaves their head and does not come back — where the relief of writing it down is
real and immediate, and the returning is the part that never happens.

So the return is not a feature. It is the structural property the whole schema
exists to guarantee. Capture relief is unconditional for this audience, which
means resurfacing must be *structural, not habitual* — the app cannot depend on
the user remembering to review, because that is the exact capacity it is
compensating for.

Everything else follows from that.

---

## The ten product laws (invariants)

Violating one of these is a **defect**, not a trade-off. If a requested change
requires breaking one, that is a Doctrine §1 moment: flag it, don't slip it in.

1. **Return engine.** Every node is (a) on a surface now, (b) under a clock,
   (c) on the Menu, or (d) parented to something under a clock. The write
   boundary refuses anything else. *No silent nodes.*
2. **Coverage gauge.** A one-line surface element proving law 1
   ("everything returns · 0 silent"), tappable to show each item's return date.
   The invariant is not just held, it is *shown*.
3. **No past bucket.** A passed date is never an archive item. It auto-converts
   to a present replan card with context assembled: what it fed, the suspense,
   days left, and options — compress / escalate / renegotiate.
4. **Levels push down; the user never climbs.** The runway is the only
   workspace. Higher horizons project lineage and health downward. Altitude
   views are inspection modes, not places to work.
5. **One decay primitive runs everything temporal:**
   `(last_done, comfort_window, rising pressure)`. **No "overdue" state exists
   anywhere** — not in the schema, not in a variable name, not in copy. Language
   is "ready again" and pressure gradients. No red walls. No streaks.
6. **Demand-free types exist.** Menu items and pebbles cannot carry clocks.
   Acting on one is a deliberate promotion, never an obligation that accrued.
7. **The app plots; the human interprets.** No sentiment scoring, no cause
   attribution, no diagnosis-flavoured copy. Journal analytics render
   co-occurrence only.
8. **Rest is legitimate.** Re-entry after absence is the *primary designed
   path*. The greeting after a lapse is bounded — Next-up + ≤3 triage + gauge +
   amnesty offer — never the backlog.
9. **Data is never lost to updates.** Append-only event log; state = fold(log);
   migrations additive-only; auto-export a snapshot before any migration; import
   always seeds a fresh store, never merges.
10. **AI never blocks.** Every assisted flow has a working offline rung. Cloud
    rungs require explicit consent naming what leaves the device.

---

## Scope — frozen 2026-07-27

MoSCoW run over the design brief's standing tier proposal. **v1 is frozen.**
Moving an item into v1 now is a scope change and needs Noah's word.

### Must — v1

- **The spine.** Append-only log, fold engine, vaults, export/import,
  snapshot-before-migrate. Nothing else can be trusted until this is.
- **Work mode, complete.** Single computed Next-up card (hard landscape >
  resume cards > pressure rank; "not this" cycles freely with no penalty),
  capped list of 5 behind it, Upkeep chips above threshold, coverage gauge,
  comms-sweep chip.
- **Dump + clarify + heat pass.** Zero-chrome capture; one card at a time with
  forced-choice routing; two-tap hot/cold.
- **Interrupt/pin + focus anchor**, with auto-paired resume cards.
- **Dependency dates + replan.** `feeds →` (project, suspense) + lead estimate,
  computed latest-start, buffer burn, auto-replan on miss (law 3).
- **Track portfolio + delta report.** The work half: OPR, suspenses, status
  output to clipboard/Markdown/print/CSV.
- **Person lens.**
- **Stalled/orphan detection** (the exceptions-first Review surface).
- **T0 + T1 notifications.** Permission + badge + glance surfaces; `.ics` export
  with `RRULE`/`VALARM` so the OS calendar does the notifying.

### Should — v1.5

Menu with save-for gauges · Rest mode + auto re-entry (7-day default) · bother
flow · staff-call lens · pebbles · journal · printable today-card · request slots
+ Not Now ledger.

> **Binding condition:** journal **encryption ships in the same commit as the
> journal**, including its exports. It is never retrofitted. If encryption isn't
> ready, the journal isn't ready.

### Could — v2

WAR ingestion (deterministic format-template parser first, AI fallback second,
every update confirmed and provenance-tagged) · Workers-AI rungs · T2 push ·
duration learning · community template loading.

### Won't — named, so they cannot drift back in

These are refusals, not backlog. Each one is a law above, made concrete:

- Sentiment scoring, mood inference, cause attribution (law 7)
- Streaks, chains, completion percentages as motivation (law 5)
- An archive or "missed" bucket of any kind (law 3)
- Telemetry, analytics, crash reporting — anything automatic leaving the device
  (Doctrine §1, §9)
- Any cloud feature without a working offline rung (law 10)
- Gamification, points, mascots, childlike voice
- Social features, sharing-by-default, accounts

### Carried forward across tiers

**Duration estimates are logged from v1**, even though duration *learning* is
v2. The feature is late; the data must not be. Logging an estimate costs one
field now and is impossible to backfill later.

### v1 definition of done — the dogfood gate

Not a checklist of features. Thirty **consecutive working days** in which:

- every staff call and walk-in runs from the app's views,
- every suspense lives in the app, and
- the desk paper holds nothing the app doesn't.

Under thirty days, the gate resets. This is the only thing that decides v1 is
finished.

---

## Open questions

Owner input needed. Recorded rather than guessed. **Nothing below has been
decided by a session.**

### Open

| # | Question | Blocking? | Status |
|---|---|---|---|
| Q-06 | **The astro app's naming is inconsistent.** Its repo and URL say `clear-horizons`; the hub displays it as **"Astro Planner"** (in `noahjefferson/public/index.html`, two places — the tile and its data entry). The name Noah chose appears nowhere a visitor sees. Does he want the app renamed, or the hub made consistent with the name it already has? | No | **Open — Noah asked to have this kept in front of him.** Raise it each session until settled. Its repo is not in this session's scope (Doctrine §11), so the app-side work needs a session with `clear-horizons` selected. |
| Q-07 | **The hub undersells the astro app.** the hub tile reads *"Clear-sky & Seestar target windows"* and never mentions recording your horizon — which Noah says is the thing no other astro app does. | No | Open. One-line site change, hub is in scope, but entangled with Q-06 so it waits on that answer. |

**Name availability is settled.** Noah ran both device checks himself on 2026-07-28 — the
App Store search and `quietkeep.pages.dev` — and both came back clean. A USPTO knockout in
classes 9 and 42 was **not run, by reasoning rather than omission**: trademark protects
against confusion in commerce, and a free app licensed against being sold is not in
commerce. [V-04](docs/verifications.md) records that as a decision, not a gap.

**Standing rule on names** ([V-04](docs/verifications.md)): ask *"is this name taken in
software?"*, unscoped, **before** anything else and before showing Noah a candidate. Asking
*"is another planner called this?"* returns a confident empty result for an occupied name.
That error cost the Perennial round.

### Closed

| # | Question | Answer |
|---|---|---|
| Q-01 | Licence — brief said AGPL, Doctrine §8 says PolyForm Noncommercial | **PolyForm NC 1.0.0.** Noah 2026-07-27: *"Doctrinal intent is correct."* [ADR-0017](docs/adr/0017-licensing.md) is Accepted. |
| Q-03 | Work-vault policy line, given the GFE context | **No GFE context — the app is not for it.** The vault split is a convenience for separating content; what goes in it is the user's judgement, as with any personal app. Noah 2026-07-27. |
| Q-05 | Terminology skin default for the work vault | **Neutral vocabulary, skin opt-in.** Noah 2026-07-27. Matches what shipped. |
| Q-08 | How "Wynts" is pronounced | **Moot** — the name is withdrawn. The question was the right one; nobody answered it in time to catch that both readings were bad. |
| Q-02 | The app's name | **Quietkeep.** Noah 2026-07-28: *"I like quietkeep and there is nothing on the App Store that I see near it."* Cleared through all five checks — [ADR-0024](docs/adr/0024-name-quietkeep.md), [V-04](docs/verifications.md). |
| Q-09 | The four §10 repo-metadata values | **All four set, by Noah, 2026-07-28.** Description, website, topics (he corrected `indexeddb` himself), and the **social preview uploaded**. Per §10 the repo is now *set up* — and his confirmation **is** the verification: a session cannot read this repo's live metadata at all ([V-11](docs/verifications.md)). |
| Q-04 | Pages subdomain string | **`quietkeep.pages.dev`** — Noah confirmed it clean on his device, 2026-07-28. Production comes off `main`; `staging` gets `staging.quietkeep.pages.dev`, which turns the Doctrine §7 gate into a URL he can open on the iPad. The metadata half of this question is now **Q-09**, because it is a different kind of answer and was hiding behind the subdomain. |

---

## Project facts

- **Reference platform: a personal iPad**, installed to the Home Screen from Safari
  (Noah, 2026-07-27). Every budget is measured there and every surface is designed for
  it first. Desktop is secondary.
- **This is a personal app and is not for government-furnished equipment.** Not
  designed for it, not tested on it, not a control for restricted information. Stated
  plainly in [`docs/data-constitution.md`](docs/data-constitution.md).
- **The folder mirror does not exist on the reference platform** — Safari has no disk
  picker. Export/import via Files carries the whole sync and durability story
  ([ADR-0004](docs/adr/0004-ios-path.md)), which is why it is built in Phase 0.
- **The app is Quietkeep** ([ADR-0024](docs/adr/0024-name-quietkeep.md)), and the repo is
  `njefferson/Quietkeep` as of 2026-07-28. The licence's Required Notice URL moved with the
  slug in the same commit, which is the condition [ADR-0017](docs/adr/0017-licensing.md)
  set. `Horizons` survives only as *domain* vocabulary — *higher horizons* (law 4) and the
  *horizon-integrity engine* — and `changelog:check` asserts it was not lost to a rename.
- **Phase 0 (the spine) is built** — log, fold, write gate, snapshot, export/import, 14
  tests, all four exit criteria met.
- **`main` is at `0.11.0` (`af2e415`), promoted 2026-07-29** — Noah's "Promote",
  onto watched-green **spine run 57** (all 13 steps read individually) with
  **deploy run 54** watched to success. Carries **0.10.0** (bringing a copy
  back), **0.10.1** (the do-now flow, the panel's close and calendar
  confirmation, and the CRITICAL import fix) and **0.11.0** (two devices).
  · Same limit as every promote here: production itself was not read. See
  [V-15](docs/verifications.md) — `quietkeep.pages.dev` is denied by this
  environment's network policy, so the evidence is the deploy run's own green
  Cloudflare step and not the apex URL serving the file.
- **Previously `main` was at `0.9.0` (`6252d26`), promoted 2026-07-29** — Noah's "Promote and
  continue", onto watched-green **spine run 51** (all 13 steps opened and read, not
  inferred), then **deploy run 48** watched to success, its Cloudflare Pages step
  green. This promote carries three releases at once: **0.8.0** (the calendar file —
  the app can reach you when it is closed), **0.8.1**, and **0.9.0** (a passed date
  becomes a decision).
  · **What was NOT verified, and could not be from here:** the live site itself.
  `quietkeep.pages.dev` is denied by this environment's network policy (the proxy
  answers 403 to CONNECT), so the fetch that would have read the deployed `sw.js`
  cache triplet was not possible. The evidence for this promote is the deploy run's
  own green Cloudflare step, which is weaker than a fetch and is recorded as such.
  Earlier promotes in this repo were confirmed the same way; none has been confirmed
  by reading production from a session.
- **Previously `main` was at `0.7.2` (`0bc4040`), promoted 2026-07-29** — Noah's "Promote and
  continue", onto watched-green spine run 45. Production serves the grouped todo list,
  inline tick-off, rename, and the second skeptic's fixes.
- **Previously `main` was at `0.7.1` (`fae1b7a`)** — Noah's "Promote and
  continue", onto watched-green spine run 42. Production now serves the grouped todo
  list, inline tick-off, rename, and the Phase 3.5 audit fixes.
  · **A file was committed that should not have been.** `git add -A` in the 0.7.1 commit
  swept up `tools/.pz.mjs`, a probe script an auditing subagent had written into the repo
  while the audit ran. It is in `main`'s **history** (`fafa0ff`), removed from the tree
  before the promote, and was never in `public/`, so it was never served. No gate caught
  it, because no gate asks "is every tracked file supposed to be here". Recorded in the
  hub's LESSONS: a working tree with concurrent writers is not safe to stage wholesale.
- **Previously `main` was at `0.6.0` (`392372f`), promoted 2026-07-29** — Noah's "Promote and keep
  going", onto watched-green spine run 38; deploy run 35 confirmed production serves it.
  This promote carried **0.5.1**, which fixed a fault that was live on his device: one
  malformed date threw out of the render path before capture's submit handler was
  attached, so the form fell back to a native GET navigation and destroyed typed text
  silently. Earlier real §7 passes: `87dbeb9` (0.4.0, run 31), `d4b40f7` (0.3.0, run 28),
  `265c9f0` (0.2.4, run 25).
  Every one of those was verified by fetch and by opening the run, never inferred (V-10).
- **Repo:** `njefferson/Quietkeep` (renamed 2026-07-28). Branches `staging` and `main` only; ignore any
  harness `claude/*` branch (Doctrine §11).
- **Deploy:** Cloudflare Pages, project `quietkeep`, live. The credential is stored as
  **`CLOUDFLARE_API_KEY`** (the workflow accepts either that or `CLOUDFLARE_API_TOKEN` and
  logs which name it found). `main` → `quietkeep.pages.dev`, `staging` →
  `staging.quietkeep.pages.dev`. Both have deployed successfully from CI.
- **`main` was promoted to troubleshoot, and it worked** (Noah, 2026-07-28: *"Promote to
  main to troubleshoot"*). Nothing would load on his iPad at the time, so the §7 pass could
  not happen first. The promote gave the Pages project its **first production deployment**,
  the apex URL came up, and the pass then happened on the real device — captured,
  force-quit, reopened, data intact. `main` reached a fair state in the wrong order, which
  is recorded rather than tidied away, but the promote was the right call and it was his.
- **Normal flow resumes:** `staging` branches off `main` for future development, promoted
  on Noah's word (Doctrine §7). `main` is the baseline.
- **Hub wiring:** the app is **not yet** linked from
  `noahjefferson/public/index.html`. That edit is deliberately held until there
  is a deployed page to visit — adding a dead link to the live hub is a site
  regression, not progress. Doctrine §13.6 closes when it lands, together with
  the app's About linking back to the shared `/accessibility` statement.
- **Repo metadata: all four §10 values are set** — description, website, topics, social
  preview (Noah, 2026-07-28). **Quietkeep's repo is "set up"**, and this is the first time
  that can be said without a caveat. His confirmation is the verification and there is no
  other: a session cannot read this repo's live metadata — the search API serves a stale
  cached index and the direct API 403s through the proxy ([V-11](docs/verifications.md)).
- **Brand:** the mark is `public/brand/icon.svg` — drawn, not generated, because an icon is
  geometry and 48px legibility has to be measured rather than hoped for
  ([ADR-0025](docs/adr/0025-visual-identity.md)). All PNG sizes render from it via
  `tools/brand.mjs`, which is a CI gate and was made to fail once before being trusted. The
  palette and its measured ratios are `ACCESSIBILITY.md` B-10.
- **Code:** Phase 0 spine, Phase 1 (shell, Dump surface, ⓘ panel, export, public capture
  surfaces + CSP), Phase 2 (triage), Phase 3 (work mode), Phase 3.5 (detail sheet, the
  grouped todo list, rename). `main` is at 0.6.0; `staging` carries 0.7.0 on top.
  `staging` → `staging.quietkeep.pages.dev`, `main` → `quietkeep.pages.dev`, both live.
- **UI is the platform, no framework**, and there is exactly one build step — esbuild,
  stripping types and bundling `src/ui` to `public/app.js`, which is generated and not
  committed ([ADR-0026](docs/adr/0026-ui-and-build.md)).
- **`npm run smoke`** is a gate: a headless walk of the *built* app that captures a
  thought, reloads the whole page, and asserts it came back. It was made to fail once
  before being trusted.

### Log

- **2026-07-29** — **Two builds, one branch — and the gate that makes the default's
  promise real ([ADR-0036](docs/adr/0036-two-builds-one-branch.md),
  [ADR-0037](docs/adr/0037-sync-design.md)).** Noah asked for two apps: Quietkeep,
  always local-only, and a sync variant — *"Quietkeep is always the default"* —
  and asked how the industry does it.
  · **The industry answer**: overwhelmingly one codebase with sync as an opt-in
  module (Obsidian + Obsidian Sync, Standard Notes, Joplin). Two long-lived
  branches is the rare shape, and where it exists it is usually a governance split
  between different maintainers, not a privacy toggle.
  · **So: two Cloudflare sites, two builds, ONE branch.** The argument that
  settled it is concrete rather than aesthetic — 0.10.1 fixed a CRITICAL defect
  where a validated import file could destroy a store and then fail. On two
  branches that needs applying twice, and **the copy carrying a missed
  cherry-pick longer is the one with more exposure.**
  · **The guarantee is already in `public/_headers` and nobody had noticed.**
  `connect-src 'self'` means the default build **cannot reach another host — the
  browser refuses**, whatever code is in the bundle. That is enforcement, not
  discipline, and it is a far stronger promise than "sync is switched off".
  · **`tools/headers.mjs` is a new gate**, because that guarantee is one line and
  one line erodes quietly: a font host, a debug endpoint, a report collector.
  Proven by breaking it four ways — widening `connect-src` to a relay, a font
  CDN, removing `connect-src` so it is inherited rather than stated, and a
  `report-uri` — **all four went red**.
  · The sync design itself is recorded but **not built**. ADR-0037 names the
  three things that still need Noah's word: the doctrine wording (a sync id is
  account-shaped, and "no accounts, no server" stays true only of the default
  build), re-running V-03 against Apple's own documentation if push is ever
  added, and whether this is a **VERSION** — which is his call and is not
  inferred from diff size.
  · Sync at the visibility boundaries, not in the background: leaving the app
  uploads, opening it pulls. True background execution buys only "current before
  you open it", and costs push, an install, an entitlement and V-03.
  · The exposure is written out in full in ADR-0037 rather than summarised — what
  a relay can never see, and what it unavoidably can: **when you use the app, how
  often, and from where.** For this audience that is the shape of your day, and it
  is stated at that weight rather than minimised.

- **2026-07-29** — **Two devices (0.11.0 CAPABILITY,
  [ADR-0035](docs/adr/0035-multi-device-shard-union.md)).** Noah: *"It should be
  opt-in for multi-device sync, and I will want to have my personal copies sync
  so I can go from one device to another when I walk out of my office."*
  · **The data model was already there and it was checked before anything was
  built**: folding two devices' logs through the real gate gives everything from
  both, iPhone-first equals iPad-first equals any interleaving, and nothing is
  left silent. `seqByDevice` and per-field last-writer-wins have carried this
  since the spine.
  · **What was missing was a route, not a merge.** [V-01](docs/verifications.md)
  settles that Safari has no directory picker, so ADR-0003's automatic folder
  mirror cannot exist on either of his devices. This is the manual version of the
  same operation, needing no API Safari lacks and no network at all.
  · **It is not the merge law 9 forbids.** That means resolving two versions of
  one state, which cannot be done honestly, and `import.merged` stays banned.
  This is the union of single-writer shards — ADR-0003's own words — where two
  shards cannot disagree about what *happened*. ADR-0035 makes the distinction
  explicit so it is reviewable rather than assumed.
  · **Additive, so it cannot cost anything.** Restoring replaces and is dangerous
  by design; this removes nothing, so pressing it on the wrong file costs a few
  events. The two are separate buttons saying separate things, and the safe one
  is what focus lands on.
  · **Deletions travel**, so it converges rather than accumulating. Taking the
  same copy in twice costs nothing and says so — that is the ordinary case for
  anyone actually using two devices, and an unfiltered append would have thrown
  on the store's unique-id index.
  · **Stated limit, not hidden**: edit the same field on both devices before
  exchanging and last-writer-wins picks one silently.
  · **Not assumed for anyone else.** Noah has cellular on both devices and said
  plainly *"you can't assume everyone will"* — so nothing here touches the
  network, and the app is complete without ever opening this.
  · Verified in **two real browser contexts** with separate IndexedDB stores:
  each captured its own items, one took in the other's copy, both sets survived,
  and a second exchange took nothing.
  · 188 tests, all 8 gates green. Lands on `staging`; waits for Noah's word.
  · **Still open, and his call**: whether the manual exchange is low-friction
  enough in real use. If it is not, the next question is a transport — and every
  candidate (a relay, a native wrapper) crosses a line in the thesis, so it is a
  separate decision and a separate record, never an implementation detail.

- **2026-07-29** — **Three things Noah found on the device, and two the audit did
  (0.10.1 ITERATION).** All of it came from actually using the app, which no gate
  in this repo can substitute for.
  · **"There is nothing to mark the item done rather than starting a 2 minute
  timer."** Routing something to *Do now* clocked it for today and then offered
  no way to say you had done it, so a two-minute job sat under "Ready now" until
  you found it in the list. The timer also **started on its own**, turning a
  category into a stopwatch nobody asked for — Noah's words: *"the 2 minute timer
  should be an offering, not a gate"*. It is now offered beside a **Done**, and
  Done is one tap before the timer, during it, and after it.
  · **"Doesn't ask you if you completed it in the two minutes."** Reaching zero
  committed `outcome: 'completed'` — **the app asserting, in a permanent log,
  that a person had finished something it never asked them about**, for an
  audience whose whole difficulty is with time. It now asks, and records nothing
  until answered. Neither answer is a failure.
  · **A bug underneath that report**: `#triage-donow` lived INSIDE the triage
  section, which hides itself the moment the inbox is clear — so routing your
  **last** item to *Do now* made the offer vanish, and a running timer went on to
  reach zero invisibly. The old comment said it lived "outside the card", which
  was true and not enough. It is now outside the section.
  · **"Pressing calendar shows no indication it did anything."** It always
  worked. The confirmation renders *above* the button, the panel is thousands of
  pixels tall, so by the time you had scrolled to the button the message was off
  the top of the screen. Moved below it.
  · **"There is no X to close the popup."** The only way out sat beneath every
  release note — **measured at 10,130px down**. There is now a sticky close at
  the top. At 320px and 200% text it first took **99% of the dialog**, which the
  a11y gate caught as WCAG 2.2 **2.4.11 Focus Not Obscured**; compacted to 48%
  with the title intact, and `scroll-margin-top` keeps focused controls clear of
  it. A `rem` threshold in the media query silently never matched — inside a
  media query `rem` resolves against the *initial* root font size, not the
  zoomed one.
  · **From the audit, CRITICAL and now fixed**: a file `inspectExport` called
  READY could destroy the store and then fail. Two records sharing an id passed
  inspection, the append hit the unique-id constraint **after** the clear, and
  the user's real items were gone — replaced by whichever rows landed first, with
  a raw database error on screen, under a patch note promising exactly the
  opposite. `inspectExport` now asks every question the store will ask (duplicate
  ids, and the gate's own shape rules from one shared definition), and
  `store.replaceAll` is **atomic**, because validation can never rule out a quota
  failure mid-write.
  · **Also from the audit**: `inspectExport` could throw (`fold` reads payloads
  unguarded, outside the only try) leaving the surface on "Reading it…" for ever;
  import bypassed every shape check the gate makes, so `seq: 1e999` produced a
  permanently unwritable store; and `DexieLogStore.reset()` cleared `kv`, so
  every successful import silently discarded the in-flight capture draft — the
  thing ADR-0008 exists to protect. `MemoryLogStore` never did, which is why no
  Node test could see it.
  · **A tooling lesson**: spreading `AppEvent` in a test took `tsc` from 2s to
  over 3 minutes. It is a large discriminated union and the spread distributes
  across every member.
  · 183 tests, all 8 gates green, both themes.

- **2026-07-29** — **The way back in (0.10.0 CAPABILITY).** The app could hand you
  your entire log and had **no way to read one back**. `importSeedingFresh` existed,
  was tested, and had no surface at all — so moving to a new device meant starting
  again, and the Export button produced a file nothing could open. For an app with
  no accounts and no server, that is not a missing feature; it is the "your data is
  yours" promise with no exit.
  · **Choose, be told, confirm.** `inspectExport` reads a file and describes it
  **without touching anything** — how many things, how many records, when it was
  made — and the destructive control does not appear until it has. It **never
  throws**: a corrupt or hostile file is an answer, not an exception, and this is
  the surface people reach for when something has already gone wrong.
  · **One definition.** `importSeedingFresh` re-asks the same function at the
  destructive boundary rather than trusting that the surface looked. The failure
  it prevents is a panel saying "37 things, ready" and the import then refusing,
  which is worse than either answer alone because the person has already decided.
  · **Saving a copy of what is here is offered first and listed first**, because
  import replaces and never merges (law 9) — and the app says so in those words.
  · **Found by the smoke walk, not by reasoning**: the panel's "Things held" used
  `nodes.size` while the gauge on the screen behind it used `heldNodes`, so one
  sentence read *"that file holds 8 things … replaces the 9 things on this
  device"* about a file exported from that device seconds earlier. Same words,
  two numbers, differing by whatever had been let go. Both now use `heldNodes`.
  · 178 tests, all 8 gates green, both themes. Four §6 deliberate-failure proofs;
  one (`items` counting every node) **stayed green on the first attempt** and got
  a real test before it counted.
  · Lands on `staging`; waits for Noah's word.
- **2026-07-29** — **A date that has gone by is a decision, not a row (0.9.0 CAPABILITY,
  [ADR-0034](docs/adr/0034-replan-cards-are-computed.md)).** `CLAUDE.md` has claimed since
  the beginning that product law 3 "carries teeth in code". **It did not.** `fold` had no
  `replan.raised` case at all, so a replan card could not exist in state, and a hard date
  three days behind you rendered as "ready now" — indistinguishable from something due this
  afternoon, which is the *past bucket* law 3 forbids, wearing the present tense.
  · **Only hard clocks raise a card.** The gate writes a `review` cure clock for **every
  capture**, so counting soft clocks would manufacture one shame surface per captured
  thought — law 3's forbidden bucket arriving through ADR-0011's front door. Recurring
  upkeep is carved out for the same reason: law 5 says an upkeep is never a failure to have
  not done yet, so a plant that wanted water on Tuesday comes round as a chip.
  · **Computed, never stored, and ADR-0012 could not have both.** It said "the fold
  generates `replan.raised`" one sentence after "a computed consequence… cannot go stale".
  `fold` is pure and has no clock, so it structurally cannot do the first; giving it one
  would break `state = fold(log)` and make the second false. Nothing emits `replan.raised`.
  ADR-0034 records it; ADR-0012 and the vocabulary are corrected in place rather than
  quietly rewritten.
  · **One item, one question.** `workSurface` excludes every id with a live card, chips
  included. The held list keeps them — the sum of its groups is what the coverage gauge
  counts — under **its own heading**, because a screenshot showed four of them filed as
  "Ready now" with Done buttons: the very defect the exclusion prevents, relocated. **No
  assertion caught that; looking at the render did.**
  · Five resolutions, none of which files a failure. Each retires the date it resolved —
  without that the card came straight back, so resolving it resolved nothing, and my own
  test caught it.
  · The cap is 3 (law 8) while the exclusion is uncapped, so the view states the **true
  total** and the list still holds every one. A cap that hides work is a lie by omission.
  · 170 tests, all 8 gates green, both themes. Four §6 deliberate-failure proofs run
  against the new smoke checks — drop the exclusion, drop the list branch, stop retiring
  the date, invent a date for an empty box — and **all four went red**.
  · **Then three skeptics ran, and the first version of this entry was too
  confident.** Everything below was reproduced, and fixed in the same release:
  · **A resolution retired one clock, not all of them.** A node with a passed `due`
  *and* a passed `suspense` came straight back for four of the five options —
  buttons that did nothing while announcing that they had. `compress` retired
  nothing at all, on reasoning true only when the passed clock *was* the `due`.
  **Fourteen of the fifteen (choice × clock-shape) cases had no test**; every
  existing call passed `'due'`.
  · **0.9.0 silently broke 0.8.0.** `ics.ts` selected calendar entries from an
  ALLOWLIST of group keys, so adding the `replan` group dropped every passed hard
  date out of the `.ics` — the one thing a reminder is most for — with all eight
  gates green, because the smoke check compares the file against the surface's own
  promised count and both moved together. Now an exclusion, so a new group
  defaults to included.
  · **Four gate checks were theatre.** The cap asserted against the constant the
  code uses (self-referential — raising it to five stayed green); the "order is
  total" test was `f(s) === f(s)`, true of any pure function; `card.fed` compared a
  constant with itself; and `replanWords` / `contextWords` / `countWords` had **no
  coverage at all**, so a card 400 days behind could read "that date was yesterday"
  and pass.
  · **Copy that was not true**: "a Menu item carries no clock" (the gate cures the
  cleared date, so it carries one — and law 6 governs *kinds*, not Menu
  membership); "the commitment this **fed**" (no dependency exists in the log to
  describe); "asked about once, in one place" (the held row still offers Done);
  "each branch terminates on its own rather than leaning on the gate's cure"
  (three of five do lean on it).
  · **An Area with a due date got five action-shaped buttons**, one of which turned
  it into a waiting-for — refused by Next-up under law 4 and offered here at the
  same moment. And `escalate` wrote `from: 'action'` into an append-only log
  whatever the node actually was.
  · **A recurring upkeep that had come round again was filed under "Done"** while
  the chip beside it offered it as live work — one node, two contradictory
  statements. Pre-existing, and ADR-0034 had just asserted otherwise.
  · **Known and unmeasured, recorded rather than papered over**: `.replan-context`
  renders only for a node carrying a `suspense` clock, and no surface can write one
  yet, so its *rendered contrast* is untested. Its wording and guards are
  unit-tested. The a11y comment previously called that omission a virtue.
  · Lands on `staging`; waits for Noah's word.
- **2026-07-29** — **The app can reach you when it is closed (0.8.0 CAPABILITY,
  [ADR-0033](docs/adr/0033-calendar-export-t1.md)).** This closes a hole in the **thesis**,
  not a missing feature: NOTES says the return "is not a feature — it is the structural
  property the whole schema exists to guarantee", and until now that guarantee held only
  **while the app was open**. Everything built so far depended on Noah remembering to look
  — which is precisely the capacity the app exists to compensate for.
  · **T1 per [ADR-0007](docs/adr/0007-notification-tiers.md)**: an `.ics` with `RRULE` and
  `VALARM`, handed to the OS calendar, which already has notification permission and
  already runs when this app does not. **No server**, which is part of what this app is.
  · **All-day events, so the file contains no `VTIMEZONE` and no `TZID` at all** — a clock
  here is an end-of-local-day instant, and a timed event would fire every reminder at
  23:59. The alarm is relative (`PT9H`), so the calendar resolves 9am *where the reader
  is*, without the file naming a zone. Tests pinned to Denver and Kiritimati (+14), as
  build-plan item 30 requires in so many words.
  · **One definition of what belongs in it**: the `ready`/`soon`/`later` groups from
  `held.ts`. A second rule would eventually disagree with the first and leave the user with
  a calendar quietly contradicting the app.
  · Escaping and folding are load-bearing, not housekeeping: a share-target capture
  composes text with **newlines**, and a bare newline terminates a property and corrupts
  the file. A test feeds it `a;b,c\d\nSUMMARY:INJECTED\nEND:VEVENT` and asserts one event
  survives. Folding is at 75 **octets** on a code-point boundary.
  · **T0's badge landed with it**, counting only the `ready` group — a badge showing
  everything you hold is a number that never falls, which is a nag rather than information.
  · The button is **never disabled**: with nothing to send it stays reachable and says so
  when pressed, because a disabled control is invisible to a keyboard user and explains
  nothing. That change came out of the a11y gate refusing to audit an unreachable ring.
  · **Still unverified, and it is the only verification that counts**: whether the OS
  calendar actually fires these alarms on Noah's iPad with the app closed. CI structurally
  cannot prove it.
  · 133 tests, all 8 gates green. Lands on `staging`; waits for the audit and Noah's word.
- **2026-07-29** — **What you are holding is a todo list now (0.7.0 CAPABILITY,
  [ADR-0031](docs/adr/0031-node-renamed.md), [ADR-0032](docs/adr/0032-held-list-grouped.md)).**
  Noah: *"have a todo list of some sort maybe soon?"*
  · **Grouped**: Not sorted yet · Ready now · Coming up · Later · On the Menu · Done.
  Computed, stored nowhere, empty groups not rendered, and **no counts and no score** —
  they are headings, not a tally of things undone (law 5). **Totality is the load-bearing
  property**: every held node lands in exactly one group and the groups sum to the same
  number the coverage gauge claims, proven over a 60-node fuzz.
  · **Tick it off in place.** The card became a row with two controls; it had been one
  large button, which is why it could not gain a second (a button inside a button is
  invalid HTML).
  · **Rename** — the first addition to the closed vocabulary since it was written, so it
  cost an ADR rather than being absorbed quietly. `node.field.set` was the obvious reuse
  and is wrong: fold writes it to `n.fields`, never `n.title`, so it would store a shadow
  title no surface reads — the log lying rather than merely silent.
  · **An honesty fix**: a finished item keeps the gate's cure clock, and the list reported
  that as "returns today". It says `done` now.
  · **A real defect fixed**: `handleUrlEntrances` and its undo called `render()` bare,
  dropping `openDetail`, so after a link capture no card opened its sheet until the next
  re-render. Smoke asserts tappability after a URL capture, made to fail first.
  · **The a11y gate caught two more in my own work**: a group heading as an `<li
  role="presentation">` strips the listitem role and leaves a `<ul>` holding a
  non-listitem (serious axe `list` violation — the grouping would have been invisible to a
  screen reader), and `.card-done` was registered in a state where it does not exist, which
  the registry correctly refused as "matches nothing visible" rather than passing blind.
  · **ADR rule 4 applied to myself**: the first draft was one record covering rename *and*
  the list. "If it needs 'and', it is two records" — so it is two.
  · 109 tests, all 8 gates green. Lands on `staging`; waits for the audit and Noah's word.
- **2026-07-29** — **Phase 3.5: the app is a planner now, not a triage loop (0.6.0
  CAPABILITY).** Tap anything you are holding and a detail sheet opens: give it a real
  date or take one off, make it repeat (its own interval AND its own comfort window),
  take back a "done", keep something you had let go, or put it on the Menu. Every intent
  is built from events **already in the closed vocabulary** — nothing new was invented.
  · **Why this jumped the build-plan order** (Noah: *"I want to be able to play with it and
  test it… have a todo list of some sort maybe soon"*): an audit of what the UI could
  actually emit found **11 of 90 event kinds**, no date input anywhere, and — worst —
  `upkeep.interval.set` had **no caller at all**, so the decay primitive and the Upkeep
  chips shipped in 0.5.0 were unreachable by construction. Phase 4 (focus anchors) would
  have added more engine to an app you still could not plan with.
  · Dates resolve by **probing the user's zone**, because no fixed UTC hour is inside the
  same local day everywhere — offsets run −12 to +14, so noon UTC on the key date is
  already tomorrow in Kiritimati. Tested in six zones including +14, +12:45 and −11.
  · The a11y gate caught the sheet overflowing **121px** at 320px/200% — the repeat row
  cannot fit on one line at that size — and it now becomes a column.
  · **Still missing, and named so it cannot be forgotten:** there is no **rename** (the
  vocabulary has no event for changing a title, so it needs a deliberate addition, not a
  slipped-in one) and no **Menu surface** yet, so someday/reference items are reachable
  only through the sheet.
- **2026-07-29** — **The Phase 3 audit (three skeptics) found a defect that could brick the
  app, and it shipped as 0.5.1 the same day.** 96 unit tests now, all 8 gates green.
  · **Severe, and live in production when found:** one malformed date anywhere in the log
  threw `RangeError` out of the render path — which runs *before* capture's submit listener
  is attached. A form with no submit listener does a **native GET navigation**, so anything
  typed in that state was cleared and destroyed with no error, permanently, across reloads.
  The data was intact and unreachable. It was a **regression** introduced by the V-13 fix:
  the old `friendly()` divided milliseconds and degraded to the harmless string
  "Invalid Date". Three locks now — `isValidIso` at every caller, the gate refusing
  non-instant dates at the door, and try/catch around every render including the first.
  · **Un-completable items:** two guards disagreed about an interval of 0, so an item could
  ride a stale cure clock for ever while Done did nothing. One predicate now.
  · **Vanishing work:** `due ?? start ?? suspense ?? review` was a precedence by *kind*
  named "soonest", so an item with a review-today and a due-next-month dropped off the
  surface entirely. Any demanding clock now counts.
  · **Law 4:** goals, areas, outcomes and projects were offered as the next thing to do,
  with a Done button. The runway is the only workspace.
  · Chips ignored the Menu and inbox exclusions (law 1 clause c); a ready upkeep rendered
  **twice** on one screen with two Done buttons; the gauge counted trashed nodes its own
  list omitted; NaN cadence produced the *loudest* phrase in the app; resume cards could
  never retire; focus stranded on `<body>`; failures were announced only to screen readers
  ([F-08](ACCESSIBILITY.md)).
  · **Two of my own gate checks were proven THEATER** and rebuilt: "the completed thing is
  no longer offered" passed with the fix deleted, and its comment falsely credited the smoke
  walk; "every held item is listed" only asserted `rows > 0` and passed with the list
  truncated to one. Both now ask the question that matters.
  · **Two false claims of mine corrected:** ADR-0030 said ranking "already knows where
  resume cards go" (nothing could retire one); `time.ts` justified its DST shortcut with
  "transitions happen between 01:00 and 03:00 in every zone", which an enumeration of all
  15,887 IANA transitions 1990–2040 disproved — Nuuk and Scoresbysund shift at 23:00, and
  Santiago falls back over midnight. The overlap is now resolved to the later instant and
  checked against an independent bisection oracle over 10,220 zone-days.
- **2026-07-29** — **Phase 3 (work mode) is building on `staging`: the app is now worth
  opening in the morning (0.5.0 CAPABILITY, [ADR-0030](docs/adr/0030-work-mode.md)).**
  It opens with **one thing to do**, chosen by a fixed precedence — hard landscape >
  resume cards > pressure > anything else whose clock arrived — and it says which tier
  fired, in words. **"Not this" records nothing**: no event, no field, no persistence, and
  the smoke walk counts the IndexedDB log before and after a skip to prove it rather than
  assert it. Behind the head sits a capped five; Upkeep chips carry the recurring things;
  and the coverage gauge became a **button** whose number opens into the itemised list that
  backs the claim. The decay primitive ([ADR-0010](docs/adr/0010-decay-primitive.md)) is
  now real code: `(elapsed − interval) / comfort_window`, continuous, unbounded, computed
  at read time and stored nowhere — `null` rather than `0` where there is no cadence, and
  **never-done is ready, not infinitely late**.
  · **[V-13](docs/verifications.md) is fixed first**, because everything here says
  "today": `src/time.ts` is a pure zone-aware primitive, the zone read once at the UI edge
  and threaded through `openSession` → the gate → the route intents, never stored in the
  log. The display path had the same bug (`friendly()` divided elapsed ms, so it said
  "today" at 23:00 about tomorrow). Eight zone tests pinned to Denver, Kiritimati (+14) and
  Chatham (+12:45); reverting the primitive fails five of them.
  · **The gates caught two real defects in my own work**, which is what they are for: a
  completed one-off was offered for ever (the gate re-clocks `done.marked` to keep it
  non-silent, so an explicit "done and not recurring is finished" check was needed), and
  `.coverage { display: flex }` **silently defeated the `hidden` attribute** — the list
  rendered expanded while `aria-expanded` said `false` ([F-07](ACCESSIBILITY.md)). A
  global `[hidden] { display: none !important }` is the structural fix.
  · The **banned-vocabulary gate rejected my own comments** for explaining the prohibition
  using the prohibited word. ADR-0010 says it belongs only in that record and the
  vocabulary, so the comments were reworded rather than the gate widened.
  · Deferred with a reason: build-plan item 22 (comms-sweep chip on focus-exit ramps)
  needs focus ramps, which are Phase 4.
  **70 unit tests, all 8 gates green. Lands on `staging`; waits for the adversarial audit
  and Noah's word.**
- **2026-07-28 (evening)** — **Phase 2 is building on `staging`: the app can triage what it
  holds (0.4.0 CAPABILITY, [ADR-0029](docs/adr/0029-triage-model.md)).** Two passes, both
  computed from the log: an optional **heat** pass (hot/cold, `heat.set`) and a forced-choice
  **clarify** pass with six routes, each committing `clarify.routed` **plus its own terminal
  event** in one gated commit — do-now/next-action/waiting-for clock, waiting-for also changes
  the node kind, someday/reference to the Menu, trash trashes. Building the §6 proof
  corrected a false claim I had written into the first draft: the gate's `clarify.routed`
  cure is **unreachable** — a node is always already covered by the time it is routed, and
  routing removes no coverage, so the cure never fires. The real floor is that a captured
  node is covered from capture onward; a bare route (terminal event forgotten) stays under
  its capture clock, and when that clock is also stripped it is `clock.cleared`'s cure that
  holds — both asserted, both made to fail first. `fold` learned
  `heat`/`route`/`sourceTags` (LWW-stamped; snapshot round-trip tested after the audit's lossy
  finding). The smoke walk captures six, drains the heat pass, routes all six ways and reads
  `0 silent` from the held gauge; a11y renders both passes in both themes.
  A 320px/200% overflow the triage grid introduced was caught by the a11y gate and fixed
  (`minmax(min(9rem,100%),1fr)`). The 0.3.0 promote to `main` was a real §7 pass (verified by
  fetch), Noah's earlier "Promote and continue" this session.
- **2026-07-29** — **The Phase 2 adversarial audit ran (four skeptics) and it earned its
  keep.** Every finding was fixed on `staging` before any promote (45 unit tests now, all
  gates green):
  · **Crash on upgrade (live):** a pre-Phase-2 snapshot has no `sourceTags`, and the clarify
  queue threw on `.includes` with 2+ inbox items — the update breaking the inbox, which the
  data law forbids. `deserialiseState` now backfills the Phase-2 fields; `captured ?? true` is
  correct for legacy data.
  · **Inbox pollution:** membership was keyed on `route === null`, so any unrouted node (a
  person, a bother, a Menu-promoted action) would enter clarify and hard-fail its routes. Added
  a `captured` provenance latch; the inbox is captures-not-yet-routed only.
  · **`sourceTags` holed copy-on-write** (aliased the base node and the log payload) — now
  cloned on write and copied on store.
  · **Focus fell to `<body>` after every triage tap** (WCAG 2.4.3) — now moved to the prompt;
  the a11y gate activates a route and asserts it, made to fail first.
  · **do-now timer** mis-attached to the next card and could drop its outcome or double-commit —
  now in its own region, `finish()` idempotent, starts only on a landed route.
  · **Gate theater:** `.includes('0 silent')` is true for "10 silent" — now parses the number.
  · Documented (not patched): the same-day clock uses end-of-**UTC**-day ([V-13](docs/verifications.md)).
  **Promoted to `main` the same day** on Noah's "Promote and continue", onto spine run 31
  watched green — so `quietkeep.pages.dev` serves triage.
- **2026-07-27** — Repo bootstrapped (Doctrine §13 items 1–4). Verification pass
  run and recorded. v1 frozen. Event vocabulary defined. 19 ADRs written. The
  three docs generated. Build plan written. No application code.
- **2026-07-28 (evening)** — **Phase 1 is complete, and behind a strict CSP.** The three
  public capture entrances shipped — `/capture?text=`, Web Share Target, and the manifest
  `?capture=1` shortcut — each landing in the same gated `captureEvent`, each with a visible
  confirm and an undo, each scrubbing its query so a refresh cannot re-fire it. A strict
  `default-src 'none'` CSP landed in the same change (0.3.0, [ADR-0028](docs/adr/0028-public-capture-surfaces.md)),
  possible here because the app has no inline script; it is verified by `serve.mjs` applying
  the real `_headers` so every browser gate runs under it. Promoted 0.2.4 to `main` first
  (Noah's word), so `quietkeep.pages.dev` serves the audited app.
- **2026-07-28 (evening)** — **The claimed a11y gate exists now, and it caught a real
  defect on its first run.** `tools/a11y.mjs` audits the *rendered* app in CI — per-state
  selector registry, computed contrast in both themes, axe 4.10.2, targets, and 320px at
  200% text. Its first run found **F-01**: the storage note sat inside the `<dl>`, invalid
  to assistive tech; fixed in the same commit the gate landed (B-08's rule, kept
  literally). Proven to bite both ways: a broken token → 16 failures, exit 1. Smoke also
  gained the cold-capture **CI proxy** — 134 ms boot / 67 ms write against generous
  bounds; the binding 2 s number remains a device reading. Shipped as 0.2.2.
- **2026-07-28 (evening)** — **The write path is serialized and the worst network is
  handled.** Two defects from the model-switch review fixed with proofs: concurrent
  commits could silently collide on `(device, seq)` — Dexie's index is non-unique — so
  commits now queue, with a test that fails when the queue is bypassed; and navigation was
  network-first with no deadline, so lie-fi could hang the shell past the 2-second budget —
  it now races a 2 s deadline and serves the cached shell while freshening behind.
  [ADR-0027](docs/adr/0027-cure-stamps.md) settles the tension the review surfaced: cures
  *share their cause's stamp* by design (replay determinism), so gap-freeness is defined
  over offered events and cures are derivable attachments. Releases 0.2.0 (ⓘ panel,
  export — which fixed the "export a copy" copy pointing at a door that didn't exist) and
  0.2.1 shipped with the changelog now a generated, gated artifact: CI asserts the head
  triplet equals the service-worker cache name and each bump matches its declared kind.
- **2026-07-28** — **Quietkeep ran on the iPad, and V-00's first half is answered.**
  `persist()` returned **true** with notifications granted, quota **38 GB**, and the app
  survived a force-quit with its data intact — the promise tested the only way that counts.
  The gauge read `1 held · 0 silent` off **2 events for 1 node**, which is the gate's cure
  firing on the device rather than only in Node. Step 2 — does `persisted()` still say yes
  tomorrow — is the half that matters and is still open.
- **2026-07-28** — **Phase 1: the app exists.** Shell, manifest, service worker, and the
  Dump surface — zero chrome, one line per card, drafts persisted per keystroke, every
  write through the gate and committed *before* the UI confirms. Two decisions the build
  plan deferred are settled in [ADR-0026](docs/adr/0026-ui-and-build.md): **no framework**
  (the platform does dialogs, focus and keyboard better than anything I would add) and
  **one esbuild step**, because TypeScript was chosen deliberately and browsers cannot
  strip types. The headless walk asserts the promise rather than the plumbing — capture,
  full reload, still there — and was made to fail first by dropping the write while
  leaving the "Held." confirmation in place, which is exactly the lie ADR-0008 exists to
  prevent. **`public/index.html` now exists, so the deploy stops skipping.** The shell
  also carries the V-00 storage panel, which unblocks the repo's oldest open check.
- **2026-07-28** — **The repo metadata is finished, and I was wrong about it twice.** Noah
  set all four §10 values and uploaded the social preview. I twice reported the `indexed`
  topic as still broken, quoting an API response — **he had fixed it before the first
  report.** The GitHub *search* API is a cached index, and its own stale `updated_at` was
  sitting in the same payload, frozen across four pushes, unread both times. The direct API
  403s through the proxy, so a session cannot read this repo's live metadata at all: §10
  confirmation is Noah's word and there is no second opinion. Recorded as
  [V-11](docs/verifications.md) — the error worth keeping is that "read back from the API"
  was reported as *stronger* than the owner's word when it was weaker.
- **2026-07-28** — **No spiral, and the mark came out of the dark.** A spiral is loss of
  control and anxiety-laden; it is now a flat product rule beside no red walls and no
  streaks. The palette inverted rather than paled — the three-step ladder needs ~9:1 of
  range, so lightening the field meant darkening the wall. It measures better than what it
  replaced and fixed a grayscale collapse at 32–48px nobody had caught.
- **2026-07-28** — **Quietkeep has a face.** Five candidates came back from image
  generation; the background that won is the one that says the epigraph — things set down,
  one small light — and the one that lost did so because it reads as an orbital diagram,
  which belongs to *clear-horizons*. **None of the three generated icons survived 48px**,
  so the mark was drawn instead: an icon is geometry, and contrast can be measured rather
  than re-rolled. `tools/brand.mjs` renders every size and checks them, and it was broken on
  purpose first — `1.41:1`, exit 1 — before being believed. Its own first version measured
  the type against itself and reported a meaningless `1.00:1`; it now measures the plate
  behind the text. [ADR-0025](docs/adr/0025-visual-identity.md), `ACCESSIBILITY.md` B-10.
- **2026-07-28** — **The repo is `njefferson/Quietkeep`**, and the deferred `LICENSE.md`
  Required Notice URL moved with it. Q-04 closed — Noah confirmed `quietkeep.pages.dev`
  clean, so V-04 is VERIFIED. Cloudflare secrets are in place and the deploy workflow
  exists, mapping `staging` to a preview URL so the §7 gate is something he can open rather
  than a convention I observe; it skips cleanly because there is still no app shell.
  **And the Spine gate turned out never to have passed** — four runs, four failures, all at
  `npm ci`, on invalid JSON in `package.json`. Every session had verified the spine by
  invoking the tools directly, which bypasses that file, so local was green while CI was
  red and nobody opened the run. Fixed, and **run 5 is the first green one**. Recorded as
  V-10 and in the hub's LESSONS.md; the rule is *if you cite a workflow, open the run.*
- **2026-07-28** — **The app is Quietkeep.** Noah chose it and ran the App Store check on
  his own device. It cleared all five checks in the order ADR-0023 established, starting
  with saying it out loud. Q-02 closed after four names and thirty-odd further candidates;
  Q-04 unblocked to `quietkeep.pages.dev`. The round's candidates and their causes of death
  are appended to the graveyard — it is the trail the search took, and it stays open for
  reconsideration rather than closed as exhausted.
- **2026-07-28** — Named **Wynts**, then withdrew it the same day: it sounds like *wince*,
  which the app's own shame-free voice rules forbid. Every check run against it was a
  REGISTRY check; none said the word out loud. Saying it aloud is now check #1. The name
  never reached `main` — the staging gate contained it. Earlier: named Wynts after
  twenty-three candidates; *Detent* and
  *Parallax* both died to the proper checks (an App Store app; a same-category PM
  platform). Built **Phase 0** on `staging`: the property test caught a real bug where
  captured items were created with no way back to the user. Earlier the same day —
  named Perennial, then **withdrew it**: three software
  companies hold it and Noah found `perennial.pages.dev` occupied on his phone. The
  recommendation rested on two searches that asked *"is another planner called this?"*
  instead of *"is this name taken in software?"* — the standing rule above exists so it
  does not recur. Also corrected V-04a (a VERIFIED row that was wrong, and the
  recommendation built on it), proved V-05 (`pages.dev` unreachable from a session) and
  V-09 (a query shape that returns SEO articles instead of products). Opened Q-06/Q-07 on
  the astro app's naming and hub description.
- **2026-07-27** — Noah answered all six open questions. Q-01, Q-03, Q-05 closed;
  Q-02 reopened as a rename. **Platform corrected: iPadOS is the reference platform,
  not a fallback** — the folder mirror demoted to a desktop convenience, export/import
  promoted to the durability story and moved into Phase 0, capture budget re-pinned to
  the iPad. V-06 (GFE) withdrawn as out of scope; V-07 promoted to **V-00** as the
  highest-value open check. Added to the hub's governed-apps list.
