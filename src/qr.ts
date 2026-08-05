// A QR encoder, for showing a pairing link on one screen so another device's camera
// can read it (sync stage 4, ADR-0037).
//
// the QR route was chosen and then asked after. It was nowhere: recorded as a
// decision and not built, because I had gated all of it behind [V-16] — whether an
// iPad can *read* a code. That was the wrong boundary. Reading is blocked; SHOWING is
// not, and this is the showing half.
//
// ## Why hand-written rather than a library
//
// This app has one runtime dependency (Dexie) and takes another only for correctness.
// A QR generator is a screen shown perhaps twice in a device's lifetime, and a
// general library carries every version, every mode and every error level — a large
// supply-chain surface for a fixed 70-character URL. One version, one mode, one
// level is a few hundred lines that can be read in full.
//
// ## WHAT CI CAN AND CANNOT PROVE — read this before trusting it
//
// Provable here, and proved:
//   - GF(256) arithmetic, against the field axioms rather than a table somebody typed;
//   - the Reed-Solomon codeword, against its DEFINING property — every syndrome is
//     zero, which is checkable from first principles and catches any error in the
//     generator polynomial or the remainder;
//   - the total codeword count, DERIVED geometrically from the module count rather
//     than looked up, so a wrong version or a miscounted function pattern shows up as
//     a stream that does not fill the matrix exactly;
//   - the structure: finders, separators, timing, alignment, the dark module, both
//     copies of the format information, and a data region filled exactly once;
//   - a round trip through the reader in this file.
//
// **NOT provable here**: that a real scanner reads it. In particular the DATA/EC
// SPLIT for a given version and level comes from the specification's tables, and a
// wrong split produces a well-formed-looking matrix that every scanner rejects — the
// round trip in this file would still pass, because it would be wrong in the same way
// in both directions. That is [V-17], and one photograph settles it. Nothing here
// claims otherwise, and the pairing screen must not ship as "working" until somebody
// has pointed a camera at it.
//
// Single-block versions only. Multi-block interleaving needs a per-version table I
// would be reciting rather than deriving, so anything that would need it is REFUSED
// loudly instead of guessed at.
//
// PURE. No DOM, no canvas, no clock.

// --- GF(256), the field QR arithmetic lives in --------------------------------
//
// Built once at load from the primitive polynomial 0x11D, so the tables are derived
// rather than pasted. A pasted table is a page of digits nobody can check.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
}

/** Multiplication in GF(256). Zero is absorbing, which the log form cannot express,
 *  so it is handled before the logs are touched. */
export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

export const gfPow = (a: number, n: number): number =>
  a === 0 ? 0 : EXP[(LOG[a]! * n) % 255]!;

/** The generator polynomial for `degree` error-correction codewords:
 *  (x - a^0)(x - a^1)...(x - a^(degree-1)), coefficients highest-order first. */
export function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] = (next[j] ?? 0) ^ gfMul(poly[j]!, 1);
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(poly[j]!, EXP[i]!);
    }
    poly = next;
  }
  return poly;
}

/** The Reed-Solomon remainder — the error-correction codewords for `data`. */
export function rsRemainder(data: readonly number[], degree: number): number[] {
  const gen = rsGenerator(degree);
  const buf = [...data, ...new Array<number>(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const lead = buf[i]!;
    if (lead === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      buf[i + j] = buf[i + j]! ^ gfMul(gen[j]!, lead);
    }
  }
  return buf.slice(data.length);
}

/**
 * Every syndrome of a codeword, which must all be zero for a valid RS codeword.
 *
 * This is the check that makes the arithmetic above trustworthy without a reference
 * implementation: a codeword is valid exactly when it is divisible by the generator,
 * which is exactly when `c(a^i) = 0` for every `i` below the EC count. Any error in
 * the generator or the remainder shows up here, and it is derived from the definition
 * rather than compared against numbers I remembered.
 */
export function syndromes(codeword: readonly number[], ecCount: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < ecCount; i++) {
    let sum = 0;
    for (const c of codeword) sum = gfMul(sum, EXP[i]!) ^ c;
    out.push(sum);
  }
  return out;
}

// --- versions -----------------------------------------------------------------

export type EcLevel = 'L' | 'M';

/** Side length in modules. */
export const sizeOf = (version: number): number => version * 4 + 17;

/** Alignment-pattern centres. For versions 2 to 6 there is exactly one, because the
 *  other three coordinates collide with the finders — derived from the rule rather
 *  than tabulated. Version 1 has none. */
export function alignmentCentres(version: number): number[] {
  if (version < 2) return [];
  if (version > 6) throw new Error(`qr: version ${version} needs an alignment table this file does not carry`);
  return [6, sizeOf(version) - 7];
}

