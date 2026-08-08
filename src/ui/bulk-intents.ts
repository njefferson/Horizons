// Wholesale acts on a named range (1.5.0, ADR-0049).
//
// A bulk act is EXACTLY the events the single act writes, once per item, with
// one addition: a `range.acted` receipt written FIRST in each chunk, carrying
// the LITERAL sentence the user agreed to — so the log explains the pile of
// ordinary events that follows it. Byte-parity with the single intents is a
// property test; nothing here invents a second dialect.
//
// THE PREVIEW IS THE DRY RUN. `planBulk` builds the real per-item event lists
// and the preview sentence is counted from them; `runBulk` commits the same
// plan in chunks. Between plan and each chunk the world may move — the sheet
// is reachable, another device may sync — so every chunk RE-CHECKS each item
// against live state (the 1.3.1 fresh-check CRITICAL, at range scale) and
// skips-and-counts anything no longer eligible. A skip is stated in the
// receipt, never silent.
//
// Chunks ride `session.commit` sequentially — the session's promise queue
// makes that safe and re-reads the seq floor per chunk — and a failed chunk
// leaves a truthful state, a known-good prefix, and a stated partial receipt.
//
// UNDO is a reverse batch through the gate, chunked the same way, from
// per-item facts captured AT ACT TIME (the prior parent, the prior category).
// What it cannot restore it says in words: demand clocks cleared on the way to
// the Menu do not come back — the gate's belt is why they were cleared at all.

import type { AppEvent, ClockKind, MenuCategory, NodeId } from '../events.ts';
import type { NodeState, State } from '../fold.ts';
import type { Session, StampContext } from './session.ts';
import { sortable } from '../range.ts';
import { foldedInto } from '../merged.ts';
import { demandClocksOf } from './triage-intents.ts';
import { endOfDayKey } from './detail-intents.ts';
import { wouldParentCycle } from '../tree.ts';
import { passedHardClocks, type Passed } from '../replan.ts';
import { replanEvents } from './replan-intents.ts';
import { isHeld, isGone } from '../fold.ts';

export type BulkVerb = 'put-under' | 'to-menu' | 'park' | 'let-go' | 'bring-back' | 'new-date' | 'put-down';

/** The verbs a range family may face — never offer what the gate must refuse
 *  (ADR-0038): the six routes' rules bind here too, so Menu ranges get promote
 *  semantics and nothing that would mint Menu-plus-demand-clock. */
export const verbsFor = (family: 'runway' | 'menu'): BulkVerb[] =>
  family === 'runway'
    ? ['new-date', 'put-under', 'to-menu', 'park', 'put-down', 'let-go']
    // RUNWAY ONLY, and the omission is an argument rather than an oversight. A
    // wish on the Menu already makes no demand and already does not come back at
    // you, so putting one down would change nothing a reader could notice — and
    // a control that appears to do something and does nothing is the shape this
    // app spends most of its care avoiding. The verb for a wish you no longer
    // want is `let-go`, which is there.
    : ['bring-back', 'let-go'];

export interface BulkParams {
  /** put-under: the container id. */
  parent?: NodeId;
  /** to-menu: the category. */
  category?: MenuCategory;
  /** park, and new-date: the day key (YYYY-MM-DD), resolved in the user's zone. */
  dayKey?: string;
  /** new-date only: the clock the eligibility question is asked against. Passed
   *  rather than read from a module clock because every projection here is pure
   *  and takes `now` as an argument — and because eligibility must be decided
   *  against the SAME instant the preview counted, or the receipt and the
   *  preview disagree about how many moved. */
  nowIso?: string;
  zone?: string;
}

/** One item's reversal facts, captured at act time. */
interface UndoEntry {
  node: NodeId;
  priorParent: NodeId | null;
  priorCategory: MenuCategory | null;
  /**
   * The dates this act RETIRED, captured before it ran (V2 stage 3).
   *
   * Only `new-date` fills it, and it exists because 1.30.3 established the rule
   * the hard way on the single-item path: an undo that returns less than it took
   * is not an undo. Giving forty passed dates a new one retires forty old ones,
   * and without this the way back would hand them all to you with the old dates
   * gone — the same defect at forty times the size.
   */
  priorClocks: { kind: ClockKind; at: string; source?: string }[];
}

export interface BulkPlan {
  verb: BulkVerb;
  params: BulkParams;
  /** The literal sentence shown to the user — stored verbatim in every
   *  receipt (the consent-sentence rule). */
  scope: string;
  /** Item ids at plan time; every chunk re-checks each against live state. */
  itemIds: NodeId[];
}

