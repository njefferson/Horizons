// When a copy last left, and whether anything has happened since (1.14.0).
//
// The two things most worth pinning are the two that would produce a LIE:
// a calendar file counting as a backup, and the sentence being permanently on
// because of the deliver-then-record ordering.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  WHOLE_COPY_SCOPES, changesSinceCopy, copyDayWords, copyNote, lastCopy,
} from '../src/copies.ts';
import { deliverCopy } from '../src/ui/export-copy.ts';
import type { AppEvent } from '../src/events.ts';

let n = 0;
const ev = (kind: string, payload: unknown, over: Partial<AppEvent> = {}): AppEvent => ({
  id: (over.id as string) ?? `e${String(n).padStart(4, '0')}`,
  vault: 'personal',
  at: (over.at as string) ?? `2026-08-0${1 + (n++ % 8)}T12:00:00.000Z`,
  device: (over.device as string) ?? 'd0',
  seq: (over.seq as number) ?? n,
  kind, node: null, payload,
} as AppEvent);

const copyEv = (at: string, scope = 'all', over: Partial<AppEvent> = {}): AppEvent =>
  ev('export.written', { at, scope, encrypted: false }, { at, ...over });

test('a calendar file is NOT a copy, and neither is a range reading copy', () => {
  // The finding this module exists for. `export.written` is one noun for three
  // different acts, and counting the wrong two would tell somebody they were
  // covered on the day they were not.
  const log = [
    copyEv('2026-08-01T09:00:00.000Z', 'calendar'),
    copyEv('2026-08-02T09:00:00.000Z', 'Loose from the import'),
  ];
  assert.equal(lastCopy(log), null, 'neither one is a copy of your data');
  assert.equal(copyDayWords(lastCopy(log), 'UTC'), 'none yet');
});

test('the scopes that ARE whole copies', () => {
  // `before-letting-go` counts: it is a full `exportAll` taken automatically
  // before a destructive bulk act, so somebody who let a range go this morning
  // genuinely does have a copy from this morning.
  assert.ok(WHOLE_COPY_SCOPES.has('all'));
  assert.ok(WHOLE_COPY_SCOPES.has('before-letting-go'));
  assert.ok(!WHOLE_COPY_SCOPES.has('calendar'));
  for (const scope of ['all', 'before-letting-go']) {
    const c = lastCopy([copyEv('2026-08-01T09:00:00.000Z', scope)]);
    assert.ok(c, `${scope} is a copy`);
  }
});

test('the newest copy wins, whatever order the log arrives in', () => {
  // A shard from another device can bring an older copy in after a newer one,
  // so position in the array is not the answer — the total order is.
  const older = copyEv('2026-07-20T09:00:00.000Z');
  const newer = copyEv('2026-08-01T09:00:00.000Z');
  assert.equal(lastCopy([older, newer])?.at, newer.at);
  assert.equal(lastCopy([newer, older])?.at, newer.at, 'and arrival order changes nothing');
});

test('NOT PERMANENTLY ON: an export does not immediately look stale', () => {
  // The trap. The file is delivered BEFORE `export.written` is committed, so a
  // file never contains its own record — reading "anything at or after the
  // copy" would put the sentence on one millisecond after every export, which
  // is how a warning becomes wallpaper.
  const work = ev('capture.recorded', { title: 'a thing' }, { at: '2026-08-01T08:00:00.000Z' });
  const copy = copyEv('2026-08-01T09:00:00.000Z');
  const log = [work, copy];
  assert.equal(changesSinceCopy(log, lastCopy(log)), false, 'nothing is unheld right after a copy');
  assert.equal(copyNote(log, lastCopy(log)), '', 'and it says nothing at all');
});

test('one capture after the copy, and it says so', () => {
  const copy = copyEv('2026-08-01T09:00:00.000Z');
  const after = ev('capture.recorded', { title: 'later' }, { at: '2026-08-01T10:00:00.000Z' });
  const log = [copy, after];
  assert.equal(changesSinceCopy(log, lastCopy(log)), true);
  assert.equal(copyNote(log, lastCopy(log)), 'There are changes here that no copy holds.');
});

test('exporting a CALENDAR after a copy does not make the data look stale', () => {
  // `export.written` never counts as a change, whatever its scope. Bookkeeping
  // about copies is not unsaved work, and this is the case where the two meet.
  const copy = copyEv('2026-08-01T09:00:00.000Z');
  const cal = copyEv('2026-08-02T09:00:00.000Z', 'calendar');
  const log = [copy, cal];
  assert.equal(changesSinceCopy(log, lastCopy(log)), false);
  assert.equal(copyNote(log, lastCopy(log)), '');
});

test('an empty log says nothing, and a log with work and no copy says so once', () => {
  assert.equal(lastCopy([]), null);
  assert.equal(changesSinceCopy([], null), false, 'nothing held is not a warning');
  assert.equal(copyNote([], null), '', 'a brand-new store is not scolded');

  const log = [ev('capture.recorded', { title: 'a thing' })];
  assert.equal(copyNote(log, null), 'No copy has left this device yet.');
});

test('THE GATE: `deliverCopy` refuses a scope the reader would not see', () => {
  // The durable half. A list of what counts as a copy, written by hand and not
  // binding on the writers, is the "carry list with a delay fuse" this repo
  // learned about in 1.9.2 — a future release could add a whole-copy scope and
  // the panel would silently never see it. So the writer is held to the set.
  //
  // Deliberate-failure proof: deleting the guard in `deliverCopy` reds this,
  // and removing 'all' from WHOLE_COPY_SCOPES reds the whole file.
  //
  // The refusal lands before any DOM or storage is touched, which is why this
  // runs in Node with no session at all.
  return (async () => {
    await assert.rejects(
      () => deliverCopy({} as never, 'calendar', 'ics'),
      /not a whole-copy scope/,
      'a calendar file cannot be written through the whole-copy path',
    );
    await assert.rejects(
      () => deliverCopy({} as never, 'Loose from the import', 'json'),
      /not a whole-copy scope/,
      'and neither can a range',
    );
  })();
});

test('the words are a date, and carry no count of how far behind you are', () => {
  const copy = copyEv('2026-08-01T09:00:00.000Z');
  const words = copyDayWords(copy, 'UTC');
  assert.match(words, /Aug/, 'a real day');
  // Law 5: no duration, no "N days ago", no fraction. The date is a fact you
  // can check; a count of days behind is a score.
  const all = `${words} ${copyNote([copy], copy)} ${copyNote([copy, ev('capture.recorded', {})], copy)}`;
  assert.doesNotMatch(all, /\bago\b|\bdays?\b|\bbehind\b|\b\d+\s*(of|\/)\s*\d+/i,
    'a date, never a distance');
});