/**
 * How many codewords a version holds in total, COUNTED from the matrix.
 *
 * Derived, not looked up. The function patterns are laid into a scratch matrix and
 * the free modules counted, so a wrong idea about the geometry shows up as a
 * different number rather than as a silently malformed code.
 */
export function totalCodewords(version: number): number {
  const m = blankMatrix(version);
  let free = 0;
  for (const row of m.reserved) for (const cell of row) if (!cell) free++;
  return Math.floor(free / 8);
}

/**
 * Error-correction codewords for a version at a level.
 *
 * **THIS IS THE TABLE, and it is the one thing in this file that is recited rather
 * than derived.** It is the sole reason [V-17] exists: a wrong entry here yields a
 * matrix that looks perfectly well formed and that no scanner will read, and no test
 * in this repo can tell the difference. Restricted to the single-block versions so
 * there is as little of it as possible.
 */
const EC_CODEWORDS: Record<EcLevel, Record<number, number>> = {
  L: { 1: 7, 2: 10, 3: 15, 4: 20 },
  M: { 1: 10, 2: 16, 3: 26 },
};

export function ecCodewords(version: number, level: EcLevel): number {
  const n = EC_CODEWORDS[level][version];
  if (n === undefined) {
    throw new Error(
      `qr: version ${version} at level ${level} needs multi-block interleaving, which this encoder refuses rather than guesses`);
  }
  return n;
}

/** Payload bytes a version and level can carry in byte mode. Mode indicator (4 bits)
 *  plus an 8-bit character count for versions under 10, then the data. */
export function capacity(version: number, level: EcLevel): number {
  const data = totalCodewords(version) - ecCodewords(version, level);
  return data - 2;           // 4 + 8 bits of header, rounded up to whole bytes
}

/** The smallest version that fits, or null. Smaller is better: fewer modules means
 *  bigger ones on screen, which is what a camera across a table needs. */
export function smallestVersion(bytes: number, level: EcLevel): number | null {
  for (const v of Object.keys(EC_CODEWORDS[level]).map(Number).sort((a, b) => a - b)) {
    if (capacity(v, level) >= bytes) return v;
  }
  return null;
}

// --- the bit stream -----------------------------------------------------------

/** Mode 0100 is byte mode: the only one needed for a URL, and the only one here. */
const BYTE_MODE = 0b0100;

export function bitStream(bytes: readonly number[], version: number, level: EcLevel): number[] {
  const dataCodewords = totalCodewords(version) - ecCodewords(version, level);
  const bits: number[] = [];
  const push = (value: number, width: number): void => {
    for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(BYTE_MODE, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);

  // Terminator, then pad to a byte boundary.
  const capacityBits = dataCodewords * 8;
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad bytes alternate 0xEC and 0x11 — specified values, not arbitrary filler, and
  // a scanner that sees anything else there stops reading.
  const pad = [0xec, 0x11];
  for (let i = 0; bits.length < capacityBits; i++) push(pad[i % 2]!, 8);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]!;
    codewords.push(byte);
  }
  return [...codewords, ...rsRemainder(codewords, ecCodewords(version, level))];
}

// --- the matrix ---------------------------------------------------------------

export interface Matrix {
  size: number;
  /** `true` is a dark module. */
  dark: boolean[][];
  /** Positions belonging to function patterns, which data must not touch. */
  reserved: boolean[][];
}

const grid = (size: number): boolean[][] =>
  Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

/** Function patterns only: finders, separators, timing, alignment, the dark module
 *  and the format-information area. Shared by the encoder and by `totalCodewords`,
 *  so the count and the placement can never disagree. */
export function blankMatrix(version: number): Matrix {
  const size = sizeOf(version);
  const dark = grid(size);
  const reserved = grid(size);
  const set = (x: number, y: number, on: boolean): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    dark[y]![x] = on;
    reserved[y]![x] = true;
  };

  // Three finders with their separators.
  for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const inRing = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        const on = inRing && (dx === 0 || dx === 6 || dy === 0 || dy === 6
          || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
        set(ox + dx, oy + dy, on);
      }
    }
  }

  // Timing patterns: alternating, starting dark at module 6.
  for (let i = 8; i < size - 8; i++) {
    set(i, 6, i % 2 === 0);
    set(6, i, i % 2 === 0);
  }

  // Alignment patterns, skipping the finder corners.
  const centres = alignmentCentres(version);
  for (const cy of centres) {
    for (const cx of centres) {
      const nearFinder = (cx === 6 && cy === 6)
        || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6);
      if (nearFinder) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const on = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
          set(cx + dx, cy + dy, on);
        }
      }
    }
  }

  // The format-information strips, reserved around the finders — and they SKIP the
  // timing patterns where they cross them.
  //
  // Written without those skips, `set(i, 8, …)` walked over the vertical timing
  // module at (6, 8) and `set(8, i, …)` over the horizontal one at (8, 6), turning
  // both light. The reserved SET was unchanged (reserving twice is idempotent) so the
  // codeword count still came out right — the damage was only to the modules a
  // scanner uses to lock on, which is the kind of wrong that a count-based test
  // cannot see and a camera cannot miss.
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) set(i, 8, false);
    if (i !== 6) set(8, i, false);
  }
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, false);
  for (let i = 1; i <= 7; i++) set(8, size - i, false);

  // The dark module LAST, because the strip above runs through (8, size - 8) and
  // setting it earlier meant the strip turned it light again — it was only dark at
  // all because `placeFormat` happened to restore it afterwards, so a blank matrix
  // on its own was wrong and nothing said so.
  set(8, size - 8, true);

  return { size, dark, reserved };
}

