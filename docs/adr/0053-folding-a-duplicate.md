# ADR-0053 · Folding a duplicate: the carry batch, the way back, the twins range

**Status:** Accepted · **Date:** 2026-08-01

## Decision

`node.merged` has sat in the vocabulary since Phase 0 with no UI — and no
rules. Seven years of inbox plus fresh captures of the same worries guarantees
near-duplicates; sort mode surfaced them, as the watch-list predicted. 1.7.0
gives the noun its verb, and the verb its law:

**A fold is a carry batch, never a bare event.** A bare `node.merged` is a
data-loss verb: the merged node's dates stop demanding, its note goes unread,
its people go unlisted, its children point at a thing no surface shows. So the
merge intent (`src/ui/merge-intents.ts`) builds ONE gated batch that carries,
in order: every demand clock the survivor lacks (`clock.set` /
`suspense.set` / `park.set`, each stamped `merge:carried`), the note (copied
if the survivor has none, joined with a blank line if both speak — the merge
decides for neither), every people link the survivor lacks (additive), every
child re-homed to the survivor (`node.parented`, prior parent captured), and
only then `node.merged{into}`. Where the survivor already holds a clock or the
note, **the survivor's own stands** — folding a duplicate INTO something must
never rewrite what that something already says.

**The way back is `node.unmerged`** — a new noun, Silent-risk yes: a split-out
node stands alone again, so the gate cures it with a same-day clock in the
same batch, exactly as it cures a fresh capture. Unmerge restores the node's
*standing*, not the world: what the carry batch wrote stays written (the
record does not un-happen), and the survivor simply stops listing it. Both
directions converge under the same per-field LWW slot (`mergedInto`), so
shards arriving in any order agree.

**Legality is computed, never refused after offer** (the ADR-0038 rule): a
thing may not fold into itself, nor into its own descendant (a thing is not a
part of itself), and people fold only into people — work never folds into a
person. The sheet's picker offers exactly `legalMergeTargets` and nothing
else, filtered as you type, lineage named.

**The twins range** ("Sharing a name with something else") joins the sort
picker: EXACT normalized-title equality, deliberately never fuzzy — a false
"this is the same" costs more than a missed one, and fuzzy matching would put
things in front of a person that merely rhyme. It is a `runway` range: the
six routes and the sheet's fold verb do the rest.

## Why not the alternatives

- **Auto-merge, or a "probably the same?" prompt** — a guess wearing a verb.
  The app never decides two of a person's thoughts are one (law 2: the person
  is the planner).
- **Delete-the-duplicate** — the trash is for things let go, not for things
  that are the same thing. A fold keeps the history of both under the one
  that stays; a trash loses the standing of one of them.
- **A merge that swallows** — rejected above; the carry batch is the whole
  point. The property test pins it: date, note, people, children, each
  asserted survived.

## Consequences

- The survivor's sheet lists what folded into it ("Folded into this"), each
  row carrying its own way back — the trash view's lesson: a promise that
  outlives the sitting.
- The log reads honestly: "Folded into ⟨title⟩ — the same thing, kept once."
  / "Split back out — its own thing again."
- `foldedInto` and `legalMergeTargets` are pure readers; the write boundary
  refuses a fold whose batch would leave anything silent, like every other
  write.

## What would overturn it

- **The carry batch, only by evidence that it carried wrongly** — a real
  sitting where something the batch preserved should not have been (say,
  a carried date that was itself the duplicate's error). The answer would be
  a smarter carry, never a bare merge: "swallow silently" does not become
  right because carrying was imperfect.
- **Exact-only twins, by Noah's word after real use** — if months of sittings
  show the near-miss pairs are the common case and the conveyor never meets
  them, a *suggestion* surface could be argued for. It would still be a range
  a person walks, never an auto-merge; law 2 is not overturnable here.
