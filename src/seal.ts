// Sealing what goes to the relay (sync stage 2, ADR-0037).
//
// **The relay must never be able to read anything.** That is not a feature of the
// server's good behaviour — it is a property of what reaches it. So everything
// that leaves a device is sealed here first, and the relay stores opaque bytes it
// could not interpret if it wanted to.
//
// AES-256-GCM via WebCrypto. Authenticated, so tampering is detected rather than
// decrypted into something plausible; and **a fresh random IV for every seal**,
// because IV reuse under GCM is not a weakness, it is a total break — two
// messages under one IV leak their XOR and the authentication key with them.
//
// ## What the relay learns, stated exactly
//
// Even though every BODY is sealed, a network service unavoidably sees more than
// the bytes it stores, and pretending otherwise would be the overclaim this
// project refuses. Stated honestly, the relay operator and Cloudflare can observe:
//
// - the **sync id** — derived from the key by one-way hash, so it never yields
//   the key and pairing transfers only the key, but it is STABLE for the life of
//   a pairing and rides in the URL path of every request, so it links a
//   household's devices under one pseudonym;
// - each device's **source IP**, and thus rough location and network;
// - the **length** of each sealed blob (GCM is unpadded, so ciphertext tracks
//   plaintext length) and the **time** of every request — so repeated observation
//   yields a sync *cadence*: when, and how often, a household syncs.
//
// What stays sealed and is genuinely NOT learned: device ids, event counts,
// titles, dates, and the per-device breakdown of how much you write — because
// **the summary is sealed too**, not just the events. So the relay learns THAT
// you synced and roughly WHEN, never WHAT. That cadence is a real, if shallow,
// transport-level signal; the honest posture is to seal the content and name what
// remains, not to claim nothing remains.
//
// ## Losing the key loses nothing permanent
//
// Every device keeps its own complete local log; the relay is a transport, not a
// store of record (ADR-0037). So a lost key costs you the ability to exchange
// until you pair again — it cannot cost you your work. A sync design where a lost
// key loses data would violate law 9 outright.

const AES = 'AES-GCM';
const KEY_BITS = 256;
const IV_BYTES = 12;          // 96 bits, the GCM standard and what WebCrypto wants

/** The format marker. Present so a future change can be read alongside this one
 *  rather than replacing it — data is never lost to updates. */
export const SEAL_VERSION = 1;

export interface Sealed {
  v: number;
  /** Base64 IV. Fresh for every single seal. */
  iv: string;
  /** Base64 ciphertext, authentication tag included by GCM. */
  ct: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

const subtle = (): SubtleCrypto => {
  const c = globalThis.crypto;
  if (!c?.subtle) {
    // Stated rather than swallowed. The one honest failure mode here is a context
    // with no WebCrypto, and sync must refuse to start rather than pretend.
    throw new Error('this browser has no WebCrypto, so nothing can be sealed');
  }
  return c.subtle;
};

const b64 = (b: ArrayBuffer | Uint8Array): string => {
  const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
};

const unb64 = (s: string): Uint8Array => {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

// --- the key ---------------------------------------------------------------

/** A fresh key. Extractable, because pairing a second device means handing the
 *  key over — a non-extractable key would be safer and would make the feature
 *  impossible. */
export async function newKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: AES, length: KEY_BITS }, true, ['encrypt', 'decrypt']);
}

/** The key as text, for pairing. This string IS the secret: anything holding it
 *  can read every exchange, and nothing else can. */
export async function exportKey(key: CryptoKey): Promise<string> {
  return b64(await subtle().exportKey('raw', key));
}

/** Back from text. Refuses anything that is not a 256-bit key rather than
 *  producing a working-looking object from a truncated paste. */
export async function importKey(raw: string): Promise<CryptoKey> {
  let bytes: Uint8Array;
  try {
    bytes = unb64(raw.trim());
  } catch {
    throw new Error('that is not a pairing key');
  }
  if (bytes.length !== KEY_BITS / 8) {
    throw new Error(`a pairing key is ${KEY_BITS / 8} bytes; that one is ${bytes.length}`);
  }
  return subtle().importKey('raw', bytes, { name: AES }, true, ['encrypt', 'decrypt']);
}

/**
 * The sync id, derived from the key by SHA-256.
 *
 * One-way and deterministic. Both devices compute the same id from the same key
 * without ever sending it anywhere, and the relay — which only ever sees the id —
 * gets no route back to the key. It also means **pairing transfers exactly one
 * secret**: no id to type alongside it, and no way to be paired to the right id
 * with the wrong key.
 */
