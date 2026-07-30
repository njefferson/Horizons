// The relay (sync stage 3, ADR-0037).
//
// **This is not part of Quietkeep.** Nothing in `src/ui` imports it, it is not in
// the bundle, and the app works exactly as it does today with the relay absent,
// unreachable or shut down forever. It belongs to the Sync sibling — a separate
// product with its own deployment, because it trades away "no server" and
// Doctrine §1 says a sibling that trades the promise does not get to hide inside
// the app that keeps it.
//
// ## What it is
//
// A mailbox per sync id, holding **sealed chunks** for a while. A device drops
// off what it has written; other devices pick it up whenever they next open. That
// is the whole design, and it is store-and-forward on purpose: **the other device
// is usually shut.** A protocol that needed both devices awake at once would be a
// protocol that works on the demo and not on Tuesday.
//
// ## What it is NOT
//
// **Not a store of record.** Every device keeps its own complete local log; the
// relay holds copies that expire. Losing the relay, or the key, costs the ability
// to exchange — it cannot cost anybody their work, which is what keeps law 9
// intact. It also means this file may be careless about durability and must be
// careful about confidentiality, which is the opposite of the usual server.
//
// **Not authenticated, and it does not need to be.** The only credential is the
// sync id, which is 128 bits derived from the key by one-way hash. There is no
// route that lists ids and no route that lists anything without one. Someone who
// guesses an id can write junk into a mailbox and read sealed bytes they cannot
// open; that is the entire consequence, and it is why the contents are sealed
// before they ever get here rather than protected by a login.
//
// ## The one structural guarantee
//
// It refuses anything that is not shaped like a sealed message (`malformedSeal`,
// imported rather than restated — one concept, one place). So it cannot be turned
// into a general-purpose host by a client that simply POSTs a file. It **cannot
// verify that a body is genuinely encrypted**, and it is not asked to: it has
// never held a key and never will. Stated plainly here because the difference
// between "refuses non-seals" and "proves everything is encrypted" is exactly the
// kind of gap a security claim likes to hide in.
//
// PURE, apart from what is injected: the store, the clock and the randomness.

import { malformedSeal } from './seal.ts';

/** Keys live under `<id>/<chunk>`. The store is a flat namespace and nothing
 *  more — deliberately small enough that KV, R2, a directory or a Map all
 *  satisfy it, so the transport is never the thing that has to be trusted. */
export interface Store {
  put(key: string, body: string, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<string | null>;
  /** Every key beginning with `prefix`. Only ever called with a COMPLETE id — see
   *  `PREFIX_IS_A_WHOLE_ID` and the test that holds it. */
  list(prefix: string): Promise<string[]>;
}

export interface Deps {
  store: Store;
  /** Milliseconds. Injected, so the tests are not about the wall clock. */
  now: () => number;
  /** 16 hex characters of randomness. Injected for the same reason. */
  token: () => string;
  /**
   * May this caller write right now?
   *
   * INJECTED, like everything else here, so the policy is testable without a
   * platform. In production it is Cloudflare's rate-limiting binding keyed on the
   * caller's IP; in tests it is a function.
   *
   * Optional, and absent means "no limit" — which is the honest default for a
   * relay somebody self-hosts, and is what the whole existing test suite runs
   * under. The deployed relay always passes one.
   */
  allowWrite?: (caller: string) => Promise<boolean>;
}

/** A sealed body over this is refused. Generous enough for a long log, small
 *  enough that a mailbox cannot be used as free hosting. */
export const MAX_BODY_BYTES = 512 * 1024;
/** More than this many chunks under one id means a client is looping, not
 *  syncing. Refused rather than absorbed. */
export const MAX_CHUNKS = 500;
/** How long a chunk lives. Long enough for a device that goes a month without
 *  being opened; short enough that the relay is visibly a transport. */
export const TTL_SECONDS = 30 * 24 * 60 * 60;

/** Exactly what `syncId` produces: 128 bits as lower-case hex. */
const ID = /^[0-9a-f]{32}$/;
/** Exactly what `chunkName` produces. Anchored, and NOT permitting `/` or `.`,
 *  which is what stops a crafted name reading another id's mailbox. */
const CHUNK = /^[0-9]{1,20}-[0-9a-f]{16}$/;

/** Documentation with a test behind it: `list` is never given a partial id, so no
 *  refactor can quietly turn this into an enumerable service. */
export const PREFIX_IS_A_WHOLE_ID = true;

const chunkName = (now: number, token: string): string => `${now}-${token}`;

const json = (status: number, body: unknown): Response =>
  new Response(
    // A 204 carries NO body, and constructing one with a body throws — which
    // would have made every browser preflight a 500. `JSON.stringify(null)`
    // returning the string "null" is exactly the kind of almost-nothing that
    // looks like nothing until the platform disagrees.
    status === 204 ? null : JSON.stringify(body),
    {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        // A mailbox is reached from a web app on another origin, and the only
        // credential is the id in the path. Origin is not the authorisation here
        // and pretending otherwise would be security theatre — the contents are
        // sealed before they arrive, which is the actual protection.
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        // Nothing here is ever a cache hit worth having, and a stale mailbox
        // listing would make a device believe it had already collected something.
        'cache-control': 'no-store',
        // It serves bytes it cannot read, to a client that will parse them. Both
        // headers are cheap and the alternative is a sniffed content type.
        'x-content-type-options': 'nosniff',
      },
    },
  );

