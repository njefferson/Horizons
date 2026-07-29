// The relay (sync stage 3, ADR-0037).
//
// Tested against a fake store, because the correctness has nothing to do with
// which key-value service is underneath — and a test that needs a deployed
// service is a test nobody runs.
//
// Two of these are the reason the file exists. **A crafted chunk name must not
// reach another mailbox**, because the key is built from a path segment and a path
// built from input is input. And **the store must never be asked for a partial
// id**, because the moment it is, the relay is enumerable and the id stops being a
// credential.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  handle, relayWords, MAX_BODY_BYTES, MAX_CHUNKS, TTL_SECONDS, type Deps, type Store,
} from '../src/relay.ts';
import { newKey, seal, syncId, open } from '../src/seal.ts';

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);

/**
 * A store that RESOLVES keys the way a filesystem would — decoding escapes and
 * collapsing `..` — which is the only kind of store where a chunk name with
 * structure in it can reach another mailbox.
 *
 * It exists because the flat-`Map` fake below cannot express that failure at all,
 * so a traversal test written against it passed with the guard deleted entirely.
 * **A fake that cannot express the failure cannot detect it**, and the test was
 * verifying the fake rather than the code. KV happens to be flat today; the guard
 * is what keeps a directory-backed or escape-decoding adapter safe tomorrow, and
 * this is the store that proves it.
 */
function resolvingStore() {
  const map = new Map<string, string>();
  const resolve = (key: string): string => {
    let decoded = key;
    for (let i = 0; i < 3; i++) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch { break; }
    }
    const out: string[] = [];
    for (const seg of decoded.split('/')) {
      if (seg === '.' || seg === '') continue;
      if (seg === '..') { out.pop(); continue; }
      out.push(seg);
    }
    return out.join('/');
  };
  const store: Store = {
    put: async (key, body) => { map.set(resolve(key), body); },
    get: async key => map.get(resolve(key)) ?? null,
    list: async prefix => [...map.keys()].filter(k => k.startsWith(resolve(prefix) + '/')),
  };
  return { store, map, resolve };
}

/** A store that records what it was asked, so the tests can assert about the
 *  QUESTIONS and not only the answers. */
function fakeStore() {
  const map = new Map<string, { body: string; ttl: number }>();
  const prefixes: string[] = [];
  const store: Store = {
    put: async (key, body, ttl) => { map.set(key, { body, ttl }); },
    get: async key => map.get(key)?.body ?? null,
    list: async prefix => {
      prefixes.push(prefix);
      return [...map.keys()].filter(k => k.startsWith(prefix));
    },
  };
  return { store, map, prefixes };
}

let ticks = 0;
function deps(store: Store): Deps {
  return { store, now: () => 1_700_000_000_000 + ticks++, token: () => 'abcdef0123456789' };
}

const req = (method: string, path: string, body?: string): Request =>
  new Request(`https://sync.example${path}`, body === undefined ? { method } : { method, body });

const post = (d: Deps, id: string, value: unknown) =>
  handle(req('POST', `/v1/${id}`, JSON.stringify(value)), d);

/** A well-formed sealed body, without needing a real key. */
const sealedish = (ct = 'AAAAAAAAAAAAAAAAAAAAAA==') => ({ v: 1, iv: 'AAAAAAAAAAAAAAAA', ct });

// --- the round trip ---------------------------------------------------------

test('a chunk goes in, is listed, and comes back byte for byte', async () => {
  const { store } = fakeStore();
  const d = deps(store);
  const body = sealedish('c29tZXRoaW5nIHNlYWxlZA==');

  const dropped = await post(d, A, body);
  assert.equal(dropped.status, 201);
  const { chunk } = await dropped.json() as { chunk: string };

  const listed = await handle(req('GET', `/v1/${A}`), d);
  assert.equal(listed.status, 200);
  assert.deepEqual((await listed.json() as { chunks: string[] }).chunks, [chunk]);

  const got = await handle(req('GET', `/v1/${A}/${chunk}`), d);
  assert.equal(got.status, 200);
  assert.deepEqual(await got.json(), body, 'exactly what was handed over');
});

