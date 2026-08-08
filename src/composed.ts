// Composed Today (1.6.0, ADR-0051) — a day you chose, by hand, optionally.
//
// OFF BY DEFAULT. Nothing here renders anywhere until the `today` module is
// turned on in the (i) panel's Extras — it was required to be optional — and
// turning it off makes every surface of it vanish while the log keeps its
// honest record.
//
// THE EXPIRY IS THE PROJECTION. `composedFor` is the ONE reader of
// `n.todayFor`, and it answers only for the CURRENT local day: no function
// here takes a day argument, so "what did I choose yesterday and not do" is
// structurally uncomputable — not politely unasked, uncomputable (laws 3 and
// 5). At midnight a choice simply lapses; an unfinished chosen thing goes back
// to being an ordinary held thing with no residue and no fraction anywhere.
//
// Next-up's computed head is UNCHANGED by any of this. The strip frames the
// day; it never replaces the app's offer (ADR-0030 still bans an auto-composed
// or scored day — this is strictly hand-chosen).
//
// PURE. `now` and `zone` are arguments, like every projection here.

import type { NodeState, State } from './fold.ts';
import { heldNodes } from './gate.ts';
import { localDayKey } from './time.ts';
import { isHeld } from './fold.ts';

/** The module name in `State.modules`. */
export const TODAY_MODULE = 'today';

export const todayIsOn = (state: State): boolean => state.modules.has(TODAY_MODULE);

/**
 * A hand fits five. Deliberately below the print card's seven: choosing is a
 * commitment of attention, and a chosen set that needs scrolling has stopped
 * being a choice (law 8's spirit at the day scale).
 */
export const COMPOSED_CAP = 5;

/** May this node be chosen at all? Live, held, and actually doable — the same
 *  bounds sort mode's runway has, minus the kind narrowing: choosing a
 *  container for today is a legitimate way to say "this area, today". */
export const choosable = (n: NodeState): boolean =>
  isHeld(n) && !n.lastDone && n.onMenu === null
  // `journal` and `anchor` joined in 1.17.2. Both are demand-free kinds whose
  // whole point is that nothing is ever done to them — a private entry and a
  // named period have no business in a hand of five things chosen for today,
  // and offering the verb put an anchor reached through search one tap from the
  // composed strip. `resume-card` deliberately stays choosable: "pick that
  // thread back up today" is a legitimate choice about a legitimate thing.
  && !['person', 'bother', 'pebble', 'journal', 'anchor'].includes(n.kind);

/**
 * Today's chosen set — the one reader. Chosen-for-today, still live, oldest
 * choice first (the stamp order, so the set is stable across repaints).
 */
export function composedFor(state: State, nowIso: string, zone: string): NodeState[] {
  const today = localDayKey(nowIso, zone);
  return heldNodes(state)
    .filter(n => n.todayFor === today && choosable(n))
    .sort((a, b) => {
      const sa = a.stamps['today'], sb = b.stamps['today'];
      if (sa && sb) {
        if (sa[0] !== sb[0]) return sa[0] < sb[0] ? -1 : 1;
        if (sa[1] !== sb[1]) return sa[1] < sb[1] ? -1 : 1;
        return sa[2] - sb[2];
      }
      return a.id < b.id ? -1 : 1;
    });
}

/**
 * Is this in today's chosen set?
 *
 * Exists so the ONE-reader claim above stays literally true (1.9.2). A
 * `n.todayFor === localDayKey(...)` in a surface is a SECOND derivation of
 * "chosen", not a use of the first — it agreed with this one, which is exactly
 * how a claim rots without anyone noticing.
 */
export const chosenToday = (state: State, id: string, nowIso: string, zone: string): boolean =>
  composedFor(state, nowIso, zone).some(n => n.id === id);

/** Is today full? Asked before offering the choose verb — at the cap the
 *  button states it in words and disables, never fails after a tap. */
export const composedFull = (state: State, nowIso: string, zone: string): boolean =>
  composedFor(state, nowIso, zone).length >= COMPOSED_CAP;