export interface BulkReceipt {
  verb: BulkVerb;
  scope: string;
  done: number;
  skipped: number;
  chunks: number;
  /** Set when a chunk failed mid-run: the message, with `done` counting the
   *  known-good prefix that landed. */
  failed: string | null;
  undo: UndoEntry[];
}

/** Is this item still eligible for this verb, against LIVE state? */
export function eligible(verb: BulkVerb, n: NodeState | undefined, state: State, params: BulkParams): boolean {
  if (!n) return false;
  switch (verb) {
    case 'put-under': {
      if (!sortable(n)) return false;
      const p = params.parent ? state.nodes.get(params.parent) : undefined;
      if (!isHeld(p) || p.id === n.id) return false;
      if (n.parent === p.id) return false;             // already there: no event, no claim
      return !wouldParentCycle(state, n.id, p.id);
    }
    case 'to-menu':
    case 'park':
      return sortable(n);
    // GIVE IT A NEW DATE (V2 stage 3) — the replan resolution that had no bulk
    // form. `to-menu` and `let-go` already covered two of the replan choices;
    // this is the third and the one somebody with forty passed dates actually
    // wants, because most of them are still worth doing and only the date was
    // wrong.
    //
    // Eligible only where a date HAS gone by. Setting a new date on something
    // whose date has not passed is not a resolution, it is an edit, and doing it
    // to forty items at once because they happened to be in the range would be
    // the app overwriting decisions nobody asked it to touch.
    case 'new-date':
      return sortable(n) && passedHardClocks(n, params.nowIso ?? '', params.zone ?? 'UTC').length > 0;
    // PUT A WHOLE PLACE DOWN (V2 stage 3). One act instead of thirty.
    //
    // ADR-0082 says putting a place down does NOT sweep its contents, and this
    // does not contradict that — it completes it. The app must never decide what
    // you have stopped caring about; a person may decide it once, out loud, about
    // a range they named. That is the amnesty's own recorded resolution: the cap
    // governs what a surface may SHOW, and a range the user named is legitimate
    // to act on.
    case 'put-down':
      return sortable(n);
    case 'let-go':
      // Legal from both families: runway work, or a wish on the Menu — and
      // never a merge SURVIVOR (1.17.3, the seam audit): trashing a node that
      // others folded into makes the folded-in nodes newly silent, so the gate
      // refuses the whole batch after the preview promised it. Skip-and-count,
      // like every other per-item ineligibility; splitting the folds back out
      // first is the door.
      return isHeld(n) && (sortable(n) || n.onMenu !== null)
        && foldedInto(state, n.id).length === 0;
    case 'bring-back':
      return !n.trashed && !n.mergedInto && n.onMenu !== null;
  }
}

const base = (ctx: StampContext, kind: string, node: string | null, payload: unknown): AppEvent => ({
  id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
  kind, node, payload,
} as AppEvent);

/** The receipt, written FIRST in each chunk. */
export const rangeActedEvent = (ctx: StampContext, scope: string, verb: string, count: number): AppEvent =>
  base(ctx, 'range.acted', null, { scope, verb, count });

/**
 * One item's events for one verb — the same facts the single act writes.
 * `put-under` is `parentEvents`' shape; `to-menu` is the someday route's
 * Menu-first-then-shed shape (the 1.3.1 belt: a wish holds no demands);
 * `bring-back` is `promoteFromMenuEvents`' shape. The gate cures ride as ever.
 */
export function bulkItemEvents(
  ctx: StampContext, verb: BulkVerb, n: NodeState, params: BulkParams,
): AppEvent[] {
  switch (verb) {
    case 'put-under':
      return [base(ctx, 'node.parented', n.id, {
        parent: params.parent!, ...(n.parent ? { priorParent: n.parent } : {}),
      })];
    case 'to-menu':
      return [
        base(ctx, 'menu.item.added', n.id, { category: params.category ?? 'read' }),
        ...demandClocksOf(n).map((k: ClockKind) =>
          base(ctx, 'clock.cleared', n.id, { clockKind: k })),
      ];
    case 'park':
      return [base(ctx, 'park.set', n.id, {
        returnAt: endOfDayKey(params.dayKey!, ctx.zone), reason: 'range:park',
      })];
    case 'let-go':
      return [base(ctx, 'node.trashed', n.id, { reason: 'range:let-go' })];
    case 'put-down':
      // The same single event the sheet writes. No reason, here either — a bulk
      // path that collected one would be asking thirty times what the single act
      // never asks once.
      return [base(ctx, 'node.released', n.id, { at: ctx.at })];
    case 'new-date':
      // Through `replanEvents`, the SAME resolution a person makes by hand on
      // one card — not a bare `clock.set`. It records `replan.resolved`, retires
      // every clock that went by rather than the one a card happened to name,
      // and sheds nothing it should not. The amnesty learned this the hard way
      // in 1.30.1: a bulk path that reimplements a single act is a second
      // implementation that drifts, and it drifted in the arguments.
      return replanEvents(
        ctx, n.id, 'new-date',
        passedHardClocks(n, params.nowIso ?? '', params.zone ?? 'UTC').map((p: Passed) => p.kind),
        params.dayKey!,
        n.kind,
        demandClocksOf(n),
      );
    case 'bring-back':
      return [base(ctx, 'menu.item.promoted', n.id, { toKind: 'action' })];
  }
}