test('a genuinely sealed payload survives the relay and opens on the other side', async () => {
  // End to end through the two modules that matter, with a real key. The relay is
  // in the middle and never holds anything it can read.
  const { store, map } = fakeStore();
  const d = deps(store);
  const k = await newKey();
  const id = await syncId(k);
  const events = [{ id: 'e1', device: 'd1', seq: 1, title: 'ring the roofer' }];

  const { chunk } = await post(d, id, await seal(k, events)).then(r => r.json()) as { chunk: string };
  const stored = [...map.values()].map(v => v.body).join(' ');
  assert.equal(stored.includes('roofer'), false, 'not in what the relay holds');

  const back = await handle(req('GET', `/v1/${id}/${chunk}`), d);
  assert.deepEqual(await open(k, await back.json()), events);
});

test('two identical bodies become two chunks — nothing is ever overwritten', async () => {
  const { store, map } = fakeStore();
  const d = deps(store);
  const one = await post(d, A, sealedish()).then(r => r.json()) as { chunk: string };
  const two = await post(d, A, sealedish()).then(r => r.json()) as { chunk: string };
  assert.notEqual(one.chunk, two.chunk);
  assert.equal(map.size, 2,
    'a relay that could replace a chunk could destroy the only copy in flight');
});

test('an empty mailbox is an empty list, not a 404', async () => {
  // "Nothing here yet" and "no such mailbox" are different facts. A device that
  // confuses them reports a fault on a first pairing that is working perfectly.
  const { store } = fakeStore();
  const r = await handle(req('GET', `/v1/${A}`), deps(store));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { chunks: [] });
});

test('a chunk carries an expiry, so the relay is a transport and not a store', async () => {
  const { store, map } = fakeStore();
  await post(deps(store), A, sealedish());
  assert.equal([...map.values()][0]!.ttl, TTL_SECONDS);
  assert.ok(TTL_SECONDS >= 28 * 24 * 3600, 'long enough for a device opened once a month');
});

// --- THE ONE THAT MATTERS: mailboxes cannot reach each other -----------------

test('THE ONE THAT MATTERS: a crafted chunk name cannot read another mailbox', async () => {
  // Against a store that RESOLVES keys — decodes escapes, collapses `..` — which
  // is the only store where this attack is expressible. The first version of this
  // test used the flat fake and passed with the guard deleted, because the crafted
  // key was simply a literal that did not exist. It proved the fake, not the code.
  const { store, map, resolve } = resolvingStore();
  const d = deps(store);
  const secret = sealedish('c29tZWJvZHkgZWxzZXMgd29yaw==');
  const { chunk } = await post(d, B, secret).then(r => r.json()) as { chunk: string };
  assert.equal(map.get(`${B}/${chunk}`), JSON.stringify(secret), 'B really is in there');
  assert.equal(resolve(`${A}/..%2F${B}%2F${chunk}`), `${B}/${chunk}`,
    'and this store really would hand it over — so the guard is the only thing stopping it');

  for (const crafted of [
    `..%2F${B}%2F${chunk}`,
    `..%2f${B}%2f${chunk}`,
    encodeURIComponent(`../${B}/${chunk}`),
    `${chunk}%2F..%2F..%2F${B}%2F${chunk}`,
    '%2e%2e%2f' + B + '%2f' + chunk,
  ]) {
    const r = await handle(req('GET', `/v1/${A}/${crafted}`), d);
    assert.equal(r.status === 400 || r.status === 404, true, `${crafted} -> ${r.status}`);
    const text = await r.text();
    assert.equal(text.includes('somebody'), false, `${crafted} leaked the body`);
    assert.equal(text.includes(secret.ct), false, `${crafted} leaked the ciphertext`);
  }

  // The UNDISGUISED `..` is a different matter, and asserting it must not
  // return 200 was wrong. `new URL` resolves the path before the handler ever
  // sees it, so `/v1/<A>/../<B>/<chunk>` becomes plainly `/v1/<B>/<chunk>` — a
  // request the caller could only have written by already knowing B's id, which
  // is the credential. It reads B's mailbox because it IS a request for B's
  // mailbox, and there is no escalation in it. Recorded as the resolution rather
  // than deleted, so nobody re-derives it as a hole later.
  assert.equal(new URL(`https://sync.example/v1/${A}/../${B}/${chunk}`).pathname,
    `/v1/${B}/${chunk}`, 'normalisation happens above the handler');
  // What must hold is the thing that actually matters: knowing ONLY A never
  // yields anything of B's. Every encoded form above is refused, and a traversal
  // that stays inside the segment count cannot name a second id at all.
  const stillA = await handle(req('GET', `/v1/${A}/${chunk}`), d);
  assert.equal(stillA.status, 404, "A's mailbox does not contain B's chunk");

  // And a crafted name cannot WRITE outside its mailbox either. Reading was the
  // obvious direction; a POST that lands in somebody else's mailbox is the same
  // hole pointed the other way, and the chunk name on that path is generated
  // rather than supplied — asserted so it stays that way.
  await post(d, A, sealedish('bWluZQ=='));
  const bKeys = [...map.keys()].filter(k => k.startsWith(`${B}/`));
  assert.equal(bKeys.length, 1, "nothing new appeared in B's mailbox");
});

