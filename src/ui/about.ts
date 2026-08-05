// The (i) panel — always available, and the first thing a new user sees.
//
// It is one surface doing three jobs, deliberately:
//   1. what this app is, in two lines
//   2. the storage question, with the action to answer it (V-00)
//   3. patch notes, per Doctrine §5 and §14
// plus the links every app in this family owes — the shared accessibility
// statement and the licence.
//
// It opens ITSELF the first time, because a new user has no way to know that
// storage needs asking for. After that it never opens uninvited; the (i) is
// always there. The first-run state lives in the kv store, not the log — whether
// someone has seen a dialog is not part of their history.

import { requestPersistence, ulid } from '../ids.ts';
import { toCalendar, calendarCount } from '../ics.ts';
import { exportFilename, inspectExport, importSeedingFresh, foldInShard, toJsonl } from '../portability.ts';
import { statusReport, renderReport, reportedBefore, type ReportFormat } from '../delta.ts';
import { commsNode } from '../comms.ts';
import { printText } from './print.ts';
import { startCommsSweepEvents, stopCommsSweepEvents } from './focus-intents.ts';
import { fold } from '../fold.ts';
import { highWaterMark } from '../snapshot.ts';
import { admit, coverageGauge, gateOptionsFor, heldNodes, trashedNodes } from '../gate.ts';
import type { NodeState } from '../fold.ts';
import type { ExportFile } from '../portability.ts';
import type { AppEvent } from '../events.ts';
import { RELEASES, CURRENT } from './changelog.ts';
import { diagnosticReport, type DeviceReading } from '../diagnostic.ts';
import type { Session } from './session.ts';
import { sampleEvents, sampleSummary, sampleWords } from '../sample.ts';
import { bigSampleEvents, bigSampleSummary, bigSampleWords } from '../big-sample.ts';
import { CONFIRM_WORD, clearEvents, confirmMatches, eraseEverything, purgeCount, purgeSummary, purgeWords, purgedWords, type PurgeCount, type PurgeMode } from '../purge.ts';
import { KEY_KV } from '../sync-keys.ts';
import { badgeWords, badgeToggleLabel, isBadgeOn, setBadgeEnabled } from './badge.ts';
import { importSummary, importWords, parseAnyExport, taskPaperEvents } from '../taskpaper.ts';
import { deliverCopy, deliverDiagnostic, deliverGeneratedSet } from './export-copy.ts';
import { eventWords, isCure } from '../log-words.ts';
import { localDayKey, recordDayWords } from '../time.ts';
import { TODAY_MODULE, todayIsOn } from '../composed.ts';
import { CLOCK_MODULE, clockIsOn } from '../clock.ts';
import { enableModuleEvents, disableModuleEvents } from './detail-intents.ts';
import { editionOf, siblingOrigin, PLAIN_INVITE_WORDS, SYNC_INVITE_WORDS } from './sibling.ts';
import { mountSecurity } from './security.ts';
import { ledgerRowWords, notNowLedger, slotDayWords, slotOf } from '../requests.ts';
import { timerMinutesOf, timerWords } from '../timer.ts';
import { copyDayWords, copyNote, lastCopy } from '../copies.ts';
import { KDF_ITERATIONS, PASSPHRASE_WARNING, deriveKey, journalEntries, journalSeal, newSalt } from '../journal.ts';
import { open as unseal, seal } from '../seal.ts';
import { entryEvents, sealJournalEvents } from './journal-intents.ts';
import { setTimerLengthEvents } from './request-intents.ts';
import { setSlotEvents } from './request-intents.ts';
import { anchors, anchorWords, lastFiring, recurrenceOf } from '../anchors.ts';
import { defineAnchorEvents, fireAnchorEvents } from './anchor-intents.ts';

const SEEN = 'about.seen';
const FIRST_GRANT = 'v00.firstGrant';

interface Reading {
  supported: boolean;
  persisted: boolean;
  quotaMb: number | null;
  usageMb: number | null;
}

async function read(): Promise<Reading> {
  const s = globalThis.navigator?.storage;
  if (!s?.persisted) return { supported: false, persisted: false, quotaMb: null, usageMb: null };
  const persisted = await s.persisted();
  let quotaMb: number | null = null;
  let usageMb: number | null = null;
  if (s.estimate) {
    const est = await s.estimate();
    quotaMb = est.quota ? Math.round(est.quota / 1_048_576) : null;
    usageMb = est.usage != null ? Math.round((est.usage / 1_048_576) * 10) / 10 : null;
  }
  return { supported: true, persisted, quotaMb, usageMb };
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K, cls?: string, text?: string,
): HTMLElementTagNameMap[K] => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

