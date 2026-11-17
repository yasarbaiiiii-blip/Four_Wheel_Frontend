import type { Waypoint } from "../../components/missionreport/types";
import {
  addMissionWaypoint,
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

describe("addMissionWaypoint", () => {
  it("appends a new point and renumbers sequential sn from 1", () => {
    const input = [point(1, 10), point(2, 20)];
    const result = addMissionWaypoint(input, { lat: 30, lon: 130 });
    expect(result.length).toBe(3);
    expect(result.map((p) => p.lat)).toEqual([10, 20, 30]);
    expect(result.map((p) => p.sn)).toEqual([1, 2, 3]);
  });

  it("resets progress state to Pending on all points", () => {
    const input = [point(1, 10, { status: "Completed" })];
    const result = addMissionWaypoint(input, { lat: 20, lon: 120 });
    expect(result.every((p) => p.status === "Pending")).toBe(true);
    expect(result.every((p) => p.distance === undefined)).toBe(true);
  });

  it("inherits block and row from the last point if omitted", () => {
    const input = [point(1, 10, { block: "B2", row: "R5" })];
    const result = addMissionWaypoint(input, { lat: 20, lon: 120 });
    expect(result[1].block).toBe("B2");
    expect(result[1].row).toBe("R5");
    expect(result[1].pile).toBe("2");
  });

  it("rejects invalid or out-of-bounds coordinates", () => {
    const input = [point(1, 10), point(2, 20)];
    expect(addMissionWaypoint(input, { lat: 100, lon: 0 })).toBe(input);
    expect(addMissionWaypoint(input, { lat: 0, lon: 200 })).toBe(input);
    expect(addMissionWaypoint(input, { lat: NaN, lon: 0 })).toBe(input);
  });
});
