import { parseISO } from "date-fns";
import { filterToMaxAppointments } from "./overlap";

function iso(dates: Date[]): string[] {
  return dates.map((d) => d.toISOString());
}

describe("filterToMaxAppointments", () => {
  it("reproduces the README's example: keeps only the first and last of a fully-packed window", () => {
    const dates = [
      "2024-08-19T12:00:00.000Z",
      "2024-08-19T12:15:00.000Z",
      "2024-08-19T12:30:00.000Z",
      "2024-08-19T12:45:00.000Z",
      "2024-08-19T13:00:00.000Z",
      "2024-08-19T13:15:00.000Z",
      "2024-08-19T13:30:00.000Z",
    ].map((d) => parseISO(d));

    const result = filterToMaxAppointments(dates, 90);

    expect(iso(result)).toEqual([
      "2024-08-19T12:00:00.000Z",
      "2024-08-19T13:30:00.000Z",
    ]);
  });

  it("keeps everything when no candidates overlap", () => {
    const dates = [
      parseISO("2024-08-19T09:00:00.000Z"),
      parseISO("2024-08-19T11:00:00.000Z"), // 120 min after the first ends (90 min)
    ];

    const result = filterToMaxAppointments(dates, 90);

    expect(result).toHaveLength(2);
  });

  it("correctly blocks an overlapping candidate that crosses midnight", () => {
    // A: 23:00 Aug19 -> ends 00:30 Aug20. C: starts exactly at 00:30 Aug20 (compatible).
    // B: 00:00 Aug20 overlaps both A's tail and would only ever allow a single booking.
    const a = parseISO("2024-08-19T23:00:00.000Z");
    const b = parseISO("2024-08-20T00:00:00.000Z");
    const c = parseISO("2024-08-20T00:30:00.000Z");

    const result = filterToMaxAppointments([a, b, c], 90);

    expect(iso(result).sort()).toEqual(iso([a, c]).sort());
    expect(result).not.toContainEqual(b);
  });

  it("returns an empty list for empty input", () => {
    expect(filterToMaxAppointments([], 90)).toEqual([]);
  });

  it("keeps every member of a tied cluster, not just the earliest", () => {
    // Two widely-separated clusters; within each, either member could be the
    // one kept without changing the achievable total of 2 (one per cluster).
    const clusterA1 = parseISO("2024-08-19T09:00:00.000Z");
    const clusterA2 = parseISO("2024-08-19T09:15:00.000Z");
    const clusterB1 = parseISO("2024-08-25T09:00:00.000Z");
    const clusterB2 = parseISO("2024-08-25T09:15:00.000Z");

    const result = filterToMaxAppointments(
      [clusterA1, clusterA2, clusterB1, clusterB2],
      90,
    );

    expect(iso(result).sort()).toEqual(
      iso([clusterA1, clusterA2, clusterB1, clusterB2]).sort(),
    );
  });
});
