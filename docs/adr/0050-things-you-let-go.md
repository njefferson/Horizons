# ADR-0050 · Things you let go: recovery, not an archive

**Status:** Accepted · **Date:** 2026-08-01

## Decision

The trash is visible: **"Things you let go"**, behind the (i) panel — the 25
most recent with the true count stated, newest decision first
(`trashedNodes`, the deliberate complement of `heldNodes`). Each row carries
**exactly one verb: open the detail sheet**, where "Keep it after all" has
lived since Phase 3.5. Rows are skinned as list rows, never as cards — the
trash must never read as a to-do list.

## Why — this is a FIX, not a feature

The trash button has always promised *"You can still keep it after all."*
That was true for about ten seconds: `#detail-untrash` was reachable only
while the sheet was still open on the node just trashed. Once it closed, the
node was off every card surface and out of search, and there was **no path
back to its sheet at all** — a standing honesty defect against the app's own
voice rules. This view is the path.

## The law-3 boundary, fixed here

**The trash holds explicit decisions, not lapses.** Law 3 forbids an archive
because an archive is where undecided things go to be forgotten; every entry
here was a deliberate act (`node.trashed` is written only by a person's tap
or a typed-word bulk act, never by the app on its own). Nothing in this view
decays, demands, raises a replan card, or counts toward any gauge — it is not
a state work can drift into, so it is not the past bucket law 3 bans. It is
the record of "I decided no", kept because decisions can be revisited.

- **Search stays trash-free.** A thing gone by decision is not lost, and
  search answers only about what you are holding — the search module's own
  comment was amended in this commit so the recorded design and the code say
  the same thing.
- **Recovery is gated like everything else**: "Keep it after all" is
  `node.untrashed`, silent-risk, cured with a clock in the same transaction —
  a kept thing re-enters the world covered, never silent.

## What would overturn it

Nothing about visibility — a promise the UI makes must be keepable. The cap
and placement could move on Noah's word; the one-verb rule and the
no-decay/no-demand rule are the law-3 boundary itself and would need this
ADR reversed in writing.
