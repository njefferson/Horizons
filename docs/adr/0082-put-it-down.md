# ADR-0082 — Put it down: the exit that is neither done nor deleted

*2026-08-07 · Accepted · shipped 1.32.0*

## Context

Law 1 says nothing goes quiet. That guarantee is the product, and it has a cost
nobody had priced: **everything you are holding comes back, for ever, until you
finish it or bin it.**

For most work that is exactly right. For work that mattered once and no longer
does, every exit the app offered was wrong:

- **Done** is a lie. It writes a completion into an append-only log for something
  that was never completed, and the log is the one place in this app that must
  stay true.
- **Let it go** — trashing — reads as destroying something you cared about. It
  goes into a browsable list called "Things you let go", which is a graveyard you
  can visit. People will not do it.
- **To the Menu** turns work into a wish, which is a different claim and often a
  false one: "I would like to do this someday" is not what "I have stopped
  carrying this" means.
- **Park** is a promise to come back on a date, which is the thing being declined.

So it gets carried. And the reset people actually reach for, when carrying it
becomes unbearable, is **deleting the app and reinstalling** — destroying
everything to avoid looking at some of it. That is the failure this ADR exists to
prevent, and it is the most expensive one in the product: it is the only action a
user can take that defeats every other guarantee at once.

## Decision

**A node may be PUT DOWN.** Two events, `node.released { at }` and
`node.reclaimed`, and one field, `released: ISODateTime | null`.

**It is exempt from law 1, exactly as a trashed node is**, and for the same
stated reason: law 1 promises nothing goes quiet *by accident*, and an explicit
decision is not an accident.

**`heldNodes` excludes it, and that single predicate is the whole mechanism.**
Every surface, every range, the gauge, the todo list, the offer, triage, review,
replan and the sort picker all read through it. One exclusion removed the item
from all of them, which is why this was a small change to make correct and would
have been an enormous one to make by hand at each site.

### What it must not become

Each of these is a way the verb would fail, and each is enforced rather than
intended:

- **No browsable collection.** A place to look at everything you have put down is
  another pile, and the regret such a list accumulates is precisely what made
  discarding feel expensive in the first place. `releasedNodes` exists so the
  complement of `heldNodes` is visible in code and so search can reach one; no
  surface renders it whole, and none may.
- **No count, anywhere.** "14 things put down" is a number about the person, and
  like every total in this app it only rises.
- **No required reason.** There is nowhere to put one — the payload carries `at`
  and nothing else, and a test pins that. Being made to justify stopping is the
  friction that sends people back to carrying a thing indefinitely.
- **Reversible, and findable by name.** `searchReleased` answers a query you
  typed about a thing you remembered, and never volunteers. **That
  reversibility is the mechanism, not a courtesy**: an exit people are afraid to
  use is not an exit, and knowing nothing was destroyed is what makes the act
  cheap enough to perform.

### Why search, and only search

The two requirements pull against each other: nothing may be lost, and there may
be no collection. Search resolves them. It is the one surface that only ever
answers a question you asked — it shows nothing on a blank query, it volunteers
nothing, and it cannot be browsed. So a put-down thing is unreachable by
wandering and one query away by name.

The result is appended below what you are holding and labelled, never mixed in.
The ordinary summary keeps saying "Nothing you are holding matches that", which
stays exactly true; the put-down line says how many matched **this query** and
never how many exist.

## One predicate, not a diff

Held-ness was written by hand at forty-odd sites as
`!n.trashed && !n.mergedInto`. Adding a third end state meant every one of them
was a place the new state had to be remembered.

This repo has a record of what that costs. `heldGroups` drifted from the gauge
twice, because each release added a kind to a hand-written list and neither
revisited the other. The merge carry lost `feeds` entirely, because three
releases added fields and none visited that file. Both were fixed by making the
thing total rather than remembered.

So `isHeld` / `isGone` live in `fold.ts` and every site that means "is this still
in your hands" now calls one of them. The sites that deliberately do **not** are
named in the docblock, because each asks a different question: `trashedNodes` is
about the trash specifically, the merge-chain walk follows `mergedInto` alone,
and `isSilent`'s own first lines must answer about each end state separately.

## Consequences

- The closed vocabulary gains two nouns. Paid because neither `node.trashed` nor
  `done.marked` can be reused without lying, and this is a distinct decision that
  the log must be able to state.
- A put-down **parent** confers no coverage, exactly as a trashed one confers
  none — it is not coming back on its own, so a clock on it is a clock nobody
  will be shown. That is why `node.released` is a silent-risk kind: it cannot
  silence itself, but it can silence its children, and the gate cures every one
  of them transitively in the same transaction.
- A merge does not carry it. Putting a thing down is a decision about *that*
  thing; writing it onto a survivor would take a live thing out of your hands
  because something else folded into it.
- The equivalence property generates both kinds, so the gate and its independent
  reference implementation are compared on every cure and refusal involving them.

## What this does not do

**It is not an archive.** There is no view, no date range, no "restore all", and
no export section of its own — it is in the ordinary export because it is an
ordinary node with a field set.

**It does not tidy up after you.** Putting a place down does not put its contents
down; each of those comes back to you with a clock of its own. Deciding to stop
carrying thirty things is thirty decisions, and a sweep that made them for you
would be the app deciding what you have stopped caring about.

**It never congratulates.** "That's one less thing" is an opinion about the
person, and an approving opinion is still an opinion. The log line reads *"You
put this down."*
