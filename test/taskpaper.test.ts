// Bringing work in from another planner (a requirement: import an OmniFocus
// export and really test at scale?").
//
// The tests that carry weight:
//
// **Hierarchy survives.** Containment is the shape a flat list cannot express and
// the main reason importing at scale is worth doing — if nesting collapses, the
// import produced a pile and proved nothing.
//
// **Every event passes the real `admit`.** Thousands of rows from somebody else's
// planner is the largest untrusted input this app will ever take, and it must go
// through the same door as a keystroke.
//
// **Dates land on the day they displayed in the other app**, in both hemispheres.
//
// **Nothing is silently discarded.** A tag that does not come across is reported.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  depthOf, importSummary, importWords, isCalendarDay, parseAnyExport, parseCsv,
  parseOmniFocusCsv, parseTaskPaper, taskPaperEvents, isPastDay, type ImportContext,
} from '../src/taskpaper.ts';
import { admit, gateOptionsFor, heldNodes, silentNodes } from '../src/gate.ts';
import { fold, noteOf } from '../src/fold.ts';
import { localDayKey } from '../src/time.ts';
import { calendarCount } from '../src/ics.ts';
import { replanAll } from '../src/replan.ts';

const DENVER = 'America/Denver';
const KIRITIMATI = 'Pacific/Kiritimati';
const NOW = '2026-07-29T18:00:00.000Z';

function ctxFor(zone = DENVER): ImportContext {
  let n = 0;
  return { at: NOW, device: 'imp', vault: 'personal', zone, seq: () => n, id: () => `i${n++}` };
}

const build = (text: string, zone = DENVER) => {
  const { lines, unreadable } = parseAnyExport(text);
  const offered = taskPaperEvents(ctxFor(zone), lines);
  const admitted = admit(offered, fold([]), gateOptionsFor(zone));
  return { lines, unreadable, offered, admitted, state: fold(admitted) };
};

const SAMPLE = `Kitchen refit:
\t- Ring the plumber @due(2026-08-05)
\t- Measure the gap @defer(2026-08-01)
\tSome note about the taps
Paperwork:
\t- Compare renewals @due(2026-08-12) @flagged
\t- Old thing @done
- A loose action @due(2026-08-03)
`;

// --- THE ONE THAT MATTERS ---------------------------------------------------

test('THE ONE THAT MATTERS: nesting survives, so containment actually arrives', () => {
  const { state } = build(SAMPLE);
  const held = heldNodes(state);
  const kitchen = held.find(n => n.title === 'Kitchen refit');
  const plumber = held.find(n => n.title === 'Ring the plumber');
  assert.ok(kitchen, 'the project exists');
  assert.equal(kitchen.kind, 'project');
  assert.ok(plumber, 'the action exists');
  assert.equal(plumber.parent, kitchen.id, 'and it sits UNDER the project');

  const paperwork = held.find(n => n.title === 'Paperwork');
  const renewals = held.find(n => n.title === 'Compare renewals');
  assert.equal(renewals?.parent, paperwork?.id, 'a second project keeps its own children');
  assert.notEqual(paperwork?.id, kitchen.id);

  const loose = held.find(n => n.title === 'A loose action');
  assert.equal(loose?.parent, null, 'and a top-level action has no invented parent');
});

test('and every imported event passes the real write boundary', () => {
  const { offered, admitted, state } = build(SAMPLE);
  for (const e of offered) {
    assert.ok(admitted.some(a => a.id === e.id), `${e.kind} was refused`);
  }
  assert.deepEqual(silentNodes(state).map(n => n.title), [],
    'and nothing arrived silent');
});

