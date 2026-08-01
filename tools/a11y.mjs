// The app's accessibility gate — computed, never eyeballed (B-08).
//
// brand.mjs checks the TOKENS. This checks the RENDERED APP: what a person is
// actually shown, in both themes, in every reachable state including the ones
// the first version never rendered — the everyday (i) dialog, the dialog at the
// stressed viewport, focus rings, the placeholder.
//
// The first version of this gate was handed to an adversarial audit, which
// deleted focus rings, dropped the placeholder to 1.44:1, shrank targets to
// 20px and made borders invisible — and the gate printed 66 ok, 0 FAIL. Every
// mechanism below that looks paranoid exists because that run happened:
//  - registries audit EVERY visible match of a selector (worst case), not the first
//  - pseudo-elements are sampled (::placeholder)
//  - focus rings are focused-and-measured, not assumed
//  - targets check width AND height, in every state including the dialog
//  - axe runs per state AND at the stressed viewport; `incomplete` is printed
//    by rule id, and the registry pass covers the pairs axe drops there
//  - the dialog's own scrollWidth is checked: it is a scroll container, so
//    page-level overflow stays 0 while content escapes sideways inside it
//
//   npm run a11y        (exits non-zero on any failure)

import { chromium } from 'playwright-core';
import { existsSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AXE = join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
if (!existsSync(join(ROOT, 'public', 'app.js'))) {
  console.error('public/app.js is missing — run `npm run build` first.');
  process.exit(1);
}

const launchOpts = { args: ['--no-sandbox'] };
const SANDBOX_CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
if (existsSync(SANDBOX_CHROMIUM)) launchOpts.executablePath = SANDBOX_CHROMIUM;

const failures = [];

/**
 * Every card must have ONE visible box that contains all of its own controls.
 *
 * The bug: the border lived on the title button rather than on the card, and the
 * actions were siblings that wrapped independently — so on a long title "Done"
 * landed alone on the next line, left-aligned, directly above a DIFFERENT item.
 * Noah found it at 1,429 rows. A completion control that appears to belong to the
 * thing below it is a mis-tap, not a cosmetic complaint, and no contrast or target
 * check can see it.
 *
 * The FIRST version of this asserted the buttons sat inside the card element's
 * bounding rect — which is a tautology, because a flex container always grows to
 * enclose its children wherever the border happens to be drawn. It passed with the
 * bug reintroduced. What matters is the box somebody can SEE: there must exist an
 * element, the card or something in it, that draws a border and encloses every
 * control the card owns. Stated that way it is about the rendered result rather
 * than about which selector carries the style, so it survives any rewrite.
 */
async function auditCardContainment(page, state, theme) {
  const bad = await page.evaluate(() => {
    const out = [];
    const bordered = (el) => {
      const st = getComputedStyle(el);
      return ['Top', 'Right', 'Bottom', 'Left'].every(side => {
        const w = parseFloat(st[`border${side}Width`]);
        const c = st[`border${side}Color`];
        return w > 0 && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
      });
    };
    const holds = (outer, inner) =>
      inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1
      && inner.left >= outer.left - 1 && inner.right <= outer.right + 1;

    for (const card of document.querySelectorAll('#cards .card')) {
      const controls = [...card.querySelectorAll('button')]
        .map(b => b.getBoundingClientRect()).filter(r => r.width > 0);
      if (controls.length === 0) continue;
      // Candidate boxes: the card, and any NON-button element inside it that draws
      // a border. A button cannot be the box that contains its siblings.
      const candidates = [card, ...card.querySelectorAll('*')]
        .filter(el => el.tagName !== 'BUTTON' && bordered(el))
        .map(el => el.getBoundingClientRect());
      if (!candidates.some(box => controls.every(c => holds(box, c)))) {
        out.push(`no single visible box holds every control of "${(card.textContent || '').replace(/\s+/g, ' ').slice(0, 44)}"`);
      }
    }
    return out;
  });
  const label = `${theme}/${state}: each card has one visible box around all its controls`;
  if (bad.length > 0) fail(`${label} — ${bad.slice(0, 2).join('; ')}`);
  else pass(`${label}: yes`);
}
const fail = (m) => { failures.push(m); console.error(`  FAIL  ${m}`); };
const pass = (m) => console.log(`  ok    ${m}`);

// Entries: 'sel' or {sel, pseudo}. Every VISIBLE match is audited; the worst
// ratio is what gets judged. A selector matching nothing visible FAILS.
const DIALOG_COMMON = [
  '#about-title', '.version', '.about-section',
  '#storage-body dt', '#storage-body dd', '#storage-note',
  '#export', '#about-close', '#storage-ask', '#calendar', '#calendar-note', '.about-caveat',
  '#sample', '#sample-note', '#badge-explainer', '#badge-toggle', '#badge-note',
  '#other-file', 'label[for="other-file"]', '#other-note',
  '#purge-summary', '#purge-backup', '#purge-pick-clear', '#purge-pick-erase',
  '#purge-note', '#purge-backup-note', '.purge-label', '#purge-word', '#purge-go',
  '#purge-cancel', '#purge-consequence',
  // The always-reachable way out. This panel is thousands of pixels tall, so a
  // close button only at the bottom meant scrolling the entire release history
  // to shut it (Noah, on device).
  '#about-dismiss',
  // Bringing a copy back. The label and the picker are always there; the note
  // and the two actions only appear once a file has been read, so they get
  // their own state below rather than being registered here where they would
  // match nothing visible.
  '#import-file', 'label[for="import-file"]',
  '.note-triplet', '.note-kind', '.note-list li', '.about-p', '.about-p a',
];
const REGISTRY = {
  // The walkthrough (src/ui/tour.ts) is the first surface a new person meets now,
  // so it is audited as its own state. #tour-back is hidden on the first step, so
  // it is not registered here where it would match nothing visible (it shares
  // button.ghost with #tour-skip, which IS checked); it is exercised by the
  // driver stepping forward.
  'walkthrough': ['#tour-progress', '#tour-heading', '.tour-p', '#tour-skip', '#tour-next'],
  // The ⓘ panel's own first-run auto-open is now gated behind the walkthrough, so
  // its intro no longer shows — the panel a new person reaches (by finishing the
  // walkthrough) is the same one a returning person sees.
  'first-run dialog': DIALOG_COMMON,
  'dialog, return visit': DIALOG_COMMON,
  'empty store': [
    '.wordmark', '#capture', { sel: '#capture', pseudo: '::placeholder' },
    '#capture-form button[type=submit]',
    // Search is a tool that is always on screen even before anything is held,
    // so its input and placeholder are audited here where they first appear.
    '.search-input', { sel: '#search-input', pseudo: '::placeholder' },
    // Sort mode's door is always on screen too (1.3.0).
    '#sort-open',
    'button.info', '.section', '.gauge', '.empty', '.foot', '.foot a', '.build',
    '#update-words', '#update-save', '#update-reload', '#update-dismiss',
  ],
  // Sort mode (1.3.0): the picker — sentences and counts, never lists — and
  // the one-card conveyor. The count and the entry line are the quiet tokens;
  // the route hints are the lowest-contrast text, named like triage's own.
  'sort picker': ['#sort-title', '.sort-choice', '.sort-choice-words', '.sort-choice-count',
    '#sort-query', { sel: '#sort-query', pseudo: '::placeholder' }, '#sort-query-go', '#sort-close'],
  'sort card': ['#sort-entry', '#sort-card', '#sort-where',
    '#sort-actions .route', '#sort-actions .route-label', '#sort-actions .route-hint',
    '#sort-back', '#sort-close', '#sort-act-all'],
  // Wholesale (1.5.0, ADR-0049): the verbs, the preview sentence, the place
  // filter's placeholder, and the run controls.
  'sort bulk verbs': ['#sort-bulk-title', '#sort-bulk-verbs .route',
    '#sort-bulk-verbs .route-label', '#sort-bulk-verbs .route-hint',
    '#sort-bulk-preview', '#sort-bulk-go', '#sort-bulk-cancel', '#sort-bulk-export'],
  // The destructive confirm, revealed by choosing Let-them-go — the
  // purge-confirm rule: a control that only exists after a click is still a
  // control somebody reads.
  'sort bulk confirm': ['#sort-bulk-confirm .detail-inline', '#sort-bulk-word',
    '#sort-bulk-preview', '#sort-bulk-go'],
  // Things you let go (1.5.0, ADR-0050): the count and the one-verb rows.
  'trash view': ['#trash-open', '#trash-total', '.trash-row'],
  // The picker's create-in-place offer, which only exists once unknown words
  // have been typed — a control someone meets mid-filing is still a control.
  'detail sheet, creating a place': ['#detail-parent-filter', '#detail-parent-create'],
  'with cards': ['.card-title', '.card-when', '#status', '.group-head'],
  // Search results — only exist once you have typed, so a state of their own.
  // The summary is the quiet count; the "where" is the held status word, the
  // lowest-contrast text on the row and the whole point of showing it.
  'search results': ['.search-summary', '.search-open', '.search-title', '.search-where'],
  // The last-action undo the triage route raises. `.triage-undo-btn` is the
  // `.linklike` accent-on-background pair the app's links use; the "where" line
  // is the quiet token naming the destination.
  'route undo': ['.triage-undo-where', '.triage-undo-btn'],
  // The triage surface, in both of its passes. Heat shows Hot/Cold; clarify
  // shows the six routes, each a label over a hint. Every visible pair is
  // audited — the hint is the lowest-contrast text on the surface, so it is
  // named explicitly rather than left to axe alone.
  'heat pass': ['.triage-gauge', '.triage-prompt', '.triage-card', '.route'],
  'clarify': ['.triage-gauge', '.triage-prompt', '.triage-card',
    '.route', '.route-label', '.route-hint'],
  // What a just-routed "Do now" offers. The timer is an offering, not a gate,
  // so this state exists before any stopwatch is running — and it carries the
  // Done the flow previously had no way to express at all.
  'do now offered': ['.donow', '.donow-label', '.donow-done'],
  // Work mode. The "why" lines and the behind-list are the lowest-contrast text
  // on these surfaces, so they are named rather than left to axe alone.
  'next up': ['#nextup-heading', '.nextup-title', '.nextup-why', '.nextup-count',
    '#nextup-done', '#nextup-skip', '#gauge', '.card-done', '#tree-open'],
  'coverage open': ['#gauge', '.coverage-title', '.coverage-when', '.coverage-open'],
  // The tree, open (1.6.0, ADR-0013/item 39): rows are doors, depth is
  // indentation, and the branch remainder is a real button.
  'tree open': ['#tree-open', '.tree-open-row', '.tree-title'],
  // Composed Today's strip (1.6.0, ADR-0051): quiet doors above Next up.
  'composed strip': ['#composed-heading', '.composed-open', '#composed .detail-hint'],
  // The session close (1.6.0, ADR-0052): the words are the whole surface.
  'close strip': ['#close-heading', '#close-win', '#close-gauge', '#close-ok'],
  // Composed Today's opt-in Extra (1.6.0) — the comms opt-in's shape. The
  // status note is audited via the dialog pass once it carries words.
  'today opt-in': ['#today-start', '.about-caveat'],
  // The detail sheet. The hint and the inline labels are the lowest-contrast
  // text on it, and the number inputs are the smallest targets.
  'detail sheet': ['#detail-title', '.detail-state', '.detail-label', '.detail-inline',
    '.detail-hint', '#detail-name', '#detail-date', '#detail-every', '#detail-rename',
    '#detail-date-set', '#detail-close',
    // 1.3.0's verbs: the defer date, the estimate, and the picker's filter.
    '#detail-start', '#detail-start-set', '#detail-estimate', '#detail-estimate-set',
    '#detail-parent-filter', { sel: '#detail-parent-filter', pseudo: '::placeholder' },
    // The dependency picker. A <select> and a number box are the two smallest
    // targets on the densest surface in the app.
    '#detail-feeds', '#detail-lead', '#detail-feeds-set',
    // Containment (law 4). `#detail-place` is the sheet's answer to "where does
    // this sit" and it is stated as ordinary `--ink`, not a quieter token —
    // structural facts are not asides.
    '#detail-parent', '#detail-parent-set', '#detail-make-project',
    '#detail-person', '#detail-relation', '#detail-person-set',
    // 1.4.0: the note editor and the history disclosure's summary line — the
    // textarea is the sheet's only multi-line input, no placeholder by design.
    '#detail-note', '#detail-note-set', '#detail-history summary',
    // 1.7.0: the fold verb's filter and button are always on a live sheet; the
    // SELECT is not here — with nothing else held it renders disabled, so it
    // is audited in 'detail sheet, folding', where legal targets exist.
    '#detail-merge-filter', { sel: '#detail-merge-filter', pseudo: '::placeholder' },
    '#detail-merge-set'],
  // The fold, with somewhere to fold into (1.7.0, ADR-0053): the select is
  // live only when another legal target exists, so it gets its own state
  // rather than a selector the base sheet can only match disabled.
  'detail sheet, folding': ['#detail-merge-filter', '#detail-merge',
    '#detail-merge-set', '#detail-merge-hint'],
  // The way back, the moment after a fold: the ghost button and the promise
  // beside it are the whole surface a folded thing has left.
  'detail sheet, folded away': ['#detail-unmerge', '#detail-unmerge-group .detail-hint'],
  // The survivor's side: what folded into it, each with its own way back.
  'detail sheet, survivor': ['#detail-merged-group .detail-label',
    '#detail-merged-list .detail-feed', '#detail-merged-list button'],
  // The lens (1.7.0, ADR-0054): the row above the held list, and the law-1
  // line that renders ONLY while a lens is active — audited in that state.
  'lens row': ['.lens-row .detail-inline', '#lens', '#lens-note'],
  // Per-node history, open (1.4.0). The cure lines are the quietest text in
  // the whole app's story — --ink-soft, indented — and exactly the lines that
  // explain the app's own writes, so they must clear the gate, not hide.
  'detail sheet, history open': ['#detail-history summary',
    '#detail-history-lines .log-line', '#detail-history-lines .log-cure'],
  // The record itself, open behind (i) (1.4.0, ADR-0048). Day headings, the
  // stated total, and the plain-words lines.
  'log view': ['#log-open', '#log-total', '.log-day-title', '#log-days .log-line'],
  // The same sheet once something IS inside something. `#detail-place` renders
  // ONLY here, so it lives in its own registry entry rather than in the base
  // sheet — where it matched nothing and the gate said so, which is the check
  // working. It is stated as ordinary `--ink`, not a quieter token: a structural
  // fact is not an aside.
  'detail sheet, inside something': ['#detail-place', '#detail-title', '.detail-label',
    '#detail-parent', '#detail-parent-set', '#detail-close'],
  // Dates that have gone by. This surface must read as calm, so its contrast is
  // carried entirely by the ordinary text tokens — there is no alert colour to
  // check, and that absence is the point (law 3, ADR-0034).
  // Today on paper. The control lives in the panel; the card itself is never on
  // screen, so what is audited here is the button and the honesty line beside it.
  'today on paper': ['#today-print', '.about-section', '.about-p', '.about-caveat'],
  // The bother flow. The choice hints are the lowest-contrast text and they are
  // load-bearing: they say what each answer will DO, and a forced choice with
  // unlabelled consequences is a guess. All three choices are styled identically
  // on purpose — "not mine to carry" is not a lesser option and must not look
  // like one.
  'bother': ['#bother-prompt', '.bother-card', '.bother-choice',
    '.bother-choice-label', '.bother-choice-hint'],
  'bother entry': ['#bother-summary', '#bother-text',
    { sel: '#bother-text', pseudo: '::placeholder' },
    '#bother-form button[type=submit]', '.detail-hint'],
  // The Menu (law 6). The money line is the lowest-contrast text and it is the
  // whole of what a save-for says. There is NO bar and no colour keyed to the
  // numbers anywhere on this surface, and that absence is the measurement.
  'menu open': ['#menu-open', '.menu-cat', '.menu-item', '.menu-title'],
  // Coming back (law 8). The reassurance is the CONTENT, so it gets full ink;
  // the counts beneath it are the lesser fact and sit in the quiet token. There
  // is nothing here keyed to how long you were away — no colour, no threshold —
  // because a lapse is not a severity.
  'reentry': ['#reentry-heading', '.reentry-words', '.reentry-waiting',
    '.reentry-amnesty-words', '#reentry-amnesty-go', '#reentry-dismiss'],
  // The comms sweep on the focus-exit ramp. Its line is an OFFER, stated in
  // `--ink` rather than a quieter token — it is the content of the surface, not
  // an aside — and there is no badge, no count and no colour anywhere on it.
  'comms ramp': ['#comms-heading', '.comms-words', '#comms-done', '#comms-later'],
  // Its opt-in, in the panel. Off until asked for.
  'comms opt-in': ['#comms-start', '.about-p', '.about-caveat', '.about-section'],
  // The track portfolio. The facts line is the lowest-contrast text and it is the
  // whole content of the row — who, when an answer is owed, what is outstanding.
  // There is no colour here that means "at risk" and there will not be one: a hue
  // aimed at someone else's work is this app grading them (B-01, law 5).
  'portfolio': ['#portfolio-heading', '.portfolio-count', '.portfolio-open',
    '.portfolio-title', '.portfolio-why'],
  // The sheet's controls for it, which only a container ever shows. `#detail-track`
  // is NOT here: once the thing is tracked it is replaced by `#detail-untrack`,
  // which is the control this state actually offers. The gate said so rather than
  // silently skipping a selector it could not find, which is the registry rule
  // working — the same way it did for `#detail-place` in 0.13.0.
  'detail sheet, carried': ['#detail-untrack', '#detail-suspense', '#detail-suspense-set',
    '.detail-inline', '#detail-close'],
  // The status report's controls, in the panel that talks about handing things
  // over. Four buttons and the line that confirms one worked.
  'report controls': ['#report-copy', '#report-markdown', '#report-csv', '#report-print',
    '.about-p', '.about-caveat', '.about-section'],
  // The person lens. How long something has been with someone is the
  // lowest-contrast text here and it is load-bearing — it is the fact you use to
  // decide whether to mention it. Same ink tokens as everything else: there is
  // no colour that means "they have had this a while", and there will not be.
  'people': ['#people-heading', '.people-count', '.people-open',
    '.people-title', '.people-why'],
  // The sheet's write side. A free-text box with a datalist and a select are the
  // two smallest targets on it.
  'detail sheet, with someone': ['#detail-person',
    { sel: '#detail-person', pseudo: '::placeholder' },
    '#detail-relation', '#detail-person-set', '.detail-label', '.detail-hint'],
  // Focus. The elapsed line and the interrupt hint are the lowest-contrast text
  // here, and both are load-bearing: one says how long you have been at it, the
  // other says your way back is already saved. Nothing on this surface counts
  // down and nothing goes red — there is no alert token to measure, which is the
  // measurement (law 5, B-01).
  //
  // `.focus-elapsed` is NOT here, and the honest reason is that this gate cannot
  // reach it. The line renders only once a whole minute has passed — `focusWords`
  // returns null below that, because "0 minutes so far" is a number pretending to
  // be information — and a walk that sat for sixty seconds twice over would be
  // paying a minute of CI to measure a pair that IS measured: it is `--ink-soft`
  // on `--surface`, the same pair as `.review-count` and `.replan-count` directly
  // above. That is an ARGUMENT, not a measurement, and it is recorded as one in
  // ACCESSIBILITY.md B-13 — same treatment as `.replan-context`.
  'focus': ['#focus-heading', '.focus-title', '#focus-interrupt',
    { sel: '#focus-interrupt', pseudo: '::placeholder' },
    '#focus-interrupt-form button[type=submit]', '.detail-hint', '#focus-done', '#focus-stop'],
  // The same surface once something has been written down during it.
  'focus, interrupted': ['#focus-held', '.focus-title', '#focus-done', '#focus-stop'],
  // Stopping. The five words are optional, and the sheet has to say so without
  // making the empty answer look like a failure to answer.
  'focus sheet': ['#focus-sheet-title', '.detail-label', '#focus-cue',
    { sel: '#focus-cue', pseudo: '::placeholder' },
    '.detail-hint', '#focus-sheet-stop', '#focus-sheet-cancel'],
  // Review, exceptions only. Its rows are the app telling you something is
  // structurally wrong, so they must be as calm as everything else — same ink
  // tokens, no alert colour to check, and that absence is the point.
  'review': ['#review-heading', '.review-count', '.review-open',
    '.review-title', '.review-why'],
  'replan': ['#replan-heading', '.replan-count', '.replan-open',
    '.replan-card-title', '.replan-card-when'],
  // The sheet. The option hints are the lowest-contrast text in the app after
  // the route hints, and they are load-bearing: they say what each choice does.
  //
  // `.replan-context` is NOT here, and the honest reason is not the one the
  // first version gave. It claimed the omission "keeps this list honest"; in
  // fact that line renders only for a node with a `suspense` clock, and NO
  // surface in the app can write one yet — so it is unreachable in every gate,
  // and its contrast is simply UNMEASURED (audit). Its wording and its guards
  // are covered by unit tests in `test/replan.test.ts`; its rendered contrast is
  // not, and will not be until `suspense.set` has a surface. It uses the same
  // `--ink-soft`-on-`--surface` pair as `.replan-when` directly above it, which
  // IS measured here — an argument, not a measurement, and recorded as such.
  'replan sheet': ['#replan-sheet-title', '.replan-when',
    '#replan-sheet-ask', '.replan-choice', '.replan-choice-label', '.replan-choice-hint',
    '.replan-option-label', '.replan-option-hint', '#replan-new-date',
    '.replan-set', '#replan-close'],
  // The failure state, which no walk ever rendered. An error message is exactly
  // the text that gets forgotten, and it appears at the moment a person is
  // already stuck.
  'replan sheet, refused': ['#replan-sheet-error', '#replan-sheet-title', '.replan-when'],
  // A file has been chosen and described. This is the state that carries the
  // destructive control, so it is the one most worth measuring — and the note
  // above it is the sentence someone reads before replacing everything they
  // have.
  'import, file chosen': ['#import-note', '#import-union', '#import-backup', '#import-go', '#import-explainer'],
};

const srgb = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

/** Runs in the page. For each entry, sample EVERY visible match, resolving fg
 *  (optionally of a pseudo-element) against the nearest opaque ancestor bg. */
function sampler(entries) {
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.99) return c.rgb;
    }
    return null;
  };
  return entries.map((entry) => {
    const sel = typeof entry === 'string' ? entry : entry.sel;
    const pseudo = typeof entry === 'string' ? undefined : entry.pseudo;
    const els = [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length > 0);
    if (els.length === 0) return { sel, pseudo, missing: true };
    const samples = els.map((el) => {
      const cs = getComputedStyle(el, pseudo);
      const fg = parse(cs.color);
      return {
        fg: fg ? fg.rgb : null,
        bg: bgOf(el),
        size: parseFloat(cs.fontSize),
        weight: parseInt(cs.fontWeight, 10) || 400,
      };
    });
    return { sel, pseudo, missing: false, samples, count: els.length };
  });
}

