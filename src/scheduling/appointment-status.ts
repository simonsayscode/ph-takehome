import { AppointmentStatus } from "../starter-code/appointment";

/**
 * Statuses for an appointment that is a *live* booking — it holds a real spot on
 * the clinician's calendar. Being live has two consequences, both keyed off this
 * one set: the appointment **occupies** its time (so a candidate slot overlapping
 * it is unavailable — see occupancy.ts) and it **counts toward** the clinician's
 * daily/weekly caps (see capacity.ts).
 *
 * The complement — `CANCELLED`, `RE_SCHEDULED`, `LATE_CANCELLATION` — releases
 * the spot: the time is free again and it doesn't count toward capacity. A
 * `NO_SHOW` still consumed a booked slot, so it stays live. See DECISIONS.md.
 */
export const ACTIVE_APPOINTMENT_STATUSES: ReadonlySet<AppointmentStatus> = new Set([
  "UPCOMING",
  "OCCURRED",
  "NO_SHOW",
]);
