# ADR-0029 · The triage model — heat before clarify, six routes, each self-terminating

**Status:** Accepted · **Date:** 2026-07-28

## Decision

Captured items are triaged in two passes, both computed from the log, neither
storing a queue:

1. **Heat** — an optional, lighter-weight first pass. One card at a time,
   `hot` / `cold`, recorded as `heat.set`. It routes nothing; it only colours the
   clarify pass that follows. Skipping it costs nothing but a little of clarify's
   context.
2. **Clarify** — one card at a time, a **forced choice of six routes**. Each route
   commits `clarify.routed{route}` **plus its own terminal event(s)** in a single
   `session.commit`, so the node lands exactly where the route says:

   | Route | Terminal events (all through the gate) |
   |---|---|
   | do-now | a same-day `clock.set{review}` + a visible 2-minute timer (UI only, recorded as `do-now.timed{outcome}` when it ends) |
   | next-action | a `clock.set{review}` one day out |
   | waiting-for | `node.kind.changed → waiting-for` + a `clock.set{review}` three days out |
   | someday | `menu.item.added{read}` |
   | reference | `menu.item.added{read}` |
   | trash | `node.trashed` |

The clarify queue is `route === null` — presence of a route **is** the definition
of clarified. Order is oldest-first (capture order = id order), with one nudge:
an item whose capture carried the `boss` tag sorts one step hotter, because a
thing someone else is waiting on is the most expensive to lose.

`heat` and `route` are new LWW-stamped fields on `NodeState`, folded from
`heat.set` / `clarify.routed` exactly as the structural fields are. `sourceTags`
(already on `capture.recorded`) is retained on the node so the boss nudge can read
it. Snapshots carry all three for free — and a test proves the round-trip, because
the last audit found snapshots silently lossy.

## Why

**Every route emits its own terminal event, because the route knows where the node
belongs and the generic cure does not.** A next-action is a review clock
*tomorrow*; waiting-for is a *kind change*; trash is *gone*. Leaning on the gate's
generic cure would flatten all of that to "a same-day clock or the Menu." So the UI
states the full intent.

**What actually makes a forgotten terminal event safe — the honest account.** The
first draft of this record claimed the gate's `clarify.routed` cure was the safety
net that fires if a route drops its terminal event. Building the §6 proof showed
that claim was false: **the `clarify.routed` cure is unreachable.** A node is
*already covered* by the time it is ever routed — a captured node carries the
gate's `capture.recorded` cure-clock from the moment of capture, and
`clarify.routed` removes no coverage — so `newlySilent` never sees the route
introduce silence, and the cure never fires. The real floor is simpler and
stronger: **a captured node is covered from capture onward, and clarify changes
where it is covered, never whether.** A route that forgot its terminal event leaves
the node exactly as clarify found it — under its capture clock, never silent, and
needing no cure at all. The gate's per-event cures (`capture.recorded`,
`node.created`, `clock.cleared`, …) are what guarantee that no *single* event can
introduce silence; the `clarify.routed` cure among them is redundant
defence-in-depth the real write paths never invoke, kept so the invariant "every
silent-risk event carries a cure" stays total. The tests assert the true
mechanism: a bare route needs **no** cure (the capture clock holds), and when the
capture clock is also stripped it is `clock.cleared`'s cure — named explicitly —
that holds the line.

**Heat is optional-first on purpose.** Forcing two passes on every item would be a
tax on exactly the person this app is for. Heat exists to make clarify *easier* —
a two-tap feel-check that gives the harder six-way choice something to lean on —
so it is offered, never required, and clarify works whether or not it ran.

**One card, forced choice, oldest-first.** The whole premise of the inbox is that
the list is the thing that overwhelms. Triage never shows the list; it shows one
item and asks one question. Forced choice (six real destinations, no "skip to
later" that silently rebuilds the pile) is what actually drains an inbox.

**The do-now timer is an affordance, not a gate.** Routing to do-now clocks and
routes the node *first*; the 2-minute countdown is a nudge for the small thing in
front of you, recorded separately as `do-now.timed` when it completes or is
stopped. It never blocks, never nags, and honours reduced-motion (it is text, not
animation).

## Consequences

- `test/triage.test.ts` holds the load-bearing properties: each of the six routes
  terminates with **zero silent nodes** through the real gate; a bare route (its
  terminal event forgotten) needs no cure because the capture clock holds; when
  that clock is also stripped, `clock.cleared`'s cure — asserted by source — holds
  the line; heat records without routing; the boss nudge orders the queue;
  `heat`/`route`/`sourceTags` survive a snapshot round-trip. Each proof was made to
  fail first (§6): disabling `clock.cleared`'s cure silences the node and the test
  catches it; a lossy snapshot fails the round-trip.
- `tools/smoke.mjs` walks it in the built app: capture six, drain the heat pass,
  route all six ways, and assert from the exported log that each route left its own
  terminal event — then reads the held gauge for `0 silent`.
- `tools/a11y.mjs` renders both passes, both themes, at the stressed viewport;
  the route buttons' focus rings and the low-contrast route hint are measured, not
  assumed.
- Triage reads projections only (`src/triage.ts`) and commits intent batches only
  (`src/ui/triage-intents.ts`). Neither touches the store; both go through
  `session.commit` and therefore the gate. There is no second write path.

## What would overturn it

A finding that the six routes do not cover a real destination a user needs — in
which case a seventh route is added the same way: `clarify.routed` plus its own
terminal event, with the gate cure unchanged underneath. The two-pass shape
(optional heat, forced-choice clarify) is the settled part; the route *list* is
extensible without reopening this record.
