# ADR-0010 · One decay primitive for everything temporal; no "overdue"

**Status:** Accepted · **Date:** 2026-07-27

## Decision

A single primitive drives everything temporal:

```
(last_done, comfort_window, rising pressure)
```

Pressure is **continuous and computed**, never stored, never bucketed into
states. There is **no `overdue` state anywhere** — not in the schema, not in a
variable name, not in copy. The language is *"ready again"*. No red walls. **No
streaks, ever.**

## Why

Every temporal thing in the app — an Upkeep interval, an area's review clock, an
unclarified inbox item's same-day clock, a parked bother's return — is the same
shape: *something was last touched at T, it is comfortable for a while, and after
that it should come back with increasing insistence*. Modelling these separately
would produce four subtly different notions of "late" that drift apart, and four
places to fix a bug.

The refusal of `overdue` is not a copy preference; it is the design.

A binary late/not-late state is a **cliff**, and cliffs print their own geometry
into the interface — a sibling app learned this when hard accept/reject
boundaries rendered visible artefacts of the boundary rather than of the data.
A continuous gradient has no cliff to print.

More importantly: for this audience "overdue" is a **shame surface**, and shame
produces avoidance, and avoidance is the thing that made the item late. An app
that marks things overdue is participating in the loop it exists to interrupt.
Procrastination is substantially mood repair — the app must not manufacture the
mood that needs repairing.

**Streaks are refused for the same reason, one step further along.** A streak
converts intrinsic motivation into a score, and the score's real function is the
moment it breaks. For someone whose engagement is genuinely variable, a streak
is a machine for generating quitting moments.

## Consequences

- `comfort_window` is a **per-item** property, not a global setting. Watering a
  plant and calling your mother do not share a tolerance.
- Pressure is computed at read time from `(last_done, comfort_window, now)`. It
  is never persisted, so it cannot go stale or disagree with the log.
- Pressure is **unbounded above** and has no thresholds baked into storage.
  Display thresholds (which Upkeep chips surface, what "ready again" means) are
  presentation decisions and can change without a migration.
- Accessibility binding B-01 in [`ACCESSIBILITY.md`](../../ACCESSIBILITY.md):
  pressure is carried by position, fill, luminance, **and text**. Never hue.
- A passed *hard* date is a different thing from decay pressure and is handled by
  [ADR-0012](0012-no-past-bucket.md) — it raises a replan card, which is also
  not a failure state.
- **A grep for `overdue` or `streak` in `src/` returns nothing outside a
  prohibition.** That is a CI check, not an intention (`.github/workflows/spine.yml`).
  **Scope, stated accurately:** the gate covers those two words, in `src/` only —
  an audit found this record claiming all four of `overdue/late/missed/streak`
  across the whole repo, which the workflow has never done. `late` and `missed`
  are governed by review, not by the gate. The law itself holds either way: no
  such state, boolean or variable name exists.

## What would overturn it

Nothing. This is product law 5. A change here changes what the app is
(Doctrine §1) and is Noah's call, not a session's.
