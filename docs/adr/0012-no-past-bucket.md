# ADR-0012 · A passed clock becomes a live replan card, never an archive row

**Status:** Accepted · **Date:** 2026-07-27

## Decision

**There is no past bucket.** No "missed", no "overdue list", no archive of things
that slipped.

A passed date **auto-converts to a present replan card** with its context already
assembled: what it fed, the suspense, days left, and options —
**compress / escalate / renegotiate**. Resolving it is a decision, and the
decision is recorded.

## Why

A list of things you failed to do is a shame surface, and this audience has
usually got one already. Worse, it is *useless*: by the time an item is on it,
the question "should I still do this, and by when?" has become urgent, and a
bucket answers neither half.

The replan card answers both, and it does it at the only moment the user is
actually thinking about the item. Assembling the context — *what it fed*, *what
the suspense is*, *how many days are left* — is the expensive part, and it is
exactly the part someone with temporal myopia cannot reconstruct on demand.
Handing them a bare row labelled "3 days late" asks them to do the impossible
part themselves.

The three options are deliberately **all forward-facing**. There is no "mark as
missed", because that is filing, not deciding, and filing is what produces the
bucket this ADR forbids.

## Consequences

- The fold generates `replan.raised` when a clock passes. It is not a stored
  state that must be swept — it is a **computed consequence** of a clock and a
  current time, so it cannot be missed and cannot go stale.
- `replan.resolved` is gated by [ADR-0011](0011-no-silent-nodes-gate.md): the
  chosen option must itself set a clock or land the item on the Menu. There is
  no resolution that produces silence.
- **Dropping to the Menu is a legitimate, unremarkable resolution.** "I am not
  doing this now" needs a home that is not a failure state — that is what the
  Menu is for (law 6). It must be as easy to reach as the other two, and worded
  with no more friction.
- Replan cards must be **capped on the surface**. Returning after two weeks away
  could raise many at once, and law 8 bounds what re-entry may show — at most
  three triage items. The rest wait; they are not lost, and the gauge proves it.
- `node.trashed` remains available and is a *different* thing: an explicit
  decision that something is not a thing. That is a decision, not a lapse.

## What would overturn it

Nothing. This is product law 3.
