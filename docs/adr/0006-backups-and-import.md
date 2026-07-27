# ADR-0006 · Immutable timestamped exports; import seeds a fresh store, never merges

**Status:** Accepted · **Date:** 2026-07-27

## Decision

- Backups are **immutable, timestamped files**. An export never overwrites a
  previous export.
- Content is **the log** (plus a snapshot for fast restore) — not a rendering of
  current state.
- **Import always seeds a fresh store. It never merges.** There is no merge
  option, no "smart import", no conflict UI.
- A snapshot is **auto-exported before any migration**, without being asked.
- Migrations are **additive-only**.

## Why

Import-never-merges is the owner's rule and it is the right one. Merge is where
backup tools destroy data: the merge is ambiguous, the UI asking the user to
resolve it is unanswerable ("which of these two versions of a note you wrote
eight months ago did you mean?"), and a wrong answer is silent and permanent.
Seeding a fresh store is always explicable — the user knows exactly what they now
have, because it is exactly what was in the file.

This costs a real capability: you cannot use import to combine two divergent
devices. That job belongs to the folder mirror ([ADR-0003](0003-folder-mirror.md)),
which merges *by construction* through single-writer shards rather than by
resolving conflicts after the fact. Merging is solved once, in the place where it
is safe, and nowhere else.

Exporting the **log** rather than current state means a backup is a full history,
and — per [ADR-0001](0001-event-sourced-log.md) — a reproduction case. A state
snapshot alone would silently discard everything that led to it.

Auto-export before migration is the seatbelt for the one operation that touches
every record at once. It is not offered; it happens.

## Consequences

- Exports accumulate. That is intended — they are cheap and the failure mode of
  too few is unrecoverable. The app may *show* the user their exports; it never
  deletes one.
- The snapshot inside an export is an optimisation. **Restore must work from the
  log alone**, and there must be a test that proves it does, because a snapshot
  format bug would otherwise be invisible until the day it matters.
- Filenames carry vault, timestamp, and encryption status, so a folder of exports
  is legible without opening them.
- Importing into a store that already has data is a **destructive** action and
  gets a real confirmation naming what will be replaced.
- Encrypted vaults export encrypted ([ADR-0005](0005-vaults-and-journal-encryption.md)).
  An export must never be the plaintext leak.

## What would overturn it

Nothing foreseeable for the merge rule. Export *format* may gain fields — it is
additive-only, so old exports must keep importing forever, and that is worth a
regression test seeded with a genuinely old file.
