import {
  computeMissionProgress,
  elapsedSec,
  estimateRemainingSec,
  formatDuration,
  hrmsToMm,
  pointAccuracyMm,
} from "../missionProgressMetrics";

const points = (n: number) => Array.from({ length: n }, (_, i) => ({ sn: i + 1 }));

describe("computeMissionProgress", () => {
  it("is 0% with the first point active when nothing has a status", () => {
    expect(computeMissionProgress(points(4), {})).toEqual({
      total: 4,
      done: 0,
      pct: 0,
      activeIndex: 0,
    });
  });

  it("counts terminal statuses (completed, skipped, failed) as done", () => {
    const result = computeMissionProgress(points(4), {
      1: { status: "completed" },
      2: { status: "skipped" },
      3: { status: "failed" },
    });
    expect(result).toMatchObject({ done: 3, pct: 75, activeIndex: 3 });
  });

  it("does not count in-progress statuses as done", () => {
    const result = computeMissionProgress(points(3), {
      1: { status: "completed" },
      2: { status: "reached" },
      3: { status: "pending" },
    });
    expect(result).toMatchObject({ done: 1, pct: 33, activeIndex: 1 });
  });

  it("reports 100% and no active point when every point is terminal", () => {
    const result = computeMissionProgress(points(2), {
      1: { status: "completed" },
      2: { status: "completed" },
    });
    expect(result).toMatchObject({ done: 2, pct: 100, activeIndex: null });
  });

  it("handles an empty mission and mixed-case statuses", () => {
    expect(computeMissionProgress([], {})).toEqual({
      total: 0,
      done: 0,
      pct: 0,
      activeIndex: null,
    });
    expect(
      computeMissionProgress(points(1), { 1: { status: "Completed" } }).done,
    ).toBe(1);
  });
});

describe("pointAccuracyMm / hrmsToMm", () => {
  it("converts a recorded cm error to whole millimetres", () => {
    expect(pointAccuracyMm({ position_error_cm: 1.46 })).toBe(15);
  });

  it("is null, never a made-up number, when nothing was recorded", () => {
    expect(pointAccuracyMm(undefined)).toBeNull();
    expect(pointAccuracyMm({ status: "completed" })).toBeNull();
    expect(pointAccuracyMm({ position_error_cm: NaN })).toBeNull();
  });

  it("converts live HRMS metres to mm and treats 0 as unknown", () => {
    expect(hrmsToMm(0.014)).toBe(14);
    expect(hrmsToMm(0)).toBeNull();
    expect(hrmsToMm(null)).toBeNull();
  });
});

describe("estimateRemainingSec", () => {
  it("divides remaining distance by the measured speed", () => {
    expect(estimateRemainingSec(100, 0.5)).toBe(200);
  });

  it("returns null when the rover is not really moving (no invented speed)", () => {
    expect(estimateRemainingSec(100, 0)).toBeNull();
    expect(estimateRemainingSec(100, 0.05)).toBeNull();
    expect(estimateRemainingSec(100, null)).toBeNull();
    expect(estimateRemainingSec(-1, 1)).toBeNull();
  });
});

describe("formatDuration / elapsedSec", () => {
  it.each([
    [null, "—"],
    [NaN, "—"],
    [-5, "—"],
    [42, "42s"],
    [125, "2m 05s"],
    [3725, "1h 02m"],
  ])("formats %p as %p", (input, expected) => {
    expect(formatDuration(input as number | null)).toBe(expected);
  });

  it("measures elapsed time from a real start, or null when unknown", () => {
    expect(elapsedSec(1_000, 6_000)).toBe(5);
    expect(elapsedSec(null, 6_000)).toBeNull();
    expect(elapsedSec(9_000, 6_000)).toBe(0);
  });
});
