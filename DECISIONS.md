# Decisions & Assumptions

Where the README left room for interpretation, these are the choices this
implementation makes. Task 1 covers assessment + therapy availability;
Tasks 2 (slot optimization) and 3 (daily/weekly caps) build on it later.

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
  `UPCOMING`, `OCCURRED`, `NO_SHOW`, or `LATE_CANCELLATION`. `CANCELLED` and
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
- An appointment's **duration is inferred from its type**: 90 min for
  `ASSESSMENT_SESSION_*`, 60 min for `THERAPY_*`.
- Overlap is **exclusive** of the shared boundary: a slot starting exactly when
  an appointment ends is bookable (back-to-back is fine).

## Dates & the 7-day rule

- All day/week math is done in **UTC** (slot `date`s are UTC). For ease of demo
  we do **not** localize to the clinician's or patient's timezone. Implemented
  with `date-fns` + `@date-fns/utc` (`{ in: utc }`).
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

## Data layer

- Scheduling logic depends on a `ClinicianRepository` interface (the DB seam),
  not a concrete database. Tests inject an `InMemoryClinicianRepository` seeded
  with mock clinicians. A production (e.g. Prisma) implementation would push the
  same filters into a SQL `WHERE` / `NOT EXISTS` clause — which is how this
  scales to hundreds of clinicians.
- Mock clinicians use hardcoded uuidv4 ids for deterministic tests. The starter
  `MOCK_SLOT_DATA` (which isn't tied to a clinician) is attached to Jane Doe to
  reproduce the README example.
