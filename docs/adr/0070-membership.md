# ADR-0070 · Membership — which kinds belong where, written down

**Status:** Accepted · **Date:** 2026-08-03

## Context

After using the app, the verdict was that everything found had pointed to an
unfinished product. That is right, and the defect record says precisely where the
unfinishedness lives. Three of the last four shipped defects were **one defect
in different clothes**:

- 1.15.1 — journal entries itemised in the coverage list as "(untitled) — held".
- 1.17.0 — every person ever named sitting as a row in the todo list, since the
  day people existed.
- 1.17.2 (this release) — the detail sheet offering date, start and repeat
  controls on every demand-free kind, which the gate refused after the tap. The
  comment beside the code even stated the correct rule — *"the gate's law-6
  check guards demand-free KINDS, not Menu membership"* — and the code tested
  only Menu membership. Reachable: search returns people and anchors and a
  result row opens the sheet; the todo list holds an off-Menu aspiration.

**The class is: which kinds may appear on, or be offered verbs by, which
surface — and nothing asked that question anywhere.** Features are tested in
isolation (915 unit tests); the seams between them were checked by nobody. Each
instance was found by reading, not by an instrument, which means the finds were
luck and the misses are still out there.

This is also the third time this repo has closed a class rather than an
instance: `MERGE_DISPOSITION` (1.9.2) for "a fold silently drops a field",
`emitters:check` (1.14.2) for "a noun nothing writes", `sample:check` (1.16.0)
for "a kind no fixture contains". Same shape: a totality gate that forces a
written sentence.

## Decision

**One declared table, kind × surface, a written reason per surface, checked
both ways over the set-of-everything.**

`test/membership.test.ts` declares, for each of sixteen list surfaces, the set
of kinds allowed on it and the sentence that justifies the set. It computes each
surface's actual rows from the 1.16.0 big sample — the one store containing
every kind — and asserts:

- **actual ⊆ allowed** — a kind appearing anywhere new fails until somebody
  allows it with a sentence or excludes it in code;
- **expected kinds present** — each surface names kinds that MUST be there, so
  no row of the table can go vacuous (the LESSONS 7g rule: an equality over an
  empty set is decorative);
- **every `NodeKind` is ruled on by at least one surface** — a new kind cannot
  enter `NODE_KINDS` without somewhere claiming it, which is how the journal
  and person defects were born;
- **offered-then-refused is closed at both ends for dates** — for every
  demand-free kind: the gate refuses a `clock.set` AND the sheet's visibility
  predicate hides the controls; and the inverse, so the sheet can never hide a
  legal verb either.

The sheet's predicate is DOM-bound, so the unit test restates it and the smoke
walk proves the DOM: search → open an anchor's sheet → the date/start/repeat
groups are hidden; same via a person. Reverting the fix reds exactly those four
smoke assertions (run, watched red, restored).

### The fixes shipped under it

- `src/ui/detail.ts` — `temporal` is now
  `!n.onMenu && !DEMAND_FREE_KINDS.includes(n.kind)`. Both clauses matter and
  the comment now explains both: Menu membership is not a kind (a
  someday-routed action keeps kind `action`, and a date on it would be accepted
  and then unrenderable), and kind is not Menu membership.
- `src/composed.ts` — `choosable` excludes `journal` and `anchor`; both predate
  nothing ("Put it in today" was offered on a named period one search away).
  `resume-card` deliberately stays choosable: picking a thread back up today is
  a real choice about a real thing.

### Rulings the table records, so they stop being implicit

- **The todo list holds off-Menu aspirations.** A wish taken off the Menu is
  still yours and must be somewhere; its row is how you find it to promote it.
- **Search is wider than work** — people and anchors are findable because each
  opens a sheet that can say something true about it; pebbles are not, because
  their sheet was all refusable verbs (1.15.1).
- **The trash is deliberately total.** An explicit decision about any kind is
  kept, including a settled pebble.
- **A bother may appear in the next-up queue and the ledger** — the flow's own
  design brings a tracked worry back. Whether it belongs in the calendar is
  with the seam audit now running; the table will be tightened to that verdict
  rather than blessing the status quo silently.

## Consequences

- The next kind-on-a-wrong-surface defect fails a named test before it ships,
  with a message that says which surface and what to do.
- Adding a node kind now costs a sentence per surface it touches. That is the
  point — the three shipped instances each cost a release.
- The table is honest about being a snapshot of rulings, not a proof of taste:
  it pins what was decided and forces the next decision to be written down. It
  cannot say whether a ruling is *good* — that is the owner's on-device judgement,
  which no instrument here replaces.

## What would overturn this

- **The table rotting into ceremony** — allowed-sets widened without sentences
  to make red go green. The reasons are the gate; if they stop being written,
  the table is theatre and should be said so.
- **A surface the table cannot see** — it covers list projections; a surface
  that renders from somewhere else (the DOM directly, an export format) needs
  its own row or its own instrument, and pretending the table covers it would
  be the LESSONS 7g failure again.
- **Not by "the table is long."** It is sixteen rows because the app has
  sixteen list surfaces. The length is the inventory, not the cost.
