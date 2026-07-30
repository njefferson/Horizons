// The QR encoder (sync stage 4, ADR-0037).
//
// **What these tests can and cannot establish** is the most important thing in this
// file. They prove the arithmetic and the structure from first principles. They
// CANNOT prove a scanner reads the result — the data/EC split comes from the
// specification's tables and a wrong entry produces a well-formed-looking matrix that
// every scanner rejects, with the round trip below passing because it would be wrong
// the same way in both directions. That is V-17, and one photograph settles it.
//
// So the load-bearing tests here are the ones that do NOT depend on my reader:
// the Reed-Solomon syndromes, which are checkable from the definition of the code,
// and the geometry, which is counted rather than looked up.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  alignmentCentres, bitStream, blankMatrix, capacity, dataPositions, ecCodewords,
  encodeQr, formatBits, gfMul, gfPow, pairingUrl, penalty, readQr, rsGenerator,
  rsRemainder, sizeOf, smallestVersion, syndromes, toSvg, totalCodewords,
} from '../src/qr.ts';

// --- the field, against its axioms ------------------------------------------

test('GF(256) obeys the field axioms', () => {
  // Against the axioms rather than a pasted table: a table of 256 numbers is a page
  // nobody checks, and one transposed digit is undetectable by inspection.
  assert.equal(gfMul(0, 5), 0, 'zero absorbs');
  assert.equal(gfMul(7, 0), 0);
  for (let a = 1; a < 256; a++) {
    assert.equal(gfMul(a, 1), a, `${a} * 1`);
    for (const b of [1, 2, 3, 17, 200, 255]) {
      assert.equal(gfMul(a, b), gfMul(b, a), `commutative at ${a},${b}`);
    }
  }
  // Associativity and distributivity on a spread of triples.
  for (const [a, b, c] of [[2, 3, 5], [17, 200, 43], [255, 128, 7], [1, 1, 1]] as [number, number, number][]) {
    assert.equal(gfMul(gfMul(a, b), c), gfMul(a, gfMul(b, c)), 'associative');
    assert.equal(gfMul(a, b ^ c), gfMul(a, b) ^ gfMul(a, c), 'distributive over XOR');
  }
  // Every non-zero element has an inverse, which is what makes it a FIELD.
  for (let a = 1; a < 256; a++) {
    let inv = 0;
    for (let b = 1; b < 256; b++) if (gfMul(a, b) === 1) { inv = b; break; }
    assert.notEqual(inv, 0, `${a} has no inverse`);
  }
  assert.equal(gfPow(2, 8), gfMul(gfMul(gfMul(2, 2), gfMul(2, 2)), gfMul(gfMul(2, 2), gfMul(2, 2))));
});

// --- THE ONE THAT MATTERS: Reed-Solomon, from the definition -----------------

test('THE ONE THAT MATTERS: every syndrome of the codeword is zero', () => {
  // A Reed-Solomon codeword is valid exactly when it is divisible by the generator,
  // which is exactly when c(a^i) = 0 for every i below the EC count. That is the
  // DEFINITION, so this catches any error in the generator polynomial or in the
  // remainder — without a reference implementation and without trusting my memory of
  // one. It is the only real conformance check available offline.
  for (const ec of [7, 10, 15, 20, 26]) {
    for (const data of [
      [0x40, 0xd2, 0x75, 0x47, 0x76, 0x17, 0x32, 0x06],
      new Array<number>(30).fill(0xec),
      [...Array.from({ length: 40 }, (_, i) => (i * 37) % 256)],
    ]) {
      const parity = rsRemainder(data, ec);
      assert.equal(parity.length, ec, 'one codeword per EC symbol');
      const s = syndromes([...data, ...parity], ec);
      assert.deepEqual(s, new Array<number>(ec).fill(0),
        `syndromes non-zero for ec=${ec}, len=${data.length}`);
    }
  }
});

