// Identifiers.
//
// ULIDs: sortable by creation time, collision-safe across devices, and no
// dependency. deviceId is local, random, and meaningless off your devices —
// the data constitution promises no identifier that could link installs beyond
// the one needed to keep sync shards apart.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   // Crockford base32, no I/L/O/U

const randomBytes = (n: number): Uint8Array => {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
};

const encodeTime = (ms: number): string => {
  let out = '';
  let t = ms;
  for (let i = 0; i < 10; i++) {
    out = ALPHABET[t % 32]! + out;
    t = Math.floor(t / 32);
  }
  return out;
};

const encodeRandom = (): string => {
  const bytes = randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i]! % 32]!;
  return out;
};

/**
 * ULID. `now` is injected rather than read here so the whole spine stays
 * testable at an arbitrary moment (build-plan §2).
 */
export const ulid = (now: number): string => encodeTime(now) + encodeRandom();

/** Stable across restarts, unique across installs (ADR-0003). */
export const newDeviceId = (): string => `dev-${encodeRandom().slice(0, 12).toLowerCase()}`;

/**
 * Ask the browser to stop evicting us.
 *
 * On iOS this is reported to require notification permission, which is why T0
 * asks for it before any push mechanism exists (ADR-0007). The result is
 * returned honestly — `false` is a real answer and the caller must not present
 * durability it does not have (V-00).
 */
export async function requestPersistence(): Promise<{ granted: boolean; supported: boolean }> {
  const s = globalThis.navigator?.storage;
  if (!s?.persist) return { granted: false, supported: false };
  if (await s.persisted?.()) return { granted: true, supported: true };
  return { granted: await s.persist(), supported: true };
}
