// THE ONLY WRITE PATH.
//
// Product law 1 — every node is (a) on a surface now, (b) under a clock, (c) on
// the Menu, or (d) parented to something under a clock — is enforced HERE, in
// the same transaction as the write. A write that would leave a node silent is
// either CURED or REJECTED. It is never accepted-and-swept-later, because a
// sweep has a window, and windows are where things are lost (ADR-0011).
//
// Because the invariant holds by construction, the coverage gauge always reads
// zero. Its job is to PROVE the invariant, not to report a backlog — a non-zero
// gauge is a bug in this file (law 2).
//
// No test helper may bypass this. A test that writes around the gate stops the
// property tests proving the property that matters most.

import {
  DEMAND_FREE_KINDS, isKnownKind, isSilentRisk,
  type AppEvent, type EventKind, type NodeId, type NodeKind, type VaultId,
} from './events.ts';
import { fold, type NodeState, type State } from './fold.ts';

export class GateRejection extends Error {
  // Explicit fields, not constructor parameter properties — Node's
  // --experimental-strip-types removes types without transforming, and a
  // parameter property needs transformation. Keeping the source strip-safe is
  // what lets the whole spine run with no build step.
  readonly reason: string;
  readonly event: AppEvent;
  constructor(reason: string, event: AppEvent) {
    super(`write refused: ${reason} (${event.kind})`);
    this.name = 'GateRejection';
    this.reason = reason;
    this.event = event;
  }
}

const isDemandFree = (k: NodeKind): boolean =>
  (DEMAND_FREE_KINDS as readonly NodeKind[]).includes(k);

/** Follow a merge chain to its living end. Null when the chain leaves the
 *  known world (missing target), ends in the trash, or loops. */
function mergeTarget(node: NodeState, state: State): NodeState | null {
  const seen = new Set<NodeId>([node.id]);
  let cur: NodeState | undefined = node;
  while (cur?.mergedInto) {
    if (seen.has(cur.mergedInto)) return null;             // cycle
    seen.add(cur.mergedInto);
    cur = state.nodes.get(cur.mergedInto);
  }
  return cur && !cur.trashed ? cur : null;
}

/** Law 1's four-way test. A node satisfying none of these is SILENT. */
export function isSilent(node: NodeState, state: State): boolean {
  if (node.trashed) return false;        // an explicit end is a decision, not a silence
  if (node.mergedInto) {
    // Merged means "lives on inside the target" — which is only true if the
    // target actually lives. The audit merged a node into an id that did not
    // exist and the old unconditional exemption called it covered; law 1 was
    // being defined away, not enforced.
    const target = mergeTarget(node, state);
    return target ? isSilent(target, state) : true;
  }
  if (Object.keys(node.clocks).length > 0) return false;   // (b) under a clock
  if (node.onMenu !== null) return false;                  // (c) on the Menu
  if (isDemandFree(node.kind)) return false;               // Menu/pebble kinds are demand-free by construction
  if (node.parent) {                                       // (d) parented to something under a clock
    // Walk the ancestry, guarding against a cycle so a corrupt parent chain
    // cannot hang the gate. A trashed or merged-away ancestor confers NOTHING:
    // a clock in the trash covers nobody (the audit's orphaned-children case).
    const seen = new Set<NodeId>();
    let cur = state.nodes.get(node.parent);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.trashed || cur.mergedInto) break;
      if (Object.keys(cur.clocks).length > 0) return false;  // an ancestor is clocked: not silent
      if (!cur.parent) break;
      cur = state.nodes.get(cur.parent);
    }
  }
  return true;
}

/** Nodes silent in `after` that were not already silent in `before`. The gate
 *  reasons in DELTAS: a pre-existing silent node (a legacy import, a bug from
 *  an older build) must be curable, not a wedge that refuses every unrelated
 *  write forever — which is exactly what the audit showed the absolute check
 *  doing. */
const newlySilent = (after: State, before: State): NodeState[] =>
  silentNodes(after).filter(n => {
    const prev = before.nodes.get(n.id);
    return !prev || !isSilent(prev, before);
  });

/** Every node currently failing law 1. Should ALWAYS be empty. */
export const silentNodes = (state: State): NodeState[] =>
  [...state.nodes.values()].filter(n => isSilent(n, state));

/** The coverage gauge (law 2). Reads 0 when the gate is doing its job. */
export const coverageGauge = (state: State): { silent: number; total: number } => ({
  silent: silentNodes(state).length,
  total: state.nodes.size,
});

export interface GateOptions {
  /**
   * How long an unclarified capture may sit before it returns. Applied AT WRITE
   * TIME, in the same transaction — there is no window in which a captured item
   * is silent (ADR-0008).
   */
  sameDayClockAt: (e: AppEvent) => string;
}

