import { startOfDay, startOfISOWeek } from "date-fns";
import { utc } from "@date-fns/utc";
import { Clinician } from "../starter-code/clinician";
import { ACTIVE_APPOINTMENT_STATUSES } from "./appointment-status";

const dayKey = (date: Date): number => startOfDay(date, { in: utc }).getTime();
const weekKey = (date: Date): number => startOfISOWeek(date, { in: utc }).getTime();

/**
 * Per-clinician view of how much daily/weekly capacity remains, given their
 * already-booked appointments and their `maxDailyAppointments` /
 * `maxWeeklyAppointments` caps. Built once per clinician; all lookups are O(1).
 *
 * Days/weeks are computed in UTC (ISO week, Mon–Sun) — see DECISIONS.md.
 */
export class CapacityCalendar {
  private readonly bookedPerDay = new Map<number, number>();
  private readonly bookedPerWeek = new Map<number, number>();

  constructor(private readonly clinician: Clinician) {
    for (const appt of clinician.appointments) {
      if (!ACTIVE_APPOINTMENT_STATUSES.has(appt.status)) continue; // only live bookings count
      const d = dayKey(appt.scheduledFor);
      const w = weekKey(appt.scheduledFor);
      this.bookedPerDay.set(d, (this.bookedPerDay.get(d) ?? 0) + 1);
      this.bookedPerWeek.set(w, (this.bookedPerWeek.get(w) ?? 0) + 1);
    }
  }

  /** Appointments this clinician can still take on `date`'s calendar day. */
  remainingOnDay(date: Date): number {
    return this.clinician.maxDailyAppointments - (this.bookedPerDay.get(dayKey(date)) ?? 0);
  }

  /** Appointments this clinician can still take in `date`'s ISO week. */
  remainingInWeek(date: Date): number {
    return this.clinician.maxWeeklyAppointments - (this.bookedPerWeek.get(weekKey(date)) ?? 0);
  }

  /**
   * The most appointments still bookable on `date` accounting for both caps:
   * a day can't exceed its own remaining, nor what its week still allows.
   */
  effectiveRemainingOnDay(date: Date): number {
    return Math.min(this.remainingOnDay(date), this.remainingInWeek(date));
  }

  /** True if the two dates fall in the same ISO week. */
  sameWeek(a: Date, b: Date): boolean {
    return weekKey(a) === weekKey(b);
  }
}
