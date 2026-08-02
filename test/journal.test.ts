// The journal's key derivation (1.13.0, ADR-0061).
//
// The cipher itself is `src/seal.ts`, tested since ADR-0037 and unchanged here.
// What is new is passphrase -> key, so that is what these prove: that it is
// deterministic across devices, that a wrong passphrase fails CLOSED, and that
// the work factor cannot be talked down.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KDF_ITERATIONS, PASSPHRASE_WARNING, deriveKey, newSalt } from '../src/journal.ts';
import { open, seal } from '../src/seal.ts';
import { admit, isSilent, silentNodes } from '../src/gate.ts';
import { fold, emptyState, type State } from '../src/fold.ts';
import { nextUpQueue } from '../src/nextup.ts';
import { offerNow } from '../src/offer.ts';
import { searchHeld } from '../src/search.ts';
import type { AppEvent } from '../src/events.ts';

let n = 0;
const ev = (kind: string, node: string | null, payload: unknown, over: Partial<AppEvent> = {}): AppEvent => ({
  id: over.id ?? `j${n++}`, vault: 'personal', at: '2026-08-02T12:00:00.000Z',
  device: 'd0', seq: (over.seq as number) ?? n, kind, node, payload,
} as AppEvent);
const write = (prior: State, offered: AppEvent[]): State => fold(admit(offered, prior), prior);

test('the same passphrase and salt give the same key on any device', () => {
  // THE WHOLE MECHANISM. A journal written on the iPad opens on the laptop
  // because both derive the same key from the same two inputs — which is why
  // the salt goes into the log rather than into device storage.
  return (async () => {
    const salt = newSalt();
    const onePad = await deriveKey('a long enough passphrase', salt);
    const other = await deriveKey('a long enough passphrase', salt);
    const sealed = await seal(onePad, { text: 'a quiet evening' });
    assert.deepEqual(await open(other, sealed), { text: 'a quiet evening' },
      'the second device opens what the first sealed');
  })();
});

test('a different salt gives a different key, from the same passphrase', () => {
  return (async () => {
    const a = await deriveKey('the same words entirely', newSalt());
    const b = await deriveKey('the same words entirely', newSalt());
    const sealed = await seal(a, { text: 'x' });
    await assert.rejects(() => open(b, sealed), /could not be opened/,
      'two people with one passphrase do not share a key');
  })();
});

test('FAILS CLOSED: a wrong passphrase yields nothing, and says one thing', () => {
  // seal.ts is deliberate about this: ONE message for every cause, carrying no
  // number and no fragment of the blob, because distinguishing "wrong key" from
  // "tampered" tells an attacker which of the two they achieved.
  return (async () => {
    const salt = newSalt();
    const right = await deriveKey('correct horse battery staple', salt);
    const wrong = await deriveKey('correct horse battery stapler', salt);
    const sealed = await seal(right, { text: 'private' });
    await assert.rejects(() => open(wrong, sealed), (e: Error) => {
      assert.match(e.message, /that could not be opened with this key/);
      assert.doesNotMatch(e.message, /\d/, 'and it leaks no length');
      return true;
    });
    // And the right one still opens it, so the test is about the key and not
    // about the blob being broken.
    assert.deepEqual(await open(right, sealed), { text: 'private' });
  })();
});

test('the work factor cannot be talked down by a record', () => {
  // The iterations are stored with the salt so a later release can raise them
  // and still open older entries. That flexibility is also an attack surface: a
  // corrupt or hostile record carrying `iterations: 1` would make the key cheap
  // while everything still appeared to work. Refused, not guessed.
  return (async () => {
    const salt = newSalt();
    for (const bad of [1, 1000, 0, -1, NaN, Infinity]) {
      await assert.rejects(() => deriveKey('a passphrase', salt, bad),
        /does not carry a usable work factor/, `${bad} is refused`);
    }
    // A HIGHER count is fine — that is the upgrade path working.
    await assert.doesNotReject(() => deriveKey('a passphrase', salt, KDF_ITERATIONS * 2));
  })();
});