/** The reverse of one item's act, from the facts captured when it ran. */
function undoItemEvents(
  ctx: StampContext, verb: BulkVerb, entry: UndoEntry,
): AppEvent[] {
  switch (verb) {
    case 'put-under':
      return entry.priorParent
        ? [base(ctx, 'node.parented', entry.node, { parent: entry.priorParent })]
        : [base(ctx, 'node.unparented', entry.node, {})];
    case 'to-menu':
      // Off the Menu again; the gate re-cures coverage. The demand clocks shed
      // on the way ARE NOT restored — the receipt says so in words.
      return [base(ctx, 'menu.item.removed', entry.node, { from: entry.priorCategory ?? 'read' })];
    case 'park':
      return [base(ctx, 'clock.cleared', entry.node, { clockKind: 'park' })];
    case 'let-go':
      return [base(ctx, 'node.untrashed', entry.node, {})];
    case 'bring-back':
      return [base(ctx, 'menu.item.added', entry.node, { category: entry.priorCategory ?? 'read' })];
    case 'put-down':
      // Picked straight back up, and the gate re-covers each one with a clock —
      // the same way back the single act has. Unlike `to-menu`, nothing was shed
      // on the way down, so this undo restores everything it took.
      return [base(ctx, 'node.reclaimed', entry.node, {})];
    case 'new-date':
      // Take the new date off and put back every one it retired, each through
      // its own noun — `suspense.set` for a suspense, `clock.set` for a due,
      // carrying the ORIGINAL source so the log does not start claiming the app
      // chose the date. The clear comes first: a `due` restored below would
      // otherwise be cleared by it.
      return [
        base(ctx, 'clock.cleared', entry.node, { clockKind: 'due' }),
        ...entry.priorClocks.map(c => c.kind === 'suspense'
          ? base(ctx, 'suspense.set', entry.node, { at: c.at })
          : base(ctx, 'clock.set', entry.node, {
            clockKind: c.kind, at: c.at, ...(c.source ? { source: c.source } : { source: 'undo:range' }),
          })),
      ];
  }
}

/** Build the plan from the range's LIVE items. The preview sentence is the
 *  caller's; the counts it states come from this plan's real events. */
export function planBulk(
  state: State, items: readonly NodeState[], verb: BulkVerb, params: BulkParams, scope: string,
): BulkPlan & { eligibleNow: number; ineligibleNow: number } {
  const ok = items.filter(n => eligible(verb, state.nodes.get(n.id), state, params));
  return {
    verb, params, scope,
    itemIds: ok.map(n => n.id),
    eligibleNow: ok.length,
    ineligibleNow: items.length - ok.length,
  };
}

/** Events per chunk stays near this; a chunk closes once it is reached. */
export const CHUNK_EVENT_TARGET = 500;

/**
 * Commit the plan, chunked, re-checking each item against live state at the
 * moment its chunk is built. `onProgress` receives receipt words — counts of
 * the APP's mechanical work, the legal class (ADR-0049) — after each chunk.
 */
