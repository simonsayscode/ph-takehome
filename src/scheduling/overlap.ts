/**
 * Filters a list of candidate appointment start times down to every slot that
 * is part of *some* maximum-cardinality set of non-overlapping
 * `durationMins`-long appointments. Booking any returned slot is guaranteed
 * not to reduce the total number of appointments achievable from the rest of
 * the candidates — the rest of whichever optimal set it belongs to stays
 * available afterward.
 *
 * This generalizes the classic Activity Selection greedy (which returns only
 * *one* canonical maximum-count chain) to instead surface every individually
 * substitutable option — e.g. two widely separated clusters of candidates,
 * where which member of each cluster is kept doesn't change the achievable
 * total, return *all* members of both clusters rather than an arbitrary pick.
 *
 * Implemented via forward/backward DP, the standard technique for "is this
 * element part of some optimal solution" (the same idea behind "is this edge
 * on some shortest path"). We never enumerate combinations of slots — only
 * test each slot's membership in some optimal solution independently — so
 * this stays O(n log n), dominated by the initial sort, with no combinatorial
 * blow-up.
 */
export function filterToMaxAppointments(
  dates: Date[],
  durationMins: number,
): Date[] {
  if (dates.length === 0) return [];

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const n = sorted.length;
  const durationMs = durationMins * 60_000;
  const starts = sorted.map((d) => d.getTime());
  const ends = starts.map((s) => s + durationMs);

  // predecessor[i] = largest j < i with ends[j] <= starts[i] (last slot that
  // finishes in time to not overlap slot i), or -1 if none. starts is sorted
  // ascending, so this is found with a single forward two-pointer walk.
  const predecessor = new Array<number>(n).fill(-1);
  {
    let p = -1;
    for (let i = 0; i < n; i++) {
      while (p + 1 < i && ends[p + 1] <= starts[i]) p++;
      predecessor[i] = p;
    }
  }

  // successor[i] = smallest j > i with starts[j] >= ends[i] (first slot that
  // starts after slot i finishes), or n if none. Symmetric backward walk.
  const successor = new Array<number>(n).fill(n);
  {
    let q = n;
    for (let i = n - 1; i >= 0; i--) {
      while (q - 1 > i && starts[q - 1] >= ends[i]) q--;
      successor[i] = q;
    }
  }

  // F[m] = max non-overlapping count achievable using only the first m slots
  // (indices 0..m-1). Classic weighted-interval-scheduling DP, unit weights.
  const F = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    F[i + 1] = Math.max(F[i], F[predecessor[i] + 1] + 1);
  }
  const max = F[n];

  // B[m] = max non-overlapping count achievable using only slots m..n-1.
  const B = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    B[i] = Math.max(B[i + 1], 1 + B[successor[i]]);
  }

  // Slot i belongs to some maximum-cardinality solution iff using its best
  // compatible predecessor and successor still reaches the global max.
  return sorted.filter(
    (_, i) => F[predecessor[i] + 1] + 1 + B[successor[i]] === max,
  );
}
