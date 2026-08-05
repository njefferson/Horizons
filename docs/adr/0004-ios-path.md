# ADR-0004 · Export/import via Files is the sync and durability story

**Status:** Accepted · **Date:** 2026-07-27 · **Promoted 2026-07-27**

> **This is now the primary path, not the iOS path.** The owner settled that this is a
> personal-iPad app, which makes iPadOS the reference platform — and there is no folder
> mirror there ([ADR-0003](0003-folder-mirror.md), V-01). Everything below was written
> as the graceful answer for a secondary platform. **It is the answer.** It carries the
> full weight of "how does my data survive", and it should be built and tested first,
> not last.

## Decision

The sync story is **manual export/import via the Files app**, presented as
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
- **The export cadence has to be good enough to be the only mechanism.** A path that
  is one of two can afford friction; a path that is the only one cannot. Exporting must
  be quick, obvious, and hard to forget — and if it is forgotten, the app should say so
  plainly rather than let the user assume they are covered.
- **This rests on unconfirmed platform behaviour — see [V-00](../verifications.md).**
  If storage persistence cannot be relied on on iPadOS, this path is not a convenience,
  it is the *durability story*, and the app must say so rather than implying the local
  store is safe. That row was downgraded as harmless when there were other platforms;
  it is now the highest-value open check in the repo.

## What would overturn it

Safari shipping the File System Access disk pickers. Even then this path stays — it
would gain a mirror alongside, and would not lose the Restore action.
