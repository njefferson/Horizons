# ADR-0080 — A place gets a return date, and it is a review clock offered on the receipt

*2026-08-06 · Accepted · shipped 1.26.0 · V2 stage 3*

## Context

**The hollow return**, found by the V2 deep pass on 2026-08-04 and open ever
since. A place minted at file time is cured with `source: 'gate:node.created'`.
`isAppClock` excludes that from `soonestDemand` (`held.ts`) and from
`arrivedClock` (`nextup.ts`), so **the place sat in "Later" for ever**, holding
everything filed into it. And `fileUnderEvents` clears every clock on the filed
item, so the item cannot arrive either.

Law 1 held — nothing was silent — and the *return* promise did not. 1.19.0's own
docblock says "the place comes back, and its contents come back with it": true
at the coverage layer, false at the return layer. Nothing lost and nothing
returned, which is the filed backlog safe and invisible — the exact complaint
filing was built to end, one layer down.

**Two things were true that the record did not say, and both were found by
probing the fold rather than re-reading the notes.**

- **The return machinery was already complete.** Give a place a human review
  clock and `heldGroups` moves it from Later, to Coming up, to Ready now. That
  was verified against the fold before a line was written.
- **A date control already existed on a place.** `project` and `area` are not in
  `DEMAND_FREE_KINDS`, so a container passes the detail sheet's own `temporal`
  test, and the tree's rows have opened the sheet since 1.6.0.

So the defect was never "there is no control". It was **the path and the noun**:
to date a place you had to know it existed, open the tree, find it, open its
sheet, and set a date that would have been a `due`.

## Decision

**The control goes where the finding is already stated.** The receipt has said
*"Filed under Errands — no return date yet"* since 1.20.0. That sentence was
honest and unanswerable: information for the one person who could fix it, with
nothing to press. It now carries **"Bring it back on…"**, on the same bar,
offered only on the no-date branch.

**A REVIEW CLOCK, NEVER A DUE.** A place is not something you finish; you look
in it again. The noun matters beyond taste: `due` is a hard clock, and the only
reason a passed one does not raise a replan card on a place is that every
container sits in `NO_REPLAN_CARD` — an accident of kind, not a decision about
places, and not a thing to lean on. `review` is what this app already calls
"bring this back to you", and it is what `heldGroups` reads.

**Offered, never demanded.** It appears only where there is no date, it can be
ignored, and ignoring it changes nothing — the receipt already says what is
true. Filing without dating stays a complete act (law 6).

**One sentence for one fact.** The confirmation is `fileReceiptWords` over
`placeReturnDays`, the same pair the receipt itself uses, so the two can never
describe one date differently.

**No new event kind, no fold field, no migration.** The closed vocabulary is
unchanged for a sixth consecutive release. The whole return mechanism already
existed; nothing wrote the clock.

## Consequences

- **Answering the question must not cost the Undo.** The first version rebuilt
  the whole bar on success and took the Undo button with it, so dating a place
  silently removed the way to take the filing back — on the one surface whose
  entire job is that you can. The sentence is replaced in place and only the
  answered question is withdrawn. Caught by the walk timing out on a control
  that had been correct a line earlier.
- **The button's accessible name leads with its visible words.** It first read
  "Bring it back on…" while announcing "Set when ⟨place⟩ comes back to you" — a
  voice-control user saying what they can see would have hit nothing. SC 2.5.3,
  caught by the a11y gate on its first run, which is the second time that check
  has earned its keep this week.
- The date input carries `flex: 0 0 auto` even though the receipt bar is a
  wrapping ROW and has no column-axis trap. 1.24.1 cost a release to a date
  input whose basis changed axis; this is exactly that shape, and the belt is
  free.
- **Asserted on the HELD LIST, not on the log.** An event proves the write
  happened and says nothing about whether anybody sees the place again — and
  that gap *is* the defect. The smoke walk reads the group heading: "Later" →
  "Coming up".
- Planted red four ways: the clock written with the gate's own cure source
  (which turns the hollow-return test red directly), a `due` instead of a
  `review`, a malformed day, and the control withheld from the receipt.
- **The smoke block moved three times before it stopped littering.** It ate a
  card its neighbours routed by name, then perturbed a six-routes accounting,
  then assumed an empty inbox that only exists near the start of the walk. It
  now sits last, brings its own item, and cleans up with the app's own Undo.
  Every walk section should bring its own subject.

## What this does not do

When a dated place comes round, it arrives as itself — a row saying the place is
ready. **It does not yet show what is inside it.** That is the collision
catalogue's top-ranked proposal (entry 3, place-return-with-contents) and the
other half of this promise; it is deliberately left until the owner has used
dating, because the catalogue's own routing says to ask him after he has filed
rather than to guess at the shape.
