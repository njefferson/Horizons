// state = fold(log). Pure, deterministic, no clock, no I/O.
//
// Same log => same state, on every device, in any shard arrival order
// (ADR-0001). Nothing here reads `Date.now()`: `now` is injected by callers that
// need it, because a projection that reads the clock cannot be tested at an
// arbitrary moment and grows a timezone bug that only shows up in real use.

import type {
  AppEvent, ClockKind, ISODateTime, MenuCategory, NodeId, NodeKind, VaultId,
} from './events.ts';

export interface Clock {
  kind: ClockKind;
  at: ISODateTime;
  /** Ordering stamp of the event that set it — used for per-field LWW. */
  setBy: Ordering;
}

export interface NodeState {
  id: NodeId;
  vault: VaultId;
  kind: NodeKind;
  title: string;
  parent: NodeId | null;
  trashed: boolean;
  mergedInto: NodeId | null;
  clocks: Partial<Record<ClockKind, Clock>>;
  onMenu: MenuCategory | null;
  lastDone: ISODateTime | null;
  comfortWindowDays: number | null;
  intervalDays: number | null;
  /** Arbitrary fields set via node.field.set, each with its own LWW stamp. */
  fields: Record<string, { value: unknown; setBy: Ordering }>;
  /** Ordering stamp of the last event that touched each structural field. */
  stamps: Record<string, Ordering>;
}

export interface State {
  nodes: Map<NodeId, NodeState>;
  vaults: Map<VaultId, { name: string; domain: string }>;
  devices: Set<string>;
  /** Highest seq folded per device — lets a shard prove it is complete. */
  seqByDevice: Map<string, number>;
  eventCount: number;
}

export const emptyState = (): State => ({
  nodes: new Map(),
  vaults: new Map(),
  devices: new Set(),
  seqByDevice: new Map(),
  eventCount: 0,
});

/** (at, device, seq) — `at` first, device as a deterministic tiebreak. */
export type Ordering = readonly [ISODateTime, string, number];
const orderingOf = (e: AppEvent): Ordering => [e.at, e.device, e.seq];

export function compareOrdering(a: Ordering, b: Ordering): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;   // deterministic on every device
  return a[2] - b[2];
}

export const compareEvents = (a: AppEvent, b: AppEvent): number =>
  compareOrdering(orderingOf(a), orderingOf(b));

/** True when `next` should overwrite a field last written at `prev`. */
const wins = (prev: Ordering | undefined, next: Ordering): boolean =>
  prev === undefined || compareOrdering(prev, next) < 0;

function ensureNode(s: State, id: NodeId, vault: VaultId): NodeState {
  let n = s.nodes.get(id);
  if (!n) {
    n = {
      id, vault, kind: 'action', title: '', parent: null,
      trashed: false, mergedInto: null, clocks: {}, onMenu: null,
      lastDone: null, comfortWindowDays: null, intervalDays: null,
      fields: {}, stamps: {},
    };
    s.nodes.set(id, n);
  }
  return n;
}

/**
 * Fold a batch of events into state.
 *
 * Sorts by (at, device, seq) first, so shards arriving in ANY order — or the
 * same shard replayed twice — produce identical state. A device's own events
 * still fold in seq order regardless of clock skew, because seq is the final
 * tiebreak within a device.
 */
