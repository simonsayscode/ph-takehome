import { Appointment } from "../starter-code/appointment";
import { Clinician, ClinicianType } from "../starter-code/clinician";
import { Patient } from "../starter-code/patient";
import { isEligible } from "./eligibility";

const patient: Patient = {
  id: "patient-1",
  firstName: "Byrne",
  lastName: "Hollander",
  state: "NY",
  insurance: "AETNA",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function clinician(overrides: Partial<Clinician> & { clinicianType: ClinicianType }): Clinician {
  return {
    id: "clin-1",
    firstName: "Test",
    lastName: "Clinician",
    states: ["NY"],
    insurances: ["AETNA"],
    appointments: [],
    availableSlots: [],
    maxDailyAppointments: 2,
    maxWeeklyAppointments: 8,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const priorAppointment: Appointment = {
  id: "appt-1",
  patientId: patient.id,
  clinicianId: "clin-1",
  scheduledFor: new Date("2024-08-01T15:00:00.000Z"),
  appointmentType: "THERAPY_INTAKE",
  status: "OCCURRED",
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("isEligible", () => {
  it("requires the clinician to operate in the patient's state", () => {
    const c = clinician({ clinicianType: "PSYCHOLOGIST", states: ["FL"] });
    expect(isEligible(c, patient, "PSYCHOLOGIST_ASSESSMENT")).toBe(false);
  });

  it("requires the clinician to accept the patient's insurance", () => {
    const c = clinician({ clinicianType: "PSYCHOLOGIST", insurances: ["BCBS"] });
    expect(isEligible(c, patient, "PSYCHOLOGIST_ASSESSMENT")).toBe(false);
  });

  it("requires the matching clinician type for the service", () => {
    const therapist = clinician({ clinicianType: "THERAPIST" });
    expect(isEligible(therapist, patient, "PSYCHOLOGIST_ASSESSMENT")).toBe(false);
    expect(isEligible(therapist, patient, "THERAPY_INTAKE")).toBe(true);
  });

  describe("prior-relationship rule", () => {
    it("assessment & intake exclude a clinician the patient has already seen", () => {
      const psych = clinician({ clinicianType: "PSYCHOLOGIST", appointments: [priorAppointment] });
      const therapist = clinician({ clinicianType: "THERAPIST", appointments: [priorAppointment] });
      expect(isEligible(psych, patient, "PSYCHOLOGIST_ASSESSMENT")).toBe(false);
      expect(isEligible(therapist, patient, "THERAPY_INTAKE")).toBe(false);
    });

    it("sixty-mins requires an existing relationship", () => {
      const unseen = clinician({ clinicianType: "THERAPIST" });
      const seen = clinician({ clinicianType: "THERAPIST", appointments: [priorAppointment] });
      expect(isEligible(unseen, patient, "THERAPY_SIXTY_MINS")).toBe(false);
      expect(isEligible(seen, patient, "THERAPY_SIXTY_MINS")).toBe(true);
    });

    it("ignores a cancelled appointment when judging the relationship", () => {
      const cancelled: Appointment = { ...priorAppointment, status: "CANCELLED" };
      const therapist = clinician({ clinicianType: "THERAPIST", appointments: [cancelled] });
      // No real relationship -> still an intake candidate, not a sixty-mins one.
      expect(isEligible(therapist, patient, "THERAPY_INTAKE")).toBe(true);
      expect(isEligible(therapist, patient, "THERAPY_SIXTY_MINS")).toBe(false);
    });
  });
});
