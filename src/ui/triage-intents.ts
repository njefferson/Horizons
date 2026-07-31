// The six clarify routes and the heat pass, as event batches.
//
// Each route emits `clarify.routed` PLUS its own terminal event, in one commit,
// so the gate sees the finished intent — the node lands where the route says, not
// wherever the generic cure would put it. A route knows things the generic cure
// cannot: waiting-for is a KIND change, next-action is tomorrow's clock, trash is
// gone.
//
// What makes a forgotten terminal event safe is NOT the gate's clarify.routed cure
// (which is unreachable on the real write paths — a captured node is always
// already covered by the time routeEvents runs, and clarify.routed removes no
// coverage; see ADR-0029 and test/triage.test.ts). It is that a captured node is
// covered from capture onward, so a bare route leaves it under its capture clock,
// never silent. (The cure IS reachable in the abstract — a bare clarify.routed at
// a never-created node id mints a silent node the cure then clocks — which is why
// it is kept; it just never fires for a route built here.)
//
// These build events; they never touch the store. `app.ts` hands them to
// `session.commit`, which runs them through the gate.

import type { AppEvent, ClarifyRoute, ClockKind, Heat, MenuCategory, NodeKind } from '../events.ts';
import type { NodeState } from '../fold.ts';
import type { StampContext } from './session.ts';
import { endOfLocalDay } from '../time.ts';