test('at scale: two thousand rows parse, map and admit', () => {
  // "Really test at scale" was the ask. This is the largest untrusted input the app
  // will ever take, and the interesting failure is not slowness — it is a gate cure
  // storm, or a parent map that quietly stops resolving past some depth.
  const lines: string[] = [];
  for (let p = 0; p < 100; p++) {
    lines.push(`Project ${p}:`);
    for (let a = 0; a < 19; a++) {
      lines.push(`\t- Action ${p}.${a}${a % 3 === 0 ? ' @due(2026-09-01)' : ''}`);
    }
  }
  const { lines: parsed, state } = build(lines.join('\n'));
  assert.equal(parsed.length, 100 * 20, 'every row was read');
  const held = heldNodes(state);
  assert.equal(held.length, 100 * 20, 'and every row landed');
  assert.deepEqual(silentNodes(state), [], 'with nothing silent');
  // Parents resolved for all of them, not just the early ones.
  const projects = new Set(held.filter(n => n.kind === 'project').map(n => n.id));
  const parented = held.filter(n => n.parent !== null && projects.has(n.parent));
  assert.equal(parented.length, 100 * 19, 'every action found its own project');
});

// --- dates ------------------------------------------------------------------

test('a due date lands on the day it displayed in the other planner', () => {
  const { state } = build('- Ring the plumber @due(2026-08-05)\n');
  const n = heldNodes(state)[0]!;
  assert.ok(n.clocks.due, 'it has a due clock');
  assert.equal(localDayKey(n.clocks.due.at, DENVER), '2026-08-05');
});

test('and on the other side of the world, the same day', () => {
  // UTC+14. A date that shifts by a day on import is the worst kind of wrong: it
  // looks right, and it is wrong for everybody east or west of whoever tested it.
  const { state } = build('- Ring the plumber @due(2026-08-05)\n', KIRITIMATI);
  const n = heldNodes(state)[0]!;
  assert.equal(localDayKey(n.clocks.due!.at, KIRITIMATI), '2026-08-05');
});

test('an imported date is a date somebody CHOSE, so a calendar may carry it', () => {
  // The point of importing at scale is partly to have real dates to test the
  // calendar with — and `due` is the kind that survives `CALENDAR_KINDS`.
  const { state } = build('- Ring the plumber @due(2026-08-05)\n');
  assert.equal(calendarCount(state, NOW, DENVER), 1);
});

test('a defer date becomes a start clock, not a due date', () => {
  const { state } = build('- Measure the gap @defer(2026-08-01)\n');
  const n = heldNodes(state)[0]!;
  assert.ok(n.clocks.start, 'start');
  assert.equal(n.clocks.due, undefined, 'and not a deadline nobody set');
});

test('a date that is not a date is refused rather than invented', () => {
  assert.equal(isCalendarDay('2026-02-31'), false, 'February has no 31st');
  assert.equal(isCalendarDay('2026-13-01'), false);
  assert.equal(isCalendarDay('not a date'), false);
  assert.equal(isCalendarDay('2026-08-05'), true);
  const { lines } = parseTaskPaper('- Thing @due(2026-02-31)\n');
  assert.equal(lines[0]!.due, null, 'no clock invented from nonsense');
  assert.ok(lines[0]!.dropped.includes('due'), 'and it says the date did not come across');
});

test('a date with a time keeps the day and drops the hour', () => {
  for (const form of ['2026-08-05 17:00', '2026-08-05T17:00:00']) {
    assert.equal(parseTaskPaper(`- Thing @due(${form})\n`).lines[0]!.due, '2026-08-05', form);
  }
});

// --- what does not come across, and says so ---------------------------------

test('a flag is dropped ON PURPOSE, and reported rather than swallowed', () => {
  // This app has no priority field: pressure comes from the decay primitive, never
  // from a star set in a better mood. Recording a flag as a fake clock would invent
  // a demand nobody made — but discarding it silently would be a different lie.
  const { lines } = parseTaskPaper('- Thing @flagged @estimate(20m) @context(Office)\n');
  assert.deepEqual(lines[0]!.dropped.sort(), ['context', 'estimate', 'flagged']);
  const words = importWords(importSummary(lines, []));
  assert.match(words, /will not come with them/);
  for (const t of ['flagged', 'estimate', 'context']) assert.ok(words.includes(t), t);
});

