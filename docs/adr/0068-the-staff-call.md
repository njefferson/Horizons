# ADR-0068 · The staff call — named periods

**Status:** Accepted · **Date:** 2026-08-03 ·
**Executes the deferral in** [ADR-0057](0057-stakeholders-and-the-decision-log.md)

## Context

`NOTES.md`'s Should—v1.5 line had one live entry left: **staff-call lens**,
annotated *"the per-person half shipped 1.12.0; the DELTA half is what
'staff-call' actually means and it waits on anchors."*

ADR-0057 deferred anchors and, unusually, wrote down exactly what shipping them
would cost. Two of its three reasons turn out to be already answered in the code:

- **"An anchor node would be a silent node."** True, and the price was stated in
  the same paragraph: `DEMAND_FREE_KINDS`' own comment says nothing joins it *"on
  the argument that it isn't really work — only on the argument that a surface
  renders it, and that the surface ships"*. That is a gate change plus a shipped
  surface, in one release. It is exactly what `person` paid in 0.15.0 and
  `journal` paid in 1.13.0.
- **"`anchor.fired` carries no per-device watermark."** Also true, and the
  mechanism to fix it was already built, shipped and proven: `reportedBefore`
  (`src/delta.ts`) takes a mark shaped `{ at, upToSeqByDevice }` and prefers the
  watermark; `status.report.exported` already carries one; `fold.ts` already
  folds it into `State.lastReportMark`. The blocker was that this kind did not
  carry the field — not that the field had to be invented.
- **"The provenance already exists and the act coincides."** Still true and
  unchanged. This ships because it closes v1.5 and because a report that says
  *since the last staff call* is a sentence somebody understands without
  arithmetic — not because that third argument turned out to be wrong.

And 1.16.0 made the deferral machine-visible: `tools/sample-coverage.mjs` carried
`anchor` as its single node-kind exemption, quoting ADR-0057. **Removing that
exemption is this release.**

## Decision

**An anchor is a named period, it is demand-free, and firing it cuts a delta
using the mechanism that already exists.**

### Demand-free, with the surface in the same release

`anchor` joins `DEMAND_FREE_KINDS`. An anchor is a name for a stretch of time —
nothing is ever *done* to one — so law 1 clause (a) is the right clause, and the
gate now refuses a clock on one outright. The surface ships here, inside the
report section: name a period, mark that it came round, pick it as the period a
report covers.

**It lives inside the report section deliberately.** An anchor answers "since
when" for a report and has no other job; a section of its own would make it look
like a thing to maintain.

### The watermark is the whole of blocker 2

`anchor.fired` gains `upToSeqByDevice` — the **same field**
`status.report.exported` carries, read by the **same** `reportedBefore`. One
mechanism, two writers. Optional on the payload, because a firing written before
this is still a firing and an old log must keep working (law 9); the fallback is
the `at`-only cut, which is the degraded mode and is named as such in the type,
in `Firing.mark`, and in a test.

The test that matters stages the audit's own case on the anchor path: a second
device delivers work stamped *before* the meeting that this device had never
seen. The watermark reports it; the time-only cut buries it. Both directions are
asserted, so the degraded mode is demonstrated rather than described.

### It reads the log, not state

`src/anchors.ts` reads firings out of the log — the `copies.ts` precedent
(1.14.0) and `journalSeal`'s (1.13.0). A firing is a thing that happened at a
moment, carrying the watermark current then; folding that into `NodeState` would
mean two new fields, a `MERGE_DISPOSITION` ruling, a genesis default, a
copy-on-write clone and a deserialise backfill, to store what the log already
says.

### Nothing derives from the recurrence

`anchor.defined` carries a recurrence and it is rendered for a person to read.
**Nothing computes from it.** No scheduler, no next occurrence, no "you have not
marked this in three weeks". An anchor that fires itself is a nag with a
calendar, and a tally of the meetings you did or did not hold is the shape law 5
exists to forbid. This is ADR-0065's `affects` rule restated: a plain fact for a
reader.

## Consequences

- **v1.5 closes.** The Should list is empty after this.
- **Two corrections ride along, both found by reading rather than by the plan:**
  - **A person node has been a row in the todo list since the beginning.** Every
    person you had ever named sat among your work — "Alex", with nothing to do
    about it. It predates `heldWork` (1.15.1), which is why nothing caught it:
    1.13.0 and 1.15.0 each added a kind to a hand-written list inside
    `heldGroups` and neither revisited what was already there. A person has had
    its own surface since 1.12.0 (ADR-0040), which is ADR-0061's argument for the
    journal exactly. `person` and `anchor` both join `heldWork`'s skip list —
    **one edit, four surfaces**, which is what 1.15.1 was for.
  - **`status.report.exported` did not declare `upToSeqByDevice`**, a field the
    UI has written and the fold has read for four releases, and on which the
    delta cut's correctness depends. Nothing misbehaved; the type lied by
    omission, in the one path an audit had already rescued from time-only cuts.
- **A test was rewritten for the third time, and the reason has been the same
  each time.** "A held item with no clock at all is Later, not lost" needs
  something held, clockless and legal, and it twice reached for a demand-free
  kind — a pebble until 1.15.0 gave pebbles a surface, a person until this
  release. It now uses a child under a clocked parent: the one clockless *work*
  item the app can produce, which is the honest subject for what it asserts.
- **The coverage gate's node exemptions are now empty**, and nobody had to
  remember to delete the entry — a kind the set produces fails its own exemption.
  That is the 1.16.0 mechanism working as designed, one release later.
- The a11y target gate caught the two new inputs at 21px against the 44px floor
  before they reached a device.

## What would overturn this

- **Anchors turning into things to maintain.** If naming a period ever produces
  a nudge, a schedule, a count or a colour, the design has failed regardless of
  whether the delta cut works.
- **The delta cut being wrong across devices.** The watermark is the claim; if a
  real two-device run drops history the anchor path is no better than the
  at-only cut it replaced, and the fix is the cut, not the surface.
- **Not by "an anchor should carry a clock."** It cannot, by law 6, and the whole
  argument for making it demand-free is that nothing is ever done to it.
