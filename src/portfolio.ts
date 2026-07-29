// The track portfolio (v1 Must).
//
// Some work you do. Some work you **carry** — you are answerable for it, someone
// else executes it, and what you actually hold is a name, a date you owe an
// answer, and a sense of whether it has moved. `project.role.set` has been in the
// vocabulary from the start with exactly that meaning: *"a `track` project emits
// no next actions — only Waiting-Fors and Upkeep check-ins"*.
//
// Nothing folded it, so every project was an execute project and the distinction
// existed only in prose. That matters more than it sounds: Next up offering you a
// "next action" on something you are not the one doing is the app telling you to
// do somebody else's job, and it is the fastest way to stop trusting a surface
// that is supposed to have already decided for you.
//
// PURE. `now` and `zone` are arguments.

import type { NodeState, State } from './fold.ts';
import { heldNodes } from './gate.ts';
import { CONTAINER_KINDS } from './tree.ts';
import { isOpenWaiting, openDays, personName } from './people.ts';
import { calendarDaysBetween, isValidIso, localDayKey } from './time.ts';
import type { NodeKind } from './events.ts';

/** The role a project carries. `execute` is the default and it is STATED rather
 *  than stored — an unanswered question is not a decision. */
export const TRACK = 'track';
export const EXECUTE = 'execute';

export interface TrackLine {
  node: NodeState;
  /** Who is running it, by name. Null when nobody has said, which is a real and
   *  reportable state — a tracked thing with no owner is the classic way one
   *  quietly stops being anybody's. */
  opr: string | null;
  /** The date you owe somebody an answer, as a local day key. */
  suspense: string | null;
  /** Days until that date. Negative means it has gone by (law 3 handles the
   *  card; this is only the number). */
  suspenseDays: number | null;
  /** Open waiting-fors underneath it — the only demand a tracked project makes. */
  waiting: { node: NodeState; days: number | null }[];
  /** When anything under it was last finished. Null when nothing ever has been. */
  lastMovedDays: number | null;
}

export const isTracked = (n: NodeState): boolean =>
  CONTAINER_KINDS.has(n.kind as NodeKind) && n.role === TRACK;

/**
 * Everything you are carrying rather than doing.
 *
 * Soonest answer owed first, then by id so the order is TOTAL — a portfolio that
 * reshuffles between renders is one you have to re-read every time.
 */
export function trackPortfolio(state: State, nowIso: string, zone: string): TrackLine[] {
  const kids = new Map<string, NodeState[]>();
  for (const n of heldNodes(state)) {
    if (!n.parent) continue;
    if (!kids.has(n.parent)) kids.set(n.parent, []);
    kids.get(n.parent)!.push(n);
  }

  const out: TrackLine[] = [];
  for (const n of heldNodes(state)) {
    if (!isTracked(n) || n.lastDone) continue;
    const children = kids.get(n.id) ?? [];
    const s = n.clocks.suspense;
    const hasDate = s && isValidIso(s.at);
    out.push({
      node: n,
      opr: personName(state, n.opr),
      suspense: hasDate ? localDayKey(s.at, zone) : null,
      suspenseDays: hasDate ? calendarDaysBetween(nowIso, s.at, zone) : null,
      waiting: children.filter(isOpenWaiting)
        .map(w => ({ node: w, days: openDays(w, nowIso, zone) }))
        .sort((a, b) => (b.days ?? -1) - (a.days ?? -1) || (a.node.id < b.node.id ? -1 : 1)),
      lastMovedDays: lastMoved(children, nowIso, zone),
    });
  }
  // Something owed on Tuesday outranks something owed next month, and something
  // with no date at all sits last — it is not more relaxed, it is just not
  // asking today.
  return out.sort((a, b) => rank(a) - rank(b) || (a.node.id < b.node.id ? -1 : 1));
}

const rank = (l: TrackLine): number =>
  l.suspenseDays === null ? Number.MAX_SAFE_INTEGER : l.suspenseDays;

function lastMoved(children: NodeState[], nowIso: string, zone: string): number | null {
  let newest: string | null = null;
  for (const c of children) {
    const at = c.lastDone;
    if (at && isValidIso(at) && (!newest || at > newest)) newest = at;
  }
  return newest ? calendarDaysBetween(newest, nowIso, zone) : null;
}

/**
 * What a tracked line says, in one sentence.
 *
 * Facts joined with middots — who, when, what is outstanding. **No adjective
 * anywhere.** The temptation on a portfolio surface is a health word — "at
 * risk", "slipping", "stalled" — and every one of them is this app grading work
 * that somebody else is doing, on evidence it does not have. It states the
 * dates and lets you decide, which is the entire difference between a tool and
 * a dashboard.
 */
export function trackWords(l: TrackLine): string {
  const bits: string[] = [];
  bits.push(l.opr ? `${l.opr} is running it` : 'nobody named yet');
  if (l.suspense) {
    const d = l.suspenseDays;
    bits.push(d === null ? `answer due ${l.suspense}`
      : d < 0 ? `you owed an answer ${l.suspense}`
      : d === 0 ? 'an answer is due today'
      : d === 1 ? 'an answer is due tomorrow'
      : `an answer is due in ${d} days`);
  }
  if (l.waiting.length === 1) bits.push('one thing outstanding');
  else if (l.waiting.length > 1) bits.push(`${l.waiting.length} things outstanding`);
  if (l.lastMovedDays !== null && l.lastMovedDays >= 1) {
    bits.push(l.lastMovedDays === 1 ? 'last moved yesterday' : `last moved ${l.lastMovedDays} days ago`);
  }
  return bits.join(' · ') + '.';
}

/** The count line. A number of things you are carrying, never a workload score. */
export function portfolioWords(n: number): string {
  if (n === 0) return '';
  if (n === 1) return 'One thing you are carrying rather than doing.';
  return `${n} things you are carrying rather than doing.`;
}