export async function syncId(key: CryptoKey): Promise<string> {
  const raw = await subtle().exportKey('raw', key);
  const digest = await subtle().digest('SHA-256', raw);
  // Hex, and only the first 128 bits: an id is a name, not a second secret, and a
  // shorter one is easier to show someone when something has gone wrong.
  return [...new Uint8Array(digest).slice(0, 16)]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- sealing ---------------------------------------------------------------

/** gzip's first two bytes. JSON always begins `{` (0x7b), so a sealed payload is
 *  self-describing with no wrapper and no version negotiation: look at byte one
 *  and you know which it is. */
const GZIP_MAGIC = [0x1f, 0x8b];

/** "QKP1" — the marker for a framed, padded payload. Present so a chunk sealed
 *  before padding existed still opens: no marker means the old shape. */
const FRAME_MAGIC = [0x51, 0x4b, 0x50, 0x31];

/**
 * Every sealed body is rounded up to a multiple of this before encryption.
 *
 * **The right question was asked:** could somebody inject one item, have it
 * travel without a pile of other data around it, and learn more from the result?
 *
 * The mechanism is not quite the one in the question, and it is real. A chunk
 * holding only an attacker's own item tells them nothing they did not write. The
 * danger is the reverse — their text compressed ALONGSIDE somebody's private
 * text, where a guess that happens to match makes the result a little smaller.
 * That is the CRIME shape, and this app does have the injection leg it needs: a
 * link carrying `?text=` puts chosen words into a log.
 *
 * The bar is still high — it needs the target to tap a crafted link hundreds of
 * times, a position to watch chunk sizes from, and a sync between each attempt.
 * But "hard" is not "impossible", and a comment in this file previously said the
 * channel did not exist here, which was wrong.
 *
 * Padding closes most of it, and closes something older too: GCM is unpadded, so
 * a sealed size tracked the plaintext size long before compression arrived. Now a
 * one-event exchange and a fifty-event exchange look identical, and a guess has
 * to shift the total across a whole bucket to be visible at all.
 *
 * 4 KiB: small enough that a daily exchange costs nothing anybody would notice,
 * large enough to swallow the difference a single crafted word could make.
 */
export const PAD_TO = 4096;

/**
 * Squeeze, if this platform can.
 *
 * An event log compresses extraordinarily well — the same keys, the same device
 * id and near-identical timestamps on every line. A real planner measured 8.4x,
 * which turns a first sync from eight uploads into one. Storage writes are the
 * scarcest thing in this whole design, so that is the difference between a
 * comfortable margin and a tight one.
 *
 * **Returns the input untouched if `CompressionStream` is missing.** Degrading is
 * free here because the format is self-describing: a device that cannot compress
 * sends plain JSON, and every reader handles both. No capability check, no
 * negotiation, and nothing to get wrong on a platform nobody has tested.
 */
async function squeeze(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream !== 'function') return bytes;
  try {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    void writer.write(bytes);
    void writer.close();
    const parts: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value as Uint8Array);
    }
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
  } catch {
    // A compressor that failed is not a reason to fail a sync.
    return bytes;
  }
}

/** Wrap the body with its true length and pad the result out to a bucket, so the
 *  size that reaches the relay says as little as possible about the contents. */
function frame(body: Uint8Array): Uint8Array {
  const size = FRAME_MAGIC.length + 4 + body.length;
  const padded = Math.ceil(size / PAD_TO) * PAD_TO;
  const out = new Uint8Array(padded);
  out.set(FRAME_MAGIC, 0);
  // Big-endian length, so the reader knows where the body ends and the padding
  // begins. The padding itself is zeroes and is never interpreted.
  new DataView(out.buffer).setUint32(FRAME_MAGIC.length, body.length, false);
  out.set(body, FRAME_MAGIC.length + 4);
  return out;
}

/** Unwrap, if it was wrapped. A payload sealed before padding existed has no
 *  marker and is returned untouched — which is what keeps older chunks readable. */
function unframe(bytes: Uint8Array): Uint8Array {
  if (bytes.length < FRAME_MAGIC.length + 4) return bytes;
  for (let i = 0; i < FRAME_MAGIC.length; i++) if (bytes[i] !== FRAME_MAGIC[i]) return bytes;
  const at = FRAME_MAGIC.length;
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(at, false);
  const start = at + 4;
  // A length that overruns the buffer means a corrupt payload. It cannot arrive
  // through a valid seal — GCM authenticates first — so this is belt and braces
  // against a bug rather than an attacker.
  if (start + length > bytes.length) return bytes;
  return bytes.slice(start, start + length);
}

