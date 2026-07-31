# ADR-0046 · The gate keeps one running accumulator

**Status:** Accepted · **Date:** 2026-07-31

## Decision

`admit()` applies each admitted event once, in place, to a single
copy-on-write accumulator (`applyEvent`, extracted from fold), and checks
silence over a **dirty set** — the event's node, everything its payload
references, and everything whose coverage could ride any of them (descendants
via a maintained parent index, merge-dependents via a maintained merge index,
transitively). Cure order is pinned to map-insertion order, matching the old
whole-state scan.

**Both whole-batch belts are retained untouched**: the final delta silent-scan
and the whole-batch law-6 check run on a full independent fold of the output.
A miss in the dirty-set reasoning fails closed as a rejection, never as
corruption.

The old control flow survives verbatim as the oracle
(`test/admit-reference.ts`); an equivalence property test holds the rework to
it event-for-event across 150 seeded generated batches, rejection parity
included. A CI perf gate pins the result: 500 silent-risk events at a
10k-node state in under 800 ms (measured: ~9,000 ms before, ~55 ms after —
substituting the oracle back in reds the gate by an order of magnitude, the
deliberate-failure proof).

## Why

The old admit refolded the accumulated batch from scratch two to three times
per offered event, each refold copying the entire nodes map. Correct, and
quadratic with a large linear term: **500 events against a 10k-node state
measured at 6.3–9.0 seconds.** Two shipped features already rode that worst
case (the importer commits ~1,500 events in one batch; purge-clear commits one
trash per held thing), and every planned bulk act (ADR-0044's successors)
is a gated batch by law — the recorded rule that bulk is "a real, gated batch
of the same events a single act would write" makes the gate's cost the ceiling
on every wholesale feature. Chunking cannot fix it: the N·S term dominates.

## The one deliberate behavioural divergence

The old flow emitted **cures at merge-silenced nodes** — junk events, because
`isSilent` rides the merge chain before it ever looks at clocks, so those
cures cured nothing; it then re-emitted one per subsequent silent-risk event.
Found by the equivalence oracle. The rework skips them and lets the shared
belt own the case: same rejection with the same words when nothing later saves
the node; zero junk events when something does. Encoded in the property test's
comparison (`stripJunkCures`) and three dedicated tests.

## What would overturn it

Nothing about the interface: admit's contract (events in, events-plus-cures
out, rejection on incurable silence) is unchanged and oracle-tested. If the
dirty-set reasoning ever proves wrong in a way the belts catch, the fix goes
in the dirty set, and the failing batch is the new oracle case.
