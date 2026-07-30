// The kv keys a pairing occupies, and the one definition of clearing them.
//
// This is a tiny module for a specific structural reason. **Both editions need to
// be able to FORGET a pairing, but only one of them may contain the sync module.**
// `tools/editions.mjs` proves the default bundle holds no sync code by reading the
// built artefact, so if the shared purge path imported `pairing.ts` — which
// carries `beginPairing` and the pairing-file format — the default build would
// fail its own guarantee.
//
// So the KEY NAMES and the act of clearing them live here, with no crypto, no
// transport and no pairing logic. `pairing.ts` builds on it; `purge.ts` uses it
// without ever seeing the sync module.
//
// ## Why this exists at all
//
// Because "Start again from empty" did not clear these, and that was a real bug
// with a nasty shape. `replaceAll([])` empties the events and snapshots tables
// and nothing else, so an erased device stayed PAIRED — and on the next open it
// exchanged with a relay still holding up to thirty days of its own sealed
// history, and with a peer holding all of it. The erased planner refilled itself.
// No attacker, no malfunction: an honest relay doing exactly its job.
//
// One list, in one place, so "what a pairing occupies" cannot be updated in the
// unpair path and forgotten in the erase path.

/** `kv` keys. Namespaced so a future second pairing cannot collide with this one. */
export const KEY_KV = 'sync.key';
export const HOST_KV = 'sync.host';
export const MARK_KV = 'sync.mark';

/** Every key a pairing occupies. Adding one here is what makes it clearable
 *  everywhere — that is the whole point of the list being singular. */
export const SYNC_KEYS: readonly string[] = [KEY_KV, HOST_KV, MARK_KV];

/** The minimum a store must offer to be unpaired. */
export interface KvWritable {
  setKv(key: string, value: unknown): Promise<void>;
}

/**
 * Forget the pairing: the key, the host it dialled, and the mark recording what
 * had already been exchanged.
 *
 * **The mark must go with the key.** A mark left behind would tell a later
 * pairing that chunks it has never seen were already taken in, and those events
 * would then be skipped forever — a silent, permanent hole that no error reports.
 */
export async function clearSyncKeys(store: KvWritable): Promise<void> {
  for (const key of SYNC_KEYS) await store.setKv(key, null);
}
