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

import type { AppEvent, ClarifyRoute, Heat, NodeKind } from '../events.ts';
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

/**
 * A route's full batch. Every branch terminates legally on its own — and even a
 * bare `clarify.routed` cannot silence the node, because it enters clarify already
 * covered by its capture clock (see the header note).
 */
export function routeEvents(ctx: StampContext, node: string, route: ClarifyRoute, fromKind: NodeKind): AppEvent[] {
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
      return [r, menu(ctx, node)];
    case 'trash':
      return [r, base(ctx, 'node.trashed', node, { reason: 'clarify:trash' })];
    default:
      return [r];
  }
}
