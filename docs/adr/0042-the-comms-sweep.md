# ADR-0042 — The comms sweep appears on the way out, and nowhere else

*2026-07-29 · Accepted · shipped 0.17.0*

## Context

Build-plan item 22 — *"comms-sweep chip on focus-exit ramps"* — was deferred out
of Phase 3 with the reason written down at the time: **"needs focus ramps, which
are Phase 4."** Focus ramps shipped in 0.14.0, so the reason was spent and this
is the last item of the frozen v1 Must list.

The problem is not "check your email". It is that messages arrive continuously
and attention does not divide. Left alone the habit becomes a check every few
minutes — each one cheap, all of them together the whole day — and for this
audience the cost of resuming after each interruption is the part nobody budgets
for.

## Decision

### The chip appears only on the focus-exit ramp

`commsChip` requires **two** conditions, and both:

1. `surfacing` — you have just come out of a focus session;
2. the sweep has come round, by the same decay primitive as every other
   repeating thing.

Either alone is wrong. Without (1) it is a notification wearing different
clothes, and it would be the exact interruption it exists to consolidate.
Without (2), surfacing four times in an hour offers four sweeps, which *is* the
habit it replaces.

`surfacing` is held **in memory and never as an event**. It is a property of this
sitting, not of your history; persisting it would mean the chip greeting you on a
cold start tomorrow morning, which is precisely the arriving-unbidden behaviour
the design refuses. Starting a focus lowers it, because you are back in
something.

### It is off until asked for

A planner that arrives having decided you should check your messages twice a day
has made a decision about your working life it was not asked to make. There is no
sweep node until someone presses the button, and the app is complete without one.

### Declining writes nothing

"Not now" is a UI state and nothing else. An event is a record, and a record of
every time you did not do something is the ledger this app exists to not keep
(law 5). There is no `sweep.declined` in the vocabulary and there will not be
one. The projection is the proof: it comes round on the ordinary decay, exactly
as if it had never asked.

### It counts nothing

No badge, no unread count, no colour. An unread count is the single most
effective piece of shame-by-arithmetic in software, and this app cannot see your
messages anyway. The words are an offer and a duration — *"Last pass through your
messages was 6 days ago."* — and never *"you haven't checked since Tuesday"*,
which is the same sentence with a finger pointed.

### It is an upkeep with a marker field, not a new kind

A field (`comms-sweep`), because it behaves exactly like an upkeep in every
respect that matters: it decays, it completes, it can be turned off. A new kind
would mean teaching every projection in the app about something they already know
how to handle.

## Consequences

- **Turning it on records a pass, in the same transaction.** `pressureOf` reads a
  never-completed upkeep as **ready**, so without this the sweep was due the
  instant you said yes — while the clock written two lines above said tomorrow.
  Two facts about one node disagreeing is the class of defect this codebase keeps
  finding, and here the first thing the feature ever did would have been to
  interrupt you for enabling it. It is also simply true: you are at a settings
  panel, so you have almost certainly just looked.
- **Turning it off trashes rather than deletes.** It happened, the log says so,
  and turning something off is a decision worth being able to see.
- **The smoke fixture had to delete the creation-time pass, not just add an older
  one.** LWW is on `at` first, so an added backdated `done.marked` can never win —
  the first version of that fixture quietly changed nothing and the walk was
  asserting against a state it had failed to create. Removing both and writing
  one produces the honest state being simulated.