test('and a single corrupted symbol makes them non-zero', () => {
  // The other half: a check that cannot fail proves nothing. If flipping a byte left
  // the syndromes at zero, the test above would be measuring nothing at all.
  const data = [0x40, 0xd2, 0x75, 0x47];
  const word = [...data, ...rsRemainder(data, 10)];
  word[2] = word[2]! ^ 0x5a;
  assert.notDeepEqual(syndromes(word, 10), new Array<number>(10).fill(0));
});

test('the generator has the degree it was asked for, and is monic', () => {
  for (const d of [7, 10, 15, 20, 26]) {
    const g = rsGenerator(d);
    assert.equal(g.length, d + 1, `degree ${d}`);
    assert.equal(g[0], 1, 'monic — the leading coefficient is one');
  }
});

// --- geometry, counted rather than looked up ---------------------------------

test('the module count is derived from the matrix, not remembered', () => {
  // If the function patterns were miscounted, this number would be wrong and the data
  // stream would not fill the matrix exactly — which the placement test below checks.
  assert.equal(sizeOf(1), 21);
  assert.equal(sizeOf(4), 33);
  assert.equal(totalCodewords(1), 26, 'version 1 holds 26 codewords');
  assert.equal(totalCodewords(2), 44);
  assert.equal(totalCodewords(3), 70);
  assert.equal(totalCodewords(4), 100);
});

test('the data stream fills the data region exactly', () => {
  // The strongest internal check available: total codewords is counted from the free
  // modules, so if either the geometry or the codeword count were wrong these two
  // numbers would differ.
  for (const v of [1, 2, 3, 4]) {
    const m = blankMatrix(v);
    assert.equal(dataPositions(m).length, totalCodewords(v) * 8 + (dataPositions(m).length % 8),
      `version ${v}: positions must be a whole number of codewords plus remainder bits`);
    assert.ok(dataPositions(m).length >= totalCodewords(v) * 8);
    assert.ok(dataPositions(m).length - totalCodewords(v) * 8 < 8, 'at most seven remainder bits');
  }
});

test('every data position is visited exactly once', () => {
  for (const v of [1, 3, 4]) {
    const spots = dataPositions(blankMatrix(v));
    assert.equal(new Set(spots.map(([x, y]) => `${x},${y}`)).size, spots.length,
      `version ${v} visited a module twice`);
  }
});

test('the function patterns are where a scanner looks for them', () => {
  const m = blankMatrix(4);
  const s = m.size;
  // Three finders: a dark 7x7 ring with a dark 3x3 centre.
  for (const [ox, oy] of [[0, 0], [s - 7, 0], [0, s - 7]] as const) {
    assert.equal(m.dark[oy]![ox], true, 'finder corner');
    assert.equal(m.dark[oy + 1]![ox + 1], false, 'the light ring inside it');
    assert.equal(m.dark[oy + 3]![ox + 3], true, 'the dark centre');
  }
  // The fourth corner has NO finder — that is how a scanner knows the orientation.
  assert.equal(m.dark[s - 1]![s - 1], false, 'no fourth finder');
  // Timing patterns alternate and start dark.
  assert.equal(m.dark[6]![8], true);
  assert.equal(m.dark[6]![9], false);
  assert.equal(m.dark[8]![6], true);
  // The dark module, which is always dark.
  assert.equal(m.dark[s - 8]![8], true);
  // One alignment pattern for version 4, centred at 26,26.
  assert.deepEqual(alignmentCentres(4), [6, 26]);
  assert.equal(m.dark[26]![26], true, 'alignment centre');
  assert.equal(m.dark[25]![26], false, 'and its light ring');
  assert.deepEqual(alignmentCentres(1), [], 'version 1 has none');
});

// --- format information -----------------------------------------------------

