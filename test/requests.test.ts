// Request slots and the Not Now ledger (1.8.0, ADR-0056). The load-bearing
// properties: a decline is kept AND lawful (parked, never silent, never an
// archive); the ledger never counts; shard order cannot change any answer;
// and the app's own "not now" (the do-now offer) still writes nothing —
// that line is pinned in comms.test.ts and must stay there.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fold, emptyState, type State } from '../src/fold.ts';
import { admit, gateOptionsFor, silentNodes } from '../src/gate.ts';
import {
  SLOT_DAYS, parseSlot, slotOf, nextSlotOccurrence, notNowLedger, ledgerRowWords, standingDecline,
} from '../src/requests.ts';
import {
  declineEvents, carryEvents, parkToSlotEvents, setSlotEvents,
} from '../src/ui/request-intents.ts';
import { localDayKey } from '../src/time.ts';
import type { AppEvent } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';       // a Wednesday, local day 2026-07-29
const OPTS = gateOptionsFor(TZ);

let seq = 0;
const ev = (kind: string, node: string | null, payload: unknown, at = NOW, device = 'd0'): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device, seq: seq++, kind, node, payload } as AppEvent);
const ctx = (): StampContext => ({
  at: NOW, device: 'd0', vault: 'personal', zone: TZ,
  seq: () => seq++, id: () => `i${seq}`,
});
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, OPTS), prior);
const capture = (prior: State, id: string, text = id): State =>
  write(prior, [ev('capture.recorded', id, { text, source: 'quick', sourceTags: [] })]);

// --- the decline -------------------------------------------------------------

test('a decline is kept, parked, and lawful — a decision, never an archive', () => {
  let s = capture(emptyState(), 'A', 'review the fielding plan');
  const batch = declineEvents(ctx(), s, s.nodes.get('A')!);
  const admitted = admit(batch, s, OPTS);
  s = fold(admitted, s);
  const n = s.nodes.get('A')!;
  assert.notEqual(n.notNow, null, 'the ledger holds it');
  assert.equal(n.notNow!.what, 'review the fielding plan', 'the words are the snapshot');
  assert.equal(Boolean(n.clocks.park), true, 'and it is parked — the comeback is the park');
  assert.deepEqual(silentNodes(s), [], 'law 1 holds');
  // Exactly ONE park lands: the deliberate one. A second, gate-cure park would
  // be a log line claiming the app rescued a node that was never silent.
  assert.equal(admitted.filter(e => e.kind === 'park.set').length, 1,
    'the deliberate park suppresses the cure — one park, one truth');
});

test('the person rides along when someone said who — and stays null when not', () => {
  let s = capture(emptyState(), 'A');
  s = write(s, [ev('person.created', 'SAM', { name: 'Sam' })]);
  s = write(s, [ev('person.linked', 'A', { node: 'A', person: 'SAM', relation: 'requested-by' })]);
  const batch = declineEvents(ctx(), s, s.nodes.get('A')!);
  const decl = batch.find(e => e.kind === 'request.declined')!;
  assert.equal((decl.payload as { person: string | null }).person, 'SAM');

  let t = capture(emptyState(), 'B');
  const batch2 = declineEvents(ctx(), t, t.nodes.get('B')!);
  const decl2 = batch2.find(e => e.kind === 'request.declined')!;
  assert.equal((decl2.payload as { person: string | null }).person, null,
    'nobody said who — an ordinary state, not a defect');
  t = write(t, batch2);
  assert.notEqual(t.nodes.get('B')!.notNow, null);
});

test('the rename-later proof: the ledger keeps the words that were declined', () => {
  let s = capture(emptyState(), 'A', 'the original ask');
  s = write(s, declineEvents(ctx(), s, s.nodes.get('A')!));
  s = write(s, [ev('node.renamed', 'A', { title: 'something else now' })]);
  assert.equal(s.nodes.get('A')!.notNow!.what, 'the original ask',
    'the record survives the rename — the consent-sentence rule');
});

// --- the way back ------------------------------------------------------------

