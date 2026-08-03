// Clearing things out (roadmap item Noah asked for: "the ability to purge the
// whole set of tasks").
//
// Noah, on how it should feel: *"I feel like both should be available so the user
// has control of their data"* and *"there should be a verification that prevents it
// from being easily done, however, and it should recommend a back up being done
// before it happens with a button available at that point."*
//
// ## Two modes, because they are genuinely different promises
//
// **Clear what I am holding** — every held thing is trashed. The surfaces empty,
// and the log still contains every event that ever happened, so nothing is lost
// and an export taken afterwards still carries the history. This is the mode that
// keeps law 9 unqualified.
//
// **Start again** — the store is replaced with an empty one. The history goes with
// it. This is the only operation in this app that destroys data on purpose, and it
// is therefore the only one that has to be hard to do by accident.
//
// Offering only the first would be dishonest about what people actually want (a
// planner you cannot ever truly empty is a planner accumulating a permanent
// record of a bad month). Offering only the second would make "clear the list" cost
// the history. So: both, named for what they do, and the difference stated in the
// words rather than in a footnote.
//
// ## The verification is a typed word, deliberately not a held button
//
// Hold-to-confirm is a dexterity test, and tremor is a supported condition here —
// a guard that a shaking hand cannot pass is a guard that locks somebody out of
// their own data. Typing a short word is a test of INTENT, which is the thing
// actually being checked.
//
// The two modes take DIFFERENT words, and that is load-bearing: with one shared
// word, typing it for the reversible mode and then switching mode would carry the
// authorisation across to the irreversible one. Somebody would lose their history
// to a control they had already satisfied for something else.
//
// PURE. `now` and the stamping context are injected; nothing here touches a store.

import type { AppEvent } from './events.ts';
import { heldNodes } from './gate.ts';
import type { State } from './fold.ts';
import { clearSyncKeys } from './sync-keys.ts';

export type PurgeMode = 'clear' | 'start-again';

/** What each mode is called, in the app's own voice. Never "delete", never "wipe":
 *  one is emptying a surface and the other is starting over, and neither is an act
 *  of violence against a database. */
export const PURGE_LABEL: Record<PurgeMode, string> = {
  'clear': 'Clear what I am holding',
  'start-again': 'Start again from empty',
};

/**
 * The word each mode requires. Different on purpose.
 *
 * With one shared word, typing it for the reversible mode and then switching to
 * the irreversible one would carry the authorisation across — somebody would lose
 * their history to a control they had already satisfied for something else.
 */
export const CONFIRM_WORD: Record<PurgeMode, string> = {
  'clear': 'clear',
  'start-again': 'erase',
};

/** Forgiving of case and surrounding space, and of nothing else. The point is
 *  deliberateness, not dexterity or spelling under pressure. */
export function confirmMatches(mode: PurgeMode, typed: string): boolean {
  return typed.trim().toLowerCase() === CONFIRM_WORD[mode];
}

export interface PurgeCount {
  /** Things currently held — the WIDE count (`heldNodes`): people, weights,
   *  private entries and periods included, deliberately wider than the
   *  gauge's `heldWork` (1.15.1), because clearing empties everything. The
   *  words that render it must NAME that width (1.17.4): this number sits on
   *  the same panel as the "Things held" row, and two "things" numbers that
   *  disagree without saying why is the panel telling two stories. */
  things: number;
  /** Of those, ones never sorted. Counted separately because losing something you
   *  never even read is a different loss from losing something you decided about. */
  unsorted: number;
  /** Events in the log — what "start again" would destroy and "clear" would keep. */
  events: number;
}

/**
 * The real numbers, counted from the state and the log.
 *
 * Never an estimate and never a rounded one. A confirmation that says "this will
 * remove a lot of items" is a confirmation that has told you nothing, and the
 * number is the single most persuasive thing on the screen at that moment.
 */
export function purgeCount(state: State, events: readonly AppEvent[]): PurgeCount {
  const held = heldNodes(state);
  return {
    things: held.length,
    // A capture not yet routed IS the inbox — not "anything unrouted", which
    // would count people and anchors that were never meant to be sorted.
    unsorted: held.filter(n => n.captured && n.route === null).length,
    events: events.length,
  };
}

/**
 * The events for `clear`.
 *
 * One `node.trashed` per thing not already let go. A trashed node is not silent
 * (an explicit end is a decision, not a silence), and because this is only ever
 * an append, the history survives and the whole operation is inspectable
 * afterwards.
 *
 * **Not `heldNodes`** — that was the bug (1.9.2, F-I). A node folded into
 * another is not HELD, but it is not finished with either: `isSilent` rides the
 * merge chain, so trashing the survivor while leaving the folded-away source
 * alone made that source silent, and the whole-batch belt refused the write.
 * "Clear what I am holding" was therefore impossible for anyone who had folded
 * a duplicate and left it folded. This comment used to end "so this cannot
 * violate law 1", which was true when it was written, in 1.5.0, and stopped
 * being true in 1.7.0 when folding a duplicate shipped — nobody edited the
 * claim because nobody had reason to look at it. Clearing means clearing:
 * everything that has not already been let go is let go, folded or not.
 *
 * `start-again` produces NO events by design: there is nowhere to put them, since
 * the store they would describe is the one being replaced. The fresh store records
 * `import.seeded` instead, which is the existing noun for "this store began here".
 */