test('the format bits carry a BCH check and are never all light', () => {
  for (const level of ['L', 'M'] as const) {
    for (let mask = 0; mask < 8; mask++) {
      const bits = formatBits(level, mask);
      assert.equal(bits.length, 15);
      assert.ok(bits.some(b => b === 1), `${level}/${mask} produced an all-light format`);
    }
  }
  // Distinct for every level and mask, or a scanner cannot tell them apart.
  const seen = new Set<string>();
  for (const level of ['L', 'M'] as const) {
    for (let mask = 0; mask < 8; mask++) seen.add(formatBits(level, mask).join(''));
  }
  assert.equal(seen.size, 16, 'sixteen distinct format words');
});

test('the format appears TWICE, so one damaged corner is survivable', () => {
  const m = encodeQr('https://example.test/pair#k=abc');
  const s = m.size;
  // Both copies decode to the same mask — which `readQr` relies on and a scanner
  // uses when one finder is obscured.
  const first = m.dark[8]!.slice(0, 6).map(b => (b ? 1 : 0));
  const second = Array.from({ length: 6 }, (_, i) => (m.dark[s - 1 - i]![8] ? 1 : 0));
  assert.deepEqual(first, second, 'the two copies disagree');
});

// --- masking ----------------------------------------------------------------

test('the mask is CHOSEN by the penalty score, not fixed', () => {
  // A fixed mask is the shortcut that yields a code readable on the desk it was
  // written at and nowhere else. Different payloads must be able to pick different
  // masks, or the choice is not happening.
  const masks = new Set<string>();
  for (let i = 0; i < 24; i++) {
    const m = encodeQr(`https://example.test/pair#k=${'A'.repeat(20)}${i}`);
    masks.add(m.dark[8]!.slice(0, 6).map(b => (b ? 1 : 0)).join(''));
  }
  assert.ok(masks.size > 1, 'every payload chose the same mask, so nothing is being chosen');
});

test('the penalty rules each fire on the shape they are about', () => {
  // Measured as a DELTA from a checkerboard, which scores near zero on rules 1, 2 and
  // 4 — so any increase is attributable to the shape being introduced.
  //
  // The first version of this compared an all-dark grid against an all-light one and
  // asserted the dark scored worse. Both are maximally penalised (long runs, uniform
  // 2x2 blocks, and the same distance from half dark), so it compared two equally bad
  // things and told me nothing. Uniform is not a neutral baseline.
  const n = 21;
  const board = Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => (x + y) % 2 === 0));
  const base = penalty(board);
  assert.ok(base < 100, `a checkerboard should be near-neutral, scored ${base}`);

  // Rule 1: a run of five.
  const run = board.map(r => [...r]);
  for (let x = 4; x < 9; x++) run[10]![x] = true;
  assert.ok(penalty(run) > base, 'a run of five must cost something');

  // Rule 2: a 2x2 block of one colour.
  const block = board.map(r => [...r]);
  block[5]![5] = true; block[5]![6] = true; block[6]![5] = true; block[6]![6] = true;
  assert.ok(penalty(block) >= base + 3, 'a 2x2 block costs at least three');

  // Rule 3: the finder-like 1:1:3:1:1 with four light modules beside it, which is the
  // pattern a scanner mistakes for a finder — the heaviest single penalty at 40.
  const decoy = board.map(r => [...r]);
  const seq = [true, false, true, true, true, false, true, false, false, false, false];
  seq.forEach((v, i) => { decoy[12]![2 + i] = v; });
  assert.ok(penalty(decoy) >= base + 40, 'a false finder costs forty');

  // Rule 4: distance from half dark.
  const skewed = board.map(r => [...r]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) skewed[y]![x] = true;
  assert.ok(penalty(skewed) > base + 100, 'an all-dark grid is heavily penalised');
});

// --- the round trip, and its limits -----------------------------------------

