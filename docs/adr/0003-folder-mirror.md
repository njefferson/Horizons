# ADR-0003 · Optional folder mirror, per-device shards, Chromium desktop only

**Status:** Accepted · **Date:** 2026-07-27

## Decision

An **optional, feature-detected** folder mirror. The user points the app at a
folder their own sync service already manages (iCloud Drive, OneDrive, Dropbox,
Syncthing — the app does not care and does not integrate with any of them).

- Each install writes **only its own** `log-<deviceId>.jsonl`. No install ever
  writes another's shard.
- Fold = **union of all shards** found in the folder.
- Shards are re-read on `focus` and `visibilitychange`.
- **Compaction:** automatic when a device's own shard exceeds ~1 MB, plus a
  manual control. A device compacts **only its own** shards. Spent segments move
  to `archive/` — **never deleted**.
- Chromium desktop only, via the File System Access API, feature-detected at
  runtime. **Never advertised where it does not exist.**

## Why

Sync without a server, and without becoming a sync vendor. The single-writer
rule is what makes it safe: two writers against one file conflict every time,
and whole-file-diff-versus-whole-file-diff is the worst possible shape for a
sync service to resolve. One writer per file means the sync service never sees a
conflict at all — it only ever sees a file that one machine appends to.

That rule was not free. A sibling app broke it once and got away with it, and
the record notes plainly that this was *luck, not a result*.

Archive-rather-than-delete follows product law 9. Compaction is a
space optimisation; it must never be a data-loss mechanism, and the difference
is whether the spent segments still exist.

V-01 in [`verifications.md`](../verifications.md) confirms the support matrix:
Chromium desktop only. Firefox filed a *harmful* standards position; Safari ships
OPFS with no disk picker.

## Consequences

- Fold must tolerate **shards arriving out of order, partially written, or
  missing entirely**. A missing shard is a normal state (that device hasn't
  synced yet), not an error to surface.
- `deviceId` must be stable across restarts and unique across installs.
- **iCloud dataless placeholders** must be handled: the file appears in the
  directory listing but reading it stalls while the OS fetches it. A naive read
  hangs the fold. Reads are timed out and retried, and a stalled shard degrades
  to "not yet available", never to "empty".
- A shard that is present but unreadable is **never** treated as zero events.
  *A success response carrying nothing is not an answer — it is a question.*
- The feature is invisible on Safari and Firefox. No greyed-out button, no
  "upgrade your browser" — it simply is not there.

## What would overturn it

Safari shipping the disk pickers (it would extend, not replace, this design), or
evidence that real sync services mangle `.jsonl` appends in practice — in which
case the answer is a different file format, not multi-writer.
