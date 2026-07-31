// Read-only search (1.2.0).
//
// searchHeld is a pure projection: it must match by title substring, be case-
// and accent-insensitive, search only what is HELD (not trashed, not merged),
// cap the results while reporting the true total, and treat a blank query as
// "show nothing". Written to fail if any of those slips.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { admit, gateOptionsFor } from '../src/gate.ts';
import { fold, emptyState, type State } from '../src/fold.ts';
import { searchHeld, SEARCH_CAP } from '../src/search.ts';
import type { AppEvent } from '../src/events.ts';

let seq = 0;
const at = '2026-07-28T14:00:00.000Z';
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, gateOptionsFor('America/Denver')), prior);

const capture = (prior: State, id: string, text: string): State =>
  write(prior, [{
    id, vault: 'personal', at, device: 'd0', seq: seq++,
    kind: 'capture.recorded', node: id, payload: { text, source: 'quick', sourceTags: [] },
  } as AppEvent]);

const trash = (prior: State, id: string): State =>
  write(prior, [{
    id: `t-${id}`, vault: 'personal', at, device: 'd0', seq: seq++,
    kind: 'node.trashed', node: id, payload: { reason: 'test' },
  } as AppEvent]);

test('matches a title substring, and reports the total', () => {
  let s = capture(emptyState(), 'A', 'call the dentist');
  s = capture(s, 'B', 'email the landlord');
  s = capture(s, 'C', 'call mum');
  const r = searchHeld(s, 'call');
  assert.equal(r.total, 2, 'two titles contain "call"');
  assert.deepEqual(r.items.map(n => n.id).sort(), ['A', 'C'], 'the right two');
});

test('is case- and accent-insensitive', () => {
  let s = capture(emptyState(), 'A', 'Café renovation');
  s = capture(s, 'B', 'CAFETERIA plan');
  assert.equal(searchHeld(s, 'cafe').total, 2, '"cafe" finds "Café" and "CAFETERIA"');
  assert.equal(searchHeld(s, 'CAFÉ').total, 2, 'an accented, upper-case query folds as well');
});

test('a blank or whitespace query shows nothing', () => {
  const s = capture(emptyState(), 'A', 'anything');
  assert.deepEqual(searchHeld(s, '').items, [], 'empty string: no items');
  assert.equal(searchHeld(s, '   ').total, 0, 'whitespace only: no items');
  assert.equal(searchHeld(s, '').query, '', 'and the reported query is empty');
});

test('does not search the trash — a decided-gone thing is not lost', () => {
  let s = capture(emptyState(), 'A', 'shred the old files');
  s = trash(s, 'A');
  assert.equal(searchHeld(s, 'shred').total, 0, 'a trashed item is not a search hit');
});

test('caps the results but never hides the true total', () => {
  let s = emptyState();
  for (let i = 0; i < SEARCH_CAP + 8; i++) s = capture(s, `N${i}`, `widget number ${i}`);
  const r = searchHeld(s, 'widget');
  assert.equal(r.total, SEARCH_CAP + 8, 'the total counts every match');
  assert.equal(r.items.length, SEARCH_CAP, 'but only a capped page is returned');
});
