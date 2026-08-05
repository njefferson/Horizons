// Sealing what goes to the relay (sync stage 2, ADR-0037).
//
// The claim being tested is *"the relay cannot read anything"*, and it is only
// worth anything if it is asserted rather than stated. So these tests inspect
// what would actually be handed over and look for the plaintext in it.
//
// The other load-bearing property is IV uniqueness. Reusing an IV under AES-GCM
// is not a weakness that degrades, it is a total break — so it gets a test that
// would catch a fixed IV immediately.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newKey, exportKey, importKey, syncId, seal, open, malformedSeal, relaySees,
  SEAL_VERSION, PAD_TO, type Sealed,
} from '../src/seal.ts';
import { summarise } from '../src/exchange.ts';
import type { AppEvent } from '../src/events.ts';

const NOW = '2026-07-29T18:00:00.000Z';
const ev = (device: string, seq: number, title: string): AppEvent =>
  ({ id: `${device}-${seq}`, vault: 'personal', at: NOW, device, seq,
     kind: 'node.created', node: `${device}-${seq}`,
     payload: { nodeKind: 'action', title } } as AppEvent);

// --- the round trip ---------------------------------------------------------

test('what goes in comes back out', async () => {
  const k = await newKey();
  const events = [ev('d1', 1, 'the quarterly report'), ev('d1', 2, 'ring the roofer')];
  const back = await open(k, await seal(k, events));
  assert.deepEqual(back, events);
});

test('a summary is sealed too, not just the events', async () => {
  // An unencrypted summary hands the relay a per-device write-rate graph, which
  // is telemetry by another name, and this project does not have telemetry.
  const k = await newKey();
  const h = summarise([ev('d1', 1, 'x'), ev('d2', 7, 'y')]);
  assert.deepEqual(await open(k, await seal(k, h)), h);
});

// --- THE CLAIM, ASSERTED ----------------------------------------------------

test('THE CLAIM: what the relay is handed contains none of the content', async () => {
  const k = await newKey();
  const secret = 'ring the roofer about the leak';
  const sealed = await seal(k, [ev('my-ipad', 3, secret)]);

  // The wire form AND THE BYTES INSIDE IT. The first version of this test
  // searched only the base64 envelope — so it passed against a `seal` that
  // base64-encoded the plaintext and never encrypted it at all, because base64
  // of "roofer" does not contain the string "roofer". The test whose entire job
  // is this claim had no power over the one break that would falsify it.
  // Decoding first is what makes it an assertion rather than a restatement.
  const wire = relaySees(await syncId(k), sealed);
  const decoded = Buffer.from(sealed.ct, 'base64');
  const onTheWire = [
    JSON.stringify(wire),
    decoded.toString('utf8'),
    decoded.toString('latin1'),
  ].join('\x00');

  assert.equal(onTheWire.includes(secret), false, 'not the title');
  assert.equal(onTheWire.includes('roofer'), false, 'not a word of it');
  assert.equal(onTheWire.includes('my-ipad'), false, 'not the device name');
  assert.equal(onTheWire.includes('node.created'), false, 'not the event kind');
  assert.equal(onTheWire.includes(NOW), false, 'not when it happened');
  assert.equal(onTheWire.includes('vault'), false, 'not the schema');
  // Not even the SHAPE of it. Stated as "does not parse", because a check for a
  // brace byte would be flaky over random ciphertext while this one cannot be:
  // sixteen-plus random bytes do not accidentally form valid JSON, and plaintext
  // always would.
  assert.throws(() => JSON.parse(decoded.toString('utf8')) as unknown,
    'the bytes handed over are not a document at all');
  // What it DOES contain, exhaustively. If a future change adds a field, this
  // fails and somebody has to justify it.
  assert.deepEqual(Object.keys(relaySees('id', sealed)).sort(), ['ct', 'id', 'iv', 'v']);
});

test('the sync id gives no route to the key', async () => {
  const k = await newKey();
  const id = await syncId(k);
  const raw = await exportKey(k);
  assert.equal(id.length, 32, 'a 128-bit hex name');
  assert.match(id, /^[0-9a-f]+$/);
  assert.equal(raw.includes(id), false, 'the id is not a slice of the key');
  assert.equal(id.includes(raw.slice(0, 8)), false);
});