test('a line that is only tags is reported, not turned into "(untitled)"', () => {
  const { lines, unreadable } = parseTaskPaper('- @flagged\n- Real thing\n');
  assert.equal(lines.length, 1);
  assert.equal(lines[0]!.title, 'Real thing');
  assert.equal(unreadable.length, 1, 'and the odd line is kept so somebody can look');
});

test('notes do not become tasks', () => {
  const { lines } = parseTaskPaper('Project:\n\t- Do it\n\tjust a note\n');
  assert.equal(lines.filter(l => l.kind === 'note').length, 1);
  const { state } = build('Project:\n\t- Do it\n\tjust a note\n');
  assert.equal(heldNodes(state).some(n => n.title === 'just a note'), false);
});

// --- the shapes of the format ------------------------------------------------

test('a project line ending in a colon is a project even with tags after it', () => {
  // Stripping tags first made "Ship it: @due(...)" look like an action, which
  // silently flattened a whole subtree under the wrong thing.
  const { lines } = parseTaskPaper('Ship it: @due(2026-08-05)\n\t- A step\n');
  assert.equal(lines[0]!.kind, 'project');
  assert.equal(lines[0]!.due, '2026-08-05');
  assert.equal(lines[1]!.kind, 'action');
});

test('tabs and two-space indents both count, including mixed', () => {
  // OmniFocus writes spaces when the preference says spaces, and mixed files exist.
  // Counting only tabs flattens an entire tree without any error at all.
  assert.equal(depthOf('\t\t- x'), 2);
  assert.equal(depthOf('    - x'), 2);
  assert.equal(depthOf('\t  - x'), 2);
  assert.equal(depthOf('- x'), 0);
  const { state } = build('Top:\n  - Spaced child\n');
  const child = heldNodes(state).find(n => n.title === 'Spaced child');
  assert.equal(child?.parent, heldNodes(state).find(n => n.title === 'Top')?.id);
});

test('a deeper level attaches to the nearest container above it, not to a sibling', () => {
  const { state } = build('A:\n\t- one\nB:\n\t- two\n');
  const held = heldNodes(state);
  assert.equal(held.find(n => n.title === 'two')?.parent,
    held.find(n => n.title === 'B')?.id, 'B replaced A at that depth');
});

// --- CSV --------------------------------------------------------------------

test('a quoted CSV field with commas and newlines survives', () => {
  // A naive split mangles every note containing a comma, which is most of them.
  const rows = parseCsv('Name,Notes\n"Ring, then email","line one\nline two"\n');
  assert.deepEqual(rows[1], ['Ring, then email', 'line one\nline two']);
});

test('doubled quotes inside a quoted field are one quote', () => {
  assert.deepEqual(parseCsv('Name\n"He said ""no"""\n')[1], ['He said "no"']);
});

test('CSV columns are found by NAME, so a reordered export still works', () => {
  // A positional reader breaks on the next OmniFocus update, silently, by reading
  // dates out of the notes column.
  const a = 'Type,Name,Project,Due Date\ntask,Ring the plumber,Kitchen,2026-08-05\n';
  const b = 'Due Date,Project,Name,Type\n2026-08-05,Kitchen,Ring the plumber,task\n';
  const one = parseOmniFocusCsv(a).lines[0]!;
  const two = parseOmniFocusCsv(b).lines[0]!;
  assert.deepEqual({ ...one }, { ...two });
  assert.equal(one.title, 'Ring the plumber');
  assert.equal(one.due, '2026-08-05');
  assert.equal(one.parentName, 'Kitchen');
});

