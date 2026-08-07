// Generate the hosted "Why it works this way" page from the rationale doc.
//
// SINGLE SOURCE OF TRUTH: docs/planning-for-humans.md is the thesis. This turns
// it into public/why.html — a self-contained, theme-aware, accessible page in
// Quietkeep's own palette — so a curious person reads it inside the app instead
// of being sent to a GitHub markdown file. The page is generated and committed;
// `--check` re-generates and diffs so the two can never drift (the CHANGELOG.md
// pattern, `tools/changelog.mjs`).
//
// The converter handles exactly the markdown the doc uses: h1–h4, paragraphs,
// bullet lists (one level of nesting), numbered lists, blockquotes, `---` rules,
// and inline **bold** / *italic* / `code` / [links](url). No dependency: a doc
// page does not earn one, and the doc's shapes are known and few.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'docs', 'planning-for-humans.md');
const OUT = join(ROOT, 'public', 'why.html');
// The page's styles live in a FILE, not a <style> block: the site's CSP is
// style-src 'self', which refuses inline styles — the first deployed thesis
// rendered unstyled and nobody saw it until the smoke walk navigated there
// (1.7.2). Generated together, checked together.
const CSS_OUT = join(ROOT, 'public', 'why.css');

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline markdown on already-escaped text. Order matters: code and links first
 *  so their contents are not re-processed, then bold before italic so `**` is
 *  consumed before a lone `*`. Doubled markers (`****x**`) are collapsed first —
 *  the doc uses them to mean plain bold. */
function inline(text) {
  let s = esc(text).replace(/\*{3,}/g, '**');
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, t, url) => `<a href="${url}">${t}</a>`);
  s = s.replace(/\*\*(.+?)\*\*/g, (_, b) => `<strong>${b}</strong>`);
  s = s.replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, (_, pre, it) => `${pre}<em>${it}</em>`);
  // Any stray unbalanced ** left over reads as text, not a broken tag.
  return s.replace(/\*\*/g, '');
}

/** Leading-space count → list nesting depth (the doc nests at two spaces). */
const indentOf = (line) => (line.match(/^ */)?.[0].length ?? 0);

