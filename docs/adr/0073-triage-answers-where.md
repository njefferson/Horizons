# ADR-0073 · Triage answers WHERE, and makes the place

**Status:** Accepted · **Date:** 2026-08-04

## Context

Noah, on what actually ends a working day and resets the dogfood gate:

> *"I have a huge backlog, and I imported it to work through and put in the right
> places, but keep finding that the places were not there, yet. That's the
> problem. I'd see the task leave and not know where/if it went, and had no
> feeling that I was seeing the right things."*

**Every route triage had answers WHEN.** `routeEvents` takes no parent at all:
`do-now`, `next-action` and `waiting-for` set a clock, `someday` and `reference`
put the node on the Menu, `trash` removes it. So a 1,173-item import could be
sorted by urgency from end to end and never once be *filed*, and the only thing
the app could say afterwards was `Sent to Next action` — a category, not
somewhere a person can go and look.

**And the places did not exist.** His first diagnostic reported **area 0, goal 0,
outcome 0, waiting-for 0** against 1,405 actions. An earlier session — mine —
read that as an observation about which nouns were in use, and built a measure of
how much was *asking* (`pressureBands`, 1.18.3) on the theory that the surface
opened with too much. That was wrong, and the data had been sitting in front of
it. The containers were empty because there was no way to fill them from the
place the work happens.

**Parenting did exist** — in the detail sheet, one item at a time, behind opening
a sheet per item. That is precisely the climb law 4 forbids: *levels push down;
the user never climbs. The runway is the only workspace.*

## Decision

**Triage gains a seventh route, `filed`, and a place picker that creates the
place when it is not there.**

1. **`filed` is a `ClarifyRoute`**, additive to a closed vocabulary (law 9 —
   migrations additive-only; every log already written stays readable). It is the
   only route that answers *where*, and the only one whose coverage comes from
   clause (d) rather than a clock of its own.
2. **The place is made from triage**, not by going somewhere to make it.
   `fileUnderNewEvents` reuses `createParentEvents` — the same lawful create the
   detail sheet has always used — so there is one definition of how a place is
   born rather than two that drift.
3. **One commit, not two.** Create, parent and route land in the same transaction
   the gate sees. Two commits would leave a window holding a brand-new empty
   place with nothing in it, and would give the reader two undos for one decision.
4. **Filing clears the item's own clocks.** All of them, not just the demand
   kinds — see below. The place carries the clock; the item rides it.
5. **Undo unparents.** `undoRouteEvents` had a `default` branch emitting only
   `clarify.reopened`, so a filed item would have returned to the inbox *still
   sitting in the place it was just taken out of*. An Undo that leaves the thing
   where it was is a lie.

## Law 1 holds without special pleading

A brand-new place has no clock, so it is newly silent — and the gate **cures** it
with one (`cureFor`) in the same transaction. The item is then covered by clause
(d), riding its parent's clock.

That is the honest arrangement rather than a loophole: **the place comes back,
and its contents come back with it.** It is what makes a filed thing findable
again instead of merely gone, which is the half of his complaint that "Sent to
Next action" could never answer.

## The clock detail that would have made filing useless

The first version cleared `demandClocksOf` — `due`, `start`, `suspense`, `park` —
copying the someday/reference branch. It left the item with **one clock still
running**, and the test caught it.

The gate's capture cure sets a **`review`** clock, which `demandClocksOf`
deliberately excludes. So a filed item would have ridden *both* its own same-day
review and the place's: filed, and still pestering you tomorrow. Exactly the
experience the feature exists to end. `clocksOf` was added for this and filing
uses it. **Filing says where; the place's clock says when. One answer each.**

## Consequences

- **`pressureBands` (1.18.3) stays but is demoted.** It is honest and costs
  nothing, and it is not the instrument that explains his day. NOTES records the
  correction in the three places the wrong inference was written down.
- The picker joins the a11y gate's surface list **in the same commit** (hub
  LESSONS §28), and that gate immediately failed the new text field at 185x21
  against the 44px floor — which is the rule working rather than a nuisance.
- Place buttons carry `aria-label` leading with the visible name, so SC 2.5.3 is
  satisfied while §4's disambiguation is kept; the label-in-name gate added in
  1.18.4 covers them.
- **Not done:** nothing yet shows a place's *contents* on the runway when its
  review comes round. Filing puts things somewhere and the place returns; what it
  returns *with* is the next question, and it is the one to ask Noah about after
  he has used this.
