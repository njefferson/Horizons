// One test per defect the adversarial audit found. Each was reproduced against
// the passing tree before it was fixed; each fails if its fix is reverted.
// Named by the finding so a future reader can trace it.

import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

import { admit, GateRejection, heldNodes, isSilent, silentNodes, coverageGauge } from '../src/gate.ts';
import { endOfDayKey } from '../src/ui/detail-intents.ts';
import { localDayKey } from '../src/time.ts';
import { fold, emptyState, compareEvents, type State } from '../src/fold.ts';
import { serialiseState, deserialiseState } from '../src/snapshot.ts';
import { MemoryLogStore } from '../src/log-store.ts';
import { writeSnapshot, loadState, restoreFromLogAlone } from '../src/snapshot.ts';
import { importSeedingFresh, exportAll } from '../src/portability.ts';
import { clearEvents } from '../src/purge.ts';
import { SILENT_RISK_KINDS, isKnownKind, type AppEvent } from '../src/events.ts';
import { GENERATED_KINDS, lcg, randomEvent, seedState } from './random-events.ts';
import { MERGE_DISPOSITION, canHold, legalMergeTargets, mergeEvents, mergePlan, unmergeEvents } from '../src/ui/merge-intents.ts';
import { statusReport } from '../src/delta.ts';
import { dependencyView } from '../src/dependencies.ts';
import { decisionsFor } from '../src/merged.ts';
import { notNowLedger } from '../src/requests.ts';
import { declineEvents } from '../src/ui/request-intents.ts';

/** A stamp context for the merge intent — ids are ULID-shaped so the
 *  newest-fold-first ordering in merged.ts behaves as it does in the app. */
let cn = 0;
const ctx = () => ({
  id: () => `01K0000000000000000000${String(cn++).padStart(2, '0')}`,
  vault: 'personal', at: '2026-07-28T12:00:00.000Z', device: 'd0', seq: () => n++,
  zone: 'America/Denver',
});

let n = 0;
const ev = (kind: string, node: string | null, payload: unknown, over: Partial<AppEvent> = {}): AppEvent => ({
  id: over.id ?? `e${n++}`, vault: 'personal', at: '2026-07-28T12:00:00.000Z',
  device: 'd0', seq: (over.seq as number) ?? n, kind, node, payload, ...over,
} as AppEvent);

// admit + fold, the real write path, for building prior states in tests.
const write = (prior: State, offered: AppEvent[]): State => fold(admit(offered, prior), prior);

test('fold-1: fold does not mutate its base; a rejected batch cannot corrupt state', () => {
  const base = write(emptyState(), [ev('node.created', 'A', { nodeKind: 'action', title: 'a' }, { seq: 0 })]);
  const before = JSON.stringify(serialiseState(base));
  // A batch that sets a field then throws on an unknown kind.
  assert.throws(() => admit([
    ev('node.field.set', 'A', { field: 'x', value: 'LEAK' }, { seq: 1 }),
    ev('overdue.raised', 'A', {}, { seq: 2 }),
  ], base), GateRejection);
  assert.equal(JSON.stringify(serialiseState(base)), before, 'base state is untouched by a rejected admit');
});

test('fold-2: (at,device,seq) ties are total-ordered by id — permutation-invariant', () => {
  const a = ev('node.created', 'N', { nodeKind: 'action', title: 'ZA' }, { id: 'aaa', seq: 0 });
  const b = ev('node.created', 'N', { nodeKind: 'action', title: 'ZB' }, { id: 'bbb', seq: 0 });
  const s1 = JSON.stringify(serialiseState(fold([a, b])));
  const s2 = JSON.stringify(serialiseState(fold([b, a])));
  assert.equal(s1, s2, 'same events, either order, same state');
  assert.notEqual(compareEvents(a, b), 0, 'ties break by id, never 0');
});

test('gate-clock: a gate-approved clear/set sequence stays consistent after a sorted refold', async () => {
  // The audit sequence: create, set due, clear review, set review (backdated),
  // clear due — via the real gate, then compare live vs sorted refold.
  const store = new MemoryLogStore();
  let s = emptyState();
  const commit = (offered: AppEvent[]) => {
    const admitted = admit(offered, s);
    return store.append(admitted).then(() => { s = fold(admitted, s); });
  };
  await commit([ev('node.created', 'N', { nodeKind: 'action', title: 't' }, { seq: 0, at: '2026-07-28T09:01:00.000Z' })]);
  await commit([ev('clock.set', 'N', { clockKind: 'due', at: '2026-08-01T00:00:00.000Z' }, { seq: 1, at: '2026-07-28T09:03:00.000Z' })]);
  await commit([ev('clock.cleared', 'N', { clockKind: 'review' }, { seq: 2, at: '2026-07-28T09:04:00.000Z' })]);
  await commit([ev('clock.set', 'N', { clockKind: 'review', at: '2026-08-02T00:00:00.000Z' }, { seq: 3, at: '2026-07-28T09:02:00.000Z' })]);
  await commit([ev('clock.cleared', 'N', { clockKind: 'due' }, { seq: 4, at: '2026-07-28T09:05:00.000Z' })]);
  const live = coverageGauge(s);
  const refold = coverageGauge(fold(await store.all()));
  assert.deepEqual(live, refold, 'the gate’s model equals the sorted refold');
  assert.equal(refold.silent, 0, 'and nothing is silent');
});

