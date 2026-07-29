# ADR-0040 — The person lens shows what nobody has named

*2026-07-29 · Accepted · shipped 0.15.0*

## Context

`person.created`, `person.linked`, `waiting.opened` and `waiting.closed` have
been in `docs/event-vocabulary.md` from the first draft. Only `person.created`
was folded, and no surface could emit even that. So clarify's **"Waiting for"**
route — *"someone else owes you this"* — changed a node's kind and **never asked
who**.

The question this exists for is not filing. It is *"what am I waiting on Sam
for"*, asked out loud, in a corridor, with no time to look anything up. Work
sorted by project cannot answer it. This is the same nodes, sliced the way the
question arrives.

## Decision

### Unattributed waiting-fors are shown, not hidden

This is the load-bearing decision and it is the opposite of the obvious one.

The route that creates a waiting-for is **a single tap**, and it stays that way —
asking who at that moment would make it three, on the surface whose entire
promise is speed. So **most of what you are owed has no name on it**, and a lens
that listed only the named ones would be quietly incomplete.

Quietly incomplete is worse than wrong. A list that is obviously missing things
gets checked; a list that looks complete gets trusted. So `waitingOnAnyone`
returns every open waiting-for and the row says *"Nobody named yet"* rather than
inventing a name or dropping out of sight.

### A waiting-for is found by the kind AND by the relation

`isOpenWaiting` checks `kind === 'waiting-for'`; `personView` also accepts a
`waiting-on` link. These are two ways of saying the same thing, and reading only
one would be right about half the time — which is the failure mode above again.

### Arriving is not finishing

`waiting.closed` takes a thing off what you are owed and **does not mark it
done**. The signed form landing on your desk is the moment the work becomes
possible, not the moment it is over; marking it done would file away the very
item you were waiting to be able to act on. The node keeps its clock, because it
is still yours (law 1).

### One human is one node, and a person is not work

Names are matched case-insensitively before a second node is minted — a duplicate
splits what you are owed across two rows for ever.

`person` joins `DEMAND_FREE_KINDS`, satisfying law 1 by **clause (a), on a
surface**, rather than by carrying a clock. The exemption is *earned*: until this
release there was no person surface, so claiming it then would have been law 1
defined away rather than met. Nothing may join that list on the argument that it
"isn't really work" — only on the argument that a surface renders it, and that
the surface ships.

### Duration, never a verdict

*"With Sam for three weeks"* is a fact about a date. There is no "chased three
times", no colour that means "they have had this a while", no threshold at which
anything changes appearance. **This app keeps score on nobody's behalf, least of
all on someone else's** — law 5 applied to a third party, which is the one place
it would be easiest to let slip.

## Consequences

- **Links fold additively and idempotently, not LWW.** Two devices each naming a
  different person on one node must end with both — the person who owes you a
  thing is rarely the person who asked for it — and saying the same thing twice
  must add nothing. Last-writer-wins on a list would silently drop one device's
  answer.
- **`people` is a mutable array on a structural field**, so it needs
  copy-on-clone, copy-on-store and default-on-deserialise. All three, per the
  hub's LESSONS entry; `feeds` earned that rule the hard way.
- **Losing the name does not lose the work.** Trashing a person removes their
  lens; every open waiting-for stays exactly where it was and simply stops
  claiming who it is with.
- **The test generator now single-sources `DEMAND_FREE_KINDS`.** It had the pair
  `aspiration`/`pebble` hand-copied, so adding `person` made it emit logs the
  gate refuses — and a property test that cannot run is a property nobody is
  checking. Two copies of one rule always drift.
