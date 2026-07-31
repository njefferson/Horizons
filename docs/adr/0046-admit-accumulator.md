# ADR-0046 · The gate keeps one running accumulator

**Status:** Accepted · **Date:** 2026-07-31 · **Amended:** 2026-07-31 (1.3.1 —
the audit's three corrections, recorded below)

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

## The deliberate behavioural divergences (all of them)

Two, and only two. Everything else is required to match the oracle
event-for-event.

- **No cures at merge-silenced nodes.** The old flow emitted junk events
  there, because `isSilent` rides the merge chain before it ever looks at
  clocks, so those cures cured nothing; it then re-emitted one per subsequent
  silent-risk event. Found by the equivalence oracle. The rework skips them
  and lets the shared belt own the case: same rejection with the same words
  when nothing later saves the node; zero junk events when something does.
  Encoded in the property test's comparison (`stripJunkCures`) and three
  dedicated tests.
- **A stamp-disordered batch is refused** ("a batch must be offered in its own
  event order"), where the old flow tolerated it silently. The accumulator
  applies in offered order while fold sorts by `(at, device, seq)`; for LWW
  fields the two agree regardless, but `dependency.released` is the
  vocabulary's one non-commutative fold operation, and a disordered batch
  could slip a dependency cycle past `wouldCycle` that the sorted refold then
  makes real — permanently, in an append-only log. Every real caller already
  stamps one `at` with monotonic seq, so the refusal turns an unstated
  precondition into a checked one. (Its first run caught a real emitter:
  undo's waiting-for branch pre-built its clock-clear and emitted seqs out of
  order.) Pinned in `test/audit-regressions.test.ts`.

## Corrections the 1.3.1 audit forced (parity restored, not diverged)

- **The born set.** `ensureNode` mints a node on first touch whatever the
  event kind — `heat.set` at a stray id, or a payload reference like
  `person.linked`'s `node`. The old whole-state scan met such ghosts at the
  next silent-risk event and cured them; the dirty set as first shipped was
  blind to them and **rejected batches the oracle accepted**, the user's own
  capture riding in them included. Every silent-risk check now unions the
  batch's born set into the dirty set, restoring the oracle's answer exactly.
  The equivalence generator now mints ghosts three ways.
- **`collectDependents` is an explicit stack, never recursion.** A 5,000-deep
  parent chain blew the call stack out of admit as a raw `RangeError` instead
  of a decision — the same rule `wouldCycle` already follows. Pinned at
  10,000 deep.
- **The Menu/demand-clock belt** (both `admit` and the oracle, identically):
  a batch may not leave a node on the Menu carrying a due, start, suspense, or
  park clock it was not already carrying there. Law 6 governs kinds; this
  governs placement — a someday-routed action keeps kind `action`, so a date
  on it is kind-legal and then unrenderable everywhere (the Menu group wins
  every surface, no replan card raises, the sheet hides temporal controls): a
  hard date swallowed whole. Delta form like every belt, so a pre-existing
  state stays curable. The someday/reference routes now shed the node's
  demand clocks in the same batch, Menu landing first.

## What would overturn it

Nothing about the interface: admit's contract (events in, events-plus-cures
out, rejection on incurable silence) is unchanged and oracle-tested. If the
dirty-set reasoning ever proves wrong in a way the belts catch, the fix goes
in the dirty set, and the failing batch is the new oracle case.