async function auditContrast(page, stateName, theme, registryKey = stateName) {
  const rows = await page.evaluate(sampler, REGISTRY[registryKey]);
  for (const r of rows) {
    const label = `${r.sel}${r.pseudo ?? ''}`;
    if (r.missing) { fail(`${theme}/${stateName}: registry entry "${label}" matches nothing visible — the gate no longer sees it`); continue; }
    let worst = null;
    let bad = false;
    for (const smp of r.samples) {
      if (!smp.fg || !smp.bg) { bad = true; fail(`${theme}/${stateName}: could not resolve colours for "${label}"`); break; }
      const large = smp.size >= 24 || (smp.size >= 18.66 && smp.weight >= 600);
      const need = large ? 3 : 4.5;
      const got = ratio(smp.fg, smp.bg);
      if (worst === null || got / need < worst.got / worst.need) worst = { got, need };
    }
    if (bad || worst === null) continue;
    (worst.got >= worst.need ? pass : fail)(
      `${theme.padEnd(5)} ${stateName.padEnd(22)} ${label.padEnd(32)} ${worst.got.toFixed(2)}:1 (needs ${worst.need}:1, ${r.count} node${r.count === 1 ? '' : 's'})`,
    );
  }
}

async function auditAxe(page, stateName, theme) {
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(() =>
    axe.run(document, { resultTypes: ['violations', 'incomplete'] }));
  if (res.violations.length === 0) {
    const inc = res.incomplete.map((i) => i.id).join(', ');
    pass(`${theme}/${stateName}: axe — 0 violations${res.incomplete.length ? ` (incomplete: ${inc}; those pairs are held by the registry pass, not waved through)` : ''}`);
  } else {
    for (const v of res.violations) {
      fail(`${theme}/${stateName}: axe ${v.id} (${v.impact}) — ${v.help} — ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target?.join(' ')}`);
    }
  }
}