test('a CSV project named by a child but never listed is created, not dropped', () => {
  // The alternative is silently reparenting somebody's task to nothing — an import
  // that loses structure without losing rows, which nobody notices.
  const { state } = build('Type,Name,Project\ntask,Ring the plumber,Kitchen\n');
  const held = heldNodes(state);
  const kitchen = held.find(n => n.title === 'Kitchen');
  assert.ok(kitchen, 'the project was created for it');
  assert.equal(kitchen.kind, 'project');
  assert.equal(held.find(n => n.title === 'Ring the plumber')?.parent, kitchen.id);
});

test('a CSV project listed AFTER its children is not duplicated', () => {
  const { state } = build(
    'Type,Name,Project\ntask,Ring the plumber,Kitchen\nproject,Kitchen,\ntask,Measure,Kitchen\n');
  const kitchens = heldNodes(state).filter(n => n.title === 'Kitchen');
  assert.equal(kitchens.length, 1, 'one Kitchen, not two');
  assert.equal(heldNodes(state).filter(n => n.parent === kitchens[0]!.id).length, 2);
});

test('a completed CSV row arrives finished', () => {
  const { state } = build('Type,Name,Completion Date\ntask,Old thing,2026-07-01\n');
  assert.ok(heldNodes(state).find(n => n.title === 'Old thing')?.lastDone);
});

test('the format is sniffed from the content, not the filename', () => {
  // A file renamed on the way between two apps is the normal case, and refusing a
  // good file over its extension is the pedantry that makes people give up.
  assert.equal(parseAnyExport('Type,Name\ntask,Thing\n').format, 'csv');
  assert.equal(parseAnyExport('Project:\n\t- Thing\n').format, 'taskpaper');
  // A TaskPaper line containing a comma is still TaskPaper.
  assert.equal(parseAnyExport('- Ring, then email\n').format, 'taskpaper');
});

// --- the summary ------------------------------------------------------------

test('the summary counts the parse, and the words state all three outcomes', () => {
  const { lines, unreadable } = parseTaskPaper(SAMPLE);
  const s = importSummary(lines, unreadable);
  assert.equal(s.projects, 2);
  assert.equal(s.actions, 5);
  assert.equal(s.notes, 1);
  assert.equal(s.done, 1);
  assert.equal(s.withDates, 4);
  const w = importWords(s);
  assert.match(w, /2 projects and 5 actions/);
  assert.match(w, /4 with a date/);
  assert.match(w, /1 already finished/);
});

test('an empty or unreadable file says so and changes nothing', () => {
  assert.match(importWords(importSummary([], [])), /Nothing in that file could be read/);
  assert.match(importWords(importSummary([], [])), /Nothing has been changed/);
  const { offered } = build('\n\n   \n');
  assert.deepEqual(offered, []);
});

test('the words never claim more than the file held', () => {
  const s = importSummary(parseTaskPaper('- One thing\n').lines, []);
  assert.match(importWords(s), /^Found 1 action\.$/);
});

// --- dates that already went by ---------------------------------------------
//
// a real OmniFocus export: 1,173 due dates, EVERY ONE in the past, earliest
// June 2019. Imported as due dates they became 1,173 things needing a new plan on
// the morning of the import — seven years of residue arriving as today's demands.

test('THE ONE FROM THE REAL EXPORT: a date that already went by does not come in as a date', () => {
  const { state, offered } = build('- Download the baseball pictures @due(2019-06-11)\n');
  const n = heldNodes(state)[0]!;
  assert.equal(n.title, 'Download the baseball pictures', 'the work still arrives');
  assert.equal(offered.some(e => e.kind === 'clock.set'), false,
    'and no due clock is manufactured from a date seven years gone');
  // It is still held and still not silent — the gate cures it like anything dateless.
  assert.deepEqual(silentNodes(state), []);
  assert.equal(heldNodes(state).length, 1);
});