test('a payload survives the round trip through this file (SELF-consistency only)', () => {
  // This proves the two halves of THIS file agree. It does not prove conformance —
  // a wrong data/EC split would fail identically in both directions and pass here.
  // V-17 is the real check and it needs a camera.
  for (const text of [
    'https://example.test/pair#k=abc',
    `https://quietkeep-sync.pages.dev/pair#k=${'q'.repeat(20)}`,
    'a',
    'https://x.test/#' + 'Zm9vYmFy'.repeat(3),
  ]) {
    assert.equal(readQr(encodeQr(text)), text, text.slice(0, 30));
  }
});

test('capacity is stated honestly, and too much is REFUSED rather than truncated', () => {
  // Silently dropping the tail of a key would produce a QR that pairs a device with
  // the wrong secret — worse than any error message.
  const level = 'L' as const;
  const most = capacity(4, level);
  assert.ok(most > 60, `only ${most} bytes at 4-L, which is not enough for a pairing URL`);
  assert.throws(() => encodeQr('x'.repeat(most + 1), level), /does not fit/);
  assert.doesNotThrow(() => encodeQr('x'.repeat(most), level));
});

test('the smallest version that fits is the one used', () => {
  // Smaller means larger modules on screen, which is what a camera across a table
  // needs. A short payload must not be padded into a big sparse matrix.
  assert.equal(smallestVersion(10, 'L'), 1);
  assert.equal(sizeOf(smallestVersion(10, 'L')!), 21);
  assert.ok(smallestVersion(70, 'L')! > smallestVersion(10, 'L')!);
  assert.equal(smallestVersion(10_000, 'L'), null, 'and nothing pretends to fit');
});

test('a version needing multi-block interleaving is refused, not guessed', () => {
  // The table this encoder would need is one I would be reciting. Refusing loudly is
  // the honest failure; a guessed table produces a code nothing can read.
  assert.throws(() => ecCodewords(5, 'L'), /refuses rather than guesses/);
  assert.throws(() => ecCodewords(4, 'M'), /refuses rather than guesses/);
  assert.throws(() => alignmentCentres(7), /alignment table this file does not carry/);
});

test('the pad bytes are the specified ones', () => {
  // 0xEC and 0x11 alternating. A scanner that finds anything else there stops.
  const words = bitStream([0x41], 3, 'L');
  const data = words.slice(0, totalCodewords(3) - ecCodewords(3, 'L'));
  const tail = data.slice(3);
  assert.ok(tail.length > 4, 'there is padding to check');
  tail.forEach((b, i) => {
    assert.equal(b, i % 2 === 0 ? 0xec : 0x11, `pad byte ${i}`);
  });
});

// --- the link and the picture ------------------------------------------------

test('the key rides in the fragment, which never reaches a server', () => {
  const url = pairingUrl('https://sync.example', 'K'.repeat(44));
  assert.equal(url, `https://sync.example/pair#k=${'K'.repeat(44)}`);
  assert.ok(url.includes('#'), 'a fragment, not a query');
  assert.equal(url.split('#')[0]!.includes('K'), false,
    'and no part of the key is before the hash, where it WOULD be sent');
  assert.equal(pairingUrl('https://sync.example/', 'k'), 'https://sync.example/pair#k=k',
    'a trailing slash does not double');
});

test('the picture has a quiet zone, or a camera cannot find its edge', () => {
  const m = encodeQr('https://example.test/pair#k=abc');
  const svg = toSvg(m, { moduleSize: 4, quiet: 4 });
  const side = (m.size + 8) * 4;
  assert.match(svg, new RegExp(`width="${side}"`));
  assert.match(svg, /shape-rendering="crispEdges"/, 'or modules blur at fractional scale');
  assert.match(svg, /<rect[^>]*fill="#ffffff"/, 'a light background is part of the code');
  assert.ok(svg.includes('role="img"'));
  // Nothing outside the quiet zone is dark.
  assert.equal(svg.includes('M0 0h'), false, 'a module sits in the quiet zone');
});
