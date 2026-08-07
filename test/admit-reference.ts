// The OLD admit, kept as the equivalence oracle.
//
// This is the write gate's control flow exactly as it shipped from Phase 0
// through 1.2.3: per offered event, the accumulated batch is REFOLDED from
// scratch (two to three times), and the silent check scans the whole state.
// Correct, and quadratic-with-a-large-linear-term — 500 events at a 10k-node
// state measured at ~6-9 seconds, which is what made every bulk act
// unshippable and forced the rework.
//
// It stays here so the reworked admit can be held to it: the equivalence
// property test drives generated batches through BOTH and requires the same
// answer event-for-event — or the same rejection. The building blocks
// (structuralRefusal, isSilent, cureFor, referencedNodes) are imported from
// the real gate, so this oracle cannot drift from the QUESTIONS; only the
// control flow is frozen.

import {
  GateRejection, cureFor, isSilent, referencedNodes, silentNodes, structuralRefusal,
  defaultGateOptions, type GateOptions,
} from '../src/gate.ts';
import { DEMAND_FREE_KINDS, isSilentRisk, type AppEvent, type NodeKind } from '../src/events.ts';
import { fold, type NodeState, type State } from '../src/fold.ts';
import { wouldCycle } from '../src/dependencies.ts';
import { wouldParentCycle } from '../src/tree.ts';

const isDemandFree = (k: NodeKind): boolean =>
  (DEMAND_FREE_KINDS as readonly NodeKind[]).includes(k);

const newlySilent = (after: State, before: State): NodeState[] =>
  silentNodes(after).filter(n => {
    const prev = before.nodes.get(n.id);
    return !prev || !isSilent(prev, before);
  });

