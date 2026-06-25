import { addMinutes, areIntervalsOverlapping, Interval } from "date-fns";
import {
  AppointmentType,
  AvailableAppointmentSlot,
} from "../starter-code/appointment";
import { Clinician } from "../starter-code/clinician";

/** Minutes a booked appointment of the given type occupies on the calendar. */
export function appointmentDurationMins(type: AppointmentType): number {
  switch (type) {
    case "ASSESSMENT_SESSION_1":
    case "ASSESSMENT_SESSION_2":
      return 90;
    case "THERAPY_INTAKE":
    case "THERAPY_SIXTY_MINS":
      return 60;
  }
}

/**
 * Statuses whose appointments actually occupy time on the clinician's calendar.
 * Cancelled / rescheduled appointments free the slot back up.
 */
const OCCUPYING_STATUSES = new Set(["UPCOMING", "OCCURRED", "NO_SHOW"]);

/** Time intervals already taken on the clinician's calendar. */
export function occupyingIntervals(clinician: Clinician): Interval[] {
  return clinician.appointments
    .filter((appt) => OCCUPYING_STATUSES.has(appt.status))
    .map((appt) => ({
      start: appt.scheduledFor,
      end: addMinutes(appt.scheduledFor, appointmentDurationMins(appt.appointmentType)),
    }));
}

/**
 * Removes slots that would overlap an already-booked appointment. Adjacent
 * (back-to-back) slots are kept — a slot ending exactly when another begins is
 * not an overlap (`inclusive: false`).
 */
export function filterUnoccupied(
  slots: AvailableAppointmentSlot[],
  clinician: Clinician,
): AvailableAppointmentSlot[] {
  const occupied = occupyingIntervals(clinician);
  if (occupied.length === 0) return slots;

  return slots.filter((slot) => {
    const slotInterval: Interval = {
      start: slot.date,
      end: addMinutes(slot.date, slot.length),
    };
    return !occupied.some((busy) =>
      areIntervalsOverlapping(slotInterval, busy, { inclusive: false }),
    );
  });
}
