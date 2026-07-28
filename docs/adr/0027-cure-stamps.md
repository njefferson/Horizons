# ADR-0027 · Cures share their cause's stamp; commits are serialized

**Status:** Accepted · **Date:** 2026-07-28

## Decision

Two related rulings about `(device, seq)`, made together because each is only
safe in the other's presence:

1. **A gate cure carries its cause's stamp** — same `at`, same `device`, same
   `seq` — and a derived id, `<cause-id>~cure~<node-id>`. Replaying the same log
   through the gate reproduces byte-identical cures.
2. **Commits are serialized** at the session layer: one write lands before the
   next reads its seq. The gap-free invariant is stated over **offered** events;
   cures are derivable attachments that sit exactly on their cause.

## Why

**The literal reading of "gap-free per device" was quietly false.** The gate
synthesises cure events (ADR-0011 — the log must explain the state), and those
cures were stamped with their cause's seq so that replay is deterministic. That
means `(device, seq)` was never unique in a log containing cures. Meanwhile the
UI's commit path had a real race in the *other* direction: two interleaved
commits could both read `nextSeq` before either appended, and **neither store
enforces seq uniqueness** — Dexie's `[device+seq]` index is non-unique, and a
collision was accepted silently. One of these duplications is designed; the
other is a defect. This record draws the line between them.

**Why cures keep the shared stamp rather than taking their own seq:**

- **Replay determinism.** `state = fold(log)` must hold everywhere, including
  through re-admission. A cure with its own freshly-minted seq would make the
  same offered events produce different logs on different replays, which breaks
  the one equation everything rests on.
- **A cure is not an independent fact.** It exists only because its cause does;
  it sorts with its cause, ships with its cause, and is reconstructible from its
  cause. Giving it independent identity in the ordering would imply it could
  arrive without one.
- **The completeness proof survives, restated.** A shard proves completeness
  over offered events: max seq `n` means offered events `0..n` are all present.
  Cures are then verifiable by derivation — their ids name their causes — which
  is a *stronger* check than a counter, because a missing cure is detectable and
  regenerable.

**Why serialization lives in the session and not the store:** the store is the
wrong layer to invent ordering — `append` must stay dumb and refuse duplicates
of what it can check (ids). The session is where seq is minted, so the session
is where minting is made mutually exclusive. The queue also survives failures: a
rejected commit does not wedge the writes behind it, because one bug becoming
permanent silent data loss is the worst failure this app can have.

## Consequences

- `test/session.test.ts` holds the property: N concurrent commits → distinct,
  gap-free seqs over offered events; cures sit exactly on their cause's stamp;
  a failing commit does not block the next; `fold(log)` equals live state after
  concurrency. **The suite was made to fail first** (§6): bypassing the queue
  collides seqs and the test catches it.
- Any future writer (share target, `/capture?text=`, sync) goes through
  `session.commit` or repeats this analysis. There is no second write path.
- Documentation that says "gap-free per device" means it as defined here —
  `src/events.ts`'s comment and the shard note read accordingly.

## What would overturn it

Multi-writer sync with true concurrent devices — but that is already per-device
sharding (ADR-0003), which is this same decision made structural: one writer per
seq-space, always.
