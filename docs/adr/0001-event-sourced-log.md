# ADR-0001 · State is a fold over an append-only event log

**Status:** Accepted · **Date:** 2026-07-27

## Decision

All application state is derived: `state = fold(log)`. The log is append-only,
one record type discriminated by `kind`, every record stamped
`(wallClock, deviceId, seq)`. Conflicts resolve by **per-field** last-writer-wins.
There is no mutable "current state" table that could disagree with the log.

The complete event list is [`docs/event-vocabulary.md`](../event-vocabulary.md),
and it is closed: an unlisted `kind` is rejected at write.

## Why

Product law 9 — *data is never lost to updates* — is the hard requirement, and it
is very difficult to keep with a mutable store. A schema change to a mutable
store rewrites the user's data in place, and a bug in that rewrite is
unrecoverable. Append-only makes the failure mode "an old event folds oddly",
which is fixable after the fact, instead of "the data is gone", which is not.

Two second-order benefits decided it:

- **A user's exported log segment is a complete reproduction case.** No "can you
  describe what you did?" — the log *is* what they did. Given the audience, an
  app that asks people to reconstruct their steps from memory is asking the one
  thing it exists to not ask.
- **Multi-device without a server.** Per-field LWW over an append-only log
  merges by construction; there is no merge algorithm to get wrong, and no
  server needed to arbitrate.

## Consequences

- Startup must not replay the world. State is `latest snapshot + tail fold` —
  see [ADR-0006](0006-backups-and-import.md). The < 2 s cold-capture budget
  depends on this.
- `node.field.set` carries **exactly one** field. A multi-field event would make
  field-level LWW impossible, which is the whole mechanism.
- Wall clock is untrusted for cross-device ordering — it is a user-facing
  timestamp. Ordering is `(at, device, seq)` with `seq` authoritative within a
  device.
- Derived values (pressure, gauge, buffer burn, Next-up) are **computed, never
  stored**, so they cannot drift out of agreement with the log.
- The log grows forever. Compaction is required — [ADR-0003](0003-folder-mirror.md).
- Every future migration is additive-only. This is a permanent constraint, not a
  v1 one.

## What would overturn it

Evidence that fold cost is unacceptable at realistic log sizes *after*
snapshotting — i.e. a tail fold that cannot hit the 2 s budget on the owner's
oldest target device. Measure before believing it; the snapshot exists precisely
to make this not happen.