/** The inverse, applied only when the bytes say they need it. */
async function unsqueeze(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length < 2 || bytes[0] !== GZIP_MAGIC[0] || bytes[1] !== GZIP_MAGIC[1]) return bytes;
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  void writer.write(bytes);
  void writer.close();
  const parts: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value as Uint8Array);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/**
 * Seal a value.
 *
 * A FRESH random IV every time, and that is the single most important line in
 * this file. Reusing an IV under GCM leaks the XOR of both plaintexts and the
 * authentication key with them — it is a total break, not a degradation.
 *
 * COMPRESSED BEFORE IT IS ENCRYPTED, and inside the seal rather than around it —
 * so the relay cannot tell whether compression was used at all.
 *
 * The order is worth naming because the reverse is meaningless (ciphertext does
 * not compress) and because compressing-then-encrypting has a known caveat (CRIME):
 * when an attacker can inject chosen text into the SAME compressed stream and
 * watch the length, compression leaks. **That injection leg DOES exist here** — a
 * link carrying `?text=` puts chosen words into a log — which is exactly why every
 * body is padded to a bucket by `frame`/`PAD_TO` before it is sealed. See that
 * note for the full argument; an earlier version of this docstring wrongly said
 * the channel did not exist, and that was the second overclaim this file had to
 * retract. Padding is what makes the claim true rather than the wish.
 */
export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const body = frame(await squeeze(enc.encode(JSON.stringify(value))));
  const ct = await subtle().encrypt({ name: AES, iv }, key, body);
  return { v: SEAL_VERSION, iv: b64(iv), ct: b64(ct) };
}

/**
 * Open a sealed value, or throw.
 *
 * **It fails closed.** A wrong key, a tampered blob or a truncated one all throw
 * rather than returning something partial — GCM's authentication tag is checked
 * before any plaintext is produced, so there is no half-decrypted state to leak
 * into a fold. A sync that could apply half a message would be worse than one
 * that refuses.
 */
export async function open(key: CryptoKey, sealed: unknown): Promise<unknown> {
  const bad = malformedSeal(sealed);
  if (bad) throw new Error(bad);
  const s = sealed as Sealed;
  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt({ name: AES, iv: unb64(s.iv) }, key, unb64(s.ct));
  } catch {
    // Deliberately ONE message for every cause, carrying no number and no
    // fragment of the blob. Distinguishing "wrong key" from "tampered" — or even
    // leaking a size — tells an attacker which of the two they achieved.
    throw new Error('that could not be opened with this key');
  }
  try {
    // Self-describing: compressed payloads announce themselves in their first two
    // bytes, so a device reading an older uncompressed chunk needs no flag, no
    // version bump and no negotiation. Both directions of the upgrade work.
    return JSON.parse(dec.decode(await unsqueeze(unframe(new Uint8Array(plain)))));
  } catch {
    throw new Error('it opened but did not contain what was expected');
  }
}

/**
 * Is this even a sealed blob? It arrives from a relay, so it is INPUT.
 *
 * Checked before any crypto call, because passing arbitrary shapes into
 * `subtle.decrypt` is how a surface ends up reporting a DOMException at somebody
 * who wanted to know whether their phone was up to date.
 */
export function malformedSeal(x: unknown): string | null {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return 'that is not a sealed message';
  const s = x as Partial<Sealed>;
  if (s.v !== SEAL_VERSION) {
    return s.v === undefined
      ? 'that is not a sealed message'
      // Named rather than refused generically: a NEWER version means the other
      // device is ahead, which is a thing to say plainly, not an error.
      : `that was sealed by a newer version of Quietkeep (format ${String(s.v)})`;
  }
  if (typeof s.iv !== 'string' || !s.iv) return 'a sealed message carries an iv';
  if (typeof s.ct !== 'string' || !s.ct) return 'a sealed message carries contents';
  return null;
}

/** The application PAYLOAD the relay is handed — the request body, and the whole
 *  of what it can STORE. The tests use this to assert the body carries nothing but
 *  opaque bytes. It is deliberately NOT the whole of what the relay OBSERVES: the
 *  transport also exposes the id (in the URL path), this blob's length, the time
 *  of the request, and the device's IP. Content and key are sealed; cadence and
 *  coarse metadata are not — see the header's "what the relay learns, stated
 *  exactly". Naming this the payload, not "everything the relay sees", is the
 *  difference between a true claim and a comfortable one. */
export const relaySees = (id: string, sealed: Sealed): Record<string, unknown> =>
  ({ id, v: sealed.v, iv: sealed.iv, ct: sealed.ct });