export async function mountAbout(
  session: Session,
  /** Opens the detail sheet — the trash view's rows lead there and nowhere
   *  else, because "Keep it after all" is the only verb the trash offers. */
  openDetail?: (n: NodeState) => void,
  /** Repaints the main surfaces. Needed since 1.6.0: toggling a module from
   *  here changes what the landing view renders, and a strip that lingers
   *  after "off" is the panel lying about what it just did. */
  onChange?: () => void,
): Promise<void> {
  /**
   * How many journal entries would not decrypt at the last unlock — for the
   * diagnostic (1.18.0).
   *
   * **Null means "not checked", which is NOT zero**, and the two must never
   * collapse: only the journal surface holds the key, so an unset or locked
   * journal has simply not been asked. Reporting zero there would send somebody
   * looking somewhere else for a problem that is sitting unexamined.
   */
  let journalUnreadable: number | null = null;

  const dialog = document.querySelector<HTMLDialogElement>('#about');
  const open = document.querySelector<HTMLButtonElement>('#open-about');
  const intro = document.querySelector<HTMLElement>('#about-intro');
  const body = document.querySelector<HTMLElement>('#storage-body');
  const ask = document.querySelector<HTMLButtonElement>('#storage-ask');
  const exp = document.querySelector<HTMLButtonElement>('#export');
  const noteOut = document.querySelector<HTMLElement>('#storage-note');
  const copyOut = document.querySelector<HTMLElement>('#copy-note');
  const notes = document.querySelector<HTMLElement>('#patch-notes');
  const version = document.querySelector<HTMLElement>('#version');
  if (!dialog) return;

  // THE WAY OUT IS WIRED FIRST, before anything that can fail.
  //
  // It used to be attached ~490 lines below, after the patch notes, storage,
  // import, comms and report wiring — so every one of those had to succeed for
  // the modal to be closeable, and `app.ts` swallows a throw from this function
  // silently. A dialog you cannot leave is the worst failure this panel has
  // available to it, and it was the last thing to be made possible.
  //
  // Both controls, and `cancel` so a keyboard Esc is never the only route.
  const shut = (): void => { try { dialog.close(); } catch { dialog.removeAttribute('open'); } };
  document.querySelector('#about-dismiss')?.addEventListener('click', shut);
  document.querySelector('#about-close')?.addEventListener('click', shut);
  // `e.target === dialog` IS LOAD-BEARING. `<input type="file">` fires its own
  // `cancel` event when the file chooser is dismissed, and that event BUBBLES —
  // so an unguarded listener here caught the file picker's cancel and shut the
  // whole panel the moment anybody chose a file to import. Found by the smoke
  // walk within minutes of being written, on the surface people reach for after
  // something has already gone wrong.
  dialog.addEventListener('cancel', (e) => { if (e.target === dialog) shut(); });
  // A programmatic showModal has no opener to hand focus back to, so the return
  // is explicit — and it goes to capture, because that is what this app is for.
  dialog.addEventListener('close', () => {
    document.querySelector<HTMLInputElement>('#capture')?.focus();
  });

  if (!open || !intro || !body || !ask || !exp || !notes || !version || !noteOut) return;

  // The folding groups (1.7.2, ADR-0055). Closed by default; which ones you
  // opened is remembered per device — a view preference on the badge/lens
  // pattern (kv, fire-and-forget, never an event). The toggle's label is the
  // group's name, so the caret carries the state (CSS ::before on
  // aria-expanded) rather than the label changing under the reader.
  {
    const GROUPS_KEY = 'about.groups';
    const toggles = Array.from(document.querySelectorAll<HTMLButtonElement>('.about-group-toggle'));
    const setOpen = (btn: HTMLButtonElement, isOpen: boolean): void => {
      const id = btn.getAttribute('aria-controls');
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      target.hidden = !isOpen;
      btn.setAttribute('aria-expanded', String(isOpen));
    };
    const persist = (): void => {
      const openNow = toggles.filter(b => b.getAttribute('aria-expanded') === 'true')
        .map(b => b.getAttribute('aria-controls') ?? '');
      void session.store.setKv(GROUPS_KEY, openNow).catch(() => { /* view pref only */ });
    };
    for (const btn of toggles) {
      btn.addEventListener('click', () => {
        setOpen(btn, btn.getAttribute('aria-expanded') !== 'true');
        persist();
      });
    }
    void session.store.getKv<string[]>(GROUPS_KEY).then((openIds) => {
      if (!Array.isArray(openIds)) return;
      for (const btn of toggles) {
        if (openIds.includes(btn.getAttribute('aria-controls') ?? '')) setOpen(btn, true);
      }
    }).catch(() => { /* closed is the calm default */ });
  }

  version.textContent = CURRENT.triplet;

  // --- patch notes ---------------------------------------------------------
  //
  // The CURRENT release is shown; everything before it is folded away behind one
  // control. Rendering the lot made this panel **seventeen to twenty-five
  // thousand pixels tall** — measured, not estimated — which is the reason a way
  // out was ever far from a thumb in the first place. Fixing the header's
  // position without fixing that would have left the panel just as unusable to
  // read, and history nobody asked for is not a reason to make today's notes
  // hard to reach.
  //
  // Nothing is removed. It is one tap away and it says how many.
  // A note's `**lead**` becomes a real <strong> — built from text nodes only,
  // never innerHTML. The first version handed the raw string to textContent,
  // which printed the asterisks and (worse) the entity names literally on the
  // panel — “&ldquo;” as seven characters (found on device, 1.7.1). The
  // strings now carry real Unicode punctuation; only the bold marks need
  // translating, and an unpaired ** is rendered as the text it is.
  const noteLine = (text: string): HTMLLIElement => {
    const li = el('li');
    const parts = text.split('**');
    if (parts.length % 2 === 0) {            // an unpaired ** is just text
      li.textContent = text;
      return li;
    }
    parts.forEach((part, i) => {
      if (!part) return;
      if (i % 2 === 1) li.append(el('strong', undefined, part));
      else li.append(document.createTextNode(part));
    });
    return li;
  };
  const noteBlock = (r: typeof RELEASES[number]): HTMLElement[] => {
    const h = el('h3', 'note-head');
    h.append(el('span', 'note-triplet', r.triplet));
    h.append(el('span', 'note-kind', r.kind.toLowerCase()));
    const ul = el('ul', 'note-list');
    ul.append(...r.notes.map(noteLine));
    return [h, ul];
  };
  const [latest, ...older] = RELEASES;
  const rendered: HTMLElement[] = latest ? noteBlock(latest) : [];
  if (older.length > 0) {
    const d = document.createElement('details');
    d.className = 'note-older';
    const sum = document.createElement('summary');
    sum.textContent = older.length === 1
      ? 'One earlier release'
      : `${older.length} earlier releases`;
    d.append(sum, ...older.flatMap(noteBlock));
    rendered.push(d);
  }
  notes.replaceChildren(...rendered);

  // --- storage -------------------------------------------------------------
  const paintStorage = async (): Promise<void> => {
    const r = await read();
    const first = await session.store.getKv<string>(FIRST_GRANT);
    if (r.persisted && !first) await session.store.setKv(FIRST_GRANT, new Date().toISOString());

    // One `store.all()`, the same cost the purge count and the log viewer
    // already pay on this panel — and paid only when somebody opens it or has
    // just exported. Read from the LOG, never from folded state: whether a copy
    // exists is a fact about the record, not about any node (1.14.0).
    const log = await session.store.all();
    const copy = lastCopy(log);

    const rows: [string, string][] = [
      ['Keeping your data', r.persisted ? 'yes' : r.supported ? 'not yet' : 'cannot tell'],
      ['Asked for', first ? new Date(first).toLocaleString() : r.persisted ? 'just now' : '—'],
      // The durability fact that is actually under your control, sitting beside
      // the one that is not. `export.written` has been written since Phase 0 and
      // read by nothing until now (ADR-0062).
      ['Last copy', copyDayWords(copy, session.zone)],
      ['Room available', r.quotaMb == null ? 'unknown' : `${r.quotaMb.toLocaleString()} MB`],
      ['Used by Quietkeep', r.usageMb == null ? 'unknown' : `${r.usageMb} MB`],
      // `heldWork`, NOT `nodes.size` and NOT `heldNodes`. The gauge on the main
      // screen says "N held" and this row says "Things held" — the same words
      // about the same store, so they must be the same number or the app is
      // telling two stories about one thing. It said `nodes.size` first and
      // disagreed by however many things had been let go; it said `heldNodes`
      // until 1.15.1 and would have disagreed by every journal entry and every
      // pebble the moment the gauge narrowed. The row follows the gauge.
      ['Things held', String(coverageGauge(session.state()).total)],
    ];
    body.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', undefined, k), el('dd', undefined, v)]));

    ask.hidden = r.persisted || !r.supported;

    // Say what is true, including when it is not the comfortable answer (§5).
    // The note lives OUTSIDE the <dl>: a definition list may only contain
    // dt/dd groups, and the gate's axe pass failed the note as a child of it —
    // the gate's first real catch, ten minutes after existing.
    //
    // And what the promise COVERS, not just that there is one (1.14.0).
    //
    // This used to say "the browser has agreed to keep your data" and stop,
    // which is true and reads as a guarantee it never was. Persistent storage
    // means the browser will not clear the store on its own to make room; it has
    // never covered somebody clearing their browser's website data themselves,
    // and that is the case where everything here goes at once.
    //
    // Worded from what the mode MEANS, deliberately — not as a claim about any
    // particular iOS build. V-00 has measured the grant, the quota and a
    // force-quit on a real iPad; it has not measured the clearing path (V-20),
    // and this repo does not put platform facts on screen that it has not run.
    noteOut.textContent = r.persisted
      ? 'The browser has agreed not to clear your data to make room for something else. That is the whole of what it covers: if you clear this browser’s website data yourself, Quietkeep goes with it, and the copy in your Files is what survives. Worth checking back here every so often — if this ever says otherwise, export a copy.'
      : r.supported
        ? 'Your writing is saved on this device, but the browser has not promised to keep it and may clear it if the device runs short of space. The copy in your Files is the one that survives either way.'
        : 'This browser will not say whether it keeps your data. The copy in your Files is the one that survives either way — export one from time to time.';

    // Silence is the covered state. Nothing to say means nothing said, rather
    // than a line congratulating somebody for having exported.
    if (copyOut) {
      const words = copyNote(log, copy);
      copyOut.textContent = words;
      copyOut.hidden = words === '';
    }
  };

  ask.addEventListener('click', async () => {
    ask.disabled = true;
    try {
      // The notification prompt is part of this on iPadOS — asked for here, in
      // response to a deliberate tap, never on arrival. V-00 confirmed this path
      // works; it did NOT test whether notifications are strictly required, so
      // nothing in the copy claims they are.
      if ('Notification' in globalThis && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      await requestPersistence();
      await paintStorage();
    } finally {
      ask.disabled = false;
    }
  });

  // --- the calendar (T1) -----------------------------------------------------
  // The tier that actually reminds you. Same deliver-then-record ordering as the
  // export below, for the same reason: a failed hand-off must never leave the log
  // asserting that a copy left.
  // --- the other edition (ADR-0036) -----------------------------------------
  //
  // Shown in BOTH builds, from the same code, because the obligation is
  // symmetrical: each states its own posture and links the other. The words
  // differ by which build is running; the link is derived from this hostname so
  // staging points at staging and neither can drift from the other.
  //
  // Silent when there is no knowable sibling. That is the whole reason this is
  // not a hardcoded URL — see `sibling.ts`.
  // "How this works, and what it protects" — the security story was required to
  // have its OWN place for people who want it, without it becoming the panel.
  // A collapsed disclosure just above the What-this-is block: its own location,
  // one tap, and free to everybody who never opens it.
  mountSecurity(document.querySelector('#sibling'));

  // Install guidance adapts to whether Quietkeep is already on the home screen.
  // The DISPLAY MODE is the honest signal — a standalone launch is an installed
  // one — so there is no user-agent sniffing here. When it is not installed both
  // platforms' steps are shown, because a page cannot offer iOS an install button
  // (iOS fires no such event); the steps are all a browser can honestly give.
  const installed = (() => {
    try {
      return globalThis.matchMedia?.('(display-mode: standalone)').matches === true
        || (globalThis.navigator as { standalone?: boolean }).standalone === true;
    } catch { return false; }
  })();
  const installSteps = document.querySelector<HTMLElement>('#install-steps');
  const installDone = document.querySelector<HTMLElement>('#install-done');
  if (installSteps) installSteps.hidden = installed;
  if (installDone) installDone.hidden = !installed;

  const siblingP = document.querySelector<HTMLElement>('#sibling');
  if (siblingP) {
    const here = location.hostname;
    const origin = siblingOrigin(here, location.protocol);
    const edition = editionOf(here);
    if (origin && edition) {
      siblingP.replaceChildren(
        document.createTextNode(
          `${edition === 'sync' ? PLAIN_INVITE_WORDS : SYNC_INVITE_WORDS} `),
      );
      const link = document.createElement('a');
      link.href = origin;
      link.textContent = edition === 'sync' ? 'Open Quietkeep' : 'Open Quietkeep Sync';
      // A new tab, so somebody looking at the other edition has not lost the
      // planner they were in the middle of.
      link.rel = 'noopener';
      link.target = '_blank';
      siblingP.append(link);
      siblingP.hidden = false;
    }
  }

  const cal = document.querySelector<HTMLButtonElement>('#calendar');
  const calNote = document.querySelector<HTMLElement>('#calendar-note');
  const paintCalendar = (): void => {
    if (!calNote) return;
    try {
      const n = calendarCount(session.state(), new Date().toISOString(), session.zone);
      // "a date YOU set" rather than "a date", because the app puts its own
      // clocks on things constantly — that is how it brings them back — and only
      // a day somebody chose belongs in a diary. Saying "nothing has a date" while
      // a dozen things visibly show "back tomorrow" reads as a bug rather than as
      // a distinction.
      calNote.textContent = n === 0
        ? 'Nothing has a date you set, so there is nothing to send. The app still brings everything back to you itself — a calendar is only for days you chose.'
        : `${n} ${n === 1 ? 'thing has' : 'things have'} a date you set.`;
    } catch {
      calNote.textContent = '';
    }
  };
  paintCalendar();

  cal?.addEventListener('click', async () => {
    if (!cal || !calNote) return;
    // NOT disabled when there is nothing to send. A disabled control is
    // unreachable by keyboard and explains nothing; this one stays available and
    // answers when asked, which is the same courtesy the rest of the app extends.
    const at = new Date().toISOString();
    if (calendarCount(session.state(), at, session.zone) === 0) {
      calNote.textContent = 'Nothing has a date you set. Open something and give it a date, and it can go to your calendar — the app\u2019s own "bring this back tomorrow" is not a date for your diary.';
      cal.focus();
      return;
    }
    cal.disabled = true;
    try {
      const text = toCalendar(session.state(), at, session.zone);
      const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFilename('calendar', at, false, 'ics', session.zone);
      document.body.append(a);
      a.click();
      a.remove();
      // Long grace: on iPadOS the share sheet holds the URL open while the user
      // decides where the file goes.
      setTimeout(() => URL.revokeObjectURL(url), 120_000);

      await session.commit((ctx) => [{
        id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
        kind: 'export.written', node: null,
        payload: { at, scope: 'calendar', encrypted: false },
      } as AppEvent]);
      calNote.textContent = 'Sent. Open the file to add it to your calendar — it will remind you at 9am on the day.';
    } catch (err) {
      calNote.textContent = `That did not send — nothing left your device. (${(err as Error).message})`;
    } finally {
      cal.disabled = false;
      // Disabling the FOCUSED button blurs it, and re-enabling does not bring
      // focus back — so activating this control dropped focus to <body>, outside
      // the dialog. The same defect class was already fixed twice in this app
      // (clarify.ts, work.ts) and came straight back on a new control (audit).
      // NOT paintCalendar() here: it would immediately overwrite the confirmation
      // the user needs to read. Freshness is handled when the panel opens.
    }
  });

  // --- the comms sweep, opt-in ----------------------------------------------
  // OFF until asked for. A planner that arrives having decided you should check
  // your messages twice a day has made a decision about your working life that
  // it was not asked to make.
  const commsNote = document.querySelector<HTMLElement>('#comms-note');
  const paintComms = (): void => {
    const on = commsNode(session.state()) !== null;
    const start = document.querySelector<HTMLButtonElement>('#comms-start');
    const stop = document.querySelector<HTMLButtonElement>('#comms-stop');
    if (start) start.hidden = on;
    if (stop) stop.hidden = !on;
  };
  paintComms();
  document.querySelector<HTMLButtonElement>('#comms-start')?.addEventListener('click', () => {
    void (async () => {
      try {
        await session.commit(ctx => startCommsSweepEvents(ctx, ctx.id()));
        if (commsNote) commsNote.textContent = 'On. You will be offered one pass when you come out of working on something — never in the middle of it.';
      } catch (err) {
        if (commsNote) commsNote.textContent = `That did not work. (${(err as Error).message})`;
      }
      paintComms();
    })();
  });
  document.querySelector<HTMLButtonElement>('#comms-stop')?.addEventListener('click', () => {
    const n = commsNode(session.state());
    if (!n) return;
    void (async () => {
      try {
        await session.commit(ctx => stopCommsSweepEvents(ctx, n.id));
        if (commsNote) commsNote.textContent = 'Stopped. Nothing will offer it again.';
      } catch (err) {
        if (commsNote) commsNote.textContent = `That did not work. (${(err as Error).message})`;
      }
      paintComms();
    })();
  });

  // --- the header clock, opt-in (1.22.0) ------------------------------------
  //
  // The comms-sweep and Composed-Today shape exactly: two mutually-exclusive
  // buttons painted from FOLDED STATE rather than a cached flag, and off until
  // asked for. Chrome that arrives switched on has made a decision about
  // somebody's screen that it was not asked to make — and a clock is the most
  // charged piece of chrome there is, because half the point of this app is
  // that a day is not a countdown.
  //
  // `onChange` is what actually paints it: the toggle lives inside a modal and
  // the clock lives in the header behind it, so without the repaint you would
  // close the panel and find nothing had happened.
  const clockNote = document.querySelector<HTMLElement>('#clock-note');
  const paintClock = (): void => {
    const on = clockIsOn(session.state());
    const onBtn = document.querySelector<HTMLButtonElement>('#clock-on');
    const offBtn = document.querySelector<HTMLButtonElement>('#clock-off');
    if (onBtn) onBtn.hidden = on;
    if (offBtn) offBtn.hidden = !on;
  };
  paintClock();
  document.querySelector<HTMLButtonElement>('#clock-on')?.addEventListener('click', () => {
    void session.commit(ctx => enableModuleEvents(ctx, CLOCK_MODULE))
      .then(() => {
        if (clockNote) clockNote.textContent = 'On. It is at the top of every screen — the time, what is left of today, and how many things carry today’s date.';
      })
      .catch((err: Error) => { if (clockNote) clockNote.textContent = `That did not work. (${err.message})`; })
      .finally(() => { paintClock(); try { onChange?.(); } catch { /* next pass */ } });
  });
  document.querySelector<HTMLButtonElement>('#clock-off')?.addEventListener('click', () => {
    void session.commit(ctx => disableModuleEvents(ctx, CLOCK_MODULE))
      .then(() => {
        if (clockNote) clockNote.textContent = 'Off. The header is back to the wordmark.';
      })
      .catch((err: Error) => { if (clockNote) clockNote.textContent = `That did not work. (${err.message})`; })
      .finally(() => { paintClock(); try { onChange?.(); } catch { /* next pass */ } });
  });

  // --- the status report ----------------------------------------------------
  // "What has changed since I last told anyone" is not a change-log this app
  // maintains. It is fold(log up to then) compared with fold(log) — the same
  // arithmetic everything else here is built on, so there is no second source of
  // truth to drift, and a report over an imported history is exactly as correct
  // as one over a history this device wrote.
  const reportNote = document.querySelector<HTMLElement>('#report-note');
  const reportPreview = document.querySelector<HTMLElement>('#report-preview');
  // Declared beside the report's own controls, because that is what it changes:
  // an anchor's ONLY job is to answer "since when" for this report (1.17.0).
  const anchorPeriod = document.querySelector<HTMLSelectElement>('#anchor-period');

  /**
   * Hand it over, THEN record it — the ordering an audit already had to fix on
   * the export path. A `status.report.exported` written before the text reached
   * anywhere would move the mark, and the next report would silently start from
   * a moment nobody was ever told about. That is a whole reporting period lost,
   * with no error and nothing to notice.
   */
  const deliverReport = async (format: ReportFormat): Promise<void> => {
    if (!reportNote) return;
    const nowIso = new Date().toISOString();
    const after = session.state();
    const all = await session.store.all();
    // WHICH PERIOD (1.17.0, ADR-0068). Default: since your last report. When a
    // named period is picked and has been marked, the cut is that firing
    // instead — and it is the SAME cut, because `anchor.fired` carries the same
    // per-device watermark `status.report.exported` does and `reportedBefore`
    // already prefers it. One reader, two writers.
    const picked = anchorPeriod?.value || '';
    const firing = picked ? lastFiring(all, picked) : null;
    const since = firing ? firing.at : after.lastReportAt;
    const mark = firing ? firing.mark : after.lastReportMark;
    // What was already REPORTED, not what is merely older. A shard union brings
    // in another device's history stamped before your last report; a time cut
    // would bury it for ever (audit).
    const before = fold(reportedBefore(all, { at: since, upToSeqByDevice: mark }));
    const r = statusReport(before, after, since, nowIso, session.zone);
    const text = renderReport(r, format, session.zone);

    try {
      if (format === 'clipboard') {
        // The clipboard can be refused — a permission, a browser that only
        // allows it inside a gesture, an iPad in a state that says no. When it
        // is, the text still has to reach the person, so it is shown rather
        // than lost with an apology.
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          if (reportPreview) { reportPreview.textContent = text; reportPreview.hidden = false; }
          reportNote.textContent = 'Your browser would not let me use the clipboard. Here it is instead — select it and copy.';
          return;                       // NOT recorded: it did not leave.
        }
      } else if (format === 'print') {
        // Through the print area, so what comes out is the report and not the
        // dialog it was launched from plus the whole app behind it. The old path
        // called window.print() against the live page with no print stylesheet
        // in the repo at all — the button worked and the output was unusable.
        printText(text, 'Quietkeep — status');
      } else {
        const ext = format === 'csv' ? 'csv' : 'md';
        const type = format === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8';
        const blob = new Blob([text], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exportFilename('status', nowIso, false, ext, session.zone);
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 120_000);
      }

      await session.commit((ctx) => [{
        id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
        kind: 'status.report.exported', node: null,
        // The watermark this report went out with — read from the state the
        // report was actually built from, so it can never claim to cover
        // something that landed while the file was being written.
        payload: { format, scope: 'all', upToSeqByDevice: highWaterMark(after) },
      } as AppEvent]);
      reportNote.textContent = 'Handed over. The next one starts from this moment.';
    } catch (err) {
      reportNote.textContent = `That did not work — nothing left your device. (${(err as Error).message})`;
    }
  };

  const REPORT_BUTTONS: [string, ReportFormat][] = [
    ['#report-copy', 'clipboard'], ['#report-markdown', 'markdown'],
    ['#report-csv', 'csv'], ['#report-print', 'print'],
  ];
  for (const [sel, format] of REPORT_BUTTONS) {
    document.querySelector<HTMLButtonElement>(sel)?.addEventListener('click', () => {
      void deliverReport(format);
    });
  }

  // --- named periods (1.17.0, ADR-0068) -------------------------------------
  //
  // Three controls and no fourth: name one, mark that it came round, pick it as
  // the period a report covers. There is no delete, no schedule, no "next
  // occurrence" and no count of firings — an anchor that fires itself is a nag
  // with a calendar, and a tally of the meetings you did or did not hold is the
  // shape law 5 exists to forbid.
  //
  // Everything is read from the LOG rather than from state (`src/anchors.ts`),
  // the `copies.ts` precedent: a firing is a thing that happened at a moment,
  // carrying the watermark current then, and folding that into `NodeState`
  // would be four ceremonies to store what the log already says.
  const anchorForm = document.querySelector<HTMLFormElement>('#anchor-form');
  const anchorName = document.querySelector<HTMLInputElement>('#anchor-name');
  const anchorRec = document.querySelector<HTMLInputElement>('#anchor-recurrence');
  const anchorList = document.querySelector<HTMLUListElement>('#anchor-list');
  const anchorNote = document.querySelector<HTMLElement>('#anchor-note');

  const paintAnchors = async (): Promise<void> => {
    if (!anchorList || !anchorPeriod) return;
    const st = session.state();
    const log = await session.store.all();
    const all = anchors(st);

    // The picker. Its current value is preserved across a repaint — a repaint
    // landing mid-choice is how a surface throws away an answer somebody was in
    // the middle of giving (the detail sheet's no-clobber rule).
    const keep = anchorPeriod.value;
    const first = document.createElement('option');
    first.value = '';
    first.textContent = 'Since your last report';
    anchorPeriod.replaceChildren(first, ...all.map(a => {
      const o = document.createElement('option');
      o.value = a.id;
      o.textContent = a.title || '(unnamed)';
      return o;
    }));
    if (all.some(a => a.id === keep)) anchorPeriod.value = keep;

    anchorList.replaceChildren(...all.map(a => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = a.title || '(unnamed)';
      const fact = document.createElement('span');
      fact.className = 'anchor-fact';
      fact.textContent = anchorWords(a, lastFiring(log, a.id), recurrenceOf(log, a.id), session.zone, new Date().toISOString());
      const fire = document.createElement('button');
      fire.type = 'button';
      fire.className = 'ghost';
      // "It came round", not "Done". Nothing here was work, so nothing here is
      // completed — a period ended, which is a different sentence.
      fire.textContent = 'It came round';
      fire.addEventListener('click', () => {
        void session.commit(ctx => fireAnchorEvents(ctx, a.id, highWaterMark(session.state())))
          .then(() => {
            if (anchorNote) anchorNote.textContent = `Marked. A report can now cover the time since this ${a.title}.`;
            void paintAnchors();
          })
          .catch((err) => {
            if (anchorNote) anchorNote.textContent = `That did not record — ${(err as Error).message}`;
          });
      });
      li.append(name, fact, fire);
      return li;
    }));
  };

  anchorForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!anchorName) return;
    const name = anchorName.value.trim();
    if (!name) { anchorName.focus(); return; }
    void session.commit(ctx => defineAnchorEvents(ctx, ulid(Date.parse(ctx.at)), name, anchorRec?.value ?? ''))
      .then(() => {
        // Cleared only after the write has LANDED (ADR-0008), like capture — an
        // input that empties before the commit resolves can lose what you typed.
        anchorName.value = '';
        if (anchorRec) anchorRec.value = '';
        anchorName.focus();
        if (anchorNote) anchorNote.textContent = `"${name}" is a period you can report against.`;
        void paintAnchors();
      })
      .catch((err) => {
        if (anchorNote) anchorNote.textContent = `That could not be named — ${(err as Error).message}`;
      });
  });

  // --- export ---------------------------------------------------------------
  // The way out, on the surface that talks about durability. DELIVER, then
  // record: the audit found the old order logging export.written before any
  // file existed, so a failed export left the log asserting a copy left when
  // none did — and the failure itself was silent. Now the file is built and
  // handed to the browser first, the event is committed after, and every
  // failure is said out loud (§5). Each file carries every EARLIER export's
  // record; its own lands one export later.
  /** One definition, now in `./export-copy.ts` because the update prompt needs the
   *  same thing and the note that used to live here said a second copy would be a
   *  second chance to get the ordering wrong. */
  const deliverExport = (scope: string, ext: string): Promise<void> =>
    deliverCopy(session, scope, ext);

  exp.addEventListener('click', async () => {
    exp.disabled = true;
    try {
      await deliverExport('all', 'json');
      noteOut.textContent = 'Exported. The file is on its way to your Files app or downloads.';
    } catch (err) {
      noteOut.textContent = `The export failed — nothing left your device. (${(err as Error).message})`;
    } finally {
      exp.disabled = false;
      void paintStorage().catch(() => {});
    }
  });

  // --- bringing a copy back ------------------------------------------------
  //
  // The app could hand you your whole log and had no way to read one back, so a
  // new device meant starting again and the export button produced a file
  // nothing could consume. For an app with no accounts and no server, that is
  // not a missing feature — it is the "your data is yours" promise with no exit.
  //
  // The flow is CHOOSE, then be TOLD, then CONFIRM. Import replaces everything
  // (law 9: seeds fresh, never merges), so nothing destructive is reachable
  // until the file has been read and described, and a backup of what is about
  // to be replaced is offered first and listed first.
  const importFile = document.querySelector<HTMLInputElement>('#import-file');
  const importNote = document.querySelector<HTMLElement>('#import-note');
  const importActions = document.querySelector<HTMLElement>('#import-actions');
  const importGo = document.querySelector<HTMLButtonElement>('#import-go');
  const importBackup = document.querySelector<HTMLButtonElement>('#import-backup');
  const importUnion = document.querySelector<HTMLButtonElement>('#import-union');
  const importExplainer = document.querySelector<HTMLElement>('#import-explainer');

  if (importFile && importNote && importActions && importGo && importBackup &&
      importUnion && importExplainer) {
    // Held between choosing and confirming. Parsed ONCE: re-reading the file at
    // confirm time would let it change underneath the description the person
    // just agreed to.
    let staged: ExportFile | null = null;

    const resetImport = (): void => {
      staged = null;
      importActions.hidden = true;
      importExplainer.hidden = true;
    };

    // Clearing the input's value on every open means choosing the SAME file
    // twice still fires `change`. Without it the second choice was silent — the
    // surface said nothing at all, which reads as a broken control (audit).
    importFile.addEventListener('click', () => { importFile.value = ''; });

    importFile.addEventListener('change', async () => {
      resetImport();
      const chosen = importFile.files?.[0];
      if (!chosen) { importNote.textContent = ''; return; }
      importNote.textContent = 'Reading it…';
      // EVERYTHING in the try, not just the parse. `inspectExport` sat outside
      // it, so a file that made it throw left this listener rejected and the
      // note reading "Reading it…" for ever — on the one screen people reach for
      // after something has already gone wrong (audit). `inspectExport` is now
      // total as well; this is the second belt, because an async listener that
      // can reject silently is a bad shape whatever it calls.
      let summary;
      let parsed: unknown;
      try {
        parsed = JSON.parse(await chosen.text());
        summary = inspectExport(parsed);
      } catch (err) {
        importNote.textContent =
          `That file could not be read (${(err as Error).message}). Nothing has changed.`;
        return;
      }
      if (summary.refusals.length > 0) {
        // The refusal is the whole message. It already ends by saying nothing
        // was touched, because at this point nothing has been.
        importNote.textContent = `${summary.refusals[0]} Nothing has changed.`;
        return;
      }
      staged = parsed as ExportFile;
      const made = summary.at ? new Date(summary.at).toLocaleString() : 'an unknown time';
      // The SAME definition the file was measured with (`inspectExport` counts
      // `heldNodes`). Counting `nodes.size` here made the two halves of one
      // sentence disagree — "that file holds 8 things … replaces the 9 things on
      // this device", about a file exported from this device moments earlier.
      // A person comparing those numbers before a destructive action deserves
      // them to be the same kind of number (audit, found by the smoke walk).
      //
      // Deliberately `heldNodes` and NOT `heldWork` (1.15.1), which is the
      // opposite call to the "Things held" row above. This sentence is a
      // warning about what an import REPLACES, and it replaces everything — a
      // journal entry and a pebble go with the rest. The narrower number would
      // under-state a destructive act, which is the one direction a warning may
      // never round in.
      const here = heldNodes(session.state()).length;
      // Both numbers, plainly. "412 events" means nothing to a person; "37
      // things" is the number they can check against what they remember.
      // BOTH doors, named (1.17.3, the seam audit). This sentence used to say
      // "Bringing it in replaces... Nothing is merged — this is a replacement"
      // unconditionally, while the focus landed on "Take in what I don't have"
      // — which is additive and removes nothing. The one paragraph a person
      // reads before the most consequential act in the app denied that the
      // default button existed.
      importNote.textContent =
        `That file holds ${summary.items} thing${summary.items === 1 ? '' : 's'} ` +
        `(${summary.events} record${summary.events === 1 ? '' : 's'}), saved ${made}. ` +
        `“Take in what I don’t have” adds what this device is missing and removes nothing. ` +
        `“Replace everything” replaces the ${here} thing${here === 1 ? '' : 's'} on this device with the file — ` +
        'nothing is merged on that path; it is a clean swap.';
      importActions.hidden = false;
      importExplainer.hidden = false;
      // Focus the ADDITIVE one. It is the everyday action and it cannot lose
      // anything; the destructive one should never be what a keyboard lands on
      // by default.
      importUnion.focus();
    });

    // MULTI-DEVICE, and opt-in by being a thing you press. Nothing about this
    // runs on its own, nothing phones anywhere, and the app is complete without
    // it — someone using one device never meets it beyond a line of text
    // (ADR-0035, 2026-07-29: required to be opt-in).
    importUnion.addEventListener('click', async () => {
      if (!staged) return;
      importUnion.disabled = true;
      importGo.disabled = true;
      try {
        const r = await foldInShard(session.store, staged, new Date().toISOString());
        if (r.taken === 0) {
          importNote.textContent =
            'Nothing new in that copy — everything in it was already here. Nothing changed.';
          return;
        }
        // Recorded IN the log, so a store can say where its contents came from.
        const at = new Date().toISOString();
        const seq = await session.store.nextSeq(session.device);
        await session.store.append([{
          id: ulid(Date.now()), vault: session.vault, at, device: session.device, seq,
          kind: 'shard.folded', node: null,
          payload: { fromDevice: r.fromDevices.join(', ') || 'unknown', taken: r.taken, skipped: r.skipped, at },
        } as AppEvent]);
        importNote.textContent =
          `Took in ${r.taken} record${r.taken === 1 ? '' : 's'} from your other device. ` +
          'Nothing here was removed. Reloading…';
        setTimeout(() => location.reload(), 500);
      } catch (err) {
        importNote.textContent =
          `That copy could not be taken in — ${(err as Error).message} Choose the file again to retry.`;
        resetImport();
        importFile.value = '';
      } finally {
        importUnion.disabled = false;
        importGo.disabled = false;
      }
    });

    importBackup.addEventListener('click', async () => {
      // BOTH disabled. "Replace everything" stayed live while the backup this
      // flow calls "offered first" was still being written, so the store could
      // be replaced out from under the copy meant to protect it (audit).
      importBackup.disabled = true;
      importGo.disabled = true;
      importUnion.disabled = true;
      try {
        await deliverExport('all', 'json');
        importNote.textContent =
          'Saved. That copy is on its way to your Files app or downloads — keep it somewhere ' +
          'you can find it before replacing what is here.';
      } catch (err) {
        importNote.textContent = `Could not save a copy — ${(err as Error).message}. Nothing has been replaced.`;
      } finally {
        importBackup.disabled = false;
        importGo.disabled = false;
        importUnion.disabled = false;
      }
    });

    importGo.addEventListener('click', async () => {
      if (!staged) return;
      importGo.disabled = true;
      importBackup.disabled = true;
      try {
        await importSeedingFresh(session.store, staged);
        // Record it IN THE NEW LOG. A store seeded from a file should say so —
        // and it is written after the reset on purpose, so it survives.
        //
        // Appended directly rather than through `session.commit`: the session's
        // folded state is now stale by a whole store, and committing through it
        // would fold this event onto the state of data that no longer exists and
        // write that as a snapshot.
        const at = new Date().toISOString();
        const seq = await session.store.nextSeq(session.device);
        await session.store.append([{
          id: ulid(Date.now()), vault: session.vault, at, device: session.device, seq,
          kind: 'import.seeded', node: null,
          payload: { fromExport: staged.at, at },
        } as AppEvent]);
        importNote.textContent = 'Brought back. Reloading so everything reads from the new copy…';
        // A full reload, deliberately. Every surface holds a projection of the
        // old store; re-rendering them one by one would be a long list of places
        // to get wrong, and the one place this must not be clever is the path
        // people reach for after something has already gone wrong.
        setTimeout(() => location.reload(), 400);
      } catch (err) {
        // The staged file is DROPPED and the actions are withdrawn. Leaving them
        // armed after a failure meant "Replace everything" could be pressed
        // again over a store whose state was no longer the one described
        // (audit). Choosing the file again is one tap, and it re-describes.
        importNote.textContent =
          `That copy could not be brought back — ${(err as Error).message} Choose the file again to retry.`;
        resetImport();
        importFile.value = '';
        importGo.disabled = false;
        importBackup.disabled = false;
      }
    });
  }

  // --- the record itself (1.4.0, ADR-0048) ----------------------------------
  //
  // Read-only, behind its control, BUILT ON REVEAL — the coverage list's
  // lesson: hidden DOM is still built DOM, and this list is the whole log.
  // One `store.all()` per open (the same cost the purge count pays), rendered
  // 50 lines at a time with the true total stated; the log is a RECORD, so
  // counts are legal here (law 5 governs scores about work, not receipts).
  // Days come newest first; within a day events read in the order they
  // happened, so a cure sits under its cause.
  const logOpen = document.querySelector<HTMLButtonElement>('#log-open');
  const logView = document.querySelector<HTMLElement>('#log-view');
  const logDays = document.querySelector<HTMLElement>('#log-days');
  const logTotal = document.querySelector<HTMLElement>('#log-total');
  const logMore = document.querySelector<HTMLButtonElement>('#log-more');
  if (logOpen && logView && logDays && logTotal && logMore) {
    const PAGE = 50;
    /** Newest-day-first, within-day chronological — the render order. */
    let ordered: AppEvent[] = [];
    let shown = 0;
    let lastDayEl: { day: string; list: HTMLElement } | null = null;

    const renderMore = (): void => {
      const st = session.state();
      const titleOf = (id: string): string | null => st.nodes.get(id)?.title || null;
      const page = ordered.slice(shown, shown + PAGE);
      for (const e of page) {
        const day = localDayKey(e.at, session.zone);
        if (!lastDayEl || lastDayEl.day !== day) {
          const li = document.createElement('li');
          li.className = 'log-day';
          const h = document.createElement('h4');
          h.className = 'log-day-title';
          h.textContent = new Date(e.at).toLocaleDateString(undefined, {
            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
            timeZone: session.zone,
          });
          const list = document.createElement('ol');
          list.className = 'log-lines';
          li.append(h, list);
          logDays.append(li);
          lastDayEl = { day, list };
        }
        const row = document.createElement('li');
        row.className = isCure(e) ? 'log-line log-cure' : 'log-line';
        const subject = e.node ? titleOf(e.node) : null;
        row.textContent = subject
          ? `“${subject}” — ${eventWords(e, session.zone, titleOf)}`
          : eventWords(e, session.zone, titleOf);
        lastDayEl.list.append(row);
      }
      shown += page.length;
      const left = ordered.length - shown;
      logMore.hidden = left <= 0;
      if (left > 0) {
        logMore.textContent = `Show 50 more — ${shown} of ${ordered.length} shown`;
      }
    };

    logOpen.addEventListener('click', () => {
      const opening = logView.hidden;
      logView.hidden = !opening;
      logOpen.setAttribute('aria-expanded', String(opening));
      // The label says what the NEXT press does. aria-expanded alone told a
      // screen reader the list would collapse, and told a sighted reader
      // nothing (found on device, 1.7.2).
      logOpen.textContent = opening ? 'Close the record' : 'Read the record';
      if (!opening) return;
      void (async () => {
        // Fresh on every open, so the record read is the record now.
        const all = await session.store.all();
        const byDay = new Map<string, AppEvent[]>();
        for (const e of all) {
          const day = localDayKey(e.at, session.zone);
          const bucket = byDay.get(day);
          if (bucket) bucket.push(e); else byDay.set(day, [e]);
        }
        // `all` is ascending, so insertion order of days is oldest→newest;
        // reverse the DAYS and keep each day's own order.
        ordered = [...byDay.values()].reverse().flat();
        shown = 0;
        lastDayEl = null;
        logDays.replaceChildren();
        logTotal.textContent = ordered.length === 1
          ? 'One event — everything above is worked out from it.'
          : `${ordered.length} events — everything above is worked out from these.`;
        renderMore();
      })();
    });
    logMore.addEventListener('click', renderMore);
  }

  // --- composed today, opt-in (1.6.0, ADR-0051) -----------------------------
  // OFF until asked for — a real condition ("Can you make it optional?").
  // The comms-sweep shape: two mutually-exclusive buttons painted from folded
  // state, never a cached flag, and the caveat carries the three beats: off by
  // default, counts nothing, an unfinished choice is not a failure.
  const todayNote = document.querySelector<HTMLElement>('#today-note');
  const paintToday = (): void => {
    const on = todayIsOn(session.state());
    const start = document.querySelector<HTMLButtonElement>('#today-start');
    const stop = document.querySelector<HTMLButtonElement>('#today-stop');
    if (start) start.hidden = on;
    if (stop) stop.hidden = !on;
  };
  paintToday();
  document.querySelector<HTMLButtonElement>('#today-start')?.addEventListener('click', () => {
    void session.commit(ctx => enableModuleEvents(ctx, TODAY_MODULE))
      .then(() => {
        if (todayNote) todayNote.textContent = 'On. Open anything you hold and “Put it in today” is on its sheet — up to five. The chosen few sit above Next up.';
      })
      .catch((err: Error) => { if (todayNote) todayNote.textContent = `That did not work. (${err.message})`; })
      .finally(() => { paintToday(); try { onChange?.(); } catch { /* next pass */ } });
  });
  document.querySelector<HTMLButtonElement>('#today-stop')?.addEventListener('click', () => {
    void session.commit(ctx => disableModuleEvents(ctx, TODAY_MODULE))
      .then(() => {
        if (todayNote) todayNote.textContent = 'Off. Nothing composes, and the record keeps what you chose.';
      })
      .catch((err: Error) => { if (todayNote) todayNote.textContent = `That did not work. (${err.message})`; })
      .finally(() => { paintToday(); try { onChange?.(); } catch { /* next pass */ } });
  });

  // --- things you let go (1.5.0, ADR-0050) ----------------------------------
  //
  // The fix for a standing honesty defect: the trash button has promised "You
  // can still keep it after all" since Phase 3.5, and the button was reachable
  // only while that sheet stayed open — once it closed, the node was off every
  // surface and out of search, and the promise was false. This list is the way
  // back. Capped at 25 with the true count stated; rows carry exactly ONE
  // verb — open the sheet — so the trash never reads as a to-do list.
  const trashOpen = document.querySelector<HTMLButtonElement>('#trash-open');
  const trashView = document.querySelector<HTMLElement>('#trash-view');
  const trashList = document.querySelector<HTMLElement>('#trash-list');
  const trashTotal = document.querySelector<HTMLElement>('#trash-total');
  if (trashOpen && trashView && trashList && trashTotal) {
    const TRASH_CAP = 25;
    const paintTrash = (): void => {
      const rows = trashedNodes(session.state());
      trashTotal.textContent = rows.length === 0
        ? 'Nothing here — you have not let anything go.'
        : rows.length === 1 ? 'One thing.'
          : rows.length <= TRASH_CAP ? `${rows.length} things, newest first.`
            : `${rows.length} things — the ${TRASH_CAP} most recent are shown.`;
      trashList.replaceChildren(...rows.slice(0, TRASH_CAP).map(n => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'trash-row';
        b.textContent = n.title || '(untitled)';
        b.addEventListener('click', () => {
          const fresh = session.state().nodes.get(n.id);
          if (fresh) openDetail?.(fresh);
        });
        li.append(b);
        return li;
      }));
    };
    trashOpen.addEventListener('click', () => {
      const opening = trashView.hidden;
      trashView.hidden = !opening;
      trashOpen.setAttribute('aria-expanded', String(opening));
      // Same rule as the record: the label says what the next press does.
      trashOpen.textContent = opening ? 'Close the list' : 'Things you let go';
      if (opening) paintTrash();
    });
  }

  // The Not Now ledger (1.8.0, ADR-0056) — the trash view's species: a capped,
  // true-counted record of decisions, rows are doors, one verb, built on
  // reveal. A row is a title, a name, and a date — NEVER a count per person
  // (law 5: "declined three times" is a score, and it is not this app's to keep).
  const notnowOpen = document.querySelector<HTMLButtonElement>('#notnow-open');
  const notnowView = document.querySelector<HTMLElement>('#notnow-view');
  const notnowList = document.querySelector<HTMLElement>('#notnow-list');
  const notnowTotal = document.querySelector<HTMLElement>('#notnow-total');
  if (notnowOpen && notnowView && notnowList && notnowTotal) {
    const LEDGER_CAP = 25;
    const paintLedger = (): void => {
      const st = session.state();
      const rows = notNowLedger(st);
      const titleOf = (id: string): string | null => st.nodes.get(id)?.title || null;
      notnowTotal.textContent = rows.length === 0
        ? 'Nothing here — you have not declined anything.'
        : rows.length === 1 ? 'One decision, kept.'
          : rows.length <= LEDGER_CAP ? `${rows.length} decisions, newest first.`
            : `${rows.length} decisions — the ${LEDGER_CAP} most recent are shown.`;
      notnowList.replaceChildren(...rows.slice(0, LEDGER_CAP).map(row => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'trash-row';
        const title = document.createElement('span');
        title.textContent = row.node.notNow?.what || row.node.title || '(untitled)';
        const fact = document.createElement('span');
        fact.className = 'trash-when';
        fact.textContent = ledgerRowWords(row, titleOf, session.zone, new Date().toISOString());
        b.append(title, fact);
        // The DECLINED node's own sheet, even when it has since been folded
        // into something else — that sheet is where "Split back out" lives,
        // and the fact line has already said where it lives now.
        b.addEventListener('click', () => {
          const fresh = session.state().nodes.get(row.node.id);
          if (fresh) openDetail?.(fresh);
        });
        li.append(b);
        return li;
      }));
    };
    notnowOpen.addEventListener('click', () => {
      const opening = notnowView.hidden;
      notnowView.hidden = !opening;
      notnowOpen.setAttribute('aria-expanded', String(opening));
      notnowOpen.textContent = opening ? 'Close the ledger' : 'The Not Now ledger';
      if (opening) paintLedger();
    });
  }

  // The request slot (1.8.0, ADR-0056): one weekday, one LWW setting. Setting
  // a day IS the opt-in; "no day" clears it honestly. The note states what is,
  // never what should be.
  const slotDay = document.querySelector<HTMLSelectElement>('#slot-day');
  const slotSet = document.querySelector<HTMLButtonElement>('#slot-set');
  const slotNote = document.querySelector<HTMLElement>('#slot-note');
  if (slotDay && slotSet && slotNote) {
    const paintSlot = (): void => {
      const day = slotOf(session.state());
      slotDay.value = day ?? '';
      slotNote.textContent = day
        ? `On. Requests you park or decline wait for ${slotDayWords(day)}.`
        : '';
    };
    paintSlot();
    slotSet.addEventListener('click', () => {
      const chosen = (slotDay.value || null) as Parameters<typeof setSlotEvents>[1];
      void session.commit(ctx => setSlotEvents(ctx, chosen))
        .then(() => { paintSlot(); try { onChange?.(); } catch { /* a surface */ } })
        .catch((err: unknown) => {
          slotNote.textContent = `Not set — ${(err as Error).message}`;
        });
    });
  }

  // THE JOURNAL (1.13.0, ADR-0061).
  //
  // The key lives in a closure variable and nowhere else: not in state, not in
  // storage, not on `window`. Closing the journal drops it, and a reload starts
  // locked — which is the point, and is why there is no "stay open" option.
  const jOpen = document.querySelector<HTMLButtonElement>('#journal-open');
  const jView = document.querySelector<HTMLElement>('#journal-view');
  const jState = document.querySelector<HTMLElement>('#journal-state');
  const jSetup = document.querySelector<HTMLElement>('#journal-setup');
  const jWarning = document.querySelector<HTMLElement>('#journal-warning');
  const jNew = document.querySelector<HTMLInputElement>('#journal-new');
  const jSet = document.querySelector<HTMLButtonElement>('#journal-set');
  const jLocked = document.querySelector<HTMLElement>('#journal-locked');
  const jPass = document.querySelector<HTMLInputElement>('#journal-pass');
  const jUnlock = document.querySelector<HTMLButtonElement>('#journal-unlock');
  const jUnlocked = document.querySelector<HTMLElement>('#journal-unlocked');
  const jText = document.querySelector<HTMLTextAreaElement>('#journal-text');
  const jWrite = document.querySelector<HTMLButtonElement>('#journal-write');
  const jLock = document.querySelector<HTMLButtonElement>('#journal-lock');
  const jList = document.querySelector<HTMLElement>('#journal-list');
  if (jOpen && jView && jState && jSetup && jWarning && jNew && jSet
    && jLocked && jPass && jUnlock && jUnlocked && jText && jWrite && jLock && jList) {
    let key: CryptoKey | null = null;
    jWarning.textContent = PASSPHRASE_WARNING.join(' ');

    const showPhase = (phase: 'none' | 'locked' | 'open'): void => {
      jSetup.hidden = phase !== 'none';
      jLocked.hidden = phase !== 'locked';
      jUnlocked.hidden = phase !== 'open';
      // LOCKED IS A CALM STATE, NOT AN ERROR (ADR-0005). Nothing here is a
      // failure to report; it is simply shut, which is what it is for.
      jState.textContent = phase === 'none'
        ? 'No passphrase yet.'
        : phase === 'locked' ? 'The journal is closed.' : 'The journal is open.';
    };

    const paintEntries = async (): Promise<void> => {
      if (!key) { jList.replaceChildren(); return; }
      const log = await session.store.all();
      const rows = await Promise.all(journalEntries(log).map(async e => {
        try {
          const plain = await unseal(key!, e.sealed) as { text?: unknown };
          return { at: e.at, text: typeof plain.text === 'string' ? plain.text : '' };
        } catch {
          // One unreadable entry must not take the journal down with it.
          return null;
        }
      }));
      // Counted for the diagnostic (1.18.0). This is the ONE place in the app
      // that can know it — the key lives here and nowhere else — and an entry
      // that will not open is exactly the kind of thing a person cannot
      // describe in a message but the report can state precisely.
      journalUnreadable = rows.filter(r => r === null).length;
      jList.replaceChildren(...rows.filter(Boolean).map(r => {
        const li = document.createElement('li');
        const day = document.createElement('span');
        day.className = 'trash-when';
        // `recordDayWords`: an entry from another year says which year — the
        // far-date rule, applied to the record surfaces too (1.17.4).
        day.textContent = recordDayWords(r!.at, session.zone, new Date().toISOString());
        const body = document.createElement('span');
        body.textContent = r!.text;
        li.append(body, day);
        return li;
      }));
    };

    const refreshJournal = async (): Promise<void> => {
      const sealInfo = journalSeal(await session.store.all());
      if (!sealInfo) { showPhase('none'); return; }
      showPhase(key ? 'open' : 'locked');
      if (key) await paintEntries();
    };

    jOpen.addEventListener('click', () => {
      const opening = jView.hidden;
      jView.hidden = !opening;
      jOpen.setAttribute('aria-expanded', String(opening));
      jOpen.textContent = opening ? 'Close this' : 'Open the journal';
      if (opening) void refreshJournal();
    });

    jSet.addEventListener('click', () => {
      const pass = jNew.value;
      if (!pass) { jState.textContent = 'A passphrase is needed first.'; return; }
      const salt = newSalt();
      void deriveKey(pass, salt, KDF_ITERATIONS)
        .then(async k => {
          await session.commit(ctx => sealJournalEvents(ctx, salt, KDF_ITERATIONS));
          key = k; jNew.value = '';
          await refreshJournal();
        })
        .catch((err: unknown) => { jState.textContent = `Not set — ${(err as Error).message}`; });
    });

    jUnlock.addEventListener('click', () => {
      const pass = jPass.value;
      void (async () => {
        const sealInfo = journalSeal(await session.store.all());
        if (!sealInfo) return;
        try {
          const k = await deriveKey(pass, sealInfo.salt, sealInfo.iterations);
          // PROVE the key before saying it is open. A wrong passphrase derives a
          // perfectly valid key that opens nothing, so unlocking on derivation
          // alone would show an empty journal and call it success — which reads
          // as "your entries are gone".
          const entries = journalEntries(await session.store.all());
          if (entries.length > 0) await unseal(k, entries[0]!.sealed);
          key = k; jPass.value = '';
          await refreshJournal();
        } catch {
          // seal.ts is deliberate about saying ONE thing here, and so is this.
          jState.textContent = 'That passphrase does not open this journal.';
        }
      })();
    });

    jWrite.addEventListener('click', () => {
      const text = jText.value.trim();
      if (!key || !text) return;
      void (async () => {
        const sealed = await seal(key!, { text });
        await session.commit(ctx => entryEvents(ctx, ctx.id(), sealed));
        jText.value = '';
        await paintEntries();
      })().catch((err: unknown) => { jState.textContent = `Not kept — ${(err as Error).message}`; });
    });

    jLock.addEventListener('click', () => {
      key = null;
      jText.value = '';
      jList.replaceChildren();
      void refreshJournal();
    });
  }

  // How long a timer runs (1.10.0, ADR-0059). Set here, calmly, and never at
  // the point of starting — showing options to someone stuck at activation is
  // choice overload where it costs most (thesis §4). The start button then
  // names the chosen length, so the common path stays one tap and no decision.
  const timerLen = document.querySelector<HTMLSelectElement>('#timer-length');
  const timerSet = document.querySelector<HTMLButtonElement>('#timer-length-set');
  const timerNote = document.querySelector<HTMLElement>('#timer-length-note');
  if (timerLen && timerSet && timerNote) {
    const paintTimer = (): void => {
      const mins = timerMinutesOf(session.state());
      timerLen.value = String(mins);
      timerNote.textContent = `${timerWords(mins)} when you start one.`;
    };
    paintTimer();
    timerSet.addEventListener('click', () => {
      const chosen = Number(timerLen.value);
      void session.commit(ctx => setTimerLengthEvents(ctx, chosen))
        .then(() => { paintTimer(); try { onChange?.(); } catch { /* a surface */ } })
        .catch((err: unknown) => {
          timerNote.textContent = `Not set — ${(err as Error).message}`;
        });
    });
  }

  // (The two ways out and the focus return are wired at the TOP of this function,
  // before anything that can throw. See the note there.)

  // Open immediately, fill after — a button that stalls while it awaits storage
  // is exactly the kind of gap this app exists to be free of.
  const show = (firstRun: boolean): void => {
    intro.hidden = !firstRun;
    dialog.showModal();
    void paintStorage();
    // The calendar count is recomputed on every open. It used to be painted once
    // at mount, so reopening the panel showed the PREVIOUS action's outcome —
    // "Sent. Open the file…" — indefinitely, whatever had changed since (audit).
    paintCalendar();
    // Anchors likewise: the list and the picker are read from the log at open,
    // for the same reason — a panel that paints once at mount shows the state
    // the app was in when it started, not the state it is in now (1.17.0).
    void paintAnchors().catch(() => { /* the next open repaints it */ });
  };

  // --- sample work ---------------------------------------------------------
  //
  // Through `session.commit`, which is the app's own write path: it admits and
  // appends in one queued transaction. Nothing here is privileged, so the sample
  // set cannot demonstrate a state the app would refuse — and a bug in the
  // generator surfaces as a refusal rather than as a corrupt store.
  const sampleButton = document.querySelector<HTMLButtonElement>('#sample');
  const sampleNote = document.querySelector<HTMLElement>('#sample-note');
  if (sampleButton && sampleNote) {
    sampleButton.addEventListener('click', () => {
      void (async () => {
        sampleButton.disabled = true;
        try {
          const at = new Date().toISOString();
          // Generated ONCE and captured, so the number reported is counted from
          // the very events that were committed. Generating a second set to count
          // would be two sources for one fact, which is the shape that has caused
          // more defects here than any other.
          let made: AppEvent[] = [];
          await session.commit(ctx => {
            made = sampleEvents(ctx, at);
            return made;
          });
          sampleNote.textContent = `${sampleWords(sampleSummary(made))} Reloading…`;
          setTimeout(() => location.reload(), 500);
        } catch (err) {
          // Said plainly, and the button comes back. A refusal here means the
          // generator produced something the gate would not take, which is a
          // defect in the sample set and not something the reader did.
          sampleNote.textContent =
            `That could not be added — ${(err as Error).message} Nothing was changed.`;
          sampleButton.disabled = false;
        }
      })();
    });
  }

  // --- a whole invented life, as a file (1.16.0, ADR-0067) ------------------
  //
  // Three things this does NOT do, each of them deliberate:
  //
  //  - **It does not touch the store.** The demonstration set above appends, and
  //    at fourteen things that is a fair trade. At this size it is not: there is
  //    no verb that takes just these back out, and there must not be one (law 9
  //    — that is `import.merged` in costume). So it makes a file and the ordinary
  //    import brings it in, with the warning that already exists.
  //  - **It records no event.** `deliverGeneratedSet` writes nothing, because
  //    nothing happened to your data. Recording `export.written` would make the
  //    "Last copy" row claim a backup containing none of your work.
  //  - **It does not go through `session.commit`.** It still goes through the
  //    real `admit` — the file must be one the app would have written, and
  //    `inspectExport` refuses anything that folds to a silent node — but the
  //    admitted events go into the file rather than into this device's log.
  const bigButton = document.querySelector<HTMLButtonElement>('#big-sample');
  const bigNote = document.querySelector<HTMLElement>('#big-sample-note');
  if (bigButton && bigNote) {
    bigButton.addEventListener('click', () => {
      void (async () => {
        bigButton.disabled = true;
        // Said BEFORE the work starts: deriving the journal key is PBKDF2 at
        // 600,000 iterations and the set is a few thousand events, so there is a
        // real pause here and a silent button reads as a broken one.
        bigNote.textContent = 'Making it…';
        try {
          const at = new Date().toISOString();
          let n = 0, s = 0;
          const offered = await bigSampleEvents({
            at, device: session.device, vault: 'personal', zone: session.zone,
            seq: () => s++, id: () => `sample-${at}-${n++}`,
          }, at);
          // The real write boundary, exactly as a keystroke takes it. A set that
          // needed a private door would be demonstrating a state the app does
          // not permit — and would be refused on the way back in anyway.
          const admitted = admit(offered, fold([]), gateOptionsFor(session.zone));
          await deliverGeneratedSet(session, {
            format: 'planner-log', version: 1, at, scope: 'sample-set',
            encrypted: false, logJsonl: toJsonl(admitted), snapshot: null,
          }, at);
          bigNote.textContent = bigSampleWords(bigSampleSummary(admitted));
        } catch (err) {
          // A refusal here is a defect in the generator, not something the
          // reader did, and the sentence says so rather than blaming them.
          bigNote.textContent =
            `That set could not be made — ${(err as Error).message} Nothing on this device changed.`;
        } finally {
          bigButton.disabled = false;
        }
      })();
    });
  }

  // --- the number on the icon -----------------------------------------------
  //
  // `aria-pressed` carries the STATE and the label says what pressing it does, so
  // the control is unambiguous read either way round. A button whose label is its
  // own state ("Badge: on") makes somebody guess whether pressing it describes or
  // changes — and this audience should never have to run that experiment on their
  // own home screen.
  const badgeToggle = document.querySelector<HTMLButtonElement>('#badge-toggle');
  const badgeNote = document.querySelector<HTMLElement>('#badge-note');
  if (badgeToggle && badgeNote) {
    const paintToggle = (): void => {
      const on = isBadgeOn();
      badgeToggle.textContent = badgeToggleLabel(on);
      badgeToggle.setAttribute('aria-pressed', String(on));
      badgeNote.textContent = badgeWords(on);
    };
    paintToggle();
    badgeToggle.addEventListener('click', () => {
      void (async () => {
        badgeToggle.disabled = true;
        try {
          await setBadgeEnabled(session.store, !isBadgeOn());
        } catch {
          // Said plainly rather than swallowed: a switch that silently did not
          // stick is worse than one that admits it.
          badgeNote.textContent = 'That could not be saved, so it will be back next time you open the app.';
        } finally {
          badgeToggle.disabled = false;
          paintToggle();
        }
      })();
    });
  }

  // --- work from another planner --------------------------------------------
  //
  // Read, PARSED, and reported BEFORE anything is written — the same shape as
  // bringing a copy back. Somebody about to add two thousand rows to their planner
  // should see what the file contained, and what will not come with it, while it is
  // still a choice.
  const otherFile = document.querySelector<HTMLInputElement>('#other-file');
  const otherNote = document.querySelector<HTMLElement>('#other-note');
  const otherActions = document.querySelector<HTMLElement>('#other-actions');
  const otherGo = document.querySelector<HTMLButtonElement>('#other-go');
  if (otherFile && otherNote && otherActions && otherGo) {
    let staged: ReturnType<typeof parseAnyExport> | null = null;
    otherFile.addEventListener('change', () => {
      void (async () => {
        const file = otherFile.files?.[0];
        staged = null;
        otherActions.hidden = true;
        if (!file) { otherNote.textContent = ''; return; }
        try {
          const parsed = parseAnyExport(await file.text());
          const summary = importSummary(parsed.lines, parsed.unreadable, new Date().toISOString(), session.zone);
          otherNote.textContent = `${importWords(summary)} Read as ${parsed.format === 'csv' ? 'CSV' : 'TaskPaper'}.`;
          if (summary.projects + summary.actions > 0) {
            staged = parsed;
            otherActions.hidden = false;
          }
        } catch (err) {
          otherNote.textContent = `That file could not be read — ${(err as Error).message} Nothing has been changed.`;
        }
      })();
    });

    otherGo.addEventListener('click', () => {
      void (async () => {
        if (!staged) return;
        otherGo.disabled = true;
        try {
          const lines = staged.lines;
          // The app's own write path, so somebody else's planner gets no more
          // trust than a keystroke does and law 1 is enforced on every row.
          let made: AppEvent[] = [];
          await session.commit(ctx => {
            made = taskPaperEvents(ctx, lines);
            return made;
          });
          otherNote.textContent = `Brought in ${made.filter(e => e.kind === 'node.created').length} things. Reloading…`;
          setTimeout(() => location.reload(), 500);
        } catch (err) {
          otherNote.textContent =
            `That could not be brought in — ${(err as Error).message} Nothing was changed.`;
          otherGo.disabled = false;
        }
      })();
    });
  }

  // --- clearing things out --------------------------------------------------
  //
  // The guard is a typed word, NOT a held button: hold-to-confirm is a dexterity
  // test and tremor is a supported condition, so a shaking hand would be locked
  // out of its own data. Typing tests intent, which is the thing being checked.
  //
  // The two modes take different words, and **switching mode clears the field** —
  // the UI half of the same protection. Without it, typing the reversible mode's
  // word and then switching would leave a satisfied-looking control in front of
  // the irreversible one.
  const purgeSummaryEl = document.querySelector<HTMLElement>('#purge-summary');
  const purgeConfirm = document.querySelector<HTMLElement>('#purge-confirm');
  const purgeConsequence = document.querySelector<HTMLElement>('#purge-consequence');
  const purgeWordRequired = document.querySelector<HTMLElement>('#purge-word-required');
  const purgeWordInput = document.querySelector<HTMLInputElement>('#purge-word');
  const purgeGo = document.querySelector<HTMLButtonElement>('#purge-go');
  const purgeCancel = document.querySelector<HTMLButtonElement>('#purge-cancel');
  const purgeNote = document.querySelector<HTMLElement>('#purge-note');
  const purgeBackup = document.querySelector<HTMLButtonElement>('#purge-backup');
  const purgeBackupNote = document.querySelector<HTMLElement>('#purge-backup-note');
  const purgePickClear = document.querySelector<HTMLButtonElement>('#purge-pick-clear');
  const purgePickErase = document.querySelector<HTMLButtonElement>('#purge-pick-erase');

  if (purgeSummaryEl && purgeConfirm && purgeConsequence && purgeWordRequired
      && purgeWordInput && purgeGo && purgeCancel && purgeNote && purgeBackup
      && purgeBackupNote && purgePickClear && purgePickErase) {
    let mode: PurgeMode | null = null;
    let savedACopy = false;

    const counted = async (): Promise<PurgeCount> =>
      purgeCount(session.state(), await session.store.all());
    /** Is there a pairing to lose? Asked of the store, not of the sync module. */
    const isPaired = async (): Promise<boolean> =>
      typeof (await session.store.getKv<string>(KEY_KV)) === 'string';

    const paintSummary = async (): Promise<void> => {
      purgeSummaryEl.textContent = purgeSummary(await counted());
    };
    await paintSummary();

    const close = (): void => {
      mode = null;
      purgeConfirm.hidden = true;
      // Cleared on every exit, not only on cancel. A word left in the box is an
      // authorisation left lying next to a button.
      purgeWordInput.value = '';
      purgeGo.disabled = true;
    };

    const pick = async (m: PurgeMode): Promise<void> => {
      mode = m;
      purgeWordInput.value = '';
      purgeGo.disabled = true;
      purgeWordRequired.textContent = CONFIRM_WORD[m];
      // Counted and WRITTEN before the block is revealed. Unhiding first left the
      // consequence line visible and empty for as long as the store read took —
      // an empty paragraph above a button, in the one place where the sentence is
      // the entire safeguard. Revealing a surface before it can say anything is a
      // small version of the same mistake as saying it wrongly.
      // Read from kv rather than from the sync module: this file ships in BOTH
      // editions and the default one may not contain that module at all
      // (ADR-0036). The key's presence is the whole question being asked.
      purgeConsequence.textContent = purgeWords(m, await counted(), savedACopy, await isPaired());
      purgeConfirm.hidden = false;
      purgeWordInput.focus();
    };

    purgePickClear.addEventListener('click', () => { void pick('clear'); });
    purgePickErase.addEventListener('click', () => { void pick('start-again'); });
    purgeCancel.addEventListener('click', () => {
      close();
      purgeNote.textContent = 'Left alone. Nothing changed.';
    });

    purgeWordInput.addEventListener('input', () => {
      purgeGo.disabled = mode === null || !confirmMatches(mode, purgeWordInput.value);
    });

    purgeBackup.addEventListener('click', () => {
      void (async () => {
        purgeBackup.disabled = true;
        try {
          await deliverExport('all', 'json');
          savedACopy = true;
          purgeBackupNote.textContent = 'Copy saved. Check it opened before going further.';
          // The consequence line is live: it states whether a copy exists, and it
          // must say so NOW rather than the next time the mode is picked.
          if (mode) purgeConsequence.textContent = purgeWords(mode, await counted(), savedACopy, await isPaired());
        } catch (err) {
          purgeBackupNote.textContent =
            `That copy could not be saved — ${(err as Error).message} Nothing has been cleared.`;
        } finally {
          purgeBackup.disabled = false;
        }
      })();
    });

    purgeGo.addEventListener('click', () => {
      void (async () => {
        if (!mode || !confirmMatches(mode, purgeWordInput.value)) return;
        const chosen = mode;
        purgeGo.disabled = true;
        try {
          const before = await counted();
          const wasPaired = await isPaired();
          if (chosen === 'clear') {
            // Through the app's own write path, so law 1 is enforced on the way
            // out exactly as on the way in.
            await session.commit(ctx => clearEvents(ctx, session.state()));
          } else {
            // The one operation in this app that destroys data on purpose — and
            // the one that has to UNPAIR first, or a still-live pairing refills
            // the planner it just emptied. Both halves live in `eraseEverything`
            // so the order cannot be got wrong here.
            await eraseEverything(session.store);
          }
          close();
          purgeNote.textContent = `${purgedWords(chosen, before, wasPaired)} Reloading…`;
          setTimeout(() => location.reload(), 500);
        } catch (err) {
          purgeNote.textContent =
            `That did not go through — ${(err as Error).message} Nothing was changed.`;
          purgeGo.disabled = false;
        }
      })();
    });
  }

  // --- the diagnostic report (1.18.0, §7f, ADR-0071) -----------------------
  //
  // Gathered HERE and shaped in `src/diagnostic.ts`, which is pure and cannot
  // read a browser: everything device-shaped is looked up once, at the moment
  // the reader asks, and handed over as arguments. Nothing is painted at mount
  // — a report is a snapshot of NOW, and one painted at startup would describe
  // the app as it was when it launched (the paintCalendar lesson, restated).
  {
    const showBtn = document.querySelector<HTMLButtonElement>('#diagnostic-show');
    const copyBtn = document.querySelector<HTMLButtonElement>('#diagnostic-copy');
    const saveBtn = document.querySelector<HTMLButtonElement>('#diagnostic-save');
    const out = document.querySelector<HTMLElement>('#diagnostic-text');
    const dnote = document.querySelector<HTMLElement>('#diagnostic-note');

    /** Everything the pure module cannot find out for itself. */
    const reading = async (): Promise<DeviceReading> => {
      const r = await read();
      // The cache name proves which build is actually being SERVED, which is a
      // different fact from the one the version stamp shows — a device running
      // a stale worker reports the new triplet and the old code.
      let cache: string | null = null;
      let caches: string[] = [];
      try {
        const names = await globalThis.caches?.keys();
        caches = (names ?? []).filter(k => k.startsWith('quietkeep'));
        cache = caches[0] ?? null;
      } catch { /* no Cache API, or a browser refusing it — 'not answering' */ }
      // §7h.4. TWO caches is the signature of a half-finished update, and
      // reporting only the first hides exactly that — the state this whole
      // release exists to make visible. Controlled/waiting come with it: a
      // reader running an old build with a new one waiting is the case the
      // version stamp alone cannot tell from being current.
      let controlled = false;
      let waiting = false;
      try {
        const sw = globalThis.navigator?.serviceWorker;
        controlled = sw?.controller != null;
        waiting = (await sw?.getRegistration())?.waiting != null;
      } catch { /* no worker, or an engine refusing it */ }
      const swOrigin = globalThis.location?.origin ?? null;
      // Asked of the store, never of the sync module: this file ships in BOTH
      // editions and the default one does not contain that module (ADR-0036).
      let paired = false;
      try { paired = typeof (await session.store.getKv<string>(KEY_KV)) === 'string'; } catch { /* not paired */ }
      return {
        triplet: CURRENT.triplet,
        edition: editionOf(globalThis.location?.hostname ?? ''),
        cache,
        caches,
        controlled,
        waiting,
        origin: swOrigin,
        device: session.device,
        zone: session.zone,
        installed: globalThis.matchMedia?.('(display-mode: standalone)').matches === true
          || (globalThis.navigator as { standalone?: boolean }).standalone === true,
        storageSupported: r.supported,
        persisted: r.persisted,
        quotaMb: r.quotaMb,
        usageMb: r.usageMb,
        paired,
        // Null, not zero. Only the journal surface holds the key, and "we did
        // not look" is a different fact from "we looked and they all opened" —
        // reporting the second when the first is true is how a report sends
        // somebody hunting in the wrong place.
        unreadableEntries: journalUnreadable,
      };
    };

    let text = '';
    const paint = async (): Promise<void> => {
      const log = await session.store.all();
      text = diagnosticReport(session.state(), log, await reading(), new Date().toISOString());
      if (out) { out.textContent = text; out.hidden = false; }
      if (copyBtn) copyBtn.hidden = false;
      if (saveBtn) saveBtn.hidden = false;
      if (showBtn) showBtn.textContent = 'Take it again';
    };

    showBtn?.addEventListener('click', () => {
      void paint().catch((err: Error) => {
        // A diagnostic that cannot say why it failed is the one thing this
        // control may never be.
        if (dnote) { dnote.hidden = false; dnote.textContent = `The report could not be built — ${err.message}`; }
      });
    });

    copyBtn?.addEventListener('click', () => {
      void (async () => {
        if (!dnote) return;
        dnote.hidden = false;
        try {
          await navigator.clipboard.writeText(text);
          dnote.textContent = 'Copied. Paste it wherever you are reporting the problem.';
        } catch {
          // Selectable text is the fallback and it is always there, which is
          // why the report is a <pre> and not a canvas or a set of rows.
          dnote.textContent = 'This browser would not let the app copy for you — select the text below and copy it yourself.';
        }
      })();
    });

    saveBtn?.addEventListener('click', () => {
      void (async () => {
        if (!dnote) return;
        dnote.hidden = false;
        try {
          // Records NOTHING: no data of yours is in it, so moving "Last copy"
          // would claim a backup that does not exist (1.16.0's trap).
          await deliverDiagnostic(session, text, new Date().toISOString());
          dnote.textContent = 'Saved. It is a plain text file — open it and read it before you send it.';
        } catch (err) {
          dnote.textContent = `That file could not be saved — ${(err as Error).message}`;
        }
      })();
    });
  }

  open.addEventListener('click', () => show(false));

  // The build stamp in the footer is the diagnostic's other door (§7f: "the
  // version stamp is a good home"). Same shape as `#restore-go` below: open the
  // panel, unfold the group through its own toggle so the choice is remembered
  // the way every other unfold is, then scroll and focus.
  document.querySelector<HTMLButtonElement>('#build-version')?.addEventListener('click', () => {
    show(false);
    const toggle = document.querySelector<HTMLButtonElement>('#group-about-open');
    if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
    const btn = document.querySelector<HTMLButtonElement>('#diagnostic-show');
    btn?.scrollIntoView({ block: 'center' });
    btn?.focus();
  });

  // The way back, from the empty screen (1.14.0, ADR-0062).
  //
  // ADR-0004 asked for "one action, one tap, into the picker". This is that tap,
  // and it deliberately does NOT put a second file input on the main page. The
  // note beside `#import-file` is load-bearing: on iPadOS the hidden-input trick
  // loses the Files app entry point, so there is exactly one real input in this
  // app and this control delivers you to it — panel open, group unfolded, focus
  // on the input itself. A second one would be a second chance to reintroduce
  // the trap that comment exists to record.
  //
  // The unfold goes through the group's own toggle rather than reaching into the
  // element, so the choice is remembered the same way every other unfold is.
  document.querySelector<HTMLButtonElement>('#restore-go')?.addEventListener('click', () => {
    show(false);
    const toggle = document.querySelector<HTMLButtonElement>('#group-data-open');
    if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
    const input = document.querySelector<HTMLInputElement>('#import-file');
    // Scroll first, then focus: `#about-body` is the sole scroll container and
    // the import section sits well down it, so focusing alone would leave the
    // label — which says what to choose — above the fold.
    input?.scrollIntoView({ block: 'center' });
    input?.focus();
  });

  // --- first run -----------------------------------------------------------
  // SEEN is written when the introduction is DISMISSED, not when it is shown:
  // for this audience interruption is the expected case (ADR-0008), and a
  // crash on first paint must not burn the one-time introduction unread.
  // The write is AWAITED and its completion flagged on the document, so a
  // reload immediately after closing cannot race the persistence and re-show
  // the intro — a race the audit-fix first introduced, caught in CI.
  const seen = await session.store.getKv<boolean>(SEEN);
  // The WALKTHROUGH now owns first run (src/ui/tour.ts). It sets `about.seen`
  // when it finishes, and opens this panel for the storage step itself — so the
  // old auto-open only fires for someone who somehow reached here with the intro
  // unseen AND the walkthrough already done. Gating on `tour.seen` is what stops
  // the two ever showing at once on a brand-new device.
  const tourSeen = await session.store.getKv<boolean>('tour.seen');
  if (!seen && tourSeen) {
    dialog.addEventListener('close', () => {
      void session.store.setKv(SEEN, true).then(() => {
        document.body.dataset.introDismissed = 'true';
      });
    }, { once: true });
    show(true);
  } else if (seen) {
    document.body.dataset.introDismissed = 'true';
  }
  // When neither is set, the walkthrough will set `introDismissed` as it exits;
  // leaving it unset here is what makes the headless walk wait for that.
}