export function fold(events: readonly AppEvent[], base: State = emptyState()): State {
  const s: State = {
    nodes: new Map(base.nodes),
    vaults: new Map(base.vaults),
    devices: new Set(base.devices),
    seqByDevice: new Map(base.seqByDevice),
    eventCount: base.eventCount,
  };

  const ordered = [...events].sort(compareEvents);

  for (const e of ordered) {
    const o = orderingOf(e);
    s.devices.add(e.device);
    const seen = s.seqByDevice.get(e.device);
    if (seen === undefined || e.seq > seen) s.seqByDevice.set(e.device, e.seq);
    s.eventCount++;

    switch (e.kind) {
      case 'vault.created':
        s.vaults.set(e.vault, { name: e.payload.name, domain: e.payload.domain });
        break;

      case 'node.created': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['kind'], o)) { n.kind = e.payload.nodeKind; n.stamps['kind'] = o; }
        if (wins(n.stamps['title'], o)) { n.title = e.payload.title; n.stamps['title'] = o; }
        if (e.payload.parent !== undefined && wins(n.stamps['parent'], o)) {
          n.parent = e.payload.parent; n.stamps['parent'] = o;
        }
        break;
      }
      case 'node.kind.changed': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['kind'], o)) { n.kind = e.payload.to; n.stamps['kind'] = o; }
        break;
      }

      // These CREATE nodes too. Missing them here meant a captured item never
      // existed in state, so the gate saw nothing to cure and the item went
      // silent — caught by the no-silent-nodes property test, which is exactly
      // what it is for.
      case 'capture.recorded': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['kind'], o)) { n.kind = 'action'; n.stamps['kind'] = o; }
        if (wins(n.stamps['title'], o)) { n.title = e.payload.text; n.stamps['title'] = o; }
        break;
      }
      case 'interrupt.captured': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['kind'], o)) { n.kind = 'action'; n.stamps['kind'] = o; }
        if (wins(n.stamps['title'], o)) { n.title = e.payload.text; n.stamps['title'] = o; }
        break;
      }
      case 'bother.received': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['kind'], o)) { n.kind = 'bother'; n.stamps['kind'] = o; }
        if (wins(n.stamps['title'], o)) { n.title = e.payload.text; n.stamps['title'] = o; }
        break;
      }
      case 'person.created': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['kind'], o)) { n.kind = 'person'; n.stamps['kind'] = o; }
        if (wins(n.stamps['title'], o)) { n.title = e.payload.name; n.stamps['title'] = o; }
        break;
      }
      case 'anchor.defined': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['kind'], o)) { n.kind = 'anchor'; n.stamps['kind'] = o; }
        if (wins(n.stamps['title'], o)) { n.title = e.payload.name; n.stamps['title'] = o; }
        break;
      }
      case 'resume.card.created': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['kind'], o)) { n.kind = 'resume-card'; n.stamps['kind'] = o; }
        break;
      }
      case 'node.field.set': {
        // Exactly one field per event — this is what makes per-field LWW work.
        const n = ensureNode(s, e.node!, e.vault);
        const cur = n.fields[e.payload.field];
        if (wins(cur?.setBy, o)) n.fields[e.payload.field] = { value: e.payload.value, setBy: o };
        break;
      }
      case 'node.parented': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['parent'], o)) { n.parent = e.payload.parent; n.stamps['parent'] = o; }
        break;
      }
      case 'node.unparented': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['parent'], o)) { n.parent = null; n.stamps['parent'] = o; }
        break;
      }
      case 'node.trashed': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['trashed'], o)) { n.trashed = true; n.stamps['trashed'] = o; }
        break;
      }
      case 'node.untrashed': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['trashed'], o)) { n.trashed = false; n.stamps['trashed'] = o; }
        break;
      }
      case 'node.merged': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['mergedInto'], o)) { n.mergedInto = e.payload.into; n.stamps['mergedInto'] = o; }
        break;
      }

      case 'clock.set': {
        const n = ensureNode(s, e.node!, e.vault);
        const cur = n.clocks[e.payload.clockKind];
        if (wins(cur?.setBy, o)) n.clocks[e.payload.clockKind] = { kind: e.payload.clockKind, at: e.payload.at, setBy: o };
        break;
      }
      case 'clock.cleared': {
        const n = ensureNode(s, e.node!, e.vault);
        const cur = n.clocks[e.payload.clockKind];
        if (wins(cur?.setBy, o)) delete n.clocks[e.payload.clockKind];
        break;
      }
      case 'park.set': {
        const n = ensureNode(s, e.node!, e.vault);
        const cur = n.clocks['park'];
        if (wins(cur?.setBy, o)) n.clocks['park'] = { kind: 'park', at: e.payload.returnAt, setBy: o };
        break;
      }
      case 'upkeep.interval.set': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['interval'], o)) {
          n.intervalDays = e.payload.intervalDays;
          n.comfortWindowDays = e.payload.comfortWindowDays;
          n.stamps['interval'] = o;
        }
        break;
      }
      case 'done.marked': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['lastDone'], o)) { n.lastDone = e.payload.at; n.stamps['lastDone'] = o; }
        break;
      }
      case 'done.unmarked': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['lastDone'], o)) { n.lastDone = null; n.stamps['lastDone'] = o; }
        break;
      }

      case 'menu.item.added': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['menu'], o)) { n.onMenu = e.payload.category; n.stamps['menu'] = o; }
        break;
      }
      case 'menu.item.promoted': {
        const n = ensureNode(s, e.node!, e.vault);
        if (wins(n.stamps['menu'], o)) { n.onMenu = null; n.stamps['menu'] = o; }
        if (wins(n.stamps['kind'], o)) { n.kind = e.payload.toKind; n.stamps['kind'] = o; }
        break;
      }

      default:
        // Every other kind is recorded in the log and contributes to history,
        // but does not change the structural projection Phase 0 computes.
        // Later phases add projections over these; the log already holds them.
        break;
    }
  }

  return s;
}
