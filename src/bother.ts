// Bothers: the thing gnawing at you that is not a task (v1.5).
//
// `bother.received`, `bother.owned` and `bother.routed` have been in the
// vocabulary from the first draft. `fold` handles `bother.received` and the gate
// carries cures for all three — *"bother must terminate in a route or a park"* —
// and nothing could emit any of them. The sixth capability in this app specified
// completely and reachable from nowhere.
//
// **The thing this exists for is not capture.** You can already write down a
// task. What you cannot write down is *"the thing with the roof"*, which is not
// a task, has no next action, and is taking up the whole of your head. Told to
// enter it as a task, you either invent a fake next action you will not do, or
// you do not enter it and carry it around instead.
//
// So a bother is entered as what it is, and then asked ONE question before it is
// asked to become anything:
//
//   **whose is this?**
//
// `mine-to-solve` · `mine-to-track` · **`not-mine-to-carry`**
//
// That third option is the reason the flow is worth building. Almost no planner
// can express it, so almost every planner quietly assumes everything you think
// about is yours to do something about — and for this audience that assumption
// is most of the load. Naming a thing as *not yours* is a real outcome, and the
// app treats it as one rather than as a failure to plan.
//
// PURE. `now` and `zone` are arguments.

import type { NodeState, State } from './fold.ts';
import { heldNodes } from './gate.ts';
import type { Ownership } from './events.ts';

export const OWNERSHIPS: readonly Ownership[] = [
  'mine-to-solve', 'mine-to-track', 'not-mine-to-carry',
];

/** What each choice says, and what it will do. The hint is not decoration: a
 *  forced choice with unlabelled consequences is a guess, and this is the one
 *  question the whole flow turns on. */
export const OWNERSHIP_WORDS: Record<Ownership, { label: string; hint: string }> = {
  'mine-to-solve': {
    label: 'Mine to do something about',
    hint: 'it goes to your inbox, and you sort it like anything else',
  },
  'mine-to-track': {
    label: 'Mine to keep an eye on',
    hint: 'no action yet — it comes back to you in a week',
  },
  'not-mine-to-carry': {
    label: 'Not mine to carry',
    hint: 'it is let go, and it does not come back',
  },
};

export interface Bother {
  node: NodeState;
  /** Whose it is, once that has been said. Null while the question is open. */
  ownership: Ownership | null;
}

const alive = (n: NodeState): boolean => !n.trashed && !n.mergedInto;

/**
 * Bothers that have not yet been through the flow.
 *
 * A bother leaves this list by being ROUTED — becoming ordinary work, being
 * parked to look at later, or being let go. It cannot leave any other way, which
 * is what the vocabulary means by *"must terminate in a route or a park"*.
 */
export function openBothers(state: State): Bother[] {
  return heldNodes(state)
    .filter(n => n.kind === 'bother' && alive(n) && !n.botherRouted)
    .map(n => ({ node: n, ownership: (n.ownership as Ownership | null) ?? null }))
    // Oldest first, by id. One at a time, like triage — a list of worries is a
    // worse object than any single worry on it.
    .sort((a, b) => (a.node.id < b.node.id ? -1 : 1));
}

/** The one being asked about now, or null. */
export const currentBother = (state: State): Bother | null => openBothers(state)[0] ?? null;

/** How many are waiting. Stated, so the one-at-a-time surface is not a lie by
 *  omission — but never listed. */
export const botherCount = (state: State): number => openBothers(state).length;

/**
 * The prompt.
 *
 * It asks whose the thing is and **does not ask what you are going to do about
 * it**. That ordering is the whole design: asking for a next action first is
 * what makes people invent one, and an invented next action is a lie you then
 * have to live beside on a list you are meant to trust.
 */
export function botherPrompt(b: Bother): string {
  return b.ownership === null ? 'Whose is this?' : 'What now?';
}

/** The count line. Plain, and it does not call them problems. */
export function botherWords(n: number): string {
  if (n <= 0) return '';
  if (n === 1) return 'One thing on your mind.';
  return `${n} things on your mind. One at a time.`;
}

/**
 * What happened, in words, once a bother is routed.
 *
 * `not-mine-to-carry` gets the plainest sentence in the app, deliberately.
 * There is no "well done", no "that's the spirit" and no softening — a
 * congratulation would make the decision into a performance, and the point is
 * that it was allowed to be ordinary.
 */
export function outcomeWords(o: Ownership): string {
  if (o === 'mine-to-solve') return 'In your inbox. Sort it whenever you get to it.';
  if (o === 'mine-to-track') return 'Nothing to do yet. It comes back to you in a week.';
  return 'Let go.';
}
