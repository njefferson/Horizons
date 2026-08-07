# ADR-0081 — An item may wait for another item to be finished, and that is law 1's fifth clause

*2026-08-07 · Accepted · shipped 1.30.0*

## Context

Until now every anchor in this app was a **date**. A due date, a start date, a
park, a review, a rhythm — five clocks, all of them the same kind of thing: a
moment on a calendar, which you must be looking at a clock to notice.

That is the least retrievable anchor available. Noticing a date requires holding
the intention and checking the time at the same instant, which is exactly the
conjunction this audience cannot rely on. An **event** anchor — *when that
happens, do this* — fires on noticing something already in front of you, and
costs no self-initiation at all.

The gap was structural rather than cosmetic. **Within a routine, completing each
step IS the cue for the next.** Strip the sealant, let the frame dry, re-seal the
frame: there are no meaningful dates in that sequence, and inventing three
guesses so the app has somewhere to put them is worse than useless — each guessed
date is a small false promise, and a passed one produces a replan card about a
thing that was never late.

So an order of doing things had nowhere to live. It could be written into a note,
where nothing reads it; or into three invented dates, where the app then
misreports them; or nowhere, in which case the three steps arrive as three
unrelated cards, in creation order, and the person has to remember the order
themselves — which is the work the app exists to absorb.

### Why the existing dependency edge is not this

`dependency.declared { feeds }` already exists and looks close enough to be
confusing. It is not the same relation:

- It lives on the **upstream** node pointing **forward**, because it answers *"if
  I do not do this, what breaks?"*
- It exists to do **date arithmetic** — latest start, buffer — and returns
  silence when a term is missing.
- **Feeding something does not mean the other thing cannot be worked on.** Two
  items can feed each other's outcome and be worked on in either order.

Reusing it would have meant changing what existing data means, in every store
already carrying those edges. That is the change no append-only log can take
back.

## Decision

**A node may carry one `after` — the node whose completion is its cue.** Two new
events, `after.set { after }` and `after.cleared`, and one new field.

**It lives on the dependent, pointing back**, which is the direction the
readiness question is asked in: you are looking at the thing that is stuck and
asking what it is waiting for.

**It is single-valued.** "What is this waiting for" with two answers is not a
chain, it is a join, and a join is where a chain quietly stops moving. One
antecedent, for the same reason `opr` is one person.

**It confers law 1 coverage — the fifth clause.** Every node is (a) on a
surface, (b) under a clock, (c) on the Menu, (d) parented to something under a
clock, or (e) **waiting for something that will itself be shown to you**.

**Setting one mints no date and creates no demand.** It is the opposite of a
demand: it takes a thing out of the way until its moment.

## The conditions on clause (e), and why each one is load-bearing

Clause (e) makes a promise — *finishing that will put this in front of you* — and
each condition below is a way that promise could be false. A coverage clause that
can be satisfied by something nothing will ever surface is not coverage; it is
the "clock nobody reads" defect wearing a different shape, and removing that
defect is what the whole of the preceding stage was for.

The antecedent must:

- **exist** — a dangling id promises nothing;
- **not be trashed or merged away** — a thing you ended cannot be finished, so
  the cue can never fire;
- **not already be done** — the cue has fired; the dependent needs a clock of its
  own now, not a permanent claim on a past event;
- **not itself be silent** — a chain is only as good as its first link.

The last one is the one worth arguing. Without it, a chain hanging off a silent
node would report as fully covered while nothing in the app would ever surface
any of it, and the gauge would certify it. That is not a smaller guarantee; it is
a false one, and this trust is dichotomous — a guarantee with an exception does
not degrade, it collapses.

## What the write gate refuses

The same list, checked when the anchor is written, so coverage is never false on
arrival: no self-anchor, no missing or dead antecedent, no antecedent that is
already done, no **demand-free kind** as antecedent — a person, a named period, a
wish on the Menu is never "finished", so waiting for one is waiting for an event
that cannot occur — and **no loop, at any depth**. The loop walk is forward from
the proposed antecedent and guards itself, because A → B → C → A is the shape
somebody building a routine out of order writes, and a one-step check passes it.

`isSilent` carries its own recursion guard as well. The gate refuses to write a
loop; the fold has to be a total function over logs this gate never saw — an
import, a shard from an older build — so both halves must hold or one bad shard
freezes the app on open.

## What happens at the edges

**The antecedent is completed.** The dependent loses clause (e) in the same
transaction, and the gate cures it with the same-day clock a lost parent gets. It
is then offered with reason `unblocked`, ranked second — above a resume card,
below only a real date that has already arrived. The placement is the argument:
the person has just finished the antecedent and is standing in front of the very
next thing, which is the cheapest moment this app will ever get; a promise to
somebody else still outranks it, and the chain will still be there in an hour.

**The antecedent is let go.** Same mechanism, and this is the case that matters
most: trashing the first step of a routine must not silently take the rest of it
with it. The gate's dirty set is walked through an anchor index, transitively, so
a three-step chain loses its whole tail when the head is trashed and **every step
is cured**, not just the one pointing directly at the casualty.

**A future park still wins.** "Not until the 12th" is a decision the person made
about this very item, and an antecedent finishing early does not overturn it.

**A merge carries it both ways.** The survivor takes the source's antecedent into
a silence; everything that waited on the source is re-pointed at the survivor.
Without the reverse carry, folding one step of a routine would make every later
step silent and cure it into a dateless card — an act meant to preserve work
destroying the one structure that says what order it goes in. Unlike `feeds`, the
reverse edge is overwritten rather than added, because an `after` is
single-valued; a later split-out therefore leaves the dependent pointing at the
survivor, which is a real but smaller loss than a chain that breaks on every
fold.

## Consequences

- The closed vocabulary gains two nouns. That is the cost, and it is paid because
  this is the only anchor in the app that is not a clock — there was no existing
  noun it could ride, the way the situation field rides `node.field.set`.
- Law 1 has five clauses instead of four, and one of them asks about another
  node's coverage rather than about something it can see directly. That is new,
  and it is why both the gate and the fold carry cycle guards.
- The equivalence property's generator produces both new kinds, so the gate and
  its independent reference implementation are compared on every refusal and
  every cure across the full seed set. That is what makes the refusal list above
  a claim rather than a comment.

## What this must never become

**Not a dependency graph with opinions.** Nothing computes a critical path,
nothing estimates when the chain will finish, nothing reports how long a step sat
waiting. A chain is a record of what the person said has to happen first, and
reading a schedule out of it would be the app inferring from logs — which is
precisely the measure that does not track what matters.

**Not required.** A step with no anchor is an ordinary item, and the vast
majority of items will never have one.

**Not a progress display.** "2 of 3 done" over a chain is a completion percentage
with a hat on, and the aggregation rule forbids it: present cardinalities to
navigate, never a window of past events reduced to a rate, ratio, count or trend.
