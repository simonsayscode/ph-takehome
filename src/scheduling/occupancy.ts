import { addMinutes, areIntervalsOverlapping, Interval } from "date-fns";
import { AvailableAppointmentSlot } from "../starter-code/appointment";
import { Clinician } from "../starter-code/clinician";
import { ACTIVE_APPOINTMENT_STATUSES } from "./appointment-status";
import { appointmentDurationMins } from "./eligibility";

/** Time intervals already taken on the clinician's calendar by live bookings. */
export function occupyingIntervals(clinician: Clinician): Interval[] {
  return clinician.appointments
    .filter((appt) => ACTIVE_APPOINTMENT_STATUSES.has(appt.status))
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
