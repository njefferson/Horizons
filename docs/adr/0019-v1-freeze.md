# ADR-0019 · v1 scope frozen; the dogfood gate defines done

**Status:** Accepted · **Date:** 2026-07-27

## Decision

v1 is **frozen** at the Must list in [`NOTES.md`](../../NOTES.md). Moving an item
into v1 is a scope change and needs Noah's word.

**v1 is finished when the dogfood gate passes**, not when the Must list is
implemented:

> **Thirty consecutive working days** in which every staff call and walk-in runs
> from the app's views, every suspense lives in the app, and the desk paper holds
> nothing the app doesn't.

Under thirty days, the gate resets.

## Why

The Must list was chosen so that v1 is a **coherent app rather than a coherent
demo**. The test applied to each item: *can the thirty-day gate be passed without
it?* The Track portfolio and the delta report are in v1 for exactly this reason —
without them the work half does not survive contact with a real staff call, and
the desk paper stays on the desk.

Conversely the Menu, Rest mode, pebbles, and the journal are v1.5 not because
they are minor — Rest mode is close to the heart of the thing — but because the
gate can be passed without them, and the gate is what proves the spine works.

**Making the gate rather than the feature list the definition of done** is the
important half of this decision. A feature list can be completed by an app nobody
can use. The gate cannot be passed by anything except an app that has actually
replaced the paper, and it is deliberately behavioural: *the desk paper holds
nothing the app doesn't* is checkable by looking at the desk.

The reset rule is what gives it teeth. Twenty-nine good days and a day of
falling back to paper means the app is not yet trustworthy under load, and the
count starting again is the honest reading.

## Consequences

- **Duration estimates are logged from v1** even though duration learning is v2.
  The feature can be late; the data cannot be backfilled, and `estimate.recorded`
  costs one field now.
- **The Won't list in `NOTES.md` is written down and named**, so it cannot drift
  back in as an innocent-looking feature request. Each entry maps to a product law.
- The gate cannot start until the app is genuinely usable daily, so early build
  order is driven by "what does day one of the gate need" rather than by what is
  most interesting to build.
- Gate failures are **data, not defeat**. A reset should produce a note about
  *what* sent him back to paper — that note is worth more than the thirty days.
- v1.5's journal carries a binding condition from
  [ADR-0005](0005-vaults-and-journal-encryption.md): encryption ships in the same
  release, or the journal doesn't.

## What would overturn it

Dogfooding revealing that a v1.5 item is load-bearing for daily use — the gate
failing repeatedly for the same missing thing *is* the evidence that it belongs
in v1. That is the gate doing its job, and moving the item is then correct rather
than a scope failure.
