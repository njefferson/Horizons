# NOTES.md — Horizons

The repo source of truth. **Read this first, every session** (Doctrine §12).
Thesis, invariants, frozen scope, open questions, Project facts. Settled
decisions live here in summary and in [`docs/adr/`](docs/adr/) in full.

---

## Thesis

Most planners are built for someone whose problem is *organising* what they
already remember. Horizons is built for someone whose problem is that a thing
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

| # | Question | Blocking? | Default in effect |
|---|---|---|---|
| Q-01 | **Licence: brief says AGPL, Doctrine §8 says PolyForm Noncommercial.** §8's stated intent is "may not sell it or use it commercially"; AGPL permits commercial use, so it does not deliver that intent. | No — changeable free until first release | PolyForm NC 1.0.0 (Doctrine wins). See [ADR-0017](docs/adr/0017-licensing.md) |
| Q-02 | **Name collision with the sibling app.** The hub already ships *Clear Horizons* (astro planner). *Horizons* and *Clear Horizons* side by side will read as two versions of one app. | No | Keep repo slug `Horizons`, ship display name "Horizons", take a qualified Pages subdomain. See [ADR-0018](docs/adr/0018-name-and-slug.md) |
| Q-03 | **Work-vault policy line.** What the work vault may and may not contain, given the GFE context. The brief says this line is the owner's to supply. | **Yes, before any work data is entered** | None — [`docs/data-constitution.md`](docs/data-constitution.md) ships with the line marked as awaiting Noah's words |
| Q-04 | Pages subdomain string (depends on Q-02) and the four §10 metadata values | Yes, before deploy | Listed for confirmation at bootstrap handover |
| Q-05 | Terminology skin for the work vault — which workplace aliases (Suspense↔Deadline, OPR↔Owner) ship as the default skin | No | Neutral vocabulary; skin is opt-in |

---

## Project facts

- **Repo:** `njefferson/Horizons`. Branches `staging` and `main` only; ignore any
  harness `claude/*` branch (Doctrine §11).
- **Deploy:** Cloudflare Pages. Project not yet created. Subdomain pending Q-02/Q-04.
- **Hub wiring:** Horizons is **not yet** linked from
  `noahjefferson/public/index.html`. That edit is deliberately held until there
  is a deployed page to visit — adding a dead link to the live hub is a site
  regression, not progress. Doctrine §13.6 closes when it lands, together with
  Horizons' About linking back to the shared `/accessibility` statement.
- **Repo metadata:** unset. §10 confirm loop not yet run. **Horizons is not
  "set up" until it has.**
- **Doctrine governed-apps list:** the hub's `DOCTRINE.md:8` does not yet name
  Horizons. Needs a one-line hub edit.
- **Code:** none. This repo is documentation only as of 2026-07-27.

### Log

- **2026-07-27** — Repo bootstrapped (Doctrine §13 items 1–4). Verification pass
  run and recorded. v1 frozen. Event vocabulary defined. 18 ADRs written. The
  three docs generated. Build plan written. No application code.