test('an empty passphrase is refused before any derivation happens', () => {
  return assert.rejects(() => deriveKey('', newSalt()), /a passphrase is needed/);
});

test('the warning says the thing ADR-0005 requires it to say, plainly', () => {
  // "A forgotten passphrase means the journal is gone, and this must be said
  // plainly before the passphrase is set, not buried in a help page."
  const all = PASSPHRASE_WARNING.join(' ');
  assert.match(all, /no way to recover it/i, 'it says there is no recovery');
  assert.match(all, /the journal is gone/i, 'in those words');
  assert.match(all, /never leaves this device/i, 'and what the passphrase is for');
  // It must also say what is NOT at risk, or it reads as a threat to everything.
  assert.match(all, /Everything else you keep here is untouched/i,
    'and bounds the loss, so it is a fact rather than a scare');
  // Voice: adult, calm, no rebuke, and nothing childlike.
  assert.doesNotMatch(all, /careful|warning|danger|!|oops|whoops/i,
    'stated as a fact, never as an alarm');
});

// --- the gate change, and the surfaces --------------------------------------

test('DEMAND-FREE: an entry takes no clock, and law 1 still reads zero', () => {
  // Verified by running the gate before the change: without `journal` in
  // DEMAND_FREE_KINDS the cure gives every private entry a review clock, so it
  // comes back at you on a work surface as an untitled thing to be done.
  // Reverting that one array entry reds this test.
  let s = write(emptyState(), [ev('node.created', 'J', { nodeKind: 'journal', title: '' }, { seq: 0 })]);
  const entry = s.nodes.get('J')!;
  assert.deepEqual(Object.keys(entry.clocks), [], 'a journal entry carries no clock at all');
  assert.equal(silentNodes(s).length, 0, 'and law 1 is satisfied without one');
  assert.equal(isSilent(entry, s), false, 'because the kind is demand-free, not because of a clock');

  // And a demand clock on one is REFUSED, the way it is for any demand-free
  // kind. A journal entry that could be due is not a journal entry.
  assert.throws(
    () => admit([ev('clock.set', 'J', { clockKind: 'due', at: '2026-08-09T12:00:00.000Z', source: 'me' }, { seq: 1 })], s),
    /a journal cannot carry a clock/,
    'a journal entry cannot be given a date',
  );
});

test('the journal is on NO work surface, and in no search result', () => {
  // The whole point. An entry must be invisible to every projection that offers
  // or counts work — otherwise the private thing is a to-do with a lock on it.
  const TZ = 'America/Denver';
  const NOW = '2026-08-02T18:00:00.000Z';
  let s = write(emptyState(), [
    ev('node.created', 'J', { nodeKind: 'journal', title: '' }, { seq: 0 }),
    ev('node.created', 'W', { nodeKind: 'action', title: 'real work' }, { seq: 1 }),
  ]);
  s = write(s, [ev('journal.entry.written', 'J', { v: 1, iv: 'aa', ct: 'bb' }, { seq: 2 })]);

  assert.ok(!nextUpQueue(s, NOW, TZ).some(i => i.node.id === 'J'), 'never offered as the next thing');
  assert.ok(!offerNow(s, NOW, TZ).work.some(i => i.node.id === 'J'), 'never in the offer');
  assert.equal(offerNow(s, NOW, TZ).wish?.id, undefined, 'and never mistaken for a wish');
  assert.ok(!searchHeld(s, 'a').items.some(x => x.id === 'J'), 'and search cannot reach it');
  // The ciphertext is in the LOG, and nothing in state carries it — which is
  // why search cannot index the journal even in principle.
  assert.equal(JSON.stringify(s.nodes.get('J')).includes('bb'), false,
    'the sealed text never reaches state at all');
});
