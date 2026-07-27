# ADR-0014 · Menu items and pebbles cannot carry clocks

**Status:** Accepted · **Date:** 2026-07-27

## Decision

Two node kinds are **demand-free by construction**: `aspiration` (Menu items) and
`pebble`. **Neither can carry a clock.** The schema rejects it; it is not a
default that can be overridden.

Acting on a Menu item is a **deliberate promotion** (`menu.item.promoted`), never
an obligation that accrued while you weren't looking.

## Why

A system where everything can become due is a system where everything eventually
*is* due. Once that happens the user stops trusting any single item's urgency,
because urgency is the ambient condition — and the app becomes noise.

For this audience there has to be somewhere to put a thing that is genuinely
wanted and genuinely not owed. "I'd like to read that." "I'd like to go there."
If that thing can sprout a clock, then wanting something becomes committing to
it, and the rational response is to stop writing wants down. The Menu only works
if it is *safe*, and safety here means structurally incapable of nagging.

The Menu is still covered by law 1 — clause (c) is "on the Menu". Being on the
Menu **is** a form of return: you see it when you go looking for something you'd
like to do. That is the correct return semantics for a want.

**Pebbles are the same argument from the other direction.** A pebble is *load*,
not work — the small ongoing weight of a thing that is unresolved. Giving a
pebble a clock would turn a description of your load into another demand, which
is precisely backwards: the pebble exists so the app can account for the weight
you are already carrying, and depress capacity accordingly.

## Consequences

- `clock.set` on an `aspiration` or a `pebble` is **rejected at the write gate**,
  not merely hidden in the UI.
- Promotion is explicit: `menu.item.promoted` changes the node's kind, at which
  point it can take a clock like anything else. The promotion is the user's act.
- Pebbles link to affected nodes and may **depress capacity / WIP while active**.
  This is the mechanism by which unresolved weight shows up in what the app asks
  of you — without ever becoming a task.
- Pebbles annotate the timeline, so a stretch of low capacity has a visible
  reason. **Co-occurrence only, never causation** (law 7). The app shows the
  pebble and the capacity in the same period; it does not claim one caused the
  other.
- `save-for` aspirations carry a **manual** target/saved pair. Manual on purpose
  — no account linking, no balance fetching, no server.
- The Menu must be genuinely reachable and pleasant, or it is a graveyard with
  better branding. Rest mode puts it forward for this reason.

## What would overturn it

Nothing. This is product law 6.
