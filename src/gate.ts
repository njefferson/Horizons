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
import { applyEvent, cloneShell, compareEvents, compareOrdering, fold, type NodeState, type State } from './fold.ts';
import { endOfLocalDay, isValidIso } from './time.ts';
// Follows a merge chain to its living end. Lived here as a private
// `mergeTarget` until 1.9.2, when the ledger needed the same walk — one
// concept, one home. `merged.ts` imports `fold.ts` only, so there is no cycle.
import { survivorOf } from './merged.ts';
import { wouldCycle } from './dependencies.ts';
import { wouldParentCycle } from './tree.ts';

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
  if (node.mergedInto) {
    // Merged means "lives on inside the target" — which is only true if the
    // target actually lives. The audit merged a node into an id that did not
    // exist and the old unconditional exemption called it covered; law 1 was
    // being defined away, not enforced.
    const target = survivorOf(state, node);
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

/** Everything still here — not trashed, not merged away. The widest "held"
 *  there is, and the one most of the app means: the merge picker, the
 *  portfolio, the dependency views, purge.
 *
 *  `state.nodes.size` counted trashed and merged nodes, so the gauge said
 *  "3 held" over a list of 2: a claim the user was invited to open, which then
 *  failed to check out (law 2 is about PROVING the invariant, and a proof that
 *  contradicts itself proves nothing). That is why this exists.
 *
 *  **It is no longer what the gauge counts** — see `heldWork` below, and 1.15.1
 *  for why. */
export const heldNodes = (state: State): NodeState[] =>
  [...state.nodes.values()].filter(n => !n.trashed && !n.mergedInto);

/**
 * What you are holding AS WORK — the gauge's number, the coverage list's rows,
 * and the todo list's groups, from ONE definition so the three can never
 * disagree.
 *
 * The skip list below was hand-written inside `heldGroups`, and the gauge did
 * not have it, so the two drifted the moment a kind was excluded from the todo
 * list: 1.13.0 excluded journal entries and 1.15.0 excluded pebbles, and both
 * times the gauge kept counting them. The visible half was worse than a number
 * that did not match — opening the gauge ITEMISED every private journal entry,
 * which has no title by design, as a row reading "(untitled) — held". ADR-0061
 * excluded them from the todo list precisely so that row would not exist; the
 * coverage list was missed, and it is the more prominent surface because the
 * gauge invites you to open it.
 *
 * A hand-written list of what a projection carries is the 1.9.2 lesson exactly,
 * which is why this is a predicate rather than a second copy.
 *
 * **`silentNodes` is deliberately NOT built on this.** Law 1's proof runs over
 * every node, and excluding a kind from a proof is how law 1 gets defined away
 * (the 1.3.1 merged-node finding). The gauge's two numbers answer two different
 * questions on purpose: "is anything silent" is about every node this app
 * stores; "how much are you holding" is about work.
 */
export const heldWork = (state: State): NodeState[] =>
  heldNodes(state).filter(n => {
    // A SPENT resume card is the residue of a thread already picked back up —
    // or let go. It carries a cure clock like everything else, so without this
    // it sat in "Ready now" for ever, reading "where you left off" about work
    // that was finished. It is not trashed and not hidden from an export: it
    // happened, and the log says so. It simply is not work.
    if (n.kind === 'resume-card' && n.resumeSpent) return false;
    // A JOURNAL ENTRY IS NOT WORK (1.13.0, ADR-0061). It is demand-free, so law
    // 1 is satisfied without a clock; it has no title by design; and it has its
    // own surface behind the ⓘ.
    if (n.kind === 'journal') return false;
    // NOR IS A PEBBLE (1.15.0, ADR-0065), and here that is the whole point of
    // the kind: a pebble accounts for weight "without ever becoming a task"
    // (ADR-0014), and a row in a work list is what becoming a task looks like.
    // The load entry is its surface.
    if (n.kind === 'pebble') return false;
    // NOR A PERSON — and this one was a SHIPPED DEFECT, not a new exclusion
    // (1.17.0). Every person you had ever named was a row in your todo list:
    // "Alex", sitting among your work, with nothing to do about it. It predates
    // this predicate, which is why nothing caught it — 1.13.0 and 1.15.0 each
    // added a kind to a hand-written list inside `heldGroups` and neither
    // revisited what was already in there. A person has had its own surface
    // since 1.12.0 (ADR-0040), which is the same argument ADR-0061 makes for a
    // journal entry: not work, and it has somewhere of its own to be.
    if (n.kind === 'person') return false;
    // NOR AN ANCHOR (1.17.0, ADR-0068). A named period is not a thing to do —
    // nothing is ever done to one. It is fired when the meeting happened, and
    // what it does is cut a delta. Its surface is the report section.
    if (n.kind === 'anchor') return false;
    return true;
  });

/** Things let go — trashed, not merged away — newest decision first. The trash
 *  view (1.5.0, ADR-0050) reads this; nothing else may treat these as work.
 *  Beside `heldNodes` so the complement is visibly the complement. */
export const trashedNodes = (state: State): NodeState[] =>
  [...state.nodes.values()]
    .filter(n => n.trashed && !n.mergedInto)
    .sort((a, b) => {
      const sa = a.stamps['trashed'], sb = b.stamps['trashed'];
      if (sa && sb) {
        const c = compareOrdering(sa, sb);
        if (c !== 0) return -c;                       // newest first
      }
      return a.id < b.id ? 1 : -1;
    });

/** The coverage gauge (law 2). `silent` reads 0 when the gate is doing its job,
 *  and is counted over EVERY node — a proof that skips a kind proves nothing.
 *  `total` is the work you are holding, because that is the number the list
 *  under it itemises and the two must be the same claim. */
export const coverageGauge = (state: State): { silent: number; total: number } => ({
  silent: silentNodes(state).length,
  total: heldWork(state).length,
});

export interface GateOptions {
  /**
   * How long an unclarified capture may sit before it returns. Applied AT WRITE
   * TIME, in the same transaction — there is no window in which a captured item
   * is silent (ADR-0008).
   */
  sameDayClockAt: (e: AppEvent) => string;
}

/** The gate's cures clock things to the end of the day the user is IN, so the
 *  zone has to be supplied — end-of-UTC-day is end-of-local-day only in UTC, and
 *  anywhere else it lands a captured item up to a day late (V-13). */
export const gateOptionsFor = (zone: string): GateOptions => ({
  sameDayClockAt: e => endOfLocalDay(e.at, zone),
});

/** UTC fallback, for callers with no device zone to offer (and the tests that
 *  are not about zones). The app always injects the real one — `openSession`
 *  reads it once at the UI edge and threads it here. */
export const defaultGateOptions: GateOptions = gateOptionsFor('UTC');

/**
 * The SHAPE checks — everything the gate can decide about one event on its own,
 * without knowing any prior state. Returns the reason it must be refused, or
 * null.
 *
 * Extracted so IMPORT can ask the same questions. Import is a second write path
 * that does not go through `admit`, and it was asking almost none of them: a
 * hand-edited or concatenated file could carry a negative `seq`, an unparseable
 * date, or a `__proto__` field name straight into the store — and one carrying
 * `seq: 1e999` permanently bricked writing, because `nextSeq` returns
 * `max + 1` and `Infinity + 1 === Infinity` (audit). Two write paths asking
 * different questions is how a closed vocabulary stops being closed.
 */
export function structuralRefusal(e: AppEvent): string | null {
  if (!isKnownKind(e.kind)) {
    return `unknown event kind "${e.kind}" — the vocabulary is a closed list`;
  }
  if (!e.vault) {
    return 'every event belongs to exactly one vault';
  }
  if (!Number.isInteger(e.seq) || e.seq < 0) {
    // Continuity is the SESSION's job (ADR-0027); the gate can only check shape.
    return 'seq must be a non-negative integer';
  }
  if (e.kind === 'node.field.set') {
    const p = e.payload as { field?: unknown };
    if (typeof p.field !== 'string' || !p.field) {
      return 'node.field.set carries exactly one named field';
    }
    if (p.field === '__proto__' || p.field === 'constructor' || p.field === 'prototype') {
      // A prototype-key field lands in live state but vanishes from every
      // snapshot and export (audit). fold also defends; refuse at the door.
      return `"${p.field}" is not a usable field name`;
    }
  }

  // Every date the log carries must be a real instant. `Intl.formatToParts`
  // throws `RangeError: Invalid time value` on anything else, and the temporal
  // projections read these fields unvalidated — so ONE malformed date used to
  // throw out of the work surface, which is built before capture's handlers are
  // registered, and killed the whole app with the data intact and unreachable.
  // The projections are now defensive too, but bad data should not get in.
  if (!isValidIso(e.at)) {
    return `event "at" is not a real instant: ${JSON.stringify(e.at)}`;
  }
  for (const field of ['at', 'returnAt', 'endedAt', 'startedAt'] as const) {
    const p = e.payload as Record<string, unknown> | null;
    // `at` on the envelope is checked above; here it is the payload's own.
    if (p && Object.hasOwn(p, field) && p[field] != null && !isValidIso(p[field])) {
      return `${e.kind} payload "${field}" is not a real instant: ${JSON.stringify(p[field])}`;
    }
  }
  return null;
}

/**
 * Admit a batch of events, curing anything that would otherwise go silent.
 *
 * Returns the events that should be appended — which may be MORE than were
 * offered, because a cure is itself an event (the log must explain the state).
 * Throws GateRejection if a write cannot be cured.
 *
 * ONE running accumulator, not a refold per event. The original control flow
 * refolded the accumulated batch from scratch two to three times per offered
 * event, each refold copying the whole nodes map — quadratic with a large
 * linear term, measured at ~6 seconds for 500 events against a 10k-node state,
 * which made every bulk act unshippable (1.3.0's verified blocker). The
 * accumulator applies each admitted event once, in place, through the same
 * `applyEvent` fold uses; copy-on-write (`ensureNode` + the shared `touched`
 * set) keeps `priorState` untouched, so a REJECTED batch still leaves no trace
 * — the audit's severe finding that motivated copy-on-write holds unchanged.
 *
 * The silent check runs over a DIRTY SET instead of the whole state: the
 * event's own node, every node its payload references, and everything whose
 * coverage could have ridden the touched node — descendants via the parent
 * index, and nodes merged into it via the merge index, transitively. A miss in
 * that reasoning CANNOT corrupt state: the whole-batch belt-and-braces delta
 * scan below is retained untouched and fails closed as a rejection. The old
 * control flow survives verbatim in test/admit-reference.ts, and an
 * equivalence property test holds this one to it event-for-event.
 */
export function admit(
  offered: readonly AppEvent[],
  priorState: State,
  opts: GateOptions = defaultGateOptions,
): AppEvent[] {
  const out: AppEvent[] = [];

  // The batch must arrive in its own event order. The accumulator applies in
  // OFFERED order while fold sorts by (at, device, seq) — for LWW fields the
  // two agree regardless, but `dependency.released` is the vocabulary's one
  // non-commutative fold operation, and a stamp-disordered batch could slip a
  // dependency CYCLE past `wouldCycle` that the sorted refold then makes real,
  // permanently, in an append-only log (audit, verified). Every real caller
  // already stamps one `at` with monotonic seq; this makes the precondition a
  // refusal instead of an unstated assumption.
  for (let i = 1; i < offered.length; i++) {
    if (compareEvents(offered[i - 1]!, offered[i]!) > 0) {
      throw new GateRejection(
        'a batch must be offered in its own event order — sort by (at, device, seq) first',
        offered[i]!);
    }
  }

  // The batch so far, applied — what `fold(out, priorState)` used to rebuild.
  const s = cloneShell(priorState);
  const touched = new Set<NodeId>();

  // Nodes MINTED by this batch (ensureNode creates on first touch, whatever
  // the event kind — heat.set at a stray id mints an uncovered ghost, and so
  // can a payload reference like person.linked's `node`). The old whole-state
  // scan saw such ghosts at the next silent-risk event and cured them; a
  // dirty set keyed only on the current event's ids was blind to them, which
  // rejected whole batches the oracle accepted — including the user's own
  // capture riding in the same batch (audit). Every silent-risk check unions
  // this set, restoring the oracle's answer exactly.
  const born = new Set<NodeId>();

  // Map-insertion order of every node, so cures for one event's multiple
  // casualties emit in exactly the order the old whole-state scan produced —
  // the equivalence the oracle test checks is event-for-event, order included.
  const orderIndex = new Map<NodeId, number>();
  for (const id of s.nodes.keys()) orderIndex.set(id, orderIndex.size);

  // parent -> live children, and merge-target -> nodes merged into it. Both
  // maintained as events apply, because "whose coverage rode this node" is
  // exactly (descendants ∪ merge-dependents), transitively.
  const childIndex = new Map<NodeId, Set<NodeId>>();
  const mergeIndex = new Map<NodeId, Set<NodeId>>();
  for (const n of s.nodes.values()) {
    if (n.parent) {
      let set = childIndex.get(n.parent);
      if (!set) childIndex.set(n.parent, set = new Set());
      set.add(n.id);
    }
    if (n.mergedInto) {
      let set = mergeIndex.get(n.mergedInto);
      if (!set) mergeIndex.set(n.mergedInto, set = new Set());
      set.add(n.id);
    }
  }

  /** Apply one admitted event to the accumulator, keeping the indexes true. */
  const apply = (e: AppEvent): void => {
    const beforeNode = e.node ? s.nodes.get(e.node) : undefined;
    const priorParent = beforeNode?.parent ?? null;
    const priorMerged = beforeNode?.mergedInto ?? null;
    // Ids this event could mint: its own node and every payload reference —
    // person.linked creates through payload.node, not e.node.
    const couldMint = [e.node, ...referencedNodes(e)].filter((x): x is NodeId => !!x);
    const existedBefore = new Set(couldMint.filter(id => s.nodes.has(id)));
    applyEvent(s, e, touched);
    for (const id of couldMint) {
      if (!existedBefore.has(id) && s.nodes.has(id)) {
        born.add(id);
        if (!orderIndex.has(id)) orderIndex.set(id, orderIndex.size);
      }
    }
    if (!e.node) return;
    if (!orderIndex.has(e.node)) orderIndex.set(e.node, orderIndex.size);
    const afterNode = s.nodes.get(e.node);
    const newParent = afterNode?.parent ?? null;
    const newMerged = afterNode?.mergedInto ?? null;
    if (priorParent !== newParent) {
      if (priorParent) childIndex.get(priorParent)?.delete(e.node);
      if (newParent) {
        let set = childIndex.get(newParent);
        if (!set) childIndex.set(newParent, set = new Set());
        set.add(e.node);
      }
    }
    if (priorMerged !== newMerged) {
      if (priorMerged) mergeIndex.get(priorMerged)?.delete(e.node);
      if (newMerged) {
        let set = mergeIndex.get(newMerged);
        if (!set) mergeIndex.set(newMerged, set = new Set());
        set.add(e.node);
      }
    }
  };

  /** id plus everything whose coverage could ride it, transitively, with a
   *  cycle guard — children inherit through ancestry, merged nodes through
   *  their target. An EXPLICIT stack, never recursion: a 5,000-deep chain blew
   *  the call stack out of admit as a raw RangeError instead of a decision
   *  (audit) — the same rule wouldCycle already follows. */
  const collectDependents = (id: NodeId, into: Set<NodeId>): void => {
    const stack = [id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (into.has(cur)) continue;
      into.add(cur);
      for (const c of childIndex.get(cur) ?? []) stack.push(c);
      for (const m of mergeIndex.get(cur) ?? []) stack.push(m);
    }
  };

  for (const e of offered) {
    // Shape first, from the one definition import also uses.
    const bad = structuralRefusal(e);
    if (bad) throw new GateRejection(bad, e);

    // A capture/creation aimed at an id that already exists would silently
    // overwrite its kind and title — the audit turned a project into an action
    // named "milk". Creation events create; they do not rename.
    if ((e.kind === 'node.created' || e.kind === 'capture.recorded' ||
         e.kind === 'interrupt.captured' || e.kind === 'bother.received' ||
         e.kind === 'person.created') && e.node && s.nodes.has(e.node)) {
      throw new GateRejection(`node ${e.node} already exists — a creation event cannot land on it`, e);
    }

    // A rename is an EDIT, so its subject must already exist. Without this,
    // `ensureNode` mints a default node for the rename — and because `cureFor`
    // switches on the CAUSE's kind and not on whether the cause has anything to
    // do with the node it is curing, an unrelated silent-risk event in the same
    // batch adopts the ghost and clocks it. The result is a node the user never
    // created, carrying a title from a rename, landing in "Ready now" (audit).
    // Alone it is caught by the belt-and-braces delta check; batched it was not.
    if (e.kind === 'node.renamed' && (!e.node || !s.nodes.get(e.node))) {
      throw new GateRejection('cannot rename a node that does not exist', e);
    }

    // A dependency must name a real, live target, and must not close a loop.
    // A cycle is not a mistake to report afterwards — it is a claim that two
    // things each have to happen before the other, which has no meaning and no
    // fix. Refusing it here keeps the graph acyclic BY CONSTRUCTION, so nothing
    // downstream has to defend against an infinite walk.
    if (e.kind === 'dependency.declared') {
      const feeds = (e.payload as { feeds?: unknown }).feeds;
      if (typeof feeds !== 'string' || !feeds) {
        throw new GateRejection('a dependency must name what it feeds', e);
      }
      if (!e.node) throw new GateRejection('a dependency must belong to a node', e);
      const target = s.nodes.get(feeds);
      if (!target || target.trashed || target.mergedInto) {
        throw new GateRejection(`nothing here to feed: ${feeds}`, e);
      }
      if (wouldCycle(s, e.node, feeds)) {
        throw new GateRejection(
          'that would make two things each wait for the other', e);
      }
    }

    // A parent must be a real, live node, and must not close a loop. The same
    // reasoning as the dependency edge above, and a harder consequence: a cyclic
    // PARENT graph makes every ancestor walk infinite, and those run inside fold
    // consumers, exports and renders. `src/tree.ts` walks defensively so a shard
    // that delivers half a loop cannot hang the app — but the loop must never be
    // writable from here, or the defence becomes the behaviour.
    if (e.kind === 'node.parented') {
      const parent = (e.payload as { parent?: unknown }).parent;
      if (typeof parent !== 'string' || !parent) {
        throw new GateRejection('a parenting must name what it goes under', e);
      }
      if (!e.node) throw new GateRejection('a parenting must belong to a node', e);
      const target = s.nodes.get(parent);
      if (!target || target.trashed || target.mergedInto) {
        throw new GateRejection(`nothing here to put it under: ${parent}`, e);
      }
      if (wouldParentCycle(s, e.node, parent)) {
        throw new GateRejection('that would put a thing inside itself', e);
      }
    }

    if (e.kind === 'node.merged') {
      const into = (e.payload as { into?: unknown }).into;
      const target = typeof into === 'string' ? s.nodes.get(into) : undefined;
      if (!target) throw new GateRejection('merge target does not exist', e);
      if (into === e.node) throw new GateRejection('a node cannot merge into itself', e);
      if (target.trashed) throw new GateRejection('merge target is in the trash', e);
    }

    out.push(e);
    apply(e);

    // --- cross-vault refusal (ADR-0005) --------------------------------------
    for (const ref of referencedNodes(e)) {
      const target = s.nodes.get(ref);
      if (target && target.vault !== e.vault) {
        throw new GateRejection(
          `cross-vault reference: event in "${e.vault}" refers to node in "${target.vault}"`, e);
      }
    }

    // --- demand-free kinds cannot carry a clock (law 6, ADR-0014) ------------
    if (e.kind === 'clock.set' || e.kind === 'park.set') {
      const n = s.nodes.get(e.node!);
      if (n && isDemandFree(n.kind)) {
        throw new GateRejection(
          `a ${n.kind} cannot carry a clock — acting on one is a deliberate promotion`, e);
      }
    }

    // --- law 1: cure anything now silent ------------------------------------
    if (!isSilentRisk(e.kind)) continue;

    // The dirty set: this event's node, everything it points at, and everything
    // whose coverage could have ridden any of them. Casualties emit in map-
    // insertion order — the order the old whole-state scan produced.
    const dirty = new Set<NodeId>();
    if (e.node) collectDependents(e.node, dirty);
    for (const ref of referencedNodes(e)) collectDependents(ref, dirty);
    for (const b of born) collectDependents(b, dirty);
    const casualties = [...dirty]
      .map(id => s.nodes.get(id))
      .filter((n): n is NodeState => !!n)
      .filter(n => isSilent(n, s))
      .filter(n => {
        const prev = priorState.nodes.get(n.id);
        return !prev || !isSilent(prev, priorState);
      })
      .sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));
    for (const node of casualties) {
      // Merge-borne silence cannot be cured by a clock: isSilent rides the
      // merge chain BEFORE it ever looks at clocks, so a cure here would be a
      // junk event that changes nothing. (The old control flow emitted exactly
      // that — one ineffective cure per subsequent silent-risk event, found by
      // the equivalence oracle.) The whole-batch belt below owns this case: if
      // nothing later in the batch resurrects the chain, the batch is rejected
      // there, with the same message the old flow ended at.
      if (node.mergedInto) continue;
      const cure = cureFor(node, e, opts);
      if (!cure) {
        throw new GateRejection(
          `would leave node ${node.id} (${node.kind}) silent, and no cure applies — ` +
          `every node must be on a surface, under a clock, on the Menu, or parented to something under a clock`, e);
      }
      out.push(cure);
      apply(cure);
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

/** Node ids an event points AT (not the node it is about).
 *  Exported for the equivalence oracle in test/ — the old admit control flow
 *  kept as a reference implementation must ask the same questions. */
export function referencedNodes(e: AppEvent): NodeId[] {
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
 *
 * Exported for the equivalence oracle in test/ only.
 */
export function cureFor(node: NodeState, cause: AppEvent, opts: GateOptions): AppEvent | null {
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
    // Splitting back out of a merge (1.7.0): the node stands on its own again
    // and needs its own clock, exactly like untrashed.
    case 'node.unmerged':
    case 'clock.cleared':
    case 'done.marked':
    case 'dependency.released':
    case 'waiting.closed':
    case 'project.role.set':
    case 'node.kind.changed':
    // Undo's reversers. Reopening a route or removing a Menu placement can strip
    // a node's only coverage — the same-day clock a fresh capture gets is exactly
    // the right cure, because both land the node back in the inbox to be sorted.
    case 'clarify.reopened':
    case 'menu.item.removed':
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
    // Menu; everything else takes a clock. NOTE: this branch is redundant
    // defence-in-depth — it is unreachable on the real write paths, because a node
    // is always already covered by the time it is routed (its capture clock, or an
    // earlier cure in the same batch), and clarify.routed removes no coverage, so
    // `newlySilent` never attributes silence to a route. It is kept so the
    // invariant "every silent-risk event carries a cure" stays total. See ADR-0029
    // and the two safety-net tests in test/triage.test.ts.
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
