# ADR-0038 — Containment is a control, and Review is exceptions only

*2026-07-29 · Accepted · shipped 0.13.0*

## Context

Two things shipped together here because neither is worth anything alone.

**The parent field existed from the first fold and nothing could set one.**
`NodeState.parent` was written by `node.parented` in `src/fold.ts`, read by the
gate's silent-node cure, and read by the export — and no surface in the app
could produce that event. So every item Quietkeep held was flat. Product law 4,
*levels push down*, had no levels to push through; the sheet's "what does this
hold up?" could declare a dependency between two actions but could not say the
report **contains** the three steps that make it happen; and the frozen v1 scope
item "stalled/orphan detection" was undeliverable, because the thing it detects
— a container with nothing live under it — could not be created.

That is a specific and recurring failure shape in this repo, already recorded
twice: a projection with no path to it (`.replan-context`, whose contrast went
unmeasured because no surface can write a `suspense` clock; `upkeep.interval.set`,
which shipped with no UI at all). A capability that cannot be reached is not a
capability. It is a unit test wearing a feature's clothes.

**Review, meanwhile, is the habit that kills planners.** The classic weekly
review asks you to look at everything, and the cost is paid up front, every
time, whether or not anything is wrong. For this audience that is precisely the
act that does not happen, and the guilt of not doing it is what makes people
abandon the system rather than the review.

## Decision

### 1. Containment is a control on the detail sheet

Two acts, both built from events that already exist in the closed vocabulary:

- **"This is bigger than one step"** → `node.kind.changed { to: 'project' }`.
- **"What is this part of?"** → `node.parented { parent, priorParent? }`, with
  "On its own" → `node.unparented`.

`project` and **not** `outcome`, deliberately. An outcome is a stated *result*,
and naming the result is a separate act of thinking. A control that picked one
for you would be putting words in someone's mouth at the moment they were trying
to find them.

### 2. The parent graph is acyclic by construction

The gate refuses `node.parented` that names a missing or let-go parent, that
names the node itself, or that would put a thing inside something already below
it — and the picker never offers those options in the first place. Offering an
illegal choice and rejecting it afterwards is a control that lies about what it
does.

This is a harder invariant than the dependency-cycle rule in ADR-0032, because a
cyclic **parent** graph makes every ancestor walk infinite, and those walks run
inside fold consumers, exports and renders. A hang is indistinguishable from a
dead app with the data intact and unreachable — the exact failure class an
earlier audit found in the date projections.

So `src/tree.ts` **also** walks defensively: `ancestors()` is bounded by a seen
set, and `wouldParentCycle` returns `true` when it meets a pre-existing loop,
because a walk that terminated early cannot prove the absence of one. A shard
exchange (ADR-0035) can deliver two halves of a loop that neither device ever
wrote whole. The defence exists so the app survives data it did not write; the
gate exists so the app never writes it. Both, not either.

### 3. Review shows exceptions and nothing else

`src/review.ts` never shows you your work. It shows two things:

- **Stalled** — a container with no live work under it. The single most
  expensive silent failure in any planner: it looks fine on every surface, and
  nothing happens.
- **Orphaned** — a node whose parent is gone.

When neither exists the surface is **not on the page**. There is no clean-review
state to congratulate anyone about, because a congratulation is a score and law
5 says this app has none. An empty review says so by its absence.

Capped at three with the true total stated (law 8), and the copy is a count —
*"7 things need a look. These 3 first."* — never a rebuke.

## Consequences

- **Orphan detection is a check on an invariant the gate already enforces.** The
  gate refuses to *create* an orphan, so finding one is a real signal rather
  than routine. That is exactly why it is checked: an invariant nobody verifies
  is a belief. A parent can still be trashed by a path that cured its children
  differently, and a shard can deliver a child whose parent never came.
- **One definition of "container".** `CONTAINER_KINDS` lives in `src/tree.ts`
  and Review imports it. Two lists would eventually disagree, and the app would
  offer a parent it then refused to review.
- **Putting something under something else does not make it quiet.** It keeps
  its own clock and stays on the list. Filing as a way to lose things is the
  failure this whole app is a rebuttal to, and the smoke walk asserts it
  directly rather than trusting the claim.
- **`outcome`, `area` and `goal` can be *held* but not yet *made*.** They are
  legal parents and they can stall; only `project` has a control. That is a real
  gap, stated here rather than implied away — altitude nodes are not
  destinations (law 4) and inventing three more promote buttons before anyone
  has asked for them would be building the org chart, not the planner.