test('and it therefore does not arrive demanding a new plan', () => {
  // The whole point. A passed date in another planner is a record of a commitment
  // somebody did not keep, not one they are carrying today.
  const { state } = build('- Old thing @due(2019-06-11)\n');
  assert.equal(replanAll(state, NOW, DENVER).length, 0);
});

test('a date still ahead is untouched', () => {
  const { state } = build('- Ring the plumber @due(2026-08-05)\n');
  assert.ok(heldNodes(state)[0]!.clocks.due, 'a real commitment still arrives as one');
  assert.equal(calendarCount(state, NOW, DENVER), 1);
});

test('today itself still counts as a date, not as residue', () => {
  // The boundary. "Due today" is a live commitment and must not be discarded as
  // though it had gone.
  const today = localDayKey(NOW, DENVER);
  const { state } = build(`- Due today @due(${today})\n`);
  assert.ok(heldNodes(state)[0]!.clocks.due, `${today} is not past`);
});

test('the boundary is the READER\'s day, not UTC\'s', () => {
  // At 18:00Z on the 29th it is still the 29th in Denver and already the 30th in
  // Kiritimati. A row dated the 29th is live for one and residue for the other, and
  // getting that backwards would silently discard a live commitment.
  assert.equal(isPastDay('2026-07-29', NOW, DENVER), false, 'still today in Denver');
  assert.equal(isPastDay('2026-07-29', NOW, KIRITIMATI), true, 'yesterday in Kiritimati');
});

test('the summary says how many dates had gone, and why they did not come', () => {
  const text = '- A @due(2019-06-11)\n- B @due(2020-01-02)\n- C @due(2026-08-05)\n';
  const { lines } = parseAnyExport(text);
  const s = importSummary(lines, [], NOW, DENVER);
  assert.equal(s.staleDates, 2);
  assert.equal(s.withDates, 1, 'and only the live one is counted as having a date');
  const w = importWords(s);
  assert.match(w, /2 dates had already gone by/);
  assert.match(w, /without a date rather than as something asking today/);
});

test('one stale date is described in the singular', () => {
  const { lines } = parseAnyExport('- A @due(2019-06-11)\n');
  assert.match(importWords(importSummary(lines, [], NOW, DENVER)), /One date had already gone by/);
});

test('the summary and the store agree about which dates came across', () => {
  // Two counters for one fact is the shape that has caused more defects here than
  // any other, so they are checked against each other rather than each on its own.
  const text = '- A @due(2019-06-11)\n- B @due(2026-08-05)\n- C @defer(2019-01-01)\n- D\n';
  const { lines } = parseAnyExport(text);
  const s = importSummary(lines, [], NOW, DENVER);
  const events = taskPaperEvents(ctxFor(), lines);
  assert.equal(events.filter(e => e.kind === 'clock.set').length, s.withDates);
  assert.equal(s.staleDates, 2);
});

test('1.4.0: CSV notes are CARRIED — the field event lands on the right row, and the summary says so', () => {
  // History of this exact spot: the first importer read the Notes cell and
  // threw it away with the summary reporting zero (audit); 1.2.3 counted and
  // stated the loss; 1.4.0 carries them. The count is now of notes that ATTACH.
  const csv = [
    'Task ID,Type,Name,Status,Project,Notes',
    '1,Action,call the dentist,,,remember to ask about the crown',
    '2,Action,plain thing,,,',
    '3,Project,Boy Scouts,,,pack meeting is first Tuesdays',
  ].join('\n');
  const { lines, unreadable } = parseAnyExport(csv);
  const s = importSummary(lines, unreadable);
  assert.equal(s.notes, 2, 'both note-bearing rows counted, the empty one not');
  const words = importWords(s);
  assert.match(words, /2 notes come across with their items/);
  assert.doesNotMatch(words, /not carried/, 'the loss sentence is gone because the loss is');

  const events = taskPaperEvents(ctxFor(), lines);
  const noteEvents = events.filter(e => e.kind === 'node.field.set');
  assert.equal(noteEvents.length, 2, 'one field event per note-bearing row');
  const created = new Map(events.filter(e => e.kind === 'node.created')
    .map(e => [(e.payload as { title: string }).title, e.node]));
  const noteOn = (title: string): unknown =>
    (noteEvents.find(e => e.node === created.get(title))?.payload as { value?: unknown } | undefined)?.value;
  assert.equal(noteOn('call the dentist'), 'remember to ask about the crown');
  assert.equal(noteOn('Boy Scouts'), 'pack meeting is first Tuesdays');
  assert.equal(noteOn('plain thing'), undefined, 'no event for the empty cell');
});

