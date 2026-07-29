// A seeded generator of arbitrary VALID event sequences.
//
// Hand-rolled rather than a property-testing library, for two reasons: the
// generator has to know the domain to produce sequences the gate would accept
// at all, and the repo keeps dependencies few. Seeded so a failure is
// reproducible from its seed alone — an unreproducible property failure is
// nearly useless.

import type { AppEvent, NodeKind, VaultId } from '../src/events.ts';
import { DEMAND_FREE_KINDS } from '../src/events.ts';

/** mulberry32 — small, fast, deterministic. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

const NODE_KINDS_GENERATED: readonly NodeKind[] = [
  'action', 'outcome', 'project', 'area', 'goal', 'upkeep', 'aspiration',
  'pebble', 'waiting-for', 'person', 'anchor',
];

export interface GenOptions {
  seed: number;
  events: number;
  devices: number;
  vaults: readonly VaultId[];
}

/**
 * Produce a plausible sequence of user actions. Deliberately includes the
 * silent-risk kinds — unparenting, clearing clocks, completing things, routing
 * — because those are exactly what the gate has to cure.
 */
export function generateEvents(opts: GenOptions): AppEvent[] {
  const r = rng(opts.seed);
  const out: AppEvent[] = [];
  const seqByDevice = new Map<string, number>();
  /** id -> kind, so we never offer a clock to a demand-free kind (law 6). The
   *  gate would rightly refuse it, and a generator that produces INVALID
   *  sequences tests the generator, not the invariant. */
  const kindOf = new Map<string, NodeKind>();
  const nodesByVault = new Map<VaultId, string[]>();
  for (const v of opts.vaults) nodesByVault.set(v, []);
  let nextId = 0;
  const freshId = (prefix: string) => `${prefix}${nextId++}`;
  // Asked of the SAME list the gate enforces, not a hand-copied pair. The
  // hand-written version said `aspiration` and `pebble`; adding `person` to
  // DEMAND_FREE_KINDS left it stale, and the generator started producing logs
  // the gate refuses — a property test that cannot run is a property nobody is
  // checking. Two copies of one rule always drift; there is now one.
  const clockable = (ids: readonly string[]) =>
    ids.filter(id => {
      const k = kindOf.get(id);
      return !(DEMAND_FREE_KINDS as readonly string[]).includes(k ?? '');
    });

  const t0 = Date.UTC(2026, 0, 1, 9, 0, 0);
  let tick = 0;

  const stamp = (vault: VaultId) => {
    const device = `dev-${Math.floor(r() * opts.devices)}`;
    const seq = (seqByDevice.get(device) ?? -1) + 1;
    seqByDevice.set(device, seq);
    // Clock skew on purpose: devices disagree, which is what LWW must survive.
    const skew = Math.floor(r() * 5000) - 2500;
    tick += 1 + Math.floor(r() * 3);
    return {
      id: `e${out.length}-${vault}-${seq}`,
      vault,
      at: new Date(t0 + tick * 60_000 + skew).toISOString(),
      device,
      seq,
    };
  };

  for (const v of opts.vaults) {
    const s = stamp(v);
    out.push({ ...s, kind: 'vault.created', node: null, payload: { name: v, domain: 'personal' } });
  }

  while (out.length < opts.events) {
    const vault = pick(r, opts.vaults);
    const known = nodesByVault.get(vault)!;
    const s = stamp(vault);
    const roll = r();

    if (roll < 0.30 || known.length === 0) {
      const id = freshId('n');
      const kind = pick(r, NODE_KINDS_GENERATED);
      const parent = known.length > 0 && r() < 0.4 ? pick(r, known) : undefined;
      kindOf.set(id, kind);
      known.push(id);
      out.push({
        ...s, kind: 'node.created', node: id,
        payload: parent
          ? { nodeKind: kind, title: `node ${id}`, parent }
          : { nodeKind: kind, title: `node ${id}` },
      });
      continue;
    }

    const node = pick(r, known);

    if (roll < 0.42) {
      out.push({ ...s, kind: 'node.field.set', node, payload: { field: pick(r, ['note', 'tag', 'colour']), value: Math.floor(r() * 100) } });
    } else if (roll < 0.52) {
      const targets = clockable(known);
      if (targets.length === 0) continue;
      out.push({ ...s, kind: 'clock.set', node: pick(r, targets), payload: { clockKind: pick(r, ['due', 'review', 'start'] as const), at: new Date(t0 + tick * 120_000).toISOString() } });
    } else if (roll < 0.60) {
      out.push({ ...s, kind: 'clock.cleared', node, payload: { clockKind: pick(r, ['due', 'review', 'start'] as const) } });
    } else if (roll < 0.68) {
      out.push({ ...s, kind: 'done.marked', node, payload: { at: new Date(t0 + tick * 60_000).toISOString() } });
    } else if (roll < 0.74) {
      out.push({ ...s, kind: 'node.unparented', node, payload: { priorParent: pick(r, known) } });
    } else if (roll < 0.80) {
      const id = freshId('c');
      kindOf.set(id, 'action');
      known.push(id);
      out.push({ ...s, kind: 'capture.recorded', node: id, payload: { text: `captured ${id}`, source: 'quick' } });
    } else if (roll < 0.86) {
      out.push({ ...s, kind: 'clarify.routed', node, payload: { route: pick(r, ['do-now', 'next-action', 'waiting-for', 'someday', 'reference'] as const) } });
    } else if (roll < 0.90) {
      out.push({ ...s, kind: 'node.trashed', node, payload: {} });
    } else if (roll < 0.94) {
      out.push({ ...s, kind: 'menu.item.added', node, payload: { category: pick(r, ['read', 'try', 'go', 'make'] as const) } });
    } else if (roll < 0.97) {
      out.push({ ...s, kind: 'heat.set', node, payload: { heat: pick(r, ['hot', 'cold'] as const) } });
    } else {
      out.push({ ...s, kind: 'estimate.recorded', node, payload: { durationMinutes: Math.floor(r() * 120), basis: 'guess' } });
    }
  }

  return out;
}

/** Deterministic shuffle — for proving fold order-independence. */
export function shuffle<T>(xs: readonly T[], seed: number): T[] {
  const r = rng(seed);
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
