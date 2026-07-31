// Resolving a replan card (ADR-0012, product law 3).
//
// Every option is FORWARD-FACING. There is deliberately no "mark as missed",
// because that is filing rather than deciding, and filing is what produces the
// bucket law 3 forbids.
//
// `replan.resolved` is silent-risk and gated: the chosen option must itself set a
// clock or land the item on the Menu, so there is no resolution that produces
// silence (ADR-0011). Each branch below sets its own destination rather than
// relying on the gate to decide one — the same principle as the clarify routes
// (ADR-0029): the choice knows where the item belongs and a generic cure does not.
//
// That is NOT the same as saying the gate stays out of it, and an earlier version
// of this comment claimed it did. Three branches emit `clock.cleared`, which is
// itself silent-risk, so the gate does attach a cure to those batches. For
// `escalate` and `renegotiate` the branch's own `clock.set` wins on LWW and the
// cure is invisible; for `to-menu` the cure is what the node ends up wearing
// (audit). The branch decides WHERE it goes; the gate guarantees it is covered
// while it gets there.
//
// These build events; they never touch the store.

import type { AppEvent, ClockKind, MenuCategory, NodeKind, ReplanChoice } from '../events.ts';
import type { StampContext } from './session.ts';
import { endOfLocalDay } from '../time.ts';
import { endOfDayKey } from './detail-intents.ts';

