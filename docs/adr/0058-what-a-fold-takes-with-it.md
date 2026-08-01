# ADR-0058 · What a fold takes with it

**Status:** Accepted · **Date:** 2026-08-01 · **Amends:** [ADR-0053](0053-folding-a-duplicate.md)

## Context

ADR-0053 built the fold as a **carry batch**: rather than a bare `node.merged`,
the merge intent writes across what the survivor lacks — the demand clocks, the
note, the people links — and re-homes the children. It closed with an overturn
clause: revisit the carry *"only by evidence that it carried wrongly"*, and if
that evidence arrives, *"the answer would be a smarter carry, never a bare
merge: 'swallow silently' does not become right because carrying was
imperfect."*

The evidence arrived, four times over. The 1.9.2 audit of releases 1.4.0–1.9.1
found that folding a duplicate:

- **destroyed the source's decision log.** `decisions` (1.9.0) was not in the
  carry list and `deltaBetween` iterates `heldNodes`, so a fold took every
  decision about the duplicate off every surface at once.
- **destroyed its standing decline.** `notNow` (1.8.0) was not in the list and
  `notNowLedger` filtered `!n.mergedInto`, so the ledger row vanished.
- **carried the decline's PARK onto the survivor.** `park` is in
  `CARRY_CLOCKS`, so live work went quiet under `reason:'merge:carried'` — the
  decline's mechanism arriving without its record.
- **broke the dependency arithmetic in both directions.** `feeds` and
  `leadDays` were never in the list, so the survivor did not feed what the
  source fed; and because `dependencyView` drops a downstream with
  `mergedInto`, an upstream's `latestStartInDays` fell from a real number to
  null. "Start it today" became silence.

**Nothing was ever deleted.** The log is append-only and every one of these
fields survived in state; only the projections excluded merged nodes, so the
records had nowhere to show.

The pattern matters more than any single defect. **1.7.0 wrote the carry as a
hand-written list, and every release after it added a `NodeState` field without
visiting that list.** The test that guarded the merge was titled *"a fold
carries the date, the note, the people, and the children — nothing swallowed"*
and asserted exactly those four, so the test and the code shared one blind spot
and always would. A list kept correct by remembering is a bug with a delay fuse.

## Decision

### The governing rule

**A fold carries STATE by writing, and carries RECORDS by reading.**

- **State** is what a thing currently *is* or currently *demands*. The survivor
  is the thing that stays, so the survivor must hold it — written across
  through the ordinary noun for that fact.
- **A record** is what *happened*, attributed to a moment and to a thing.
  Re-emitting it mints a second occurrence of something that occurred once, so
  it is carried by the READER following the fold (`src/merged.ts`).
- **The survivor's own answer always stands.** A fold only fills silences. This
  is ADR-0053's rule, now applied to every field rather than to four.

### Records are read, never copied

Three independent reasons, any one sufficient:

1. **Copies are not idempotent under merge → unmerge → merge.** Re-emitted
   `decision.logged` events carry fresh ids, and the decision fold is
   idempotent *by id*, so the survivor ends with duplicate rows that **no verb
   in this app can remove** — ADR-0057 forbids removing a decision at all.
2. **Copies put a false sentence in a document you hand to another person.**
   `delta.decided` is a set difference on decision ids, so copies would be
   reported as newly decided in a period when nothing was decided.
3. **Attribution.** A copy asserts the decision was made about the survivor;
   after a split it asserts that about both.

And reading is reversible for free: an unmerge un-writes nothing, because
nothing was written.

### The standing decline

Folding X into Y says these are one thing and Y is the one that stays. If Y is
live and undeclined, then in substance **the fold is itself the un-decline.**
So the survivor is never marked declined — that would be the fold deciding the
survivor's standing, which ADR-0053 forbids in the same breath as overwriting
its date. The fold is never refused either: a duplicate is a duplicate whatever
its standing, and refusing would push people to trash it, which is exactly what
ADR-0050 says the trash is not for.

The record stays. `notNowLedger` keeps a row whose chain ends somewhere alive
and says `· now part of ⟨title⟩`. The row still opens the **declined** node's
own sheet, because that is where "Split back out" lives. And the decline's park
is **not** carried: a decline's park is the decline, not a date about the work.

### `MERGE_DISPOSITION` — the durable half

Every field of `NodeState` is named in a `Record<keyof NodeState, Disposition>`
as `state` (with the noun that carries it and when), `read` (with the reader),
or `no` (with the reason, in words). Totality is a compile error, and a pinned
test re-checks the key set at runtime in case a field is ever declared
optional. A new field cannot land without its author writing the sentence.

**A reasoned `no` is a perfectly good answer** — and it is the answer for most
fields. The gate's value is that it forces the sentence to be written, not that
it forces the carry.

### Legality is computed, never refused after the offer

`canHold(target, source)` states the gate's two refusals once — a Menu item is
demand-free by placement, `aspiration` and `pebble` are demand-free by kind —
and both the picker and the carry ask it. Plus a direction rule: **a wish may
fold into a wish, and a wish into work; work never folds into a wish.** Folding
real work into a wish is a demotion, and the app already has a verb for that
which sheds the date visibly. Wish-into-wish keeps working, which a blunt
exclude-all-Menu-targets rule would have broken — two copies of "read this
book" is the commonest duplicate there is.

An edge that would make two things each wait for the other is **skipped and
stated** in the confirmation, never dropped in silence. The cycle check runs
against the accumulating batch, not prior state, because two edges can be
individually acyclic and jointly cyclic.

## Consequences

- `src/merged.ts` is the one home for "what a fold means at read time":
  `survivorOf` (moved out of `gate.ts`, where it was a private `mergeTarget` —
  law 1's merge exemption and the ledger's "where does this live now" are the
  same question), `foldedInto`, `foldedIntoDeep`, `decisionsFor`.
- The survivor's "folded into this" list is **transitive**. In a chain
  A → B → C, one hop left A's way back reachable from no surface at all, and
  ADR-0053 requires it to outlive the sitting for every node in the chain.
- `deltaBetween` builds its `seen` set across the whole of `before`, including
  trashed and merged nodes. A decision's identity is its event id; which node
  it hangs off is routing, not identity. This is more correct independently of
  merges and is **required** once the reader follows folds.
- **A known, stated edge:** a `waiting-for` folded into an `action` keeps its
  who/what/since and its person link, but `isOpenWaiting` requires the kind, so
  it stops counting in "Still with someone else". A fold must never change the
  survivor's kind, so this is a downgrade rather than a loss.

## What would overturn this

- **The read-through rule, by evidence that a survivor's sheet is unreadable
  with it** — a fold of many things producing a decision list nobody can parse.
  The answer would be presentation (grouping, a disclosure), not copying;
  copying loses on idempotence regardless of how the list reads.
- **A `node.folded` noun carrying the whole carry set as one payload** was
  considered and rejected: it duplicates six existing nouns' meanings inside
  one payload, needs a fold case re-implementing six others, and breaks the
  "one act, ordinary nouns, the receipt explains the pile" pattern
  `range.acted` established. Recorded so it is not rediscovered as a fresh idea.
- **Not by "the disposition map is tedious."** That is the map working.
