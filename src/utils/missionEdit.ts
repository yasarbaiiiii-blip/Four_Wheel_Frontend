/**
 * missionEdit — pure edit operations for the Mission Activity edit mode.
 *
 * Every operation returns a NEW list with `sn` renumbered 1..n. Edits are only
 * allowed while no mission is running, so progress state is reset to Pending:
 * a re-ordered or shortened mission is a different mission, and old per-point
 * results must never be shown against it.
 */

import type { Waypoint } from "../components/missionreport/types";

/** A mission needs at least a start and an end point. */
export const MIN_MISSION_POINTS = 2;

function renumber(points: ReadonlyArray<Waypoint>): Waypoint[] {
  return points.map((point, index) => ({
    ...point,
    sn: index + 1,
    status: "Pending",
    time: "",
    remark: "",
    // Segment lengths change with the order; consumers recompute from lat/lon.
    distance: undefined,
  }));
}

export function reverseMissionWaypoints(
  points: ReadonlyArray<Waypoint>,
): Waypoint[] {
  return renumber([...points].reverse());
}

/**
 * Remove one point. Returns the SAME array reference when the removal is not
 * allowed (bad index, or it would leave fewer than MIN_MISSION_POINTS), so
 * callers can detect a no-op with `===`.
 */
export function removeMissionWaypoint(
  points: Waypoint[],
  index: number,
): Waypoint[] {
  if (!Number.isInteger(index) || index < 0 || index >= points.length) {
    return points;
  }
  if (points.length <= MIN_MISSION_POINTS) {
    return points;
  }
  return renumber(points.filter((_, i) => i !== index));
}

/** True when two lists describe the same route (same points, same order). */
export function sameMissionRoute(
  a: ReadonlyArray<Pick<Waypoint, "lat" | "lon">>,
  b: ReadonlyArray<Pick<Waypoint, "lat" | "lon">>,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].lat !== b[i].lat || a[i].lon !== b[i].lon) return false;
  }
  return true;
}