test('gate-merge: merging into a nonexistent id is refused; a valid merge to a covered node is fine', () => {
  const s = write(emptyState(), [ev('node.created', 'A', { nodeKind: 'action', title: 'a' }, { seq: 0 })]);
  assert.throws(() => admit([ev('node.merged', 'A', { into: 'ghost' }, { seq: 1 })], s),
    /merge target does not exist/);
});

test('gate-trash: trashing a parent cures its orphaned children', () => {
  let s = write(emptyState(), [ev('node.created', 'P', { nodeKind: 'project', title: 'p' }, { seq: 0 })]);
  s = write(s, [ev('node.created', 'C', { nodeKind: 'action', title: 'c', parent: 'P' }, { seq: 1 })]);
  // Trashing P removes C's only coverage; the gate must cure C, not accept silence.
  s = write(s, [ev('node.trashed', 'P', {}, { seq: 2 })]);
  assert.equal(silentNodes(s).length, 0, 'no child left silent by a parent going to the trash');
  const c = s.nodes.get('C')!;
  assert.ok(Object.keys(c.clocks).length > 0 || c.onMenu, 'C has its own coverage now');
});

test('gate-proto: a __proto__ field is refused at the boundary', () => {
  const s = write(emptyState(), [ev('node.created', 'A', { nodeKind: 'action', title: 'a' }, { seq: 0 })]);
  assert.throws(() => admit([ev('node.field.set', 'A', { field: '__proto__', value: {} }, { seq: 1 })], s),
    /not a usable field name/);
});

test('gate-recreate: a creation event cannot land on an existing node', () => {
  const s = write(emptyState(), [ev('capture.recorded', 'A', { text: 'Q3 launch plan', source: 'quick' }, { seq: 0 })]);
  assert.throws(() => admit([ev('capture.recorded', 'A', { text: 'milk', source: 'quick' }, { seq: 1 })], s),
    /already exists/);
});

test('gate-nowedge: a pre-existing silent node does not wedge unrelated writes', () => {
  // Force a silent node into a base state directly (simulating a legacy/imported
  // node the current gate would never mint), then a normal write must still land.
  const legacy = fold([ev('node.created', 'S', { nodeKind: 'action', title: 's' }, { seq: 0 })]);
  // strip S's cure so it is silent in the base:
  legacy.nodes.get('S')!.clocks = {};
  assert.equal(isSilent(legacy.nodes.get('S')!, legacy), true, 'base has a silent node');
  const out = admit([ev('capture.recorded', 'B', { text: 'new', source: 'quick' }, { seq: 1 })], legacy);
  assert.ok(out.length >= 1, 'an unrelated capture still admits despite the legacy silent node');
});

test('gate-empty: admitting an empty batch does not throw the wrong error type', () => {
  assert.doesNotThrow(() => admit([], emptyState()));
});

test('snapshot-since: a late event at-or-below the high-water mark is not lost on restore', async () => {
  const store = new MemoryLogStore();
  await store.append([
    ev('node.created', 'A', { nodeKind: 'action', title: 'a' }, { device: 'd0', seq: 0 }),
    ev('clock.set', 'A', { clockKind: 'review', at: '2026-08-01T00:00:00.000Z' }, { device: 'd0', seq: 1 }),
  ]);
  await writeSnapshot(store, '2026-07-28T12:00:00.000Z'); // HWM d0=1
  // A late shard arrives below the mark (seq 0 on a new device folded after).
  await store.append([ev('node.field.set', 'A', { field: 'note', value: 'late' }, { device: 'd1', seq: 0 })]);
  const viaSnapshot = await loadState(store);
  const viaLog = await restoreFromLogAlone(store);
  assert.deepEqual(
    JSON.parse(JSON.stringify(serialiseState(viaSnapshot))),
    JSON.parse(JSON.stringify(serialiseState(viaLog))),
    'snapshot+tail equals a full replay; the late event is not lost',
  );
});

test('import-gate: a file folding to a silent node is refused, store left intact', async () => {
  const store = new MemoryLogStore();
  await store.append(admit([ev('capture.recorded', 'keep', { text: 'mine', source: 'quick' }, { seq: 0 })], emptyState()));
  const before = (await store.all()).length;
  // A hand-crafted file with a silent node (node.created, no coverage).
  const badFile = {
    format: 'planner-log' as const, version: 1 as const, at: '2026-07-28T12:00:00.000Z',
    scope: 'all', encrypted: false,
    logJsonl: JSON.stringify(ev('node.created', 'orphan', { nodeKind: 'action', title: 'x' }, { seq: 0 })),
    snapshot: null,
  };
  await assert.rejects(() => importSeedingFresh(store, badFile), /not a faithful Quietkeep export/);
  assert.equal((await store.all()).length, before, 'the existing store is untouched by a refused import');
});

// --- the 1.3.1 audit: the gate's new refusals, each proven from both sides ---

