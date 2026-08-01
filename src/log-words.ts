// One plain-words line per event (1.4.0) — the log viewer's and the per-node
// history's shared voice.
//
// Every fact in this app folds from the log, and until now there was no way to
// look at it. These lines are how the record reads back as sentences: calm,
// past-tense, subject-free — the SURFACE says which item a line is about, so
// the words say only what happened to it. "You" did the deliberate acts; "the
// app" owns its own (cures, snapshots, migrations), because a record that
// blurs who did what is a record that cannot answer "did I choose this?".
//
// CONTENT NEVER RIDES ALONG. A note body, a journal entry, a capture's full
// text — the line says one was written, never what it said: the log view is a
// list of a thousand lines and a screenshot surface, and prose belongs on the
// item's own sheet. Titles referenced BY an event (a parent, a merge target, a
// person) come through the caller's `titleOf`, so the line can say where a
// thing went in the reader's own words.
//
// The map is TOTAL over EVENT_KINDS — a totality test holds it there — and the
// fallback for anything unmapped names the kind verbatim rather than guessing:
// an honest raw label beats a wrong sentence.
//
// PURE. The zone is an argument, like everywhere else (V-13).

import type { AppEvent } from './events.ts';
import { isValidIso, localDayKey } from './time.ts';

/** A gate cure — the app's own write, stamped with its cause's identity. */
export const isCure = (e: AppEvent): boolean => e.id.includes('~cure~');

type Payload = Record<string, unknown>;
const pl = (e: AppEvent): Payload => (e.payload ?? {}) as Payload;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const ROUTE_WORDS: Record<string, string> = {
  'do-now': 'do now', 'next-action': 'next action', 'waiting-for': 'waiting for',
  'someday': 'someday', 'reference': 'reference', 'trash': 'trash',
};

const CLOCK_WORDS: Record<string, string> = {
  due: 'a due date', start: 'a “not before” date', review: 'a return date',
  suspense: 'an answer-owed date', park: 'a parked-until date',
};

/** The bulk verbs' past-tense words — shared with the receipt copy. */
const BULK_VERB_WORDS: Record<string, string> = {
  'put-under': 'filed', 'to-menu': 'sent to the Menu', 'park': 'parked',
  'let-go': 'let go of', 'bring-back': 'brought back as real work',
  'undo': 'took back',
};

