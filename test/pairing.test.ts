// Pairing by file, and what it refuses.
//
// Pairing is the one place in this app where somebody handles a SECRET. The key
// in that little JSON file is the whole planner: anyone who opens it can read
// everything either device holds. So the tests here are mostly about refusal —
// what happens when the file is wrong, edited, truncated, or from a version this
// build has never heard of.
//
// The rule underneath all of them: **a pairing that half-worked must be
// impossible.** Every failure mode below leaves the device exactly as it was,
// because the alternative is somebody believing they are paired while nothing
// ever moves — and silence is what this feature's failures look like.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  acceptPairing, beginPairing, currentPairing, forgetPairing,
  malformedPairing, pairingFilename, pairingWords, KEY_KV, HOST_KV, MARK_KV,
} from '../src/ui/pairing.ts';
import { exportKey, newKey, syncId } from '../src/seal.ts';

const HOST = 'https://relay.example';
const AT = '2026-07-30T12:00:00.000Z';

/** The kv half of a store, which is all pairing touches. */
function kv() {
  const map = new Map<string, unknown>();
  return {
    map,
    getKv: async <T,>(k: string): Promise<T | null> => (map.get(k) ?? null) as T | null,
    setKv: async (k: string, v: unknown): Promise<void> => { map.set(k, v); },
  };
}

test('the device that makes a pair is itself paired, with no second step', async () => {
  // There must be no state where somebody has exported a key they are not using
  // — that device would look paired, show a name, and never exchange anything.
  const store = kv();
  const file = await beginPairing(store, HOST, AT);
  const pair = await currentPairing(store);

  assert.notEqual(pair, null);
  assert.equal(pair!.id, file.id, 'and it shows the same name the file carries');
  assert.equal(pair!.host, HOST);
});

test('the name shown on both screens is derived from the key, not carried beside it', async () => {
  // This is what makes comparing the two screens meaningful. If the id were just
  // a field, a file could claim any name and two devices could agree on a name
  // while holding different keys — which is the exact failure the comparison is
  // there to catch.
  const a = kv();
  const b = kv();
  const file = await beginPairing(a, HOST, AT);
  await acceptPairing(b, JSON.parse(JSON.stringify(file)));

  const pa = await currentPairing(a);
  const pb = await currentPairing(b);
  assert.equal(pa!.id, pb!.id);
  assert.match(pa!.id, /^[0-9a-f]{32}$/);

  // The teeth: a file that LIES about its id does not get to name the pairing.
  // Without this the previous two assertions would also pass for an id that was
  // simply copied from the file, which would make the compare-the-screens check
  // worthless exactly when it matters.
  const c = kv();
  const forged = { ...file, id: '0'.repeat(32) };
  await assert.rejects(() => acceptPairing(c, forged));
  assert.equal(await currentPairing(c), null);
});

test('a file whose id disagrees with its key is refused, and changes nothing', async () => {
  // Truncated, edited, or assembled by hand. Pairing to it would "work" and then
  // never exchange, because the mailbox is named by the REAL key.
  const store = kv();
  const file = await beginPairing(kv(), HOST, AT);
  const tampered = { ...file, id: 'f'.repeat(32) };

  await assert.rejects(() => acceptPairing(store, tampered), /has been altered/);
  assert.equal(await currentPairing(store), null, 'and this device is still on its own');
});

test('a key that is not a key is refused at the door, not at exchange time', async () => {
  // A string of the right shape that is not a 256-bit key would otherwise be
  // accepted here and fail much later, as something unexplainable, on a screen
  // that has nothing to do with pairing.
  const store = kv();
  const real = await beginPairing(kv(), HOST, AT);
  await assert.rejects(
    () => acceptPairing(store, { ...real, key: 'bm90IGEga2V5', id: undefined }),
    () => true);
  assert.equal(await currentPairing(store), null);
});

