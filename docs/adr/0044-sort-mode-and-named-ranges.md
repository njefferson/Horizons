# ADR-0044 · Sort mode: the second triage, over a range the user names

**Status:** Accepted · **Date:** 2026-07-31

## Decision

A second one-card triage surface — **sort mode** — runs over a **named range**:
a pure predicate over state plus a sentence in the user's own words plus a live
count (`src/range.ts`). The picker shows sentences and counts, **never lists**.
The card offers the six routes (emitting exactly what `routeEvents` writes),
"Open it" (the detail sheet), and "Leave it" (which writes nothing). The range
recomputes live; acted-on and left items are tracked per sitting, in memory
only.

The daily triage surface and its gauge remain **captures-only**. Nothing about
an import ever appears on the daily surface.

## Why

The `captured` latch (ADR-0029) is load-bearing and correct: the daily inbox is
captures-not-yet-routed, and an over-broad predicate offers routes that
hard-fail on demand-free kinds. But it also means an imported backlog — 1,222
loose rows from a real OmniFocus export — is **structurally untriageable** by
any interaction that exists. The app could accept a life's backlog and not
digest it.

The lawful bulk shape was already recorded (NOTES.md, "Selecting ranges"): law
8 caps what a surface SHOWS; a range the user NAMED is legitimate to act on —
the amnesty precedent. Sort mode is that resolution applied to triage: the cap
governs display (one card), the range governs reach.

## Shape rules, each with a reason

- **Range hygiene is one predicate** (`sortable`): runway kinds only — no
  person, bother, container, demand-free kind, Menu item, finished, trashed or
  merged node. A route on a Menu item would mint the Menu-plus-clock state no
  surface can render (law 6); a route on a person would be refused by the gate.
  Offering an illegal choice and refusing it afterwards is the recorded
  anti-pattern (ADR-0038).
- **Oldest first, by the genesis stamp** — the `(at, device, seq)` ordering of
  the titling event, never raw id: ULIDs sort by time only to the millisecond,
  and a whole import lands in one commit, so id order within it is shuffle
  order (found by the smoke walk routing a card the display never showed).
- **No numbers while sorting.** The range's true total is stated once at entry
  as a checkable fact (the purge precedent). No tally, no remaining count, no
  percentage, no bar — a per-sitting counter is a score with a different name
  (law 5), and the range being smaller on return is the only progress signal.
- **"Leave it" writes nothing** — the no-declined-record rule (ADR-0030,
  ADR-0042). Skips live in memory and die with the dialog.
- **Undo is the daily surface's undo**: `clarify.reopened`, gate re-cures, and
  the item returns to the range — not to the daily inbox, because it was never
  captured and undo does not forge provenance.
- **`captured` stays an honest claim about arrival.** No event, latch, or
  predicate change admits imported rows to the daily surface. Routing an
  imported row is legal because `clarify.routed` has no captured precondition
  and never had one; parity with the daily conveyor is a property test
  (test/sort-range.test.ts).

## What was deliberately not built

- A Menu range. Sorting a Menu item through the six routes would need promote
  semantics (ADR-0014); that belongs to the bulk-verbs release, with verb
  legality computed per range from the gate's own predicate.
- Checkbox multi-select over the capped held list — the select-all the
  recorded resolution rules illegitimate.
- Any bulk-apply verb. This ADR covers the conveyor only; wholesale acts are a
  separate release on machinery that has soaked.

## What would overturn it

Dogfood evidence that one-card-at-a-time cannot digest a real backlog even
with ranges — which would reopen the bulk-verbs design, not the daily triage
boundary. The captures-only daily surface is settled by ADR-0029 and law 8.
