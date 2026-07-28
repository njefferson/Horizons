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

/** Law 1's four-way test. A node satisfying none of these is SILENT. */
export function isSilent(node: NodeState, state: State): boolean {
  if (node.trashed) return false;        // an explicit end is a decision, not a silence
  if (node.mergedInto) return false;
  if (Object.keys(node.clocks).length > 0) return false;   // (b) under a clock
  if (node.onMenu !== null) return false;                  // (c) on the Menu
  if (isDemandFree(node.kind)) return false;               // Menu/pebble kinds are demand-free by construction
  if (node.parent) {                                       // (d) parented to something under a clock
    // Walk the ancestry, guarding against a cycle so a corrupt parent chain
    // cannot hang the gate.
    const seen = new Set<NodeId>();
    let cur = state.nodes.get(node.parent);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (Object.keys(cur.clocks).length > 0) return false;  // an ancestor is clocked: not silent
      if (!cur.parent) break;
      cur = state.nodes.get(cur.parent);
    }
  }
  return true;
}

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
      throw new GateRejection('seq must be a non-negative integer and gap-free per device', e);
    }
    if (e.kind === 'node.field.set') {
      const p = e.payload as { field?: unknown };
      if (typeof p.field !== 'string' || !p.field) {
        throw new GateRejection('node.field.set carries exactly one named field', e);
      }
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
    for (const node of silentNodes(after)) {
      const cure = cureFor(node, e, opts);
      if (!cure) {
        throw new GateRejection(
          `would leave node ${node.id} (${node.kind}) silent, and no cure applies — ` +
          `every node must be on a surface, under a clock, on the Menu, or parented to something under a clock`, e);
      }
      out.push(cure);
    }
  }

  // Belt and braces: the batch as a whole must leave nothing silent.
  const final = fold(out, priorState);
  const remaining = silentNodes(final);
  if (remaining.length > 0) {
    throw new GateRejection(
      `batch would leave ${remaining.length} silent node(s): ${remaining.map(n => n.id).join(', ')}`,
      offered[offered.length - 1]!);
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
