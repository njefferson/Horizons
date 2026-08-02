# ADR-0063 · Startup does not replay the world

**Status:** Accepted · **Date:** 2026-08-02 ·
**Executes** [ADR-0001](0001-event-sourced-log.md)

## Context

[ADR-0001](0001-event-sourced-log.md)'s first consequence, written in the design
phase: *"**Startup must not replay the world.** State is `latest snapshot + tail
fold` — see ADR-0006. **The < 2 s cold-capture budget depends on this.**"*

Build-plan item 5 is "Snapshot + tail — startup path. Measure cold start from
here on." `src/snapshot.ts` was written in Phase 0. `serialiseState`,
`deserialiseState`, `writeSnapshot`, `loadState` and `restoreFromLogAlone` all
exist, and four tests exercise them.

**And `writeSnapshot` had no caller outside the test suite.** The only
production writer of a snapshot was `portability.ts`, storing one that arrived
inside an imported file. So on every ordinary device `loadState` found no
snapshot, fell through its first branch, and folded the entire log — every
start, every reload, every return to the Home Screen. The tail fold the budget
depends on was never a tail; it was always the whole thing.

Nothing failed. No test went red, and none should have: the fallback path is the
*correct* path, and the state it produces is right. What was lost was only the
thing the machinery was built to buy, and the loss grows with the log — which is
append-only, so it grows forever.

This is the same defect as `export.written` in
[ADR-0062](0062-the-copy-and-the-way-back.md), one layer down: something written
and tested, wired to nothing, silent because every instrument reported success.

## Decision

**The session cuts a snapshot once per boot when the log has run too far past
the newest one**, and records that it did.

### From the state already in hand, not by re-folding

`writeSnapshot` re-reads the log and folds it. Calling *that* at startup would
pay exactly the cost the snapshot exists to avoid. So `snapshotFrom(store,
state, at)` takes a state that has already been folded — the session has just
folded it — and serialising it is a clone and nothing more.

The mark and the event count both come from the **same state object, read
synchronously**, so the snapshot is internally consistent even if a commit lands
while it is being written. It then covers less than the log does, which is what
a snapshot is.

`writeSnapshot` stays, expressed in terms of the new function, because the tests
and any future caller without a state in hand still want it.

### After the app is on screen, and never on the queue

It runs after `document.body.dataset.ready`, unawaited and contained. It is
housekeeping for the *next* launch and must not be on the path to this one's
first capture.

It is deliberately **not** put on the commit queue. Queueing would place a clone
of the whole state in front of the user's first capture — the one interaction
this app protects above all others. The cost of not queueing is that a commit
may land between the photograph and its record, which is harmless.

### The threshold is a count, not a clock

`SNAPSHOT_LAG_LIMIT = 500` events past the newest snapshot. This is not a tuning
knob so much as a statement of what a cold start is allowed to cost: below it, a
start folds at most that many events onto a deserialised state.

**Deliberately not time-based.** A device used once a fortnight has a short tail
and should do no work; a device that took an import an hour ago has a long one.
Elapsed time knows neither — the same reasoning ADR-0004 applied to export
staleness, and the same trap (`lastActivityAt` measures when the device was last
used, so a rule built on it fires on precisely the population that has done
nothing).

### Deliver, then record

The snapshot lands first; only then is `snapshot.written{upToSeq, reason}`
committed. A failure leaves no record claiming otherwise. This is the ordering
the export path learned from an audit, applied here before it could be learned
again, and pinned by a test with a store that refuses to hold a photograph.

The noun was declared in the vocabulary in Phase 0 and unemitted until now.

### The guard that makes it safe to turn on

`loadState` already recomputes the arithmetic — snapshot's event count plus tail
length must equal the log — and falls back to a full replay when it does not.
That guard was written after an audit found a restore resurrecting a silent node
the gate had cured. It means **the worst case of cutting snapshots is a slow
start, never a wrong state**, and it is what makes this change small.

## Consequences

- The first start after this ships is still a full replay — there is no snapshot
  yet — and it cuts one on the way out. Every start after that reads a
  photograph plus a bounded tail.
- Startup is now `O(nodes + tail)` rather than `O(all events ever)`. It is not
  constant, and saying so matters: deserialising is proportional to how much you
  hold, which grows far more slowly than a log that records every act.
- The snapshots table now holds one row per cut on a real device, where before
  it held one only after an import.
- **A freshly imported store is already covered**, because `importSeedingFresh`
  stores the snapshot that travelled inside the file. That is correct and it is
  worth stating, because it briefly made the headless walk's proof vacuous: the
  walk imports a backup, so a reload afterwards correctly does nothing, and the
  check would have passed with the caller deleted. It now empties the snapshots
  table first, staging the exact state every device was permanently in before
  this release — a long log and no photograph — and asserts the app climbs out.
- **A `snapshot.written` travels between paired devices**, because it is an
  ordinary event in an ordinary shard. It is a device-local housekeeping fact
  appearing in a shared record, which is mildly untidy and entirely harmless:
  the noun is not silent-risk, carries no node, and the other device simply
  counts it toward its own lag — which is, if anything, the right direction.
  Stated here rather than left to be discovered.
- **Cold start on the iPad is still unmeasured** — build-plan item 42. This
  release removes a known cause of slowness; it does not report a number, and no
  claim here should be read as one.

## Refused in this release

- **Compaction.** ADR-0001's fifth consequence — "the log grows forever,
  compaction is required" — is also unbuilt, and `shard.compacted` is also
  unemitted. It is a larger decision about discarding history under a law that
  says data is never lost, and it should be taken with a measurement in hand
  rather than bundled into a fix.
- **Snapshotting on a schedule, or on every commit.** Both do work nobody asked
  for, on the device, while somebody is using it.

## What would overturn this

- **A measurement showing deserialise dominates.** If rebuilding from the
  photograph costs more than folding the tail it saved, the snapshot is the
  wrong shape and the answer is a smaller serialised form — not a bigger
  threshold.
- **Evidence that the arithmetic guard rejects real snapshots routinely.** That
  would mean the fast path never earns itself and this release is dead weight;
  the cause would be worth finding before raising the threshold.
- **Not by "the log is small enough today."** That is true of every append-only
  log exactly once.
