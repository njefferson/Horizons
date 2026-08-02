// The journal: a passphrase, and the one function that turns it into a key
// (1.13.0, ADR-0061).
//
// ## What this is, and what it deliberately is not
//
// `src/seal.ts` already does the encryption — AES-256-GCM, a fresh IV per
// message, length padding, a version byte, and an `open()` that fails closed.
// It has been in daily production use for sync since ADR-0037. **Nothing about
// the cipher is re-decided here.** The only thing the journal needs that sync
// does not is a key derived from something a person can remember, because sync's
// key is random and travels by QR.
//
// So this module is one function with a lot of reasoning behind it, plus the
// words for the moment that reasoning becomes the user's problem.
//
// ## PBKDF2, and why not Argon2id
//
// ADR-0005 left this open in terms — "Argon2id or PBKDF2 with a high work
// factor — decide during build, record the parameters". Argon2id is the better
// primitive: it is memory-hard, so it resists the GPU and ASIC attacks that
// PBKDF2's pure iteration count does not. It is also not in WebCrypto, which
// means shipping a WASM build of it.
//
// This app has no runtime dependencies. Not as an aesthetic — a static PWA with
// no build step is why it can be audited, why it loads instantly, and why it
// keeps working when nobody is maintaining it. Adding a WASM crypto blob to get
// a better KDF for one optional feature trades a permanent property for a
// marginal one, against an attacker who must ALREADY have the device's storage
// to have anything to attack.
//
// So: PBKDF2-SHA-256, and the work factor is set high and recorded rather than
// left to a default.
//
// ## The parameters, and why these numbers
//
// 600,000 iterations of PBKDF2-SHA-256 — OWASP's current floor for this
// primitive, and roughly a third of a second on the iPad this app is built for.
// That is a cost paid once per unlock, which is the right place to put it: an
// unlock is deliberate and infrequent, unlike a capture, which must stay under
// two seconds and never touches this path.
//
// The iteration count is STORED with the salt rather than hard-coded into the
// reader. A future release raising it must still open entries sealed under the
// old count, and a constant in code cannot do that — this is law 9 applied to a
// number that looks like configuration and is actually part of the data.
//
// ## The salt is not a secret
//
// It exists so two people with the same passphrase get different keys, and so a
// precomputed table cannot cover everybody at once. It is written into the log
// in the clear, on purpose: it must travel to a second device, because the whole
// point is that the same passphrase opens the journal there too.
//
// PURE apart from WebCrypto and `crypto.getRandomValues`, which are the two
// things a key derivation cannot be pure about.

/** PBKDF2-SHA-256 rounds. OWASP's floor for this primitive; stored with the
 *  salt so a later raise can still open what an earlier one sealed. */
export const KDF_ITERATIONS = 600_000;

/** Salt length. 128 bits is the standard and there is no reason to be clever. */
const SALT_BYTES = 16;

const KEY_BITS = 256;
const enc = new TextEncoder();

const subtle = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle;
  // A clear refusal rather than a TypeError three frames down. This is only
  // reachable on an insecure origin, where the honest answer is that the
  // feature cannot work here at all.
  if (!s) throw new Error('this browser cannot do the encryption the journal needs');
  return s;
};

const b64 = (b: ArrayBuffer | Uint8Array): string =>
  btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));

const unb64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), c => c.charCodeAt(0));

/** A fresh salt, base64, for the moment a passphrase is first set. */
export const newSalt = (): string =>
  b64(globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES)));

/**
 * Passphrase + salt -> the AES-GCM key `seal.ts` wants.
 *
 * Deterministic: the same passphrase and the same salt give the same key, on
 * every device, forever. That is the entire mechanism by which a journal
 * written on the iPad opens on the laptop, and it is why the salt goes into the
 * log rather than into device storage.
 *
 * The derived key is NOT extractable. There is nowhere it needs to go — unlike
 * the sync key, which must be shown as a QR code — so it cannot be read back out
 * of the browser even by this app's own code.
 */