test('carry it after all: off the ledger, covered again, back today', () => {
  let s = capture(emptyState(), 'A');
  s = write(s, declineEvents(ctx(), s, s.nodes.get('A')!));
  s = write(s, carryEvents(ctx(), 'A'));
  const n = s.nodes.get('A')!;
  assert.equal(n.notNow, null, 'its own thing again');
  assert.equal(Boolean(n.clocks.park), false, 'the park is gone');
  assert.deepEqual(silentNodes(s), [], 'and the gate cured the clear — covered');
});

test('done clears the ledger row — a completed thing is not a declined thing', () => {
  let s = capture(emptyState(), 'A');
  s = write(s, declineEvents(ctx(), s, s.nodes.get('A')!));
  s = write(s, [ev('done.marked', 'A', { at: '2026-07-30T01:00:00.000Z' }, '2026-07-30T01:00:00.000Z')]);
  // The visible rule is unchanged; the MECHANISM moved (1.17.4). The fold used
  // to null the record here, which made done-then-undone drop a standing
  // decline for ever. Now state keeps the record and `standingDecline` — the
  // one predicate every surface asks — settles it.
  assert.equal(notNowLedger(s).length, 0, 'no ledger row for a completed thing');
  assert.equal(standingDecline(s.nodes.get('A')!), null, 'the decline is settled');
  assert.ok(s.nodes.get('A')!.notNow, 'but the record survives, so undone can restore it');
});

test('LWW: decline vs carry converge on the later decision, in any shard order', () => {
  const genesis = [
    { id: 'g1', vault: 'personal', at: NOW, device: 'd0', seq: 9000,
      kind: 'node.created', node: 'A', payload: { nodeKind: 'action', title: 'a', provenance: { for: 'self' } } } as AppEvent,
    { id: 'g1~cure~A', vault: 'personal', at: NOW, device: 'd0', seq: 9000,
      kind: 'clock.set', node: 'A', payload: { clockKind: 'review', at: '2026-07-30T05:59:59.000Z', source: 'gate:node.created' } } as AppEvent,
  ];
  const decline = ev('request.declined', 'A', { person: null, what: 'a', reason: 'detail' }, '2026-07-29T19:00:00.000Z', 'ipad');
  const park = ev('park.set', 'A', { returnAt: '2026-07-30T05:59:59.000Z', reason: 'not-now-ledger' }, '2026-07-29T19:00:00.000Z', 'ipad');
  const carry = ev('clock.cleared', 'A', { clockKind: 'park' }, '2026-07-29T20:00:00.000Z', 'phone');
  const one = fold([...genesis, decline, park, carry]);
  const two = fold([...genesis, carry, decline, park]);
  assert.equal(one.nodes.get('A')!.notNow, null, 'the later carry wins');
  assert.equal(two.nodes.get('A')!.notNow, null, 'whatever order the shards arrive in');
  assert.equal(Boolean(one.nodes.get('A')!.clocks.park), Boolean(two.nodes.get('A')!.clocks.park),
    'and the park key agrees with itself in both orders');
});

// --- the ledger --------------------------------------------------------------

test('the ledger: standing declines only, newest first, and its words never count', () => {
  let s = capture(emptyState(), 'A');
  s = capture(s, 'B');
  s = capture(s, 'C');
  s = write(s, declineEvents({ ...ctx(), at: '2026-07-29T18:30:00.000Z' }, s, s.nodes.get('A')!));
  s = write(s, declineEvents({ ...ctx(), at: '2026-07-29T19:00:00.000Z' }, s, s.nodes.get('B')!));
  s = write(s, declineEvents({ ...ctx(), at: '2026-07-29T19:30:00.000Z' }, s, s.nodes.get('C')!));
  s = write(s, carryEvents({ ...ctx(), at: '2026-07-29T20:00:00.000Z' }, 'B'));
  const rows = notNowLedger(s).map(r => r.node.id);
  assert.deepEqual(rows, ['C', 'A'], 'standing declines only, newest decline first');
  // Law 5: a row is a name and a date, never a count and never a verdict.
  const titleOf = (id: string): string | null => s.nodes.get(id)?.title ?? null;
  for (const row of notNowLedger(s)) {
    const words = ledgerRowWords(row, titleOf, TZ, NOW);
    assert.match(words, /declined \d+ \w+/, 'a date in words');
    assert.doesNotMatch(words, /\d+\s*(times|of|\/)|%|remaining/, 'never a tally');
  }
});

