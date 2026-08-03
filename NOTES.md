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

## What VERSION 1 means — Noah, 2026-07-29

> *"I will say we are at version 1 when we have all initial capabilities in place
> to make this do all the things I specified. It is not a planner app until then,
> and I will not name version 1 until it is ready."*

**Binding, and it settles the first slot.** The VERSION slot is not reached by a
big release, a large diff, or a session's judgement that things feel complete. It
is reached when **every item in the v1 Must list below exists** — and Noah says so.

Two consequences a session must not get wrong:

1. **Do not propose 1.0.0.** Not as a suggestion, not as "this looks like it has
   reached that level". He has ruled on the criterion; the only thing left is
   whether the list is done, which is a fact about the list.
2. **Until then it is not a planner**, in his words, and no copy anywhere may
   describe it as a finished one. The app says what it does, not what it will do.

Progress toward it is therefore measured against the Must list and nothing else.

---

## Scope — frozen 2026-07-27

MoSCoW run over the design brief's standing tier proposal. **v1 is frozen.**
Moving an item into v1 now is a scope change and needs Noah's word.

### Must — v1

- ~~**The spine.** Append-only log, fold engine, vaults, export/import,
  snapshot-before-migrate.~~ **Done, Phase 0.** Nothing else can be trusted until
  this is.
- ~~**Work mode, complete.**~~ **Done, 0.17.0 (the chip was the last piece).** Single computed Next-up card (hard landscape >
  resume cards > pressure rank; "not this" cycles freely with no penalty),
  capped list of 5 behind it, Upkeep chips above threshold, coverage gauge,
  ~~comms-sweep chip~~ **(done, 0.17.0 — build-plan item 22, deferred out of Phase 3
  because it needed focus ramps; those shipped in 0.14.0)**.
- ~~**Dump + clarify + heat pass.**~~ **Done, 0.4.0.** Zero-chrome capture; one
  card at a time with forced-choice routing; two-tap hot/cold.
- ~~**Interrupt/pin + focus anchor**, with auto-paired resume cards.~~ **Done, 0.14.0** — `focus.started`/`focus.ended`/`interrupt.captured`/`resume.card.*` had been in the vocabulary since the first draft, `nextup` ranked resume cards SECOND, and nothing could create one: an entire ranking tier ordering an empty set. The card is written **at the interruption**, not at `focus.ended` ([ADR-0039](docs/adr/0039-focus-and-the-way-back.md)).
- ~~**Dependency dates + replan.**~~ **Done, 0.12.0.** `feeds →` (project, suspense) + lead estimate,
  computed latest-start, buffer burn, auto-replan on miss (law 3).
- ~~**Track portfolio + delta report.** The work half: OPR, suspenses, status
  output to clipboard/Markdown/print/CSV.~~ **Done, 0.16.0** — `project.role.set`
  was in the vocabulary saying *"a track project emits no next actions"* and
  nothing folded it, so Next up would hand you somebody else's job. The report is
  `fold(log up to then)` vs `fold(log)`, so there is no second source of truth to
  drift ([ADR-0041](docs/adr/0041-carrying-and-the-report.md)).
- ~~**Person lens.**~~ **Done, 0.15.0** — `person.linked`, `waiting.opened` and `waiting.closed` were in the vocabulary and unfolded, so the "Waiting for" route said *someone else owes you this* and never asked who. Unattributed waiting-fors are shown, not hidden: the route is one tap, so unattributed is the commonest kind ([ADR-0040](docs/adr/0040-the-person-lens.md)).
- ~~**Stalled/orphan detection** (the exceptions-first Review surface).~~ **Done, 0.13.0** — and it needed *containment* built first: the parent field had existed since the first fold with no control able to set one, so nothing in the app could stall. [ADR-0038](docs/adr/0038-containment-and-exceptions-review.md).
- ~~**T0 + T1 notifications.**~~ **Done, 0.8.0** (badge 0.11.0). Permission +
  badge + glance surfaces; `.ics` export with `RRULE`/`VALARM` so the OS calendar
  does the notifying. **[V-14](docs/verifications.md) is still open and only Noah
  can close it:** whether an exported `.ics` actually fires an alarm on the iPad
  with the app shut. Nothing in CI can prove that.

> **Every item on this list is now built, as of 0.17.0 on `staging`.**
>
> That is a statement about the list, and it is deliberately not a statement
> about a version. **Noah alone decides what is a VERSION** and he has said he
> will not name v1 until he has used it and agrees it does all the things he
> specified — his ruling is recorded below under *What VERSION 1 means*. Sessions
> do not propose `1.0.0`, and this line is not a proposal.
>
> What is left before that judgement is his to make, not code: the on-device pass
> (Doctrine §7), and **V-14**, which is the one claim in the whole app that no
> gate here can settle.

> **CI caught what I did not, 2026-07-29.** Spine runs 67 and 68 (0.15.0, 0.16.0)
> went **red on the banned-vocabulary gate** after I reported all nine gates green
> locally. Both reports were wrong in the same way and for the same reason: the
> gate lived only in `spine.yml`, so "running it locally" meant me re-typing an
> approximation of it at the terminal, and my version did not reproduce the
> filter. The offending line was a comment in `src/people.ts` explaining the
> prohibition by quoting one of the banned words — **exactly the trap already
> recorded in this file from Phase 3**, hit again because nothing stopped it.
>
> Fixed twice over: the comment was reworded (never the gate widened, per
> ADR-0010), and the gate now lives in `package.json` as `npm run vocabulary`
> with `spine.yml` calling it. There is one definition; local and CI run the same
> bytes. Proven to bite before being trusted (§6) — a probe line reds it.
>
> The lesson is not "be more careful". It is **V-10 again**: a gate I have not
> actually run is a gate I have not run, and "green locally" means nothing unless
> the local thing and the CI thing are the same thing.

### Trying it out, and starting over — Noah, 2026-07-29

> *"I eventually want a set of test data i can import and the ability to purge the
> whole set of tasks, select ranges, or anything else that may make sense?"*

Roadmapped, not built. **"Eventually"** — it waits behind the things that make the
app better at its job. What follows is the shape it should take, written now
while the reasoning is fresh, because most of these have a way of going wrong that
is not obvious when you come to build them.

**Sample data you can import.**
- It must be **generated by a script in the repo**, never hand-written. A
  hand-written fixture drifts from the vocabulary the first time a noun changes,
  and then the thing you use to see the app is lying about the app.
- **Every date must be relative to the moment of import**, not baked in. A fixture
  with fixed dates is a fortnight lapsed the day after it is made — you would open
  it and meet the re-entry greeting and a pile of replan cards, which is not what
  "here is what the app looks like" should show anybody.
- It should **populate every surface at once**: a stalled project, something with
  someone else, a passed date, a tracked project you are carrying, a worry mid-flow,
  a save-for with numbers, something on the Menu, a resume card. The point is to
  see the whole app, and a fixture that only fills the list teaches you the app is
  a list.
- It **imports through the existing path** and therefore seeds a fresh store and
  never merges (law 9). It is not a special case and must not become one.
- It must be **obviously not yours**. Placeholder names, nothing that could be
  mistaken for a real commitment, and a line on the surface saying what it is.

**Purging.**
- **Auto-export first, always.** Doctrine already requires a snapshot before any
  migration; "start again" is the same act with a friendlier name and the same
  consequence if it goes wrong. The export happens before anything is cleared, is
  handed to the user, and only then is anything touched.
