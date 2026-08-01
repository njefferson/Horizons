// The note field (1.4.0): the cleaner, the intent, the fold, and the one
// reader — the first surface ever to read `n.fields`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanNote, NOTE_MAX } from '../src/note.ts';
import { noteEvents } from '../src/ui/detail-intents.ts';
import { fold, emptyState, noteOf, type State } from '../src/fold.ts';
import { admit, gateOptionsFor, silentNodes } from '../src/gate.ts';
import type { AppEvent } from '../src/events.ts';
import type { StampContext } from '../src/ui/session.ts';

const TZ = 'America/Denver';
const NOW = '2026-07-29T18:00:00.000Z';
const OPTS = gateOptionsFor(TZ);

let seq = 0;
const ev = (kind: string, node: string, payload: unknown, at = NOW, device = 'd0'): AppEvent =>
  ({ id: `e${seq}`, vault: 'personal', at, device, seq: seq++, kind, node, payload } as AppEvent);
const ctx = (): StampContext => ({
  at: NOW, device: 'd0', vault: 'personal', zone: TZ,
  seq: () => seq++, id: () => `i${seq}`,
});
const write = (prior: State, offered: AppEvent[]): State =>
  fold(admit(offered, prior, OPTS), prior);

test('cleanNote keeps prose structure and strips what cannot be seen', () => {
  assert.equal(cleanNote('line one\nline two\tindented'), 'line one\nline two\tindented',
    'newlines and tabs are the structure of prose');
  assert.equal(cleanNote('a‮evil​b'), 'aevilb',
    'bidi overrides and zero-width characters are removed — they can make text display as something other than what is stored');
  assert.equal(cleanNote('  padded  '), 'padded');
  assert.equal(cleanNote('bell'), 'bell', 'other control characters go');
  const long = 'x'.repeat(NOTE_MAX + 500);
  assert.equal(cleanNote(long).length, NOTE_MAX, 'capped, generously');
});

test('the note writes, folds with per-field LWW, and noteOf reads it back', () => {
  let s = emptyState();
  s = write(s, [ev('capture.recorded', 'A', { text: 'call the dentist', source: 'quick', sourceTags: [] })]);
  s = write(s, noteEvents(ctx(), 'A', 'ask about the crown\nand the bill'));
  assert.equal(noteOf(s.nodes.get('A')!), 'ask about the crown\nand the bill');
  assert.equal(silentNodes(s).length, 0, 'a note is not silent-risk and changes no coverage');

  // A later write wins; an empty write is the honest removal and reads as none.
  s = write(s, noteEvents(ctx(), 'A', 'the newer thought'));
  assert.equal(noteOf(s.nodes.get('A')!), 'the newer thought');
  s = write(s, noteEvents(ctx(), 'A', ''));
  assert.equal(noteOf(s.nodes.get('A')!), null, 'an empty note reads as no note');
});

test('two devices, per-field LWW: the later stamp wins whatever the fold order', () => {
  const genesis = ev('capture.recorded', 'A', { text: 't', source: 'quick', sourceTags: [] });
  const earlier = ev('node.field.set', 'A', { field: 'note', value: 'from the iPad' }, '2026-07-29T18:05:00.000Z', 'ipad');
  const later = ev('node.field.set', 'A', { field: 'note', value: 'from the phone' }, '2026-07-29T18:07:00.000Z', 'phone');
  const a = fold(admit([genesis], emptyState(), OPTS).concat(earlier, later));
  const b = fold(admit([genesis], emptyState(), OPTS).concat(later, earlier));
  assert.equal(noteOf(a.nodes.get('A')!), 'from the phone');
  assert.equal(noteOf(b.nodes.get('A')!), 'from the phone', 'shard arrival order does not change the answer');
});

test('the note survives a snapshot round-trip the way titles do', async () => {
  const { serialiseState, deserialiseState } = await import('../src/snapshot.ts');
  let s = emptyState();
  s = write(s, [ev('capture.recorded', 'A', { text: 't', source: 'quick', sourceTags: [] })]);
  s = write(s, noteEvents(ctx(), 'A', 'kept words'));
  const back = deserialiseState(JSON.parse(JSON.stringify(serialiseState(s))));
  assert.equal(noteOf(back.nodes.get('A')!), 'kept words');
});
