// The plain-words map (1.4.0): total over the vocabulary, honest at the edge,
// and never a channel for content.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { eventWords, isCure } from '../src/log-words.ts';
import { EVENT_KINDS, type AppEvent } from '../src/events.ts';

const NOW = '2026-07-29T18:00:00.000Z';
const TZ = 'America/Denver';

const ev = (kind: string, payload: unknown = {}, over: Partial<AppEvent> = {}): AppEvent =>
  ({ id: 'e1', vault: 'personal', at: NOW, device: 'd0', seq: 1, kind, node: 'N', payload, ...over } as AppEvent);

test('TOTALITY: every kind in the closed vocabulary has real words', () => {
  for (const kind of EVENT_KINDS) {
    const words = eventWords(ev(kind), TZ);
    assert.ok(words.length > 0, `${kind} returned nothing`);
    assert.ok(!words.includes('— recorded.'),
      `${kind} fell through to the fallback — every shipped noun deserves real words`);
    // The banned vocabulary is banned HERE most of all: these lines are the
    // record reading itself back.
    assert.ok(!/overdue|streak/i.test(words), `${kind} used banned words: "${words}"`);
  }
});

test('an unknown kind states its raw name rather than guessing', () => {
  const words = eventWords(ev('future.noun'), TZ);
  assert.equal(words, 'future.noun — recorded.');
});

test('a cure speaks in the app’s voice and says why it wrote', () => {
  const cure = ev('clock.set',
    { clockKind: 'review', at: '2026-07-29T23:59:59.000Z', source: 'gate:capture.recorded' },
    { id: 'cause~cure~N' });
  assert.ok(isCure(cure));
  const words = eventWords(cure, TZ);
  assert.match(words, /^The app /, 'the app owns its own writes');
  assert.match(words, /so it would not go silent/, 'and says why');
});

test('a chosen date names its kind and its day', () => {
  const words = eventWords(ev('clock.set',
    { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 'detail:due' }), TZ);
  assert.match(words, /^You gave it a due date — 2026-08-09\.$/);
});

test('CONTENT NEVER RIDES ALONG: a note line says one was kept, never what it said', () => {
  const secret = 'the crown costs 900 and I am worried about it';
  const kept = eventWords(ev('node.field.set', { field: 'note', value: secret }), TZ);
  assert.equal(kept, 'A note was kept with it.');
  assert.ok(!kept.includes(secret), 'the body stays on the sheet');
  const removed = eventWords(ev('node.field.set', { field: 'note', value: '' }), TZ);
  assert.equal(removed, 'The note was removed.');
  // The same rule for the journal — the one encrypted domain must not leak
  // through its log line of all places.
  const journal = eventWords(ev('journal.entry.written', { text: secret }), TZ);
  assert.ok(!journal.includes(secret));
});

test('a referenced node comes through in the reader’s words via titleOf', () => {
  const words = eventWords(ev('node.parented', { parent: 'P1' }), TZ,
    id => (id === 'P1' ? 'Boy Scouts' : null));
  assert.equal(words, 'Put under “Boy Scouts”.');
  assert.equal(eventWords(ev('node.parented', { parent: 'GONE' }), TZ, () => null),
    'Put under something.', 'a missing title degrades honestly, not to a raw id');
});

test('the route words match what the sorting surfaces say', () => {
  assert.equal(eventWords(ev('clarify.routed', { route: 'waiting-for' }), TZ),
    'Sorted as waiting for.');
});

test('malformed payloads degrade to words, never to a throw', () => {
  // The viewer reads STORED data; a hand-edited import must not kill it.
  for (const kind of EVENT_KINDS) {
    assert.doesNotThrow(() => eventWords(ev(kind, null), TZ), `${kind} with null payload`);
    assert.doesNotThrow(() => eventWords(ev(kind, { at: 'not a date', clockKind: 7 }), TZ),
      `${kind} with junk payload`);
  }
});