/** The zigzag order data occupies: two-module columns, right to left, alternating
 *  upward and downward, skipping the timing column and every reserved module. */
export function dataPositions(m: Matrix): [number, number][] {
  const out: [number, number][] = [];
  let upward = true;
  let right = m.size - 1;
  while (right > 0) {
    // Column 6 is the vertical timing pattern and is skipped ENTIRELY, which shifts
    // every pair to its left by one. Handling only "the pair starts at 6" left column
    // 4 read twice and column 6 read never — four modules visited twice on a version
    // 1 code, which the uniqueness test caught immediately and which no round trip
    // would have, because the reader made the same mistake in reverse.
    if (right === 6) right = 5;
    for (let step = 0; step < m.size; step++) {
      const y = upward ? m.size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (x < 0 || m.reserved[y]![x]) continue;
        out.push([x, y]);
      }
    }
    upward = !upward;
    right -= 2;
  }
  return out;
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** Format information: 5 data bits (level + mask), a BCH(15,5) check, then XOR with
 *  the specified 0x5412 so an all-zero format is never all-light. */
export function formatBits(level: EcLevel, mask: number): number[] {
  const levelBits = level === 'L' ? 0b01 : 0b00;
  let value = (levelBits << 3) | mask;
  let rem = value;
  for (let i = 0; i < 10; i++) {
    rem <<= 1;
    if (rem & 0x400) rem ^= 0x537;
  }
  value = ((value << 10) | rem) ^ 0x5412;
  const bits: number[] = [];
  for (let i = 14; i >= 0; i--) bits.push((value >> i) & 1);
  return bits;
}

function placeFormat(m: Matrix, level: EcLevel, mask: number): void {
  const bits = formatBits(level, mask);
  const s = m.size;
  // Copy one, around the top-left finder.
  for (let i = 0; i <= 5; i++) m.dark[8]![i] = bits[i] === 1;
  m.dark[8]![7] = bits[6] === 1;
  m.dark[8]![8] = bits[7] === 1;
  m.dark[7]![8] = bits[8] === 1;
  for (let i = 9; i < 15; i++) m.dark[14 - i]![8] = bits[i] === 1;
  // Copy two, split between the other two finders — a code with one finder obscured
  // is still readable, which is the entire reason there are two copies.
  for (let i = 0; i <= 7; i++) m.dark[s - 1 - i]![8] = bits[i] === 1;
  for (let i = 8; i < 15; i++) m.dark[8]![s - 15 + i] = bits[i] === 1;
  m.dark[s - 8]![8] = true;   // the dark module, restated after the strip is written
}

/** The specified penalty score. Lower is better; the mask with the lowest score is
 *  the one a conforming encoder picks. */
export function penalty(dark: readonly boolean[][]): number {
  const n = dark.length;
  let score = 0;

  // Rule 1: runs of five or more in a row or column.
  for (const line of [...Array.from({ length: n }, (_, y) => dark[y]!),
                      ...Array.from({ length: n }, (_, x) => dark.map(r => r[x]!))]) {
    let run = 1;
    for (let i = 1; i < n; i++) {
      if (line[i] === line[i - 1]) { run++; continue; }
      if (run >= 5) score += run - 2;
      run = 1;
    }
    if (run >= 5) score += run - 2;
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const a = dark[y]![x];
      if (a === dark[y]![x + 1] && a === dark[y + 1]![x] && a === dark[y + 1]![x + 1]) score += 3;
    }
  }

  // Rule 3: the finder-like 1:1:3:1:1 pattern with four light modules beside it.
  const PATTERN = [true, false, true, true, true, false, true];
  const hasAt = (line: readonly boolean[], i: number): boolean =>
    PATTERN.every((p, k) => line[i + k] === p);
  const quiet = (line: readonly boolean[], from: number): boolean => {
    for (let k = 0; k < 4; k++) if (line[from + k] !== false) return false;
    return true;
  };
  for (const line of [...Array.from({ length: n }, (_, y) => dark[y]!),
                      ...Array.from({ length: n }, (_, x) => dark.map(r => r[x]!))]) {
    for (let i = 0; i + 7 <= n; i++) {
      if (!hasAt(line, i)) continue;
      if ((i >= 4 && quiet(line, i - 4)) || (i + 11 <= n && quiet(line, i + 7))) score += 40;
    }
  }

  // Rule 4: deviation from half dark.
  let darkCount = 0;
  for (const row of dark) for (const cell of row) if (cell) darkCount++;
  const percent = (darkCount * 100) / (n * n);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/**
 * A QR matrix for `text`.
 *
 * Byte mode, smallest single-block version that fits, and the mask chosen by the
 * specified penalty score rather than fixed — a fixed mask is the shortcut that
 * produces a code which reads on the desk it was written at and not across a table.
 */
