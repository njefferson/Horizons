// Focus, interruption, and the thread you get back (v1 Must).
//
// The vocabulary has carried `focus.started`, `focus.ended`, `interrupt.captured`
// and the three `resume.card.*` nouns since the first draft. `fold` retired a
// spent card and `nextup` ranked one second, behind only a hard date — and
// NOTHING could create one, so the entire tier was dead code ranking an empty
// set. This is the surface that fills it.
//
// The design turns on one observation about how focus actually breaks. It does
// not break by you deciding to stop; it breaks by someone standing in the
// doorway. You do not get to press a button on the way out. So:
//
//   **the resume card is written the instant the interruption is recorded**,
//   not when focus ends.
//
// From that moment the thread is safe — the app can be closed, backgrounded,
// killed by the OS, or the device can die, and coming back still says where you
// were. A design that created the card on `focus.ended` would work perfectly in
// every case except the one it exists for.
//
// While the focus is still running the card stays out of your way: it is for a
// thread you have not actually lost yet. `pendingFor` is what Next up filters
// on, and it is a fact about the CURRENT focus, so it needs no event of its own.
//
// PURE. `now` is an argument.

import type { NodeState, State } from './fold.ts';
import { isValidIso } from './time.ts';
import { isGone, isHeld } from './fold.ts';

export interface FocusView {
  /** What is being worked on, or null when nothing is. */
  node: NodeState | null;
  /** How long it has been, in whole minutes. Null when the clock cannot be
   *  trusted — a stored instant that will not parse is silence, not a zero. */
  minutes: number | null;
  /** Interruptions recorded during THIS focus session. */
  interrupted: NodeState[];
}

export interface ResumeCard {
  /** The card node itself — a real node, so it holds a clock like anything else. */
  card: NodeState;
  /** The work it holds the thread of. */
  target: NodeState;
  /** The five-word "I was about to…", or null. Null is unremarkable. */
  cue: string | null;
}

/** What is running right now. */
export function focusView(state: State, nowIso: string): FocusView {
  const f = state.focus;
  if (!f) return { node: null, minutes: null, interrupted: [] };
  const node = state.nodes.get(f.node) ?? null;
  if (isGone(node)) {
    // The thing being focused was let go from somewhere else. Report no focus
    // rather than a focus on nothing — a surface built around a null title is
    // how a projection kills the app it renders.
    return { node: null, minutes: null, interrupted: [] };
  }
  return { node, minutes: elapsedMinutes(f.startedAt, nowIso), interrupted: interruptedDuring(state, f) };
}

/** Whole minutes between two instants, or null if either cannot be read. Never
 *  negative: a clock that went backwards (a device time change mid-session) is
 *  reported as zero rather than as a negative age nobody can act on. */
export function elapsedMinutes(fromIso: string, nowIso: string): number | null {
  if (!isValidIso(fromIso) || !isValidIso(nowIso)) return null;
  const ms = Date.parse(nowIso) - Date.parse(fromIso);
  return Math.max(0, Math.floor(ms / 60_000));
}

/** Interruptions written during the running session, newest last. */
function interruptedDuring(state: State, f: NonNullable<State['focus']>): NodeState[] {
  const out: NodeState[] = [];
  for (const n of state.nodes.values()) {
    if (isGone(n)) continue;
    if (n.interruptedFocus !== f.node) continue;
    if (!n.interruptedAt || n.interruptedAt < f.startedAt) continue;   // an earlier session's
    out.push(n);
  }
  return out.sort((a, b) => (a.interruptedAt! < b.interruptedAt! ? -1 : 1));
}

/**
 * Live resume cards, each paired with the work it holds.
 *
 * A card whose target is gone is NOT returned — a thread back to something that
 * was let go is not a thread, and offering it would be the app asking you to
 * pick up work you have already decided against.
 *
 * `pendingFor` excludes the card belonging to a focus that is still running.
 * It is not lost yet, so it is not offered back.
 */
export function resumeCards(state: State, pendingFor: string | null = null): ResumeCard[] {
  const out: ResumeCard[] = [];
  for (const n of state.nodes.values()) {
    if (n.kind !== 'resume-card') continue;
    if (isGone(n) || n.resumeSpent) continue;
    if (!n.resumeFor) continue;
    if (n.resumeFor === pendingFor) continue;
    const target = state.nodes.get(n.resumeFor);
    if (!isHeld(target) || target.lastDone) continue;
    out.push({ card: n, target, cue: n.resumeCue });
  }
  return out.sort((a, b) => (a.card.id < b.card.id ? -1 : 1));
}

/** The card belonging to a node, if one is waiting. */
export const resumeCardFor = (state: State, nodeId: string): ResumeCard | null =>
  resumeCards(state).find(c => c.target.id === nodeId) ?? null;

/**
 * What the card says.
 *
 * With a cue it repeats YOUR words back, because five words you wrote are worth
 * more than any sentence this app could compose. Without one it says where you
 * were and stops — it does not fill the gap with an apology for the gap.
 */
export function resumeWords(c: ResumeCard): string {
  return c.cue ? `You were about to: ${c.cue}` : 'Picking this back up.';
}

/** How long you were at it, in words. Silence under a minute: "0 minutes" is a
 *  number pretending to be information. */
export function focusWords(minutes: number | null): string | null {
  if (minutes === null || minutes < 1) return null;
  if (minutes === 1) return 'One minute so far.';
  if (minutes < 60) return `${minutes} minutes so far.`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const hours = h === 1 ? 'One hour' : `${h} hours`;
  return m === 0 ? `${hours} so far.` : `${hours} ${m} min so far.`;
}

/** What to say about interruptions taken during this session. A count of things
 *  you WROTE DOWN, which is a thing you did, not a thing you failed at. */
export function interruptWords(n: number): string | null {
  if (n <= 0) return null;
  if (n === 1) return 'One thing came up and is held.';
  return `${n} things came up and are held.`;
}
