import { parseISO } from "date-fns";
import { Appointment, AppointmentStatus } from "../starter-code/appointment";
import { Clinician } from "../starter-code/clinician";
import { CapacityCalendar } from "./capacity";

function appt(date: string, status: AppointmentStatus): Appointment {
  return {
    id: `appt-${date}-${status}`,
    patientId: "p",
    clinicianId: "c",
    scheduledFor: parseISO(date),
    appointmentType: "THERAPY_INTAKE",
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function clinician(appointments: Appointment[], maxDaily = 2, maxWeekly = 8): Clinician {
  return {
    id: "c",
    firstName: "Test",
    lastName: "Clinician",
    states: ["NY"],
    insurances: ["AETNA"],
    clinicianType: "THERAPIST",
    appointments,
    availableSlots: [],
    maxDailyAppointments: maxDaily,
    maxWeeklyAppointments: maxWeekly,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("CapacityCalendar", () => {
  it("counts booked appointments per day and per week", () => {
    // 2024-09-02 (Mon) and 2024-09-03 (Tue) are in the same ISO week.
    const cap = new CapacityCalendar(
      clinician([
        appt("2024-09-02T15:00:00.000Z", "UPCOMING"),
        appt("2024-09-02T16:30:00.000Z", "OCCURRED"),
        appt("2024-09-03T15:00:00.000Z", "UPCOMING"),
      ]),
    );

    expect(cap.remainingOnDay(parseISO("2024-09-02T09:00:00.000Z"))).toBe(0); // 2 booked, max 2
    expect(cap.remainingOnDay(parseISO("2024-09-03T09:00:00.000Z"))).toBe(1); // 1 booked, max 2
    expect(cap.remainingInWeek(parseISO("2024-09-02T09:00:00.000Z"))).toBe(5); // 3 booked, max 8
  });

  it("takes the min of daily and weekly remaining", () => {
    const cap = new CapacityCalendar(
      clinician(
        [appt("2024-09-02T15:00:00.000Z", "UPCOMING")],
        5, // generous daily
        2, // tight weekly
      ),
    );
    // day has 4 left, but the week only has 1 left -> effective 1
    expect(cap.remainingOnDay(parseISO("2024-09-02T09:00:00.000Z"))).toBe(4);
    expect(cap.remainingInWeek(parseISO("2024-09-02T09:00:00.000Z"))).toBe(1);
    expect(cap.effectiveRemainingOnDay(parseISO("2024-09-02T09:00:00.000Z"))).toBe(1);
  });

  it("only counts statuses that occupy a booked slot", () => {
    const cap = new CapacityCalendar(
      clinician([
        appt("2024-09-02T15:00:00.000Z", "CANCELLED"),
        appt("2024-09-02T16:00:00.000Z", "RE_SCHEDULED"),
        appt("2024-09-02T17:00:00.000Z", "LATE_CANCELLATION"),
        appt("2024-09-02T18:00:00.000Z", "NO_SHOW"), // counts
      ]),
    );
    // Only the NO_SHOW counts -> 1 of 2 used.
    expect(cap.remainingOnDay(parseISO("2024-09-02T09:00:00.000Z"))).toBe(1);
  });

  it("reports whether two dates share an ISO week", () => {
    const cap = new CapacityCalendar(clinician([]));
    expect(
      cap.sameWeek(parseISO("2024-09-02T00:00:00.000Z"), parseISO("2024-09-04T00:00:00.000Z")),
    ).toBe(true);
    // 2024-09-08 (Sun) ends the ISO week that 2024-09-09 (Mon) starts anew.
    expect(
      cap.sameWeek(parseISO("2024-09-08T00:00:00.000Z"), parseISO("2024-09-09T00:00:00.000Z")),
    ).toBe(false);
  });
});
