# ADR-0048 · The record is readable: the log viewer and per-node history

**Status:** Accepted · **Date:** 2026-08-01

## Decision

The append-only log — the thing every fact in this app folds from — is
**readable by the person it belongs to**, two ways:

- **The record itself**, behind the (i) panel: read-only, day-grouped (newest
  day first; within a day, the order things happened), 50 lines per reveal
  with the true total stated, one plain-words line per event.
- **Per-node history** ("What happened to this"), a disclosure on the detail
  sheet: the same lines filtered to one item, the app's cures indented under
  their cause.

Both speak through one pure module, `eventWords` (src/log-words.ts): total
over the 84-kind vocabulary (a totality test holds it there), "you" for
deliberate acts, "the app" for its own (cures say *why*: "so it would not go
silent"), and an honest raw-name fallback for any kind newer than the build
reading it. **Content never rides along** — a note body, a journal entry, a
capture's text: the line says one was written, never what it said.

## Why

The OPR defect (1.2.3) lived for weeks precisely because nothing could look at
the log: the sheet wrote `person.linked`, nothing folded it, and the portfolio
said "nobody named yet" about people Noah had named — a contradiction between
the record and the render that a one-glance log view would have shown the day
it shipped. NOTES.md had already called the viewer "the sharpest debugging
tool available" at almost no cost. And for the user, the per-node history is
the permanent answer to the first complaint this app ever got — "it feels
lost": nothing the app does to an item is ever unexplained.

## The shape rules

- **Read-only, forever.** No verb on any line. Editing history is not a
  smaller feature of this one; it is a different product.
- **Behind a control, never a landing surface** — the same rule as the
  alignment tree (ADR-0013). Built on REVEAL, never while hidden (the
  coverage-list lesson: hidden DOM is still built DOM).
- **Counts are legal here.** "N events", "N of M shown" — the log is a
  RECEIPT, not a score about work; law 5 governs progress arithmetic on
  surfaces that judge a day, and the purge/sort true-total precedent applies.
- **Lines wrap; nothing scrolls sideways** — the (i) dialog's 320px overflow
  gate holds for this list too.
- **One `store.all()` per open**, pages rendered from memory. No LogStore
  interface change until an on-device measurement says otherwise (build-plan
  item 42's rule: measured, not extrapolated).

## What would overturn it

On-iPad slowness at real log sizes would change the READ mechanics (a paging
method on LogStore), not the surface. The read-only rule and the
no-content-in-lines rule are not overturnable by convenience; either would
need its own ADR making the case in writing.