export function eventWords(
  e: AppEvent,
  zone: string,
  titleOf?: (id: string) => string | null,
): string {
  const p = pl(e);
  const day = (v: unknown): string =>
    typeof v === 'string' && isValidIso(v) ? localDayKey(v, zone) : '';
  const name = (v: unknown): string => {
    const id = str(v);
    const t = id ? titleOf?.(id) : null;
    return t ? `“${t}”` : 'something';
  };

  // The app's own coverage writes, named as such — the half of the record that
  // answers "why does this have a clock I never set".
  if (isCure(e)) {
    switch (e.kind) {
      case 'clock.set': {
        const d = day(p['at']);
        return `The app gave it a clock${d ? ` (back ${d})` : ''} so it would not go silent.`;
      }
      case 'menu.item.added':
        return 'The app placed it on the Menu so it would not go silent.';
      case 'park.set': {
        const d = day(p['returnAt']);
        return `The app parked it${d ? ` until ${d}` : ''} so it would not go silent.`;
      }
      default:
        return 'The app covered it so it would not go silent.';
    }
  }

  switch (e.kind) {
    // --- node lifecycle ------------------------------------------------------
    case 'node.created': {
      const k = str(p['nodeKind']);
      const art = /^[aeiou]/.test(k) ? 'an' : 'a';
      return `Created${k ? ` — ${art} ${k}` : ''}${p['parent'] ? `, under ${name(p['parent'])}` : ''}.`;
    }
    case 'node.kind.changed': return `Changed from ${str(p['from']) || 'one kind'} to ${str(p['to']) || 'another'}.`;
    case 'node.field.set': {
      const f = str(p['field']);
      if (f === 'note') return p['value'] === '' ? 'The note was removed.' : 'A note was kept with it.';
      return `The ${f || 'field'} was set.`;
    }
    case 'node.renamed': return `Renamed to “${str(p['title'])}”.`;
    case 'node.parented': return `Put under ${name(p['parent'])}.`;
    case 'node.unparented': return 'Taken back out on its own.';
    case 'node.trashed': return 'Let go.';
    case 'node.untrashed': return 'Kept after all.';
    case 'node.merged': return `Merged into ${name(p['into'])}.`;

    // --- temporal ------------------------------------------------------------
    case 'clock.set': {
      const kind = str(p['clockKind']);
      const d = day(p['at']);
      const what = CLOCK_WORDS[kind] ?? 'a clock';
      return `You gave it ${what}${d ? ` — ${d}` : ''}.`;
    }
    case 'clock.cleared': {
      const kind = str(p['clockKind']);
      return `The ${CLOCK_WORDS[kind] ? CLOCK_WORDS[kind].replace(/^an? /, '') : 'clock'} was taken off.`;
    }
    case 'upkeep.interval.set': {
      const n = num(p['intervalDays']);
      return n && n > 0 ? `Set to repeat every ${n} days.` : 'Stopped repeating.';
    }
    case 'done.marked': return 'Marked done.';
    case 'done.unmarked': return 'The completion was taken back.';
    case 'anchor.defined': return 'An anchor was set.';
    case 'anchor.fired': return 'An anchor came round.';
    case 'replan.raised': return 'A date passed, and it asked for a new plan.';
    case 'replan.resolved': return `Replanned — ${str(p['choice']) || 'a new plan chosen'}.`;
    case 'park.set': {
      const d = day(p['returnAt']);
      return `Parked${d ? ` until ${d}` : ''} — held away on purpose, with a way back.`;
    }

    // --- capture and triage --------------------------------------------------
    case 'capture.recorded': return 'Captured.';
    case 'heat.set': return str(p['heat']) === 'hot' ? 'Marked hot.' : 'Marked cold.';
    case 'clarify.routed': {
      const r = str(p['route']);
      return `Sorted as ${ROUTE_WORDS[r] ?? r ?? 'a route'}.`;
    }
    case 'clarify.reopened': return 'Taken back to be sorted again.';
    case 'do-now.timed': return 'A two-minute timer ran on it.';
    case 'bother.received': return 'A bother arrived.';
    case 'bother.owned': return 'The bother was taken on.';
    case 'bother.routed': return 'The bother was sorted onward.';
    case 'assist.offered': return 'Help was offered.';
    case 'assist.applied': return 'Help was applied.';

    // --- focus and resumption ------------------------------------------------
    case 'focus.started': return 'A focus session started on it.';
    case 'focus.ended': return 'The focus session ended.';
    case 'interrupt.captured': return 'Captured mid-focus, so the thread could hold.';
    case 'resume.card.created': return 'A resume card was left, to pick the thread back up.';
    case 'resume.card.spent': return 'The resume card was used.';
    case 'resume.card.expired': return 'The resume card lapsed quietly.';

    // --- work domain ---------------------------------------------------------
    case 'waiting.opened': return `Now waiting on ${name(p['person'])}.`;
    case 'waiting.closed': return 'It arrived.';
    case 'dependency.declared': return `Linked — this feeds ${name(p['feeds'])}.`;
    case 'dependency.released': return 'The link was released.';
    case 'suspense.set': {
      const d = day(p['at']);
      return `An answer owed${d ? ` by ${d}` : ''}.`;
    }
    case 'project.role.set':
      return str(p['role']) === 'track'
        ? 'Someone else is running this; you are tracking it.'
        : 'You are running this.';
    case 'opr.assigned': return `${name(p['person'])} was named as running it.`;
    case 'stakeholder.added': return 'A stakeholder was noted.';
    case 'stakeholder.removed': return 'A stakeholder was removed.';
    case 'decision.logged': return 'A decision was logged.';
    case 'delta.recorded': return 'A change since the last report was recorded.';
    case 'status.report.exported': return 'A status report went out.';

    // --- load and capacity ---------------------------------------------------
    case 'request.declined': return 'Declined, and kept in the Not Now ledger.';
    case 'request.slot.set': return 'A request slot was set.';
    case 'comms.sweep.scheduled': return 'A comms sweep was scheduled.';
    case 'comms.sweep.ran': return 'A comms sweep ran.';
    case 'pebble.raised': return 'A pebble was raised.';
    case 'pebble.settled': return 'The pebble settled.';
    case 'capacity.declared': return 'Capacity was declared.';
    case 'wip.limit.set': return 'The in-progress limit was set.';
    case 'estimate.recorded': {
      const m = num(p['durationMinutes']);
      return `An estimate was noted${m ? ` — about ${m} minutes` : ''}.`;
    }

    // --- structure and store (the app's own machinery) -----------------------
    case 'vault.created': return 'A vault was created.';
    case 'vault.locked': return 'The vault was locked.';
    case 'vault.unlocked': return 'The vault was unlocked.';
    case 'device.registered': return 'A device joined.';
    case 'module.enabled': return 'A module was turned on.';
    case 'module.disabled': return 'A module was turned off.';
    case 'consent.granted': return 'Consent was given.';
    case 'consent.revoked': return 'Consent was withdrawn.';
    case 'snapshot.written': return 'The app wrote a snapshot of everything, for fast starts.';
    case 'schema.migrated': return 'The store format moved forward — a copy was exported first.';
    case 'export.written': return 'A copy of your data was written out.';
    case 'import.seeded': return 'A fresh store was seeded from a file.';
    case 'shard.folded': return 'History from another device was folded in.';
    case 'shard.compacted': return 'Old history was compacted.';
    case 'terminology.skin.applied': return 'The wording changed skins.';
    case 'template.loaded': return 'A template was loaded.';
    case 'lapse.migration.ran': return 'A catch-up ran after time away.';

    // --- people and journal --------------------------------------------------
    case 'person.created': return 'A person was noted.';
    case 'person.linked': return `Linked to ${name(p['person'])}.`;
    case 'journal.entry.written': return 'A journal entry was written.';
    case 'journal.tag.attached': return 'A journal tag was attached.';

    // --- Menu and re-entry ---------------------------------------------------
    case 'menu.item.added': {
      const c = str(p['category']);
      return `Landed on the Menu${c ? ` — ${c}` : ''}.`;
    }
    case 'menu.item.removed': return 'Taken off the Menu.';
    case 'menu.item.promoted': return 'Brought back from the Menu as real work.';
    case 'save-for.updated': return 'The saving numbers were updated.';
    case 'reentry.greeted': return 'You came back, and the app said hello.';
    case 'amnesty.offered': return 'An amnesty was offered.';
    case 'amnesty.accepted': return 'You accepted the amnesty.';

    // --- composed today (1.6.0) ----------------------------------------------
    case 'today.chosen': return 'You chose it for today.';
    case 'today.released': return 'You took it out of today.';

    // --- wholesale acts (1.5.0) ----------------------------------------------
    case 'range.acted': {
      const verb = str(p['verb']);
      const c = num(p['count']);
      const scope = str(p['scope']);
      const did = BULK_VERB_WORDS[verb] ?? (verb || 'acted on');
      const what = c === 1 ? 'one thing' : `${c ?? 'several'} things`;
      return `You ${did} ${what} at once${scope ? ` — “${scope}”` : ''}.`;
    }

    default:
      // An unmapped kind states its raw name rather than guessing — a future
      // noun added without words here stays visible instead of vanishing.
      // (The cast: the switch is exhaustive over today's AppEvent union, so
      // TS narrows to never — but the LOG is not limited to today's build,
      // and an event from a newer schema still deserves an honest line.)
      return `${(e as { kind: string }).kind} — recorded.`;
  }
}
