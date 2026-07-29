// The person lens (v1 Must).
//
// `person.created`, `person.linked`, `waiting.opened` and `waiting.closed` have
// been in the vocabulary from the start. Only `person.created` was ever folded,
// and nothing could emit even that — so clarify's "Waiting for" route changed a
// node's kind to say *someone else owes you this* and never asked who.
//
// That is the gap this closes, and the reason it matters is not filing. It is
// that "what am I waiting on Sam for" is a question you get asked out loud, in a
// corridor, with no time to look anything up. Work sorted by project cannot
// answer it. This is the same set of nodes, sliced the way the question arrives.
//
// PURE. `now` and `zone` are arguments.

import type { NodeState, State } from './fold.ts';
import { heldNodes } from './gate.ts';
import { calendarDaysBetween, isValidIso } from './time.ts';

/** The vocabulary's closed relation set. */
export const RELATIONS = ['opr', 'stakeholder', 'waiting-on', 'requested-by', 'mentioned'] as const;
export type Relation = typeof RELATIONS[number];

export interface PersonLine {
  node: NodeState;
  relation: Relation | string;
  /** For a waiting-for: how long it has been open, in calendar days. Null when
   *  nobody recorded a start, which is ordinary. */
  days: number | null;
}

export interface PersonView {
  person: NodeState;
  /** What they owe you. */
  owes: PersonLine[];
  /** What you owe them, or where they are otherwise attached. */
  involves: PersonLine[];
  /** Everything, for a count that is never a lie by omission. */
  total: number;
}

const alive = (n: NodeState): boolean => !n.trashed && !n.mergedInto;

/** Every person node in the vault, by name. */
export function people(state: State): NodeState[] {
  return [...state.nodes.values()]
    .filter(n => n.kind === 'person' && alive(n))
    .sort((a, b) => (a.title || '').localeCompare(b.title || '') || (a.id < b.id ? -1 : 1));
}

/** Is this a waiting-for that is still open? A closed one is history: it
 *  happened, the log says so, and it is not something you are still owed. */
export const isOpenWaiting = (n: NodeState): boolean =>
  n.kind === 'waiting-for' && alive(n) && !n.lastDone && !n.waitingOutcome;

/**
 * Everything attached to one person.
 *
 * `owes` is the half people actually come here for. It is built from the
 * waiting-for kind AND the `waiting-on` relation, because those are two ways of
 * saying the same thing and an app that showed only one of them would be right
 * half the time — which is worse than being wrong, because you would trust it.
 */
export function personView(state: State, personId: string, nowIso: string, zone: string): PersonView | null {
  const person = state.nodes.get(personId);
  if (!person || !alive(person)) return null;

  const owes: PersonLine[] = [];
  const involves: PersonLine[] = [];

  for (const n of heldNodes(state)) {
    if (n.id === personId) continue;
    const links = n.people.filter(l => l.person === personId);
    const owed = isOpenWaiting(n) && (n.waitingOn === personId || links.some(l => l.relation === 'waiting-on'));
    if (owed) {
      owes.push({ node: n, relation: 'waiting-on', days: openDays(n, nowIso, zone) });
      continue;
    }
    for (const l of links) {
      involves.push({ node: n, relation: l.relation, days: null });
    }
  }

  const byId = (a: PersonLine, b: PersonLine): number => (a.node.id < b.node.id ? -1 : 1);
  // Longest-waiting first: the thing you have been owed for three weeks is the
  // thing worth mentioning when you next see them. Ties fall back to id, so the
  // order is TOTAL and two renders of one state never disagree.
  owes.sort((a, b) => (b.days ?? -1) - (a.days ?? -1) || byId(a, b));
  involves.sort(byId);
  return { person, owes, involves, total: owes.length + involves.length };
}

/** How long a waiting-for has been open. Null when nobody said when it started —
 *  silence beats a number derived from nothing. */
export function openDays(n: NodeState, nowIso: string, zone: string): number | null {
  const since = n.waitingSince;
  if (!since || !isValidIso(since)) return null;
  return calendarDaysBetween(since, nowIso, zone);
}

/**
 * Everything you are owed, by anybody — including the ones nobody has put a name
 * to. Those are NOT hidden: an unattributed waiting-for is the commonest kind,
 * because the route that creates one is a single tap, and dropping it from the
 * one surface that lists what you are owed would make that surface quietly
 * incomplete.
 */
export function waitingOnAnyone(state: State, nowIso: string, zone: string): PersonLine[] {
  const out: PersonLine[] = [];
  for (const n of heldNodes(state)) {
    if (!isOpenWaiting(n)) continue;
    out.push({ node: n, relation: 'waiting-on', days: openDays(n, nowIso, zone) });
  }
  return out.sort((a, b) => (b.days ?? -1) - (a.days ?? -1) || (a.node.id < b.node.id ? -1 : 1));
}

/** The name to show for whoever a waiting-for is with. */
export function withWhom(state: State, n: NodeState): string | null {
  const id = n.waitingOn ?? n.people.find(l => l.relation === 'waiting-on')?.person ?? null;
  if (!id) return null;
  const p = state.nodes.get(id);
  return p && alive(p) ? (p.title || '(unnamed)') : null;
}

/**
 * How long, in words.
 *
 * A DURATION and never a verdict. "Three weeks" is a fact about a date; "chased
 * three times" or "overdue from Sam" would be this app keeping score on someone
 * else's behalf, and it does not keep score on anybody's.
 */
export function waitingWords(days: number | null): string | null {
  if (days === null || days < 1) return null;
  if (days === 1) return 'since yesterday';
  if (days < 14) return `for ${days} days`;
  const weeks = Math.floor(days / 7);
  return weeks === 2 ? 'for a fortnight' : `for ${weeks} weeks`;
}

/** The count line for the lens. A number of open threads, never a scorecard. */
export function peopleWords(total: number): string {
  if (total === 0) return 'Nothing is with anyone right now.';
  if (total === 1) return 'One thing is with someone else.';
  return `${total} things are with other people.`;
}
