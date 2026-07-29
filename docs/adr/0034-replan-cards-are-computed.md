# ADR-0034 · Replan cards are computed, and only hard clocks raise them

**Status:** Accepted · **Date:** 2026-07-29

## Decision

Product law 3 ships as `src/replan.ts` — a pure projection
`replanAll(state, nowIso, zone)`. Three choices inside it are the decision:

1. **Computed, never stored.** No `replan.raised` event is ever written.
2. **Only `due` and `suspense` raise a card.** A passed `review` is ordinary
   operation.
3. **A live card is the item's only question.** The work surface excludes it; the
   held list keeps it and says it needs a new plan rather than "ready now".

## Why

### 1 · The fold cannot generate `replan.raised`, and does not need to

[ADR-0012](0012-no-past-bucket.md) says both of these things, one sentence apart:

> The fold generates `replan.raised` when a clock passes. It is not a stored
> state that must be swept — it is a **computed consequence** of a clock and a
> current time, so it cannot be missed and cannot go stale.

The two halves cannot both hold. `fold` is a pure function of the log; it has no
clock and takes no `now`. It **structurally cannot** notice that a date has
passed, because nothing tells it what time it is. Had it been given one, the
second half would fail instead: `state = fold(log)` would stop being a function
of the log alone, the same log would fold to different states at different
moments, and a snapshot cut yesterday would restore cards that were true
yesterday — the definition of stale.

The computed reading is therefore the one that survives, and it is also the one
ADR-0012 argues for. This record refines that bullet: **the card is derived at
render time from the clock and the current time.** Nothing is swept, nothing
expires, and there is no window in which a passed date has not yet been noticed.

`replan.resolved` is still a real event and is still written — the *decision* is
a fact about what the user chose, and it folds to `lastReplan`. What is not
stored is the *raising*, which is an observation about the current moment.
`replan.raised` stays in the vocabulary as a name for that observation; nothing
emits it.

### 2 · Soft clocks must not raise cards, or the app builds the shame surface itself

The gate writes a `review` cure clock for **every capture** (ADR-0008). If a
passed clock of any kind raised a card, then every thought captured a week ago
and not yet triaged would appear as something you failed at — one shame surface
per captured thought, manufactured by the mechanism meant to prevent it. That is
law 3's forbidden bucket arriving through ADR-0011's front door.

So the split is by what the clock *means*, not by what it costs to check. `due`
and `suspense` are dates a person agreed to. `review` is the app's own "bring
this back", and passing one is ordinary operation. `park` is held away from you
on purpose and is not a demand at all.

The same reasoning carves out **recurring work**. Once an upkeep has been done it
runs on the decay primitive, and law 5 says an upkeep is never a failure to have
not done yet. A plant that wanted watering on Tuesday comes round again as a
chip; it does not become a lapse.

### 3 · One item, one question

An item whose hard date went by qualifies for Next-up as `hard-date` — *"a real
date, and it is here"* — at the same moment the replan surface is asking *"should
this still happen, and by when?"*. Those are not two views of one item. They are
two different questions, and the easy one ("do it now") is the answer the passed
date has already ruled out; offering it is what produced the passed date.

So `workSurface` excludes every id with a live card, uncapped, and so does the
upkeep chip list — a second surface exempt from an exclusion is a hole in it, not
a second view (the lesson ADR-0030 already paid for once).

The **held list is deliberately not excluded**. Its totality is load-bearing: the
sum of its groups equals `heldNodes(state)`, which is what the coverage gauge
counts, so removing anything would make the number and the list disagree. It
carries the item under its own heading and prints `needs a new plan` — asked of
the *same* predicate that raises the card, so the two surfaces cannot describe
one item differently. That predicate is `raisesReplanCard`, which asks the whole
question (eligibility *and* a passed clock) rather than only about the clock:
asking half of it made the agreement a property of the order of the branches
above it, which is the kind of agreement that breaks silently the next time
someone reorders them.

The heading matters and was not there at first. Filed under "Ready now" the rows
read as ordinary work — the one answer the passed date has already ruled out —
directly beneath a surface asking something else about the same items. Every gate
was green; a screenshot found it.

### 4 · The cap is bounded re-entry, not a hiding place

The surface shows at most **three** (law 8), while the exclusion above is
uncapped. Those two facts together could hide work, so the view returns the
**true total** alongside the capped cards, and the held list still holds every
one of them. The cap bounds what re-entry *shows*; it never bounds what the app
*knows*, and it is never a lie by omission.

## Consequences

- `replan.raised` is a vocabulary entry with no emitter. Any future code that
  writes one is a defect against this record.
- **A resolution retires EVERY hard clock that had gone by, not the one the card
  names.** The card names the longest-passed clock because that is what the words
  describe; the decision has to clear all of them. The first implementation
  carried a single clock kind through, so a node with both a passed `due` and a
  passed `suspense` was re-raised the moment it was resolved — four of the five
  options were buttons that did nothing while announcing that they had. Two
  independent audits reproduced it; no gate caught it, because every test passed
  `'due'`. `ReplanCard.passedKinds` exists for this and for nothing else.
- **Altitude nodes never raise a card** (law 4, ADR-0013), and neither does a
  `resume-card`, which is the app's own artifact rather than a commitment anyone
  made. `waiting-for` *does*: a date going by on something someone else owes you
  is a real decision, and excluding it because Next-up excludes it would copy a
  rule without its reason — Next-up excludes it because *you* cannot act on it,
  which says nothing about whether the date matters. The two sets live in
  `src/kinds.ts` precisely so the difference has to be stated rather than assumed.
- **Adding a group is not a local change.** `ics.ts` selected calendar entries
  from an allowlist of group keys, so introducing `replan` silently dropped every
  passed hard date out of the `.ics` — the single thing a reminder is most for,
  gone, with all eight gates green. It is now an exclusion, so a new group
  defaults to being *included*: an allowlist that forgets a group loses someone's
  reminders without a word, while an exclusion that forgets one sends a reminder
  that should not have gone, and in an app whose promise is that nothing is lost
  the second is the failure to prefer.
- **Nothing here may claim the Menu is clockless.** `clock.cleared` is
  silent-risk, so the gate covers it and a node resolved to the Menu lands
  carrying a `review` cure. Law 6 and ADR-0014 govern clocks on demand-free
  *kinds*, not on Menu membership. "Nothing owed" is true and is what the surface
  says; "no clock" was not.
- The projection is pure and takes `now` and `zone` as arguments, like every
  other projection, so it is testable at a pinned non-UTC zone (V-13).
- Adding a clock kind means deciding whether it is hard or soft. The default is
  soft: a new clock does not raise cards unless it names a date a person agreed
  to.
- `lastReplan` is additive on `NodeState` and backfilled to `null` on restore, so
  a snapshot written before this record still loads (law: data is never lost to
  updates).

## What would overturn it

Evidence that people want the passed date treated as ordinary work — that the
decision step is friction rather than the help it is meant to be. That is a
finding about the *surface*, not about the storage: the computed-not-stored half
would still hold, because it follows from `fold` being pure.
