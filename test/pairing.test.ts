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
  acceptKeyText, currentKeyText,
} from '../src/ui/pairing.ts';
import { ACCEPT_CAUTION_WORDS } from '../src/ui/sync-ui.ts';
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

// --- where a pairing file points --------------------------------------------
//
// A pairing file carries a key AND a host, which makes a hostile one a real
// attack rather than a theoretical one: open it, and this planner starts handing
// its work to somebody else's relay, sealed with somebody else's key — which that
// somebody can read. The browser refuses the connection because the Sync
// edition's CSP names exactly one host, but that refusal is SILENT and the whole
// defence rested on one generated header.

test('a pairing file naming another handover point is refused by name', async () => {
  const store = kv();
  const real = await beginPairing(kv(), HOST, AT);
  const hostile = { ...real, host: 'https://not-your-relay.example' };

  await assert.rejects(
    () => acceptPairing(store, hostile, HOST),
    /cannot go|did not come from your other device/);
  assert.equal(await currentPairing(store), null, 'and nothing was stored');
});

test('a file from your own other device is accepted, because it names the same host', async () => {
  // The check must not break the ordinary case: both devices run the same build,
  // so both carry the same permitted host.
  const store = kv();
  const mine = await beginPairing(kv(), HOST, AT);
  const { id } = await acceptPairing(store, JSON.parse(JSON.stringify(mine)), HOST);
  assert.equal(id, mine.id);
  assert.notEqual(await currentPairing(store), null);
});

test('a plain-http handover point is refused, and said to be insecure', async () => {
  // The bodies are sealed either way, so this is not about reading contents: it
  // is that anything on the path could drop, delay or replay an exchange, and
  // every hop would learn the sync id and the cadence.
  const insecure = malformedPairing({
    format: 'quietkeep-pairing', version: 1, key: 'k', id: 'i', at: AT,
    host: 'http://relay.example',
  });
  assert.match(insecure!, /not secure/);
  assert.equal(malformedPairing({
    format: 'quietkeep-pairing', version: 1, key: 'k', id: 'i', at: AT,
    host: 'https://relay.example',
  }), null, 'https is still fine');
});

// --- pairing from the key alone ---------------------------------------------
//
// A requirement: have the QR encode a number the app pulls in as a long key, so
// a person can just press save. It carries the whole secret and nothing
// else, which is better than the file on three counts: 44 characters instead of
// a document, nothing left in a Downloads folder, and NO HOST FIELD — so the
// hostile-relay attack the file rung had to defend against simply does not
// exist on this road.

test('a key on its own pairs the device, with the host coming from the build', async () => {
  const source = kv();
  const file = await beginPairing(source, HOST, AT);

  const store = kv();
  const { id, host } = await acceptKeyText(store, file.key, HOST);

  assert.equal(id, file.id, 'the same pairing name, derived from the key');
  assert.equal(host, HOST, 'and the host is the one this build permits');
  const pair = await currentPairing(store);
  assert.equal(pair!.id, file.id);
});

test('a key carries no host, so there is nothing to point somewhere hostile', async () => {
  // The structural win. `acceptPairing` needed an explicit refusal for a file
  // naming another relay; there is no equivalent hole here to defend, because
  // the payload has nowhere to put one.
  const file = await beginPairing(kv(), HOST, AT);
  assert.doesNotMatch(file.key, /http/i, 'the key is opaque and carries no address');

  const store = kv();
  await acceptKeyText(store, file.key, HOST);
  assert.equal((await currentPairing(store))!.host, HOST,
    'the host can only ever be the one passed by the build');
});

test('a paste survives the mess a share sheet makes of it', async () => {
  // What a key actually looks like after a round trip through a Notes app, an
  // email, or a QR reader: wrapped, padded with spaces, sometimes carrying an
  // invisible character. None of that changes the key, so none of it may be
  // treated as changing the key.
  const file = await beginPairing(kv(), HOST, AT);
  const messy = ` ${file.key.slice(0, 20)}\n  ${file.key.slice(20)} \t\n`;

  const store = kv();
  const { id } = await acceptKeyText(store, messy, HOST);
  assert.equal(id, file.id, 'same key, same pairing');
});

test('a truncated key is refused, and says which way to fix it', async () => {
  // The most likely real mistake: a selection that missed the last characters.
  // "Invalid key" would send somebody looking for a broken app; naming the cause
  // sends them back to copy the whole thing.
  const file = await beginPairing(kv(), HOST, AT);
  const store = kv();

  await assert.rejects(
    () => acceptKeyText(store, file.key.slice(0, 30), HOST),
    /not a whole key/);
  assert.equal(await currentPairing(store), null, 'and nothing was stored');
});

test('an empty paste is refused without pretending it was a key', async () => {
  const store = kv();
  await assert.rejects(() => acceptKeyText(store, '   \n ', HOST), /no key there/);
  assert.equal(await currentPairing(store), null);
});

test('the key this device holds is the same text the other device pastes', async () => {
  // One string on both roads — what the QR encodes and what a person pastes.
  // If these could differ, a code that scanned perfectly would pair to nothing.
  const store = kv();
  const file = await beginPairing(store, HOST, AT);
  assert.equal(await currentKeyText(store), file.key);

  const other = kv();
  const { id } = await acceptKeyText(other, (await currentKeyText(store))!, HOST);
  assert.equal(id, file.id);
});

test('a device with no pairing has no key to show', async () => {
  assert.equal(await currentKeyText(kv()), null);
});

// --- the import side has a caution (audit finding) --------------------------
//
// An audit found every warning in the pairing surface was on the EXPORT side:
// showing a key warned you it was a secret, but TAKING one in said nothing. Yet
// import is where the real danger lives — a key you were handed by somebody else
// lets them read everything you sync, and the app cannot tell an honest key from
// a hostile one because a wholly attacker-chosen key is cryptographically valid.
// The only defence is the person, so the words have to arm the person.

test('the import caution names the danger and the check that defends against it', async () => {
  // Two clauses carry the weight: a key from anyone else is a way in, and the
  // pairing name is the thing to compare rather than trusting the file.
  assert.match(ACCEPT_CAUTION_WORDS, /only take in a key you watched appear on your own/i,
    'names the rule');
  assert.match(ACCEPT_CAUTION_WORDS, /from anyone else lets them read this planner/i,
    'names the consequence, plainly');
  assert.match(ACCEPT_CAUTION_WORDS, /check it matches the one on your other device/i,
    'and the check that actually defends against it');
});
