// Making, marking and confirming an arrangement.
//
// The events, and nothing else — no DOM, no store. Every one of them is an
// existing kind: `node.field.set` carries the marker exactly as the comms sweep
// does (ADR-0042), so the closed vocabulary in docs/event-vocabulary.md gains a
// FIELD and not a noun.
//
// Confirming is an ordinary `done.marked`. That is the whole trick: the decay
// primitive already knows how to hold "this came round again", and an
// arrangement is that same rhythm asking whether the arrangement still stands.

import type { AppEvent } from '../events.ts';
import type { StampContext } from './session.ts';
import { ARRANGEMENT_FIELD, DEPENDS_FIELD } from '../arrangement.ts';
import { endOfLocalDay } from '../time.ts';

// Each intents module carries its own `base`, as every sibling here does.
const base = (ctx: StampContext, kind: string, node: string | null, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

/**
 * Mark an EXISTING upkeep as an arrangement that runs without you.
 *
 * Deliberately not a creation. Somebody who has set up a repeating thing has
 * already told the app the cadence; asking them to make a second, parallel
 * object for the same real-world arrangement would be the app's bookkeeping
 * leaking into their life. This says "that one runs on its own", which is a
 * fact about the arrangement, not a new commitment.
 */
export const markArrangementEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'node.field.set', node, { field: ARRANGEMENT_FIELD, value: true })];

/** It is no longer an arrangement that runs itself — you are doing it by hand
 *  again. Written as `value: false` rather than by trashing the node, because
 *  the thing still exists and still has a rhythm; and `node.field.set` is the
 *  only field event the closed vocabulary has, which is the right constraint —
 *  turning a marker off is a decision the log should keep, not an erasure. */
export const unmarkArrangementEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'node.field.set', node, { field: ARRANGEMENT_FIELD, value: false })];

/** Confirming means asking somebody else — an approval, an authorisation, a
 *  supplier who will not write to say they have stopped. Orthogonal to the
 *  marker, because plenty of arrangements run on a machine you own. */
export const setDependsEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'node.field.set', node, { field: DEPENDS_FIELD, value: true })];

export const clearDependsEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'node.field.set', node, { field: DEPENDS_FIELD, value: false })];

/**
 * Confirm that it is still arranged.
 *
 * An ordinary `done.marked`, plus the next review clock — the same pair the
 * comms sweep uses, and for the same reason. Without the clock the node would
 * be satisfied and then silent, and law 1 refuses a node that is on no surface
 * and under no clock.
 *
 * The interval is whatever the upkeep already carries. This never invents a
 * cadence: an arrangement whose rhythm nobody set is one the app should be
 * quiet about rather than guess at.
 */
export function confirmArrangementEvents(
  ctx: StampContext, node: string, intervalDays: number | null,
): AppEvent[] {
  const events: AppEvent[] = [base(ctx, 'done.marked', node, { at: ctx.at })];
  if (Number.isFinite(intervalDays) && (intervalDays as number) > 0) {
    events.push(base(ctx, 'clock.set', node, {
      clockKind: 'review',
      at: endOfLocalDay(ctx.at, ctx.zone, intervalDays as number),
      source: 'arrangement:confirmed',
    }));
  }
  return events;
}
