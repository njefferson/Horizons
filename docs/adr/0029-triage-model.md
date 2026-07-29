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

- **do-now** — a same-day `clock.set{review}` + a visible 2-minute timer (UI only, recorded as `do-now.timed{outcome}` when it ends)
- **next-action** — a `clock.set{review}` one day out
- **waiting-for** — `node.kind.changed → waiting-for` + a `clock.set{review}` three days out
- **someday** — `menu.item.added{read}`
- **reference** — `menu.item.added{read}`
- **trash** — `node.trashed`

The clarify queue is **`captured && route === null`** — a node that entered as a
capture and has not yet been routed. Ordering is a **two-tier priority**: all
`boss`-tagged items ahead of all others, oldest-first within each tier, because a
thing someone else is waiting on is the most expensive to lose. (This is a queue
jump, not a within-age nudge — the tests lock it.)

**Membership is keyed on capture provenance, not on the absence of a route.** The
first draft keyed it on `route === null` alone; the adversarial audit showed that
counts *any* unrouted live node — a person, an anchor, a bother, a Menu-promoted
action — as "unclarified", offering it clarify routes that then hard-fail on a
demand-free node ("a pebble cannot carry a clock"). So `NodeState` gains a
`captured` latch, set true only by `capture.recorded` / `interrupt.captured` and
never cleared; the inbox is captures-not-yet-routed, nothing else.

`heat`, `route`, `sourceTags`, and `captured` are new fields on `NodeState`
(`heat`/`route` LWW-stamped like the structural fields; `captured` a monotone
latch). `sourceTags` is the one mutable-array field, so it is cloned on
copy-on-write and copied out of the log payload on store — the audit found it
aliased both the base node and the "immutable" log event. **Snapshots must
backfill all four on deserialise**: a pre-Phase-2 snapshot never stored them, and
without the backfill the clarify queue threw on `sourceTags.includes` — the update
breaking the inbox, which the "data is never lost to updates" law forbids.
`captured ?? true` is correct for legacy data (before Phase 2 the only
node-creating event a shipped surface emitted was `capture.recorded`). A test
proves the round-trip and the legacy upgrade; each was made to fail first.

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
animation). It lives in **its own region, outside the card carousel** — the audit
found the first version attached it under the *next* card and let a subsequent
refresh kill the interval without recording the outcome. `finish()` is idempotent
(a completion racing a Stop cannot commit twice), and the timer starts only if the
route actually landed.

**Focus is managed across the card carousel.** Activating a control removes it, so
focus is moved to the prompt heading (or the capture line once the inbox is clear)
rather than left to fall to `<body>` — a keyboard-first flow the audit caught
stranding keyboard and screen-reader users (WCAG 2.4.3). The prompt is the target,
not the first route, so an accidental double-activation cannot fire a destructive
route like Trash. `a11y.mjs` activates a route and asserts focus does not land on
`<body>`; the check was made to fail first.

## Consequences

- `test/triage.test.ts` holds the load-bearing properties: each of the six routes
  terminates with **zero silent nodes** through the real gate; a bare route (its
  terminal event forgotten) needs no cure because the capture clock holds; when
  that clock is also stripped, `clock.cleared`'s cure — asserted by source — holds
  the line; heat records without routing; the boss nudge orders the queue;
  `heat`/`route`/`sourceTags` survive a snapshot round-trip; a person/bother/anchor
  never enters the inbox; a pre-Phase-2 snapshot upgrades without throwing and its
  captures still appear; `sourceTags` honours copy-on-write and does not alias the
  log payload. Each proof was made to fail first (§6): disabling `clock.cleared`'s
  cure silences the node; dropping the `captured` guard lets a person pollute the
  inbox; a missing `captured ?? true` backfill drops legacy captures — each test
  catches its regression.
- `tools/smoke.mjs` walks it in the built app: capture six, drain the heat pass,
  route all six ways, and assert from the exported log that each route left its own
  terminal event — then reads the held gauge for `0 silent`.
- `tools/a11y.mjs` renders both passes, both themes, at the stressed viewport;
  the route buttons' focus rings and the low-contrast route hint are measured, not
  assumed.
- Triage reads projections only (`src/triage.ts`) and commits intent batches only
  (`src/ui/triage-intents.ts`). Neither touches the store; both go through
  `session.commit` and therefore the gate. There is no second write path.
- **Known limitation, documented not fixed:** the do-now / same-day clock uses
  end-of-**UTC**-day (`clockToday`, mirroring the gate's `endOfDay`), so off the
  UTC meridian "today" lands on the wrong local day. This is pre-existing in the
  gate and cross-cutting; it is recorded in `docs/verifications.md` rather than
  patched piecemeal here. It has no bearing on law 1 — the node is clocked either
  way — only on which local day the clock reads.

## What would overturn it

A finding that the six routes do not cover a real destination a user needs — in
which case a seventh route is added the same way: `clarify.routed` plus its own
terminal event, with the gate cure unchanged underneath. The two-pass shape
(optional heat, forced-choice clarify) is the settled part; the route *list* is
extensible without reopening this record.