test('THE OTHER ONE: the store is never asked for a partial id', async () => {
  // The id IS the credential. The moment `list` accepts a shorter prefix, the
  // relay is enumerable and the credential is worthless — so this asserts the
  // QUESTION the relay asks its store, not the answer it gets back.
  const { store, prefixes } = fakeStore();
  const d = deps(store);
  await post(d, A, sealedish());
  await handle(req('GET', `/v1/${A}`), d);
  await handle(req('GET', '/v1/'), d);
  await handle(req('GET', '/v1/aaaa'), d);
  await handle(req('GET', '/v1'), d);
  await handle(req('GET', '/'), d);

  assert.ok(prefixes.length > 0, 'it did ask, so the assertion below means something');
  for (const p of prefixes) {
    assert.equal(p.length, 33, `asked for "${p}", which is not a whole id and a separator`);
    assert.match(p, /^[0-9a-f]{32}\/$/);
  }
});

test('there is no route that lists mailboxes', async () => {
  const { store } = fakeStore();
  const d = deps(store);
  await post(d, A, sealedish());
  await post(d, B, sealedish());
  for (const path of ['/v1', '/v1/', '/', '/v1/list', '/v1/all/chunks', '/mailboxes']) {
    const r = await handle(req('GET', path), d);
    assert.notEqual(r.status, 200, `${path} answered`);
    const text = await r.text();
    assert.equal(text.includes(A), false, `${path} named a mailbox`);
    assert.equal(text.includes(B), false, `${path} named a mailbox`);
  }
});

// --- what it refuses --------------------------------------------------------

test('anything not shaped like a sealed message is refused', async () => {
  // The structural guarantee: a mailbox cannot be turned into a file host by a
  // client that simply POSTs a file.
  const { store, map } = fakeStore();
  const d = deps(store);
  for (const body of [
    'a plain sentence',
    '{"not":"a seal"}',
    '[1,2,3]',
    'null',
    '{"v":1,"iv":"","ct":"x"}',
    '{"v":1,"ct":"x"}',
    '{"iv":"x","ct":"y"}',
    '',
  ]) {
    const r = await handle(req('POST', `/v1/${A}`, body), d);
    assert.equal(r.status, 400, `accepted ${JSON.stringify(body)}`);
  }
  assert.equal(map.size, 0, 'and nothing was written on the way to refusing');
});

test('the refusal does not quote back what was sent', async () => {
  // An error that echoes the body turns a relay into a reflector, and this one
  // answers to anybody who can guess an id.
  const { store } = fakeStore();
  const r = await handle(req('POST', `/v1/${A}`, 'ring the roofer about the leak'), deps(store));
  const text = await r.text();
  assert.equal(text.includes('roofer'), false);
});

test('an oversized body is refused, measured in BYTES not characters', async () => {
  // A cap measured in the wrong unit is not a cap: multi-byte text is bigger
  // than its length suggests, and this one is three times bigger.
  const { store, map } = fakeStore();
  const d = deps(store);
  const wide = '\u{1F600}'.repeat(MAX_BODY_BYTES / 4 + 10);   // 4 bytes each
  assert.ok(wide.length < MAX_BODY_BYTES, 'shorter than the cap in characters');
  assert.equal((await handle(req('POST', `/v1/${A}`, wide), d)).status, 413);
  assert.equal(map.size, 0);
});