async function auditTargets(page, stateName, theme) {
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('button, input, a, [role=button]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // Height carries B-06's 44px floor; width gets WCAG 2.2 2.5.8's 24px —
      // a 20px-wide sliver passed the first gate (audit).
      if (r.height < 44 || r.width < 24) {
        out.push(`${el.tagName.toLowerCase()}#${el.id || el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  });
  (small.length === 0 ? pass : fail)(
    `${theme}/${stateName}: targets ≥44px tall, ≥24px wide${small.length ? ` — ${small.join(', ')}` : ''}`,
  );
}

/** Tab to each control the way a keyboard user does — programmatic focus does
 *  NOT set :focus-visible on buttons, so the first version observed no ring and
 *  passed a build with `outline:none` (audit). Real Tabbing sets the keyboard
 *  modality, so what we measure is what a keyboard user is actually shown. */
async function auditFocusRings(page, stateName, theme, selectors) {
  const remaining = new Set(selectors);
  // Start from a clean slate, then walk forward with Tab. The budget is a
  // reachability proxy, sized to the DENSEST surface: the detail sheet's
  // suspense control sat at stop ~40 once 1.4.0's note editor landed ahead of
  // it, and the walk declaring it unreachable at 40 was the budget lying, not
  // the sheet failing. 60 covers today's worst case with headroom; a control
  // genuinely beyond that is a real finding.
  await page.evaluate(() => (document.activeElement)?.blur?.());
  for (let i = 0; i < 60 && remaining.size > 0; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate((sels) => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const match = sels.find((s) => el.matches(s));
      if (!match) return null;
      const cs = getComputedStyle(el);
      const parseC = (str) => {
        const m = str.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(',').map(Number);
        return (p[3] ?? 1) > 0.99 ? [p[0], p[1], p[2]] : null;
      };
      const bgOf = (node) => {
        for (let n = node; n; n = n.parentElement) {
          const c = parseC(getComputedStyle(n).backgroundColor);
          if (c) return c;
        }
        return null;
      };
      return {
        match,
        visible: cs.outlineStyle,
        width: parseFloat(cs.outlineWidth),
        colour: parseC(cs.outlineColor),
        bg: bgOf(el.parentElement ?? el),
        focusVisible: el.matches(':focus-visible'),
      };
    }, [...remaining]);
    if (!hit) continue;
    remaining.delete(hit.match);
    const srgb2 = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const lum2 = ([r, g, b]) => 0.2126 * srgb2(r) + 0.7152 * srgb2(g) + 0.0722 * srgb2(b);
    const rat = (a, b) => { const [x, y] = [lum2(a), lum2(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
    const contrast = hit.colour && hit.bg ? rat(hit.colour, hit.bg) : 0;
    const ok = hit.visible !== 'none' && hit.width >= 2 && contrast >= 3;
    (ok ? pass : fail)(
      `${theme.padEnd(5)} ${stateName.padEnd(22)} focus ring ${hit.match.padEnd(20)} ${hit.visible} ${hit.width}px @ ${contrast.toFixed(2)}:1 (needs solid ≥2px ≥3:1)`,
    );
  }
  for (const sel of remaining) {
    fail(`${theme}/${stateName}: never reached "${sel}" by Tab — not keyboard-focusable?`);
  }
}

const { server, url } = await serve(join(ROOT, 'public'));
const browser = await chromium.launch(launchOpts);

try {
  for (const theme of ['light', 'dark']) {
    console.log(`\n=== ${theme} theme ===`);
    const ctx = await browser.newContext({
      timezoneId: 'America/Denver',
      locale: 'en-US',
      colorScheme: theme,
      reducedMotion: 'reduce',   // B-05: everything must hold with motion off
      viewport: { width: 390, height: 844 },
      // This gate injects axe as a script, which the app's own strict CSP
      // (script-src 'self') correctly refuses — the CSP working is proven by
      // smoke.mjs, which runs UNDER the policy and fails on any violation.
      // Accessibility (contrast, rings, structure) is unaffected by CSP, so this
      // context bypasses it to let the instrument run. Division of labour:
      // smoke owns the CSP; a11y owns accessibility.
      bypassCSP: true,
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('body[data-ready=true]');

    // Fill-and-verify for the search box. A plain fill has been observed (here
    // and in smoke, at more than one site) to resolve without the value
    // landing when a commit-triggered refresh is in flight — rarely, and only
    // on loaded runners. Verifying keeps the check honest: a lost fill
    // retries; a genuinely broken search still fails, with the observed value.
    const fillSearch = async (text) => {
      for (let tries = 0; ; tries++) {
        // The mechanism, finally caught: filling while a modal dialog is open
        // (or still closing) resolves without the value landing — the fill's
        // focus step cannot reach an element the dialog has made inert, so
        // the inserted text goes to whatever holds focus. Wait the modal out.
        await page.waitForFunction(() => !document.querySelector('dialog[open]'),
          null, { timeout: 5000 }).catch(() => {});
        await page.fill('#search-input', text);
        const landed = await page.waitForFunction(
          (t) => document.querySelector('#search-input')?.value === t, text,
          { timeout: 2000 },
        ).then(() => true).catch(() => false);
        if (landed) return;
        if (tries >= 2) {
          fail(`${theme}: the search fill "${text}" would not land after ${tries + 1} tries`);
          return;
        }
      }
    };

    // The update line is hidden until a newer version exists, so it is revealed for
    // the audit — a control somebody only meets on an update day is still a control,
    // and leaving it out would exempt exactly the surfaces people meet under strain.
    await page.evaluate(() => {
      const u = document.querySelector('#update');
      const w = document.querySelector('#update-words');
      if (u && w) { w.textContent = 'A newer version is ready.'; u.hidden = false; }
    });

    // State 0: the walkthrough, which is the FIRST surface a new person meets —
    // before the (i) panel, which is now gated behind it.
    await page.waitForSelector('#tour[open]');
    await auditContrast(page, 'walkthrough', theme);
    await auditAxe(page, 'walkthrough', theme);
    await auditTargets(page, 'walkthrough', theme);
    // Step to the end. The last step's "Get started" hands off to the (i) panel
    // for the storage step, which is exactly what State 1 audits.
    await page.click('#tour-next');
    await page.click('#tour-next');
    await page.click('#tour-next');
    await page.click('#tour-next');

    // State 1: the (i) panel as a new user reaches it (via the walkthrough).
    await page.waitForSelector('#storage-body dt');
    // The clearing confirmation is revealed by choosing a mode, so it is opened
    // here: a control that only exists after a click is still a control somebody
    // reads, and leaving it out of the audit would exempt the typed-word box —
    // the one surface in the app standing between a person and their history.
    await page.click('#purge-pick-clear');
    await page.waitForSelector('#purge-confirm:not([hidden])');
    await auditContrast(page, 'first-run dialog', theme);
    await auditAxe(page, 'first-run dialog', theme);
    await auditTargets(page, 'first-run dialog', theme);
    await page.click('#about-close');

    // State 2: the empty store.
    await auditContrast(page, 'empty store', theme);
    await auditAxe(page, 'empty store', theme);
    await auditTargets(page, 'empty store', theme);
    await auditFocusRings(page, 'empty store', theme,
      ['#capture', '#capture-form button[type=submit]', 'button.info', '.skip']);

    // State 3: with a card on the surface.
    await page.fill('#capture', 'a held thought');
    await page.click('#capture-form button[type=submit]');
    await page.waitForSelector('.card');
    await auditContrast(page, 'with cards', theme);
    await auditAxe(page, 'with cards', theme);
    await auditTargets(page, 'with cards', theme);
    await auditCardContainment(page, 'with cards', theme);
    // Only .card-open exists here: an unrouted capture belongs to triage and is
    // deliberately given no Done control. The tick-off button is audited in the
    // 'next up' state below, once the item has been routed and can be completed.
    await auditFocusRings(page, 'with cards', theme, ['#cards .card-open']);

    // State 3a: search. Type a word; the held card is found. The input is always
    // present (audited in 'empty store'); the results are their own state, and a
    // result is a real button with a focus ring like every other row.
    await fillSearch('held');
    await page.waitForSelector('#search-results .search-open');
    await auditContrast(page, 'search results', theme);
    await auditAxe(page, 'search results', theme);
    await auditTargets(page, 'search results', theme);
    await auditFocusRings(page, 'search results', theme, ['#search-input', '#search-results .search-open']);
    await fillSearch('');          // leave the box as we found it
    await page.waitForSelector('#search-results .search-open', { state: 'detached' });

    // State 3b: the triage surface. Capturing a card left an unrouted node, so
    // the heat pass is already showing. Audit it, then take the heat tap to
    // reveal the six clarify routes and audit those too.
    await page.waitForSelector('#triage:not([hidden]) .route');
    await auditContrast(page, 'heat pass', theme);
    await auditAxe(page, 'heat pass', theme);
    await auditTargets(page, 'heat pass', theme);
    await auditFocusRings(page, 'heat pass', theme, ['#triage-actions .route']);

    await page.click('#triage-actions .route');   // Hot — advances to clarify
    await page.waitForSelector('#triage-actions .route .route-hint');
    await auditContrast(page, 'clarify', theme);
    await auditAxe(page, 'clarify', theme);
    await auditTargets(page, 'clarify', theme);
    await auditFocusRings(page, 'clarify', theme, ['#triage-actions .route']);

    // State 3c: route it, which both clears the inbox — so focus must return to
    // capture rather than fall to <body> (A-5/F-05) — and gives Work mode
    // something to offer.
    await page.evaluate(() => document.querySelector('#triage-actions .route')?.focus());
    await page.keyboard.press('Enter');           // "Do now"
    await page.waitForSelector('#triage', { state: 'hidden' });
    const afterRoute = await page.evaluate(() => document.activeElement?.id ?? '');
    (afterRoute === 'capture' ? pass : fail)(
      `${theme}/triage: focus returns to capture after the last card is routed (on ${afterRoute || 'BODY'}, not <body>)`);

    // State 3c-ii: the do-now offer. It outlives the triage surface — that was
    // the defect — so it is audited here, with #triage already hidden.
    await page.waitForSelector('.donow-done');
    await auditContrast(page, 'do now offered', theme);
    await auditAxe(page, 'do now offered', theme);
    await auditTargets(page, 'do now offered', theme);
    await auditFocusRings(page, 'do now offered', theme, ['.donow-done']);

    // State 3c-iii: the last-action undo. Routing the card above raised it, and it
    // lives beside the do-now offer, outliving the hidden triage surface for the
    // same reason — the way to take a route back must not vanish with the section.
    await page.waitForSelector('#triage-undo .triage-undo-btn');
    await auditContrast(page, 'route undo', theme);
    await auditAxe(page, 'route undo', theme);
    await auditTargets(page, 'route undo', theme);
    await auditFocusRings(page, 'route undo', theme, ['.triage-undo-btn']);

    // State 3d: Work mode — Next up, then the coverage list opened.
    await page.waitForSelector('#nextup:not([hidden])');
    await auditContrast(page, 'next up', theme);
    await auditAxe(page, 'next up', theme);
    await auditTargets(page, 'next up', theme);
    await auditFocusRings(page, 'next up', theme, ['#nextup-done', '#nextup-skip', '#gauge', '#cards .card-done']);

    await page.click('#gauge');
    await page.waitForSelector('#coverage:not([hidden])');
    await auditContrast(page, 'coverage open', theme);
    await auditAxe(page, 'coverage open', theme);
    await auditTargets(page, 'coverage open', theme);

    // State 3e: the detail sheet — the surface that makes this a planner.
    await page.click('#cards .card-open');
    await page.waitForSelector('#detail[open]');
    await auditContrast(page, 'detail sheet', theme);
    await auditAxe(page, 'detail sheet', theme);
    await auditTargets(page, 'detail sheet', theme);
    await auditFocusRings(page, 'detail sheet', theme, ['#detail-date-set', '#detail-close', '#detail-feeds']);

    // 1.4.0: the per-node history, open. The item on this sheet was captured,
    // so its record holds a cure — the quiet indented line is guaranteed
    // present, and the registry's .log-cure selector has something real to
    // measure (a selector matching nothing visible FAILS, by design).
    await page.click('#detail-history summary');
    await page.waitForFunction(() =>
      document.querySelectorAll('#detail-history-lines .log-line').length > 0);
    await auditContrast(page, 'detail sheet, history open', theme);
    await auditAxe(page, 'detail sheet, history open', theme);
    await auditTargets(page, 'detail sheet, history open', theme);
    await page.click('#detail-history summary');

    // B-04's hardest case, for the densest surface in the app.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const sheetOverflow = await page.evaluate(() => {
      const d = document.querySelector('#detail');
      return d.scrollWidth - d.clientWidth;
    });
    (sheetOverflow <= 1 ? pass : fail)(
      `${theme}/320px @ 200%: detail sheet horizontal overflow ${sheetOverflow}px (must be ≤1)`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.setViewportSize({ width: 390, height: 844 });

    // State 3f: dates that have gone by. Give the open item a date five days
    // behind, which is the only way to reach this surface — and the sheet that
    // is already open is the app's own way of doing it, so this exercises the
    // real path rather than seeding the store from the outside.
    const pastKey = await page.evaluate(() =>
      new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10));
    await page.fill('#detail-date', pastKey);
    await page.click('#detail-date-set');
    await page.waitForTimeout(200);
    await page.click('#detail-close');
    await page.waitForSelector('#replan:not([hidden])');
    await auditContrast(page, 'replan', theme);
    await auditAxe(page, 'replan', theme);
    await auditTargets(page, 'replan', theme);
    await auditFocusRings(page, 'replan', theme, ['.replan-open']);

    await page.click('.replan-open');
    await page.waitForSelector('#replan-sheet[open]');
    await auditContrast(page, 'replan sheet', theme);
    await auditAxe(page, 'replan sheet', theme);
    await auditTargets(page, 'replan sheet', theme);
    await auditFocusRings(page, 'replan sheet', theme,
      ['.replan-choice', '#replan-new-date', '.replan-set', '#replan-close']);

    // The REFUSED state: press Set with an empty date box. No walk rendered this
    // before, so the one message a person sees at the moment they are already
    // stuck went unmeasured (audit).
    await page.click('.replan-set');
    await page.waitForSelector('#replan-sheet-error:not([hidden])');
    await auditContrast(page, 'replan sheet, refused', theme);
    await auditAxe(page, 'replan sheet, refused', theme);
    // The wordiest surface in the app: five options, each a label over a hint,
    // one of them carrying a date box. If anything overflows sideways at 320px
    // and 200%, it is this.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const replanOverflow = await page.evaluate(() => {
      const d = document.querySelector('#replan-sheet');
      return d.scrollWidth - d.clientWidth;
    });
    (replanOverflow <= 1 ? pass : fail)(
      `${theme}/320px @ 200%: replan sheet horizontal overflow ${replanOverflow}px (must be ≤1)`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#replan-close');

    // State 3d2: a worry, and the question it is asked first.
    await page.click('#bother-summary');
    await page.waitForSelector('#bother-text');
    await auditContrast(page, 'bother entry', theme);
    await auditTargets(page, 'bother entry', theme);
    await auditFocusRings(page, 'bother entry', theme, ['#bother-text', '#bother-summary']);
    await page.fill('#bother-text', 'the thing with the roof');
    await page.click('#bother-form button[type=submit]');
    await page.waitForSelector('#bother:not([hidden])');
    await auditContrast(page, 'bother', theme);
    await auditAxe(page, 'bother', theme);
    await auditTargets(page, 'bother', theme);
    await auditFocusRings(page, 'bother', theme, ['.bother-choice']);
    // Three stacked choices, each a label over a hint, at 320px and 200%.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const botherOver = await page.evaluate(() => {
      const d = document.querySelector('#bother');
      return d.scrollWidth - d.clientWidth;
    });
    (botherOver <= 1 ? pass : fail)(
      `${theme}/320px @ 200%: bother flow horizontal overflow ${botherOver}px (must be ≤1)`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.bother-choice', { hasText: 'Not mine to carry' }).first().click();
    await page.waitForTimeout(300);

    // State 3e1: the Menu. Reached by routing something to Someday, which is the
    // only way anything gets there.
    await page.fill('#capture', 'a book to read');
    await page.click('#capture-form button[type=submit]');
    await page.waitForSelector('#triage:not([hidden]) .route');
    for (let i = 0; i < 12; i++) {
      if (await page.locator('#triage-actions .route .route-hint').count() > 0) break;
      await page.click('#triage-actions .route');
      await page.waitForTimeout(120);
    }
    await page.locator('#triage-actions .route', { hasText: 'Someday' }).first().click();
    await page.waitForTimeout(300);
    await page.waitForSelector('#menu-open:not([hidden])');
    await page.click('#menu-open');
    await page.waitForSelector('#menu:not([hidden])');
    await auditContrast(page, 'menu open', theme);
    await auditAxe(page, 'menu open', theme);
    await auditTargets(page, 'menu open', theme);
    await auditFocusRings(page, 'menu open', theme, ['#menu-open', '.menu-item']);
    await page.click('#menu-open');           // closed again, so later states are clean

    // State 3e2: coming back. Reached by ageing the whole log, which is the only
    // honest way — `lastActivityAt` is a maximum, so one backdated event proves
    // nothing. The snapshot is its own store and has to go with it.
    await page.evaluate(async () => {
      const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
      const all = await new Promise((res) => {
        const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
        tx.onsuccess = () => res(tx.result);
      });
      const shift = 15 * 86400000;
      const store = db.transaction('events', 'readwrite').objectStore('events');
      for (const e of all) {
        const moved = { ...e, at: new Date(Date.parse(e.at) - shift).toISOString() };
        if (moved.payload && typeof moved.payload === 'object') {
          moved.payload = { ...moved.payload };
          for (const k of ['at', 'since', 'startedAt', 'endedAt', 'returnAt']) {
            if (typeof moved.payload[k] === 'string' && !Number.isNaN(Date.parse(moved.payload[k]))) {
              moved.payload[k] = new Date(Date.parse(moved.payload[k]) - shift).toISOString();
            }
          }
        }
        store.put(moved);
      }
      await new Promise((res) => { store.transaction.oncomplete = res; });
      if (db.objectStoreNames.contains('snapshots')) {
        const snaps = db.transaction('snapshots', 'readwrite').objectStore('snapshots');
        snaps.clear();
        await new Promise((res) => { snaps.transaction.oncomplete = res; });
      }
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('body[data-ready=true]');
    await page.waitForSelector('#reentry:not([hidden])');
    await auditContrast(page, 'reentry', theme);
    await auditAxe(page, 'reentry', theme);
    await auditTargets(page, 'reentry', theme);
    await auditFocusRings(page, 'reentry', theme, ['#reentry-amnesty-go', '#reentry-dismiss']);
    // B-04's hardest case for the surface someone meets after a fortnight away —
    // the one screen where a horizontal scrollbar would be least forgivable.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const reOver = await page.evaluate(() => {
      const d = document.querySelector('#reentry');
      return d.scrollWidth - d.clientWidth;
    });
    (reOver <= 1 ? pass : fail)(
      `${theme}/320px @ 200%: re-entry greeting horizontal overflow ${reOver}px (must be ≤1)`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#reentry-dismiss');
    await page.waitForTimeout(200);

    // State 3f-: the comms sweep. Turned on through the panel, made due the way
    // the smoke walk does it, then reached the only way it can be reached — by
    // coming out of a focus session.
    await page.click('#open-about');
    await page.waitForSelector('#comms-start:not([hidden])');
    await auditContrast(page, 'comms opt-in', theme);
    await auditTargets(page, 'comms opt-in', theme);
    await auditFocusRings(page, 'comms opt-in', theme, ['#comms-start']);
    await page.click('#comms-start');
    await page.waitForTimeout(350);
    await page.click('#about-close');
    await page.evaluate(async () => {
      const db = await new Promise((res) => { const r = indexedDB.open('quietkeep'); r.onsuccess = () => res(r.result); });
      const all = await new Promise((res) => {
        const tx = db.transaction('events', 'readonly').objectStore('events').getAll();
        tx.onsuccess = () => res(tx.result);
      });
      const created = all.find(e => e.kind === 'node.field.set' && e.payload?.field === 'comms-sweep');
      if (!created) return;
      const older = new Date(Date.now() - 6 * 86400000).toISOString();
      const store = db.transaction('events', 'readwrite').objectStore('events');
      for (const e of all) if (e.kind === 'done.marked' && e.node === created.node) store.delete(e.id);
      store.add({ id: 'a11y-comms', vault: created.vault, at: older, device: 'a11y', seq: 900001,
        kind: 'done.marked', node: created.node, payload: { at: older } });
      await new Promise((res) => { store.transaction.oncomplete = res; });
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('body[data-ready=true]');
    await page.locator('#cards .card-focus').first().click();
    await page.waitForSelector('#focus:not([hidden])');
    await page.click('#focus-stop');
    await page.waitForSelector('#focus-sheet[open]');
    await page.click('#focus-sheet-stop');
    await page.waitForSelector('#comms:not([hidden])');
    await auditContrast(page, 'comms ramp', theme);
    await auditAxe(page, 'comms ramp', theme);
    await auditTargets(page, 'comms ramp', theme);
    await auditFocusRings(page, 'comms ramp', theme, ['#comms-done', '#comms-later']);
    await page.click('#comms-later');
    await page.waitForTimeout(250);

    // State 3f0: carrying. Reached the way a person reaches it — make a container,
    // then say somebody else is doing it.
    await page.click('#cards .card-open');
    await page.waitForSelector('#detail[open]');
    await page.click('#detail-make-project');
    await page.waitForTimeout(250);
    await page.click('#detail-track');
    await page.waitForTimeout(250);
    const owedBy = await page.evaluate(() =>
      new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
    await page.fill('#detail-suspense', owedBy);
    await page.click('#detail-suspense-set');
    await page.waitForTimeout(250);
    await auditContrast(page, 'detail sheet, carried', theme);
    await auditAxe(page, 'detail sheet, carried', theme);
    await auditTargets(page, 'detail sheet, carried', theme);
    await auditFocusRings(page, 'detail sheet, carried', theme,
      ['#detail-suspense', '#detail-suspense-set']);
    await page.click('#detail-close');
    await page.waitForSelector('#portfolio:not([hidden])');
    await auditContrast(page, 'portfolio', theme);
    await auditAxe(page, 'portfolio', theme);
    await auditTargets(page, 'portfolio', theme);
    await auditFocusRings(page, 'portfolio', theme, ['.portfolio-open']);

    // State 3f1: the person lens. Reached the way a person reaches it — route
    // something to "Waiting for", which is the only way to be owed anything.
    await page.fill('#capture', 'the signed form');
    await page.click('#capture-form button[type=submit]');
    await page.waitForSelector('#triage:not([hidden]) .route');
    for (let i = 0; i < 12; i++) {
      if (await page.locator('#triage-actions .route .route-hint').count() > 0) break;
      await page.click('#triage-actions .route');
      await page.waitForTimeout(120);
    }
    await page.locator('#triage-actions .route', { hasText: 'Waiting for' }).first().click();
    await page.waitForTimeout(300);
    await page.waitForSelector('#people:not([hidden])');
    await auditContrast(page, 'people', theme);
    await auditAxe(page, 'people', theme);
    await auditTargets(page, 'people', theme);
    await auditFocusRings(page, 'people', theme, ['.people-open']);

    // And the sheet's write side, with a name actually attached — the state in
    // which the linked-people list renders at all.
    await page.locator('.people-open').first().click();
    await page.waitForSelector('#detail[open]');
    await page.fill('#detail-person', 'Sam');
    await page.click('#detail-person-set');
    await page.waitForTimeout(300);
    await auditContrast(page, 'detail sheet, with someone', theme);
    await auditAxe(page, 'detail sheet, with someone', theme);
    await auditTargets(page, 'detail sheet, with someone', theme);
    await auditFocusRings(page, 'detail sheet, with someone', theme,
      ['#detail-person', '#detail-relation', '#detail-person-set']);
    await page.click('#detail-close');

    // State 3f2: focus. Reached the way a person reaches it — the control on the
    // row — and audited in all three of its states, including the sheet where
    // the optional five words are asked for.
    await page.locator('#cards .card-focus').first().click();
    await page.waitForSelector('#focus:not([hidden])');
    await auditContrast(page, 'focus', theme);
    await auditAxe(page, 'focus', theme);
    await auditTargets(page, 'focus', theme);
    await auditFocusRings(page, 'focus', theme,
      ['#focus-interrupt', '#focus-done', '#focus-stop']);

    await page.fill('#focus-interrupt', 'the phone rang');
    await page.click('#focus-interrupt-form button[type=submit]');
    await page.waitForSelector('#focus-held:not([hidden])');
    await auditContrast(page, 'focus, interrupted', theme);
    await auditAxe(page, 'focus, interrupted', theme);

    await page.click('#focus-stop');
    await page.waitForSelector('#focus-sheet[open]');
    await auditContrast(page, 'focus sheet', theme);
    await auditAxe(page, 'focus sheet', theme);
    await auditTargets(page, 'focus sheet', theme);
    await auditFocusRings(page, 'focus sheet', theme,
      ['#focus-cue', '#focus-sheet-stop', '#focus-sheet-cancel']);
    // B-04's hardest case for a sheet carrying a free-text box.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const focusSheetOverflow = await page.evaluate(() => {
      const d = document.querySelector('#focus-sheet');
      return d.scrollWidth - d.clientWidth;
    });
    (focusSheetOverflow <= 1 ? pass : fail)(
      `${theme}/320px @ 200%: focus sheet horizontal overflow ${focusSheetOverflow}px (must be ≤1)`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.click('#focus-sheet-cancel');
    await page.click('#focus-stop');
    await page.waitForSelector('#focus-sheet[open]');
    await page.click('#focus-sheet-stop');
    await page.waitForTimeout(350);

    // The session close (1.6.0, ADR-0052): stopping raised the strip — the
    // words ARE the surface, so they are measured, then the ramp is lowered
    // so later states see the page as any other act would leave it.
    await page.waitForSelector('#close:not([hidden])');
    await auditContrast(page, 'close strip', theme);
    await auditAxe(page, 'close strip', theme);
    await auditTargets(page, 'close strip', theme);
    await auditFocusRings(page, 'close strip', theme, ['#close-ok']);
    await page.click('#close-ok');
    await page.waitForSelector('#close', { state: 'hidden' });

    // State 3g: containment and Review (law 4). A container with nothing under
    // it is the app's quietest failure — it reads as an ordinary row everywhere
    // else — so the surface that finally says so must be as calm as the rest of
    // the app. There is no alert colour here to measure, and that absence is the
    // measurement.
    // A SECOND item, because containment needs two things: one to hold, one to
    // be held. The walk had exactly one card, so `.nth(1)` waited thirty seconds
    // for something that was never going to exist.
    await page.fill('#capture', 'a bigger piece of work');
    await page.click('#capture-form button[type=submit]');
    await page.waitForSelector('#triage:not([hidden]) .route');
    for (let i = 0; i < 12; i++) {
      if (await page.locator('#triage-actions .route .route-hint').count() > 0) break;
      await page.click('#triage-actions .route');       // Hot — advances to clarify
      await page.waitForTimeout(120);
    }
    await page.locator('#triage-actions .route', { hasText: 'Next action' }).first().click();
    await page.waitForTimeout(250);

    await page.click('#cards .card-open');
    await page.waitForSelector('#detail[open]');
    await page.click('#detail-make-project');
    await page.waitForTimeout(250);
    await page.click('#detail-close');
    await page.waitForSelector('#review:not([hidden])');
    await auditContrast(page, 'review', theme);
    await auditAxe(page, 'review', theme);
    await auditTargets(page, 'review', theme);
    await auditFocusRings(page, 'review', theme, ['.review-open']);

    // And the sheet once something IS inside something — the only state in which
    // `#detail-place` renders at all. Left out, the one line that states a
    // structural fact would go permanently unmeasured, which is exactly the hole
    // an audit found behind `.replan-context`.
    // The SECOND card. The first is the container just made, and a container's
    // own picker excludes itself — so reusing it audited an empty picker and
    // reported the state as unauditable, which is the guard below working.
    await page.locator('#cards .card-open').nth(1).click();
    await page.waitForSelector('#detail[open]');
    const canParent = await page.locator('#detail-parent option').count();
    if (canParent > 1) {
      await page.selectOption('#detail-parent', { index: 1 });
      await page.click('#detail-parent-set');
      await page.waitForTimeout(250);
      await page.waitForSelector('#detail-place:not([hidden])');
      await auditContrast(page, 'detail sheet, inside something', theme);
      await auditAxe(page, 'detail sheet, inside something', theme);
      await auditTargets(page, 'detail sheet, inside something', theme);
    } else {
      fail(`${theme}: nothing could be put under anything — the containment state went unaudited`);
    }

    // The create-in-place offer (1.3.0): typing words that name no existing
    // container reveals the button that makes the project and files this under
    // it. A control someone meets mid-filing is still a control.
    await page.fill('#detail-parent-filter', 'A place that does not exist yet');
    await page.waitForSelector('#detail-parent-create:not([hidden])');
    await auditContrast(page, 'detail sheet, creating a place', theme);
    await auditAxe(page, 'detail sheet, creating a place', theme);
    await auditTargets(page, 'detail sheet, creating a place', theme);
    await auditFocusRings(page, 'detail sheet, creating a place', theme, ['#detail-parent-create']);
    await page.fill('#detail-parent-filter', '');
    await page.click('#detail-close');

    // Sort mode (1.3.0): the picker over a named range, then the conveyor. The
    // container parented above guarantees an "Everything under…" choice exists,
    // so neither state can silently audit an empty surface.
    // Stage a real range first: the store at this point holds containers whose
    // only children are resume cards — which the kind filter rightly excludes —
    // so the picker would honestly offer nothing, and both sort states would
    // wait forever. Capture a sortable item, route it, and FILE it under a
    // container through search + the sheet (deterministic — no guessing which
    // list row is which).
    await page.fill('#capture', 'a sortable thing under something');
    await page.click('#capture-form button[type=submit]');
    await page.waitForSelector('#triage:not([hidden]) .route');
    // Drive heat -> clarify -> route with IN-PAGE clicks under a polling wait.
    // Locator clicks lost a race on the 2-core CI runner: every queued commit
    // repaints the action row, the button detached mid-click, and the
    // stability retry loop ran out its 30s (Spine run 161). An in-page click
    // acts on whatever exists at that instant and the poll simply tries again
    // after the next repaint.
    await page.waitForFunction(() => {
      const byText = (t) => [...document.querySelectorAll('#triage-actions .route')]
        .find(b => (b.textContent || '').includes(t));
      const next = byText('Next action');
      if (next) { next.click(); return true; }
      byText('Hot')?.click();
      return false;
    }, null, { timeout: 20000, polling: 300 });
    await page.waitForTimeout(400);
    await fillSearch('sortable thing');
    await page.waitForSelector('#search-results .search-open');
    await page.click('#search-results .search-open');
    await page.waitForSelector('#detail[open]');
    await page.selectOption('#detail-parent', { index: 1 });
    await page.click('#detail-parent-set');
    await page.waitForTimeout(250);
    await page.click('#detail-close');
    await fillSearch('');

    await page.click('#sort-open');
    await page.waitForSelector('#sort[open]');
    await page.waitForSelector('.sort-choice');
    await auditContrast(page, 'sort picker', theme);
    await auditAxe(page, 'sort picker', theme);
    await auditTargets(page, 'sort picker', theme);
    await auditFocusRings(page, 'sort picker', theme, ['.sort-choice', '#sort-query']);
    await page.locator('.sort-choice').first().click();
    await page.waitForSelector('#sort-card-region:not([hidden])');
    await auditContrast(page, 'sort card', theme);
    await auditAxe(page, 'sort card', theme);
    await auditTargets(page, 'sort card', theme);
    await auditFocusRings(page, 'sort card', theme, ['#sort-card', '#sort-actions .route']);

    // Wholesale (1.5.0): open the block, audit the verbs, then reveal the
    // destructive confirm the way purge's is revealed — a control that only
    // exists after a click is still a control. In-page clicks throughout, for
    // the same repaint-race reason as triage.
    await page.click('#sort-act-all');
    await page.waitForSelector('#sort-bulk:not([hidden])');
    await page.waitForSelector('#sort-bulk-verbs .route');
    await auditContrast(page, 'sort bulk verbs', theme);
    await auditAxe(page, 'sort bulk verbs', theme);
    await auditTargets(page, 'sort bulk verbs', theme);
    await auditFocusRings(page, 'sort bulk verbs', theme, ['#sort-bulk-verbs .route', '#sort-bulk-export']);
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('#sort-bulk-verbs .route')]
        .find(x => (x.textContent || '').includes('Let them go'));
      if (b) { b.click(); return true; }
      return false;
    }, null, { timeout: 10000, polling: 200 });
    await page.waitForSelector('#sort-bulk-confirm:not([hidden])');
    await auditContrast(page, 'sort bulk confirm', theme);
    await auditAxe(page, 'sort bulk confirm', theme);
    await auditTargets(page, 'sort bulk confirm', theme);
    await auditFocusRings(page, 'sort bulk confirm', theme, ['#sort-bulk-word']);
    await page.click('#sort-bulk-cancel');
    await page.waitForSelector('#sort-bulk', { state: 'hidden' });

    // A route removes the control it was on; focus must land somewhere REAL
    // (WCAG 2.4.3) — the entry line mid-range, the back button on completion —
    // never fall to <body>, in the mode built for a thousand consecutive
    // actions (audit). In-page click for the same repaint-race reason as triage.
    await page.waitForFunction(() => {
      const b = [...document.querySelectorAll('#sort-actions .route')]
        .find(x => (x.textContent || '').includes('Next action'));
      if (b) { b.click(); return true; }
      return false;
    }, null, { timeout: 10000, polling: 200 });
    const sortFocusOk = await page.waitForFunction(
      () => ['sort-entry', 'sort-back'].includes(document.activeElement?.id ?? ''),
      null, { timeout: 5000 },
    ).then(() => true).catch(() => false);
    if (!sortFocusOk) {
      const where = await page.evaluate(() =>
        document.activeElement?.id || document.activeElement?.tagName || '(none)');
      fail(`${theme}: after a sort route, focus landed on "${where}" instead of the entry line or back control`);
    }
    await page.click('#sort-close');

    // The tree, open (1.6.0, ADR-0013): the sort staging filed things under a
    // real container, so the rows measured are real ones. On request only.
    await page.click('#tree-open');
    await page.waitForSelector('#tree:not([hidden])');
    await page.waitForSelector('.tree-open-row');
    await auditContrast(page, 'tree open', theme);
    await auditAxe(page, 'tree open', theme);
    await auditTargets(page, 'tree open', theme);
    await auditFocusRings(page, 'tree open', theme, ['.tree-open-row', '#tree-open']);
    await page.click('#tree-open');
    await page.waitForSelector('#tree', { state: 'hidden' });

    // The lens (1.7.0, ADR-0054): containers exist by now, so the row is
    // offered. Audited ACTIVE — the law-1 line renders only while a lens is
    // chosen — then reset to everything so later states see the whole list.
    await page.waitForSelector('#lens-row:not([hidden])');
    await page.selectOption('#lens', { index: 1 });
    await page.waitForSelector('#lens-note:not([hidden])');
    await auditContrast(page, 'lens row', theme);
    await auditAxe(page, 'lens row', theme);
    await auditTargets(page, 'lens row', theme);
    await auditFocusRings(page, 'lens row', theme, ['#lens']);
    await page.selectOption('#lens', { index: 0 });
    await page.waitForSelector('#lens-note', { state: 'hidden' });

    // Composed Today (1.6.0, ADR-0051): audit the opt-in Extra OFF (its resting
    // state), turn it on, choose one staged thing from its sheet, audit the
    // strip, then turn it off again so every later state is unchanged.
    await page.click('#open-about');
    await page.waitForSelector('#today-start:not([hidden])');
    await auditContrast(page, 'today opt-in', theme);
    await auditTargets(page, 'today opt-in', theme);
    await auditFocusRings(page, 'today opt-in', theme, ['#today-start']);
    await page.click('#today-start');
    await page.waitForFunction(() => /^On\./.test(
      document.querySelector('#today-note')?.textContent ?? ''));
    await page.click('#about-close');
    await fillSearch('sortable thing');
    await page.waitForSelector('#search-results .search-open');
    await page.click('#search-results .search-open');
    await page.waitForSelector('#detail[open]');
    await page.waitForSelector('#detail-today-add:not([hidden])');
    await page.click('#detail-today-add');
    await page.waitForFunction(() => /Chosen for today/.test(
      document.querySelector('#detail-live')?.textContent ?? ''));
    await page.click('#detail-close');
    await fillSearch('');
    await page.waitForSelector('#composed:not([hidden])');
    await auditContrast(page, 'composed strip', theme);
    await auditAxe(page, 'composed strip', theme);
    await auditTargets(page, 'composed strip', theme);
    await auditFocusRings(page, 'composed strip', theme, ['.composed-open']);
    await page.click('#open-about');
    await page.waitForSelector('#about[open]');
    await page.click('#today-stop');
    await page.waitForFunction(() => /^Off\./.test(
      document.querySelector('#today-note')?.textContent ?? ''));
    await page.click('#about-close');

    // Stage a trashed thing for the trash view (1.5.0): capture, find it,
    // let it go through its own sheet — the app's real path, no seeding.
    await page.fill('#capture', 'a thing let go');
    await page.click('#capture-form button[type=submit]');
    await fillSearch('thing let go');
    await page.waitForSelector('#search-results .search-open');
    await page.click('#search-results .search-open');
    await page.waitForSelector('#detail[open]');
    await page.click('#detail-trash');
    await page.waitForSelector('#detail-untrash:not([hidden])');
    await page.click('#detail-close');
    await fillSearch('');

    // Folding a duplicate (1.7.0, ADR-0053): two captures of the same errand,
    // so the filter isolates the twin and every state below is deterministic.
    // Fold one in, audit the way back, then the survivor's list, then split it
    // back out so later states see the store holding what it held.
    await page.fill('#capture', 'the same errand twice');
    await page.click('#capture-form button[type=submit]');
    await page.waitForFunction(() => (document.querySelector('#capture')?.value ?? 'x') === '');
    await page.fill('#capture', 'The same errand TWICE');
    await page.click('#capture-form button[type=submit]');
    await page.waitForFunction(() => (document.querySelector('#capture')?.value ?? 'x') === '');
    await fillSearch('same errand');
    await page.waitForSelector('#search-results .search-open');
    await page.locator('#search-results .search-open', { hasText: /the same errand twice/ }).click();
    await page.waitForSelector('#detail[open]');
    // The search box is cleared AFTER the sheet closes, not here — a fill
    // cannot reach an element the modal has made inert.
    await page.fill('#detail-merge-filter', 'same errand');
    await page.waitForFunction(() => document.querySelectorAll('#detail-merge option').length === 2);
    await auditContrast(page, 'detail sheet, folding', theme);
    await auditAxe(page, 'detail sheet, folding', theme);
    await auditTargets(page, 'detail sheet, folding', theme);
    await auditFocusRings(page, 'detail sheet, folding', theme, ['#detail-merge', '#detail-merge-set']);
    await page.selectOption('#detail-merge', { index: 1 });
    await page.click('#detail-merge-set');
    await page.waitForSelector('#detail-unmerge-group:not([hidden])');
    await auditContrast(page, 'detail sheet, folded away', theme);
    await auditAxe(page, 'detail sheet, folded away', theme);
    await auditTargets(page, 'detail sheet, folded away', theme);
    await auditFocusRings(page, 'detail sheet, folded away', theme, ['#detail-unmerge']);
    await page.click('#detail-close');
    await fillSearch('same errand');
    await page.waitForSelector('#search-results .search-open');
    await page.click('#search-results .search-open');   // the merged one is off search
    await page.waitForSelector('#detail[open]');
    await page.waitForSelector('#detail-merged-group:not([hidden])');
    await auditContrast(page, 'detail sheet, survivor', theme);
    await auditAxe(page, 'detail sheet, survivor', theme);
    await auditTargets(page, 'detail sheet, survivor', theme);
    await auditFocusRings(page, 'detail sheet, survivor', theme, ['#detail-merged-list button']);
    await page.locator('#detail-merged-list button').first().click();
    await page.waitForSelector('#detail-merged-group[hidden]', { state: 'attached' });
    await page.click('#detail-close');
    await fillSearch('');              // now the modal is gone, the box clears

    // State 4: the dialog as every RETURN visit sees it — the state real users
    // live in, which the first gate structurally could not audit.
    await page.click('#open-about');
    await page.waitForSelector('#storage-body dt');
    await page.click('#purge-pick-clear');
    await page.waitForSelector('#purge-confirm:not([hidden])');
    await auditContrast(page, 'dialog, return visit', theme);
    await auditAxe(page, 'dialog, return visit', theme);
    await auditTargets(page, 'dialog, return visit', theme);
    await auditFocusRings(page, 'dialog, return visit', theme, ['#about-close', '#export', '#calendar', '#sample', '#purge-pick-clear', '#badge-toggle']);

    // The record itself, open (1.4.0, ADR-0048). The store holds a real
    // history by this point in the walk, so days, lines, and the total all
    // have something to render. Collapsed again after, so the 320px dialog
    // overflow check below measures the panel as a return visit sees it.
    await page.click('#log-open');
    await page.waitForSelector('#log-view:not([hidden])');
    await page.waitForFunction(() =>
      document.querySelectorAll('#log-days .log-line').length > 0);
    await auditContrast(page, 'log view', theme);
    await auditAxe(page, 'log view', theme);
    await auditTargets(page, 'log view', theme);
    await auditFocusRings(page, 'log view', theme, ['#log-open']);
    await page.click('#log-open');
    await page.waitForSelector('#log-view', { state: 'hidden' });

    // Things you let go, open (1.5.0, ADR-0050) — staged just above, so the
    // one-verb row has something real to be. Collapsed after, like the record.
    await page.click('#trash-open');
    await page.waitForSelector('#trash-view:not([hidden])');
    await page.waitForSelector('.trash-row');
    await auditContrast(page, 'trash view', theme);
    await auditAxe(page, 'trash view', theme);
    await auditTargets(page, 'trash view', theme);
    await auditFocusRings(page, 'trash view', theme, ['.trash-row']);
    await page.click('#trash-open');
    await page.waitForSelector('#trash-view', { state: 'hidden' });

    // Today on paper, in the same panel.
    await auditContrast(page, 'today on paper', theme);
    await auditTargets(page, 'today on paper', theme);
    await auditFocusRings(page, 'today on paper', theme, ['#today-print']);

    // The report controls, in the panel that is already open.
    await auditContrast(page, 'report controls', theme);
    await auditTargets(page, 'report controls', theme);
    await auditFocusRings(page, 'report controls', theme,
      ['#report-copy', '#report-markdown', '#report-csv', '#report-print']);

    // The import surface with a file chosen — the state that carries the
    // destructive control. An empty log is a perfectly valid export (a new user
    // who exports immediately has one), so it is the smallest file that reaches
    // this state honestly, without faking the app's own output.
    // Written OUTSIDE the repo. A fixture inside the tree survives a failed run
    // and can be swept into a commit by a wholesale `git add` — which has
    // happened in this repo once already, and is in the hub's LESSONS.
    const validExport = join(tmpdir(), 'quietkeep-a11y-import-fixture.json');
    writeFileSync(validExport, JSON.stringify({
      format: 'planner-log', version: 1, at: new Date().toISOString(),
      scope: 'all', encrypted: false, logJsonl: '', snapshot: null,
    }));
    await page.setInputFiles('#import-file', validExport);
    await page.waitForSelector('#import-actions:not([hidden])');
    await auditContrast(page, 'import, file chosen', theme);
    await auditAxe(page, 'import, file chosen', theme);
    await auditTargets(page, 'import, file chosen', theme);
    await auditFocusRings(page, 'import, file chosen', theme, ['#import-file', '#import-union', '#import-backup', '#import-go']);
    rmSync(validExport, { force: true });

    // State 5: B-04's hardest case — 320px at 200% text — WITH the dialog
    // open. The dialog is its own scroll container, so page-level overflow
    // stays 0 while content escapes sideways inside it; both get checked.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const dlgOverflow = await page.evaluate(() => {
      const d = document.querySelector('#about');
      return d.scrollWidth - d.clientWidth;
    });
    (dlgOverflow <= 1 ? pass : fail)(
      `${theme}/320px @ 200%: dialog horizontal overflow ${dlgOverflow}px (must be ≤1)`);
    await auditContrast(page, 'dialog @ 320/200', theme, 'dialog, return visit');
    await auditAxe(page, 'dialog @ 320/200', theme);
    await page.click('#about-close');

    // NAMES the offender. "42px of overflow" told us the page was broken and
    // nothing about where, so finding it meant writing a throwaway probe by
    // hand — twice. The widest element past the right edge is almost always the
    // cause, and the gate already has the DOM in front of it.
    const over = await page.evaluate(() => {
      const doc = document.scrollingElement;
      const px = doc.scrollWidth - doc.clientWidth;
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right > doc.clientWidth + 1) {
          out.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` +
            `${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}` +
            ` (right ${Math.round(r.right)}px)`);
        }
      }
      return { px, culprits: out.slice(0, 4) };
    });
    (over.px <= 1 ? pass : fail)(
      `${theme}/320px @ 200%: page horizontal overflow ${over.px}px (must be ≤1)` +
      (over.culprits.length ? ` — past the edge: ${over.culprits.join(', ')}` : ''));
    const cap = await page.evaluate(() => {
      const r = document.querySelector('#capture').getBoundingClientRect();
      return { h: Math.round(r.height), w: Math.round(r.width) };
    });
    (cap.h >= 44 && cap.w >= 100 ? pass : fail)(
      `${theme}/320px @ 200%: capture is ${cap.w}x${cap.h} — still a usable target`);
    await auditAxe(page, 'page @ 320/200', theme);

    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log('');
if (failures.length) {
  console.error(`${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log('The rendered app passes: both themes, every state, stressed viewport, rings and placeholder measured.');
