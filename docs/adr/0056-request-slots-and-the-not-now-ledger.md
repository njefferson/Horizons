# ADR-0056 · Request slots and the Not Now ledger

**Status:** Accepted · **Date:** 2026-08-01

## Decision

The recorded v1.5 pair, built now that its precondition (the park verbs,
ADR-0045) exists. Declining someone's request becomes a first-class decision:
**one noun, two homes, one fold, one ledger.**

- **`request.declined` gets its emitters.** The detail sheet's "Someone asked
  for this?" group carries "Not mine to carry"; the bother flow's third branch
  emits the same pair. Both go through ONE write shape (`declinePair`):
  the record, then a deliberate `park.set{reason:'not-now-ledger'}` in the
  same batch — to the request slot's next day when one is set, else the end
  of today. The gate's cure stays as backstop for a bare event from an import
  or an older shard, never as the path the app takes.
- **The bother flow is aligned to the vocabulary.** event-vocabulary.md said
  from the start that `not-mine-to-carry` "lands on the Not Now ledger with a
  `park.set`" — the first build trashed it instead, with copy promising "it
  does not come back". The trash is gone; the copy now says the decision is
  kept and nothing will chase you. **The relief holds because a park never
  demands**: a passed park raises nothing and appears only where you go
  looking.
- **The fold**: `n.notNow {person, what, at}` under its own LWW key — set by
  the decline, cleared by `clock.cleared{park}` and by `done.marked` (a
  completed thing is not a declined thing; the log keeps the decline either
  way). `person` is null when nobody said who (the `waitingOn` precedent);
  `what` is the title snapshot, so the record survives a rename.
  - **Corrected 1.17.4 — the mechanism moved, the rule did not.** The
    `done.marked` clear had a hole this clause did not see: `done.unmarked`
    restores only `lastDone`, so done-then-undone dropped a standing decline
    from STATE permanently while the log still held it — the seam audit's
    lifecycle lens found it. The fold now keeps the record, and the visible
    rule ("a completed thing is not a declined thing") lives in one exported
    predicate, `standingDecline` (`requests.ts`): a completion whose stamp is
    newer than the decline's settles it on every surface — the ledger, the
    sheet, the calendar exclusion, the merge carry — and undoing the
    completion brings the record back. `clock.cleared{park}` still clears in
    the fold: taking the thing back IS un-declining, and there is nothing for
    an undo to restore.
- **The ledger lives behind ⓘ in Your data, beside "Things you let go"** —
  the same species (ADR-0050): a capped, true-counted record of deliberate
  decisions, rows are doors carrying exactly one verb, built on reveal, the
  toggle's label stating the next press. A row is a title, a name, and a
  date — **never a count**.
- **The request slot: ONE slot, weekday granularity, not a module.**
  `weekly:mon`…`weekly:sun`, `''` clears; unrecognised strings are refused,
  never guessed. A null slot makes the feature invisible everywhere — setting
  a day IS the opt-in, so `module.enabled` ceremony (which earns itself for
  surface families like Composed Today) is not spent on one LWW setting. Set
  under Extras. It does exactly two things: the sheet offers "Park it until
  the request slot — back ⟨day⟩" (the control names the real day), and
  declines park to the slot instead of tonight. **Nothing happens at
  capture** — the slot is stimulus control applied by a person on a sheet,
  never triage applied by the app at arrival.
- **Un-declining needs no new noun.** "Carry it after all" clears the park;
  the gate cures the clear with the same-day clock a fresh capture gets, so
  the carried thing re-enters covered and lands back today. Accepted edge,
  stated here: ANY park-clearing path also un-declines — clearing the park is
  taking the thing back, whatever surface did it.

## The two ledgers, and the line between them

This ledger records **decisions about other people's requests**. It exists
because declining is a decision worth keeping — the thing to point at when
the same request comes back (Borkovec: the scheduling does the work).

A record of the times you did not do **your own** work remains the ledger
this app exists to NOT keep (ADR-0042): the do-now offer's "Not now" and
Next-up's "Not this" stay event-free, forever. Any drift across this line is
a defect, not a feature request.

## Known edges, stated rather than discovered

- A declined **bother** keeps kind `bother`, which is not `sortable` — its
  passed park does not surface in "Parked, and now back". The ledger is its
  comeback surface, and law 1 held it at write time via the park. The kind
  stays: a declined worry is not work.
- A parked decline sits quietly in the held list's Later group like any
  parked thing — held, visible where everything held is visible, and never
  asking.

## What must not be built

- No detection of "this is a request" — nothing at capture, no heuristics.
- No per-person decline counts anywhere (law 5): "declined three times" is a
  score about a person and about you, and neither is this app's to keep. The
  smoke walk asserts the ledger's rendered words carry no tally.
- No nag when the slot day arrives — no notification, no banner, no badge.
- No free-text "reason" prompt at the moment of declining — declining must be
  cheap; the note field exists for anyone who wants words.

## What would overturn it

- **The ledger's placement and cap, by the owner's word** — ADR-0050's own clause,
  inherited.
- **The one-slot limit, by evidence** — if real use shows two genuinely
  different request rhythms (say, home and work), the `weekly:` prefix format
  extends without migration. Full RRULE stays unjustified until something
  reads more than "the end of the next such day".
- **The no-per-person-counts rule is law 5 itself** and would need the law.
