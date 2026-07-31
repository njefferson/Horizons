# ADR-0045 · "Not before" — the defer verb rides the start clock

**Status:** Accepted · **Date:** 2026-07-31

## Decision

The user-facing defer verb is **"Not before ⟨day⟩"** on the detail sheet,
writing `clock.set {clockKind: 'start'}` (source `detail:start`) and cleared
with `clock.cleared {clockKind: 'start'}`. The held status names it — *"not
before Sep 3"* — when the start is the soonest demanding clock.

`park.set` remains the system's **deliberate-shelving** noun (the bother flow
today; the Not Now ledger and bulk "park until" later). One user-facing
daily-defer concept, not two.

## Why

The schema finished this feature before any surface asked for it: `start` has
been a `ClockKind` since the vocabulary was written, `soonestDemand` counts it,
`HARD` (replan) is due/suspense only — so a future start groups "Coming up",
returns as "Ready now" on its day, and a passed start raises **no** replan
card. That is exactly defer semantics, with zero fold changes. Decisively: the
importer has written start clocks from OmniFocus defer dates since 0.24.0 —
the user's store already held dates **no surface could show, set, or clear**.

Why not park for daily defer: a park never demands, and a passed park groups
"Later" saying "back now" — held away on purpose is a different promise from
"open on Thursday". The "Parked and now back" named range (ADR-0044) is what
keeps the park verb honest — a returned park surfaces there rather than
becoming an archive with a return date.

A start is a date somebody chose, so it stays in `CALENDAR_KINDS` (ADR-0033) —
unchanged, since the importer's start clocks were already exportable.

## Rules

- Setting a start never rides on a Menu landing or any other destination —
  Menu-plus-clock is unrenderable and against law 6's spirit; park and Menu
  are alternative destinations, never stacked.
- `clock.cleared {start}` is silent-risk; the gate cures in the same
  transaction (proven in test/sort-range.test.ts).

## What would overturn it

Dogfood evidence that people need "held away with a reason" daily (park's
shape) rather than "opens on a day" — which would add copy, not events.
