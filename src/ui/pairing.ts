// Pairing by file — the rung that works today, on every device.
//
// Noah: *"File first."* And he was right that it should have been first: it needs no
// camera, no QR, no decoder, and nothing from [V-16] or [V-17]. One device writes a
// small file, the other opens it, and both hold the same key. That is the whole of it.
//
// The QR is a nicer way to move the same 44 characters and it can arrive later without
// changing a line here, because what pairing DOES is independent of how the key
// travels. Building the pretty rung before the working one was the mistake.
//
// ## Where the key lives, and why that is not a compromise
//
// In `kv`, on the device, unencrypted. That sounds worse than it is: the log beside it
// is also unencrypted, so a key stored the same way adds no new exposure — anybody who
// can read the key can already read the work it protects. Encrypting it would need a
// passphrase on every open, which is a real cost paid for nothing.
//
// It is device-local on purpose. A key that synced would have to sync through the
// relay, and the relay must never see it.

import { exportKey, importKey, newKey, syncId } from '../seal.ts';

/** `kv` keys. Namespaced so a future second pairing cannot collide with this one. */
export const KEY_KV = 'sync.key';
export const HOST_KV = 'sync.host';
export const MARK_KV = 'sync.mark';
/** Arrivals the gate would not take yet, kept across reloads (see `ingest.ts`). */
export const PENDING_KV = 'sync.pending';

interface KvStore {
  getKv<T>(key: string): Promise<T | null | undefined>;
  setKv(key: string, value: unknown): Promise<void>;
}

/** What a pairing file contains. A named format with a version, so a file found in a
 *  Downloads folder in two years says what it is rather than looking like a stray
 *  base64 blob somebody should probably delete. */
export interface PairingFile {
  format: 'quietkeep-pairing';
  version: 1;
  /** The key, base64. THIS IS THE SECRET — the file is as sensitive as the planner. */
  key: string;
  /** The relay this pair uses. Carried so the second device needs nothing typed. */
  host: string;
  /** The sync id, derived from the key. Present so a person can compare it on both
   *  screens and SEE that pairing worked, rather than finding out later that it did
   *  not by nothing arriving. */
  id: string;
  at: string;
}

/** Refuse anything that is not one of ours, before a single byte is trusted. */
export function malformedPairing(x: unknown): string | null {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return 'that is not a pairing file';
  const p = x as Partial<PairingFile>;
  if (p.format !== 'quietkeep-pairing') return 'that is not a pairing file';
  if (p.version !== 1) {
    return typeof p.version === 'number' && p.version > 1
      // Named rather than refused vaguely: a newer file means the other device is
      // ahead, which is a thing to say plainly.
      ? `that pairing file was written by a newer version of Quietkeep (format ${String(p.version)})`
      : 'that pairing file is not a version this understands';
  }
  if (typeof p.key !== 'string' || p.key.length === 0) return 'that pairing file carries no key';
  if (typeof p.host !== 'string' || !/^https?:\/\//.test(p.host)) {
    return 'that pairing file does not name a handover point';
  }
  return null;
}

/** Make a pair. Returns the file to hand over AND stores it on this device, so the
 *  device that created the pair is already paired — there is no state where somebody
 *  has exported a key they are not themselves using. */
export async function beginPairing(store: KvStore, host: string, at: string): Promise<PairingFile> {
  const key = await newKey();
  const raw = await exportKey(key);
  const id = await syncId(key);
  await store.setKv(KEY_KV, raw);
  await store.setKv(HOST_KV, host);
  return { format: 'quietkeep-pairing', version: 1, key: raw, host, id, at };
}

/**
 * Take a pairing file in.
 *
 * The key is verified by IMPORTING it rather than by looking at its length: a string
 * that is the right size and not a key would otherwise be accepted here and fail
 * later, at exchange time, as something unexplainable.
 */
export async function acceptPairing(store: KvStore, file: unknown): Promise<{ id: string; host: string }> {
  const bad = malformedPairing(file);
  if (bad) throw new Error(bad);
  const p = file as PairingFile;
  const key = await importKey(p.key);       // throws if it is not a 256-bit key
  const id = await syncId(key);
  if (typeof p.id === 'string' && p.id !== id) {
    // The file's own claim about its id disagrees with the key it carries, which means
    // it was edited or truncated. Refusing beats pairing to something unintended.
    throw new Error('that pairing file has been altered — its key and its name do not match');
  }
  await store.setKv(KEY_KV, p.key);
  await store.setKv(HOST_KV, p.host);
  return { id, host: p.host };
}

/** The pair on this device, or null. */
export async function currentPairing(store: KvStore): Promise<{ key: CryptoKey; id: string; host: string } | null> {
  const raw = await store.getKv<string>(KEY_KV);
  const host = await store.getKv<string>(HOST_KV);
  if (typeof raw !== 'string' || typeof host !== 'string') return null;
  try {
    const key = await importKey(raw);
    return { key, id: await syncId(key), host };
  } catch {
    // A key that no longer imports is a broken pairing, not a crash. Said as "not
    // paired", which is true and actionable.
    return null;
  }
}

/** Forget the pair. The log is untouched — unpairing is not a way to lose work, and
 *  saying so is the difference between a control people use and one they fear. */
export async function forgetPairing(store: KvStore): Promise<void> {
  await store.setKv(KEY_KV, null);
  await store.setKv(HOST_KV, null);
  await store.setKv(MARK_KV, null);
  await store.setKv(PENDING_KV, null);
}

/** The filename somebody will see in Files. Says what it is and which pair it is for,
 *  because two of these in a folder must be tellable apart. */
export const pairingFilename = (id: string): string =>
  `quietkeep-pairing-${id.slice(0, 8)}.json`;

/** What the screen says when there is a pair, and when there is not. Never "not
 *  configured" — this is somebody's second device, not a settings object. */
export function pairingWords(p: { id: string } | null): string {
  return p === null
    ? 'This device is on its own. Pair it with another and they will keep each other up to date.'
    : `Paired. Both devices should show ${p.id.slice(0, 8)} — if one of them does not, they are not the same pair.`;
}