test('the same key always yields the same id, and different keys do not', async () => {
  // Deterministic, so both devices reach the same id without sending it — and
  // pairing therefore transfers exactly ONE secret.
  const k = await newKey();
  assert.equal(await syncId(k), await syncId(k));
  assert.notEqual(await syncId(k), await syncId(await newKey()));
});

// --- IV uniqueness ----------------------------------------------------------

test('THE OTHER ONE THAT MATTERS: every seal uses a fresh IV', async () => {
  // Reusing an IV under GCM leaks the XOR of both plaintexts AND the
  // authentication key. It is a total break, not a degradation, so a fixed IV
  // must be impossible to ship unnoticed.
  const k = await newKey();
  const ivs = new Set<string>();
  for (let i = 0; i < 200; i++) ivs.add((await seal(k, { i })).iv);
  assert.equal(ivs.size, 200, 'two hundred seals, two hundred different IVs');
});

test('sealing the same value twice produces different bytes', async () => {
  const k = await newKey();
  const a = await seal(k, ['identical']);
  const b = await seal(k, ['identical']);
  assert.notEqual(a.ct, b.ct,
    'otherwise the relay could tell that nothing changed, which is itself a fact about you');
  assert.deepEqual(await open(k, a), await open(k, b));
});

// --- failing closed ---------------------------------------------------------

test('a wrong key fails, and fails CLOSED', async () => {
  const mine = await newKey();
  const theirs = await newKey();
  const sealed = await seal(mine, ['private']);
  await assert.rejects(() => open(theirs, sealed), /could not be opened/);
});

test('a tampered blob is refused, not decrypted into something plausible', async () => {
  const k = await newKey();
  const sealed = await seal(k, ['the quarterly report']);
  // Flip a character at the FRONT of the ciphertext, never the tail.
  //
  // This flipped the SECOND-TO-LAST character and flaked ~1 run in 16 once
  // padding landed: a padded body is a whole number of buckets plus the 16-byte
  // GCM tag, whose base64 ends in a `=` pad — so the last one or two characters
  // carry base64 PADDING bits that `atob` discards. Flipping one of those changed
  // the string but not the decoded bytes, so GCM saw an untampered message and
  // `open` did not reject. The first character only ever encodes real data bits,
  // so a flip there always reaches the plaintext and the tag always catches it.
  const flipped: Sealed = { ...sealed, ct: (sealed.ct[0] === 'A' ? 'B' : 'A') + sealed.ct.slice(1) };
  await assert.rejects(() => open(k, flipped));
});

test('a truncated blob is refused', async () => {
  const k = await newKey();
  const sealed = await seal(k, ['x']);
  await assert.rejects(() => open(k, { ...sealed, ct: sealed.ct.slice(0, 8) }));
});

test('the failure message is a CONSTANT — it says nothing about the input', async () => {
  // Distinguishing "wrong key" from "tampered" tells an attacker which of the two
  // they achieved.
  //
  // The first version of this test took a wrong-key failure and a tampered
  // failure and asserted the two messages were equal. It passed against an
  // implementation that appended the ciphertext length and the IV to the
  // message — because those two cases share a length and an IV, so the leak
  // cancelled out in exactly the comparison meant to catch it. Testing the
  // technique ("these two agree") instead of the property ("it does not depend
  // on the input") is how a check ends up with no detection power at all.
  //
  // So: many failures, deliberately differing in key, in size, and in which
  // byte was disturbed, and the message must be ONE string across all of them.
  const k = await newKey();
  const other = await newKey();
  const short = await seal(k, ['x']);
  const long = await seal(k, [Array.from({ length: 400 }, (_, i) => `item ${i}`)]);

  const refusal = async (key: CryptoKey, blob: unknown): Promise<string> => {
    try {
      await open(key, blob);
    } catch (e) {
      return (e as Error).message;
    }
    // A blob that OPENS here is a worse result than an inconsistent message.
    throw new Error('it opened, which none of these should');
  };

  const messages = new Set<string>();
  for (const blob of [
    short,                                            // wrong key, small
    long,                                             // wrong key, large
  ]) messages.add(await refusal(other, blob));
  for (const blob of [
    { ...short, ct: 'AAAA' + short.ct.slice(4) },      // tampered at the front
    { ...long, ct: long.ct.slice(0, -6) + 'AAAAAA' },  // tampered at the tag
    { ...short, iv: long.iv },                         // right key, wrong iv
    { ...long, ct: long.ct.slice(0, 24) },             // truncated
  ]) messages.add(await refusal(k, blob));

  assert.equal(messages.size, 1,
    `one message for every cause; got ${messages.size}: ${[...messages].join(' | ')}`);
  // And it carries no fragment of the blob it refused.
  const [msg] = [...messages];
  assert.equal(msg!.includes(short.iv), false, 'not the iv');
  assert.equal(msg!.includes(String(long.ct.length)), false, 'not a size');
  assert.doesNotMatch(msg!, /\d/, 'no number at all, since any number is a measurement of the input');
});

