# NOTES.md — Wynts

> **W**hat **Y**ou **N**eed **T**o **S**ee. Noah's coinage, settled 2026-07-28
> ([ADR-0022](docs/adr/0022-name-wynts.md)) after twenty-three candidates — the graveyard
> and every cause of death are in [ADR-0020](docs/adr/0020-name-perennial.md).
>
> The **repo slug is still `Horizons`** until Noah renames it on GitHub; `LICENSE.md`'s
> Required Notice URL follows the slug and moves in that same commit, not before.
> "Horizons" also survives as **domain vocabulary** — product law 4's *higher horizons*
> and the *horizon-integrity engine* are planning terminology, not branding.

The repo source of truth. **Read this first, every session** (Doctrine §12).
Thesis, invariants, frozen scope, open questions, Project facts. Settled
decisions live here in summary and in [`docs/adr/`](docs/adr/) in full.

---

## Thesis

Most planners are built for someone whose problem is *organising* what they
already remember. Perennial is built for someone whose problem is that a thing
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
| Q-04 | Pages subdomain string + the four §10 metadata values | Yes, before deploy | Unblocked — `wynts.pages.dev` is the obvious candidate and is **unverified** (pages.dev is unreachable from a session, [V-05](docs/verifications.md)) |
| Q-08 | **How is "Wynts" pronounced** — *WINTS* or *WHYNTS*? | No, but it sets fast | Open. A name whose pronunciation people guess at gets said wrong forever; it goes in the README once Noah rules. |
| Q-06 | **The astro app's naming is inconsistent.** Its repo and URL say `clear-horizons`; the hub displays it as **"Astro Planner"** (`public/index.html:258`). The name Noah chose appears nowhere a visitor sees. Does he want the app renamed, or the hub made consistent with the name it already has? | No | **Open — Noah asked to have this kept in front of him.** Raise it each session until settled. Its repo is not in this session's scope (Doctrine §11), so the app-side work needs a session with `clear-horizons` selected. |
| Q-07 | **The hub undersells the astro app.** `public/index.html:258` reads *"Clear-sky & Seestar target windows"* and never mentions recording your horizon — which Noah says is the thing no other astro app does. | No | Open. One-line site change, hub is in scope, but entangled with Q-06 so it waits on that answer. |

**Still owed on Noah's device:** the App Store search for *Wynts*, and a USPTO knockout
in classes 9 and 42 if he wants one. Both are blocked from a session — proven, not
assumed.

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
| Q-02 | The app's name | **Wynts** — Noah's coinage, 2026-07-28. Passed every check available: npm free, no GitHub project, no App Store app, no internal collision, not a framework term. [ADR-0022](docs/adr/0022-name-wynts.md). |

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
- **Name: Wynts** (ADR-0022). Repo slug is still `Horizons` until Noah renames it on
  GitHub; the licence's Required Notice URL moves in that same commit.
- **Phase 0 (the spine) is built and on `staging`** — log, fold, write gate, snapshot,
  export/import, 14 tests, all four exit criteria met. **`main` is docs-only and behind,
  awaiting Noah's explicit "promote"** (Doctrine §7).
- **Repo:** `njefferson/Horizons`. Branches `staging` and `main` only; ignore any
  harness `claude/*` branch (Doctrine §11).
- **Deploy:** Cloudflare Pages. Project not yet created. Subdomain pending Q-04.
- **Hub wiring:** Perennial is **not yet** linked from
  `noahjefferson/public/index.html`. That edit is deliberately held until there
  is a deployed page to visit — adding a dead link to the live hub is a site
  regression, not progress. Doctrine §13.6 closes when it lands, together with
  the app's About linking back to the shared `/accessibility` statement.
- **Repo metadata:** unset. §10 confirm loop not yet run. **Perennial is not
  "set up" until it has.**
- **Code:** none. This repo is documentation only as of 2026-07-27.

### Log

- **2026-07-27** — Repo bootstrapped (Doctrine §13 items 1–4). Verification pass
  run and recorded. v1 frozen. Event vocabulary defined. 19 ADRs written. The
  three docs generated. Build plan written. No application code.
- **2026-07-28** — **Named Wynts** (ADR-0022) after twenty-three candidates; *Detent* and
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
