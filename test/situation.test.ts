// The situation field — the implementation-intention "if".
//
// The evidence this rests on is about plans the PERSON wrote and about the cue
// being present at the moment of performance. So the two things worth pinning
// are that the app never touches what was written, and that it is shown back.
// Everything else here is the note's own contract, inherited deliberately.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, emptyState, situationOf, noteOf, type State } from '../src/fold.ts';
import { admit, gateOptionsFor, silentNodes } from '../src/gate.ts';
import { nextUpQueue, upkeepChips } from '../src/nextup.ts';
import { situationEvents, noteEvents } from '../src/ui/detail-intents.ts';
import type { AppEvent } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';
const AGO = '2026-07-01T15:00:00.000Z';
const NOW = '2026-08-07T15:00:00.000Z';

let seq = 1000;
const ev = (kind: string, node: string | null, payload: unknown): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at: AGO, device: 'd0', seq: seq++, kind, node, payload } as AppEvent);
const ctx = (): StampContext =>
  ({ at: AGO, device: 'd0', vault: 'personal', zone: TZ, seq: () => seq++, id: () => `s${seq++}` } as StampContext);
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, gateOptionsFor(TZ)), prior);

function routed(): State {
  let s = write(emptyState(), [ev('capture.recorded', 'A', { text: 'ring the plumber' })]);
  return write(s, [ev('clarify.routed', 'A', { route: 'next-action' })]);
}

test('what the person wrote is what comes back — verbatim', () => {
  // The whole mechanism. A plan the app rephrased is not the person's plan, and
  // the evidence is specifically about self-generated ones.
  const written = 'after I put the kettle on';
  const s = write(routed(), situationEvents(ctx(), 'A', written));
  assert.equal(situationOf(s.nodes.get('A')!), written);
  assert.equal(nextUpQueue(s, NOW, TZ)[0]?.situation, written,
    'the offer must carry the situation — a plan shown once and never again is a noun in a database');
});

test('it is never required, and absence costs nothing', () => {
  const s = routed();
  assert.equal(situationOf(s.nodes.get('A')!), null);
  const head = nextUpQueue(s, NOW, TZ)[0];
  assert.ok(head, 'fixture: something is offered');
  assert.equal(head.situation, null, 'no situation must read as null, never as an empty claim');
});

test('the app does not correct the form of what was written', () => {
  // No "your plan should start with When…". These are all shapes a person might
  // reasonably write, and none is the canonical if-then. Every one survives.
  for (const written of [
    'when the kettle boils',
    'desk, tomorrow',
    'ONLY if Sam has replied',
    'next time I am in town — or the week after, whatever',
    '9',
  ]) {
    const s = write(routed(), situationEvents(ctx(), 'A', written));
    assert.equal(situationOf(s.nodes.get('A')!), written, `rewritten: ${written}`);
  }
});

test('an empty value is the honest removal, exactly like the note', () => {
  let s = write(routed(), situationEvents(ctx(), 'A', 'after the kettle'));
  assert.equal(situationOf(s.nodes.get('A')!), 'after the kettle');
  s = write(s, situationEvents(ctx(), 'A', ''));
  assert.equal(situationOf(s.nodes.get('A')!), null,
    'clearing must remove it, and the log keeps the record that it was removed');
});

test('the situation and the note are separate fields and do not overwrite each other', () => {
  // Per-field LWW is the reason `node.field.set` carries exactly one field. Two
  // user strings on one node must both survive.
  let s = write(routed(), noteEvents(ctx(), 'A', 'the number is on the fridge'));
  s = write(s, situationEvents(ctx(), 'A', 'after I put the kettle on'));
  assert.equal(noteOf(s.nodes.get('A')!), 'the number is on the fridge');
  assert.equal(situationOf(s.nodes.get('A')!), 'after I put the kettle on');
});

test('setting a situation writes no clock and makes nothing silent', () => {
  // It is a cue, not a commitment. Law 1 is unaffected either way, and a
  // situation must never become a demand by the back door.
  const before = routed();
  const clocksBefore = Object.keys(before.nodes.get('A')!.clocks).sort();
  const s = write(before, situationEvents(ctx(), 'A', 'after the kettle'));
  assert.deepEqual(Object.keys(s.nodes.get('A')!.clocks).sort(), clocksBefore,
    'a situation is not a date and must not mint one');
  assert.equal(silentNodes(s).length, 0);
});

test('it rides every surface that offers work, not just the head', () => {
  // An upkeep chip is a separate projection and was a real source of drift
  // before: a surface exempt from a rule is a hole in it, not a second view.
  let s = write(emptyState(), [ev('node.created', 'U', { nodeKind: 'upkeep', title: 'water the plants' })]);
  s = write(s, [ev('upkeep.interval.set', 'U', { intervalDays: 7, comfortWindowDays: 2 })]);
  s = write(s, situationEvents(ctx(), 'U', 'when I fill the kettle'));
  const chips = upkeepChips(s, NOW, TZ);
  assert.ok(chips.length > 0, 'fixture: the upkeep is asking');
  assert.equal(chips[0]!.situation, 'when I fill the kettle',
    'the chip dropped the situation — one surface showing the cue and another not is the drift');
});
