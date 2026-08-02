# ADR-0059 · The timer shows presence, not progress

**Status:** Accepted · **Date:** 2026-08-02

## Context

The do-now timer rendered `Two minutes: 1:47 left`, asked *"Two minutes are up.
Did you finish it?"* when the clock reached zero, and wrote
`do-now.timed { outcome: 'completed' | 'abandoned' }` on every stop.

The thesis (§4) had said all along that the timer *"is a bounded commitment, not
a rule about what deserves doing — its value is that 'two minutes' is a **cheap
decision**."* A cheap decision is an **activation** aid: *I will just get started
by doing two minutes right now.* What shipped was a **constraint**: a deadline
shrinking toward a moment where you had either finished or not. The recorded
intent and the built thing had drifted apart.

Two supporting facts made this a defect rather than a preference:

- **A countdown adds aversion at the moment of approach.** Sirois & Pychyl
  (established, §2): procrastination is mood repair, so anything that raises
  aversion raises delay. This is the same argument that forbids "overdue" — a
  shrinking deadline on an already-aversive task is a machine for producing the
  behaviour it measures.
- **The timer contradicted a rule this repo states in absolute terms.**
  `src/requests.ts`: *"a record of the times you did not do your own work is the
  ledger this app exists to NOT keep — the do-now offer's 'Not now' writes
  nothing, **ever**."* ADR-0056: that offer's "Not now" and Next-up's "Not this"
  stay *"event-free, forever."* The button that declined wrote nothing; the
  timer beside it wrote a verdict on every stop. Same flow, same person,
  opposite policies. Nobody ever saw the word — the log viewer says only that a
  timer ran — but it was recorded permanently and carried into every export.

## Decision

### Presence, not progress

The timer shows **that it is running** and nothing about how far through it you
are. A pulsing mark, a sentence naming what you chose, Done, and Stop.

The rejected alternatives matter more than the chosen one, because two of them
look like the fix:

- **A countdown** is a deadline. Rejected above.
- **A shape that fills toward the chosen end** — the obvious repair, and it
  fails for a different reason. Anything rendered part-way through a chosen span
  is a **fraction**: *you were this far along and you stopped.* A fraction is a
  score (law 5), and `menu.ts` already refuses the identical shape for save-for
  gauges — *"a progress bar is a machine for implying you are behind."*
  Continuous rather than discrete makes it less legible, not less true.
- **A row of glyphs filling left to right** is the same fraction with a visible
  denominator, which is worse.
- **A plant or tree that grows** is worse still. A growing thing can be stunted,
  and the stake is the whole effect. *"Do not let it die"* is *"do not break the
  chain"* in warmer clothes, and the thesis is blunt that a streak's *"real
  design purpose is the moment it breaks."*

**The commitment lives in a sentence** — "Twenty minutes, running" — because a
sentence can hold something you are allowed to walk away from. A shape cannot:
it either completes or it visibly does not.

### The length is chosen, in Extras, not at the point of starting

`timer.length.set { minutes }` folds to `State.timerMinutes` (state-level LWW,
the `requestSlot` shape), so the choice travels with the log rather than sitting
on one device. A closed offer of 2 / 5 / 10 / 20 / 30; anything else reads as
the default — refused at read time, never guessed.

It is set in Extras and **not** at the moment of starting, which is deliberate:
showing options to someone stuck at activation is choice overload where it costs
most (§4). The start button names the chosen length, so the common path is one
tap and no decision. **Two minutes stays the default**, because the whole value
of the original is that it is a cheap decision, and the default must remain the
one nobody has to think about.

### Stopping records nothing about stopping

`do-now.timed` keeps `startedAt` and `endedAt` and drops `outcome` — the
`focus.started` / `focus.ended` shape, which records what you did without
judging it. The **chosen length is deliberately absent from the payload**, so a
shortfall cannot be reconstructed by subtraction. That is the arithmetic that
got the status report's "Started" section deleted in 1.9.0, and it applies here
for the same reason.

Old events keep their `outcome`; the log is append-only and nothing reads it.

### At the end, the timer goes away

It does not ask whether you finished. It used to assert `completed` the instant
the clock hit zero; then it asked, which made the chosen length the size of the
job. It is neither — the length was the entry price. Reaching it is not an
achievement to confirm or a deadline to answer for.

The bar removes itself and **one line goes to the live region**. Silent removal
would be an accessibility defect: a control vanishing with no announcement is a
control that disappeared for a screen-reader user with no way to know. The item
stays clocked for today either way.

## Consequences

- `src/timer.ts` is the one home for the length and its words. The start
  button's copy is built from the same reader the timer uses, so a button that
  says one length and starts another is not expressible.
- Two pinned tests read the SURFACE rather than a projection, because the defect
  is a rendering and no test of a pure function can see one: `no countdown, and
  no per-second tick to render one with`, and `the presence mark has no
  dimension that could carry an amount`.
- The thesis §4 line was rewritten in the same commit. It described the timer as
  "a bounded commitment", which is no longer what it is.

## What would overturn this

- **Evidence from real use that presence alone is not enough** — that without
  any sense of elapsed time the timer feels like nothing is happening. The
  answer would be elapsed with **no ceiling drawn** (you cannot be part-way
  through a thing with no end on screen), never a bounded shape.
- **Not by "a filling ring would look nicer."** It would, and it is a fraction.
- **Not by symmetry with other timer apps.** Every one of them is built for
  people for whom a deadline is motivating rather than aversive.
