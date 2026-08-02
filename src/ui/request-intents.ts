// Declining, carrying after all, and the request slot (1.8.0, ADR-0056).
//
// One noun, two homes: the detail sheet's "Not mine to carry" and the bother
// flow's third branch both come through `declinePair` below, so the ledger has
// exactly one write shape. The batch carries its OWN park — each branch
// terminates on its own (the bother-intents rule); the gate's cure for a bare
// `request.declined` stays as backstop for an import or an older shard, never
// as the path the app itself takes.
//
// These build events; they never touch the store.

import type { AppEvent, NodeId } from '../events.ts';
import type { NodeState, State } from '../fold.ts';
import type { StampContext } from './session.ts';
import { TIMER_CHOICES } from '../timer.ts';
import { endOfLocalDay } from '../time.ts';
import { nextSlotOccurrence, parseSlot, slotOf, type SlotDay } from '../requests.ts';

const base = (ctx: StampContext, kind: string, node: string | null, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

/** Where a declined thing waits: the next request slot when one is set, else
 *  the end of today — the same-day boundary every other cure uses. */
const declineReturnAt = (ctx: StampContext, state: State): string => {
  const day = slotOf(state);
  return day ? nextSlotOccurrence(day, ctx.at, ctx.zone) : endOfLocalDay(ctx.at, ctx.zone, 0);
};

/** The one write shape for a decline: the record, then the deliberate park.
 *  `what` is the title SNAPSHOT (the consent-sentence rule — the record
 *  survives a rename); `person` is null when nobody has said who. */
export function declinePair(
  ctx: StampContext, state: State, node: string, what: string,
  person: NodeId | null, reason: string,
): AppEvent[] {
  return [
    base(ctx, 'request.declined', node, { person, what, reason }),
    base(ctx, 'park.set', node, { returnAt: declineReturnAt(ctx, state), reason: 'not-now-ledger' }),
  ];
}

/**
 * Decline from the detail sheet. The person is the node's most recent
 * `requested-by` link when one exists — the app never guesses who asked.
 */
export function declineEvents(ctx: StampContext, state: State, n: NodeState): AppEvent[] {
  const asked = [...n.people].reverse().find(p => p.relation === 'requested-by');
  return declinePair(ctx, state, n.id, n.title, asked?.person ?? null, 'detail');
}

/**
 * Carry it after all — the way back. No new noun: clearing the park IS taking
 * the thing back into your day, and the gate cures the clear with the same-day
 * clock a fresh capture gets, so it re-enters covered and lands back today.
 */
export const carryEvents = (ctx: StampContext, node: string): AppEvent[] =>
  [base(ctx, 'clock.cleared', node, { clockKind: 'park' })];

/** Park an (undeclined) request until the slot. Refuses — returns nothing —
 *  when no slot parses: never offer what cannot land (ADR-0038). */
export function parkToSlotEvents(ctx: StampContext, state: State, node: string): AppEvent[] {
  const day = slotOf(state);
  if (!day) return [];
  return [base(ctx, 'park.set', node, {
    returnAt: nextSlotOccurrence(day, ctx.at, ctx.zone), reason: 'request-slot',
  })];
}

/** Set or clear the one slot. `node: null` (the range.acted precedent);
 *  '' is the honest clear. */
export function setSlotEvents(ctx: StampContext, day: SlotDay | null): AppEvent[] {
  const recurrence = day ? `weekly:${day}` : '';
  if (day && !parseSlot(recurrence)) return [];
  return [base(ctx, 'request.slot.set', null, { recurrence })];
}

/**
 * Choose how long a timer runs (1.10.0, ADR-0059). Refused, not guessed: a
 * length outside the closed list would be a commitment nobody offered, so the
 * intent declines to build an event rather than writing a number it invented.
 */
export const setTimerLengthEvents = (ctx: StampContext, minutes: number): AppEvent[] =>
  TIMER_CHOICES.includes(minutes)
    ? [base(ctx, 'timer.length.set', null, { minutes })]
    : [];