test('a file from a newer version says so, rather than being called broken', async () => {
  // A newer format means the OTHER device is ahead. Telling somebody their file
  // is corrupt when it is simply newer sends them looking for the wrong problem.
  const newer = malformedPairing({ format: 'quietkeep-pairing', version: 2, key: 'x', host: HOST });
  assert.match(newer!, /newer version/);
  assert.match(newer!, /format 2/);
});

test('anything that is not a pairing file is refused before a byte is trusted', async () => {
  for (const notOne of [null, 42, 'a string', [], {}, { format: 'something-else' }]) {
    assert.notEqual(malformedPairing(notOne), null, `${JSON.stringify(notOne)} is not a pairing file`);
  }
  // An export of the planner itself is the file somebody will most plausibly
  // pick by mistake, since it sits in the same folder with a similar name.
  assert.notEqual(malformedPairing({ format: 'quietkeep-export', version: 1 }), null);
});

test('a file naming no handover point is refused', async () => {
  // Without a host there is nowhere to send anything, so pairing would succeed
  // and sync would silently never happen.
  const base = { format: 'quietkeep-pairing' as const, version: 1 as const, key: 'k', id: 'i', at: AT };
  assert.match(malformedPairing({ ...base, host: '' })!, /handover point/);
  assert.match(malformedPairing({ ...base, host: 'relay.example' })!, /handover point/);
  assert.equal(malformedPairing({ ...base, host: 'https://relay.example' }), null);
});

test('forgetting a pairing clears the key, the host and the mark — and nothing else', async () => {
  // Unpairing must not be a way to lose work, and the mark must go with the key:
  // a mark left behind would tell a NEW pairing that chunks it has never seen
  // were already taken in.
  const store = kv();
  await beginPairing(store, HOST, AT);
  store.map.set(MARK_KV, { ingested: ['001-aaaaaaaaaaaaaaaa'], uploaded: {} });
  store.map.set('capture.draft', 'half a thought');

  await forgetPairing(store);

  assert.equal(await currentPairing(store), null);
  assert.equal(store.map.get(KEY_KV), null);
  assert.equal(store.map.get(HOST_KV), null);
  assert.equal(store.map.get(MARK_KV), null, 'the mark went with the key');
  assert.equal(store.map.get('capture.draft'), 'half a thought', 'and nothing else was touched');
});

test('a key that no longer imports reads as not paired, rather than crashing', async () => {
  const store = kv();
  await beginPairing(store, HOST, AT);
  store.map.set(KEY_KV, 'not-a-key-any-more');
  assert.equal(await currentPairing(store), null);
});

test('the filename tells two pairings apart', async () => {
  const one = await beginPairing(kv(), HOST, AT);
  const two = await beginPairing(kv(), HOST, AT);
  assert.notEqual(pairingFilename(one.id), pairingFilename(two.id));
  assert.match(pairingFilename(one.id), /^quietkeep-pairing-[0-9a-f]{8}\.json$/);
});

test('what the screen says never calls an unpaired device misconfigured', async () => {
  // This is somebody's second device, not a settings object with a required
  // field left blank.
  const alone = pairingWords(null);
  assert.doesNotMatch(alone, /not configured|invalid|error|failed/i);
  assert.match(alone, /on its own/);

  const paired = pairingWords({ id: 'abcdef0123456789' + '0'.repeat(16) });
  assert.match(paired, /abcdef01/, 'and it shows the name to compare');
});

test('the key is stored as the file carries it, so a round trip is lossless', async () => {
  // Belt and braces on the format: the key is base64 in the file and base64 in
  // kv, and if those ever diverged the failure would appear as "the other device
  // cannot read anything", which is the least diagnosable symptom available.
  const key = await newKey();
  const raw = await exportKey(key);
  const store = kv();
  await acceptPairing(store, {
    format: 'quietkeep-pairing', version: 1, key: raw, host: HOST,
    id: await syncId(key), at: AT,
  });
  assert.equal(store.map.get(KEY_KV), raw);
});