test('menu-belt: a demand clock cannot land on a Menu item — suspense, due, or park', () => {
  // The audit's CRITICAL shape: a Menu placement makes every temporal surface
  // stand down (the Menu group wins, no replan card raises, the sheet hides its
  // date controls), so Menu + demand-clock is a hard date swallowed whole.
  let s = write(emptyState(), [ev('node.created', 'P', { nodeKind: 'project', title: 'p' }, { seq: 0 })]);
  s = write(s, [ev('menu.item.added', 'P', { category: 'read' }, { seq: 1 })]);
  assert.throws(() => admit([ev('suspense.set', 'P', { at: '2026-08-09T12:00:00.000Z' }, { seq: 2 })], s),
    /a wish holds no demands/, 'suspense.set on a menu’d project');
  assert.throws(() => admit([ev('clock.set', 'P', { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 't' }, { seq: 3 })], s),
    /a wish holds no demands/, 'a due date on a menu’d project');
  assert.throws(() => admit([ev('park.set', 'P', { returnAt: '2026-08-09T12:00:00.000Z' }, { seq: 4 })], s),
    /a wish holds no demands/, 'a park stacked on a Menu landing');
});

test('menu-belt: the OTHER direction — landing a due-dated item on the Menu without shedding the date', () => {
  let s = write(emptyState(), [ev('node.created', 'D', { nodeKind: 'action', title: 'd' }, { seq: 0 })]);
  s = write(s, [ev('clock.set', 'D', { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 't' }, { seq: 1 })]);
  assert.throws(() => admit([ev('menu.item.added', 'D', { category: 'read' }, { seq: 2 })], s),
    /a wish holds no demands/, 'a bare Menu landing may not swallow the date');
  // The legal batch is the one routeEvents builds: Menu FIRST, then the clears.
  const out = admit([
    ev('menu.item.added', 'D', { category: 'read' }, { seq: 3 }),
    ev('clock.cleared', 'D', { clockKind: 'due' }, { seq: 4 }),
  ], s);
  const after = fold(out, s).nodes.get('D')!;
  assert.ok(after.onMenu, 'landed');
  assert.equal(after.clocks.due, undefined, 'and the date was shed, visibly, in the log');
});

test('menu-belt is a DELTA: a pre-existing Menu+date state stays curable, not wedged', () => {
  // Fold the illegal state in directly (an older build could have written it);
  // an unrelated write must still land, and the cure — clearing the date — too.
  const legacy = fold([
    ev('node.created', 'L', { nodeKind: 'action', title: 'l' }, { seq: 0 }),
    ev('menu.item.added', 'L', { category: 'read' }, { seq: 1 }),
    ev('clock.set', 'L', { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 't' }, { seq: 2 }),
  ]);
  assert.doesNotThrow(() => admit([ev('capture.recorded', 'B', { text: 'new', source: 'quick' }, { seq: 3 })], legacy));
  assert.doesNotThrow(() => admit([ev('clock.cleared', 'L', { clockKind: 'due' }, { seq: 4 })], legacy));
});

test('gate-order: a stamp-disordered batch is refused before anything folds', () => {
  // The accumulator applies in OFFERED order; fold sorts by (at, device, seq).
  // dependency.released is non-commutative under that re-sort, so a disordered
  // batch could slip a dependency cycle past wouldCycle — permanently, in an
  // append-only log. The precondition is now a refusal, not an assumption.
  const s = write(emptyState(), [ev('node.created', 'A', { nodeKind: 'action', title: 'a' }, { seq: 0 })]);
  const later = ev('node.renamed', 'A', { title: 'second' }, { seq: 50 });
  const earlier = ev('node.renamed', 'A', { title: 'first' }, { seq: 40 });
  assert.throws(() => admit([later, earlier], s), /its own event order/);
  assert.doesNotThrow(() => admit([earlier, later], s), 'the same events, sorted, admit fine');
});

test('gate-depth: a 10,000-deep chain gets a decision, not a blown call stack', () => {
  // collectDependents once recursed; a deep parent chain came back as a raw
  // RangeError instead of an admit/reject decision. Each node carries its own
  // clock so the walk is exercised without minting 10,000 casualties.
  const events: AppEvent[] = [];
  let sq = 0;
  const mk = (kind: string, node: string, payload: unknown): AppEvent =>
    ({ id: `d${sq}`, vault: 'personal', at: '2026-07-28T12:00:00.000Z', device: 'd0', seq: sq++, kind, node, payload } as AppEvent);
  events.push(mk('node.created', 'N0', { nodeKind: 'project', title: 'root' }));
  events.push(mk('clock.set', 'N0', { clockKind: 'review', at: '2026-08-05T00:00:00.000Z', source: 't' }));
  for (let i = 1; i < 10_000; i++) {
    events.push(mk('node.created', `N${i}`, { nodeKind: 'action', title: 't', parent: `N${i - 1}` }));
    events.push(mk('clock.set', `N${i}`, { clockKind: 'review', at: '2026-08-05T00:00:00.000Z', source: 't' }));
  }
  const s = fold(events);
  const out = admit([mk('clock.cleared', 'N0', { clockKind: 'review' })], s);
  assert.equal(out.length, 2, 'the clear and its cure — a decision, from the bottom of the chain');
});

