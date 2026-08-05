# ADR-0069 · What it costs to look

**Status:** Accepted · **Date:** 2026-08-03

## Context

The write path has had a perf gate since 1.3.0 (`test/admit-perf.test.ts`,
[ADR-0046](0046-admit-accumulator.md)). The read path has never had one, and the
roadmap said why it would stay that way:

> one commit triggers ~18–20 full-state projection passes (~220 ms today, 1.56 s
> at 10k), tolerable now, scheduled for repair by on-iPad measurement later

**Those numbers were extrapolated**, and build-plan item 42 defers read-path work
to a measurement on the actual device — correctly, because this repo does not
optimise against a guess.

1.16.0 changed what is knowable. A 566-thing store with every kind in it is a
fixture you can time, and timing it turned the estimate into a fact:

- **One refresh: ~100 ms** at 566 things, on this hardware.
- The cost was not spread evenly. Nine projections cost 4–16 ms each; the other
  eight cost under 0.3 ms. Every expensive one walks nodes asking for calendar
  distances; every cheap one does not.

## Decision

**Memoise `localParts`, and gate the read path.**

### The finding

`Intl.DateTimeFormat` construction was already cached in `src/time.ts` — the
comment beside it says construction is expensive and these are hot in render.
**The formatting itself was not.** `formatToParts` is the expensive half, and
every call did it again.

`calendarDaysBetween(from, to, tz)` resolves two instants to local days. Nine
projections call it once per node per clock. So a single refresh asked the same
question thousands of times — and the worst of it was self-inflicted: the
`nowIso` side is **the same instant for every node in every projection**, resolved
from scratch every time.

With a memo on `localParts`: **~100 ms → ~22 ms**, measured A/B, three runs each.
Roughly four times, from caching one pure function.

### Why a memo is the right shape here

It is a pure function — same in, same out — and `FORMATTERS` directly above it is
the same pattern with the same justification. This inherits a precedent rather
than inventing one.

Two guards make it safe rather than merely fast:

- **The cached object is frozen.** A memo hands the same object to every caller,
  and this repo has already paid for aliasing once — the three-place rule in
  `fold.ts` exists because a shared object mutated in one place changed another.
  Nothing mutates `LocalParts` today; freezing means a future writer finds out at
  the write rather than through a date that is wrong somewhere else.
- **The key is (zone, instant), not instant.** A cache keyed on the instant alone
  would hand a traveller the wrong day, which is worse than being slow. Pinned by
  a test.

**The bound is crude on purpose**: 20,000 entries, then clear. Growth is bounded
by the distinct instants a session touches. An LRU would be more elegant and
would be a cache to maintain, in a file whose job is to be obviously correct
about time. Clearing loses nothing but speed.

### Two gates, failing for different reasons

- **A structural gate that cannot flake.** Identity: resolving the same instant
  twice returns the same object. A wall-clock test on a shared runner is a coin
  flip at tight bounds and useless at loose ones; this one names the mechanism
  and is deterministic. It is what the deliberate-failure proof reds.
- **A wall-clock gate at 250 ms**, loose in the same spirit as the admit gate's
  800 ms around a 55 ms operation. It is not there to measure; it is there to
  catch the return of a shape, which lands in multiples.

Plus the check that matters more than either: **the same store answers the same
after any number of refreshes.** A cache that changed an answer would be the
worst possible trade.

## Consequences

- No behaviour change, no new nouns, no surface change. Nothing on any screen is
  different; it is the same screens, sooner.
- **Item 42 is not closed by this.** The measurement that counts is still on
  a real iPad — this hardware is not that device, and the ratio is more portable
  than the absolute. What has changed is that the read path now has a gate at
  all, so a regression is caught before it reaches a device.
- **A correction, made in the same commit it was found in.** The memo's first
  draft carried a NaN guard for malformed instants, with a confident paragraph
  explaining it. `formatToParts` **throws** on an invalid date rather than
  yielding NaN parts, so the branch was unreachable and the paragraph described
  behaviour the platform does not have. Both are replaced by the truth and a test
  that pins it: it threw before, it throws now.
- The remaining cost is honest and unhidden: `heldGroups` is still the most
  expensive projection. Nothing here restructures it, because the next thing to
  do about the read path is measure it on the device, not guess again.

## What would overturn this

- **A wrong date on a real device.** The memo's correctness rests on
  `localParts` being pure. If a zone database update or a DST transition mid-
  session ever made that false, the cache is wrong and the fix is to drop it —
  speed is never worth a date this app states confidently and gets wrong.
- **Memory pressure on iPadOS.** 20,000 frozen six-number objects is small, but
  it is not nothing, and the device is the authority. If it bites, the bound
  comes down.
- **Not by "22 ms is still too slow."** It might be, at 1,400 things on a
  tablet. That is item 42's measurement, and the answer to it is a different
  release with a number in front of it.