// --- the slot ----------------------------------------------------------------

test('the slot parses only its own vocabulary — refused, never guessed', () => {
  for (const d of SLOT_DAYS) assert.equal(parseSlot(`weekly:${d}`), d);
  for (const bad of ['weekly:noonday', 'daily:mon', 'FREQ=WEEKLY;BYDAY=MO', '', null, undefined]) {
    assert.equal(parseSlot(bad as string | null), null, String(bad));
  }
});

test('setting and clearing the slot folds LWW, and clearing is honest', () => {
  let s = emptyState();
  s = write(s, setSlotEvents(ctx(), 'thu'));
  assert.equal(slotOf(s), 'thu');
  s = write(s, setSlotEvents({ ...ctx(), at: '2026-07-29T19:00:00.000Z' }, null));
  assert.equal(slotOf(s), null, "'' clears — a removal, not an absence of history");
  const on = ev('request.slot.set', null, { recurrence: 'weekly:fri' }, '2026-07-29T10:00:00.000Z');
  const off = ev('request.slot.set', null, { recurrence: '' }, '2026-07-29T11:00:00.000Z');
  assert.equal(slotOf(fold([on, off])), null, 'the later event wins');
  assert.equal(slotOf(fold([off, on])), null, 'whatever order the shards arrive in');
});

test('the next occurrence: today counts when today IS the slot day', () => {
  // NOW is a Wednesday in Denver.
  assert.equal(localDayKey(nextSlotOccurrence('wed', NOW, TZ), TZ), '2026-07-29', 'tonight is the nearest slot');
  assert.equal(localDayKey(nextSlotOccurrence('thu', NOW, TZ), TZ), '2026-07-30');
  assert.equal(localDayKey(nextSlotOccurrence('tue', NOW, TZ), TZ), '2026-08-04', 'six days out, never eight');
  for (const d of SLOT_DAYS) {
    const at = nextSlotOccurrence(d, NOW, TZ);
    assert.equal(Date.parse(at) > Date.parse(NOW), true, `${d} is in the future`);
  }
});

test('the occurrence math survives hostile zones and the year-0099 trap', () => {
  for (const zone of ['America/Santiago', 'America/Nuuk', 'Pacific/Kiritimati']) {
    const at = nextSlotOccurrence('sun', '2026-09-05T23:30:00.000Z', zone);
    assert.equal(Number.isNaN(Date.parse(at)), false, zone);
  }
  const ancient = nextSlotOccurrence('mon', '0099-08-04T12:00:00.000Z', TZ);
  assert.match(localDayKey(ancient, TZ), /^0099-08-/, 'two-digit years stay in their century');
});

test('a declined thing parks to the slot when one is set', () => {
  let s = capture(emptyState(), 'A');
  s = write(s, setSlotEvents(ctx(), 'fri'));
  s = write(s, declineEvents(ctx(), s, s.nodes.get('A')!));
  const park = s.nodes.get('A')!.clocks.park!;
  assert.equal(localDayKey(park.at, TZ), '2026-07-31', 'it waits for Friday, not for tonight');
});

test('park-to-slot refuses without a slot — never offer what cannot land', () => {
  const s = capture(emptyState(), 'A');
  assert.deepEqual(parkToSlotEvents(ctx(), s, 'A'), []);
});

test('the Menu belt refuses a decline on a wish — which is why the sheet never offers it', () => {
  let s = capture(emptyState(), 'A');
  s = write(s, [ev('clarify.routed', 'A', { route: 'someday' })]);
  s = write(s, [ev('menu.item.added', 'A', { category: 'try' })]);
  const n = s.nodes.get('A')!;
  assert.notEqual(n.onMenu, null, 'staged: a Menu item');
  assert.throws(() => admit(declineEvents(ctx(), s, n), s, OPTS),
    /Menu|wish/, 'a park on a wish is the unrenderable state the belt exists to refuse');
});
