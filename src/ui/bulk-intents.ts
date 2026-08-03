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

export type BulkVerb = 'put-under' | 'to-menu' | 'park' | 'let-go' | 'bring-back';

/** The verbs a range family may face — never offer what the gate must refuse
 *  (ADR-0038): the six routes' rules bind here too, so Menu ranges get promote
 *  semantics and nothing that would mint Menu-plus-demand-clock. */
export const verbsFor = (family: 'runway' | 'menu'): BulkVerb[] =>
  family === 'runway'
    ? ['put-under', 'to-menu', 'park', 'let-go']
    : ['bring-back', 'let-go'];

export interface BulkParams {
  /** put-under: the container id. */
  parent?: NodeId;
  /** to-menu: the category. */
  category?: MenuCategory;
  /** park: the day key (YYYY-MM-DD), resolved in the user's zone. */
  dayKey?: string;
}

/** One item's reversal facts, captured at act time. */
interface UndoEntry {
  node: NodeId;
  priorParent: NodeId | null;
  priorCategory: MenuCategory | null;
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
      if (!p || p.trashed || p.mergedInto || p.id === n.id) return false;
      if (n.parent === p.id) return false;             // already there: no event, no claim
      return !wouldParentCycle(state, n.id, p.id);
    }
    case 'to-menu':
    case 'park':
      return sortable(n);
    case 'let-go':
      // Legal from both families: runway work, or a wish on the Menu — and
      // never a merge SURVIVOR (1.17.3, the seam audit): trashing a node that
      // others folded into makes the folded-in nodes newly silent, so the gate
      // refuses the whole batch after the preview promised it. Skip-and-count,
      // like every other per-item ineligibility; splitting the folds back out
      // first is the door.
      return !n.trashed && !n.mergedInto && (sortable(n) || n.onMenu !== null)
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
      const still =
        (receipt.verb === 'let-go' && n.trashed) ||
        (receipt.verb === 'to-menu' && n.onMenu !== null) ||
        (receipt.verb === 'bring-back' && n.onMenu === null) ||
        (receipt.verb === 'park' && Boolean(n.clocks.park)) ||
        (receipt.verb === 'put-under');
      if (!still) { out.skipped++; continue; }
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