// --- a blob from a relay is input -------------------------------------------

test('a malformed blob is refused before any crypto call', async () => {
  // Passing arbitrary shapes to subtle.decrypt is how a surface reports a
  // DOMException at somebody who wanted to know if their phone was up to date.
  assert.notEqual(malformedSeal(null), null);
  assert.notEqual(malformedSeal([]), null);
  assert.notEqual(malformedSeal('nope'), null);
  assert.notEqual(malformedSeal({}), null);
  assert.notEqual(malformedSeal({ v: SEAL_VERSION, iv: '', ct: 'x' }), null);
  assert.notEqual(malformedSeal({ v: SEAL_VERSION, iv: 'x' }), null);
  const k = await newKey();
  assert.equal(malformedSeal(await seal(k, [1])), null, 'a real one passes');
});

test('a NEWER format says the other device is ahead, rather than erroring vaguely', async () => {
  const msg = malformedSeal({ v: SEAL_VERSION + 1, iv: 'x', ct: 'y' });
  assert.match(String(msg), /newer version/);
  assert.match(String(msg), new RegExp(String(SEAL_VERSION + 1)), 'and names the format');
});

// --- pairing ----------------------------------------------------------------

test('a key survives being written down and typed back in', async () => {
  const k = await newKey();
  const text = await exportKey(k);
  const back = await importKey(text);
  // The proof is that the second key opens the first one's message.
  assert.deepEqual(await open(back, await seal(k, ['paired'])), ['paired']);
  assert.equal(await syncId(back), await syncId(k), 'and reaches the same sync id');
});

test('surrounding whitespace from a paste is forgiven', async () => {
  const k = await newKey();
  const back = await importKey(`  ${await exportKey(k)}\n`);
  assert.equal(await syncId(back), await syncId(k));
});

test('a truncated paste is refused rather than made to work', async () => {
  const k = await newKey();
  const text = await exportKey(k);
  await assert.rejects(() => importKey(text.slice(0, 10)), /pairing key is 32 bytes/);
  await assert.rejects(() => importKey('not base64 at all !!!'), /pairing key/);
  await assert.rejects(() => importKey(''), /pairing key/);
});

test('the key is 256 bits and the text is short enough to hand over', async () => {
  const text = await exportKey(await newKey());
  assert.equal(text.length, 44, '32 bytes as base64 — one line, AirDroppable, typeable if it must be');
});

// --- compression, inside the seal -------------------------------------------
//
// It was asked whether there should be compression on it. Measured on a real
// planner: 8.4x, turning a first sync from eight uploads into one. Storage
// writes are the scarcest resource in this design, so that is the difference
// between a comfortable margin and a tight one.
//
// It happens INSIDE the seal, so the relay cannot tell whether it was used, and
// the payload is self-describing by gzip's magic bytes — no wrapper, no version
// bump, no negotiation, and both directions of the upgrade work.

