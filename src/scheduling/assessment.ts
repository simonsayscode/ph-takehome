import { differenceInCalendarDays } from "date-fns";
import { utc } from "@date-fns/utc";
import { AvailableAppointmentSlot } from "../starter-code/appointment";

/**
 * A bookable assessment: two 90-minute sessions with the same psychologist.
 * `session1` is always strictly earlier than `session2`.
 */
export interface AssessmentPair {
  session1: AvailableAppointmentSlot;
  session2: AvailableAppointmentSlot;
}

/** An assessment's two sessions must be on different days, no more than 7 apart. */
const MIN_DAYS_APART = 1;
const MAX_DAYS_APART = 7;

/**
 * Generates every valid pair of assessment sessions from one psychologist's
 * slots: different calendar days, between 1 and 7 days apart (inclusive, in
 * UTC), and not overlapping in actual time (guards against a session1 that
 * runs past midnight into session2's start). A slot with no valid partner
 * never appears, so we never offer a first session without a possible
 * follow-up.
 */
export function getAssessmentPairs(
  slots: AvailableAppointmentSlot[],
): AssessmentPair[] {
  const sorted = [...slots].sort((a, b) => a.date.getTime() - b.date.getTime());
  const pairs: AssessmentPair[] = [];

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const daysApart = differenceInCalendarDays(sorted[j].date, sorted[i].date, {
        in: utc,
      });
      // Sorted ascending, so daysApart is non-decreasing as j grows: once a
      // partner is too far out, every later one is too.
      if (daysApart > MAX_DAYS_APART) break;
      const session1End = sorted[i].date.getTime() + sorted[i].length * 60_000;
      const overlapsSession1 = session1End > sorted[j].date.getTime();
      if (daysApart >= MIN_DAYS_APART && !overlapsSession1) {
        pairs.push({ session1: sorted[i], session2: sorted[j] });
      }
    }
  }

  return pairs;
}
