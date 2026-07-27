# ADR-0013 · Higher horizons project downward; the runway is the only workspace

**Status:** Accepted · **Date:** 2026-07-27

## Decision

**The runway — actions and next actions — is the only place work happens.**
Higher levels (outcomes, areas, goals) **project lineage and health downward**
into it. Altitude views are **inspection modes**, not workspaces. The user never
has to climb to a higher level for the system to function.

## Why

Every planning system with levels above the task has the same failure: the upper
levels require periodic manual attention, that attention is the first thing to
lapse, and once it lapses the upper levels are stale — at which point they are
worse than absent, because they look authoritative and are wrong.

Requiring the user to climb is requiring exactly the executive function the app
is compensating for. If the design needs a monthly review at the goal level to
stay coherent, it has failed at the level of design, not usage.

Pushing down instead means the upper levels are **inputs to the runway's ranking
and to the Review exceptions**, not destinations. An area with no active work
does not need the user to visit it — it surfaces itself as a dormancy exception.
An unsupported goal surfaces itself. The structure does the noticing.

This is also why Review is **exceptions-first** rather than a tree: the tree is
available on request, but the default view is the short list of things that are
structurally wrong, ranked, top handful only. A full alignment tree presented by
default is a climbing task wearing a review's name.

## Consequences

- Every higher-level node must have a **downward projection** defined — what it
  contributes to ranking, and what exception it raises when unhealthy.
- The four Review exceptions are computed, never curated: **stalled** (no next
  action), **orphan** (no parent), **dormant** (area with no active work or a
  stale clock), **unsupported goal**.
- Exceptions are **short-ranked — top handful only**. An exhaustive exception
  list is a backlog, and a backlog is a climbing task.
- Creating a goal or area must be **cheap and optional**. The app works with none
  of them; they add ranking signal when present.
- The alignment tree exists and is reachable on request. It is never the landing
  view, and nothing requires visiting it.
- Attention-distribution readout is descriptive, not prescriptive — it plots
  where attention went. It does not say where it *should* have gone (law 7).

## What would overturn it

Nothing. This is product law 4.