export function clearEvents(
  ctx: { at: string; device: string; vault: string; seq: () => number; id: () => string },
  state: State,
): AppEvent[] {
  return [...state.nodes.values()]
    .filter(n => !n.trashed)
    .sort((a, b) => (a.id < b.id ? -1 : 1))       // a total order, like every batch here
    .map(n => ({
      id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
      kind: 'node.trashed', node: n.id, payload: { reason: 'cleared' },
    } as unknown as AppEvent));
}

/** What `start again` needs of a store: forget the pairing, then replace the log. */
export interface ErasableStore {
  setKv(key: string, value: unknown): Promise<void>;
  replaceAll(events: readonly AppEvent[]): Promise<void>;
}

/**
 * Start again from empty — the whole operation, in the only safe order.
 *
 * ## Unpairing is part of erasing, not a separate courtesy
 *
 * `replaceAll([])` clears the events and snapshots and NOTHING else, so an erased
 * device used to stay paired. On the next open it exchanged with a relay still
 * holding up to thirty days of its own sealed history — and with a peer holding
 * all of it — and the empty planner refilled itself. No attacker and no
 * malfunction: an honest relay doing exactly its job, undoing the one operation
 * in this app whose entire purpose is to destroy data.
 *
 * A control that does not do what its own confirmation promised is worse than a
 * missing control, because somebody acted on the promise.
 *
 * ## The order is the safety
 *
 * Unpair FIRST, then wipe. If the wipe fails afterwards the device is unpaired
 * with its data intact — inconvenient, and safe. The reverse order fails the
 * other way: data destroyed, pairing alive, history flowing back in. When one
 * ordering can only cost convenience and the other can only cost the point of the
 * operation, there is no trade-off to weigh.
 *
 * It does NOT reach the other device. That is stated in the words rather than
 * attempted here — a control on this device cannot honestly promise to empty one
 * sitting in another room.
 */
export async function eraseEverything(store: ErasableStore): Promise<void> {
  await clearSyncKeys(store);
  await store.replaceAll([]);
}

/**
 * What the confirmation says.
 *
 * It states the count, states what survives, and states plainly whether a copy has
 * been saved — because Noah asked for the backup to be RECOMMENDED with a button
 * there, and a recommendation nobody acted on has to still be visible at the
 * moment of the decision. It does not scold and it does not block: an adult who
 * has read an accurate sentence is allowed to proceed.
 */
export function purgeWords(mode: PurgeMode, count: PurgeCount, savedACopy: boolean, paired = false): string {
  const things = count.things === 1 ? '1 thing' : `${count.things} things`;
  // Said HERE, at the moment of the decision, because it changes what the button
  // does. Erasing unpairs — it has to, or the other device fills this one back up
  // — and it cannot reach into the other device. Somebody who wants both empty
  // has to do it on both, and finding that out afterwards would be finding out
  // that the control did not mean what it said.
  const pairing = mode === 'start-again' && paired
    ? ' It also unpairs this device, so it stops syncing: without that, the other device would simply fill this one back up. The other device keeps its own copy — to empty that one too, do this again over there.'
    : '';
  const body = mode === 'clear'
    ? `This clears ${things} — everything you are keeping here, people, weights and private entries included, not only the work the gauge counts. Everything that happened stays in the log, so a copy you export afterwards still has all of it.`
    : `This replaces everything with an empty planner — ${things} and all ${count.events} records of what happened. It cannot be undone from inside the app.${pairing}`;
  const copy = savedACopy
    ? 'You have saved a copy.'
    : mode === 'clear'
      ? 'You have not saved a copy, though this one keeps your history either way.'
      : 'You have not saved a copy, and this is the one that needs it.';
  return `${body} ${copy}`;
}

/** The one line above the button, before anything is chosen. Says the count
 *  AND what it counts — everything kept, not only the work the gauge counts —
 *  because this number shares a panel with the "Things held" row and the two
 *  may not silently disagree (1.17.4). The consequences belong beside the
 *  mode that carries them. */
export function purgeSummary(count: PurgeCount): string {
  if (count.things === 0) return 'There is nothing here to clear.';
  const things = count.things === 1 ? '1 thing' : `${count.things} things`;
  return count.unsorted > 0
    ? `${things} kept here — people, weights and private entries included — ${count.unsorted} of them never sorted.`
    : `${things} kept here — people, weights and private entries included.`;
}

/** After the fact, and it says which mode ran — the two outcomes are different
 *  enough that one shared "done" would be a small lie about what happened. */
export function purgedWords(mode: PurgeMode, count: PurgeCount, wasPaired = false): string {
  if (mode === 'clear') {
    return `Cleared. ${count.things === 1 ? 'One thing' : `${count.things} things`} came off your surfaces; the history is untouched.`;
  }
  return wasPaired
    ? 'Started again. This planner is empty, and this device is no longer paired — pair it again when you want the two back in step.'
    : 'Started again. This planner is empty.';
}
