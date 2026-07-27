# ADR-0011 · The no-silent-nodes invariant is enforced at the write boundary

**Status:** Accepted · **Date:** 2026-07-27

## Decision

Product law 1 — every node is **(a)** on a surface now, **(b)** under a clock,
**(c)** on the Menu, or **(d)** parented to something under a clock — is enforced
**at the write boundary**, in the same transaction as the write.

**The schema refuses writes that would violate it.** A write that would leave a
node silent is either completed (the gate supplies the missing clock or
placement) or **rejected**. It is never accepted-and-swept-later.

Every event in [`event-vocabulary.md`](../event-vocabulary.md) carries a
**Silent?** answer. A `yes` means the gate must inspect that write, and the gate
logic ships in the same commit as the event.

## Why

This is the app's central promise, and a promise enforced by a background sweep
is not enforced. A sweep has a window — between the write and the sweep the item
*is* silent — and windows are where things are lost. The audience for this app
has already been failed by every tool that meant to resurface things and didn't.

Enforcing at the boundary also makes the coverage gauge honest. If the invariant
holds by construction, **the gauge always reads zero**, and its job becomes
*proving* the invariant rather than *reporting* a backlog of silent items. A
gauge that regularly shows a non-zero count would be one more list to work
through — the opposite of the intent. **A non-zero gauge is a bug in this gate**,
and should be read as such.

There is also a plain engineering argument: an invariant checked in one place, at
write time, cannot be forgotten by a new feature. An invariant checked by a
periodic job is forgotten by the first feature that writes through a different path.

## Consequences

- There is **one** write path. No feature gets to write to the log directly, and
  no test helper may bypass the gate — a bypassed gate in tests means the tests
  stop proving the property that matters most.
- The gate needs a "cure" for every gated event, decided in advance:
  - `capture.recorded` → aggressive same-day clock, in the same transaction
  - `node.unparented` → requires an explicit clock or Menu placement in the same write
  - `done.marked` → checks whether the parent is now childless and surfaces it
  - `replan.resolved` → the choice must itself set a clock or land on the Menu
  - `clarify.routed` → every one of the six routes terminates somewhere legal
  - `bother.routed` → a route or a park; there is no third exit
- **Cascade deletes and reparenting are the dangerous operations.** Trashing a
  parent must not silently orphan children — it either takes them or rehomes them.
- The gate is where **property tests over synthetic logs** are aimed: generate
  arbitrary valid event sequences, fold, assert zero silent nodes. This is the
  single highest-value test in the codebase.
- Per Doctrine §6, **make the test fail once before trusting it** — construct a
  deliberately silent node and confirm the property test catches it. A green
  suite that has never been red proves nothing.

## What would overturn it

Nothing. This is product law 1 — it is the reason the app exists.
