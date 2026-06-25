import { parseISO } from "date-fns";
import {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  AvailableAppointmentSlot,
} from "../starter-code/appointment";
import { Clinician } from "../starter-code/clinician";
import { MOCK_SLOT_DATA } from "../starter-code/mock-slot-data";

/**
 * Deterministic mock clinicians standing in for the database. The starter
 * `MOCK_SLOT_DATA` isn't tied to a clinician, so `slotsForClinician` attaches a
 * raw slot list to a given clinician id. Ids are hardcoded uuidv4s so tests are
 * reproducible. Kept intentionally small — just enough to demonstrate the rules.
 */

const FIXED_TS = parseISO("2024-08-15T14:45:15.462Z");

/** Byrne Hollander's id (see starter-code/mock-patient.ts) — used to seed prior appointments. */
export const BYRNE_PATIENT_ID = "some-uuidv4";

type RawSlot = { length: number; date: string };

function slotsForClinician(
  clinicianId: string,
  rawSlots: RawSlot[],
): AvailableAppointmentSlot[] {
  return rawSlots.map((slot, i) => ({
    id: `${clinicianId}:${i}`,
    clinicianId,
    date: parseISO(slot.date),
    length: slot.length,
    createdAt: FIXED_TS,
    updatedAt: FIXED_TS,
  }));
}

function appointment(
  id: string,
  clinicianId: string,
  patientId: string,
  scheduledFor: string,
  appointmentType: AppointmentType,
  status: AppointmentStatus,
): Appointment {
  return {
    id,
    patientId,
    clinicianId,
    scheduledFor: parseISO(scheduledFor),
    appointmentType,
    status,
    createdAt: FIXED_TS,
    updatedAt: FIXED_TS,
  };
}

// --- Clinician ids ----------------------------------------------------------

export const PSYCH_JANE_DOE_ID = "9c516382-c5b2-4677-a7ac-4e100fa35bdd";
export const PSYCH_SECOND_ID = "2b5c8d1a-3e4f-4a6b-9c7d-1e2f3a4b5c6d";
export const PSYCH_NON_MATCHING_ID = "3c6d9e2b-4f5a-4b7c-8d9e-2f3a4b5c6d7e";
export const THERAPIST_UNSEEN_ID = "4d7e0f3c-5a6b-4c8d-9e0f-3a4b5c6d7e8f";
export const THERAPIST_SEEN_ID = "5e8f1a4d-6b7c-4d9e-0f1a-4b5c6d7e8f90";

// --- Clinicians -------------------------------------------------------------

/** The README's psychologist. Carries the full MOCK_SLOT_DATA. */
export const psychJaneDoe: Clinician = {
  id: PSYCH_JANE_DOE_ID,
  firstName: "Jane",
  lastName: "Doe",
  states: ["NY", "CA"],
  insurances: ["AETNA", "CIGNA"],
  clinicianType: "PSYCHOLOGIST",
  // An existing booking for *another* patient — demonstrates occupancy filtering
  // (her 2024-08-19T12:00 slot, and anything overlapping it, is removed).
  appointments: [
    appointment(
      "appt-jane-1",
      PSYCH_JANE_DOE_ID,
      "another-patient-uuid",
      "2024-08-19T12:00:00.000Z",
      "ASSESSMENT_SESSION_1",
      "UPCOMING",
    ),
  ],
  availableSlots: slotsForClinician(PSYCH_JANE_DOE_ID, MOCK_SLOT_DATA),
  maxDailyAppointments: 2,
  maxWeeklyAppointments: 8,
  createdAt: FIXED_TS,
  updatedAt: FIXED_TS,
};

/** A second matching psychologist, so assessment results span >1 clinician. */
export const psychSecond: Clinician = {
  id: PSYCH_SECOND_ID,
  firstName: "Sam",
  lastName: "Rivera",
  states: ["NY"],
  insurances: ["AETNA"],
  clinicianType: "PSYCHOLOGIST",
  appointments: [],
  availableSlots: slotsForClinician(PSYCH_SECOND_ID, [
    { length: 90, date: "2024-09-02T16:00:00.000Z" },
    { length: 90, date: "2024-09-04T16:00:00.000Z" },
  ]),
  maxDailyAppointments: 3,
  maxWeeklyAppointments: 10,
  createdAt: FIXED_TS,
  updatedAt: FIXED_TS,
};

/** A psychologist Byrne can't book: wrong state and insurance. */
export const psychNonMatching: Clinician = {
  id: PSYCH_NON_MATCHING_ID,
  firstName: "Pat",
  lastName: "Nguyen",
  states: ["FL"],
  insurances: ["BCBS"],
  clinicianType: "PSYCHOLOGIST",
  appointments: [],
  availableSlots: slotsForClinician(PSYCH_NON_MATCHING_ID, [
    { length: 90, date: "2024-09-03T16:00:00.000Z" },
    { length: 90, date: "2024-09-05T16:00:00.000Z" },
  ]),
  maxDailyAppointments: 2,
  maxWeeklyAppointments: 8,
  createdAt: FIXED_TS,
  updatedAt: FIXED_TS,
};

/** A therapist Byrne has never seen: eligible for THERAPY_INTAKE, not SIXTY_MINS. */
export const therapistUnseen: Clinician = {
  id: THERAPIST_UNSEEN_ID,
  firstName: "Dana",
  lastName: "Lee",
  states: ["NY"],
  insurances: ["AETNA"],
  clinicianType: "THERAPIST",
  appointments: [],
  availableSlots: slotsForClinician(THERAPIST_UNSEEN_ID, [
    { length: 60, date: "2024-09-02T15:00:00.000Z" },
    { length: 60, date: "2024-09-03T15:00:00.000Z" },
  ]),
  maxDailyAppointments: 4,
  maxWeeklyAppointments: 16,
  createdAt: FIXED_TS,
  updatedAt: FIXED_TS,
};

/** A therapist Byrne already sees: eligible for THERAPY_SIXTY_MINS, not INTAKE. */
export const therapistSeen: Clinician = {
  id: THERAPIST_SEEN_ID,
  firstName: "Chris",
  lastName: "Okafor",
  states: ["NY"],
  insurances: ["AETNA"],
  clinicianType: "THERAPIST",
  appointments: [
    appointment(
      "appt-chris-1",
      THERAPIST_SEEN_ID,
      BYRNE_PATIENT_ID,
      "2024-08-01T15:00:00.000Z",
      "THERAPY_INTAKE",
      "OCCURRED",
    ),
  ],
  availableSlots: slotsForClinician(THERAPIST_SEEN_ID, [
    { length: 60, date: "2024-09-04T15:00:00.000Z" },
    { length: 60, date: "2024-09-05T15:00:00.000Z" },
  ]),
  maxDailyAppointments: 4,
  maxWeeklyAppointments: 16,
  createdAt: FIXED_TS,
  updatedAt: FIXED_TS,
};

export const MOCK_CLINICIANS: Clinician[] = [
  psychJaneDoe,
  psychSecond,
  psychNonMatching,
  therapistUnseen,
  therapistSeen,
];