- It must be **one atomic operation** — clear and re-seed in a single transaction.
  This exact class already destroyed a store once in this project (0.10.0→0.10.1,
  in the hub's LESSONS): validation passed, `reset()` ran, `append()` failed, the
  data was gone.
- The confirmation must **state the number of things it is about to remove**, from
  the actual store, not a generic warning. "This removes 47 things" is a fact you
  can check; "are you sure?" is a noise you learn to click through.
- **It is not undoable and must say so.**

**Selecting ranges.**
- This is the one with a real tension in it. Law 8 caps what a surface may SHOW,
  and bulk selection is a way of acting on more than you are looking at.
- The resolution is the one the **amnesty** already uses (ADR-0043): the cap
  governs display; an explicit request from the user is not the app deciding to
  show you everything. So a range act is legitimate **when the user named the
  range** — "everything on the Menu", "everything I let go before June" — and
  illegitimate as a select-all over a surface that is capped for a reason.
- Every bulk act must be a **real, gated batch of the same events a single act
  would write**, exactly as the amnesty is. Never a shortcut that bypasses the
  gate, or the invariants stop holding in precisely the case where the most is at
  stake.
- **A preview before it runs, stating the count.** And for anything destructive,
  the same auto-export rule as purging.

**What else makes sense, and is not on his list:**
- **Export a range**, not just everything — the export is currently all-or-nothing,
  and "send me last quarter" is a real request the status report half-answers.
- **A dry run for import.** The surface already says what a file holds before you
  commit; the same honesty for a bulk act is cheap and the analogy is exact.
- **A way to see the log itself.** Every fact in this app folds from it, and there
  is no way to look. That is the sharpest debugging tool available and it costs
  almost nothing to render.

### Should — v1.5

~~Menu with save-for gauges~~ **(done, 0.19.0 — the category on
`menu.item.added` had been collected and discarded since the first draft, and
`save-for.updated` was never folded)** · ~~Rest mode + auto re-entry (7-day default)~~
**(done, 0.18.0 — [ADR-0043](docs/adr/0043-re-entry-is-the-primary-path.md); the
re-entry vocabulary had been complete and unreachable since the first draft)** ·
~~bother
flow~~ **(done, 1.5.0/1.8.0 — the flow terminates in clock-guaranteed routes,
and 1.8.0 made "not mine to carry" keep its decision in the Not Now ledger
instead of trashing it)** · staff-call lens **(the per-person half shipped
1.12.0; the DELTA half is what "staff-call" actually means and it waits on
anchors — see build-plan 33/34. An earlier session of mine recorded this item
as shipped outright, which was wrong. **The delta half shipped 1.17.0** —
ADR-0068: anchors are demand-free named periods and the cut runs on the same
per-device watermark the export mark uses)** · ~~pebbles~~ **(done, 1.15.0 —
ADR-0065; this line said otherwise until 1.17.0, the same drift 1.9.1 corrected
elsewhere)** · ~~journal~~ **(done, 1.13.0 — ADR-0061: a
NodeKind with an encrypted payload rather than a vault, on Noah's decision.
ADR-0005's encryption-ships-together binding honoured — PBKDF2-SHA-256 at
600,000 rounds, and the fold never touches ciphertext)** · ~~printable today-card~~ **(done, 0.21.0 — and it fixed the print path shipped in 0.16.0, which had no stylesheet behind it at all)** · ~~request slots
+ Not Now ledger~~ **(done, 1.8.0 — ADR-0056)**.

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

*(Nothing open.)*

### Closed

- **Q-10**
  - Question: Nothing in this app scopes a projection by vault. Should it?
  - Noah, 2026-07-29: *"The second vault is likely for home tasks... Does it separate work tasks a different way already?"*
  - Answer, in two parts. **First, the fact:** no. The vault is hard-coded to `personal` in `session.ts`, there is **no control anywhere to create or switch one** (zero references in `index.html`), and no projection filters by it. Every event carries the field and nothing has ever read it. There is no work/home separation in this app by that mechanism or any other name for it.
  - **What does separate things, as of this morning:** containment (0.13.0). A "Work" project or area and a "Home" one, with things put under them. That is real, it is shipped, and Noah can use it today.
  - **Recommendation, and it is against building the vault:** what he is describing wants a **lens** — a filter you switch on and off over one list — and not a partition. A hard vault split forces Next up to pick a side, and *"one thing, chosen for you"* across the whole of someone's life is the app's central promise. Two vaults are two apps, and then you have to remember to check both, which is exactly the failure this app exists to prevent. A lens keeps one queue underneath and one coverage gauge that still reads zero.
  - **Binding constraint if a lens is built:** law 1 does not bend for it. A thing filtered out of view still has its clock and still comes back — a filter may change what you are looking at and may never change what the app is holding. Anything else is an archive with a friendlier name (law 3).
  - Status: **Closed as a decision not to build vaults.** The `vault` field stays in the log (it costs nothing, it is already in every event, and removing it would be a destructive schema change for no gain). A Home/Work lens is a candidate for v1.5 whenever Noah wants it; he has containment in the meantime.
- **Q-06**
  - Question: The astro app's naming was inconsistent — repo and URL said `clear-horizons`, the hub displayed **"Astro Planner"**, and the name Noah chose appeared nowhere a visitor saw.
  - Answer: **"Astro Planner will be named Clear Horizons."** Noah, 2026-07-29. The app itself already used the name throughout (title, og tags, manifest); only the hub's two entries were stale, and both are fixed (`noahjefferson` @ `004fddd`). Nothing in the `clear-horizons` repo needed changing.
- **Q-07**
  - Question: The hub undersold the astro app — the tile read *"Clear-sky & Seestar target windows"* and never mentioned recording your horizon, which Noah says is the thing no other astro app does.
  - Answer: **Closed with Q-06.** The tile now reads *"Plan your night against your real treeline, not a flat 0°"*, taken from the app's own README rather than invented.
- **Q-01**
  - Question: Licence — brief said AGPL, Doctrine §8 says PolyForm Noncommercial
  - Answer: **PolyForm NC 1.0.0.** Noah 2026-07-27: *"Doctrinal intent is correct."* [ADR-0017](docs/adr/0017-licensing.md) is Accepted.
- **Q-03**
  - Question: Work-vault policy line, given the GFE context
  - Answer: **No GFE context — the app is not for it.** The vault split is a convenience for separating content; what goes in it is the user's judgement, as with any personal app. Noah 2026-07-27.
- **Q-05**
  - Question: Terminology skin default for the work vault
  - Answer: **Neutral vocabulary, skin opt-in.** Noah 2026-07-27. Matches what shipped.
- **Q-08**
  - Question: How "Wynts" is pronounced
  - Answer: **Moot** — the name is withdrawn. The question was the right one; nobody answered it in time to catch that both readings were bad.
- **Q-02**
  - Question: The app's name
  - Answer: **Quietkeep.** Noah 2026-07-28: *"I like quietkeep and there is nothing on the App Store that I see near it."* Cleared through all five checks — [ADR-0024](docs/adr/0024-name-quietkeep.md), [V-04](docs/verifications.md).
- **Q-09**
  - Question: The four §10 repo-metadata values
  - Answer: **All four set, by Noah, 2026-07-28.** Description, website, topics (he corrected `indexeddb` himself), and the **social preview uploaded**. Per §10 the repo is now *set up* — and his confirmation **is** the verification: a session cannot read this repo's live metadata at all ([V-11](docs/verifications.md)).
- **Q-04**
  - Question: Pages subdomain string
  - Answer: **`quietkeep.pages.dev`** — Noah confirmed it clean on his device, 2026-07-28. Production comes off `main`; `staging` gets `staging.quietkeep.pages.dev`, which turns the Doctrine §7 gate into a URL he can open on the iPad. The metadata half of this question is now **Q-09**, because it is a different kind of answer and was hiding behind the subdomain.

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
- **Where `main` is NOW lives in the Log below** — the newest promote entry is
  the live fact. The entries that follow here are the early promote history,
  kept as written. (Corrected 1.17.4: the first of them still read as the
  present tense — "`main` is at 0.11.0" — fourteen promotes later.)
- **Previously `main` was at `0.11.0` (`af2e415`), promoted 2026-07-29** — Noah's "Promote",
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
- **Hub wiring: DONE.** The hub links Quietkeep — verified against
  `noahjefferson/public/index.html` (the apps list and the icon grid both
  carry `quietkeep.pages.dev`), and the app's ⓘ panel links back to the shared
  `/accessibility` statement. (Corrected 1.17.4: this fact still said "not
  yet linked... held until there is a deployed page to visit" long after both
  halves had landed — the seam audit's record-drift pass caught it.)
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
  grouped todo list, rename) — and everything the Log records since.
  `staging` → `staging.quietkeep.pages.dev`, `main` → `quietkeep.pages.dev`, both live.
  (Corrected 1.17.4: this fact still pinned "`main` is at 0.6.0; `staging`
  carries 0.7.0" — the Log below is the live record of where the branches are.)
- **UI is the platform, no framework**, and there is exactly one build step — esbuild,
  stripping types and bundling `src/ui` to `public/app.js`, which is generated and not
  committed ([ADR-0026](docs/adr/0026-ui-and-build.md)).
- **`npm run smoke`** is a gate: a headless walk of the *built* app that captures a
  thought, reloads the whole page, and asserts it came back. It was made to fail once
  before being trusted.

### Log

- **2026-08-03** — **1.17.4 "The tail"** — the seam audit's sixteen unverified
  findings, each VERIFIED against source while being fixed (they had no skeptic
  pass), each code fix pinned by a `seam-t*` test in `test/seam-audit.test.ts`.
  · **Fifteen held; one half-refuted and recorded**: build-plan item 33's
  "annotate shipped" claim — the watermark blocker DID fall in 1.17.0, but the
  per-person delta has no code anywhere, so the item stays open on its merits
  and the refutation is written into the item.
  · **The deepest fix is the decline lifecycle.** `done.marked` used to null
  `n.notNow` in the fold while `done.unmarked` restored only `lastDone` — so
  done-then-undone dropped a standing decline from state for ever. The record
  now survives in state and ONE exported predicate (`standingDecline`,
  `requests.ts`) settles it for every reader — ledger, sheet, calendar
  exclusion, merge carry, merge picker (`canHold` parity was its own finding).
  ADR-0056 corrected in place: mechanism moved, rule unchanged.
  · **Payload declarations moved to reality**, not the other way:
  `reentry.greeted.shown` (booleans and a count, never node ids),
  `bother.routed` (`{route:'inbox'} | {park:true}` — 'inbox' was never even a
  `ClarifyRoute`), `dependency.declared` (both trailing fields optional, the
  meaningless `suspense` timestamp no longer written by anything).
  · **Counts and words**: the import summary counts JOINED notes the way the
  mapper writes them (the old 1.4.0 test asserted the line-count four lines
  above its own proof that one event is written — corrected); `menuCount` is
  the sum of the rendered groups; the purge words name the wide count so the ⓘ
  panel's two "things" numbers explain themselves; `recordDayWords` (time.ts)
  gives the ledger, the anchor line and the journal list the held list's
  far-year rule; "1 days" is gone from the report and the repeat words.
  · **Deleted rather than kept warm**: `firingCount` (its comment claimed a
  call site that did not exist; production asks `lastFiring !== null`).
  Docs drift corrected beside the claims: NOTES' three stale facts (main-at,
  hub wiring — verified against the hub's `index.html` — and the Code line),
  the vocabulary's `delta.recorded` watermark clause, anchors.ts's RRULE
  comment, build-plan items 33/34.
  · Deliberate-failure proofs watched red: reverting the fold fix reds
  `seam-t7` by name; reverting `menuCount` reds `seam-t3`. 940 unit tests
  green.
  · **The sweep found a latent flake in the walk, and it was the walk's own
  documented failure mode.** The 1.17.2 membership section filled
  `#search-input` with a bare `tpage.fill` immediately after `#about-close` —
  and `fillSearch`, the helper twenty lines up, exists precisely because
  "filling while a modal dialog is open (or still closing) resolves without
  the value landing". The box kept the previous query, the anchor never
  appeared, and the walk timed out on a row that was never going to be there.
  It passed in Spine 217–222 by timing luck. Instrumented rather than guessed
  at (the input's value was dumped on failure and read "fielding review"),
  then fixed by using the helper at both sites; three consecutive green runs
  afterwards. **A check that depends on luck is not a check** — and a helper
  written for a known race is worth nothing at the one call site that skips
  it. Appended to the hub's LESSONS.
  · **Spine 224 green on the exact head** (`4240593`) — all 22 steps opened
  and read individually, not inferred from the run's conclusion (V-10).
  **Not promoted without Noah's word.**

- **2026-08-03 (Noah: "Promote to main and continue")** — **`main` fast-forwarded
  `b797083 → bf0e2cb`**, carrying 1.17.2 "Membership" and 1.17.3 "What the seam
  audit found" to production. Fast-forward ancestry verified first; **Deploy 218
  green on that exact head**. Spine 220 had been watched green on `29a7063`;
  `bf0e2cb` is that head plus one docs-only NOTES commit. The "continue" half is
  1.17.4 — the seam audit's sixteen unverified tail findings, each to be
  verified against source while fixing (they had no skeptic pass; any that does
  not hold is recorded as refuted, not silently dropped).

- **2026-08-03** — **1.17.3, second commit: Spine 219 went RED and it was right
  twice.** The headless walk's panel-height gate failed on the 1.17.3 patch
  notes (9,273px against a 9,000px budget — ten long notes), and my local smoke
  had passed because I ran it BEFORE writing the changelog entry. That is
  **V-10, literally**: a gate run against a tree that is not the tree you ship
  is a gate you have not run. Notes trimmed to five, sweep re-run in the right
  order, and the walk's own words stand: the panel is for reading, not for a
  scroll of history.
  · **Spine 220 green on the exact head** (`29a7063`). Not promoted.

- **2026-08-03** — **1.17.3 "What the seam audit found"** — every verified
  finding fixed, each pinned by a named test.
  · **The audit's shape:** six adversarial finder lenses over the seams
  (membership, count agreement, record-vs-code drift, words honesty, write-path,
  lifecycle), 31 raw findings, the top 14 each attacked by a skeptic told to
  refute it. **None were refuted.** Twenty agents, ~2M tokens, every claim
  traced to file:line on both sides.
  · **The worst one was in the write path:** the `pebble.settled` fold case was
  the fold's ONE bypass of copy-on-write — `s.nodes.get` plus direct mutation —
  so a REJECTED batch containing a settle left the settle applied to live
  state, the class the 1.3.1 audit filed as severe. And nulling the weight
  stranded "Keep it after all": a kept pebble existed on NO surface. The case is
  now a no-op — the trash beside it does the removing, the raise's data
  survives, and untrash puts the weight back.
  · **A worry was offered as work.** `nextup`'s private NOT_ACTIONABLE (a
  byte-identical copy of the set `kinds.ts` was created to be the single home
  of, never imported) omitted `bother`, and `isAppClock` exempted only
  `gate:node.created` — so the bother cure read as an arrived demand, a fresh
  worry got a Done button before "whose is this?" was asked, and a DECLINED one
  sat under "Ready now" for ever. Fixed at the root: `bother` into the one
  shared set, `gate:bother.received` into `isAppClock` by that predicate's own
  doctrine (a cure inherits the intent of the event it cured; a worry entering
  has none about when). Heals old logs with no new events.
  · **The calendar carried the nag ADR-0056 removed:** a decline's park exported
  as an all-day event with a 9 am alarm. `exportsToCalendar` — one predicate for
  the file AND the count — now excludes bothers and standing declines.
  · **The paper contradicted the screen:** `todayCard`'s docstring promised "the
  SAME projections the screen uses" while calling raw `nextUp`; the screen
  subtracts chips and replan items (law 3). It reads `workSurface` now.
  · **The report disclosed private things:** journal entries as "New —
  (untitled)", pebbles/people/anchors as new work, in the one document that
  leaves the device. The four not-work kinds never enter `deltaBetween` now.
  · **The merge picker offered journal entries and anchors as survivors** — a
  titleless journal sorted FIRST as "(untitled)" — and an accepted fold hid real
  work from every surface with the gauge still zero (law 1 rides the chain to a
  demand-free survivor). The person/pebble clauses now cover both kinds, both
  directions. Also: trash is no longer offered on a merge survivor (sheet hides
  it, bulk skips-and-counts — the gate refused it after the preview promised
  it); a decline is no longer offered on demand-free kinds; and `mergePlan` no
  longer drops a source's OPEN wait when the survivor's wait had already CLOSED
  (`waiting.closed` sets the outcome without clearing `waitingOn`, and the old
  test was bare `!target.waitingOn`).
  · **The import panel denied its own default button:** "Nothing is merged —
  this is a replacement", said unconditionally, while focus landed on the
  ADDITIVE "Take in what I don't have". Both doors are now named truthfully,
  here and in the big-sample caveat.
  · **Two 1.15.0 tests had pinned the defective semantics** (settle nulls the
  weight) and were rewritten to the corrected design with the reason recorded.
  The membership table's own bother-in-next-up sentence was DISPROVED by the
  audit's verifier — the mechanism it described cannot occur — and the row now
  says so.
  · **Seventeen further findings are recorded and queued** (the un-verified
  tail: count seams like menuCount vs menuGroups and the ⓘ panel's two "held"
  numbers; payload-shape drift on `reentry.greeted` and `bother.routed`; stale
  records — build-plan 33/34, two NOTES facts, a vocabulary note; far-date
  years on three surfaces; "1 days" plurals; done-then-undone dropping a
  standing decline). None loses data. Next batch.

- **2026-08-03 (Noah: "Everything I've found has pointed to an unfinished
  product." → "The same. Please continue.")** — **1.17.2 "Membership"**, and a
  change of direction: **no new features. The seams, gated.**
  · **He is right, and the defect record says where the unfinishedness lives.**
  Three of the last four shipped defects were one defect in different clothes: a
  kind on a surface it does not belong on (journal entries in the coverage list,
  1.15.1; people in the todo list, 1.17.0; and this release's — the detail sheet
  offering date/start/repeat on every demand-free kind, refused by the gate
  after the tap). Each was found by READING, none by an instrument. The finds
  were luck; the misses are still out there.
  · **The fourth instance, fixed:** `temporal` was `!n.onMenu`, and the comment
  beside it stated the correct rule while the code broke it. Now
  `!n.onMenu && !DEMAND_FREE_KINDS.includes(n.kind)`. Reachable before the fix:
  search returns people and anchors and a result row opens the sheet; the todo
  list holds an off-Menu aspiration. `choosable` also gains `journal` and
  `anchor` — "Put it in today" was offered on a named period one search away.
  `resume-card` stays choosable with the reason written.
  · **The class, gated:** `test/membership.test.ts` — one declared table, kind ×
  surface for all sixteen list surfaces, a written reason per surface, computed
  over the 1.16.0 set-of-everything, checked both ways (actual ⊆ allowed AND
  expected-present, so no row can go vacuous — LESSONS 7g), plus totality over
  `NODE_KINDS` and an offered-then-refused check closed at both ends for dates.
  The `MERGE_DISPOSITION` idiom, fourth instance: a class closed, not an
  instance patched.
  · **Deliberate-failure proofs, all watched red:** reverting the 1.17.0 person
  exclusion reds the table naming both surfaces; reverting `choosable` reds the
  today test naming `anchor`; reverting the `temporal` fix reds exactly the four
  new smoke assertions that drive the real DOM (search → anchor sheet → groups
  hidden; same via a person).
  · **A seam audit is running in parallel** — six adversarial finder lenses
  (membership beyond the sheet, count agreement, record-vs-code drift, words
  honesty, write-path seams, lifecycle seams), findings then adversarially
  verified by skeptics told to refute. Confirmed findings get fixed with tests,
  not listed. ADR-0070.
  · **Spine 217 green on the exact head** (`6f2f81f`). Not promoted.

- **2026-08-03 (Noah: "Promote to main")** — **`main` fast-forwarded
  `8ece530 → b797083`**, carrying **1.17.1** (what it costs to look). Spine 213
  watched green on the exact head before the promote, and **Deploy 211** green on
  `main` at the same sha after it, both editions out.
  · Same limit as every promote here: production itself was not read
  ([V-15](docs/verifications.md)). The evidence is the deploy run's own green
  Cloudflare steps.
  · **Everything built this session is now on production** — 1.14.2 through
  1.17.1. What is outstanding is entirely Noah's: the on-device pass, and the
  five physical checks (V-20, V-14, V-16/V-17, V-00 step 2, item 42).

- **2026-08-03 (Noah: "Promote and continue")** — **1.17.1 "What it costs to
  look"** — the read path measured, fixed and gated.
  · **The estimate had sat in the roadmap for months and nobody could check it**:
  "~18–20 full-state projection passes per commit (~220 ms today, 1.56 s at
  10k)", with the work deferred to item 42's on-device measurement. Correctly —
  this repo does not optimise against a guess. **1.16.0 built the instrument**,
  and timing it made the estimate a fact: **one refresh cost ~100 ms at 566
  things**, and the cost was not spread evenly — nine projections cost 4–16 ms
  each and the other eight under 0.3 ms. Every expensive one walks nodes asking
  for calendar distances.
  · **`Intl` formatter CONSTRUCTION was already cached; the formatting was not.**
  `formatToParts` is the expensive half. `calendarDaysBetween` resolves two
  instants per call, called once per node per clock per projection — and the
  `nowIso` side is **the same instant every time**, resolved from scratch on
  every one of thousands of calls.
  · **A memo on `localParts`: ~100 ms → ~22 ms**, A/B, three runs each. Four
  times, from caching one pure function. It inherits the `FORMATTERS` precedent
  directly above it rather than inventing a pattern.
  · The cached object is **frozen** — a memo hands one object to every caller,
  and the three-place rule in `fold.ts` exists because this repo has already paid
  for aliasing once. The key is **(zone, instant)**, pinned by a test: keyed on
  the instant alone it would hand a traveller the wrong day, which is worse than
  being slow.
  · **Two gates, failing for different reasons.** A structural one that cannot
  flake (identity — the same instant resolves to the same object), which is what
  the deliberate-failure proof reds; and a loose 250 ms wall-clock one in the
  spirit of the admit gate's 800 ms around a 55 ms operation. Plus the check that
  matters most: the same store answers the same after any number of refreshes.
  · **A correction made in the commit that found it.** The memo's first draft
  carried a NaN guard for malformed instants with a confident paragraph beside
  it. `formatToParts` **throws** on an invalid date — the branch was unreachable
  and the paragraph described behaviour the platform does not have. Replaced by
  the truth and a test pinning it.
  · **Item 42 is NOT closed.** The measurement that counts is still the iPad;
  this hardware is not that device. What changed is that the read path has a gate
  at all. ADR-0069.
  · **Spine 213 green on the exact head** (`616f51c`). Not promoted.

- **2026-08-03 (Noah: "Promote and continue")** — **`main` fast-forwarded
  `a796199 → 8ece530`**, carrying **1.17.0** (the staff call — anchors, and v1.5
  closed). Spine 210 watched green on the exact head before the promote, and
  **Deploy 208** green on `main` at the same sha after it, both editions out.
  · Same limit as every promote here: production itself was not read
  ([V-15](docs/verifications.md)). The evidence is the deploy run's own green
  Cloudflare steps.

- **2026-08-03 (Noah: "Promote to main and continue")** — **`main` fast-forwarded
  `59644a4 → a796199`**, carrying **1.16.0** (a set with everything in it). Spine
  206 watched green on the exact head before the promote — 22 steps, including
  `sample:check` on its first CI run — and **Deploy 204** green on `main` at the
  same sha after it, both editions out.
  · Same limit as every promote here: production itself was not read
  ([V-15](docs/verifications.md)). The evidence is the deploy run's own green
  Cloudflare steps.

- **2026-08-03 (Noah: "Promote to main and continue")** — **1.17.0 "The staff
  call"** — anchors, and **v1.5 closes**.
  · **ADR-0057 named three blockers and two were already answered in the code.**
  The silent-node one had its price written in the same paragraph
  (`DEMAND_FREE_KINDS`' own comment: a gate change plus a shipped surface, in one
  release) — that is what `person` paid in 0.15.0 and `journal` in 1.13.0, and it
  is paid here. The watermark one needed no new mechanism at all:
  `reportedBefore` already takes `{at, upToSeqByDevice}` and prefers the mark,
  `status.report.exported` already carries one, the fold already reads it. The
  blocker was that `anchor.fired` did not carry the field, not that the field had
  to be invented. **One mechanism, two writers.**
  · The test that matters stages the audit's own case on the anchor path: a
  second device delivers work stamped *before* the meeting that this device never
  saw. The watermark reports it; the time-only cut buries it. **Both directions
  asserted**, so the degraded mode is demonstrated rather than described.
  · **A person node has been a row in the todo list since the beginning.** Every
  person Noah had ever named sat among his work with nothing to do about it. It
  predates `heldWork` (1.15.1), which is why nothing caught it — 1.13.0 and
  1.15.0 each added a kind to a hand-written list and neither revisited what was
  already in there. `person` and `anchor` both join the skip list: **one edit,
  four surfaces**, which is exactly what 1.15.1 was for.
  · **`status.report.exported` never declared `upToSeqByDevice`** — written by
  the UI and read by the fold for four releases, with the delta cut's correctness
  depending on it. A type lying by omission, found while giving `anchor.fired`
  the same field.
  · **The 1.16.0 coverage gate's node exemptions are now empty**, and nobody had
  to remember to delete the entry: a kind the set produces fails its own
  exemption. The mechanism working as designed, one release later.
  · **A test was rewritten for the third time, same reason each time.** "A held
  item with no clock at all is Later, not lost" kept reaching for a demand-free
  kind as its clockless vehicle — a pebble until 1.15.0, a person until now. It
  uses a child under a clocked parent now: the one clockless *work* item the app
  can produce.
  · `vocabulary`, `emitters:check` and the **a11y target gate** all caught real
  things: two banned words in new comments, two vocabulary notes gone false, and
  both new inputs at 21px against the 44px floor.
  · ADR-0068, B-36. **The Should—v1.5 list is empty after this**, and pebbles is
  struck from it at last.
  · **Spine 210 green on `1a24b4e`** — all 22 steps. Worth naming precisely: the
  code commit's own run (209 on `8f64495`) was **cancelled**, not failed —
  `spine.yml` sets `cancel-in-progress: true`, so the docs commit that landed a
  minute later superseded it. The green run is on the head that carries every
  line of the release, which is what V-10 asks for. Not promoted.

- **2026-08-03 (Noah: "Generate enough test data in all categories, types, etc,
  to see real data errors")** — **1.16.0 "A set with everything in it"**.
  · **The number that made the case.** `src/sample.ts` was right when it was
  written at 0.22.0. Measured before building anything: the app emits **70** of
  its 90 event kinds and the sample contained **8**, plus 8 of 14 node kinds. So
  every surface built in sixteen releases — merges, dependencies, decisions, the
  ledger, the trash, Composed Today, focus, weight, the journal — **had never
  once been seen with data in it**, except whatever happened to be in Noah's
  store. 1.15.1 is the worked example of what that costs.
  · **A FILE, not an append.** The small set appends and admits "yours to sort
  out afterwards"; at ~560 things that trade is not fair, and no verb takes just
  those back out (law 9 — that is `import.merged` in costume). So it writes a
  `planner-log` file and the ordinary import brings it in, with the warning that
  already exists. No new destructive act.
  · **It records nothing**, deliberately. Both existing deliverers write
  `export.written`, which `copies.ts` reads to say "Last copy" — a generated file
  holds none of Noah's data, so recording one would make that row claim a backup
  that does not exist, in the one place somebody reads to decide if they are
  covered. Smoke pins the store's event count and its `export.written` count
  unchanged after making a set.
  · **`sample:check` generates the set for real and asks what came out** — not a
  grep, which would pass on a kind named in a comment. Both directions, like
  `emitters:check`. Nine exemptions with written reasons: eight device-local acts
  (a snapshot, a copy, another device's shard or greeting), and `anchor`, which
  would be a **silent node** and is refused by the gate — ADR-0057's deferral,
  arriving as a machine-checked consequence.
  · **The sweep is the half that answers the request.** Every projection over the
  folded set, asserting no `undefined` / `NaN` / `Invalid Date` /
  `[object Object]` / bare `null` in any rendered string — 4,000+ strings a run,
  including `eventWords` over all 1,569 events and the report in four formats.
  · **Two defects in the checks themselves, both found by planting.** The sweep
  first stringified whole nodes and reported 94 hits, every one its own
  scaffolding (`"parent":null`) — a check that flags its own instrumentation
  teaches you to ignore it. And the trigger-list check searched the journal's
  base64 ciphertext, where a random IV produced "gtd": **the second time that
  exact collision has happened here**, after 1.15.0's `'bb'` matching
  "pe-bb-le". Both now read authored words only.
  · Deliberate-failure proofs: removing one kind from the set reds `sample:check`
  naming that kind; removing the null branch from `ledgerRowWords` reds the sweep
  with `ledger.g1562: null asked · declined 3 Aug`.
  · ADR-0067, B-35. Nothing on any existing screen changed.
  · **Spine 206 green on the exact head** (`807dbbd`) — 22 steps now, the new one
  being `sample:check`, green on its first CI run. Not promoted.

- **2026-08-03 (Noah: "Promote to main")** — **`main` fast-forwarded
  `60a45c8 → 59644a4`**, carrying **1.15.1** (what "held" means). Spine 202
  watched green on the exact head before the promote — all 21 steps — and
  **Deploy 200** green on `main` at the same sha after it, both editions out.
  · Same limit as every promote here: production itself was not read
  ([V-15](docs/verifications.md)). The evidence is the deploy run's own green
  Cloudflare steps.

- **2026-08-02 (Noah: "Continue")** — **1.15.1 "What *held* means"** — the item
  ADR-0065 left open, which reading the code turned from a question into a
  shipped defect.
  · **The coverage list was itemising journal entries as "(untitled) — held".**
  A journal entry has no title by design (ADR-0061), and `buildCoverage`
  renders `title || '(untitled)'` — so opening the gauge listed every private
  entry as a blank row. ADR-0061 excluded them from the todo list to prevent
  exactly that row; the coverage list was missed, and it is the *more*
  prominent surface because the gauge invites you to open it. Since 1.15.0
  active pebbles were listed there too.
  · **The cause is the 1.9.2 lesson repeating**: `heldGroups` carried a
  hand-written list of what is not work and the gauge had none, so the two
  drifted the moment a kind was added — 1.13.0 and 1.15.0, neither caught.
  · **`heldWork(state)` in `gate.ts`, read by four surfaces** that make the same
  claim: the gauge's total, the coverage list, the todo groups, and the ⓘ
  panel's "Things held" row. `silent` is untouched and still runs over every
  node — a proof that skips a kind proves nothing. `heldNodes` keeps its meaning
  for its ~28 other readers.
  · **Two more readers found by reading rather than by the plan.**
  `undatedCount` counted pebbles into "you have not decided about these yet",
  about the one kind there is nothing to decide about. And `searchHeld` now
  excludes pebbles — not about the set, but because a result row is a door to a
  work sheet whose every verb the gate must then refuse (the 1.9.2 audit's F-B).
  · **The import warning deliberately stays on the wider number**, four lines
  below a row that moved to the narrower one. An import replaces everything, and
  a warning may not round down. Both call sites now say which and why.
  · **The smoke assertion had been passing because the case was absent.**
  Rows-equal-the-gauge now runs with a pebble on, and again with a journal entry
  written. Reverting the coverage list alone reds four assertions; reverting the
  gauge alone reds three of the six new unit tests.
  · **A number Noah sees will drop** by however many entries and weights he
  holds. The changelog says so plainly, including that 1.15.0's own note —
  "the count of what is covered does not move" — was half wrong.
  · ADR-0066. **Spine 202 green on the exact head** (`a3b3625`) — all 21 steps.
  Not promoted; 1.14.2, 1.15.0 and this wait on Noah's on-device pass together.
  · The cross-app lesson went to the hub under **LESSONS 7g**, not a new
  section: a correct check whose walk never contained the case is that section's
  "assert the fixture, not just the result" bullet in its quietest form.

- **2026-08-02 (Noah: "Promote to main")** — **`main` fast-forwarded
  `601bae9 → 60a45c8`**, carrying **1.14.2** (every noun accounts for itself),
  the pebble **correction**, and **1.15.0** (load, not work). Spine 199 watched
  green on the exact head before the promote — all 21 steps, including the
  headless walk and the rendered accessibility pass — and **Deploy 196** green
  on `main` at the same sha after it, both editions out.
  · Same limit as every promote here: production itself was not read
  ([V-15](docs/verifications.md)). The evidence is the deploy run's own green
  Cloudflare steps.


- **2026-08-02 (Noah: "YOU FUCKING MADE IT" → "stop asking me for shit without
  reviewing the project files")** — **1.15.0 "Load, not work"** — the pebble
  consumer ADR-0014 described in the design phase, built at last.
  · **He was right, and the rule is now standing: read the files first.** I had
  carried pebbles as blocked on his decision, repeatedly, when ADR-0014 answers
  it in its Consequences — "may depress capacity / WIP while active … the
  mechanism by which unresolved weight shows up in what the app asks of you,
  without ever becoming a task" — and the data constitution says the same. The
  correction is recorded beside the vocabulary entry and in the plan file.
  · **A sweep of everything else I had called "blocked on Noah" found three more
  already answered in the files.** Anchors: ADR-0057 defers them with four
  reasons and says what shipping them needs. Sync consent: ADR-0036 already
  requires each edition's panel to state "exactly what leaves the device", and
  `src/ui/security.ts` already has the section. The module offer trigger:
  build-plan item 322 records it as waiting on dogfooding, not on an opinion.
  **What is genuinely his is only the physical checks** — V-14, V-16/V-17,
  V-00 step 2, V-20, and item 42's measurement. Those need his hands, not his
  judgement, and that is a much shorter list.
  · **No new nouns, no gate change, no vocabulary change.** `pebble` was in
  `NODE_KINDS` and in `DEMAND_FREE_KINDS`, so the write gate had been refusing
  to clock one for a year; the four events were declared and typed, and
  `Capacity` already named its four values. Only the reader was missing.
  · **Weight narrows THE OFFER and nothing else** — never the gauge (it proves
  law 1 over every node), never the todo list, never Composed Today (that is
  what you chose), never below one thing.
  · **One small thing changes nothing.** `HEAVY_AT` is 3, so a single pebble is
  sayable without consequence — an app that reacts to every one teaches you not
  to write them down, which is ADR-0014's own argument for the Menu from the
  other direction.
  · **Co-occurrence, never causation.** "Fewer things, *while* you have this
  much on." The `while` is load-bearing and pinned by a test that rejects
  because/due-to/caused, and by another that rejects any digit.
  · **A defect the tests caught before it shipped:** pebbles were appearing in
  the todo list, which is exactly what "becoming a task" looks like. Now
  excluded like journal entries — `heldNodes` still counts them so the gauge
  and the merge picker see them, `heldGroups` does not.
  · **And a latent fragility surfaced:** the journal test asserted the
  ciphertext `'bb'` never reaches state, and the word *pe-bb-le* matched it. A
  false positive on a real invariant is worse than no check; the fixture now
  uses a distinctive string.
  · **The timeline half does NOT ship**, and no timeline was invented to carry
  it. There is no plot surface in this app. Said rather than faked.
  · **And an older inconsistency surfaced, named rather than patched.**
  `heldNodes` counts every untrashed node; `heldGroups` skips what is not work.
  Those drifted apart in 1.13.0 when journal entries were excluded, and nobody
  noticed because `held.ts` still carried a comment saying they could not. The
  comment is corrected. The gauge now says "N held" where the list shows fewer
  rows — nothing is hidden, every excluded kind has its own surface, but "held"
  is doing two jobs in one word and that wants its own decision.
  · **The walk found a real defect, and that is the best thing it did.**
  Settling kept the node, so `heldNodes` counted it for ever — three later
  assertions comparing the gauge against rendered rows went red. Chasing that
  showed the node was **unreachable from every surface**: a settled pebble is in
  no list at all, having left the load entry by definition and never been in the
  todo list, while still inflating "held" for ever. Settling now emits
  `pebble.settled` AND `node.trashed`: the log keeps both facts, the trash view
  is the way back, and the count cannot climb behind a surface that shows
  nothing. My first two attempts at this — a second "Let it go" verb, then
  moving the walk to the end of the run — were both working around the defect
  rather than fixing it.
  · Two of my own smoke assertions were also simply wrong — the offer's
  behind-count, and expecting the gauge not to move — and were replaced with
  what is actually true.
  · ADR-0065, ACCESSIBILITY B-34, two a11y states, a smoke walk.

- **2026-08-02 (Noah: "Promote and continue")** — **`main` fast-forwarded
  `3a9776c → 601bae9`**, carrying **1.14.1**. Spine 195 watched green on the
  exact head before the promote; **Deploy 192** green on `main` at the same sha
  after it, both editions out. Same limit as every promote here: production
  itself was not read ([V-15](docs/verifications.md)).

- **2026-08-02 (Noah: "Promote and continue")** — **1.14.2 "Every noun accounts
  for itself"** — the generalisation of the two defects the same day produced.
  · **The shape, twice in one day.** `export.written` recorded since Phase 0 and
  read by nothing (ADR-0062); `snapshot.written` declared in Phase 0 and written
  by nothing (ADR-0063). Neither was visible: types compiled, gates passed, 864
  tests green. **A noun nothing writes breaks nothing** — it just means a feature
  the record insists exists does not.
  · **A sweep found 23 more kinds written by nothing, and exactly two carried a
  note saying so.** From outside, all 23 looked identical — and identical to the
  two that were real defects.
  · **New gate `emitters:check`.** Each kind is written by the app, or its own
  vocabulary entry says in words that it is not. Both directions: a kind the app
  DOES write must not still be described as unemitted, because a stale note is
  the next quiet lie and would be written by whoever finally wires the noun up.
  Both failure modes proved deliberately before trusting it.
  · **The first version was too coarse and I caught it by running it.** Paragraph
  splitting made all of section G one lump, so a note about one kind vouched for
  every kind beside it — the exact sloppiness the gate exists to refuse. Now
  parsed into per-kind blocks, so a note must sit BESIDE what it is about. One
  existing note (the `vault.*` supersession) lived in a different section
  entirely and was moved to where it belongs.
  · **What the 23 turned out to be:** reserved (the assist ladder, templates,
  terminology skins, consent), deferred with a named blocker (anchors and their
  delta; pebbles/capacity/WIP — see the correction below),
  superseded (the vault trio; the comms-sweep pair, replaced by a field on an
  upkeep node), redundant (`device.registered` — `State.devices` folds from the
  `device` field every event already carries), and correct by design
  (`replan.raised`, which ADR-0034 requires to stay unemitted).
  · **Two notes record open questions rather than answers**, deliberately:
  whether sync needs a `consent.granted` under ADR-0015, and that compaction —
  ADR-0001's fifth consequence — is entirely unbuilt.
  · ADR-0064. Nothing changes on screen; the bundle moves only because the patch
  notes live in it.
  · **CORRECTION, same day, and it is mine.** The note this release forced me to
  write beside `pebble.raised` said the question "what does a pebble actually
  depress?" had never been answered. **That is false.** ADR-0014 answers it in
  its Consequences, in terms: a pebble links to the nodes it affects and "may
  depress capacity / WIP while active", and it "annotates the timeline, so a
  stretch of low capacity has a visible reason — co-occurrence only, never
  causation". The data constitution says the same thing in the same words.
  `capacity.declared` even carries its own four-value payload. **Nothing about
  pebbles is undecided; the substrate is unbuilt**, which is a different thing
  and a much smaller one.
  · **The framing was mine and it appears nowhere else in this repo.** I put it
  in the plan file, repeated it in a readiness sweep, said it to Noah twice, and
  then shipped it into the vocabulary — one turn after writing the cross-app
  lesson that *an ADR's Consequences section is a build list, not prose, and the
  bullets nobody converts into work become the app's quietest lies*. I made
  exactly that mistake about exactly the document that answers it. The new gate
  did its job and demanded a sentence; the sentence I wrote was wrong.
  · **My supporting argument was also wrong.** "Next up cannot ask for less than
  one thing" is true of Next up and does not generalise: `COMPOSED_CAP` is 5,
  `OFFER_CAP` is 2, `REVIEW_CAP` is 3, and the timeline annotation needs no cap
  at all.

- **2026-08-02 (Noah: "What else is already specified you haven't done yet?" → "continue")** —
  **1.14.1 "Startup does not replay the world"** — the biggest thing the sweep
  found, and the same defect as 1.14.0 one layer down.
  · **ADR-0001's first consequence has never been true.** "Startup must not
  replay the world. State is `latest snapshot + tail fold`. The < 2 s
  cold-capture budget depends on this." `writeSnapshot` was written in Phase 0,
  exported, and exercised by four tests — **and had no caller outside the test
  suite.** The only production writer was `portability.ts`, storing a snapshot
  that arrived inside an imported file. So `loadState` found none, fell through,
  and folded the entire log on every launch, every reload, every return to the
  Home Screen.
  · **Nothing was ever wrong.** The fallback path is the correct path and the
  state it produced was right. What was lost was only the thing the machinery
  was built to buy — and the loss grows with an append-only log, forever.
  · **The app cuts one from the state it already holds.** Calling `writeSnapshot`
  at startup would re-read and re-fold the log, paying exactly the cost the
  photograph exists to avoid. `snapshotFrom` takes the state the session has just
  folded; the mark and the count come from the same object read synchronously, so
  the snapshot is internally consistent even if a commit lands mid-write.
  · **After `data-ready`, unawaited, and NOT on the commit queue.** Queueing it
  would put a clone of the whole state in front of the first capture.
  · **The threshold is a count, not a clock** — 500 events past the newest
  snapshot. A device used once a fortnight has a short tail and should do no
  work; elapsed time cannot tell the difference. Same reasoning ADR-0004 used
  for export staleness.
  · **Deliver, then record** — the snapshot lands before `snapshot.written` is
  committed, pinned by a test with a store that refuses to hold a photograph.
  The noun was declared in Phase 0 and unemitted until now.
  · **Safe to turn on because the guard predates it**: `loadState` recomputes
  snapshot-count plus tail against the log and falls back when it disagrees, so
  the worst case is a slow start, never a wrong state.
  · **Refused: compaction.** ADR-0001's fifth consequence is also unbuilt and
  `shard.compacted` also unemitted, but discarding history under a law that says
  data is never lost deserves a measurement first, not a rider.
  · **The headless walk measures it, on a synthetic store**: 615 events replayed
  before, **1 event after**. That is a real browser against real IndexedDB, and
  it is not Noah's iPad — item 42 is still the measurement that counts, and the
  changelog says in as many words that this release comes with no number for his
  device.
  · **The walk's first version of that proof was vacuous, and the smoke run
  caught it.** An import seeds a snapshot of its own, and the walk imports a
  backup — so the store was already covered and a reload correctly did nothing.
  The check would have passed with the caller deleted. It now empties the
  snapshots table first, staging the exact state every device was permanently in
  before this release.
  · ADR-0063; build-plan items 5 and 6 annotated with what actually happened.

- **2026-08-02 (Noah: "Promote to main and continue")** — **`main`
  fast-forwarded `155967b → 3a9776c`**, carrying **1.13.0** (the journal) and
  **1.14.0** (the copy, and the way back). Spine 192 watched green on the exact
  head before the promote — every step opened, including the headless walk and
  the rendered accessibility pass — and Deploy 189 green on `main` at the same
  sha after it, both editions out.
  · Same limit as every promote here: production itself was not read
  ([V-15](docs/verifications.md)). The evidence is the deploy run's own green
  Cloudflare step, not the apex URL serving the file.

- **2026-08-02 (Noah: "Right now, if I clear Safari cookies etc, do I lose everything?")** —
  **1.14.0 "The copy, and the way back"** — a question that turned out to be a
  release, because answering it honestly meant checking, and the checking found
  two decisions ADR-0004 took in the design phase and nobody built.
  · **The answer is yes.** `events`, `snapshots` and `kv` are three tables in one
  IndexedDB database, so clearing a browser's website data takes the lot.
  Persistent storage does not cover it and never claimed to: persistent mode
  means the browser will not clear the store *on its own* to make room.
  · **`export.written` had been written since Phase 0 and read by nothing.**
  Three call sites wrote it; nothing computed when the last copy left. ADR-0004's
  own consequence — "if it is forgotten, the app should say so plainly rather
  than let the user assume they are covered" — was simply not built, so the app
  let people assume. The panel now carries a **Last copy** date and one sentence
  when work has landed since.
  · **Not every `export.written` is a copy**, and this is the part that would
  have been a worse lie than the silence. One noun serves the whole export, the
  range *reading* copy that `inspectExport` refuses, and the calendar `.ics`.
  `WHOLE_COPY_SCOPES` lives beside the reader and `deliverCopy` refuses anything
  outside it — the 1.9.2 lesson applied, so the set cannot fall behind the
  writers.
  · **"Stale" is measured on the log, never on the clock** — ADR-0004's own
  definition, with its own warning attached ("must not fire on a device that is
  simply used less often"). And **strictly after** the copy event: a file never
  contains its own record, so at-or-after would leave the sentence on
  permanently, one millisecond after every export.
  · **The Restore-on-empty action existed only as a paragraph in ADR-0004.**
  "One action, one tap, into the picker." What existed was a file input inside
  the panel, inside a folding group, under a heading. It shows on an empty store
  now — `nodes.size === 0`, not "nothing held", which is also true of somebody
  who has finished everything.
  · **The finding that made it urgent: `kv` goes with the events.** `tour.seen`
  is a kv key, so after a clearing the walkthrough runs again and the app greets
  a person who has just lost everything with "Welcome to Quietkeep."
  · **The persistence sentence is worded definitionally, not as a platform
  claim.** V-00 measured the grant, the quota and a force-quit; it never measured
  the clearing path. That is **V-20**, filed, and the run is the restore walk —
  export, clear, observe, restore — so it answers the platform question and
  proves the new path on the same pass.
  · **The ADR index had been stale since 0038** — twenty-four records missing,
  and eleven of the filenames I first wrote for them were wrong until checked
  against disk. Filled and every link verified to resolve.
  · ADR-0062. Gates green, `staging`, Spine watched on the exact head.

- **2026-08-02 (Noah: "Kind plus encryption sounds best" → "Go")** —
  **1.13.0 "The journal"** — the last v1.5 item, and the one that was blocked on
  a decision rather than on work.
  · **The decision was his because ADR-0005 said no session could make it.** Its
  overturn clause reads "Nothing about the vault split". ADR-0061 supersedes that
  clause; 0005 keeps a `Superseded by` header and is otherwise left exactly as
  written, per the ADR rules. Its other three bindings survive untouched and the
  release honours all of them.
  · **Q-10's objection never reached the journal**, and this is the part I had
  wrong for most of the session. Its argument — two apps, remember to check both,
  Next up forced to pick a side — is about work versus home, where both sides
  hold work that must return. The journal holds nothing that returns. And the
  lens it recommended was never an option: a lens filters what you LOOK AT, while
  encryption changes what the fold CAN read.
  · **The fold never touches ciphertext.** Entries are nodes; the surface reads
  the log and opens them in the UI (the 1.4.0 log-viewer pattern). No new
  `NodeState` field, no disposition entry, no three-place ceremony — and search
  cannot index the journal because there is nothing in state to index, which is
  stronger than remembering to exclude it. Entries carry no title, because a
  title would be plaintext in the log.
  · **`journal` joined `DEMAND_FREE_KINDS`**, verified by running the gate first:
  without it every private entry took a cure clock and came back on a work
  surface as an untitled row. Deliberate-failure proof pinned.
  · **The held list excludes journal entries; the coverage gauge still counts
  them.** The gauge PROVES law 1 over every node, and excluding a kind from a
  proof is how law 1 gets defined away — the merged-node finding of the 1.3.1
  audit. The held list is the todo list, which is a different question.
  · **PBKDF2-SHA-256 at 600,000 rounds**, the count stored with the salt so a
  later raise can still open older entries, and a count below the floor refused
  rather than honoured. Argon2id would have meant a WASM dependency; ADR-0005
  delegated this choice to the build, which I had been wrongly holding as
  Noah's.
  · **Unlocking proves the key against a real entry** before reporting success.
  A wrong passphrase derives a perfectly valid key that opens nothing, so
  unlocking on derivation alone would have shown an empty journal — which reads
  as "your entries are gone".
  · Refused and stated rather than half-built: no passphrase change (it would
  mean re-sealing every entry), no tags, no counts.
  · ADR-0061, ACCESSIBILITY B-32, vocabulary updated for `journal.sealed` and
  the superseded `vault.*` pair.

- **2026-08-02 (Noah: "Promote to main")** — **`main` fast-forwarded
  `8cc85f9 → 155967b`**, carrying 1.12.0. Spine 188 watched green on the exact
  head before the promote; Deploy 185 green on `main` at the same sha after it,
  both editions out.

- **2026-08-02 (Noah: "Promote and continue")** — **1.12.0 "A person has a page
  of their own"** — and the records made true in both directions.
  · **`personView` had no caller.** It was written, exported and unit-tested in
  two files, and no surface anywhere called it: a projection with nowhere to
  render, the same "complete and unreachable" shape `node.merged` had before
  1.7.0. The `#people` surface only ever rendered `waitingOnAnyone`, which is
  owed-across-everyone, not any one person.
  · **And names on an item were dead text.** `<span>`s, so the one question a
  name raises — *what else is with them?* — could be asked from nowhere. That
  is the "dead lists become doors" work 1.6.0 did everywhere else and missed
  here, and it is a reachability defect before it is anything else: keyboard and
  screen-reader users could not get to a person at all.
  · Their own sheet is the home, so this costs no new chrome on the landing
  surface — which 1.11.0 had just finished simplifying.
  · **Two corrections to my own earlier claims.** The readiness sweep recorded
  "the bother flow and the staff-call/person lens are both shipped". The bother
  flow is; the lens was **half** shipped, and "staff-call lens" means the DELTA
  half, which waits on anchors. Build-plan item 33 is annotated rather than
  struck for the same reason — a build plan that marks a deferred thing done is
  the drift these records exist to prevent, and that cuts both ways.
  · Item 35 (the status report) IS struck, after checking all four formats
  against the code rather than against memory.
  · **The a11y gate caught its own driver.** The first version linked a person
  to a project, so nothing landed in the owed list and the registry entry
  matched nothing — the gate refusing to pass on an empty selector, exactly as
  designed. The entry is now scoped to the group so it cannot pass or fail on
  fixture shape.
  · A brittle smoke assertion fixed on the way past: it counted every
  `person.created` in the store and expected one, so it failed the moment any
  other section named anybody. It asks about Sam now, which is what it meant.
  · ACCESSIBILITY B-31. No ADR: this builds a recorded item on an existing
  projection and adds no new decision.

- **2026-08-02 (Noah: "Promote and continue")** — **`main` fast-forwarded
  `0745796 → 8cc85f9`**, carrying 1.11.0. Spine 186 watched green on the exact
  head before the promote; Deploy 183 green on `main` at the same sha after it.

- **2026-08-02 (Noah: "Promote and continue")** — **1.11.0 "A few things you
  could pick up"** — the menu shape he asked for: *"queue towards offering what
  the user wants to choose to do, as opposed to a list of things waiting to be
  done."*
  · **The way through was in the thesis's own wording.** §4's choice-overload
  finding is qualified — the direction holds "where options are SIMILAR and
  stakes are ambiguous" — so it does not condemn a small set of options that are
  deliberately unalike. The mechanism is `NextUpReason`, which already partitions
  the queue by WHY something is offered: **at most one item per reason**, capped
  at two. Nothing scored, nothing balanced; the classes do the work.
  · **The precedence is untouched.** A real date arriving today still leads.
  · **One wish rides along, and the guard is structural rather than copy.**
  `offerNow` returns it as a bare node with no reason, no pressure and no demand
  clock, so there is nothing for a surface to render as a demand, and it carries
  no Done — law 6's "deliberate promotion, never an obligation that accrued".
  · **The count is gone.** "8 things are asking" was a count of pending work on
  the landing surface — the nearest thing this app has to the backlog headline
  law 8 names outright — while the coverage gauge three lines up already states
  the honest totals.
  · **The smoke walk's anti-theatre check moved to the gauge**, and deliberately
  to `ready now` rather than `held`: a completed thing is still held, because law
  1 does not exempt finished work, so `held` is exactly the number that must not
  move when something is done.
  · A correction to my own working shorthand, for the record: I had been glossing
  **law 8 as "caps with true counts"**. It is *"Rest is legitimate"*, and its
  operative second clause is that the bounded surface is **never the backlog**.
  The repo's own citations of law 8 for caps are right on that clause; my gloss
  was lossy, and it happened to matter here.
  · ADR-0060, ACCESSIBILITY B-30, thesis §4 and §9 updated in the same commit.

- **2026-08-02 (Noah: "Promote and continue")** — **`main` fast-forwarded
  `f237a1f → 0745796`**, carrying 1.9.1, 1.9.2 and 1.10.0. Spine 183 watched
  green on the exact head before the promote; Deploy 180 green on `main` at the
  same sha after it. Three releases in one promote: the two gates the repo had
  claimed but never had, the audit of 1.4.0–1.9.1 and its nine findings, and the
  timer reframe.

- **2026-08-02 (Noah: "Presence not progress, duration is chosen, and drop the
  abandoned outcome")** — **1.10.0 "What a fold takes with it" → the timer
  reframe** — three decisions of his, and one of them corrected me mid-design.
  · **The recorded research and the shipped thing had drifted apart.** Thesis §4
  has always said the timer's value is that "two minutes" is a **cheap
  decision** — an activation aid. What shipped counted down and then asked
  whether you had finished, which is a constraint. Noah's reframe ("I will just
  get started" rather than "I will work within two minutes") was the thesis, not
  a new idea.
  · **His correction, which went further than mine.** He proposed a plant that
  grows or a row of glyphs filling left to right, then caught it himself: that
  would make abandoning appear to have a consequence. He is right, and the same
  objection kills **the filling circle I had endorsed** — anything rendered
  part-way through a chosen span is a fraction, and a fraction is a score. A
  growth metaphor is worse still: a thing that can be stunted is the chain
  pattern in warmer clothes. Recorded in ADR-0059 because two of the three
  rejected shapes look like the fix.
  · **So: presence, not progress.** A pulsing mark that says only "on", and the
  commitment in a SENTENCE — "Twenty minutes, running." A sentence can hold
  something you are allowed to walk away from; a shape either completes or
  visibly does not.
  · **The length is chosen** — `timer.length.set` folded to
  `State.timerMinutes`, the `request.slot.set` shape, so it travels with the
  log. Set in Extras and **not** at the point of starting: showing options to
  someone stuck at activation is choice overload where it costs most (§4). Two
  minutes stays the default.
  · **The verdict is gone, and it should never have existed.** `do-now.timed`
  wrote `outcome: 'completed' | 'abandoned'` on every stop. Nobody saw the word
  — the log viewer says only that a timer ran — but it was permanent and it
  went into every export, and `src/requests.ts` says in terms that "a record of
  the times you did not do your own work is the ledger this app exists to NOT
  keep — the do-now offer's 'Not now' writes nothing, **ever**". The button
  that declined wrote nothing; the timer beside it wrote a verdict. Now a span
  and nothing else, the `focus.started`/`focus.ended` shape — and the chosen
  length is deliberately absent from the payload, so a shortfall cannot be
  subtracted (the arithmetic that deleted the report's "Started" section).
  · **Two defects the work found in itself.** A button that named one length
  while starting another, when the length was changed in Extras with an offer
  on screen — fixed with a targeted `relabelTimer`, after a full
  `triage.refresh()` in `refreshAll` turned out to rebuild the clarify card on
  every commit anywhere and change which card was showing mid-interaction. And
  the smoke walk left live work behind that later sections position off — the
  trap this file records twice already ("ITS OWN item"; "leave the inbox as this
  section found it"), which I walked into anyway and which cost a worktree
  bisect against the previous head to prove.
  · Thesis §4 rewritten in the same commit — it called the timer "a bounded
  commitment", which is no longer what it is. ADR-0059, ACCESSIBILITY B-29.

- **2026-08-01 (Noah: "Continue")** — **1.9.2 "What a fold takes with it"** —
  the adversarial audit of 1.4.0–1.9.1, nine releases and the longest this repo
  has gone without one. The findings share one cause worth stating before any
  of them: **1.7.0 wrote the merge as a hand-written list of what a fold
  carries, and every release after it added a `NodeState` field without
  visiting that list.** Nothing was ever deleted — the log is append-only and
  every field survived in state; only the projections excluded merged nodes, so
  the records had nowhere to show.
  · **F-A — a fold destroyed the source's decision log and its standing
  decline.** `decisions` (1.9.0) and `notNow` (1.8.0) were not in the carry
  list, and both readers exclude merged nodes. Fixed by READING through the
  fold (`src/merged.ts`) rather than copying: copies carry fresh event ids, so
  merge → unmerge → merge would leave duplicate decision rows that no verb in
  this app can remove, and `delta.decided` — a set difference on ids — would
  re-report them in the one artefact that leaves the device.
  · **F-A′ — and the decline's park WAS carried**, so folding a
  declined-and-parked duplicate into live work made that work go quiet under
  `merge:carried` with nothing explaining why. A decline's park is the decline,
  not a date about the work.
  · **F-G — the dependency arithmetic broke in both directions.** `feeds` and
  `leadDays` were never carried, and `dependencyView` drops a downstream with
  `mergedInto`, so an upstream's latest-start fell from a real number to null.
  "Start it today" became silence — the assembled-context half of law 3.
  · **F-B — targets were offered that the gate must refuse**, and the Menu was
  only one case: `aspiration` and `pebble` are demand-free by kind, refused by
  a different belt. Now one `canHold` predicate, asked by the picker and again
  at commit, plus a direction rule (a wish folds into a wish; work never folds
  into a wish).
  · **F-I — "Clear what I am holding" would not run AT ALL for anyone who had
  folded a duplicate.** `clearEvents` trashed only HELD nodes; a folded-away
  source is not held, so trashing the survivor silenced it and the belt refused
  the whole batch. Shipped in 1.7.0, never noticed, and **found by the new
  smoke walk within minutes of writing it** — the old walk always split its one
  fold back out, so no folded pair ever survived to the purge step. The
  function's comment said this "cannot violate law 1", which was true when it
  was written and stopped being true two releases later.
  · **F-C — a second reader of `todayFor`**, contradicting `composed.ts`'s
  "ONE reader" claim, which is the entire mechanism of expiry-by-projection.
  Pinned by a source scan.
  · **F-F — the 150-seed equivalence oracle had a blind spot exactly where the
  gate last changed.** Its generator emitted only 1.3.x-era kinds, so
  `node.unmerged` — the one branch the gate has gained since the oracle was
  frozen — had never once been generated. The coverage pin then found **eight
  more** silent-risk kinds it had never produced. Widened; the property still
  finds no divergence, which is worth recording as a result rather than as an
  absence.
  · **F-D/F-E — hygiene, and stated as hygiene.** Missing clone and backfill
  lines against the three-place rule. None misbehaved: nothing mutates a
  `notNow` in place, `Number.isFinite(undefined)` is false, `!undefined` is
  true. Writing the invariant GENERICALLY (for every object-valued key, assert
  identities differ) rather than as a field list found two more the audit had
  not spotted, including one in `sourceTags`.
  · **The durable half — `MERGE_DISPOSITION`.** Every `NodeState` field must be
  named as carried (with its noun), read-through (with its reader), or
  deliberately not carried (with the reason, in words). Totality is a compile
  error plus a runtime key-set check. A reasoned "no" is a fine answer; forcing
  the sentence is the mechanism. **F-H:** the test that guarded the merge was
  called *"…— nothing swallowed"* and asserted exactly the four things the
  1.7.0 list carried, so it shared the code's blind spot permanently. It keeps
  its assertions and gives up the claim.
  · ADR-0058, amending ADR-0053 under that record's own overturn clause
  ("only by evidence that it carried wrongly … the answer would be a smarter
  carry"). The cross-app lesson is in the hub's `LESSONS.md`.

- **2026-08-01 (Noah: "Promote. Continue")** — **1.9.1 "The gates it
  claimed"** — the "say true things" patch turned on the repo itself. A sweep
  of everything the docs claim to check found three claims with nothing behind
  them, and two records that contradicted each other.
  · **The closed-event-list gate** (`npm run events:check`, tools/event-list.mjs):
  `isKnownKind` has refused unlisted kinds at runtime since Phase 0, and
  NOTHING ever asked whether the code's list and `docs/event-vocabulary.md`
  still named the same events — the file CLAUDE.md calls the source of truth
  could drift in silence. Now checked in both directions, plus the Silent?
  column, which the vocabulary itself calls "the machine-checkable form of
  product law 1" and which nothing had ever machine-checked. 88 kinds, both
  sides. Its first run FAILED — on my own parser, which read only the first
  backticked name and so dropped the ten nouns written as shared entries
  (`stakeholder.added` / `.removed`). The gate reported the doc as the thing
  at fault, which is the failure mode a gate must never have; fixed, and the
  fix is commented where it happened.
  · **The write-gate-bypass gate** (`npm run writegate:check`): "nothing
  outside the gate imports the store's write API" — claimed since the build
  plan was written, checked by nothing, while five legitimate raw-write sites
  accumulated. Raw writes are not forbidden; UNRECORDED ones are. The
  allowlist carries a reason per entry, and a stale entry fails too. Its first
  run found two I had not thought of (purge's `replaceAll([])`, snapshot's
  `putSnapshot`) — both fine, both now argued in writing.
  · **The four-banned-words claim was wrong, and the fix is the opposite of
  the obvious one.** The build plan named `overdue`/`late`/`missed`/`streak`;
  the grep covers two. `late` and `missed` cannot be gated at source —
  nearly every occurrence in `src/` is a comment explaining that the app never
  says them, and a grep cannot tell a prohibition from a violation. What
  matters is that a person never SEES one, and the smoke walk has swept the
  rendered page for all four all along. So the claim was corrected to describe
  what is actually true, and a second sweep added late in the walk, where the
  page carries far more real content than at the first.
  · **Two records that contradicted each other**: B-01 said no pressure
  surface exists (stale since 0.5.0 or so); B-05 named a "pressure gradient"
  as something that does. Neither was right. Of B-01's four redundant
  channels, **only position and text were ever built** — there is no fill bar
  and no luminance ramp in `app.css`, which is why the grayscale check still
  has nothing to strip. That is a stronger position than the old sentence
  implied and a visible gap at the same time, so both rows now say it.
  · Also corrected: the build plan's gate list never mentioned five gates that
  have been running all along (storage, headers, editions, workflows, thesis),
  and `deploy.yml` still carried an honesty note saying the deploy had never
  run green and the repo had no app shell — both long false.

- **2026-08-01 (after 1.9.0)** — **`main` fast-forwarded to `f237a1f` on
  Noah's "Promote"**, carrying 1.8.0 (request slots, the Not Now ledger,
  the bother flow aligned to its own vocabulary) and 1.9.0 (stakeholders
  that are read, the decision log, the "Decided" report section, and the
  unreachable "Started" section deleted with a totality gate in its
  place). Spine runs 177–178 were watched green on those exact heads
  before the fast-forward; Deploy run 175 green on `main` at the same sha
  (V-10).

- **2026-08-01 (Noah: "Continue")** — **1.9.0 "What a meeting needs"** —
  build-plan item 31's remainder
  ([ADR-0057](docs/adr/0057-stakeholders-and-the-decision-log.md)). Three
  nouns that had existed since Phase 0 with no fold, no emitter and no
  reader got all three; one shipped surface lost a section that could never
  render.
  · **Stakeholders that are read**, and the design ruling I want kept: the
  obvious move was a dedicated `NodeState.stakeholders` on the OPR
  precedent, and it was WRONG — `n.opr` is a field because its cardinality
  differs, while stakeholders are multi-valued, which is what `people[]`
  already is. A second home would have contradicted itself on day one (a
  removal clearing the field while the sheet's people list and the person
  lens kept rendering the name — the OPR defect reintroduced by its own
  fix) and been silently dropped by a merge. Keeping one home also makes
  the healing perfect: every stakeholder linked since 0.15.0 appears with
  nothing re-entered.
  · **`stakeholder.removed` is the only subtraction in the vocabulary**
  (there is no `person.unlinked` noun at all), so it is scoped to person
  AND relation — taking somebody off must never strip their OPR. A removal
  naming nobody is a no-op, never a remove-all. Convergence is replay over
  the log's total order, which for a per-person payload IS per-person LWW —
  the `dependency.released` discipline.
  · **The decision log**: append-only, idempotent by event id, no LWW slot
  (two devices logging different decisions must end with both). Never
  edited, never removed — ADR-0048's rule — and the way back is stated in
  the hint: log the new decision, which is what a decision log is for.
  `meeting` is folded and rendered but written by nothing yet (law 9).
  · **A "Decided" section in the status report**, and the empty-guard
  taught about it — a fourth section without that is a document listing
  real decisions that also says "Nothing to report", which is the audit
  finding delta.ts already carries.
  · **The "Started" defect**: `ChangeKind` declared it, `HEADS` gave it a
  heading, `ORDER` gave it a slot, and nothing ever emitted it — every
  report shipped with a section that could not render. REMOVED rather than
  implemented: started-and-not-finished would become computable by
  subtraction across two consecutive reports, in a document you hand your
  manager, and this app has no in-progress state on purpose. Every
  candidate definition was dishonest (the `start` clock is the DEFER verb)
  or uncomputable (focus is invisible to a two-State diff; `todayFor` is
  deliberately unaskable). **The durable half is the invariant**: a
  `Record<ChangeKind, witness>` totality test now proves every declared
  kind reachable.
  · **Anchors deferred** (build-plan 34 stays open, and says so): an anchor
  node would be SILENT under law 1 today — not demand-free, no cure — so
  the coverage gauge would stop reading zero, and the gauge is what proves
  law 1. Plus `anchor.fired` carries no watermark, so its delta cut would
  be the degraded at-only one an audit already rescued the export path
  from. Needs a gate change plus a shipped surface: its own release.
  · Also: the report walked in smoke for the first time, and a dead
  `periodWords` import swept.

- **2026-08-01 (Noah: "Continue")** — **1.8.0 "Asking, and declining"** —
  request slots + the Not Now ledger
  ([ADR-0056](docs/adr/0056-request-slots-and-the-not-now-ledger.md)); the
  v1.5 line's last cheap item, built the moment its precondition (the park
  verbs, ADR-0045) had soaked. The direction was chosen by a full backlog
  sweep after the roadmap closed; the staff-call pack (anchors, delta,
  stakeholders, decision log) is the recorded runner-up.
  · **One noun, two homes, one write shape**: `request.declined` finally has
  emitters — the sheet's "Someone asked for this?" group and the bother
  flow's third branch, both through `declinePair` (the record + a deliberate
  park in one batch; the gate's cure stays as backstop only). `person` was
  widened to `NodeId | null` (the `waitingOn` precedent); `what` is the
  title snapshot (the consent-sentence rule; rename-proof, pinned).
  · **The bother flow aligned to the vocabulary**: event-vocabulary.md said
  "lands on the Not Now ledger with a park.set" from the start — the build
  trashed it and promised "it does not come back". The trash is gone; the
  relief holds because a park never demands. Copy, tests, and smoke all
  rewritten to the new truth.
  · **The ledger** lives behind ⓘ beside "Things you let go" — ADR-0050's
  species: capped 25, true count in words, rows are doors, one verb, a name
  and a date and NEVER a count (law 5, regex-asserted over the rendered
  words in smoke).
  · **The slot**: one weekday, `weekly:mon`…`weekly:sun`, `''` clears,
  refused-not-guessed; NOT a module — null slot means invisible, setting a
  day IS the opt-in. Exactly two effects: the sheet's "Park it until the
  request slot — back ⟨day⟩" button, and declines parking to the slot.
  Nothing at capture, ever.
  · **Un-declining is `clock.cleared{park}`** — no new noun; the gate cures
  the clear so the carried thing lands back today, covered. LWW convergence
  property-tested in both shard orders.
  · Rider: **imported repeats are counted** — "60 of them repeat on a
  rhythm" instead of the bare tag name "repeat" (the pre-1.4.0
  unnumbered-loss shape, closed).
  · Also found and fixed: the 1.7.0 ACCESSIBILITY.md edit had swallowed the
  "Part 2 — Findings register" heading; restored with B-27.

- **2026-08-01 (after 1.7.2)** — **`main` fast-forwarded to `e99aa80` on
  Noah's "Promote"**, carrying 1.7.0 (folding duplicates, the twins range,
  the lens), 1.7.1 (the panel says what it means; only lines that mean
  something), and 1.7.2 (the panel folds, edition-truthful words, the
  thesis opens and is styled, toggle labels state the next press). Spine
  runs 172–174 were watched green on those exact heads before the
  fast-forward; Deploy run 171 green on `main` at the same sha (V-10).
  Both editions of everything he photographed this morning are now in
  production.

- **2026-08-01 (his second round of screenshots)** — **1.7.2** — Noah kept
  reading the panel and found five more, including two that had never been
  true anywhere.
  · **The panel folds** ([ADR-0055](docs/adr/0055-the-panel-folds.md)): his
  words — nothing separates the major sections, the panel carries too much,
  "I think the section should collapse as well now, or we need a separate
  settings". The fold is the smaller of his two offers: Help / Your data /
  Extras / About behind real disclosure headers, closed by default, open set
  remembered per device (kv), the opening and the way out never folded, and
  the walkthrough's handoff unfolds Your data so its promise stays kept.
  · **Edition-truthful words** (ADR-0036 amended): he is on Quietkeep Sync
  and caught the default's copy lying — "there is no server", "the default
  app you are in never contacts anything at all". `src/ui/edition.ts` carries
  the word-level fact from the entry point's shape; the panel header and the
  walkthrough name the edition; `[data-edition]` paragraphs show their own
  build's truth. The artefact-level guarantee (module absent from the default
  bundle) is untouched.
  · **"Planning for Humans" never opened** — two SW defects and a CSP one.
  The navigation branch answered every slow navigation with the cached APP
  shell (tapping the link landed on the main screen) and wrote every
  navigation's body under `./index.html` — one good visit to the thesis
  would have replaced the cached app with an essay. Fixed: per-page cache
  keys, fallback to the page actually asked for. And the page itself carried
  an inline `<style>` that `style-src 'self'` refuses — the deployed thesis
  had rendered UNSTYLED since the day it shipped, unmeasured because no walk
  ever navigated there. Styles moved to `/why.css`; smoke now visits the
  page; both files in the SW shell.
  · **Toggle labels state the next press**: "Read the record" ↔ "Close the
  record", "Things you let go" ↔ "Close the list" — aria-expanded told a
  screen reader and told a sighted reader nothing.
  · B-26; changelog 1.7.2 (ITERATION) + SW cache together.

- **2026-08-01 (his screenshots)** — **1.7.1** — five ⓘ-panel defects Noah
  photographed on device, all confirmed against source and fixed the same
  hour.
  · The walkthrough's last step said *"Next opens it…"* while the button on
  that step is relabelled **"Get started"** (tour.ts renames it on the final
  step; the copy was written against the old name) — it now names the real
  button and says what it opens.
  · The badge explainer had been wedged into the middle of "Reminders that
  reach you", ahead of the calendar's own snapshot caveat — whose "It" then
  read as the icon number. The caveat moved up beside the calendar's story
  and the badge block got its own heading.
  · **What's new printed raw code**: the release notes are rendered with
  textContent (innerHTML is banned), but the strings carried `&ldquo;`-class
  entities and `**` marks — so the panel showed the markup itself. The
  strings now carry real Unicode punctuation, and the renderer translates a
  note's `**lead**` into a real `<strong>` built from text nodes.
  CHANGELOG.md regenerates from the same array, so the two stay one.
  · **Stray rules cut the panel apart**: every `.storage-note` status region
  draws a `border-top`, and a dozen of them sit empty through the whole panel
  — each drew a full-width line, so "Save a copy first" was fenced off from
  the clearing buttons it guards and a section's caveat read as the next
  section's. `.storage-note:empty` now takes no room and draws no rule; the
  live regions stay in the tree.
  · **Caveats read as body text**: the small print under each control now
  sits in italics at the same registered `--ink-soft` pair — his words: all
  the words are needed, but it was not done smartly. Posture changed,
  contrast did not.
  No behaviour changes; changelog 1.7.1 (ITERATION) + SW cache together.

- **2026-08-01 (after the promote)** — **1.7.0 "Duplicate handling and the
  lens"** — Noah's direct instruction in the promote message; the watch-list's
  first trigger fired and Q-10's recorded shape built
  ([ADR-0053](docs/adr/0053-folding-a-duplicate.md),
  [ADR-0054](docs/adr/0054-the-lens.md)).
  · **Folding a duplicate**: `node.merged` finally has its UI — and its law: a
  fold is a CARRY BATCH, never a bare event, because a bare `node.merged` is a
  data-loss verb. The batch carries every demand clock the survivor lacks
  (stamped `merge:carried`), the note (copy or join with a blank line — the
  merge decides for neither), people links, and children re-homed, then the
  fold itself. The survivor's own values always stand. Property-tested: date,
  note, person, child, each asserted survived.
  · **`node.unmerged`** — the release's one new noun, Silent-risk yes: a
  split-out node stands alone again and the gate cures it in the same batch.
  Unmerge restores standing, not the world; both directions share one LWW slot
  so shards converge. The survivor's sheet lists what folded into it, each row
  carrying its own "Split it back out" — the trash view's lesson applied.
  · **Legality computed, never refused after offer**: not itself, not its own
  descendant, people only into people; the picker offers `legalMergeTargets`
  and nothing else, filtered as you type.
  · **The twins range** "Sharing a name with something else": EXACT normalized
  equality, never fuzzy — a false "this is the same" costs more than a missed
  one.
  · **The lens** (src/lens.ts): one live top-level container filters the held
  list's ROWS, before the cap slices; the law-1 line renders every time it is
  on, with no count. The never-filter fence: gauge, Next up, replan, re-entry,
  search take no lens argument — the type system is the fence, the tests
  restate it. The choice is kv (`lens.root`), a device view preference, never
  an event; a dead root stands the lens down rather than filtering by a ghost.
  · The a11y gate's first run on the new surfaces found two real defects
  (fixed same commit, B-25): the merge filter's UA-default placeholder at
  4.08:1, and the lens select's `min-width:auto` pushing the page sideways
  257px at 320px/200%.

- **2026-08-01 (after 1.6.0)** — **`main` fast-forwarded to `c47e21e` on
  Noah's "Promote"**, carrying 1.4.0 (notes, the readable record, per-node
  history), 1.5.0 (wholesale acts, "Things you let go", range copies), and
  1.6.0 (the tree, doors, Review's four, the session close, optional
  Composed Today). Spine runs 167–169 were watched green on those heads
  before the fast-forward; Deploy run 166 green on `main` at the same sha
  (V-10). The approved roadmap is now fully in production. Next, on his
  word in the same message: duplicate handling and the Home/Work lens
  (Q-10's recorded shape).

- **2026-08-01 (late night)** — **1.6.0 "Seeing and choosing"** — the roadmap's
  last slotted release ([ADR-0051](docs/adr/0051-composed-today.md),
  [ADR-0052](docs/adr/0052-session-close.md)); build-plan items 26, 36, 39,
  and 40 struck through.
  · **The modules fold**: `module.enabled`/`disabled` had existed since
  Phase 0 with no emitter and no fold — `State.modules` is the fold, and
  Composed Today is the first customer.
  · **Composed Today, OPTIONAL** (Noah: *"Can you make it optional?"*): an
  opt-in Extra off by default; two new nouns (`today.chosen`/`released`)
  folding to one LWW slot; **the expiry is the projection** — `composedFor`
  answers only for the current day, no reader takes a day argument, so
  "chosen and not done" is structurally uncomputable. Cap 5, stated in words
  at the button. The verb lives on the sheet; the strip above Next up is
  doors only.
  · **The tree** (src/tree-view.ts): roots + flattened rows, ONE
  parent→children map + explicit stack (10k-deep test), per-branch cap 25
  with true totals, behind the gauge-pattern control — never the landing
  view, rows carry one verb.
  · **Doors**: the Next-up behind list, the coverage rows, and the sheet's
  children rows all open the fresh node's sheet; `mountWork`/`mountFocus`/
  `mountAbout` grew the standard callbacks (the app.ts:471 lesson — call
  sites changed in the same commit).
  · **Review's four**: `quietAreas` (ADR-0013's dormant — areas HOLDING work
  where nothing finished in 30 days; unknowable rest excluded) and
  `unfedGoals` (unsupported goal; transitive, since goals are fed through
  projects; named "unfed" — "unsupported" is a banned token in the
  update-copy gate). The classes partition — a node is never listed twice —
  and REVIEW_CAP stays 3.
  · **The session close** (item 40) rides the comms chip's `surfacing` ramp
  as its second rider: the win in words, the gauge in WORDS (B-02), never a
  duration or a streak; it never survives a reload. It carries the day-end
  question (item 26): a thread from an EARLIER sitting still unspent gets
  one question, one door, one honest release —
  `resume.card.expired{toReviewQuestion:true}` set true at last by the one
  path that really is the question.

- **2026-08-01 (night)** — **1.5.0 "Wholesale"** — bulk acts on named ranges
  ([ADR-0049](docs/adr/0049-wholesale-acts.md)), the trash view
  ([ADR-0050](docs/adr/0050-things-you-let-go.md)), range export as a reading
  copy. Two of Noah's decisions govern it: the soak-gate is removed (*"I know
  how a planner should work unless you don't think the data has been
  tested?"* — and it IS tested: the oracle, 737 unit tests, two audits), and
  notes recovery is his option (b), on his timing (*"I will reimport all of
  Omnifocus when I want it"*) — no repair tool, ever.
  · **One new noun**, the roadmap's only one: `range.acted{scope, verb,
  count}`, written first in each chunk, `scope` the literal sentence agreed
  to (the consent-sentence rule). Deliberately unfolded.
  · **The machinery**: `planBulk`/`runBulk`/`undoBulk` (src/ui/bulk-intents)
  — byte-parity with the single intents (property-tested), the app's first
  chunked commits (~500 events each on the session's serialising queue), a
  per-chunk fresh check that skips-and-counts what moved on, and undo from
  facts captured at act time (the exact prior parent, the prior category).
  · **Two conflicts ruled on in ADR-0049**: receipts (counts of the APP's
  work) are legal during and after a bulk act, scores about the person never
  — law 5 stands unweakened; and Let-them-go auto-exports BEFORE the first
  trashed event (the migration precedent), with the ordering machine-checked
  by smoke — the repo's first export-before-destruction assertion.
  · **Range families**: `menu` ranges join the picker (promote semantics
  only, no conveyor — the six routes are illegal on wishes; ADR-0044
  amended). Hygiene tests split per family.
  · **The trash view is a FIX**: "You can still keep it after all" had been
  true for ten seconds — `#detail-untrash` was reachable only while the
  sheet stayed open, then no path back existed at all. "Things you let go"
  (25 + true count, one verb per row: open the sheet) is the path;
  `trashedNodes` beside `heldNodes`; search stays trash-free with its
  comment amended in the same commit.
  · **Range export is a rendering** (`planner-range-copy`): a range's events
  alone cannot fold legally under law 1, so a seedable partial file is not
  expressible — the reading copy is refused for import by construction and
  law 9 is untouchable. The scout also found `exportAll` imported dead in
  about.ts since the deliverCopy extraction — swept.

- **2026-08-01 (later)** — **1.4.0 "What a thing carries, and what the app
  did"** — the trust spine from the approved roadmap
  ([ADR-0047](docs/adr/0047-the-note-field.md),
  [ADR-0048](docs/adr/0048-the-log-viewer.md)).
  · **Notes on items**: a textarea on the sheet riding
  `node.field.set{field:'note'}` — the noun existed since Phase 0 with
  per-field LWW folding and NOTHING ever read `n.fields`; `noteOf` is the
  first real reader. `cleanNote` (src/note.ts) is shared with the importer:
  keeps `\n`/`\t`, strips format/control, caps 10k. Privacy class fixed in
  ADR-0047: title-class, plaintext in exports as titles are; the encryption
  binding governs the journal, a different domain.
  · **The importer carries notes**: the CSV Notes cell lands in full;
  TaskPaper note lines attach to the item above them (consecutive lines join
  as ONE `node.field.set` — two would be LWW overwriting itself); a leading
  orphan note attaches to nothing and is not counted as carried. The summary
  sentence inverted: "N notes come across with their items."
  · **`eventWords`** (src/log-words.ts): one plain-words line per event,
  total over all 84 kinds (totality test), "you" for deliberate acts, "the
  app" for cures — which say why ("so it would not go silent") — and an
  honest raw-name fallback for kinds newer than the build. Content never
  rides along: a note/journal line says one was written, never what.
  · **The log viewer** behind (i): read-only, newest day first, 50 per
  reveal with the true total, built on reveal (the coverage-list lesson).
  **Per-node history** on the sheet: "What happened to this", cures indented
  under their cause — the permanent answer to "it feels lost", and the
  surface whose absence let the OPR defect live unnoticed.
  · Quiet sheet line: "sorted as ⟨route⟩". a11y: `log view` and
  `detail sheet, history open` registry states + driver staging (the history
  audited on a captured item so the cure line is guaranteed present); B-22.

- **2026-08-01** — **`main` fast-forwarded to `19f4d1e` on Noah's "Promote and
  continue"**, carrying everything from 1.2.0 through 1.3.1: undo, search, the
  do-now and Next-up fixes, the "in project" place labels, the 1.2.3 trust
  patch, sort mode with named ranges and the defer verb, the admit() rework,
  and the fifteen audit fixes. Spine run 163 was watched green on that exact
  commit before the fast-forward; Deploy run 160 went green on `main` at the
  same sha (V-10). Production now carries the release the 30-day dogfood gate
  honestly starts on. Next per the approved roadmap: 1.4.0 "What a thing
  carries, and what the app did."

- **2026-07-31 (night)** — **1.3.1: the adversarial audit of 1.3.0, all fifteen
  findings fixed.** The release shipped green through every gate, so the audit
  was pointed at what the gates do NOT ask — and it found two CRITICAL mainline
  defects plus thirteen lesser ones, every finding verified with a repro before
  it was fixed and pinned with a test after.
  · **The two CRITICALs:** a due-dated item routed to Someday kept its date
  invisibly forever (the Menu group wins every surface, no replan card raises,
  the sheet hides temporal rows, sort hygiene excludes it — law 3 violated in
  the mainline). The someday/reference routes now shed the node's demand
  clocks in the same batch, and a new gate belt refuses Menu+demand-clock
  outright, oracle side included. And sort mode's route buttons acted on the
  card as painted — the sheet is one tap away, so the on-screen item could be
  completed or shelved and the stale tap still routed it; every act re-checks
  the live node now and refuses in words (the smoke fires a genuinely stale
  click to prove it).
  · **The gate grew three corrections** (ADR-0046 amended): the born set (the
  dirty-set rework was blind to ghosts `ensureNode` mints mid-batch and
  rejected batches the old scan accepted); `collectDependents` iterative (a
  deep chain returned a raw RangeError instead of a decision — pinned at
  10,000); and a stamp-disordered batch is refused rather than tolerated
  (`dependency.released` is the one non-commutative fold op; a disordered
  batch could make a cycle real in an append-only log). The refusal caught its
  first real bug the day it landed: undo's waiting-for branch emitted seqs out
  of order.
  · **The year-0099 pin found the fix was half-shipped**: `detail-intents` was
  corrected but `time.ts` itself still collapsed year 99 → 1999 through four
  raw `Date.UTC` calls (and `localDayKey` printed year 99 unpadded). One
  `utcMs` now lives in time.ts and every parts-built date goes through it —
  the deliberate-failure discipline working as designed: the test failed, and
  what it failed on was real.
  · Also: Leave-it laps instead of wedging; focus lands somewhere real after
  every sort action (a11y driver asserts it); "not before" yields to a
  same-day deadline; create-in-place collision checked against ALL live
  containers; estimate/temporal rows hidden on Menu items; the law-5 smoke
  regex actually catches count-forms ("19 of 240", "5 left") with #sort-entry
  excluded as the one sanctioned total. 710 unit tests green.

- **2026-07-31 (evening)** — **The roadmap session: from return engine to real
  planner.** Noah: *"You do not have any direction from here… you have nothing
  that a real planner system needs for humans to use it."* An 8-agent
  plan-mode workflow (3 recon, 3 design lenses, 2 adversarial judges) produced
  the approved direction — 1.2.3 → 1.3.0 → 1.4.0 ("what a thing carries, and
  what the app did") → 1.5.0 ("wholesale") → 1.6.0 ("seeing and choosing") —
  recorded in the session plan file; the releases land here as they ship.
  · **1.2.3 "Say true things"** (Spine run 160 green): the OPR defect fixed at
  both ends — `person.linked{relation:'opr'}` now folds into `NodeState.opr`
  (every existing log heals on refold) and the sheet emits `opr.assigned`
  forward; the importer's false notes header corrected and the summary states
  the loss ("N notes were in the file — notes are not carried across yet");
  the coverage list is built only while open (it was rebuilding ~4,300 hidden
  DOM elements per repaint at 1,429 held). `do-now.timed` and
  `estimate.recorded` are recorded IN the fold as deliberately unfolded.
  · The smoke's purge-reload check was a RACE, not a fact — a fixed 900ms then
  a selector already true on the old page, so a slow run read 102 stale cards.
  It waits for the navigation as an event now. The instructive part: my
  1.2.3 changes made it flip by timing alone, and the first bisection blamed
  an innocent edit — three consecutive greens after the deterministic wait is
  the actual sample.
  · **1.3.0 "A triage that can reach everything"** ([ADR-0044](docs/adr/0044-sort-mode-and-named-ranges.md),
  [ADR-0045](docs/adr/0045-the-start-verb.md), [ADR-0046](docs/adr/0046-admit-accumulator.md)):
  sort mode over named ranges (the 1,222 loose imported rows were structurally
  untriageable — the `captured` latch is correct AND meant no interaction
  could reach them); the triage card is a button opening the sheet; the parent
  picker narrows as you type, names each option's lineage, and creates-and-
  files in one commit; "Not before" rides the start clock the importer had
  been writing with no surface able to show it; the estimate emitter closes
  the unmet logged-from-v1 commitment. The admit() rework underneath: ONE
  accumulator + dirty-set silent check, whole-batch belts retained, held to
  the old control flow by a 150-seed equivalence oracle
  (test/admit-reference.ts) — **500 events @10k nodes: ~6,250ms → ~55ms**,
  with a CI perf gate the old code reds by an order of magnitude. The oracle
  also found the old flow spraying ineffective cures at merge-silenced nodes;
  the rework skips them and the belt owns the case (the one deliberate
  divergence, tested three ways).
  · Two defects the new gates caught before ship: within-one-commit ULIDs are
  not monotonic, so "oldest first by id" was shuffle order inside an import
  batch (ordering now rides the genesis stamp); and the sheet's temporal rows
  never hid for Menu items, so a date set there would be gate-legal and then
  unrenderable — the rows hide now, with promotion as the door (law 6's
  drift, caught in the same class the plan's law-judge struck for park).

- **2026-07-29 (evening, second promote)** — **`main` fast-forwarded to `44478be` on
  Noah's "Promote"**, carrying 0.21.0 (today on paper) and **0.21.1 (the way out of the (i)
  panel)**. Spine run 88 watched green on that exact commit before the fast-forward.
  · **0.21.1 is a device fix Noah reported TWICE**, and the second report is the interesting
  one. The first got a `position: sticky` header, which is correct, which every engine in CI
  honours, and which does not hold on his iPad. **I reproduced the intended behaviour
  perfectly at three viewports** — that is precisely why the first fix was not a fix. When a
  mechanism verifies clean everywhere you can look and the report persists, the answer is to
  **remove the dependency, not to keep testing the mechanism**.
  · **Two bugs were introduced by the fix and caught before shipping**, both of which passed a
  casual look: `#about { display: flex }` outranks the UA's `dialog:not([open]) { display:
  none }`, so the panel closed and stayed on screen — a worse version of the bug being fixed;
  and `<input type="file">` fires a **bubbling** `cancel`, so the new Esc handler shut the
  panel the moment a file was chosen. The first was caught by asserting `checkVisibility()`
  rather than trusting `close()`; the second by the smoke walk.
  · **The underlying cause was length.** The panel rendered every release note at once and
  measured 17,000–25,000px. Fixing the header without that would have left it unusable to
  read. This is worth remembering as a shape: *the positioning complaint was a symptom, and
  the thing generating it was a surface nobody had measured.*
  · New gates are written against the **property** — "the way out is reachable from anywhere
  in the panel" — not against sticky, so they hold whatever CSS achieves it next.

- **2026-07-29 (evening)** — **`main` fast-forwarded to `be7a6a5` on Noah's "Promote"**,
  carrying 0.17.1 (the audit fixes), 0.18.0 (rest mode) and 0.19.0 (the Menu and save-for).
  **Spine run 81 was watched green on that exact commit before the fast-forward** (V-10).
  · **Promoted to `be7a6a5` and NOT to the branch head, deliberately.** 0.20.0 (the bother
  flow) landed after his instruction, so it is not what he asked for and it waits for his
  word like everything else (Doctrine §7). He is using the app today, and dropping an unasked
  capability on him mid-use is precisely what the staging gate exists to prevent.
  · Run 80 shows `cancelled` and that is not a failure: the 0.19.0 push was superseded by the
  Q-10 commit seconds later, and run 81 covers both.
  · **Q-10 closed** — recommending against building vaults; a lens, not a partition. His
  containment (0.13.0) already separates work from home if he wants it today.
  · **0.20.0 is on `staging`.** Sixth vocabulary-complete-but-unreachable capability found
  and closed. The count of those is now itself worth noticing: it has been the single most
  productive thing to look for in this codebase, ahead of any kind of code reading.

- **2026-07-29 (late afternoon)** — **0.17.1 (audit fixes) and 0.18.0 (rest mode) on
  `staging`, both watched green: Spine runs 76 and 78.** Rest mode was picked first on the
  reasoning that it is the one v1.5 item that protects the **dogfood gate itself** — thirty
  consecutive days, reset by any lapse, and a bad week is a certainty rather than a risk.
  The re-entry vocabulary had been complete and unreachable since the first draft, which is
  the fifth time this repo has shipped that shape ([ADR-0043](docs/adr/0043-re-entry-is-the-primary-path.md)).
  · **Operational note for future sessions: `curl` cannot reach `api.github.com` from this
  environment.** Three `Monitor` watches built on it ran their full loop and produced no
  output at all, which reads exactly like "still running" and is indistinguishable from a
  green result if you are not careful. **Only the `mcp__github__actions_*` tools work.** A
  poll that cannot fail is a poll that tells you nothing — the same lesson as the
  banned-vocabulary gate, in a different costume.
  · **`main` is unchanged at `574ae5f`.** Noah is using that build; 0.17.1 and 0.18.0 wait
  for his word (Doctrine §7). Flagged to him that 0.17.1 carries the report-injection fix and
  is worth having before he hands a status report to anybody.

- **2026-07-29 (afternoon, after the promote)** — **Adversarial audit of 0.13.0–0.17.0,
  the five releases shipped in one sitting. Four real defects found, all mine, all shipped.**
  Ran unprompted while Noah began using the app, on the reasoning that I would rather find
  the fifth thing than he would on day three.
  · **Review stayed silent about a stalled container** whose only remaining child was a
  SPENT resume card — the precise failure the surface exists to catch, hidden by another
  feature's residue. `held.ts` learned that a spent card is not work in 0.14.0 and
  `review.ts` was never told.
  · **A captured title could inject structure into a status report.** Titles are stored
  verbatim by design (the share target composes with newlines), so a multi-line one ended
  the list, opened a heading, and emitted a bare *"Nothing to report."* into a report about
  real work. I had written the CSV formula guard and not applied the same reasoning to
  Markdown. **This is a document handed to another person saying something untrue**, which
  is the most serious of the four.
  · **Work arriving by shard was invisible to every future report.** The delta cut on time,
  so another device's history — stamped before your last report, never seen, never reported —
  fell on the wrong side for ever. `status.report.exported` now carries a **per-device
  high-water mark**, the same structure a shard already uses; old marks fall back to the time
  cut, because data is never lost to updates.
  · **A let-go person was still named as running a tracked project.** `withWhom` checked
  liveness; `portfolio.ts` reached into `state.nodes` directly and did not. A confident wrong
  answer, on the surface whose only job is saying who has what.
  · **Three of the four are the same shape:** one concept, two places, one of them checking.
  Every fix collapses them into one function or one predicate rather than adding a second
  guard.
  · Also probed and **found clean:** resume cards never go silent (law 1); a card whose work
  is trashed disappears without orphaning; the sweep node is neither a stalled container nor
  silent; two devices starting a focus at the same instant converge regardless of arrival
  order; the parent picker never offers a non-container.
  · **Recorded, not fixed: no projection in this app scopes by vault.** The report is not
  uniquely affected — `heldNodes` and every other surface behave the same way — so making the
  report the one vault-aware surface would be worse than leaving it. Raised as Q-10.
  **Shipped as 0.17.1 ITERATION. 306 unit tests; six deliberate-failure proofs across the
  four fixes.**

- **2026-07-29 (afternoon)** — **`main` fast-forwarded to `c480796`, promoted on Noah's
  "Promote to main"** — carrying 0.12.0 through 0.17.0 and the docs work. Spine run 72 was
  opened and **watched green on the staging head before the promote** (V-10); runs 67, 68 and
  70 had gone **red on the banned-vocabulary gate** after I reported nine gates green locally,
  and run 71 confirmed the fix. **On `main` at `574ae5f`: Spine run 74 green and Deploy run 70
  green, both watched** — the deploy is what makes "it is live" a fact rather than an
  inference from a successful push, and V-10 says the observed run gets written down. **Every item on the frozen v1 Must list is now built.** That
  is a statement about the list and not about a version: `NOTES.md`'s own definition of v1 done
  is the **dogfood gate** — thirty consecutive working days — and day one has not happened.
  **Noah starts using the app today** and will give feedback as he finds things. V-14 remains
  the one claim no gate here can settle.

- **2026-07-30** — **The QR encoder, and the boundary I drew in the wrong place.**
  Noah: *"I still do not see anything about QR codes?"* He was right: it was recorded
  as a decision in ADR-0037 and not built, because I had gated ALL of it behind V-16 —
  whether an iPad can *read* a code. V-16 blocks reading. Showing was never blocked,
  and I could have built it at any point in between.
  · `src/qr.ts`, hand-written: GF(256), Reed-Solomon, byte mode, single-block versions
  1–4, alignment, format information in both copies, all eight masks with the specified
  penalty score, an SVG renderer with a quiet zone, and `pairingUrl` putting the key in
  the FRAGMENT so it never reaches a server.
  · **What CI proves, and from first principles:** the field axioms (not a pasted
  table); the RS codeword against its DEFINING property, that every syndrome is zero;
  the codeword count COUNTED from free modules rather than looked up, with the data
  stream asserted to fill the region exactly; every data position visited once.
  · **What CI cannot prove is [V-17]**: the data/EC split is the one table recited
  rather than derived, and a wrong entry yields a matrix that passes every test here
  and that no scanner reads — the round trip would agree with itself, which is the
  verify-your-own-fake shape this session has now been caught by five times. One
  photograph settles it. Until then no surface may call pairing working.
  · **Two real bugs the tests caught while writing it.** The zigzag skipped the timing
  column only when a pair STARTED on it, so four modules were written twice and column
  6 never. And the format-information strip overwrote the timing patterns where they
  cross and turned the dark module light — invisible to every count-based check,
  because reserving a module twice is idempotent and the codeword total never moved.
  · My penalty test was also meaningless at first: it compared an all-dark grid against
  an all-light one, which are equally penalised. Uniform is not a neutral baseline; the
  rules are now measured as deltas from a checkerboard.
  · Unwired, like `seal.ts`, `relay.ts` and `sync.ts`. The reason there is no QR on
  screen is that the screen it belongs to is Quietkeep Sync, a separate deployment
  that does not exist yet (Doctrine §1).

- **2026-07-30** — **A copy offered when a newer version lands (0.26.0 CAPABILITY).**
  Noah: *"Ask to backup when update detected?"*
  · **It refuses to imply danger, because there is none of the kind it would imply.**
  The log is append-only, `state = fold(log)`, migrations are additive — an update
  cannot rewrite what is written. "Back up or lose your data" would be a manufactured
  alarm, which is a red wall in a sentence. The real reason is narrower and is stated:
  a release that behaves badly AFTER it lands, and a copy is a point to come back to.
  Tests assert the absence of the alarmist words AND the presence of the reassurance,
  so neither half can drift.
  · **`waiting` alone would have detected nothing on this app.** `sw.js` calls
  `skipWaiting()`, so a new worker activates without asking and `waiting` is empty by
  the time anything looks. `updateIsReady` therefore also treats "the active worker is
  not the one controlling this page" as an update — and excludes a first-ever load,
  where there is no controller and offering a copy of an empty store would be nonsense.
  · A line, never a modal: it does not overlap the capture box (asserted), closes from
  the first frame, and appears once — declining is an answer, not a question to ask
  again.
  · `deliverCopy` moved to `src/ui/export-copy.ts`. The closure it replaced carried a
  note saying a second copy of the deliver-then-record ordering "would be a second
  chance to get it wrong"; the update prompt needing the same thing is exactly the
  moment that note was written for.

- **2026-07-30** — **A gate cure is not a demand (0.25.1 ITERATION).** Noah's second
  export, re-imported on 0.25.0 minutes after the promote: 2,897 events, 1,429 nodes,
  **zero `due` clocks** — every one of the 1,173 stale dates correctly dropped. Folded
  in his real zone (UTC-7, not Denver — inferred from the cure instants rather than
  assumed) the surfaces read **"Ready now: 1,055"** and the badge would have said
  **1,012**. Arithmetically correct and a complete falsehood about his day: he had
  not dated a single one.
  · **Third instance of one root cause.** `CALENDAR_KINDS`, then the passed-date
  import, now readiness: the app must not present its own bookkeeping as somebody's
  commitment. Fixed at the root this time — `Clock` now carries `source`, so every
  surface asks one question instead of guessing three ways.
  · **The predicate was wrong twice and the tests caught both.** "Any `gate:` source"
  is the tempting reading and it broke a deliberately promoted Menu item and an
  interrupted focus's resume card. **A cure inherits the intent of the event it
  cured** — `clarify.routed`, `replan.resolved`, `menu.item.promoted`,
  `capture.recorded` are all things somebody DID, and the cure is how that choice
  becomes "now". Only bare `node.created` says nothing about when.
  · Resume cards now set their OWN clock (`focus:resume`) instead of leaning on a
  cure. Every other deliberate act already declared its own; being the exception was
  what made it fragile.
  · **A deliberate-failure proof found the whole change untested**: removing `source`
  from the fold left all 530 passing. Now covered, including the SNAPSHOT round trip —
  without it an undated import would read "Later" on first load and "Ready now" after
  a reload, a surface changing its mind about your day based on how recently you
  opened it.
  · And "nothing is asking" no longer means the section vanishes: it states how many
  things are here undated, waiting on a decision. `undatedCount` is that number.

- **2026-07-30** — **Noah's real OmniFocus import, and what 1,429 rows exposed
  (0.24.1 ITERATION, 0.25.0 CAPABILITY).**
  · **The alignment complaint was a mis-tap.** The border was on `.card-open`, not on
  `.card`, so the action buttons were siblings outside the visible box — and because
  the title is `flex: 1 1 auto` the wrap point moved with each title's length. On a
  long row "Done" wrapped alone, left-aligned, directly above the NEXT item. The box
  now belongs to `.card`, and the actions travel in one wrapper.
  · The a11y gate caught the first attempt (`flex: 0 0 auto` on the group pushed the
  page 192px sideways at 320px/200%), and the FIRST version of the new containment
  gate was a tautology — a flex container always encloses its children wherever the
  border is drawn, so it passed with the bug reintroduced. It now asserts that some
  element DRAWING A BORDER encloses every control, which is about the rendered result.
  · **My first diagnosis of the "needs a new plan" wall was wrong, and the data said
  so.** `raisesReplanCard` already ignores cure clocks — `HARD = ['due','suspense']`
  and cures are `review`. The 1,173 cards came from genuinely passed `due` dates Noah
  set in OmniFocus, earliest **2019-06-11**. Seven years of backlog, all of it past.
  · **So the importer no longer imports a date that has already gone.** A date that
  passed years ago in another planner is a record of a commitment somebody did not
  keep, not one they are carrying — manufacturing a fresh obligation from it is the
  same mistake as putting the app's own clocks in a calendar. The row arrives without
  a date, the gate cures it like anything dateless, and the summary says how many and
  why before anything is written.
  · **And no heading renders more than `LIST_CAP` = 25.** The dedicated replan
  surface has capped at three since it existed; the held list had no cap at all,
  which nobody noticed while the fixtures held eight things. The number held back is
  stated, and the smoke check asserts that revealing produces EXACTLY that many more
  rows — a cap that misreports what it hides is worse than no cap.
  · Proofs: border back on the title button reds the containment gate; removing the
  cap reds three checks; a more-row overstating by five reds the reveal check;
  importing a 2019 date reds the residue tests.

- **2026-07-30** — **Promoted to production: 0.21.1 through 0.24.0 in one step.**
  Noah's word, onto watched-green Spine run 103 (`d60271a`, all 14 steps), confirmed
  by Deploy run 100 on `main` reaching success at the Cloudflare step — never by
  reading production (V-15). Production had been on 0.21.1 while eight releases
  accumulated on `staging`, which is also how he came to be looking for a feature
  his device did not have: the version now renders on the main screen, so that
  question answers itself from a screenshot.
  · What went out: sample work, both clearing modes, the calendar carrying only days
  the reader chose, the on-screen build number, the optional badge with the gauge
  stating the same figure, and the OmniFocus/TaskPaper/CSV import.
  · Sync stages 1–3b went with it and remain unreachable from any surface by design.

- **2026-07-30** — **The badge is optional, and work comes in from other planners
  (0.24.0 CAPABILITY).** Noah: *"Make the badge optional as well"* and *"Possible to
  import an Omnifocus export and really test at scale?"*
  · **The badge switch lives in `kv`, not in the log.** A badge is a property of an
  installation — the same person may want it on the iPad and off on the phone — so an
  event would make one device's preference follow them onto the other, and would add
  a vocabulary noun for something that is not a fact about their life. Turning it off
  clears the icon in the SAME breath; a preference that waits for the next render
  reads as a switch that does not work.
  · The flag is module state read synchronously, because `render` is synchronous and
  a storage read on the path between a keystroke and a card appearing is the one
  thing this app must never make slower.
  · **`src/taskpaper.ts` reads TaskPaper AND OmniFocus CSV**, sniffed from the
  content rather than the filename — a file renamed between two apps is the normal
  case. Not `.ofocus-archive`: zipped XML of somebody's private sync format is a
  maintenance promise this project should not make, and a text format fails one line
  at a time instead of all at once.
  · **Hierarchy is the point.** Projects keep their children (indentation in
  TaskPaper, a named "Project" column in CSV), and a CSV project named by a child but
  never listed is CREATED rather than dropped — the alternative loses structure
  without losing rows, which nobody notices.
  · Imported dates become `due` and `start` — days somebody chose, so they survive
  `CALENDAR_KINDS` and give the calendar export something real to carry for the first
  time. `@flagged`, contexts, estimates and repeats are dropped and NAMED: this app
  has no priority field on purpose, and a silent discard is a different lie from an
  invented clock.
  · 2,000 rows parse, map and admit with nothing silent and every action parented —
  the scale test checks the parent map still resolves at the end, not just early.
  · Six proofs: no-immediate-clear and preference-ignored both red the badge tests;
  tabs-only indentation, project detection after tag stripping, silent tag discard and
  positional CSV columns each red their own.

- **2026-07-30** — **Two things Noah found on the device (0.23.2 ITERATION).**
  · **The calendar was exporting the app's own clocks as appointments.** Routing to
  Next action sets `clockKind: 'review'` at end of tomorrow — the app's resurfacing
  marker, not a date anybody typed — and `soonestClock` returns any kind, so nine
  items routed in one afternoon became nine all-day events on one day, each with a
  nine o'clock alarm. Noah: *"it's literally everything in the list that has just
  been given a date of today supposedly, I assume, because they couldn't be blank?"*
  He was right, and the diagnosis was right.
  · **`CALENDAR_KINDS` = `due`, `start`, `suspense`, `park`.** The axis is *did the
  reader choose this day*, not *is it a deadline*: `due` comes only from
  `detail:due` or `replan:compress`, while `review` is what routing, repeats,
  bother handling, the comms sweep, replan's escalate/renegotiate and every gate
  cure set. `park` stays IN — an earlier audit settled that, because the held list
  already shows "parked until…" and dropping it made the app contradict its own
  screen. My first patch reversed that finding; the park test caught it.
  · **A planner that misreports your obligations to a calendar you trust is worse
  than one with no calendar export at all.** The app can be wrong on its own screen
  and be corrected by the next glance; it cannot follow the mistake back out of a
  diary.
  · **The ics fixtures were encoding the defect.** `clockAt` defaulted to
  `kind = 'review'`, so every test in that file asserted that the app's own markers
  belong in a calendar. Default is now `due`, and the regression is driven through
  `routeEvents` itself rather than a hand-written clock — the bug lived in the gap
  between what routing writes and what the export reads, and a fixture-shaped
  approximation of routing would have agreed with either side.
  · **The icon badge asserted a number no surface stated.** It counts `ready`
  correctly, but group headings deliberately carry no counts, so a red 1 on the
  home screen was unfindable inside the app — an unexplained demand, which is the
  one thing this app must never be. The gauge now says "N ready now" from the SAME
  variable that feeds the badge, and the panel explains what the number is.
  · My first smoke check for that was vacuous: it only asserted when the icon had
  been given a number, and at that point in the walk it had been given `clear`.
  A guard on a state the fixture never reaches is not a check.

- **2026-07-30** — **Clearing things out (0.23.0 CAPABILITY).** Noah, answering the
  open question: *"I feel like both should be available so the user has control of
  their data"* and *"there should be a verification that prevents it from being
  easily done, however, and it should recommend a back up being done before it
  happens with a button available at that point."*
  · **Two modes, because they are different promises.** *Clear what I'm holding*
  appends one `node.trashed` per held thing — the surfaces empty and the log still
  contains everything, so law 9 stays unqualified and an export taken afterwards is
  complete. *Start again from empty* calls `replaceAll([])`: the only operation in
  this app that destroys data on purpose. Offering only the first would be dishonest
  about what people want; offering only the second would make "clear the list" cost
  the history.
  · **The guard is a typed word, not a held button.** Hold-to-confirm is a dexterity
  test and tremor is a supported condition — a guard a shaking hand cannot pass locks
  somebody out of their own data. Case and stray spaces are forgiven; the check is on
  intent.
  · **The two words differ, and that is load-bearing.** With one shared word, typing
  it for the reversible mode and then switching would carry the authorisation across
  to the irreversible one. The UI half of the same protection: switching mode clears
  the field, asserted in smoke.
  · The backup is recommended with the button beside it, and the sentence above the
  go-ahead states whether a copy has been saved — a recommendation nobody acted on
  has to still be visible at the moment of the decision. It does not block; an adult
  who has read an accurate sentence may proceed.
  · Found while building it: `pick()` revealed the confirmation block before awaiting
  the store read, so the consequence line was briefly visible and EMPTY — a paragraph
  of nothing above the button, in the one place where the sentence is the entire
  safeguard.
  · The a11y gate now opens the confirmation in both audited dialog states rather
  than having the registry name a hidden element. A control that only exists after a
  click is still a control somebody reads, and exempting it would have exempted the
  typed-word box.
  · **Still roadmapped, not built: selecting ranges** (clear or export a chosen
  subset rather than everything), a dry run for bulk acts, and a way to view the log.

- **2026-07-30** — **Sample work (0.22.0 CAPABILITY).** Noah: *"I eventually want a
  set of test data i can import."* A generator, never a file: a fixture with a
  literal date in it is wrong tomorrow and absurd next year, and every surface here
  is temporal, so a stale fixture exercises the wrong code paths rather than merely
  looking odd. Generated a year apart it describes the same relative situation, and
  that is asserted.
  · It goes in through `session.commit` — the app's own admit-and-append path — so
  the demonstration cannot show a state the app would refuse, and a bug in the
  generator surfaces as a plain refusal instead of as a corrupt store.
  · It contains the AWKWARD states on purpose: a passed date, something with
  another person in it, two unpressured things on the Menu, two unsorted notes, and
  real containment. The smoke checks read the store for each of those, not the copy
  on screen — a proof showed a button reporting "13 sample things" while committing
  nothing left the message assertion passing and reded only the three that read the
  database.
  · `capture.recorded` gains a `sample` source rather than borrowing `quick`, since
  a capture claiming a keystroke it never had is a lie in the one place the app
  keeps its history. Additive; every existing log stays readable.
  · **Two invariants I had wrong, both caught by tests.** The set was leaning on the
  gate's cures because the test helper folded the generator's output directly and
  never went through `admit`; and "a container held up only by its clocked children"
  is not a state this app has — containment satisfies the CHILD, so such a parent is
  still silent and is cured at creation like any other node. A law you can quote is
  not a law you have read.
  · Alongside it: an export's filename carried the UTC instant while the file's own
  contents stated the local day, so an evening calendar export was named tomorrow
  and said today. Found only because the session crossed midnight UTC and two smoke
  checks — themselves comparing a local day against `toISOString()` in a browser
  pinned to America/Denver — disagreed. Both checks had been wrong since they were
  written and passed for eighteen hours a day.
  · **The deploy's `cancel-in-progress` is now false on `main`.** Latest-wins is
  right for a preview and wrong for production: a superseded deploy leaves the
  previous release being served while the run's conclusion reads `cancelled` rather
  than `failure`, so nothing anywhere is red. A sibling app hit exactly this on a
  promote and it was harmless only by luck.

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
  · **Stages 1 to 3b are now built and on `staging`** (2026-07-30). No triplet
  bump and nothing reachable from a surface: `src/exchange.ts` (what a device
  holds, as coalesced ranges — because a per-device maximum is not a completeness
  claim and believing it is silent permanent loss), `src/seal.ts` (AES-256-GCM,
  fresh IV per seal, one refusal message for every cause, the summary sealed too
  because an unsealed one is a per-device write-rate graph), `src/relay.ts` plus
  `relay/worker.ts` (a mailbox per sync id, append-only, expiring, refusing
  anything not shaped like a seal), and `src/sync.ts` (the driver, ordered so a
  death mid-exchange leaves the device with strictly more than it had). 63 tests
  across the four, and every claim in their headers has a deliberate-failure proof
  behind it — three of those proofs found tests with no detection power at all,
  including the one asserting the relay cannot read anything, which passed with
  the plaintext on the wire.
  · **Gap repair needs no summary exchange.** `nextSeq` returns 0 for a device
  with no events, so seq starts at zero and a hole below a device's first range is
  PROVABLE from the local log alone. Nothing above the last range is ever
  requested — nothing proves it exists, and asking would post an unsatisfiable
  request on every open until it filled the mailbox.
  · **Stage 4 is built and proven, and blocked on a Cloudflare permission.**
  Pairing is by FILE — Noah, 2026-07-30: *"File first."* One device writes a small
  JSON file carrying the key, the host and the pairing name; the other opens it.
  No camera, no decoder, nothing from V-16 or V-17. The QR is a nicer way to move
  the same 44 characters and can arrive later without changing pairing at all,
  because what pairing DOES is independent of how the key travels. Building the
  pretty rung before the working one was the mistake.
  · **`test/sync-end-to-end.test.ts` is the claim that sync works.** Two real
  sessions over separate stores, the real gate on every keystroke, real seal, real
  `exchangeOnce`, real `httpWire`, and the real relay `handle()` with its routing
  and status codes — only the socket is stood in for. Capture on A, exchange,
  exchange on B, and it is on B. Written because two defects got past 567 passing
  tests: every one of those checked a layer against a fake, and neither defect
  lived inside a layer. They lived in what the layers assumed about each other.
  · Those two defects, both fixed with tests that red on the old code: identity on
  the wire was `device#seq`, but `cureFor` stamps a cure with its cause's device
  AND seq, so the key identified a PAIR and dropped half of every capture; and
  arrivals were re-run through `admit`, which double-mints cures the store then
  refuses. Arrivals are a shard union now (`takeInEvents`), sharing the import
  button's road. Recorded on the hub as LESSONS §7e.
  · **What is left is not code.** The relay cannot be deployed: the Cloudflare
  credential publishes Pages but has no Workers permissions, so there is nowhere
  to create the KV namespace (V-18). Two permissions on the token — Workers KV
  Storage:Edit and Workers Scripts:Edit — and the relay workflow deploys, prints
  its URL, that URL goes in `src/relay-host.ts`, and the Sync edition builds and
  ships. `tools/editions.mjs` builds NO sync edition while that host is unset, so
  nothing can go out dialling a host that does not exist.
  · The sync design itself is recorded and stages 1-3b built. ADR-0037 names the
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