const base = (ctx: StampContext, kind: string, node: string, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

const routed = (ctx: StampContext, node: string, route: ClarifyRoute): AppEvent =>
  base(ctx, 'clarify.routed', node, { route });

// A route's clock is "back with you before this day is out", so it lands on the
// last second of a LOCAL calendar day — the user's day, not UTC's (V-13) — and
// counts calendar days, so a DST changeover in between does not move it an hour.
const clockInDays = (ctx: StampContext, node: string, days: number, source: string): AppEvent =>
  base(ctx, 'clock.set', node, {
    clockKind: 'review', at: endOfLocalDay(ctx.at, ctx.zone, days), source,
  });

const menu = (ctx: StampContext, node: string): AppEvent =>
  base(ctx, 'menu.item.added', node, { category: 'read' });

/** The heat pass: one event, no routing. */
export const heatEvents = (ctx: StampContext, node: string, heat: Heat): AppEvent[] =>
  [base(ctx, 'heat.set', node, { heat })];

/** The clock kinds that are DEMANDS — dates somebody chose or owes. A `review`
 *  clock is the app's own resurfacing marker and is never in this list. */
const DEMAND_KINDS: readonly ClockKind[] = ['due', 'start', 'suspense', 'park'];

/**
 * The demand clocks a node currently carries — what a Menu landing must clear.
 * Exported so callers hand `routeEvents` the truth about THIS node rather than
 * the route guessing (an unconditional clear would write claims about changes
 * that did not happen).
 */
export const demandClocksOf = (n: NodeState | undefined): ClockKind[] =>
  n ? DEMAND_KINDS.filter(k => Boolean(n.clocks[k])) : [];

/**
 * A route's full batch. Every branch terminates legally on its own — and even a
 * bare `clarify.routed` cannot silence the node, because it enters clarify already
 * covered by its capture clock (see the header note).
 *
 * `demandClocks` (1.3.1): the demand clocks the node carries RIGHT NOW, from
 * `demandClocksOf`. The someday/reference branches clear every one of them in
 * the same batch — the audit's most severe finding was a due-dated item routed
 * to Someday keeping its date invisibly for ever: the Menu group wins every
 * surface, `raisesReplanCard` returns false for Menu items, the sheet hides
 * temporal controls, and sort mode's hygiene excludes it — a hard date
 * swallowed whole, which is law 3 violated in the app's own mainline. A wish
 * carries no demands; landing on the Menu must shed them, visibly, in the log.
 */
export function routeEvents(
  ctx: StampContext, node: string, route: ClarifyRoute, fromKind: NodeKind,
  demandClocks: readonly ClockKind[] = [],
): AppEvent[] {
  const r = routed(ctx, node, route);
  switch (route) {
    case 'do-now':
      // A same-day clock; the 2-minute timer is a UI affordance, recorded
      // separately as do-now.timed when it ends.
      return [r, clockInDays(ctx, node, 0, 'clarify:do-now')];
    case 'next-action':
      return [r, clockInDays(ctx, node, 1, 'clarify:next-action')];
    case 'waiting-for':
      return [
        r,
        base(ctx, 'node.kind.changed', node, { from: fromKind, to: 'waiting-for' as NodeKind }),
        clockInDays(ctx, node, 3, 'clarify:waiting-for'),
      ];
    case 'someday':
    case 'reference':
      // Menu FIRST, then the clears: once the node is on the Menu it is covered
      // by clause (c), so stripping its clocks needs no cure — the other order
      // would make the gate write a junk same-day clock between the two.
      return [
        r,
        menu(ctx, node),
        ...demandClocks.map(k => base(ctx, 'clock.cleared', node, { clockKind: k })),
      ];
    case 'trash':
      return [r, base(ctx, 'node.trashed', node, { reason: 'clarify:trash' })];
    default:
      return [r];
  }
}

/**
 * Put a just-routed card back in the inbox — the exact reverse of `routeEvents`.
 *
 * The complaint this answers: a route is one tap and the card is gone, and
 * "gone" felt like "lost". Undo is the way back. Append-only means it is NOT a
 * deletion — it is the honest inverse events, so the log reads "sent here, then
 * taken back", which is what actually happened.
 *
 * Each route's effects are reversed with the events built to reverse them:
 * `clarify.reopened` un-sets the route (the item returns to triage), and then
 * the route's OTHER effect is undone — a kind change put back, the review clock
 * cleared, the Menu placement removed, or the trashing undone. In every case the
 * node lands back exactly where it started: `captured`, unrouted, and cured by
 * the same same-day clock a fresh capture gets, so it is never silent for an
 * instant.
 *
 * `fromKind` is the kind the node had BEFORE the route touched it — captured by
 * the surface at route time, because `waiting-for` is the one route that changes
 * the kind and the log does not otherwise remember what it was.
 */
export function undoRouteEvents(
  ctx: StampContext, node: string, route: ClarifyRoute, fromKind: NodeKind,
): AppEvent[] {
  const reopen = base(ctx, 'clarify.reopened', node, { from: route });
  // Built LAZILY, in emission position. The first version constructed this
  // before the switch, so the waiting-for branch emitted [reopen, kind.changed,
  // cleared] with the cleared event carrying an EARLIER seq than the kind
  // change — a stamp-disordered batch the old gate tolerated silently and the
  // 1.3.1 order refusal caught on its first run. Stamps follow emission order
  // or the batch is lying about its own history.
  const clearReview = (): AppEvent => base(ctx, 'clock.cleared', node, { clockKind: 'review' });
  switch (route) {
    case 'do-now':
    case 'next-action':
      // The route replaced the capture clock with its own review clock; clearing
      // it lets the gate re-cure to a same-day clock, so the item is restored to
      // the exact state a fresh capture is in.
      return [reopen, clearReview()];
    case 'waiting-for':
      return [
        reopen,
        base(ctx, 'node.kind.changed', node, { from: 'waiting-for' as NodeKind, to: fromKind }),
        clearReview(),
      ];
    case 'someday':
    case 'reference':
      // someday/reference land on the Menu with category 'read' (see `menu`
      // above); take it back off, which the gate cures with a same-day clock.
      return [reopen, base(ctx, 'menu.item.removed', node, { from: 'read' as MenuCategory })];
    case 'trash':
      return [reopen, base(ctx, 'node.untrashed', node, {})];
    default:
      return [reopen];
  }
}