export async function deriveKey(
  passphrase: string, salt: string, iterations: number = KDF_ITERATIONS,
): Promise<CryptoKey> {
  if (!passphrase) throw new Error('a passphrase is needed to open the journal');
  // Refused, not guessed: an iteration count from a corrupt or hostile record
  // could otherwise be 1, which would silently make the key cheap to attack
  // while everything still appeared to work.
  if (!Number.isFinite(iterations) || iterations < KDF_ITERATIONS) {
    throw new Error('that record does not carry a usable work factor');
  }
  const material = await subtle().importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  );
  return subtle().deriveKey(
    { name: 'PBKDF2', salt: unb64(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false,                                    // never extractable
    ['encrypt', 'decrypt'],
  );
}

/**
 * What is said before a passphrase is set, and it is said in FULL.
 *
 * ADR-0005: "**A forgotten passphrase means the journal is gone**, and this must
 * be said plainly before the passphrase is set, not buried in a help page."
 *
 * It lives here, beside the derivation, rather than in the surface — so that the
 * sentence and the mechanism it describes cannot drift apart, and so that a
 * change to one is visibly a change to the other.
 */
export const PASSPHRASE_WARNING: readonly string[] = [
  'Choose a passphrase for your journal. It is used to scramble every entry, and it never leaves this device.',
  'There is no way to recover it. Quietkeep does not keep a copy, cannot send you a reset, and cannot open your entries without it — that is what makes them private, and it is not a limitation that can be worked around later.',
  'If you forget it, the journal is gone. Everything else you keep here is untouched.',
  'Write it down somewhere you trust before you continue.',
];

// --- reading the journal back -------------------------------------------------

/**
 * The salt and work factor this journal was sealed under, from the log.
 *
 * Null when no passphrase has ever been set, which is the ordinary state for
 * everybody who has not used the journal — not an error, and the surface says
 * so calmly.
 *
 * Read from the LOG rather than from folded state, deliberately: nothing about
 * the journal belongs in `fold`, because the fold has no key and must stay a
 * pure function of the event set whether the journal is open or not.
 */
export function journalSeal(log: readonly { kind: string; payload: unknown }[]):
{ salt: string; iterations: number } | null {
  for (const e of log) {
    if (e.kind !== 'journal.sealed') continue;
    const p = e.payload as { salt?: unknown; iterations?: unknown };
    // First one wins and there is only ever one — the passphrase cannot be
    // changed in this release, so a second would mean a corrupt or merged log
    // and guessing which is right would be worse than using the original.
    if (typeof p.salt === 'string' && p.salt && Number.isFinite(p.iterations)) {
      return { salt: p.salt, iterations: p.iterations as number };
    }
  }
  return null;
}

/** One entry as the surface needs it: which node, when it was written, and the
 *  envelope to open. The text is NOT here — opening is the caller's, and it
 *  needs the key. */
export interface JournalEntry {
  node: string;
  at: string;
  sealed: { v: number; iv: string; ct: string };
}

/**
 * Every entry in the log, newest first.
 *
 * Ordered by the event's own instant with the id as a total tie-break, the way
 * every other list in this app is ordered — so two renders of one log cannot
 * disagree about what came first.
 */
export function journalEntries(
  log: readonly { kind: string; node: string | null; at: string; id: string; payload: unknown }[],
): JournalEntry[] {
  const out: JournalEntry[] = [];
  for (const e of log) {
    if (e.kind !== 'journal.entry.written' || !e.node) continue;
    const p = e.payload as { v?: unknown; iv?: unknown; ct?: unknown };
    // A malformed envelope is SKIPPED, not rendered as an error row: it cannot
    // be opened, and a list of things that will not open is not a journal.
    if (typeof p.iv !== 'string' || typeof p.ct !== 'string') continue;
    out.push({
      node: e.node, at: e.at,
      sealed: { v: typeof p.v === 'number' ? p.v : 1, iv: p.iv, ct: p.ct },
    });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
