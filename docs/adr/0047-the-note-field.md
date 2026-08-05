# ADR-0047 · The note: title-class content, not journal-class

**Status:** Accepted · **Date:** 2026-08-01

## Decision

An item can carry a **note** — free text riding `node.field.set{field:'note'}`,
a noun and a fold path that have existed since Phase 0 with per-field LWW
already working. Zero new vocabulary. The sheet's textarea and the importer are
the writers; `noteOf` (src/fold.ts) is the one reader; the cleaner is
`cleanNote` (src/note.ts) — shared, because two cleaners is how the same file
imports differently from how it types.

**The privacy class is fixed here so it cannot be relitigated by drift: a note
is TITLE-CLASS user content.** It is plaintext in exports exactly as titles
are, plaintext in snapshots exactly as titles are, and subject to no encryption
binding. The encryption-same-commit rule binds `journal.entry.written` — a
different domain with a different promise ("the journal ships encrypted or it
does not ship"). A note is what somebody would have put in the title if titles
were longer; it lives and travels with the item on the item's terms.

## The shape rules

- **Renders on the detail sheet only.** Cards stay one line — a note on a card
  is how a list becomes a wall (law 8's spirit at the row level).
- **The log line never carries the body.** The log viewer and the per-node
  history say "A note was kept with it.", never what it said: the log list is
  a thousand-line surface and a screenshot surface, and prose belongs on the
  item's own sheet. (Same rule as the journal's log line, for the same reason,
  even though the privacy classes differ.)
- **An empty write is the honest removal.** LWW stores `''`, `noteOf` reads it
  as none, and the log records that the note was taken off rather than
  pretending it was never there — append-only means un-noting is an event too.
- **`cleanNote` keeps `\n` and `\t`** (prose has structure) and strips other
  control and all format characters (a bidi override can make text display as
  something other than what is stored). Cap 10,000 characters — a note kept
  with an item, not a document store.
- **Search stays title-only** until asked. Making notes searchable is one line
  once wanted; doing it unasked doubles every search result's surface silently.

## What would overturn it

The owner deciding notes should be private-class after all — which would be a real
migration (encrypt-forward, additive) and gets its own ADR. Nothing else: the
choice between "title-class" and "journal-class" is a product promise, and it
is made here, once, in writing.
