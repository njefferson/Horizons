# ADR-0065 · Load, not work — the pebble consumer

**Status:** Accepted · **Date:** 2026-08-02 ·
**Executes** [ADR-0014](0014-demand-free-types.md)

## Context

ADR-0014 has said what a pebble is for since the design phase, in its own
Consequences:

> "Pebbles link to affected nodes and may **depress capacity / WIP while
> active**. This is the mechanism by which unresolved weight shows up in what the
> app asks of you — without ever becoming a task."
>
> "Pebbles annotate the timeline, so a stretch of low capacity has a visible
> reason. **Co-occurrence only, never causation** (law 7)."

[`docs/data-constitution.md`](../data-constitution.md) repeats it: *"The app will
show you that a pebble and a low-capacity week overlapped. It will never tell you
one caused the other."*

Everything the design needed was already in place. `pebble` was in `NODE_KINDS`
**and** in `DEMAND_FREE_KINDS`, so the write gate had been refusing to put a
clock on one for a year. `pebble.raised{magnitude, affects}`,
`pebble.settled`, `capacity.declared{level}` and `wip.limit.set{limit}` were all
declared and typed, and `Capacity` even named its four values. **Only the
consumer was missing.**

**This was carried as an open question for the owner, wrongly, several times.** It was
recorded in a plan file as blocked on "what does a pebble actually depress?",
repeated in a readiness sweep, said in chat twice, and finally shipped into the
vocabulary in 1.14.2 as a claim that the decision "has never been answered" — one
release after establishing that an ADR's Consequences section is a build list
rather than prose. The framing appears nowhere in this repo except in that text.
The owner's correction is the reason this ADR exists, and the correction stands in the
vocabulary beside the entry so the wrong version does not quietly disappear.

## Decision

**Unresolved weight narrows the offer, and nothing else.**

### What "depress capacity" is, concretely

`offerNow` is literally "what the app asks of you" — up to `OFFER_CAP` pieces of
work, chosen so picking is a preference rather than a comparison (ADR-0060). So
that is the surface that bends:

- **Not the coverage gauge.** It proves law 1 over every node and must never
  move. The gauge counts pebbles for exactly the reason it counts journal
  entries (ADR-0061): excluding a kind from a proof is how law 1 gets defined
  away.
- **Not the held list.** Hiding what you hold is the opposite of this app.
- **Not Composed Today.** That is what *you* chose, and the app does not get to
  shorten your own answer.
- **Never below one.** Next up's whole promise is that there is always a single
  thing, and a heavy day is when that matters most.

The wish still rides along. A Menu item owes nothing by law 6, and on a low
stretch the thing you actually wanted is the most appropriate offer in the set,
not the least.

### Two independent facts, either sufficient

`capacity.declared` is believed on its own. Requiring pebbles to justify it would
make the declaration decorative — you said it, and the app has no standing to
ask for evidence about how you are (law 7).

Weight reaches the threshold at `HEAVY_AT = 3`: one boulder, a rock and a pebble,
or three pebbles. **One small thing deliberately changes nothing.** A pebble has
to be sayable without consequence, or you learn not to write them down — which is
ADR-0014's own argument for the Menu, from the other direction.

### A pebble is not work, and the surfaces say so

It has its own entry beside the bother box: a collapsed line under capture,
costing nothing until opened. Two separate boxes on purpose — a bother is a
*worry*, pre-triage, and the flow exists to route it; a pebble is *weight*, there
is nothing to do about it, and saying so is the entire act.

**Pebbles are excluded from the todo list**, exactly as journal entries are. A
row in that list is what "becoming a task" looks like, and ADR-0014 forbids it in
terms. **A pebble folds only into another pebble**, and nothing else folds into
one — the `person` rule, for the same reason: "this task is the same as the
weight I am carrying" is not a sentence.

**Settling takes the weight off AND takes the node out of what you are holding**
— `pebble.settled` followed by `node.trashed`. The log keeps both facts for ever
and the trash view is the way back (ADR-0050), so nothing is lost.

The second event was missing from the first build of this release, and the
headless walk found it. A settled pebble appears in **no list at all** — it has
left the load entry by definition and was never in the todo list — so the node
was unreachable from every surface while still counting toward the coverage
gauge's "held". The number would have climbed for ever with nothing on any screen
to explain it: the one-node-two-stories defect this repo has fixed before, and
the reason the gauge and the panel were made to share one definition in 1.2.3.

### Co-occurrence, never causation

The offer's note reads *"Fewer things, while you have this much on."* **"While"
is load-bearing.** It names two facts about one period. *"Because"* would be the
app explaining you to yourself, which is what law 7 forbids and why there is no
sentiment field anywhere in this vocabulary.

`affects` is a plain list for a person to read. **Nothing derives from it** — it
is not a dependency, and no projection computes anything through it.

## Consequences

- No new event kinds, no vocabulary change, no gate change. Four nouns declared
  in Phase 0 finally have a writer and a reader.
- `Offer` gains `load`, returned rather than recomputed by the surface, so the
  set and the sentence beside it cannot disagree — the render-contradicts-record
  shape ADR-0057 was written to kill.
- `heldNodes` counts an ACTIVE pebble (so the gauge and the merge picker see
  it); `heldGroups` never shows one (so the todo list cannot read as work); and
  settling removes it from both.
- **The timeline half of ADR-0014 does not ship**, and no timeline is invented
  to carry it. There is no plot surface in this app; the closest thing is the log
  viewer, which is a record rather than a chart. The half that shipped is the one
  the app already had a surface for.
- **A latent inconsistency became observable, and is named rather than fixed
  here.** `heldNodes` counts every untrashed node; `heldGroups` skips the kinds
  that are not work. That drift began in 1.13.0 with journal entries and nobody
  noticed, because `held.ts` still carried a comment claiming the two could not
  disagree. The comment is corrected in this release. The gauge therefore says
  "N held" while the list shows fewer rows — nothing is hidden, since each of
  those kinds has its own surface, but "held" is doing two jobs in one word.
  **That deserves a decision of its own**, not a rider on this one.
- `wip.limit.set` stays unemitted with its reason recorded: capacity in words was
  the whole of what this needed, and a number you set about yourself is nearer a
  target than a description.

## What would overturn this

- **The offer narrowing when it should not.** If a heavy stretch is exactly when
  more options help — which is an empirical claim about this audience, not a
  design one — the direction is wrong and the threshold is not the fix.
- **The note reading as blame.** It is one sentence about two facts. If it lands
  as an accusation, the words are wrong even though the mechanism is right.
- **Not by "capacity should be inferred."** The app does not work out how you
  are. It reads what you told it, and nothing else (law 7).