export function admitReference(
  offered: readonly AppEvent[],
  priorState: State,
  opts: GateOptions = defaultGateOptions,
): AppEvent[] {
  const out: AppEvent[] = [];

  for (const e of offered) {
    const bad = structuralRefusal(e);
    if (bad) throw new GateRejection(bad, e);

    const before = fold(out, priorState);

    if ((e.kind === 'node.created' || e.kind === 'capture.recorded' ||
         e.kind === 'interrupt.captured' || e.kind === 'bother.received' ||
         e.kind === 'person.created') && e.node && before.nodes.has(e.node)) {
      throw new GateRejection(`node ${e.node} already exists — a creation event cannot land on it`, e);
    }

    if (e.kind === 'node.renamed' && (!e.node || !before.nodes.get(e.node))) {
      throw new GateRejection('cannot rename a node that does not exist', e);
    }

    if (e.kind === 'dependency.declared') {
      const feeds = (e.payload as { feeds?: unknown }).feeds;
      if (typeof feeds !== 'string' || !feeds) {
        throw new GateRejection('a dependency must name what it feeds', e);
      }
      if (!e.node) throw new GateRejection('a dependency must belong to a node', e);
      const target = before.nodes.get(feeds);
      if (!target || target.trashed || target.mergedInto) {
        throw new GateRejection(`nothing here to feed: ${feeds}`, e);
      }
      if (wouldCycle(before, e.node, feeds)) {
        throw new GateRejection('that would make two things each wait for the other', e);
      }
    }

    // Mirrors the gate's `after.set` refusals (1.30.0). Written out rather than
    // shared on purpose — this file exists to be an INDEPENDENT reading of the
    // rules, so a refusal that only agrees because both sides call the same
    // helper proves nothing about the refusal.
    if (e.kind === 'after.set') {
      const target = (e.payload as { after?: unknown }).after;
      if (typeof target !== 'string' || !target) {
        throw new GateRejection('an anchor must name what it waits for', e);
      }
      if (!e.node) throw new GateRejection('an anchor must belong to a node', e);
      if (target === e.node) throw new GateRejection('a thing cannot wait for itself', e);
      const a = before.nodes.get(target);
      if (!a || a.trashed || a.mergedInto) {
        throw new GateRejection(`nothing here to wait for: ${target}`, e);
      }
      if (isDemandFree(a.kind)) {
        throw new GateRejection(
          `a ${a.kind} is never finished, so nothing would ever come of waiting for it`, e);
      }
      if (a.lastDone) {
        throw new GateRejection('that is already done — this needs a date of its own, not an anchor', e);
      }
      const walked = new Set<string>();
      for (let cur: string | null = target; cur && !walked.has(cur); cur = before.nodes.get(cur)?.after ?? null) {
        if (cur === e.node) {
          throw new GateRejection('that would make two things each wait for the other', e);
        }
        walked.add(cur);
      }
    }

    if (e.kind === 'node.parented') {
      const parent = (e.payload as { parent?: unknown }).parent;
      if (typeof parent !== 'string' || !parent) {
        throw new GateRejection('a parenting must name what it goes under', e);
      }
      if (!e.node) throw new GateRejection('a parenting must belong to a node', e);
      const target = before.nodes.get(parent);
      if (!target || target.trashed || target.mergedInto) {
        throw new GateRejection(`nothing here to put it under: ${parent}`, e);
      }
      if (wouldParentCycle(before, e.node, parent)) {
        throw new GateRejection('that would put a thing inside itself', e);
      }
    }

    if (e.kind === 'node.merged') {
      const into = (e.payload as { into?: unknown }).into;
      const target = typeof into === 'string' ? before.nodes.get(into) : undefined;
      if (!target) throw new GateRejection('merge target does not exist', e);
      if (into === e.node) throw new GateRejection('a node cannot merge into itself', e);
      if (target.trashed) throw new GateRejection('merge target is in the trash', e);
    }

    out.push(e);

    const interim = fold(out, priorState);
    for (const ref of referencedNodes(e)) {
      const target = interim.nodes.get(ref);
      if (target && target.vault !== e.vault) {
        throw new GateRejection(
          `cross-vault reference: event in "${e.vault}" refers to node in "${target.vault}"`, e);
      }
    }

    if (e.kind === 'clock.set' || e.kind === 'park.set') {
      const n = interim.nodes.get(e.node!);
      if (n && isDemandFree(n.kind)) {
        throw new GateRejection(
          `a ${n.kind} cannot carry a clock — acting on one is a deliberate promotion`, e);
      }
    }

    if (!isSilentRisk(e.kind)) continue;

    const after = fold(out, priorState);
    for (const node of newlySilent(after, priorState)) {
      const cure = cureFor(node, e, opts);
      if (!cure) {
        throw new GateRejection(
          `would leave node ${node.id} (${node.kind}) silent, and no cure applies — ` +
          `every node must be on a surface, under a clock, on the Menu, or parented to something under a clock`, e);
      }
      out.push(cure);
    }
  }

  const final = fold(out, priorState);
  const anchor: AppEvent = offered[offered.length - 1] ??
    ({ kind: 'node.created', id: '(empty batch)', vault: '-', at: '', device: '-', seq: 0, node: null, payload: {} } as AppEvent);
  const introduced = newlySilent(final, priorState);
  if (introduced.length > 0) {
    throw new GateRejection(
      `batch would leave ${introduced.length} silent node(s): ${introduced.map(n => n.id).join(', ')}`,
      anchor);
  }

  for (const n of final.nodes.values()) {
    if (isDemandFree(n.kind) && Object.keys(n.clocks).length > 0) {
      const wasAlready = (() => {
        const prev = priorState.nodes.get(n.id);
        return !!prev && isDemandFree(prev.kind) && Object.keys(prev.clocks).length > 0;
      })();
      if (!wasAlready) {
        throw new GateRejection(
          `batch would leave ${n.kind} ${n.id} carrying a clock — demand-free kinds cannot (law 6)`,
          anchor);
      }
    }
  }

  // A batch may not leave a node ON THE MENU carrying a demand clock (due,
  // start, suspense, park). Law 6 governs KINDS; this governs PLACEMENT: a
  // someday-routed action keeps kind 'action', so a date on it is kind-legal —
  // and then unrenderable, because the Menu group wins every surface, no
  // replan card can raise, and the sheet hides its temporal controls: a hard
  // date swallowed whole (audit, CRITICAL — a due-dated import routed to
  // Someday lost its date invisibly for ever). Delta form like every belt:
  // a pre-existing state stays curable; the batch may not introduce one.
  const DEMAND_CLOCKS = ['due', 'start', 'suspense', 'park'] as const;
  for (const n of final.nodes.values()) {
    if (n.onMenu === null) continue;
    const carrying = DEMAND_CLOCKS.filter(k => n.clocks[k]);
    if (carrying.length === 0) continue;
    const prev = priorState.nodes.get(n.id);
    const wasAlready = !!prev && prev.onMenu !== null && DEMAND_CLOCKS.some(k => prev.clocks[k]);
    if (!wasAlready) {
      throw new GateRejection(
        `batch would leave ${n.id} on the Menu carrying a ${carrying[0]} date — a wish holds no demands; bring it back as real work first`,
        anchor);
    }
  }

  return out;
}