const base = (ctx: StampContext, kind: string, node: string, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

const resolved = (ctx: StampContext, node: string, choice: ReplanChoice): AppEvent =>
  base(ctx, 'replan.resolved', node, { choice });

/** A day key the app is willing to act on. ONE definition, asked by both the
 *  builder below and the surface — the surface has to know whether a choice can
 *  be acted on before it commits, and a second regex somewhere else is how the
 *  two come to disagree about what a date is. */
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A day the app is willing to act on. A `<input type="date">` yields '' when
 *  empty or unparseable, so "the box has something in it" is not the question. */
const isDayKey = (v: string | undefined): v is string => DAY_KEY.test(v ?? '');

/** Can this choice be acted on with what the user has given? Only `new-date`
 *  can answer no, and it refuses rather than inventing a date — a date the user
 *  did not choose is the app deciding something it has no business deciding. */
export const canResolve = (choice: ReplanChoice, newDayKey?: string): boolean =>
  choice !== 'new-date' || isDayKey(newDayKey);

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
  passedKinds: readonly ClockKind[] = ['due'],
  newDayKey?: string,
  fromKind: NodeKind = 'action',
  /** EVERY demand clock the node carries right now (`demandClocksOf`), not just
   *  the passed ones — `to-menu` must shed them all, or the gate's Menu belt
   *  (1.3.1) rightly refuses the landing: a node with a passed due AND a future
   *  suspense would otherwise reach the Menu still owing somebody an answer. */
  demandClocks: readonly ClockKind[] = [],
): AppEvent[] {
  const r = resolved(ctx, node, choice);
  // RETIRE EVERY DATE THAT WENT BY — all of them, not the one the card happened
  // to name. Without this the passed clock stays live and the card comes
  // straight back, so "resolving" it resolved nothing.
  //
  // It took ALL of them only after two independent audits: the first version
  // retired a single `passedKind`, so a node carrying both a passed `due` and a
  // passed `suspense` was re-raised immediately for four of the five options —
  // buttons that did nothing while announcing that they had. Deciding what to do
  // about a date is what makes the old ones no longer operative.
  //
  // `clock.cleared` is silent-risk and gated; every branch below sets its own
  // clock, so the node is never uncovered.
  const retire = (kinds: readonly ClockKind[]): AppEvent[] =>
    kinds.map(k => base(ctx, 'clock.cleared', node, { clockKind: k }));
  // For the branches that SET a `due`: a new `due` replaces the old one outright,
  // so clearing and setting the same key in one batch would be two claims about
  // one fact. Every OTHER passed clock still needs retiring — they are different
  // keys, and that is precisely what the single-clock version got wrong.
  const retireOthers = retire(passedKinds.filter(k => k !== 'due'));
  switch (choice) {
    case 'compress':
      // "Same commitment, less time." It stays yours and it comes back today,
      // because compressing something means starting it now.
      //
      // This branch used to emit NO retirement at all, reasoning that setting
      // `due` replaces the passed one. True only when the passed clock WAS the
      // `due`. Raised by a passed `suspense`, compress left it live and the card
      // returned on the next render — a button that did nothing while announcing
      // "back today, smaller" (audit, found independently twice).
      return [r, ...retireOthers, base(ctx, 'clock.set', node, {
        clockKind: 'due', at: endOfLocalDay(ctx.at, ctx.zone, 0), source: 'replan:compress',
      })];

    case 'escalate':
      // "This needs someone else." It becomes a waiting-for — an honest change of
      // kind, not a tag — and comes back in three days to check whether it moved.
      return [
        r,
        ...retire(passedKinds),
        // The kind it is changing FROM, not a guess. Hard-coding `'action'` wrote
        // a transition that never happened into an append-only log — permanent,
        // and `fold` cannot correct it — for any node that had been made an
        // upkeep or a waiting-for. `routeEvents` already took this parameter for
        // exactly this reason; this did not copy it across (audit).
        base(ctx, 'node.kind.changed', node, { from: fromKind, to: 'waiting-for' as NodeKind }),
        base(ctx, 'clock.set', node, {
          clockKind: 'review', at: endOfLocalDay(ctx.at, ctx.zone, 3), source: 'replan:escalate',
        }),
      ];

    case 'renegotiate':
      // "The date has to move, and someone else has to agree." The conversation
      // is the next action, so it returns tomorrow rather than vanishing until a
      // date nobody has agreed yet.
      return [r, ...retire(passedKinds), base(ctx, 'clock.set', node, {
        clockKind: 'review', at: endOfLocalDay(ctx.at, ctx.zone, 1), source: 'replan:renegotiate',
      })];

    case 'new-date': {
      // The one branch that needs an answer from the user. Without a date this
      // would be a resolution that resolves nothing, so it refuses rather than
      // guessing — and the gate would refuse it too, one step later.
      if (!isDayKey(newDayKey)) return [];
      const setNew = base(ctx, 'clock.set', node, {
        clockKind: 'due', at: endOfDayKey(newDayKey, ctx.zone), source: 'replan:new-date',
      });
      return [r, ...retireOthers, setNew];
    }

    case 'to-menu':
      // "I am not doing this now." ADR-0012 insists this is legitimate and
      // unremarkable, as easy to reach as the others and worded with no more
      // friction — the Menu is exactly the home a non-decision needs (law 6).
      //
      // The passed DATES go with it, so nothing on the Menu is still under a
      // commitment that has gone by. Note what this does NOT claim: the node is
      // not left clockless. `clock.cleared` is silent-risk, so the gate covers it
      // with a `review` cure and the node lands on the Menu wearing one. Law 6
      // and ADR-0014 govern clocks on demand-free KINDS, not on Menu membership,
      // so the earlier comment here — "a Menu item carries no clock by law" —
      // cited a law that says no such thing, about a state the code does not
      // produce (audit).
      return [
        r,
        base(ctx, 'menu.item.added', node, { category: 'try' as MenuCategory }),
        // Menu first, then the clears (no junk cure between); ALL demand clocks
        // go, not only the passed ones — see the parameter note.
        ...retire([...new Set([...passedKinds, ...demandClocks])]),
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
  // "no clock" was removed from this hint because it was not true: the gate
  // covers the cleared date with a review cure, so the item does still carry a
  // clock. "Nothing owed" is the part that is real, and it is the part that
  // matters — the Menu is demand-free (audit).
  { choice: 'to-menu', label: 'Not now', hint: 'onto the Menu — nothing owed, no date to meet' },
];
