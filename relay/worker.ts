// The Cloudflare adapter for the relay.
//
// **Deliberately the thinnest file in the repo.** Everything worth being right
// about lives in `src/relay.ts`, which is pure and has nineteen tests against a
// fake store; this file only translates a KV namespace into the three-method
// `Store` that module asks for. If a bug can hide anywhere here, the split has
// failed and logic has leaked out of the tested half.
//
// No `@cloudflare/workers-types` dependency: the binding surface used is four
// methods, and declaring them costs less than a package that has to be kept in
// step with a platform. `Request`, `Response` and `crypto` are the same objects
// the standard library already types.
//
// Deploy: `npx wrangler deploy` from this directory, with a KV namespace bound as
// CHUNKS. It is a separate deployment from Quietkeep and always will be — see
// Doctrine §1 and the header of `src/relay.ts`.

import { handle, type Store } from '../src/relay.ts';

/** The four methods actually used, and no more. */
interface KVNamespace {
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  get(key: string): Promise<string | null>;
  list(options: { prefix: string; limit?: number; cursor?: string }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

/** Cloudflare's rate-limiting binding. One method, and it costs no KV write —
 *  which matters, because KV writes are the very thing being protected. */
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Env {
  CHUNKS: KVNamespace;
  /** Optional so the relay still runs if the binding is unavailable. Absent means
   *  unlimited, which is stated rather than hidden — see the note at `fetch`. */
  WRITE_LIMIT?: RateLimiter;
}

const store = (kv: KVNamespace): Store => ({
  put: (key, body, ttlSeconds) => kv.put(key, body, { expirationTtl: ttlSeconds }),
  get: key => kv.get(key),
  list: async prefix => {
    // Paginated to exhaustion. A single page would silently under-report a full
    // mailbox, which would let the chunk cap be bypassed AND make a device think
    // it had already collected everything — the second being far worse, since it
    // is the shape of the completeness lie stage 1 exists to prevent.
    const names: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page: { keys: { name: string }[]; list_complete: boolean; cursor?: string } =
        await kv.list(cursor === undefined ? { prefix } : { prefix, cursor });
      for (const k of page.keys) names.push(k.name);
      if (page.list_complete || !page.cursor) break;
      cursor = page.cursor;
    }
    return names;
  },
});

const token = (): string =>
  [...crypto.getRandomValues(new Uint8Array(8))]
    .map(b => b.toString(16).padStart(2, '0')).join('');

export default {
  fetch: (request: Request, env: Env): Promise<Response> =>
    handle(request, {
      store: store(env.CHUNKS),
      now: () => Date.now(),
      token,
      // Per-CALLER, not per-mailbox: a per-mailbox limit would let one flooder
      // open a million mailboxes and cost the same. The relay's address is
      // public — it is named in the Sync edition's CSP — so this is the control
      // that actually bounds a stranger's ability to spend the daily KV write
      // quota and stop somebody's sync.
      //
      // FAILS OPEN if the binding is missing, and that is deliberate rather than
      // careless: this relay is self-hostable, the limiter is Cloudflare-specific,
      // and the alternative — refusing every write when a binding is absent —
      // turns a misconfiguration into total data-transfer failure for a service
      // whose worst untrusted-input outcome is a spent quota. The deployed relay
      // always has it; `wrangler.toml` is where that is asserted.
      // Spread rather than `: undefined` — the property must be ABSENT when there
      // is no limiter, not present and undefined, which is what "no limit" means
      // to `handle` and what the type says.
      ...(env.WRITE_LIMIT
        ? { allowWrite: async (caller: string) => (await env.WRITE_LIMIT!.limit({ key: caller })).success }
        : {}),
    }),
};