test('a log-shaped payload is dramatically smaller on the wire', async () => {
  const key = await newKey();
  // The shape that actually travels: many events sharing keys, a device id and
  // near-identical timestamps. That repetition is the whole reason this pays.
  const events = Array.from({ length: 300 }, (_, i) => ({
    id: `dev-abcdefgh-${i}`, vault: 'personal', at: '2026-07-30T12:00:00.000Z',
    device: 'dev-abcdefgh', seq: i, kind: 'node.created', node: `node-${i}`,
    payload: { nodeKind: 'action', title: `something to do number ${i}` },
  }));
  const body = { kind: 'events', events };

  const sealed = await seal(key, body);
  const plainSize = new TextEncoder().encode(JSON.stringify(body)).length;
  // Base64 inflates by 4/3, so the ciphertext must beat the raw JSON by a wide
  // margin before it is worth anything at all.
  assert.ok(sealed.ct.length < plainSize / 2,
    `sealed ${sealed.ct.length} vs raw ${plainSize} — compression is not paying`);

  assert.deepEqual(await open(key, sealed), body, 'and it still opens to exactly what went in');
});

test('an uncompressed sealed message still opens, so an older device is not orphaned', async () => {
  // The upgrade window: chunks already sitting in a mailbox were sealed without
  // compression. A reader that could only handle compressed payloads would
  // silently treat every one of them as unreadable.
  const key = await newKey();
  const body = { kind: 'events', events: [{ id: 'a-0', seq: 0 }] };

  // Sealed the OLD way — plain JSON bytes, no compression — by hand.
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const raw = new TextEncoder().encode(JSON.stringify(body));
  const ct = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, raw);
  const b64 = (b: ArrayBuffer | Uint8Array): string => {
    const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
    let out = '';
    for (const byte of bytes) out += String.fromCharCode(byte);
    return btoa(out);
  };
  const oldStyle = { v: 1, iv: b64(iv), ct: b64(ct) };

  assert.deepEqual(await open(key, oldStyle), body, 'an older chunk opens unchanged');
});

test('compression changes nothing about failing closed', async () => {
  // The guarantees that matter most must survive the optimisation: a wrong key
  // still refuses, and it still refuses with the SAME words, carrying no hint of
  // size or content.
  const key = await newKey();
  const other = await newKey();
  const sealed = await seal(key, { kind: 'events', events: [{ id: 'x', seq: 0 }] });

  await assert.rejects(() => open(other, sealed), /could not be opened with this key/);

  const tampered = { ...sealed, ct: `${sealed.ct.slice(0, -8)}AAAAAAAA` };
  await assert.rejects(() => open(key, tampered), /could not be opened with this key/);
});

test('every value shape survives the round trip', async () => {
  // Compression operates on bytes and must be invisible to everything above it.
  const key = await newKey();
  for (const value of [
    { kind: 'request', want: { 'dev-a': [[0, 5]] } },
    { kind: 'events', events: [] },
    { text: 'a thought with emoji 🌱 and "quotes" and \n newlines' },
    { deep: { nested: { thing: [1, 2, 3, null, true] } } },
  ]) {
    assert.deepEqual(await open(key, await seal(key, value)), value,
      `round trip: ${JSON.stringify(value).slice(0, 40)}`);
  }
});

test('tiny payloads still work, even though compression cannot help them', async () => {
  // gzip adds a header, so a very small body may come out LARGER. That must be
  // correct, not clever — a size regression on a two-event chunk is invisible
  // beside the win on a full sync, and refusing to compress selectively would
  // add a branch that could disagree between devices.
  const key = await newKey();
  const tiny = { kind: 'events', events: [{ id: 'a', seq: 0 }] };
  assert.deepEqual(await open(key, await seal(key, tiny)), tiny);
});

// --- padding, and the question that produced it ------------------------------
//
// The question asked: can someone later inject a single item that then exports just itself and
// reveals much more because it is not obfuscated in a data pile?"
//
// The mechanism is not quite the one in the question, and it is real. A chunk
// holding only an attacker's own item tells them nothing they did not write; the
// danger is the reverse, their text compressed ALONGSIDE private text, where a
// guess that matches makes the result slightly smaller. This app has the
// injection leg such an attack needs — a link carrying `?text=`.
//
// So every sealed body is padded to a bucket. These tests hold that promise where
// it is easiest to lose: quietly, to an optimisation, months from now.

