import type { Waypoint } from "../../components/missionreport/types";
import {
  MIN_MISSION_POINTS,
  removeMissionWaypoint,
  reverseMissionWaypoints,
  sameMissionRoute,
} from "../missionEdit";

const point = (sn: number, lat: number, extra: Partial<Waypoint> = {}): Waypoint => ({
  sn,
  block: "B",
  row: "R",
  pile: String(sn),
  lat,
  lon: lat + 100,
  alt: 0,
  status: "Completed",
  time: "10:00",
  remark: "old",
  distance: 12,
  ...extra,
});

describe("reverseMissionWaypoints", () => {
  it("reverses the order and renumbers sn from 1", () => {
    const result = reverseMissionWaypoints([point(1, 10), point(2, 20), point(3, 30)]);
    expect(result.map((p) => p.lat)).toEqual([30, 20, 10]);
    expect(result.map((p) => p.sn)).toEqual([1, 2, 3]);
  });

  it("resets progress so old results are never shown against a new order", () => {
    const [first] = reverseMissionWaypoints([point(1, 10), point(2, 20)]);
    expect(first.status).toBe("Pending");
    expect(first.time).toBe("");
    expect(first.remark).toBe("");
    // segment lengths change with the order, so they must be recomputed
    expect(first.distance).toBeUndefined();
  });

  it("does not mutate its input", () => {
    const input = [point(1, 10), point(2, 20)];
    reverseMissionWaypoints(input);
    expect(input.map((p) => p.lat)).toEqual([10, 20]);
  });

  it("reversing twice restores the original route", () => {
    const input = [point(1, 10), point(2, 20), point(3, 30)];
    const twice = reverseMissionWaypoints(reverseMissionWaypoints(input));
    expect(sameMissionRoute(twice, input)).toBe(true);
  });
});

describe("removeMissionWaypoint", () => {
  it("removes one point and renumbers", () => {
    const result = removeMissionWaypoint([point(1, 10), point(2, 20), point(3, 30)], 1);
    expect(result.map((p) => p.lat)).toEqual([10, 30]);
    expect(result.map((p) => p.sn)).toEqual([1, 2]);
  });

  it("refuses to go below the minimum and returns the same reference", () => {
    const input = [point(1, 10), point(2, 20)];
    expect(MIN_MISSION_POINTS).toBe(2);
    expect(removeMissionWaypoint(input, 0)).toBe(input);
  });

  it.each([-1, 3, 1.5, NaN])("ignores a bad index (%p)", (index) => {
    const input = [point(1, 10), point(2, 20), point(3, 30)];
    expect(removeMissionWaypoint(input, index)).toBe(input);
  });
});

describe("sameMissionRoute", () => {
  it("compares points and order, not status or numbering", () => {
    const a = [point(1, 10), point(2, 20)];
    const b = [point(5, 10, { status: "Pending" }), point(6, 20)];
    expect(sameMissionRoute(a, b)).toBe(true);
  });

  it("detects a different length or a different order", () => {
    const a = [point(1, 10), point(2, 20)];
    expect(sameMissionRoute(a, [point(1, 10)])).toBe(false);
    expect(sameMissionRoute(a, [point(1, 20), point(2, 10)])).toBe(false);
  });
});
