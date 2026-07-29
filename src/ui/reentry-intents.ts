// Coming back: the greeting, and the amnesty (product law 8).
//
// Every noun already exists in docs/event-vocabulary.md. Nothing here invents
// one, and the greeting's payload is the schema's own bound made concrete —
// `shown` has room for exactly Next-up, at most three triage items, and the
// gauge, and there is no shape it could take that shows the backlog.
//
// These build events; they never touch the store.

import type { AppEvent } from '../events.ts';
import type { State } from '../fold.ts';
import type { StampContext } from './session.ts';
import { REENTRY_TRIAGE_CAP } from '../reentry.ts';
import { raisesReplanCard } from '../replan.ts';
import { heldNodes } from '../gate.ts';
import { replanEvents } from './replan-intents.ts';

const base = (ctx: StampContext, kind: string, node: string | null, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

/**
 * Record that someone came back, and what they were shown.
 *
 * `shown` is written from the CAP, not from what happened to be on screen — the
 * log's job here is to record the guarantee, and a number copied out of the DOM
 * would record whatever a rendering bug did instead.
 */
export function greetEvents(
  ctx: StampContext, absenceDays: number, triageShown: number,
): AppEvent[] {
  return [base(ctx, 'reentry.greeted', null, {
    absenceDays,
    shown: {
      nextUp: true,
      triage: Math.min(Math.max(0, triageShown), REENTRY_TRIAGE_CAP),
      gauge: true,
    },
  })];
}

/**
 * Offer the amnesty. Recorded separately from accepting it, because the offer
 * is the interesting half: it is evidence the app noticed a lapse and responded
 * to it, whether or not anything was taken up.
 */
export const offerAmnestyEvents = (ctx: StampContext, scope: string): AppEvent[] =>
  [base(ctx, 'amnesty.offered', null, { scope })];

/**
 * Take the amnesty.
 *
 * **Nothing is marked done and nothing is deleted.** Every passed date is
 * resolved forward with the choice the replan surface already offers for exactly
 * this — `to-menu`, which lands the item on the Menu, where by law 6 it carries
 * no clock and makes no demand. It is still there. You can bring any of it back.
 *
 * What this actually removes is not work; it is **twenty decisions standing
 * between you and any work at all**, which is the real cost of coming back. Each
 * item still goes through `replanEvents`, so every one of them is the same gated,
 * forward-facing resolution a person would have made by hand — one act instead
 * of twenty, not a different kind of act.
 *
 * A cap is deliberately NOT applied here. The cap governs what a surface may
 * SHOW (law 8); this is a thing the user has explicitly asked for, and doing
 * three of the twenty they asked about would be the app deciding it knew better.
 */
export function acceptAmnestyEvents(ctx: StampContext, state: State, nowIso: string, zone: string): AppEvent[] {
  const out: AppEvent[] = [base(ctx, 'amnesty.accepted', null, { scope: 'passed-dates' })];
  const passed = heldNodes(state)
    .filter(n => raisesReplanCard(n, nowIso, zone))
    .sort((a, b) => (a.id < b.id ? -1 : 1));       // total order: same log every time
  for (const n of passed) out.push(...replanEvents(ctx, n.id, 'to-menu'));
  return out;
}

/**
 * The lapse ritual ran.
 *
 * Named `lapse.migration.ran` and never `migration.*` bare — the user-facing
 * word for this ritual is "Migration", which collides with schema migration, and
 * the vocabulary resolves that collision deliberately rather than living with an
 * ambiguity in the most data-critical part of the system.
 */
export const lapseRanEvents = (
  ctx: StampContext, absenceDays: number, itemsTriaged: number,
): AppEvent[] => [base(ctx, 'lapse.migration.ran', null, { absenceDays, itemsTriaged })];
