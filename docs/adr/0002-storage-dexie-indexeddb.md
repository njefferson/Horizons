# ADR-0002 · IndexedDB via Dexie; `localStorage` banned

**Status:** Accepted · **Date:** 2026-07-27

## Decision

The log lives in **IndexedDB, accessed through Dexie**.
**`localStorage` is banned outright** — not "avoided", not "used only for small
things". `navigator.storage.persist()` is requested at first run.

## Why

`localStorage` is synchronous (it blocks the main thread, and the capture path
has a 2 s budget), capped around 5 MB, string-only, and — the disqualifying
part — it is the *first* thing browsers evict under storage pressure. An
append-only log in `localStorage` would silently truncate, which is the exact
failure product law 9 exists to prevent.

The ban is absolute because a partial ban does not hold. "Just the settings in
`localStorage`" becomes "just the settings and the draft" becomes a split-brain
store where half the state survives eviction and half doesn't.

Dexie over raw IndexedDB because raw IDB's transaction and versioning API is
error-prone in exactly the places that matter here (upgrade paths, transaction
lifetime across awaits), and those bugs corrupt data rather than throwing.

## Consequences

- Everything persistent — settings, drafts, device identity, consent records —
  goes in IndexedDB. There is no second store.
- Persistence must be *requested*, and the request must be re-checked, not
  assumed. `persist()` returning `true` once is not a guarantee it is still true
  tomorrow — see V-06 in [`verifications.md`](../verifications.md).
- On iOS, persistence is reported to require notification permission, which is
  why T0 asks for it before any push mechanism exists —
  [ADR-0007](0007-notification-tiers.md).
- Dexie is a dependency in an otherwise dependency-light static PWA. Accepted
  deliberately: this is the one place where hand-rolling costs more than it saves.
- Drafts persist per keystroke, which means the write path must be cheap enough
  to run per keystroke.

## What would overturn it

Dexie becoming unmaintained, or a platform where IndexedDB is unavailable but the
app must still run. Neither would revive `localStorage` — the fallback would be
OPFS, which is real storage.
