# ADR-0060 · A few things you could pick up

**Status:** Accepted · **Date:** 2026-08-02

## Context

The direction asked for: the app queues towards offering what a person wants to
choose to do, rather than listing things waiting to be done — more a menu than a
task list.

Next up has offered exactly one thing since build-plan items 18–19, and the
reason is recorded: **choice overload** (thesis §4). That finding is real and it
is not being overturned. But two things sat against the single card:

- **The surface still read as a queue.** Beneath the one card sat a capped list
  of five more and the line *"8 things are asking. This one first."* — a count
  of pending work on the landing surface, which is the nearest thing this app
  has to the backlog headline **law 8** names outright ("the greeting after a
  lapse is bounded … never the backlog").
- **One app-chosen card is a recommendation, not a menu.** The Menu itself
  exists so interest has a legitimate home that owes nothing (§9, law 6), and
  it appeared nowhere on the surface a person actually opens.

## Decision

### The finding's own wording is the way through

The thesis states choice overload carefully, and the qualification is
load-bearing:

> "The effect is context-dependent and its size has been contested — but the
> **direction** holds where options are **similar** and stakes are
> **ambiguous**."

So the finding does not condemn a small set of options that are *deliberately
unalike*. It condemns twenty rows of comparable pending work. The distinction is
not how many things are shown — it is whether choosing requires a **comparison**.
Two things that differ in kind ("this has a real date today" / "this has been
quiet for a month") are chosen between by preference. Twenty next-actions are
chosen between by weighing, which is what nobody stuck at activation can do.

### At most one offer per reason

`NextUpReason` already partitions the queue by *why* something is being offered:
`hard-date`, `resume`, `pressure`, `ready`. Those are four genuinely different
sentences, so the rule is simply **at most one item per reason**, taken in the
existing rank order. Nothing is scored and nothing is balanced — the classes do
the work, and the set is unalike by construction rather than by taste.

`OFFER_CAP` is **two**. A preference survives two options in a way it does not
survive five.

**The precedence is untouched.** `work[0]` is still the head of `nextUpQueue`, so
a real date arriving today still leads and the app still answers "if you only do
one thing" exactly as before.

### One wish rides along, and cannot become work

The Menu is demand-free **by law** (law 6: *"acting on one is a deliberate
promotion, never an obligation that accrued"*). Offering a wish beside work must
not quietly make it work, and the guard is **structural rather than a matter of
copy**: `offerNow` returns the wish as a bare node with no reason, no pressure
and no demand clock, so there is nothing for a surface to render as a demand. It
carries no `Done` — the row is a door, and acting on a wish still goes through
the existing promote verb on its sheet.

The row says *"something you wanted"* in words, with a rule and an italic as
redundant signals on top. Never hue alone (B-02).

### The offer states no number

`"8 things are asking. This one first."` is replaced by `"A few things you could
pick up."` The honest totals already have a home three lines up the same page:
the coverage gauge states what is held, what is ready now, and that nothing is
silent. Saying it twice, the second time as a demand, buys nothing — and the
second time is the one that reads as a backlog.

## Consequences

- `src/offer.ts` is a new pure projection; `nextup.ts` is untouched, so the
  ranking and every test over it stand.
- The list beneath the head is no longer a queue tail. It holds the rest of the
  offer: one more piece of work of a different kind, then the wish.
- **The smoke walk's anti-theatre check moved to the gauge.** It used to prove a
  completion by watching the offer's count fall; with no count it reads
  `ready now` from the gauge instead — and deliberately not `held`, because a
  completed thing is still held (law 1 does not exempt finished work) and that
  number must not move.
- "Not this" still records nothing, and now rotates both halves of the offer.

## What would overturn this

- **Evidence from use that two offers is one too many** — that the second is
  never taken and its presence makes the first harder to start. The answer would
  be `OFFER_CAP = 1` with the wish kept, not a return to the count and the tail.
- **Evidence that the wish reads as a demand** despite carrying none. The answer
  would be moving it out of the offer entirely rather than softening the words,
  because if the placement implies obligation then no wording fixes it.
- **Not by "the count was useful."** It was, and the gauge says it better —
  once, in the place that exists to say it.
- **Not by adding a third and fourth class to the set.** Four unalike options is
  a comparison again; the cap is the point.