export function encodeQr(text: string, level: EcLevel = 'L'): Matrix {
  const bytes = [...new TextEncoder().encode(text)];
  const version = smallestVersion(bytes.length, level);
  if (version === null) {
    throw new Error(
      `qr: ${bytes.length} bytes does not fit any single-block version at level ${level}`);
  }
  const codewords = bitStream(bytes, version, level);

  let best: { m: Matrix; score: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = blankMatrix(version);
    const spots = dataPositions(m);
    for (let i = 0; i < spots.length; i++) {
      const [x, y] = spots[i]!;
      const bit = (codewords[i >> 3]! >> (7 - (i & 7))) & 1;
      m.dark[y]![x] = (bit === 1) !== MASKS[mask]!(x, y);
    }
    placeFormat(m, level, mask);
    const score = penalty(m.dark);
    if (best === null || score < best.score) best = { m, score };
  }
  return best!.m;
}

/**
 * Read a matrix back.
 *
 * **Self-consistency only, and that limit is the point.** It reverses this file's own
 * placement and masking, so it proves the two halves agree — not that the result
 * conforms to the specification. A round trip through one's own reader is exactly the
 * shape of test that passes while a real scanner refuses, which is why [V-17] exists
 * and why nothing here is described as working until a camera has seen one.
 */
export function readQr(m: Matrix, level: EcLevel = 'L'): string {
  const version = (m.size - 17) / 4;
  const fmt = m.dark[8]!.slice(0, 6).map(b => (b ? 1 : 0));
  let mask = -1;
  for (let candidate = 0; candidate < 8; candidate++) {
    const bits = formatBits(level, candidate);
    if (bits.slice(0, 6).every((b, i) => b === fmt[i])) { mask = candidate; break; }
  }
  if (mask < 0) throw new Error('qr: no format information found');

  const blank = blankMatrix(version);
  const spots = dataPositions(blank);
  const bits: number[] = [];
  for (const [x, y] of spots) {
    const raw = m.dark[y]![x] === true;
    bits.push((raw !== MASKS[mask]!(x, y)) ? 1 : 0);
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]!;
    bytes.push(b);
  }
  const mode = bytes[0]! >> 4;
  if (mode !== BYTE_MODE) throw new Error(`qr: mode ${mode} is not byte mode`);
  const length = ((bytes[0]! & 0x0f) << 4) | (bytes[1]! >> 4);
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    out.push(((bytes[1 + i]! & 0x0f) << 4) | (bytes[2 + i]! >> 4));
  }
  return new TextDecoder().decode(new Uint8Array(out));
}

/**
 * The matrix as an SVG string, for showing on a screen.
 *
 * A four-module quiet zone, because a code flush to its container is a code a camera
 * cannot find an edge for. One `<path>` of squares rather than thousands of `<rect>`
 * elements, and `shape-rendering="crispEdges"` so modules do not blur into each other
 * at fractional scale.
 */
export function toSvg(m: Matrix, opts: { moduleSize?: number; quiet?: number } = {}): string {
  const px = opts.moduleSize ?? 8;
  const quiet = opts.quiet ?? 4;
  const side = (m.size + quiet * 2) * px;
  const parts: string[] = [];
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (!m.dark[y]![x]) continue;
      parts.push(`M${(x + quiet) * px} ${(y + quiet) * px}h${px}v${px}h-${px}z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" `
    + `viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges" role="img">`
    + `<rect width="${side}" height="${side}" fill="#ffffff"/>`
    + `<path d="${parts.join('')}" fill="#000000"/></svg>`;
}

/**
 * The pairing link a code carries.
 *
 * The key rides in the FRAGMENT, which no browser transmits to a server — so the
 * secret stays on the device even though it travelled inside a URL, and the target
 * can be scanned by the built-in Camera app rather than needing a decoder in the
 * bundle (ADR-0037).
 */
export const pairingUrl = (host: string, key: string): string =>
  `${host.replace(/\/+$/, '')}/pair#k=${key}`;
