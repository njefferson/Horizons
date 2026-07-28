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
- **`main` is at `f1092e8`** (the troubleshooting promote). **`staging` is ahead** by the
  0.2.x work — the ⓘ panel, export, the write-path and network fixes, the a11y gate, and the
  adversarial-audit fixes — none of it promoted. `main` serves 0.1.0 at `quietkeep.pages.dev`;
  `staging` serves the current app. Promotion is Noah's call (Doctrine §7).
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
- **Code:** the Phase 0 spine plus Phase 1's shell, Dump surface, ⓘ panel and export are on
  `staging` (0.2.3). `main` still carries only the 0.1.0 shell. `public/index.html` exists on
  both, so neither deploy skips — `staging` → `staging.quietkeep.pages.dev`, `main` →
  `quietkeep.pages.dev` (serving 0.1.0 until a promote).
- **UI is the platform, no framework**, and there is exactly one build step — esbuild,
  stripping types and bundling `src/ui` to `public/app.js`, which is generated and not
  committed ([ADR-0026](docs/adr/0026-ui-and-build.md)).
- **`npm run smoke`** is a gate: a headless walk of the *built* app that captures a
  thought, reloads the whole page, and asserts it came back. It was made to fail once
  before being trusted.

### Log

- **2026-07-27** — Repo bootstrapped (Doctrine §13 items 1–4). Verification pass
  run and recorded. v1 frozen. Event vocabulary defined. 19 ADRs written. The
  three docs generated. Build plan written. No application code.
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