const endOfDay = (iso: string): string => {
  const d = new Date(iso);
  d.setUTCHours(23, 59, 59, 0);
  return d.toISOString();
};

export const defaultGateOptions: GateOptions = {
  sameDayClockAt: e => endOfDay(e.at),
};

/**
 * Admit a batch of events, curing anything that would otherwise go silent.
 *
 * Returns the events that should be appended — which may be MORE than were
 * offered, because a cure is itself an event (the log must explain the state).
 * Throws GateRejection if a write cannot be cured.
 */
export function admit(
  offered: readonly AppEvent[],
  priorState: State,
  opts: GateOptions = defaultGateOptions,
): AppEvent[] {
  const out: AppEvent[] = [];

  for (const e of offered) {
    // --- structural refusals, before anything else ---------------------------
    if (!isKnownKind(e.kind)) {
      throw new GateRejection(`unknown event kind "${e.kind}" — the vocabulary is a closed list`, e);
    }
    if (!e.vault) {
      throw new GateRejection('every event belongs to exactly one vault', e);
    }
    if (!Number.isInteger(e.seq) || e.seq < 0) {
      // Continuity is the SESSION's job (ADR-0027); the gate can only check shape.
      throw new GateRejection('seq must be a non-negative integer', e);
    }
    if (e.kind === 'node.field.set') {
      const p = e.payload as { field?: unknown };
      if (typeof p.field !== 'string' || !p.field) {
        throw new GateRejection('node.field.set carries exactly one named field', e);
      }
      if (p.field === '__proto__' || p.field === 'constructor' || p.field === 'prototype') {
        // A prototype-key field lands in live state but vanishes from every
        // snapshot and export (audit). fold also defends; refuse at the door.
        throw new GateRejection(`"${p.field}" is not a usable field name`, e);
      }
    }

    const before = fold(out, priorState);

    // A capture/creation aimed at an id that already exists would silently
    // overwrite its kind and title — the audit turned a project into an action
    // named "milk". Creation events create; they do not rename.
    if ((e.kind === 'node.created' || e.kind === 'capture.recorded' ||
         e.kind === 'interrupt.captured' || e.kind === 'bother.received' ||
         e.kind === 'person.created') && e.node && before.nodes.has(e.node)) {
      throw new GateRejection(`node ${e.node} already exists — a creation event cannot land on it`, e);
    }

    if (e.kind === 'node.merged') {
      const into = (e.payload as { into?: unknown }).into;
      const target = typeof into === 'string' ? before.nodes.get(into) : undefined;
      if (!target) throw new GateRejection('merge target does not exist', e);
      if (into === e.node) throw new GateRejection('a node cannot merge into itself', e);
      if (target.trashed) throw new GateRejection('merge target is in the trash', e);
    }

    out.push(e);

    // --- cross-vault refusal (ADR-0005) --------------------------------------
    const interim = fold(out, priorState);
    for (const ref of referencedNodes(e)) {
      const target = interim.nodes.get(ref);
      if (target && target.vault !== e.vault) {
        throw new GateRejection(
          `cross-vault reference: event in "${e.vault}" refers to node in "${target.vault}"`, e);
      }
    }

    // --- demand-free kinds cannot carry a clock (law 6, ADR-0014) ------------
    if (e.kind === 'clock.set' || e.kind === 'park.set') {
      const n = interim.nodes.get(e.node!);
      if (n && isDemandFree(n.kind)) {
        throw new GateRejection(
          `a ${n.kind} cannot carry a clock — acting on one is a deliberate promotion`, e);
      }
    }

    // --- law 1: cure anything now silent ------------------------------------
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

  // Belt and braces, in DELTAS: the batch must INTRODUCE no silence. (An
  // absolute check here wedged the store: one legacy silent node refused every
  // unrelated write forever — audit, severe.)
  const final = fold(out, priorState);
  const anchor: AppEvent = offered[offered.length - 1] ??
    ({ kind: 'node.created', id: '(empty batch)', vault: '-', at: '', device: '-', seq: 0, node: null, payload: {} } as AppEvent);
  const introduced = newlySilent(final, priorState);
  if (introduced.length > 0) {
    throw new GateRejection(
      `batch would leave ${introduced.length} silent node(s): ${introduced.map(n => n.id).join(', ')}`,
      anchor);
  }

  // Law 6, revalidated over the WHOLE batch: per-event checks are order-
  // dependent (a cure's clock followed by a kind change to demand-free slipped
  // both — audit). The final state is what ships, so the final state is what
  // is checked.
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

  return out;
}

/** Node ids an event points AT (not the node it is about). */
function referencedNodes(e: AppEvent): NodeId[] {
  const p = e.payload as Record<string, unknown>;
  const out: NodeId[] = [];
  for (const key of ['parent', 'priorParent', 'into', 'feeds', 'person', 'forNode', 'node', 'anchor']) {
    const v = p[key];
    if (typeof v === 'string') out.push(v);
  }
  for (const key of ['affects', 'fed']) {
    const v = p[key];
    if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') out.push(x);
  }
  return out;
}

/**
 * The cure for each silent-risk event, decided in advance rather than improvised
 * (ADR-0011). A cure is an EVENT, so the log explains why the node is not
 * silent — the state is never patched behind the log's back.
 */
function cureFor(node: NodeState, cause: AppEvent, opts: GateOptions): AppEvent | null {
  const stamp = {
    id: `${cause.id}~cure~${node.id}`,
    vault: node.vault,
    at: cause.at,
    device: cause.device,
    seq: cause.seq,
  };

  switch (cause.kind) {
    // An unclarified capture gets an aggressive same-day clock IN THE SAME
    // TRANSACTION. There is no window in which it is silent.
    case 'capture.recorded':
    case 'interrupt.captured':
    case 'bother.received':
    case 'node.created':
      return {
        ...stamp, kind: 'clock.set', node: node.id,
        payload: { clockKind: 'review', at: opts.sameDayClockAt(cause), source: `gate:${cause.kind}` },
      };

    // Losing a parent, a clock, or a role means the node needs its own clock.
    // node.trashed / node.merged / node.parented cure the BYSTANDERS: children
    // whose only coverage was an ancestor that just left the world (ADR-0011:
    // "trashing a parent must not silently orphan children"), or a node
    // re-homed under an unclocked parent — which the old gate REFUSED outright,
    // losing the user's write.
    case 'node.trashed':
    case 'node.merged':
    case 'node.parented':
    case 'node.unparented':
    case 'node.untrashed':
    case 'clock.cleared':
    case 'done.marked':
    case 'dependency.released':
    case 'waiting.closed':
    case 'project.role.set':
    case 'node.kind.changed':
      return {
        ...stamp, kind: 'clock.set', node: node.id,
        payload: { clockKind: 'review', at: opts.sameDayClockAt(cause), source: `gate:${cause.kind}` },
      };

    // Declining a request still produces a record — the Not Now ledger — and a
    // park always carries a return clock.
    case 'request.declined':
      return {
        ...stamp, kind: 'park.set', node: node.id,
        payload: { returnAt: opts.sameDayClockAt(cause), reason: 'not-now-ledger' },
      };

    // Routing must terminate somewhere legal. `someday`/`reference` land on the
    // Menu; everything else takes a clock.
    case 'clarify.routed': {
      const route = (cause.payload as { route: string }).route;
      if (route === 'someday' || route === 'reference') {
        return { ...stamp, kind: 'menu.item.added', node: node.id, payload: { category: 'read' } };
      }
      return {
        ...stamp, kind: 'clock.set', node: node.id,
        payload: { clockKind: 'review', at: opts.sameDayClockAt(cause), source: 'gate:clarify.routed' },
      };
    }

    // A resolution must itself set a clock or land on the Menu — there is no
    // resolution that produces silence (ADR-0012).
    case 'replan.resolved': {
      const choice = (cause.payload as { choice: string }).choice;
      if (choice === 'to-menu') {
        return { ...stamp, kind: 'menu.item.added', node: node.id, payload: { category: 'try' } };
      }
      return {
        ...stamp, kind: 'clock.set', node: node.id,
        payload: { clockKind: 'review', at: opts.sameDayClockAt(cause), source: 'gate:replan.resolved' },
      };
    }

    case 'bother.owned':
    case 'bother.routed':
      return {
        ...stamp, kind: 'park.set', node: node.id,
        payload: { returnAt: opts.sameDayClockAt(cause), reason: 'bother must terminate in a route or a park' },
      };

    // A promotion off the Menu is deliberate, and the promoted thing takes a clock.
    case 'menu.item.promoted':
      return {
        ...stamp, kind: 'clock.set', node: node.id,
        payload: { clockKind: 'review', at: opts.sameDayClockAt(cause), source: 'gate:menu.item.promoted' },
      };

    default:
      return null;
  }
}

/** Convenience: admit against a store's current state. */
export interface Admitter {
  (offered: readonly AppEvent[]): AppEvent[];
}

export const admitterFor = (state: State, opts?: GateOptions): Admitter =>
  events => admit(events, state, opts);

export type { VaultId };
