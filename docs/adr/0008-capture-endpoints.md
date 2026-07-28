# ADR-0008 · Multiple capture entrances; commit before confirm

**Status:** Accepted · **Date:** 2026-07-27

## Decision

Capture has several entrances, all landing in the same place:

- **`/capture?text=`** — a **documented public endpoint**. Captured text lands
  with a visible confirm and an undo.
- **Manifest `shortcuts`** — a Capture entry on the app icon's long-press menu.
- **Web Share Target** — share into Quietkeep from anywhere (Chromium).
- **In-app quick capture** and the **interrupt gesture** (pin + capture),
  available from every screen.

Two hard rules:

1. **Drafts persist per keystroke.**
2. **Every pin and capture is committed to the log _before_ the UI confirms.**
   The confirmation is a report of something that already happened, never a
   prediction.

Interaction budget: **2 seconds**, cold, including the keyboard path.

## Why

For this audience the gap between having a thought and it being safe is the whole
product. Anything in that gap — a spinner, a sync, an animation, a required
category choice — is where the thought is lost, and the loss is silent.

Commit-before-confirm is the rule that makes the confirmation honest. A UI that
says "Saved" before the write lands will, on the one occasion the write fails,
have lied at the exact moment the user chose to stop holding the thought
themselves. That single event costs more trust than the feature earns in a year.
Doctrine §5: labels stay honest.

Per-keystroke drafts exist for the same reason at a smaller scale — an
interruption mid-capture is the *expected* case here, not the edge case.

A documented URL endpoint means the app composes with tools already on the user's
device — shortcuts, widgets, voice, automation — without Quietkeep having to
integrate with any of them.

## Consequences

- The write path must be fast enough to run per keystroke
  ([ADR-0002](0002-storage-dexie-indexeddb.md)) and must not block paint.
- `/capture?text=` is a **public URL**, so it must be safe against a hostile
  link. Text is stored as text, never interpreted; the confirm is visible so a
  drive-by capture cannot be silent; undo is always present. It creates one
  unclarified inbox item and can do nothing else — it cannot set a clock, route,
  complete, or delete.
- Captured items are `unclarified` and get an **aggressive same-day clock at
  write time**, satisfying law 1 in the same transaction rather than in a later
  sweep. There is no window in which a captured item is silent.
- Share Target is Chromium-only and feature-detected, like the folder mirror. It
  is absent, not broken, elsewhere.
- The 2 s budget is a **test**, not an aspiration: measured cold, on the slowest
  target device, in CI where possible.
- Source is recorded (`quick`, `share-target`, `url-endpoint`, `shortcut`,
  `focus-interrupt`) — it feeds the source tags that make clarify faster.

## What would overturn it

Nothing about commit-before-confirm. Individual entrances may come and go with
platform support; the invariant is that every one of them commits first.
