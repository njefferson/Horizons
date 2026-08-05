# ADR-0049 · Wholesale acts: the preview is the dry run, the receipt explains the pile

**Status:** Accepted · **Date:** 2026-08-01

## Decision

A named range can be **acted on wholesale**: Put them under ⟨place⟩ · To the
Menu ⟨category⟩ · Park until ⟨day⟩ · Let them go — and, for Menu ranges,
Bring them back as real work. Each bulk act is **exactly the events the single
act writes, once per item** (byte-parity is a property test), preceded in
every chunk by the release's one new noun:

- **`range.acted{scope, verb, count}`** — `scope` is the LITERAL sentence the
  user saw and agreed to (the `consent.granted` `whatLeaves` precedent; a bare
  key cannot reproduce what was agreed to once copy changes). Without the
  receipt, a wholesale filing reads as 1,222 unexplained `node.parented` rows
  — the log must explain the state. Deliberately unfolded: the state change is
  carried entirely by the ordinary events that follow, and folding the receipt
  would count the act twice.

**The preview IS the dry run.** Its sentence is counted from the real plan
(`planBulk`), including what will NOT take the act (a cycle, an already-there)
— stated and counted, never silently dropped. Verb legality is computed per
range family and per item from the gate's own predicates: never offer what
the gate must refuse (ADR-0038).

**Chunked commits** — the app's first. ~500 events per `session.commit`, the
session's promise queue serialising them; **every chunk re-checks each item
against live state** (the 1.3.1 fresh-check CRITICAL, at range scale) and
skips-and-counts anything that moved on. A failed chunk leaves the known-good
prefix landed and a stated partial receipt.

**Undo is a reverse batch through the gate**, chunked the same way, from
per-item facts captured at act time — the exact prior parent, the prior
category — with its own `range.acted`. What it cannot restore it SAYS: demand
clocks shed on the way to the Menu do not come back, because the belt is why
they came off at all.

## The two conflicts, ruled on here

- **The no-number rule vs the status line.** Sort mode forbids tallies and
  countdowns about the PERSON's sorting (law 5: a per-sitting counter is a
  score). A bulk run's status ("Working — 614 written so far.") and its
  receipt ("Filed 214 things.") are counts of the APP's mechanical work — the
  receipt class the log viewer already established as legal. Ruling: receipts
  during and after a wholesale act are legal; scores about the person never
  are. The idle dialog still carries no arithmetic and the law-5 smoke check
  stands unweakened.
- **How hard the destructive gate is.** Purge deliberately does not force a
  backup — an adult who has read an accurate sentence may proceed. Bulk
  Let-them-go AUTO-exports first. These are consistent through the migration
  precedent (auto-export before any migration): the typed word ("let go" —
  its own word, because one word must not authorise two different acts) gates
  the DECISION; the copy is not friction but plumbing, delivered before the
  first trashed event — and if the copy cannot be delivered, nothing is
  trashed. The ordering is machine-checked by the smoke walk, the first
  export-before-destruction assertion in the repo.

## Range export is a READING copy

A range's events in isolation cannot carry the coverage law 1 requires — the
clocks and parents that cover them live outside the range — so a seedable
partial `ExportFile` is not expressible. "Export a copy of these" therefore
produces a **rendering** (format `planner-range-copy`): the range's events
verbatim, named as a reading copy, refused by `inspectExport` with honest
words. Law 9 stays untouchable by construction. `export.written{scope}`
records it; no new noun.

## What would overturn it

On-device evidence that chunk size or the preview's counting is wrong at
a real scale — mechanics, not shape. The receipts-are-legal ruling and
the never-offer-an-illegal-verb rule are load-bearing product positions;
changing either needs its own ADR.