test('a full mailbox is refused plainly, and says it clears itself', async () => {
  const { store, map } = fakeStore();
  const d = deps(store);
  for (let i = 0; i < MAX_CHUNKS; i++) map.set(`${A}/${i}-abcdef0123456789`, { body: '{}', ttl: 1 });
  const r = await handle(req('POST', `/v1/${A}`, JSON.stringify(sealedish())), d);
  assert.equal(r.status, 507);
  assert.match((await r.json() as { error: string }).error, /expire/);
  assert.equal(map.size, MAX_CHUNKS, 'and it did not squeeze one more in');
});

test('a malformed id is refused, and a mailbox never appears at the wrong case', async () => {
  const { store } = fakeStore();
  const d = deps(store);
  for (const id of ['A'.repeat(32), 'a'.repeat(31), 'a'.repeat(33), 'g'.repeat(32), 'a-b']) {
    assert.equal((await handle(req('GET', `/v1/${id}`), d)).status, 400, id);
  }
});

test('methods that are not used here are refused, not silently ignored', async () => {
  const { store, map } = fakeStore();
  const d = deps(store);
  const { chunk } = await post(d, A, sealedish()).then(r => r.json()) as { chunk: string };
  for (const m of ['DELETE', 'PUT', 'PATCH']) {
    const r = await handle(req('DELETE' === m ? m : m, `/v1/${A}/${chunk}`), d);
    assert.equal(r.status, 405, m);
  }
  assert.equal(map.size, 1, 'and nothing was removed — there is no delete route at all');
});

test('a chunk that has expired reads as gone, not as an error', async () => {
  const { store } = fakeStore();
  const r = await handle(req('GET', `/v1/${A}/1700000000000-abcdef0123456789`), deps(store));
  assert.equal(r.status, 404);
});

// --- responses --------------------------------------------------------------

test('nothing the relay serves is cacheable', async () => {
  // A stale listing would make a device believe it had already collected
  // something it never received.
  const { store } = fakeStore();
  const d = deps(store);
  const { chunk } = await post(d, A, sealedish()).then(r => r.json()) as { chunk: string };
  for (const path of [`/v1/${A}`, `/v1/${A}/${chunk}`]) {
    const r = await handle(req('GET', path), d);
    assert.equal(r.headers.get('cache-control'), 'no-store', path);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', path);
  }
});

test('preflight is answered so a browser will talk to it at all', async () => {
  const { store } = fakeStore();
  const r = await handle(req('OPTIONS', `/v1/${A}`), deps(store));
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.match(String(r.headers.get('access-control-allow-methods')), /POST/);
});

test('listing is ordered and ignores keys it did not write', async () => {
  const { store, map } = fakeStore();
  const d = deps(store);
  map.set(`${A}/2-aaaaaaaaaaaaaaaa`, { body: '{}', ttl: 1 });
  map.set(`${A}/1-aaaaaaaaaaaaaaaa`, { body: '{}', ttl: 1 });
  map.set(`${A}/not-a-chunk-name`, { body: '{}', ttl: 1 });
  const { chunks } = await handle(req('GET', `/v1/${A}`), d).then(r => r.json()) as { chunks: string[] };
  assert.deepEqual(chunks, ['1-aaaaaaaaaaaaaaaa', '2-aaaaaaaaaaaaaaaa']);
});

// --- words ------------------------------------------------------------------

test('an unreachable relay is an ordinary condition, said as one', async () => {
  // A train, a hotel, a shut laptop. "Sync failed" is a red wall for something
  // that is not a fault, and nothing was lost because nothing was.
  for (const outcome of ['ok', 'unreachable', 'full', 'refused'] as const) {
    const w = relayWords(outcome);
    // NOT the bare word "lost": the correct sentence is "nothing here is lost",
    // and banning the substring fires on the reassurance it exists to protect.
    // The same mistake as an earlier denylist that banned "by " and rejected the
    // right answer "put by". A denylist has to name the CLAIM, not the letters —
    // so what is banned is a sentence that says something WAS lost.
    for (const bad of ['fail', 'error', 'corrupt', 'retry', '%', 'server',
                       'was lost', 'data loss', 'you have lost']) {
      assert.doesNotMatch(w, new RegExp(bad, 'i'), `"${w}" contains "${bad}"`);
    }
  }
  assert.match(relayWords('unreachable'), /safe/);
  assert.match(relayWords('full'), /nothing here is lost/);
});
