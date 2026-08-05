// A set of sample work, for trying the app out without inventing a life first.
//
// A requirement: a set of test data that can be imported. Two things make it harder
// than it sounds, and both are the reason this is a generator rather than a file:
//
// **It must be relative-dated.** A fixture with `2026-07-30` in it is a fixture
// that is wrong tomorrow and absurd next year — and this app's whole surface is
// temporal, so a stale fixture does not merely look odd, it exercises the wrong
// code paths. Every instant here is computed from the `now` it is handed.
//
// **It must pass the real write boundary.** Sample data that skipped `admit`
// would be sample data that can violate law 1, which would make the app's own
// demonstration a lie about what the app permits. Nothing here is privileged; it
// goes in through the same door as a keystroke.
//
// It deliberately includes the awkward states, not just the tidy ones — something
// whose date has gone by, something waiting on another person, something with no
// clock sitting on the Menu, an unsorted capture or two. A demonstration made
// only of well-behaved rows teaches nothing about the surface that matters.
//
// The content is original. No trigger-list material and nothing that reads as a
// personality: civilian errands and ordinary work, in the app's own voice.
//
// PURE. `now`, the zone and the id/seq stamping are all injected.

import type { AppEvent } from './events.ts';
import { endOfLocalDay } from './time.ts';

/** What a caller must provide to stamp events. Structurally the UI's
 *  `StampContext`, restated here so this module does not import from `src/ui`
 *  and stays usable from a script and a test. */
export interface SampleContext {
  at: string;
  device: string;
  vault: string;
  zone: string;
  seq: () => number;
  id: () => string;
}

export interface SampleSummary {
  /** How many events the set is made of. */
  events: number;
  /** How many things it puts on a surface, so a caller can say a true number. */
  nodes: number;
}

/**
 * The sample set.
 *
 * Ordered so it reads like somebody's afternoon rather than a schema dump:
 * things get captured, then sorted, then dated. That ordering is not decoration —
 * `admit` folds each event against the state the previous ones produced, so a
 * parent must exist before a child names it, and a clock cannot precede the node
 * it is attached to.
 */
export function sampleEvents(ctx: SampleContext, nowIso: string): AppEvent[] {
  const out: AppEvent[] = [];
  const stamp = (kind: string, node: string, payload: unknown): AppEvent => {
    const e = {
      id: ctx.id(), vault: ctx.vault, at: ctx.at, device: ctx.device, seq: ctx.seq(),
      kind, node, payload,
    } as unknown as AppEvent;
    out.push(e);
    return e;
  };

  /** End of a local day, `days` from now. Clocks in this app are end-of-day
   *  instants (ADR-0009), and a sample set that used midday would look subtly
   *  wrong on every surface that renders one. */
  const day = (days: number): string => endOfLocalDay(nowIso, ctx.zone, days);

  const node = (
    nodeKind: string,
    title: string,
    extra?: { parent?: string },
  ): string => {
    const id = ctx.id();
    stamp('node.created', id, {
      nodeKind, title, provenance: { for: 'self' },
      ...(extra?.parent === undefined ? {} : { parent: extra.parent }),
    });
    return id;
  };

  const due = (id: string, days: number): void => {
    stamp('clock.set', id, { clockKind: 'due', at: day(days), source: 'sample' });
  };

  // --- a project with real children, one of which is ready ------------------
  //
  // The containment case: a parent under no clock of its own, held up by
  // children that are. This is the shape law 1 permits and the shape a flat
  // to-do list cannot express, so it is the first thing a demonstration needs.
  const kitchen = node('project', 'Get the kitchen tap fixed');
  // A review clock on the container itself, chosen rather than left to the gate.
  // Law 1 is satisfied per node and containment satisfies the CHILD: a parent
  // whose children are all clocked is still silent, because nothing brings the
  // parent back. The gate cures that at creation like it does for any node, but a
  // demonstration should show a container somebody deliberately said "look at
  // this in a week" about, not one wearing whatever the cure picked.
  stamp('clock.set', kitchen, { clockKind: 'review', at: day(7), source: 'sample' });
  const ring = node('action', 'Ring the plumber back about the tap', { parent: kitchen });
  due(ring, 0);
  const measure = node('action', 'Measure the gap under the sink', { parent: kitchen });
  due(measure, 2);

  // --- something with a date that has gone by ------------------------------
  //
  // There is no past bucket (law 3): a passed date becomes a present decision.
  // A sample set without one hides the single most characteristic surface in the
  // app, and the one most worth seeing before trusting it with anything.
  const bins = node('action', 'Put the recycling out for collection');
  stamp('clock.set', bins, { clockKind: 'due', at: day(-3), source: 'sample' });

  // --- something with another person in it ---------------------------------
  const alex = node('person', 'Alex');
  const quote = node('waiting-for', 'Quote for the guttering');
  stamp('person.linked', quote, { node: quote, person: alex, relation: 'waiting-on' });
  stamp('waiting.opened', quote, { person: alex, forWhat: 'the written quote', since: day(-6) });
  // The day you would chase it. Waiting on somebody is not a reason for a thing
  // to go quiet, which is the entire point of the kind.
  stamp('clock.set', quote, { clockKind: 'suspense', at: day(4), source: 'sample' });

  // --- upkeep, which is a rhythm and not a deadline ------------------------
  //
  // One decay primitive runs everything temporal (law 5). No streaks, and
  // nothing here says a number of days in a row.
  const filter = node('upkeep', 'Change the water filter');
  // Both numbers, because the type requires both and the pair IS the primitive:
  // an interval with no comfort window would be a deadline wearing a rhythm's name.
  stamp('upkeep.interval.set', filter, { intervalDays: 60, comfortWindowDays: 14 });
  stamp('done.marked', filter, { at: day(-40) });

  // --- the Menu: wanted, not owed ------------------------------------------
  //
  // Demand-free kinds carry no clocks (law 6). Something here must be genuinely
  // unpressured, or the demonstration teaches that everything in this app asks.
  const atlas = node('aspiration', 'Read the big atlas properly, a country at a time');
  stamp('menu.item.added', atlas, { category: 'read' });
  const shelf = node('aspiration', 'Build the shelf for the hallway');
  stamp('menu.item.added', shelf, { category: 'make' });

  // --- unsorted, because an inbox with nothing in it teaches nothing --------
  for (const text of [
    'Ask about the parking permit renewal',
    'Find out whether the library takes the old maps',
  ]) {
    const id = ctx.id();
    stamp('capture.recorded', id, { text, source: 'sample' });
  }

  // --- a second area, so the list has more than one shape in it ------------
  const admin = node('area', 'Household paperwork');
  const insurance = node('action', 'Compare the two insurance renewals', { parent: admin });
  due(insurance, 5);

  return out;
}

/** What the set contains, counted from the events themselves rather than from a
 *  number typed beside them — a hand-maintained count is a claim that goes stale
 *  the first time somebody adds a row. */
export function sampleSummary(events: readonly AppEvent[]): SampleSummary {
  const nodes = new Set<string>();
  for (const e of events) {
    if (e.node === null) continue;
    if (e.kind === 'node.created' || e.kind === 'capture.recorded') nodes.add(e.node);
  }
  return { events: events.length, nodes: nodes.size };
}

/**
 * What to say before loading it, and it has to be honest about two things: the
 * sample work is indistinguishable from real work once it is in, and there is no
 * single button that takes just this back out again.
 */
export function sampleWords(s: SampleSummary): string {
  return `${s.nodes} sample things, dated around today. They go in beside anything you already have and behave exactly like your own work — including being yours to sort out afterwards.`;
}