export async function runBulk(
  session: Session, plan: BulkPlan,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkReceipt> {
  const receipt: BulkReceipt = {
    verb: plan.verb, scope: plan.scope,
    done: 0, skipped: 0, chunks: 0, failed: null, undo: [],
  };
  let i = 0;
  while (i < plan.itemIds.length) {
    // Assemble one chunk against LIVE state, capturing reversal facts.
    const st = session.state();
    const chunkIds: NodeId[] = [];
    const chunkUndo: UndoEntry[] = [];
    let events = 0;
    while (i < plan.itemIds.length && events < CHUNK_EVENT_TARGET) {
      const id = plan.itemIds[i++]!;
      const n = st.nodes.get(id);
      if (!eligible(plan.verb, n, st, plan.params)) { receipt.skipped++; continue; }
      chunkIds.push(id);
      chunkUndo.push({
        node: id,
        priorParent: n!.parent ?? null,
        priorCategory: (n!.onMenu as MenuCategory | null) ?? null,
        // Captured for `new-date` only; every other verb retires nothing, and an
        // empty array is the honest "there was nothing to put back".
        priorClocks: plan.verb === 'new-date'
          ? passedHardClocks(n!, plan.params.nowIso ?? '', plan.params.zone ?? 'UTC')
            .map((pc: Passed) => {
              const c = n!.clocks[pc.kind];
              return { kind: pc.kind, at: pc.at, ...(c?.source ? { source: c.source } : {}) };
            })
          : [],
      });
      // 1 receipt-share + the item's own events; demand clears vary per item.
      events += 1 + (plan.verb === 'to-menu' ? 1 + demandClocksOf(n).length : 1);
    }
    if (chunkIds.length === 0) continue;
    try {
      await session.commit(ctx => {
        // Build INSIDE the commit against the state the gate will see; the
        // chunk membership was just re-checked against the same state.
        const s2 = session.state();
        const out: AppEvent[] = [rangeActedEvent(ctx, plan.scope, plan.verb, chunkIds.length)];
        for (const id of chunkIds) {
          const n = s2.nodes.get(id);
          if (!n) continue;
          out.push(...bulkItemEvents(ctx, plan.verb, n, plan.params));
        }
        return out;
      });
      receipt.done += chunkIds.length;
      receipt.undo.push(...chunkUndo);
      receipt.chunks++;
      onProgress?.(receipt.done, plan.itemIds.length);
    } catch (err) {
      // A failed chunk leaves the known-good prefix landed and SAYS SO; the
      // items of this chunk are neither done nor silently dropped.
      receipt.failed = (err as Error).message;
      break;
    }
  }
  return receipt;
}

/** Take a bulk act back: the reverse events, chunked the same way, with its
 *  own receipt. Items whose reversal is no longer possible (the node vanished
 *  into a merge, was re-acted on elsewhere) are skipped and counted. */
export async function undoBulk(
  session: Session, receipt: BulkReceipt,
  onProgress?: (done: number, total: number) => void,
): Promise<BulkReceipt> {
  const out: BulkReceipt = {
    verb: receipt.verb, scope: `undo — ${receipt.scope}`,
    done: 0, skipped: 0, chunks: 0, failed: null, undo: [],
  };
  let i = 0;
  while (i < receipt.undo.length) {
    const st = session.state();
    const chunk: UndoEntry[] = [];
    while (i < receipt.undo.length && chunk.length < CHUNK_EVENT_TARGET / 2) {
      const entry = receipt.undo[i++]!;
      const n = st.nodes.get(entry.node);
      if (!n || n.mergedInto) { out.skipped++; continue; }
      // Reversal-specific sanity: undoing a let-go needs it still trashed, &c.
      //
      // A TOTAL RECORD, since 1.33.0, and the change is not cosmetic. This was a
      // hand-written disjunction of four verbs, so a verb added later fell
      // through to `false` and EVERY item was skipped — a working Undo button
      // that reported "0 things restored" and put nothing back. `new-date`
      // shipped in that state and nothing caught it: the tests exercised
      // `undoItemEvents` directly, which is the half that was correct.
      //
      // As a record over `BulkVerb`, a new verb cannot compile until somebody
      // writes down what "still reversible" means for it. Same shape as the
      // merge disposition and `REPORTABLE`, and for the same recorded reason.
      const STILL_REVERSIBLE: Record<BulkVerb, (x: NodeState) => boolean> = {
        'let-go': x => x.trashed,
        'to-menu': x => x.onMenu !== null,
        'bring-back': x => x.onMenu === null,
        'park': x => Boolean(x.clocks.park),
        // Filing is reversible whatever happened since: the entry carries the
        // prior parent, and re-homing is legal from anywhere.
        'put-under': () => true,
        // The date it set must still be the one on there. If the person has
        // changed it since, the act being undone is no longer the last word and
        // putting the old dates back would clobber a newer decision.
        'new-date': x => Boolean(x.clocks.due),
        // It must still be down. Picked back up by hand already? Then there is
        // nothing to reverse, and the count says so.
        'put-down': x => Boolean(x.released),
      };
      if (!STILL_REVERSIBLE[receipt.verb](n)) { out.skipped++; continue; }
      chunk.push(entry);
    }
    if (chunk.length === 0) continue;
    try {
      await session.commit(ctx => [
        rangeActedEvent(ctx, out.scope, 'undo', chunk.length),
        ...chunk.flatMap(entry => undoItemEvents(ctx, receipt.verb, entry)),
      ]);
      out.done += chunk.length;
      out.chunks++;
      onProgress?.(out.done, receipt.undo.length);
    } catch (err) {
      out.failed = (err as Error).message;
      break;
    }
  }
  return out;
}