test('1.4.0: TaskPaper note lines attach to the item ABOVE them, consecutive lines as ONE note', () => {
  // The association is positional — the only one the format has. Two events on
  // one field would be LWW overwriting itself, so consecutive lines join.
  const text = '- A thing\n  first line of its note\n  second line of it\n- Another thing\n';
  const { lines, unreadable } = parseTaskPaper(text);
  const s = importSummary(lines, unreadable);
  // Corrected 1.17.4 (seam-t1): this asserted `notes === 2` — counting LINES —
  // four lines above its own proof that the mapper writes ONE event. The
  // summary now counts the way the mapper writes.
  assert.equal(s.notes, 1, 'two consecutive lines are ONE joined note');
  assert.match(importWords(s), /One note comes across/);
  const events = taskPaperEvents(ctxFor(), lines);
  const notes = events.filter(e => e.kind === 'node.field.set');
  assert.equal(notes.length, 1, 'consecutive lines are ONE note, one event');
  const a = events.find(e => e.kind === 'node.created'
    && (e.payload as { title: string }).title === 'A thing')!;
  assert.equal(notes[0]!.node, a.node, 'and it landed on the item above');
  assert.equal((notes[0]!.payload as { value: string }).value,
    'first line of its note\nsecond line of it');
});

test('1.4.0: a note line before any item has nothing to belong to — dropped, and NOT counted as carried', () => {
  const { lines, unreadable } = parseTaskPaper('an orphan header note\n- A thing\n  a real note\n');
  const s = importSummary(lines, unreadable);
  assert.equal(s.notes, 1, 'only the attached note counts — counting the orphan would be the old lie inverted');
  const events = taskPaperEvents(ctxFor(), lines);
  assert.equal(events.filter(e => e.kind === 'node.field.set').length, 1);
});

test('1.4.0: an imported note folds to where the sheet reads it', () => {
  const csv = [
    'Task ID,Type,Name,Status,Project,Notes',
    '1,Action,call the dentist,,,ask about the crown',
  ].join('\n');
  const { state } = build(csv);
  const n = [...state.nodes.values()].find(x => x.title === 'call the dentist')!;
  assert.equal(noteOf(n), 'ask about the crown', 'noteOf — the one reader — sees it');
});

test('repeats are COUNTED, not just named — the unnumbered-loss shape again (1.8.0)', () => {
  // A 400-row export with sixty repeating tasks used to say only "These will
  // not come with them: repeat." — the same shape as the pre-1.4.0 note bug.
  const text = '- water plants @repeat(FREQ=WEEKLY)\n- pay rent @repeat(FREQ=MONTHLY)\n- one-off thing\n';
  const s = importSummary(parseAnyExport(text).lines, [], NOW, DENVER);
  assert.equal(s.repeats, 2);
  const w = importWords(s);
  assert.match(w, /2 of them repeat on a rhythm/);
  assert.match(w, /rebuild the real ones as upkeep/);
});

test('a repeat-free file says nothing about rhythms', () => {
  const s = importSummary(parseAnyExport('- just a thing\n').lines, [], NOW, DENVER);
  assert.equal(s.repeats, 0);
  assert.doesNotMatch(importWords(s), /rhythm/);
});
