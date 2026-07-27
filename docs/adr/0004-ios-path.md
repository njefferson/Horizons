# ADR-0004 · iOS gets manual export/import, not a degraded folder mirror

**Status:** Accepted · **Date:** 2026-07-27

## Decision

On iOS the sync story is **manual export/import via the Files app**, presented as
a first-class path rather than as a missing feature.

When the app launches to an **empty or stale store**, it shows **one prominent
Restore action** that opens the file picker directly. Not a dialog explaining the
situation, not a settings page to hunt through — one action, one tap, into the picker.

The folder mirror is never mentioned on iOS.

## Why

V-01 settles it: Safari has no local-disk picker and will not get one soon. There
is no way to build the folder mirror on iOS, so the choice is between a
well-designed manual path and a permanent apology.

The Restore-on-empty rule exists because of who this is for. An empty store at
launch means one of: new install, cleared storage, or a restored device. In all
three the user's next thought is "where is my stuff", and the answer must be
reachable **before** they have to form the question. Making them find
Settings → Data → Import while looking at a blank screen is the moment the app
loses their trust, and it is entirely avoidable.

"Stale" as well as "empty" because a store that is present but weeks behind is
the harder case: it looks fine, so nothing prompts, and the user works in the
wrong copy.

## Consequences

- Export must produce a file the Files app handles cleanly and iCloud Drive syncs
  without special handling.
- Import always seeds a **fresh** store — [ADR-0006](0006-backups-and-import.md).
  There is no merge, so a user importing twice is never in an ambiguous state.
- "Stale" needs a definition that does not nag. Working proposal: the store's
  newest event is older than the newest event in the most recent export the app
  knows about. Refine during build; it must not fire on a device that is simply
  used less often.
- Feature detection must be genuine capability detection, never user-agent
  sniffing.
- **Per V-07 this rests on unconfirmed platform behaviour** (per-home-screen-icon
  IndexedDB isolation). The design assumes the pessimistic case, so a negative
  answer costs nothing — but the row stays open until Noah checks it on a real device.

## What would overturn it

Safari shipping the File System Access disk pickers. Even then this path stays —
it would gain the mirror, not lose the Restore action.