/**
 * The whole relay.
 *
 * Four routes and no fifth:
 *   `OPTIONS *`             — preflight
 *   `POST /v1/<id>`         — drop a sealed chunk off, get its name back
 *   `GET  /v1/<id>`         — the NAMES of the chunks in this mailbox
 *   `GET  /v1/<id>/<chunk>` — one sealed chunk
 *
 * Names and bodies are separate on purpose: a device asks what is there, compares
 * it against what it has already taken in, and fetches only the difference. That
 * survives a store with eventual consistency, where a cursor does not — a chunk
 * written before your cursor can still become visible after it, and a device
 * would skip it forever without ever knowing.
 */
export async function handle(request: Request, deps: Deps): Promise<Response> {
  if (request.method === 'OPTIONS') return json(204, null);

  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'v1' || parts.length < 2 || parts.length > 3) {
    return json(404, { error: 'no such route' });
  }

  const id = parts[1]!;
  if (!ID.test(id)) return json(400, { error: 'that is not a sync id' });

  if (request.method === 'POST' && parts.length === 2) {
    // WRITES ARE THE SCARCE THING, and the reason this check exists at all.
    //
    // A mailbox is addressed by a 128-bit sync id, which is not guessable — but
    // the relay's own address is public by construction: it is named in the Sync
    // edition's CSP, which every visitor can read. So anyone can POST to
    // arbitrary ids, and each accepted POST is a write against a storage quota
    // that is small and daily. Nothing is exposed by this and nothing is
    // corrupted; the damage is that a household's sync stops until the quota
    // resets, silently, because request logging is deliberately off.
    //
    // "Keep the URL secret" is not available as a defence — it is published.
    // Rate limiting is, and it is keyed on the caller rather than on the mailbox:
    // a per-mailbox limit would let one flooder open a million mailboxes.
    const caller = request.headers.get('cf-connecting-ip') ?? 'unknown';
    if (deps.allowWrite && !(await deps.allowWrite(caller))) {
      // 429, not 507: "you are going too fast" is a different fact from "this
      // mailbox is full", and the client must retry rather than give up.
      return json(429, { error: 'too many writes just now; try again shortly' });
    }
    return put(request, deps, id);
  }
  if (request.method === 'GET' && parts.length === 2) return listChunks(deps, id);
  if (request.method === 'GET' && parts.length === 3) return getChunk(deps, id, parts[2]!);
  return json(405, { error: 'that method is not used here' });
}

async function put(request: Request, deps: Deps, id: string): Promise<Response> {
  const body = await request.text();
  // Bytes, not characters. A body of multi-byte text is bigger than its length
  // suggests, and a cap measured in the wrong unit is not a cap.
  if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
    return json(413, { error: 'that is larger than a mailbox accepts' });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json(400, { error: 'that is not a sealed message' });
  }
  // The structural guarantee. Refusing non-seals is what stops a mailbox becoming
  // a file host — and the check is IMPORTED from the client's own module, so
  // "what a seal is" cannot drift into two answers.
  const bad = malformedSeal(parsed);
  if (bad) return json(400, { error: 'that is not a sealed message' });

  const held = await deps.store.list(`${id}/`);
  if (held.length >= MAX_CHUNKS) {
    return json(507, { error: 'this mailbox is full; the oldest chunks expire on their own' });
  }

  const chunk = chunkName(deps.now(), deps.token());
  // No overwrite path and no delete route anywhere in this file. A relay that
  // could replace a chunk could destroy the only copy in flight, and append-only
  // is the same discipline the log itself is built on.
  await deps.store.put(`${id}/${chunk}`, body, TTL_SECONDS);
  return json(201, { chunk });
}

async function listChunks(deps: Deps, id: string): Promise<Response> {
  const keys = await deps.store.list(`${id}/`);
  const chunks = keys
    .map(k => k.slice(id.length + 1))
    .filter(c => CHUNK.test(c))
    .sort();
  // An empty mailbox is a 200 with an empty list, NOT a 404. "Nothing here yet"
  // and "no such mailbox" are different facts, and a device that confuses them
  // reports a fault on a first pairing that is working perfectly.
  return json(200, { chunks });
}

async function getChunk(deps: Deps, id: string, chunk: string): Promise<Response> {
  // Anchored — and worth being precise about WHY, because the obvious reason is
  // wrong. In a flat key-value namespace there is no traversal: `..%2Fx%2Fy` is
  // just a literal key that does not exist, and what actually separates two
  // mailboxes is the 32-hex check on the id above. Dropping this line breaks
  // nothing in KV, which is exactly why a test asserting otherwise passed
  // against no guard at all.
  //
  // What it really buys: the chunk name is client-supplied and becomes part of a
  // key, so constraining it to a known shape means **no adapter can ever be
  // handed a name with structure in it** — a directory-backed store, a store
  // that decodes escapes, or an R2 prefix listing would each read that structure
  // differently, and only one of those readings has to be wrong. The test holds
  // this against a store that resolves keys as paths, since a flat fake cannot
  // express the failure and therefore cannot detect it.
  if (!CHUNK.test(chunk)) return json(400, { error: 'that is not a chunk name' });
  const body = await deps.store.get(`${id}/${chunk}`);
  if (body === null) return json(404, { error: 'that chunk is gone or was never here' });
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

/**
 * What a device says about a relay, in words.
 *
 * Never "sync failed" and never a status code. A mailbox being unreachable is an
 * ordinary condition — a train, a hotel, a shut laptop — and the only honest
 * framing is that nothing was lost, because nothing was.
 */
export function relayWords(outcome: 'ok' | 'unreachable' | 'full' | 'refused'): string {
  switch (outcome) {
    case 'ok': return 'Up to date on this device.';
    case 'unreachable': return 'Could not reach the other devices just now. Everything here is safe, and it will catch up next time.';
    case 'full': return 'The handover point is holding as much as it takes. It clears itself; nothing here is lost.';
    case 'refused': return 'The handover point would not take that. Everything here is safe.';
  }
}
