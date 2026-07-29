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

interface Env { CHUNKS: KVNamespace }

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
    handle(request, { store: store(env.CHUNKS), now: () => Date.now(), token }),
};