function convert(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0;

  const flushList = (marker) => {
    // Collect a run of list items at this indent; a deeper-indented run becomes a
    // nested list inside the last item.
    const baseIndent = indentOf(lines[i]);
    const tag = marker === 'ol' ? 'ol' : 'ul';
    const items = [];
    const re = marker === 'ol' ? /^(\s*)\d+\.\s+(.*)$/ : /^(\s*)[-*]\s+(.*)$/;
    while (i < lines.length) {
      const m = lines[i].match(re);
      if (!m || indentOf(lines[i]) < baseIndent) break;
      if (indentOf(lines[i]) > baseIndent) {
        // Nested list — recurse into the deeper block, appended to the last item.
        const nestMarker = /^\s*\d+\.\s/.test(lines[i]) ? 'ol' : 'ul';
        const nested = flushList(nestMarker);
        if (items.length) items[items.length - 1] += nested;
        continue;
      }
      // LAZY CONTINUATION LINES BELONG TO THE ITEM ABOVE THEM.
      //
      // This loop used to end the item at the newline and fall through to the
      // paragraph branch, which produced 33 single-item <ul>s each followed by
      // an orphaned <p> holding the rest of its own sentence — every wrapped
      // bullet in the document, live on the public page. Section 11's five
      // differentiator claims rendered as five separate lists all numbered "1".
      //
      // And the second symptom had the same cause: `inline()` was applied per
      // LINE, so emphasis opened on one line and closed on the next never
      // paired. `*(community-construct —` printed its asterisk as text. The raw
      // text is therefore joined FIRST and marked up once, which is the only
      // order in which a span can cross the wrap.
      //
      // A continuation is indented past the marker and does not itself start a
      // list item — that second clause is what keeps two-space NESTING working,
      // since the doc nests at the same indent it wraps at.
      let raw = m[2];
      i += 1;
      while (i < lines.length && lines[i].trim() !== ''
        && indentOf(lines[i]) > baseIndent
        && !/^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])) {
        raw += ` ${lines[i].trim()}`;
        i += 1;
      }
      items.push(inline(raw));
    }
    return `<${tag}>${items.map((it) => `<li>${it}</li>`).join('')}</${tag}>`;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i += 1; continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); i += 1; continue; }

    if (/^-{3,}\s*$/.test(line.trim())) { out.push('<hr>'); i += 1; continue; }

    if (/^\s*[-*]\s+/.test(line)) { out.push(flushList('ul')); continue; }
    if (/^\s*\d+\.\s+/.test(line)) { out.push(flushList('ol')); continue; }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      // Blank-separated paragraphs inside the quote.
      const paras = quote.join('\n').split(/\n{2,}/).map((p) => `<p>${inline(p.replace(/\n/g, ' '))}</p>`);
      out.push(`<blockquote>${paras.join('')}</blockquote>`);
      continue;
    }

    // Paragraph: gather until a blank line or a block-starting line.
    const para = [];
    while (i < lines.length && lines[i].trim() !== ''
      && !/^(#{1,4}\s|>\s?|-{3,}\s*$|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

const CSS = `  :root{
    color-scheme: light dark;
    --bg:#F4F1E9; --surface:#FFFFFF; --ink:#1B2333; --ink-soft:#4C5670;
    --line:#8E8A7F; --accent:#33425F; --warm:#7A4E00;
  }
  @media (prefers-color-scheme: dark){
    :root{ --bg:#141A26; --surface:#1E2637; --ink:#F2F0EA; --ink-soft:#B3BCCE;
      --line:#6A7896; --accent:#AFC0DC; --warm:#F5C978; }
  }
  *{ box-sizing:border-box; }
  html,body{ margin:0; }
  body{
    background:var(--bg); color:var(--ink);
    font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    -webkit-font-smoothing:antialiased; line-height:1.6;
    padding:2.5rem 1.25rem 4rem;
  }
  main{ max-width:42rem; margin:0 auto; }
  a{ color:var(--accent); }
  a:focus-visible{ outline:2px solid var(--accent); outline-offset:2px; border-radius:2px; }
  .back{ display:inline-block; margin-bottom:1.75rem; font-weight:600; }
  h1{ font-size:1.9rem; line-height:1.2; margin:0 0 1rem; }
  h2{ font-size:1.4rem; margin:2.4rem 0 0.6rem; }
  h3{ font-size:1.12rem; margin:1.8rem 0 0.4rem; }
  h4{ font-size:1rem; margin:1.4rem 0 0.3rem; }
  p{ margin:0 0 1rem; color:var(--ink-soft); }
  li{ margin:0 0 0.4rem; color:var(--ink-soft); }
  ul,ol{ margin:0 0 1rem; padding-left:1.3rem; }
  strong{ color:var(--ink); }
  code{
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:0.9em;
    background:color-mix(in srgb,var(--line) 22%,transparent);
    padding:0.05em 0.35em; border-radius:0.3rem;
  }
  hr{ border:0; border-top:1px solid var(--line); margin:2.4rem 0; }
  blockquote{
    margin:1.4rem 0; padding:0.2rem 0 0.2rem 1rem;
    border-left:3px solid var(--line); color:var(--ink-soft);
  }
  blockquote p:last-child{ margin-bottom:0; }
  footer{ margin-top:3rem; padding-top:1.5rem; border-top:1px solid var(--line); color:var(--ink-soft); font-size:0.9375rem; }
`;

function page(bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Why it works this way — Quietkeep</title>
<meta name="description" content="The reasoning behind Quietkeep — how memory, attention and motivation actually work, and how that shaped every choice — with each source named and tagged by how well established it is.">
<meta name="theme-color" content="#141A26" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#F4F1E9" media="(prefers-color-scheme: light)">
<link rel="icon" type="image/png" sizes="32x32" href="/brand/favicon-32.png">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
<link rel="icon" type="image/svg+xml" href="/brand/icon.svg">
<link rel="stylesheet" href="/why.css">
</head>
<body>
<main>
  <a class="back" href="/">&larr; Back to Quietkeep</a>
${bodyHtml.split('\n').map((l) => '  ' + l).join('\n')}
  <footer>
    This is the reasoning behind Quietkeep, kept in step with the app itself. It
    names findings and the people associated with them; it is not a literature
    review, and where a construct is contested it says so. <a href="/">Back to the app.</a>
  </footer>
</main>
</body>
</html>
`;
}

const html = page(convert(readFileSync(SRC, 'utf8')));

/**
 * WHAT `--check` COULD NEVER SEE.
 *
 * `--check` regenerates and diffs against the committed file, so it proves the
 * page is CURRENT and says nothing about whether it is right. A converter that
 * produces the same wreckage every run passes it for ever — and did: the public
 * page carried a stranded continuation paragraph for every wrapped bullet in the
 * document, and printed emphasis markers as visible text, with the gate green
 * the whole time. It is the hub's LESSON 63 arriving from the other side: there,
 * a page that renders can be a page that does nothing; here, a page a check
 * calls up-to-date can be a page nobody could read.
 *
 * These are the two exact signatures of that failure, and neither is a
 * heuristic. Both were run against the old converter and both go red on it.
 */
const defects = [];
// The document uses `*` only as a marker. One surviving in the output means a
// span opened and never closed — which is what happened when `inline()` ran per
// line and an italic wrapped across the break.
const strays = (html.match(/\*/g) ?? []).length;
if (strays > 0) defects.push(`${strays} literal asterisk(s) in the output — an emphasis span is unpaired`);
// A paragraph starting with whitespace is a continuation line that was emitted
// as its own block instead of joining the item above it.
const stranded = (html.match(/<p>\s/g) ?? []).length;
if (stranded > 0) defects.push(`${stranded} paragraph(s) begin with whitespace — a wrapped list item was stranded`);
if (defects.length > 0) {
  console.error('the generated page is malformed:');
  for (const d of defects) console.error(`  ${d}`);
  console.error('\nFix tools/thesis.mjs or the source markdown. A page that is up to date\nis not the same claim as a page that is readable.');
  process.exit(1);
}

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing => differs */ }
  let currentCss = '';
  try { currentCss = readFileSync(CSS_OUT, 'utf8'); } catch { /* missing => differs */ }
  if (current !== html || currentCss !== CSS) {
    console.error('public/why.html or why.css is out of date — run `npm run thesis`.');
    process.exit(1);
  }
  console.log('why.html and why.css match docs/planning-for-humans.md.');
} else {
  writeFileSync(OUT, html);
  writeFileSync(CSS_OUT, CSS);
  console.log(`wrote ${OUT} and why.css`);
}
