# ADR-0030 · Work mode — one primitive, a fixed precedence, and a skip that records nothing

**Status:** Accepted · **Date:** 2026-07-29

## Decision

Phase 3 (build-plan items 17–21) is three pure projections and one surface.

**1 · Pressure is `(elapsed − interval) / comfort_window`,** computed at read
time, never stored (`src/pressure.ts`, implementing [ADR-0010](0010-decay-primitive.md)):

```
  < 0   still comfortable
 === 0   ready again
  > 0   rising insistence, measured in comfort windows past ready
```

Unbounded above, so nothing clamps into a worst state and there is no cliff to
render. `null` — not `0` — for an item with no cadence, because asking for a
number there would invent one. **Never done is pressure `0`: ready, not
infinitely late.** Days are counted as *calendar* days in the reader's zone
([V-13](../verifications.md)), so "every 7 days" means seven of the user's days
and a DST changeover adds no pressure.

**2 · Next-up is a fixed precedence, not a tunable score** (`src/nextup.ts`):

- **1**
  - Tier: Hard landscape (`due`/`suspense` arrived)
  - Why it sits there: An appointment does not negotiate with a plant that wants watering
- **2**
  - Tier: Resume cards
  - Why it sits there: Picking up a thread beats a cold start, and cold starts are the whole problem
- **3**
  - Tier: Pressure, highest first
  - Why it sits there: The decay primitive
- **4**
  - Tier: Anything else whose clock arrived
  - Why it sits there: It said it would come back

"Whose clock arrived" means **any** demanding clock (`park` excluded), not a
favourite one. Reading `due ?? start ?? suspense ?? review` was a precedence by
*kind* wearing the name "soonest": an item gate-clocked for review today and then
given a due date next month showed only its `due`, read as not-arrived, and
**vanished from the work surface entirely** while the gauge still read 0 silent.
Work disappearing is the worst thing this app can do.

The order is **total** (ties broken by id), so the same state always produces the
same list; a surface that reshuffles between renders cannot be trusted to have
chosen.

**Correction (0.5.1).** This record originally claimed ranking "already knows
where resume cards go… rather than needing this file reopened". That was false
and the audit proved it: `resume.card.spent` and `resume.card.expired` were not
folded at all, so no card could ever retire; a card with no clock was offered for
ever; one parked until Christmas led the list in July; and a card carrying a real
date was misfiled below tier 1 purely because its branch ran first. All four are
fixed, and the retirement latch is folded — but the honest statement is that the
tier is *reserved and tested*, not that the feature was free.

**3 · "Not this" records nothing.** No event, no field, no persistence — the
cycle index lives in memory and dies with the page.

**4 · One thing is offered, with at most five behind it** (`BEHIND_CAP = 5`), and
the total is stated in words. Upkeep chips are separate, and the display
threshold is a *parameter of the projection*, not a stored value.

**5 · The coverage gauge is a button.** Its number is a claim; tapping it opens
the itemised list — every held item and when it returns — that backs the claim.
Both read **one** definition (`heldNodes`): the gauge previously counted trashed
and merged nodes the list omitted, so it said "3 held" over a list of 2. A claim
the user is invited to open must check out, or it is worse than no claim.

## Why

**A skip that recorded anything would make the surface a scorekeeper.** This is
the one decision here that is really a product decision rather than an
engineering one. The moment declining a suggestion writes a row, the app is
keeping a record of what you did not do, and a person who has to justify a skip
stops opening the app — which is the failure this whole phase exists to prevent.
Cycling is an index moving. That is all it may ever be.

**Precedence, not weights.** A scoring function that blends urgency, pressure and
recency into one number is tunable, and therefore permanently untuned: every
complaint becomes a coefficient argument, and the user can never predict what
they will be shown. A fixed precedence is explainable in one sentence per tier,
and the surface can *say* which tier fired — which is also what makes the "why"
line honest rather than decorative.

**Done-and-not-recurring is finished — and this needed catching.** The gate
re-clocks `done.marked` to keep the node non-silent (law 1 does not exempt
completed work), so "has a clock that has arrived" is *not* sufficient reason to
offer something. Without an explicit check, a finished one-off keeps its cure
clock and is offered again for ever. The smoke walk caught it; an Upkeep is the
opposite case, where `lastDone` is the primitive's input and returning is the
entire point.

**Nothing that belongs to another surface is offered as work.** An unrouted
capture belongs to triage — offering it here asks the same question twice in a
surface whose promise is that it has already decided. A waiting-for is someone
else's move. A Menu item is a surface, not a demand (law 1 clause c). The
demand-free kinds refuse clocks by law and must not be dressed as demands here
either.

## Consequences

- `test/nextup.test.ts` and `test/time.test.ts` hold the properties: pressure is
  continuous, signed and unbounded with no stored threshold; the comfort window
  is per item; never-done is ready; the precedence cannot be jumped by any amount
  of pressure; a completed one-off leaves the queue while a completed Upkeep
  returns; cycling leaves state **byte-identical**; the list caps at five; the
  order is total; the display threshold changes what is shown without touching
  storage; and every zone case is pinned to a **non-UTC** zone.
- `tools/smoke.mjs` walks it in the built app and counts the log before and after
  a skip — the "records nothing" claim is checked against IndexedDB, not asserted.
  It also greps the rendered page for shame vocabulary.
- `tools/a11y.mjs` audits Next-up and the opened coverage list in both themes,
  including both buttons' focus rings.
- **`[hidden] { display: none !important }` is now a global rule.** The coverage
  list set `display: flex`, which silently defeats the UA's `[hidden]`, and it
  rendered fully expanded while `aria-expanded` said `false`. Caught by the smoke
  walk. The structural fix means no future `display` rule can reintroduce it.

## What would overturn it

Evidence from real use that the precedence produces a bad first suggestion often
enough to matter — in which case the fix is a **new tier or a changed order**,
argued explicitly, never a blended score. And if "Not this" ever needs to
influence what is shown next, that is a change to product law territory and
Noah's call, not a session's: the honest version would be an in-memory
de-prioritisation for the current session only, still writing nothing.
