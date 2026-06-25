# Decisions & Assumptions

## Services & clinician matching

- **Three service types** (`src/scheduling/eligibility.ts`):
  - `PSYCHOLOGIST_ASSESSMENT` — PSYCHOLOGIST, two 90-min sessions (offered as pairs).
  - `THERAPY_INTAKE` — THERAPIST, one 60-min session.
  - `THERAPY_SIXTY_MINS` — THERAPIST, one 60-min session.
- A patient is only matched to a clinician who **operates in their state** and
  **accepts their insurance** (per the README) and is the **right clinician
  type** for the service.

## Prior-relationship rule (intake vs. ongoing)

- Booking is **per-clinician and one-time** for new-patient services. The
  prior-appointment requirement **flips by service**:
  - `PSYCHOLOGIST_ASSESSMENT` & `THERAPY_INTAKE` require **no prior appointment**
    with that clinician — you can't book a first intake/assessment with someone
    you've already seen.
  - `THERAPY_SIXTY_MINS` requires an **existing relationship** (a prior
    appointment) — it's ongoing therapy.
- "Has the patient seen this clinician?" counts any appointment with statuses
  `UPCOMING` or `OCCURRED`. `CANCELLED`, `NO_SHOW`, `LATE_CANCELLATION` and
  `RE_SCHEDULED` do **not** establish a relationship.
- **Why `THERAPY_SIXTY_MINS` at all?** The README says recurring therapy is
  booked offline (in-session/by chat), not via patient self-scheduling. We still
  model it so a **therapist booking their own recurring session** reuses this
  exact logic and can't book the wrong-coded appointment type (e.g. an intake
  for an existing patient, or a sixty-mins for someone with no relationship).

## Existing appointments / occupancy

- Returned slots exclude any that **overlap an already-booked appointment** for
  that clinician (`src/scheduling/occupancy.ts`).
- An appointment occupies time only when its status is `UPCOMING`, `OCCURRED`,
  or `NO_SHOW`. `CANCELLED`, `RE_SCHEDULED`, and `LATE_CANCELLATION` free the slot.

## Dates & the 7-day rule

- All day/week math is done in **UTC** (slot `date`s are UTC). For ease of demo
  we do **not** localize to the clinician's or patient's timezone (since those aren't
  part of the schema). Implemented with `date-fns` + `@date-fns/utc` (`{ in: utc }`).
- An assessment's two sessions must be on **different calendar days**, **no more
  than 7 days apart**. "7 days" is **calendar days** (not 7×24 hours) and the
  bound is **inclusive**: booking on a Wednesday surfaces options up to and
  including the following Wednesday. Verified against the README, whose expected
  output includes the `2024-08-21 ↔ 2024-08-28` pair (exactly 7 days).
- Pairs are ordered so `session1` is always earlier than `session2`.
- A week (for Task 3's `maxWeeklyAppointments`) is an **ISO week, Mon–Sun**.

## Output shape

- Results are **grouped by clinician**. Clinicians with **no offerable options**
  (no valid pair, or every slot occupied) are **omitted**, so a caller only sees
  clinicians the patient can actually book with.
- Assessments are only ever offered as **pairs** — a first session with no
  possible follow-up within the window is never shown on its own.

## Overlap maximization (Task 2)

- Clinicians often expose many overlapping candidate start times for the same
  block of open time (e.g. 12:00, 12:15, ... 13:30 at 15-min cadence, all
  competing for the same 90 minutes). `src/scheduling/overlap.ts` filters these
  down before they're offered, so we never show a slot whose booking would
  needlessly shrink the clinician's achievable appointment count for that
  stretch of time.
- **Single-chain greedy vs. forward/backward DP — DP adopted.** The textbook
  greedy (sort ascending, sweep with a cursor, keep if `start >= cursor`)
  returns *one* canonical maximum-count chain. We instead return **every slot
  that belongs to *some* maximum-cardinality solution**, via forward/backward
  DP (the standard "is this element part of some optimal solution" technique).
  Both approaches are `O(n log n)` (dominated by the initial sort) — this is a
  **behavior choice, not a performance tradeoff**. The DP version surfaces
  ties the simple greedy would arbitrarily discard (e.g. two widely-separated
  clusters, where which member of each is kept doesn't change the achievable
  total — the greedy silently keeps only the earliest of each, the DP version
  keeps all of them) at no extra asymptotic cost, and is confirmed identical to
  the greedy's result on the README's own example (no real tie exists there).
  We never enumerate *combinations* of slots (which would be combinatorial) —
  only test each slot's membership in some optimal solution independently.
- **One `maximizeSlots`, run on the full candidate list (not bucketed by
  calendar day)**, for both therapy availability and assessment pairing. A
  per-day-bucketed variant was considered for assessment pairing (sessions
  must land on different days), but a single global pass is simpler and
  behaves identically *given* the no-midnight-crossing assumption below — see
  that bullet for what we'd reconsider if it didn't hold.
- Maximization runs **after** occupancy filtering (real bookings must be
  removed first — they aren't "candidates" to optimize over) and **before**
  assessment pairing (which slots survive changes which partners are
  reachable).
- **Assumption: no slot crosses midnight** (a slot's `date + length` never
  spills into the next calendar day) — true for `MOCK_SLOT_DATA` (latest start
  22:30 UTC, ending exactly at 00:00), but not a derived fact. We explored what
  a midnight-crossing slot would break (`getAssessmentPairs`' calendar-day-only
  check letting through a pair that physically overlaps) and added a
  same-physical-time overlap guard to `getAssessmentPairs` regardless. We
  didn't generalize further — if midnight-crossing slots become real, that
  needs product input on intended behavior, not just an engineering fix.

## Robustness / hardening

- **Established-patient statuses** (see "Prior-relationship rule" above): only
  `UPCOMING` (committed intent) and `OCCURRED` (attended) make someone an
  established patient. A `NO_SHOW`, `LATE_CANCELLATION`, `CANCELLED`, or
  `RE_SCHEDULED` means no care relationship actually formed — they never
  onboarded — so they remain a new-patient (intake/assessment) candidate and
  cannot book ongoing (`THERAPY_SIXTY_MINS`) sessions.
- **Duplicate same-timestamp slots** are collapsed to a single offering: a
  clinician can't hold two appointments starting at the same instant, so
  `bookableSlots` dedupes by start time before optimizing.
- **We trust the README's slot-length invariant** — a 90-min slot means a
  psychologist, a 60-min slot means a therapist — and pass the service's
  duration to the maximizer rather than defensively re-filtering each
  clinician's slots by length. (An earlier version dropped mismatched-length
  slots as bad data; removed in favor of simpler code that relies on the
  invariant.)
- **Past slots are not filtered.** A production system would pass the current
  time (a `now`) into the availability entry points and exclude slots starting
  at or before it (a slot already underway can't be booked). We deliberately
  omit this for the take-home: the demo data is historical (2024), so a real
  `now` would filter everything out, and threading it through adds parameters
  without exercising any new business logic. Flagged here as a known,
  intentional simplification.

## Data layer

- Scheduling logic depends on a `ClinicianRepository` interface (the DB seam),
  not a concrete database. Tests inject an `InMemoryClinicianRepository` seeded
  with mock clinicians. A production (e.g. Prisma) implementation would push the
  same filters into a SQL `WHERE` / `NOT EXISTS` clause — which is how this
  scales to hundreds of clinicians.
- Mock clinicians use hardcoded uuidv4 ids for deterministic tests. The starter
  `MOCK_SLOT_DATA` (which isn't tied to a clinician) is attached to Jane Doe to
  reproduce the README example.
