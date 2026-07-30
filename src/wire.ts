// The transport: `Wire` over `fetch`.
//
// The last piece, and deliberately the smallest. Everything that can be wrong about
// exchanging lives in `exchange.ts`, `seal.ts` and `sync.ts`, all of which are tested
// against fakes. This file turns three method calls into three HTTP requests and
// carries no decisions of its own — if a bug can hide here, the split has failed.
//
// It sends only what `seal.ts` produced, which is opaque, and it never sends the key.

import type { Sealed } from './seal.ts';
import { malformedSeal } from './seal.ts';
import type { Wire } from './sync.ts';
import { MailboxFull } from './sync.ts';

/** Every response is checked before it is believed. A relay is a remote service and
 *  what it returns is INPUT, exactly like a file somebody chose. */
export function httpWire(host: string, fetchImpl: typeof fetch = fetch): Wire {
  const base = host.replace(/\/+$/, '');

  const ask = async (path: string, init?: RequestInit): Promise<Response> => {
    const res = await fetchImpl(`${base}${path}`, init);
    if (res.status === 507) throw new MailboxFull('the handover point is full');
    if (!res.ok) throw new Error(`the handover point answered ${res.status}`);
    return res;
  };

  return {
    async chunks(id) {
      const body = (await (await ask(`/v1/${id}`)).json()) as unknown;
      // Shape-checked rather than trusted: a relay that answered with an object where
      // a list belongs would otherwise crash the exchange at the first `for`.
      if (body === null || typeof body !== 'object') throw new Error('the handover point sent nonsense');
      const list = (body as { chunks?: unknown }).chunks;
      if (!Array.isArray(list) || !list.every(c => typeof c === 'string')) {
        throw new Error('the handover point sent nonsense');
      }
      return list;
    },

    async get(id, chunk) {
      const res = await ask(`/v1/${id}/${encodeURIComponent(chunk)}`);
      return (await res.json()) as unknown;
    },

    async post(id, sealed: Sealed) {
      // Refused HERE as well as at the relay. The relay's check protects the relay;
      // this one protects the promise — a bug upstream that produced something
      // unsealed must not be able to put it on the wire, and the boundary that
      // enforces that belongs on the sending side too.
      const bad = malformedSeal(sealed);
      if (bad) throw new Error(`refusing to send something that is not sealed: ${bad}`);
      const res = await ask(`/v1/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sealed),
      });
      const body = (await res.json()) as { chunk?: unknown };
      if (typeof body.chunk !== 'string') throw new Error('the handover point did not name what it stored');
      return body.chunk;
    },
  };
}
