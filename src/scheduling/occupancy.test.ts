import { parseISO } from "date-fns";
import { Appointment, AvailableAppointmentSlot } from "../starter-code/appointment";
import { Clinician } from "../starter-code/clinician";
import { filterUnoccupied } from "./occupancy";

function slot(date: string): AvailableAppointmentSlot {
  return {
    id: date,
    clinicianId: "c",
    date: parseISO(date),
    length: 90,
    createdAt: parseISO(date),
    updatedAt: parseISO(date),
  };
}

function clinicianWith(appointments: Appointment[]): Clinician {
  return {
    id: "c",
    firstName: "Jane",
    lastName: "Doe",
    states: ["NY"],
    insurances: ["AETNA"],
    clinicianType: "PSYCHOLOGIST",
    appointments,
    availableSlots: [],
    maxDailyAppointments: 2,
    maxWeeklyAppointments: 8,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function assessmentAppt(date: string, status: Appointment["status"]): Appointment {
  return {
    id: `appt-${date}`,
    patientId: "other",
    clinicianId: "c",
    scheduledFor: parseISO(date),
    appointmentType: "ASSESSMENT_SESSION_1", // 90 minutes
    status,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("filterUnoccupied", () => {
  it("removes slots overlapping an existing appointment", () => {
    // Booked 12:00-13:30. 12:45 starts inside it -> removed.
    const clinician = clinicianWith([assessmentAppt("2024-08-19T12:00:00.000Z", "UPCOMING")]);
    const result = filterUnoccupied([slot("2024-08-19T12:45:00.000Z")], clinician);
    expect(result).toHaveLength(0);
  });

  it("keeps a back-to-back slot that starts exactly when the appointment ends", () => {
    // Booked 12:00-13:30. 13:30 starts as it ends -> kept.
    const clinician = clinicianWith([assessmentAppt("2024-08-19T12:00:00.000Z", "UPCOMING")]);
    const result = filterUnoccupied([slot("2024-08-19T13:30:00.000Z")], clinician);
    expect(result).toHaveLength(1);
  });

  it("does not let a cancelled appointment block a slot", () => {
    const clinician = clinicianWith([assessmentAppt("2024-08-19T12:00:00.000Z", "CANCELLED")]);
    const result = filterUnoccupied([slot("2024-08-19T12:45:00.000Z")], clinician);
    expect(result).toHaveLength(1);
  });
});