test('date-0099: a typed year 0099 stays year 0099 — never silently 1999', () => {
  // Date.UTC(99, …) means 1999 (the legacy two-digit-year trap), so a typo like
  // "0099-08-04" became a date 27 years in the past and raised an instant
  // replan card about a day nobody chose. utcMs (setUTCFullYear) round-trips.
  const zone = 'America/Denver';
  const iso = endOfDayKey('0099-08-04', zone);
  assert.ok(!iso.startsWith('1999'), `did not collapse to 1999 (got ${iso})`);
  assert.equal(localDayKey(iso, zone), '0099-08-04', 'the instant is the end of the day that was typed');
});

test('export-roundtrip: a faithful export re-imports cleanly and re-folds identically', async () => {
  const store = new MemoryLogStore();
  await store.append(admit([ev('capture.recorded', 'A', { text: 'a', source: 'quick' }, { seq: 0 })], emptyState()));
  await store.append(admit([ev('capture.recorded', 'B', { text: 'b', source: 'quick' }, { seq: 1 })], fold(await store.all())));
  const file = await exportAll(store, '2026-07-28T12:00:00.000Z');
  const fresh = new MemoryLogStore();
  await importSeedingFresh(fresh, file);
  assert.deepEqual(
    JSON.parse(JSON.stringify(serialiseState(fold(await fresh.all())))),
    JSON.parse(JSON.stringify(serialiseState(fold(await store.all())))),
    'round-tripped state is identical',
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 1.9.2 — the audit of 1.4.0–1.9.1. See docs/adr/0058-what-a-fold-takes-with-it.md
// ─────────────────────────────────────────────────────────────────────────────

test('merge-carry: every NodeState field is named in the fold\'s disposition', () => {
  // THE DURABLE HALF. 1.7.0 wrote the carry as a hand-written list; 1.8.0 added
  // notNow, 1.9.0 added decisions, and feeds was never in it — none of them
  // visited merge-intents.ts, and each omission silently destroyed something on
  // the next fold. `Record<keyof NodeState, Disposition>` makes that a compile
  // error, and this re-checks at runtime because an OPTIONAL field would slip
  // past the type alone.
  const genesis = fold([ev('node.created', 'X', { nodeKind: 'action', title: 'x' }, { seq: 0 })]).nodes.get('X')!;
  const fields = Object.keys(genesis).sort();
  const named = Object.keys(MERGE_DISPOSITION).sort();
  assert.deepEqual(named, fields,
    'every NodeState field must be named as carried, read-through, or deliberately not carried');

  // And every entry must actually say something. A disposition with an empty
  // reason is the hand-written list again, wearing the gate's clothes.
  for (const [k, d] of Object.entries(MERGE_DISPOSITION)) {
    const words = d.carry === 'no' ? d.because : d.carry === 'read' ? d.via : `${d.via} ${d.when}`;
    assert.ok(words.trim().length > 20, `${k}: the disposition must state a reason, not a shrug`);
  }
});

test('three-place: a mutable field is copied on clone, copied on deserialise, and defaulted for an old snapshot', () => {
  // The rule the repo already records ("copy-on-clone, copy-on-store-from-
  // payload AND default-on-deserialise") stated GENERICALLY, so it needs no
  // field list and cannot go stale. Note this proves SHALLOW non-aliasing: a
  // nested object inside a copied container (a Clock inside `clocks`,
  // `fields[k].value`) is still shared, deliberately — every write replaces
  // those wholesale rather than mutating them.
  const zone = 'America/Denver';
  let s = write(emptyState(), [ev('node.created', 'A', { nodeKind: 'action', title: 'a' }, { seq: 0 })]);
  s = write(s, [
    ev('clock.set', 'A', { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 't' }, { seq: 1 }),
    ev('person.created', 'PER', { name: 'Ada' }, { seq: 2 }),
  ]);
  s = write(s, [ev('person.linked', 'A', { node: 'A', person: 'PER', relation: 'stakeholder' }, { seq: 3 })]);
  s = write(s, [ev('decision.logged', 'A', { text: 'go ahead', at: '2026-07-28T12:00:00.000Z' }, { seq: 4 })]);
  s = write(s, [ev('request.declined', 'A', { person: 'PER', what: 'a', reason: 'detail' }, { seq: 5 })]);
  s = write(s, [ev('node.field.set', 'A', { field: 'note', value: 'n' }, { seq: 6 })]);
  s = write(s, [ev('request.slot.set', null, { recurrence: 'weekly:thu' }, { seq: 7 })]);

  const objectKeys = (o: Record<string, unknown>): string[] =>
    Object.keys(o).filter(k => o[k] !== null && typeof o[k] === 'object');

  // (1) Clone-on-write: folding a touching event must not share any container
  // with the base. Catches the 1.8.0 `notNow` alias.
  const base = s.nodes.get('A')!;
  const after = fold([ev('heat.set', 'A', { heat: 'hot' }, { seq: 8 })], s).nodes.get('A')!;
  for (const k of objectKeys(base as unknown as Record<string, unknown>)) {
    assert.notEqual((after as unknown as Record<string, unknown>)[k], (base as unknown as Record<string, unknown>)[k],
      `${k} is aliased into the base state on clone`);
  }

  // (2) Deserialise must not alias the record it read.
  const raw = JSON.parse(JSON.stringify(serialiseState(s)));
  const back = deserialiseState(raw);
  const rawNode = raw.nodes.find((x: { id: string }) => x.id === 'A');
  for (const k of objectKeys(rawNode)) {
    assert.notEqual((back.nodes.get('A') as unknown as Record<string, unknown>)[k], rawNode[k],
      `${k} is aliased to the snapshot record on deserialise`);
  }
  assert.notEqual(back.requestSlot, raw.requestSlot, 'State-level requestSlot is aliased on deserialise');

  // (3) Default-on-deserialise: a snapshot written before a field existed. Key
  // PRESENCE and non-undefined, NOT equality with genesis — `captured ?? true`
  // is a deliberate legacy-correct default that differs from genesis on purpose.
  const genesisKeys = Object.keys(
    fold([ev('node.created', 'G', { nodeKind: 'action', title: 'g' }, { seq: 0 })]).nodes.get('G')!,
  ).sort();
  const stripped = JSON.parse(JSON.stringify(serialiseState(s)));
  stripped.nodes = [{ id: 'A', vault: 'personal' }];
  const old = deserialiseState(stripped).nodes.get('A')!;
  assert.deepEqual(Object.keys(old).sort(), genesisKeys, 'an old snapshot yields the full field set');
  for (const [k, v] of Object.entries(old)) {
    assert.notEqual(v, undefined, `${k} deserialises to undefined where the type promises a value`);
  }
  void zone;
});

test('merge-record: a fold does not swallow the source\'s decisions or its standing decline', () => {
  // F-A. 1.7.0's merge carries the date, the note, the people and the children
  // — a list written when those four WERE everything. 1.8.0 added the standing
  // decline and 1.9.0 the decision log, and neither release visited the merge.
  // Both readers exclude merged nodes, so folding a duplicate made both vanish
  // from every surface while the log still held them.
  let s = write(emptyState(), [
    ev('node.created', 'DUP', { nodeKind: 'action', title: 'call the dentist' }, { seq: 0 }),
    ev('node.created', 'KEEP', { nodeKind: 'action', title: 'call the dentist' }, { seq: 1 }),
    ev('person.created', 'ADA', { name: 'Ada' }, { seq: 2 }),
  ]);
  s = write(s, [ev('decision.logged', 'DUP', { text: 'go with the crown', at: '2026-07-28T12:00:00.000Z' }, { seq: 3 })]);
  s = write(s, declineEvents(ctx(), s, s.nodes.get('DUP')!));

  assert.equal(decisionsFor(s, s.nodes.get('DUP')!).length, 1, 'precondition: the decision is on the duplicate');
  assert.equal(notNowLedger(s).length, 1, 'precondition: the decline is in the ledger');

  s = write(s, mergeEvents(ctx(), s, s.nodes.get('DUP')!, s.nodes.get('KEEP')!));

  // The decision: read THROUGH the fold, attributed to where it was logged.
  const kept = decisionsFor(s, s.nodes.get('KEEP')!);
  assert.equal(kept.length, 1, 'the survivor surfaces what was decided about the thing folded into it');
  assert.equal(kept[0]!.text, 'go with the crown');
  assert.equal(kept[0]!.from, 'DUP', 'and says which folded-in thing it was decided about');

  // The decline: still in the ledger, now saying where it lives.
  const rows = notNowLedger(s);
  assert.equal(rows.length, 1, 'the decline did not vanish when the thing folded away');
  assert.equal(rows[0]!.node.id, 'DUP', 'the row is still the declined thing — its way back is on its own sheet');
  assert.equal(rows[0]!.host?.id, 'KEEP', 'and it names where that thing lives now');

  // And the survivor is NOT itself declined. Folding a declined duplicate into
  // live work must never mark the live work declined — that is the swallow
  // pointing the other way, and it would be the fold deciding the survivor's
  // standing (which ADR-0053 forbids in the same breath as overwriting a date).
  assert.equal(s.nodes.get('KEEP')!.notNow, null, 'the survivor is not declined by the fold');
});

test('merge-record: the decline\'s park is not carried onto the survivor', () => {
  // F-A'. `park` is in CARRY_CLOCKS, so a declined-and-parked duplicate used to
  // park the survivor with reason 'merge:carried' — the decline's MECHANISM
  // arriving without its RECORD, so live work went quiet with nothing on any
  // surface explaining why. A decline's park is the decline, not a date.
  let s = write(emptyState(), [
    ev('node.created', 'DUP', { nodeKind: 'action', title: 'a' }, { seq: 0 }),
    ev('node.created', 'KEEP', { nodeKind: 'action', title: 'a' }, { seq: 1 }),
  ]);
  s = write(s, declineEvents(ctx(), s, s.nodes.get('DUP')!));
  assert.ok(s.nodes.get('DUP')!.clocks.park, 'precondition: the gate parked the decline');

  s = write(s, mergeEvents(ctx(), s, s.nodes.get('DUP')!, s.nodes.get('KEEP')!));
  assert.equal(s.nodes.get('KEEP')!.clocks.park, undefined, 'the decline\'s park stayed with the decline');

  // But an ORDINARY park — a real "come back to this on Thursday" — still carries.
  let t = write(emptyState(), [
    ev('node.created', 'D2', { nodeKind: 'action', title: 'b' }, { seq: 0 }),
    ev('node.created', 'K2', { nodeKind: 'action', title: 'b' }, { seq: 1 }),
  ]);
  t = write(t, [ev('park.set', 'D2', { returnAt: '2026-08-09T12:00:00.000Z', reason: 'shelved' }, { seq: 2 })]);
  t = write(t, mergeEvents(ctx(), t, t.nodes.get('D2')!, t.nodes.get('K2')!));
  assert.equal(t.nodes.get('K2')!.clocks.park?.at, '2026-08-09T12:00:00.000Z', 'an ordinary park still comes across');
});

test('merge-record: the report does not re-decide what a fold moved', () => {
  // The reason decisions are read through the fold rather than COPIED onto the
  // survivor. Copies carry fresh event ids, and `decided` is a set difference
  // on ids — so a copying merge would re-report every decision the source
  // carried, in the one artefact that leaves the device, dated to a period in
  // which nothing was decided. Pinned in both directions.
  const TZ = 'America/Denver';
  const NOW = '2026-07-30T12:00:00.000Z';
  let s = write(emptyState(), [
    ev('node.created', 'S', { nodeKind: 'action', title: 'ship it' }, { seq: 0 }),
    ev('node.created', 'T', { nodeKind: 'action', title: 'ship it' }, { seq: 1 }),
  ]);
  s = write(s, [ev('decision.logged', 'S', { text: 'ship on Friday', at: '2026-07-28T12:00:00.000Z' }, { seq: 2 })]);

  // Period one: the decision is new, and is reported once.
  const mark = s;
  assert.equal(statusReport(emptyState(), s, null, NOW, TZ).decided.length, 1, 'reported once when it was decided');

  // Period two: nothing decided, but the duplicate is folded away.
  s = write(s, mergeEvents(ctx(), s, s.nodes.get('S')!, s.nodes.get('T')!));
  const after = statusReport(mark, s, null, NOW, TZ);
  assert.deepEqual(after.decided, [], 'a fold decides nothing, so the report says nothing was decided');

  // And splitting it back out does not re-decide it either.
  s = write(s, unmergeEvents(ctx(), 'S'));
  assert.deepEqual(statusReport(mark, s, null, NOW, TZ).decided, [], 'nor does splitting it back out');

  // Meanwhile the decision is still reachable — through the fold while folded,
  // and on its own node once split. It was never lost, only unreadable.
  const folded = write(mark, mergeEvents(ctx(), mark, mark.nodes.get('S')!, mark.nodes.get('T')!));
  assert.equal(decisionsFor(folded, folded.nodes.get('T')!).length, 1, 'still readable on the survivor');
});

test('merge-offer: a target that cannot hold what the source carries is never offered', () => {
  // F-B. legalMergeTargets filtered held / not-beneath / person-vs-non-person
  // and stopped there, so a source carrying a demand clock could be folded into
  // a demand-free kind and be refused by the law-6 branch — AFTER the user had
  // already picked the target. "Legality is computed, never refused after the
  // offer." (The Menu half of `canHold` is belt-and-braces: the direction rule
  // below already keeps dated WORK away from Menu targets, so canHold catches
  // the remaining case — a legacy Menu item that still carries a demand clock.)
  let s = write(emptyState(), [
    ev('node.created', 'SRC', { nodeKind: 'action', title: 'read the report' }, { seq: 0 }),
    ev('node.created', 'ASP', { nodeKind: 'aspiration', title: 'read the report' }, { seq: 1 }),
    ev('node.created', 'OK', { nodeKind: 'action', title: 'read the report' }, { seq: 2 }),
  ]);

  // With no demand clock, a demand-free kind is a perfectly good home.
  assert.ok(legalMergeTargets(s, s.nodes.get('SRC')!).map(t => t.id).includes('ASP'),
    'a source with no date may fold into a demand-free kind');

  // With one, it is not offered — and the gate confirms why.
  s = write(s, [ev('clock.set', 'SRC', { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 't' }, { seq: 3 })]);
  const dated = legalMergeTargets(s, s.nodes.get('SRC')!).map(t => t.id);
  assert.ok(!dated.includes('ASP'), 'a demand-free kind cannot hold a date, so it is not offered');
  assert.ok(dated.includes('OK'), 'ordinary work still is');
  assert.throws(
    () => admit(mergeEvents(ctx(), s, s.nodes.get('SRC')!, s.nodes.get('ASP')!), s),
    GateRejection, 'the gate would have refused it — which is exactly why it must not be offered',
  );
  assert.equal(canHold(s.nodes.get('ASP')!, s.nodes.get('SRC')!), false, 'and canHold says so directly');
  assert.equal(canHold(s.nodes.get('OK')!, s.nodes.get('SRC')!), true);
});

test('merge-offer: work never folds into a wish; a wish folds into a wish', () => {
  // The direction rule. Folding real work into a wish is a DEMOTION, and the
  // app already has a verb for that (route to Menu) which sheds the date
  // visibly. But two copies of "read this book" are the commonest duplicate
  // there is, so wish-into-wish must keep working — which a blunt
  // exclude-all-Menu-targets rule would have broken.
  let s = write(emptyState(), [
    ev('node.created', 'WORK', { nodeKind: 'action', title: 'a book' }, { seq: 0 }),
    ev('node.created', 'W1', { nodeKind: 'action', title: 'a book' }, { seq: 1 }),
    ev('node.created', 'W2', { nodeKind: 'action', title: 'a book' }, { seq: 2 }),
  ]);
  s = write(s, [
    ev('menu.item.added', 'W1', { category: 'read' }, { seq: 3 }),
    ev('menu.item.added', 'W2', { category: 'read' }, { seq: 4 }),
  ]);
  assert.ok(legalMergeTargets(s, s.nodes.get('W1')!).map(t => t.id).includes('W2'),
    'a wish folds into a wish');
  assert.ok(legalMergeTargets(s, s.nodes.get('W1')!).map(t => t.id).includes('WORK'),
    'and a wish may fold into work — that is a promotion, not a loss');
  assert.ok(!legalMergeTargets(s, s.nodes.get('WORK')!).map(t => t.id).includes('W1'),
    'but work never folds into a wish');
});

test('one-reader: n.todayFor is read in exactly one place', () => {
  // F-C. src/composed.ts's header states that `composedFor` is THE ONE reader
  // of `todayFor` — and that claim is the entire mechanism of expiry-by-
  // projection (ADR-0051): because no API takes a day argument, "chosen
  // yesterday and not done" is structurally uncomputable. detail.ts had grown
  // its own `n.todayFor === localDayKey(...)`, which happened to agree — but a
  // claim that protects a design has to be true, not nearly true.
  const roots = ['src', 'test/../src'];
  void roots;
  const allowed = new Set(['src/fold.ts', 'src/composed.ts', 'src/snapshot.ts', 'src/ui/merge-intents.ts']);
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.ts')) continue;
      const src = readFileSync(p, 'utf8');
      // Strip block and line comments — a mention in prose is not a read.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/\btodayFor\b/.test(code) && !allowed.has(p)) offenders.push(p);
    }
  };
  walk('src');
  assert.deepEqual(offenders, [],
    'todayFor is read only through composedFor; a surface that re-derives "chosen" derives it a second time');
});

test('merge-carry: a fold carries what the source fed, and what fed the source', () => {
  // F-G. `feeds` and `leadDays` were never in the 1.7.0 carry list, and the
  // dependency arithmetic broke in BOTH directions. Forward: the survivor did
  // not feed what the source fed. Reverse: `dependencyView` drops a downstream
  // with `mergedInto`, so an upstream's latestStartInDays fell from a real
  // number to null — "start it today" became silence. That is the assembled-
  // context half of law 3, the part ADR-0012 exists for, vanishing wordlessly.
  const TZ = 'America/Denver';
  const NOW = '2026-08-01T12:00:00.000Z';
  let s = write(emptyState(), [
    ev('node.created', 'DUP', { nodeKind: 'action', title: 'draft the deck' }, { seq: 0 }),
    ev('node.created', 'KEEP', { nodeKind: 'action', title: 'draft the deck' }, { seq: 1 }),
    ev('node.created', 'LAUNCH', { nodeKind: 'action', title: 'the launch' }, { seq: 2 }),
    ev('node.created', 'UP', { nodeKind: 'action', title: 'gather the numbers' }, { seq: 3 }),
  ]);
  s = write(s, [
    ev('clock.set', 'LAUNCH', { clockKind: 'suspense', at: '2026-08-11T12:00:00.000Z', source: 't' }, { seq: 4 }),
    // The duplicate carries its own commitment too — that is what the upstream's
    // arithmetic is computed against, and it is carried to the survivor.
    ev('clock.set', 'DUP', { clockKind: 'due', at: '2026-08-11T12:00:00.000Z', source: 't' }, { seq: 7 }),
  ]);
  s = write(s, [ev('dependency.declared', 'DUP', { feeds: 'LAUNCH', leadEstimateDays: 4 }, { seq: 5 })]);
  s = write(s, [ev('dependency.declared', 'UP', { feeds: 'DUP', leadEstimateDays: 2 }, { seq: 6 })]);

  const before = dependencyView(s, s.nodes.get('UP')!, NOW, TZ);
  assert.equal(before.latestStartInDays, 8, 'precondition: the upstream knows when it must start');

  s = write(s, mergeEvents(ctx(), s, s.nodes.get('DUP')!, s.nodes.get('KEEP')!));

  // Forward: the survivor feeds what the duplicate fed, with its lead time.
  const fwd = dependencyView(s, s.nodes.get('KEEP')!, NOW, TZ);
  assert.equal(fwd.soonest?.node.id, 'LAUNCH', 'the survivor feeds what the duplicate fed');
  assert.equal(fwd.leadDays, 4, 'and how long it takes came with it');
  assert.equal(fwd.latestStartInDays, 6);

  // Reverse: the upstream still knows, because it now points at the survivor.
  const rev = dependencyView(s, s.nodes.get('UP')!, NOW, TZ);
  assert.equal(rev.latestStartInDays, 8, 'the upstream did not go silent about a real commitment');
  assert.ok(rev.feeds.some(f => f.node.id === 'KEEP'), 'it points at the thing that stayed');
});

test('merge-carry: an edge that would make two things wait for each other is skipped and stated', () => {
  // The gate refuses a cycle, so the carry must never BUILD one — it skips and
  // SAYS so. A skip nobody is told about is the silent swallow again, wearing a
  // different hat. Note the check runs against the accumulating batch, not
  // prior state: two edges can be individually acyclic and jointly cyclic.
  let s = write(emptyState(), [
    ev('node.created', 'DUP', { nodeKind: 'action', title: 'a' }, { seq: 0 }),
    ev('node.created', 'KEEP', { nodeKind: 'action', title: 'a' }, { seq: 1 }),
    ev('node.created', 'MID', { nodeKind: 'action', title: 'b' }, { seq: 2 }),
  ]);
  // MID feeds KEEP, and the duplicate feeds MID: DUP -> MID -> KEEP, acyclic.
  // Carrying DUP's edge onto KEEP would mean KEEP -> MID -> KEEP.
  s = write(s, [ev('dependency.declared', 'MID', { feeds: 'KEEP', leadEstimateDays: 1 }, { seq: 3 })]);
  s = write(s, [ev('dependency.declared', 'DUP', { feeds: 'MID', leadEstimateDays: 1 }, { seq: 4 })]);

  const plan = mergePlan(ctx(), s, s.nodes.get('DUP')!, s.nodes.get('KEEP')!);
  assert.doesNotThrow(() => admit(plan.events, s), 'the plan is never a batch the gate must refuse');
  const after = write(s, plan.events);
  assert.equal(silentNodes(after).length, 0, 'and law 1 held throughout');
  assert.ok(!after.nodes.get('KEEP')!.feeds.includes('MID'), 'the looping edge was not written');
  assert.deepEqual(plan.skipped.feeds, ['MID'], 'and it is reported, not dropped in silence');
});

test('oracle-nouns: the equivalence generator emits every kind the gate has an opinion about', () => {
  // F-F. The 150-seed equivalence property is the strongest test this repo has,
  // and its generator emitted only 1.3.x-era kinds — so `node.unmerged`, the
  // ONE branch the gate has gained since the oracle was frozen, was never once
  // exercised. The gate's best test had a blind spot exactly where the gate
  // last changed, and nothing could see it because what the generator produced
  // was written down nowhere.
  //
  // This is the durable half: the generator can now never fall behind the
  // gate's own list of kinds it must reason about.
  const generated = new Set(GENERATED_KINDS);
  const missing = SILENT_RISK_KINDS.filter(k => !generated.has(k));
  assert.deepEqual(missing, [],
    'every silent-risk kind must be reachable by the property, or the property is silent about it');

  // And the list must not rot in the other direction either.
  for (const k of GENERATED_KINDS) {
    assert.ok(isKnownKind(k), `${k} is generated but is not a known event kind`);
  }

  // Belt: actually RUN the generator and confirm the new nouns come out. A
  // declared list that the code does not produce is the defect one level up.
  const rnd = lcg(7);
  const seen = new Set<string>();
  const prior = seedState();
  let f = 0;
  for (let i = 0; i < 4000; i++) seen.add(randomEvent(rnd, prior, () => `F${f++}`).kind);
  for (const k of ['node.unmerged', 'request.declined', 'park.set', 'menu.item.promoted']) {
    assert.ok(seen.has(k), `${k} is declared but the generator never produced it`);
  }
});

test('clear-fold: clearing what you hold is possible after you have folded a duplicate', () => {
  // F-I, found by the 1.9.2 smoke walk and NOT by any unit test — the walk had
  // always split its one fold back out, so no folded pair ever survived to the
  // purge step. `clearEvents` trashed only HELD nodes, and a folded-away source
  // is not held; trashing the survivor then made it silent (isSilent rides the
  // merge chain, and a chain ending in the trash is silent), so the whole-batch
  // belt refused the write. "Clear what I am holding" was therefore impossible
  // for anyone who had ever folded a duplicate and left it folded — shipped in
  // 1.7.0 and never noticed. The file's own comment said this "cannot violate
  // law 1", which was true before folds existed and quietly stopped being true.
  const ctx = {
    at: '2026-07-28T12:00:00.000Z', device: 'd0', vault: 'personal',
    seq: () => n++, id: () => `c${n++}`,
  };
  let s = write(emptyState(), [
    ev('node.created', 'A', { nodeKind: 'action', title: 'a' }, { seq: 0 }),
    ev('node.created', 'B', { nodeKind: 'action', title: 'a' }, { seq: 1 }),
  ]);
  s = write(s, [ev('node.merged', 'A', { into: 'B' }, { seq: 2 })]);
  assert.equal(silentNodes(s).length, 0, 'precondition: the fold is covered');

  const batch = clearEvents(ctx, s);
  assert.doesNotThrow(() => admit(batch, s), 'clearing is not refused because a duplicate was folded');
  const after = write(s, batch);
  assert.equal(heldNodes(after).length, 0, 'the surfaces emptied');
  assert.equal(silentNodes(after).length, 0, 'and nothing was left silent');
  assert.ok(after.nodes.get('A')!.trashed, 'the folded-away source was let go with the rest of it');
  // Still an append: the record survives, which is the whole difference between
  // clearing and starting again.
  assert.ok(after.nodes.get('A')!.mergedInto === 'B', 'and the fold itself is still in the record');
});
