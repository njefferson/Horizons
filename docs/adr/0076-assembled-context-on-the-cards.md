# ADR-0076 — Assembled context belongs on the card where the decision is made

*2026-08-05 · Accepted · shipped 1.23.0*

## Context

ADR-0012 named the idea and only half of it was ever delivered: **the assembled
context**. *"That date went by"* is a fact anyone can see. *"It fed the thing you
promised for the 14th, and there are four days left"* is the part that costs
real effort to reconstruct, and it is exactly the part somebody with temporal
myopia cannot do on demand.

`docs/nd-collisions.md` — the collision catalogue — asks for the same thing
twice, in two different places, for two different reasons:

- **Entry 17, working-memory loss between capture and action.** The context that
  made a captured fragment meaningful drops within hours. Capture is right to
  demand nothing at write time; the cost is that the fragment arrives at triage
  as a stranger's note and gets routed blind, trashed, or kept out of a vague
  guilt that it might have mattered.
- **Entry 4, time blindness.** The future carries no weight until it becomes
  now. A commitment three weeks out is weightless, then an emergency, with
  nothing in between.

Both are answered by the same move: state the fact the person cannot
reconstruct, on the card where they are deciding, computed rather than asked
for. That is one release, not two.

## Decision

**Two lines, on the two cards where work gets chosen.**

- **The triage card says when it was written.** *"Written yesterday evening."*
- **The offer card says what it holds up.** *"It feeds 'Roster' — start it
  within 4 days."*

**Neither is a new event.** Both are projections. `docs/event-vocabulary.md` is
unchanged for the third consecutive release.

**The approach sentence has exactly one writer.** `dependencyWords` has produced
it since build-plan item 27 and reached the detail sheet and the replan card.
`nextup.ts` calls the same function through one helper, `approachOf`, beside
`lineageOf` — so no push site can ship an item whose approach was computed a
different way. Three surfaces, one sentence.

**It is silent whenever a term is missing**, which is the ordinary case. It
needs a declared downstream *and* a lead estimate, both set on the detail sheet.
Without them the honest answer to "when must I start?" is nothing at all;
deriving a number from a guess is precisely what ADR-0010 refuses. This was
watched go red on a planted default lead of one day.

**The capture line states WHEN and never how long ago.** No age, no elapsed
count, no "still". "3 weeks old" and "you wrote this in June" are the same fact
wearing an accusation, and this line lands on the surface where somebody is
already working through a backlog. Entry 15: a machine's neutral reminder is
read with the same raw nerve, so it is given nothing to read. Within the week it
names the weekday and the part of day — a moment somebody can stand inside; past
a week it becomes a date, because a weekday name no longer locates anything.

## Where the capture time is read from, and why not the fold

**From the log, through the `node` index declared in Dexie v1.** One indexed
lookup, no schema change.

The obvious design was a `capturedAt` field on `NodeState`, and inspection
killed it. `snapshot.ts` serialises nodes whole, so every node already inside a
snapshot restores without the new field — and the fold never revisits a node's
genesis event, so it never regains one. The nodes that would be permanently
blank are exactly the old backlog this feature exists to describe. A field that
works only for things captured after the upgrade is worse than no field, because
it looks like it works.

Genesis means the EARLIEST event in `compareEvents` order, not the first row
stored. A shard folded in from another device delivers events older than ones
already present, so insertion order and time order are different things — and
getting that wrong would report the moment another device synced as the moment
somebody wrote it down.

## It never blocks

The triage card renders from state, synchronously, exactly as before. The
context line fills in afterwards or not at all, and a lookup that resolves after
the card has moved on is discarded by comparing the node id — attaching one
item's history to another item's title is worse than saying nothing.

Nothing on the path to a first capture waits on a store read (ADR-0001), and a
store that is slow or broken costs a line of grey text rather than the item
somebody was deciding about. A planted synchronous binding was watched fail.

## Consequences

- No new colour pair. `#nextup-approach` reuses `.nextup-why`, which the
  contrast registry already measures, following `#nextup-place`'s precedent
  exactly; `#triage-where` reuses `.sort-where` and is registered in the
  `clarify` state in the same commit (hub LESSONS §28).
- `#triage-where` sits OUTSIDE the triage card button. Inside, it would join the
  button's accessible name, so every card would announce its own history before
  its title.
- The a11y walk waits for the line to arrive rather than measuring an element
  that is correctly still hidden — a registry entry matching nothing visible
  fails by design, and that failure would report a race rather than a defect
  (hub LESSONS §61).
- The approach line is rendered on the offer HEAD only. The behind-rows already
  carry a why and a place; a third line each turns the rest-of-offer from a
  glance into a paragraph.
- Both lines are reached in the walks through the app's own controls. The offer
  is cycled with "Not this", which records nothing, and the walk fails if the
  item never comes up — a check that quietly passes when it found nothing is not
  a check.

## What this release deliberately does not build

The catalogue's fourth-ranked proposal — the pocket offer for waiting mode,
*"About an hour before Dentist"* — needs the gap between now and an appointment.
ADR-0075 established that this app records days, not times of day. It is
blocked, as is entry 7's *"Dentist at 3"* line on the focus surface. Whether the
clock model should gain a time of day is a capability of its own and is not
smuggled in under a sentence.