/** Exact byte length of a base64 string — the '=' characters are not data. */
const b64Bytes = (b64: string): number =>
  (b64.length / 4) * 3 - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

test('a one-event exchange and a fifty-event exchange are the same size on the wire', async () => {
  // The heart of it. Without padding, a size is a headcount — and for a daily
  // delta of one or two events that is a very sharp signal about what somebody
  // just did.
  const key = await newKey();
  const ev = (i: number): unknown => ({
    id: `dev-a-${i}`, vault: 'personal', at: '2026-07-30T12:00:00.000Z',
    device: 'dev-a', seq: i, kind: 'capture.recorded', node: `n${i}`,
    payload: { text: `thing ${i}`, source: 'quick' },
  });
  const one = await seal(key, { kind: 'events', events: [ev(0)] });
  const fifty = await seal(key, { kind: 'events', events: Array.from({ length: 50 }, (_, i) => ev(i)) });

  assert.equal(one.ct.length, fifty.ct.length,
    'one event and fifty are indistinguishable by size');
});

test('a crafted guess does not change the size it produces', async () => {
  // The compression oracle, in miniature. An attacker injects text and watches
  // whether a guess that MATCHES private content compresses better. Padding means
  // the difference has to cross a whole bucket before it is visible at all.
  const key = await newKey();
  const secret = 'the password for the shed is marigold';
  const withSecret = (guess: string): unknown => ({
    kind: 'events',
    events: [
      { id: 'a', device: 'd', seq: 0, kind: 'capture.recorded', node: 'n', payload: { text: secret, source: 'quick' } },
      { id: 'b', device: 'd', seq: 1, kind: 'capture.recorded', node: 'm', payload: { text: guess, source: 'url-endpoint' } },
    ],
  });

  const miss = await seal(key, withSecret('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'));
  const hit = await seal(key, withSecret(secret));   // a perfect guess, which compresses best
  assert.equal(miss.ct.length, hit.ct.length,
    'a guess that matches produces exactly the same size as one that does not');
});

test('padding does not break what it wraps', async () => {
  const key = await newKey();
  for (const value of [
    { kind: 'events', events: [] },
    { kind: 'request', want: { 'dev-a': [[0, 5]] } },
    { text: 'unicode 🌱 and "quotes" and \n newlines' },
  ]) {
    assert.deepEqual(await open(key, await seal(key, value)), value);
  }
});

test('a payload larger than one bucket still round-trips, and pads to a whole number of them', async () => {
  const key = await newKey();
  const big = { kind: 'events', events: Array.from({ length: 2000 }, (_, i) => ({
    id: `dev-a-${i}`, device: 'dev-a', seq: i, kind: 'node.created', node: `n${i}`,
    payload: { nodeKind: 'action', title: `a task called number ${i}` },
  })) };
  const sealed = await seal(key, big);
  assert.deepEqual(await open(key, sealed), big);

  // Ciphertext is the padded body plus GCM's 16-byte tag, before base64. The
  // trailing '=' characters must be subtracted — a first draft of this line used
  // a rounded length and failed against padding that was in fact exact.
  assert.equal((b64Bytes(sealed.ct) - 16) % PAD_TO, 0,
    'the sealed body is a whole number of buckets');
});

test('the cost of padding is bounded, not open-ended', async () => {
  // Padding trades bytes for silence, and the trade has to stay sane: a large
  // exchange must not balloon. At most one bucket is ever wasted.
  const key = await newKey();
  const events = Array.from({ length: 400 }, (_, i) => ({
    id: `dev-a-${i}`, device: 'dev-a', seq: i, kind: 'node.created', node: `n${i}`,
    payload: { nodeKind: 'action', title: `something to do number ${i}` },
  }));
  const sealed = await seal(key, { kind: 'events', events });
  const raw = new TextEncoder().encode(JSON.stringify({ kind: 'events', events })).length;
  assert.ok(b64Bytes(sealed.ct) < raw,
    'a full chunk is still far smaller than the raw JSON despite padding');
});
