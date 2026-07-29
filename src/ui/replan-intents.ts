// Resolving a replan card (ADR-0012, product law 3).
//
// Every option is FORWARD-FACING. There is deliberately no "mark as missed",
// because that is filing rather than deciding, and filing is what produces the
// bucket law 3 forbids.
//
// `replan.resolved` is silent-risk and gated: the chosen option must itself set a
// clock or land the item on the Menu, so there is no resolution that produces
// silence (ADR-0011). Each branch below terminates on its own rather than leaning
// on the gate's generic cure — the same principle as the clarify routes
// (ADR-0029): the choice knows where the item belongs and the cure does not.
//
// These build events; they never touch the store.

import type { AppEvent, ClockKind, MenuCategory, ReplanChoice } from '../events.ts';
import type { StampContext } from './session.ts';
import { endOfLocalDay } from '../time.ts';
import { endOfDayKey } from './detail-intents.ts';

const base = (ctx: StampContext, kind: string, node: string, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

const resolved = (ctx: StampContext, node: string, choice: ReplanChoice): AppEvent =>
  base(ctx, 'replan.resolved', node, { choice });

/**
 * A resolution's full batch.
 *
 * `newDayKey` is required only by `new-date`; the others ignore it. The surface
 * refuses to send `new-date` without one rather than inventing a date, because a
 * date the user did not choose is the app deciding something it has no business
 * deciding.
 */
export function replanEvents(
  ctx: StampContext,
  node: string,
  choice: ReplanChoice,
  passedKind: ClockKind = 'due',
  newDayKey?: string,
): AppEvent[] {
  const r = resolved(ctx, node, choice);
  // RETIRE THE DATE THAT WAS RESOLVED. Without this the passed clock stays live
  // and the card comes straight back, so "resolving" it resolved nothing — the
  // test caught exactly that. Deciding what to do about a date is what makes the
  // old one no longer operative; `clock.cleared` is silent-risk and gated, and
  // every branch below sets its own clock, so the node is never uncovered.
  const retire = base(ctx, 'clock.cleared', node, { clockKind: passedKind });
  switch (choice) {
    case 'compress':
      // "Same commitment, less time." It stays yours and it comes back today,
      // because compressing something means starting it now.
      // Sets `due` again, which replaces the passed one outright, so no separate
      // retirement is needed — and clearing then setting the same key in one
      // batch would be two claims about one fact.
      return [r, base(ctx, 'clock.set', node, {
        clockKind: 'due', at: endOfLocalDay(ctx.at, ctx.zone, 0), source: 'replan:compress',
      })];

    case 'escalate':
      // "This needs someone else." It becomes a waiting-for — an honest change of
      // kind, not a tag — and comes back in three days to check whether it moved.
      return [
        r,
        retire,
        base(ctx, 'node.kind.changed', node, { from: 'action', to: 'waiting-for' }),
        base(ctx, 'clock.set', node, {
          clockKind: 'review', at: endOfLocalDay(ctx.at, ctx.zone, 3), source: 'replan:escalate',
        }),
      ];

    case 'renegotiate':
      // "The date has to move, and someone else has to agree." The conversation
      // is the next action, so it returns tomorrow rather than vanishing until a
      // date nobody has agreed yet.
      return [r, retire, base(ctx, 'clock.set', node, {
        clockKind: 'review', at: endOfLocalDay(ctx.at, ctx.zone, 1), source: 'replan:renegotiate',
      })];

    case 'new-date': {
      // The one branch that needs an answer from the user. Without a date this
      // would be a resolution that resolves nothing, so it refuses rather than
      // guessing — and the gate would refuse it too, one step later.
      if (!newDayKey || !/^\d{4}-\d{2}-\d{2}$/.test(newDayKey)) return [];
      // A new `due` replaces the old one; a passed `suspense` still needs
      // retiring, since the two are different keys.
      const setNew = base(ctx, 'clock.set', node, {
        clockKind: 'due', at: endOfDayKey(newDayKey, ctx.zone), source: 'replan:new-date',
      });
      return passedKind === 'due' ? [r, setNew] : [r, retire, setNew];
    }

    case 'to-menu':
      // "I am not doing this now." ADR-0012 insists this is legitimate and
      // unremarkable, as easy to reach as the others and worded with no more
      // friction — the Menu is exactly the home a non-decision needs (law 6).
      // The passed date goes with it: a Menu item carries no clock by law.
      return [
        r,
        retire,
        base(ctx, 'menu.item.added', node, { category: 'try' as MenuCategory }),
      ];

    default:
      return [r];
  }
}

/** What each choice is called, and what it actually does — the surface shows
 *  both, because a control whose consequence is unclear is expensive for this
 *  audience. Order is ADR-0012's: the three forward options, then a new date,
 *  then the Menu — which is last by position and equal in weight. */
export const REPLAN_CHOICES: { choice: ReplanChoice; label: string; hint: string }[] = [
  { choice: 'compress', label: 'Less of it', hint: 'same commitment, smaller — back today' },
  { choice: 'escalate', label: 'Needs someone else', hint: 'becomes a waiting-for, checked in three days' },
  { choice: 'renegotiate', label: 'Move the date', hint: 'the conversation comes back tomorrow' },
  { choice: 'new-date', label: 'Pick a new date', hint: 'you already know when' },
  { choice: 'to-menu', label: 'Not now', hint: 'onto the Menu — no clock, nothing owed' },
];
