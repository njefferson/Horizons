# ADR-0074 — An arrangement is a field on an upkeep, and its clock measures confirmation

*2026-08-05 · Accepted · shipped 1.21.0*

## Context

A whole class of what people carry is not a task and never becomes one. It is an
arrangement already made: a supply that reorders itself, a service on a
schedule, a renewal, a subscription, a delivery. The work happened once, at
setup. After that it is meant to run on its own — and mostly it does.

**Its failure mode is silence.** A task that does not get done sits there
looking undone; the surface can show it. An arrangement that stops produces
*nothing* — no delivery, no reminder, no error, no message from whoever was
running it. The first signal is running out.

For this app's readers that is the worst possible signal. `docs/nd-collisions.md`
entry 4: the future carries no weight until it becomes now. An arrangement that
announces itself only by failing is one that goes from invisible to emergency in
a single step, with no gradient in between — which is precisely the now/not-now
cliff the decay primitive exists to abolish (ADR-0010).

The app could already hold *"do this every N days"*. It could not hold *"this is
supposed to be happening without me; when did I last confirm it still is?"*

## Decision

**An arrangement is a FIELD on an upkeep node, not a new event kind.**
`node.field.set` with `field: 'arrangement'`, exactly as ADR-0042 did for the
comms sweep, and for the identical reason: it decays, it completes, it renders
as a card, it can be turned off. Every projection in this app already knows how
to handle all four. A new kind would mean teaching each of them about something
they can already hold, and would open the closed vocabulary
(`docs/event-vocabulary.md`) for no gain.

**Its clock measures CONFIRMATION, not completion.** `lastDone` on an ordinary
upkeep means *last time I did this*. On an arrangement it means *last time I
confirmed this is still arranged*. Same field, same primitive, same
`done.marked` to satisfy it. The entire difference lives in the words, because
the entire difference is what is being asked.

**A second, orthogonal field — `arrangement-depends`** — marks the arrangements
whose continuation depends on somebody else: an approval nobody chased, a lapsed
authorisation, a supplier who will not write to say they have stopped. This is
not a category for its own sake. It changes what confirming *means*, because it
cannot be done from here, and the words say so.

**Turning a marker off writes `false` rather than removing it.** The vocabulary
has only `node.field.set`, which is the right constraint: switching something
off is a decision worth being able to see in the log, not an erasure.

## Consequences

**The list keeps the healthy ones.** `arrangementCards` includes arrangements
whose pressure is negative — not due yet. The comms chip drops those, correctly,
because a chip appearing when nothing is due is an interruption. But a list of
what you are trusting to run without you is worthless if it hides everything
currently fine: a surface that only ever shows problems is a red wall by
omission, and this app refuses those in every other place already.

**It never invents a cadence.** Confirming an arrangement whose rhythm nobody
set writes the completion and no clock. An arrangement the app has no rhythm for
is one it should be quiet about; guessing an interval would manufacture a demand
out of nothing, which is what law 5 and demand avoidance (entry 8) both refuse.
An arrangement with no valid cadence therefore produces a null pressure and is
left off the surface entirely rather than shouting — ADR-0010's rule that
silence beats a fabricated zero.

**The words never reproach.** "Still arranged?" and never "you haven't checked
this since Tuesday", which is the same sentence with a finger pointed. Never
having confirmed is stated as the plain fact it is: a new arrangement has not
lapsed, it has simply never been checked, and those are different things.

**Naming.** The concept was built as "standing arrangement" and renamed before
shipping: `standingDecline` in `src/requests.ts` already means *a decline that
still stands*, and two senses of "standing" in one codebase is a trap for
whoever reads it next.

## What this does not do

It does not detect that an arrangement has stopped — nothing local can. It holds
the question and the gradient, and the person answers it. Automating the answer
would require reaching into a pharmacy, a supplier or a bank, which this app
does not do and does not want to (ADR-0036, and the whole network posture).
