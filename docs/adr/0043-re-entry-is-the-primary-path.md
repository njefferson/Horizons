# ADR-0043 — Re-entry is bounded by shape, not by restraint

*2026-07-29 · Accepted · shipped 0.18.0*

## Context

`lapse.migration.ran`, `reentry.greeted`, `amnesty.offered` and
`amnesty.accepted` have been in `docs/event-vocabulary.md` from the first draft,
with the bound written into the schema itself:

> `reentry.greeted.shown` has room for exactly Next-up, at most three triage
> items, and the gauge. **There is no shape it could take that shows the
> backlog** (law 8).

None of them was folded, and nothing could emit one. That is the fifth
capability in this app defined completely and reachable from nowhere — the shape
ADR-0038 and ADR-0039 both recorded, hit again.

This one matters more than the count suggests. Product law 8 calls re-entry
**the primary designed path**, not an edge case. `NOTES.md` defines v1 done as
**thirty consecutive working days**, and under thirty the gate resets. A bad week
is not a risk to that gate; it is a certainty. What decides whether the gate
survives one is what the app does on the morning you come back.

## Decision

### The bound is a property of the type, not a promise in a comment

`reentryView` returns **counts and nothing else**: absence in days, how many are
waiting to sort, how many dates went by, and whether an amnesty applies. It
returns no arrays and no nodes. There is no field on it that a surface could
render as a list, however hard a future caller tried.

That is the difference between a rule and a guarantee. A capped list is a
decision someone can revisit; a return type with no items in it is not. The test
asserts the *key set* of the view, so adding a `items: NodeState[]` to it fails
the suite rather than quietly reopening the door.

### The log records the guarantee, not the render

`greetEvents` writes `shown.triage` from `REENTRY_TRIAGE_CAP`, clamped — not from
whatever number the caller passed. The log's job here is to record the promise
the app makes. A number copied out of the DOM would record whatever a rendering
bug did instead, which is precisely the case you would want the log for.

### Seven days, and a weekend is not a lapse

Greeting somebody for two days away teaches them to dismiss the greeting, and
then it is not there on the morning it matters.

### The amnesty marks nothing done and deletes nothing

This is the piece that makes a lapse survivable, and its honesty is the whole
design.

Marking things done would be **a lie written into an append-only log**, and this
log is the thing every projection folds from — the falsehood would not stay in
one place. Deleting is the loss the entire app is a rebuttal to.

What it does instead is resolve every passed date forward with `to-menu`, the
choice the replan surface already offers, through `replanEvents` and the same
write gate a hand-made resolution goes through. The item lands on the Menu, where
by law 6 it carries no clock and makes no demand. It is still there; you can
bring any of it back.

**What that removes is not work.** It is twenty separate decisions standing
between you and being able to start anything, which is the actual cost of coming
back and the reason people abandon a system after a lapse rather than during one.

No cap is applied to the amnesty. The cap governs what a surface may **show**;
this is something the user explicitly asked for, and doing three of the twenty
they asked about would be the app deciding it knew better.

### The words state a fact and never apologise on your behalf

*"You were away a fortnight. Everything you put down is still here."* No "welcome
back, you have 47 things", which is a bill. No exclamation mark. The test asserts
the absence of eleven specific formulations, and the amnesty offer separately
asserts it never implies there was something to forgive — an amnesty that sounds
like absolution is one that says there was guilt.

## Consequences

- **`State.lastActivityAt` folds as a maximum**, like `lastReportAt` and for the
  same reason: a shard delivering older history must not make it look as though
  you have been away since then.
- **Absence is measured once, at mount, before this session writes anything.**
  The greeting is itself an event, and every other surface's mount can commit a
  cure clock — measuring later would report an absence of zero to somebody who
  has been gone a fortnight. `mountReentry` is therefore mounted last and holds
  the reading for the sitting, like the focus-exit ramp's `surfacing`.
- **Declining writes nothing.** Same rule as the comms sweep: a record of every
  time you did not do something is the ledger this app exists to not keep.
- **The counts refresh from current state, but the greeting does not.** Triaging
  three things should make the waiting line say so, rather than keep reciting the
  number you walked in to; how long you were away is fixed and does not change
  because you have been here five minutes.
- **The smoke fixture ages the ENTIRE log and clears the snapshot store.**
  Backdating one event proves nothing against a maximum, and the snapshot is its
  own store carrying today's timestamp — the first version of the fixture deleted
  a `kv` key that does not exist, so the walk asserted against a state it had
  failed to create.
