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

  describe("capacity target", () => {
    // 09:00, 10:00, 10:30, 12:00 (90-min). Max non-overlapping K = 3
    // (09:00 + 10:30 + 12:00). 10:00 is a "trap": its best schedule is only
    // 2 appointments (10:00 + 12:00), so it's in no size-3 selection.
    const dates = [
      "2024-08-19T09:00:00.000Z",
      "2024-08-19T10:00:00.000Z",
      "2024-08-19T10:30:00.000Z",
      "2024-08-19T12:00:00.000Z",
    ].map((d) => parseISO(d));

    it("drops the trap slot at full max (default target = K)", () => {
      const result = iso(filterToMaxAppointments(dates, 90));
      expect(result).not.toContain("2024-08-19T10:00:00.000Z");
      expect(result).toHaveLength(3);
    });

    it("keeps the trap slot when capacity only allows 2 (1 < target < K)", () => {
      const result = iso(filterToMaxAppointments(dates, 90, 2));
      expect(result).toContain("2024-08-19T10:00:00.000Z");
      expect(result).toHaveLength(4); // every slot is usable in some 2-booking day
    });

    it("keeps every slot when capacity allows only 1", () => {
      expect(filterToMaxAppointments(dates, 90, 1)).toHaveLength(4);
    });

    it("returns nothing when capacity is 0", () => {
      expect(filterToMaxAppointments(dates, 90, 0)).toEqual([]);
    });

    it("behaves like the default when target >= K", () => {
      expect(iso(filterToMaxAppointments(dates, 90, 99))).toEqual(
        iso(filterToMaxAppointments(dates, 90)),
      );
    });
  });
});
