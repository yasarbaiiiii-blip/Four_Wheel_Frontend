import {
  DEFAULT_TRAJECTORY_APPEARANCE,
  FINISHED_LINE_COLORS,
  UNFINISHED_LINE_COLORS,
  FINISHED_POINT_COLORS,
  UNFINISHED_POINT_COLORS,
  isFinishedLineStyle,
  isUnfinishedLineType,
  isUnfinishedLineColor,
  isFinishedPointsColor,
  isUnfinishedPointsColor,
  isRtkRibbonMode,
  isTargetCircleStyle,
  sanitizeTrajectoryAppearance,
} from "../trajectoryAppearance";

describe("Trajectory Appearance Constants & Validation", () => {
  it("provides expected defaults matching Style 8 (Dotted Blueprint + Blue Points)", () => {
    expect(DEFAULT_TRAJECTORY_APPEARANCE.finishedLine).toBe("dotted-blueprint");
    expect(DEFAULT_TRAJECTORY_APPEARANCE.unfinishedType).toBe("dashed");
    expect(DEFAULT_TRAJECTORY_APPEARANCE.unfinishedColor).toBe("cyan");
    expect(DEFAULT_TRAJECTORY_APPEARANCE.finishedPoints).toBe("blue");
    expect(DEFAULT_TRAJECTORY_APPEARANCE.unfinishedPoints).toBe("grey");
    expect(DEFAULT_TRAJECTORY_APPEARANCE.rtkRibbon).toBe("off");
    expect(DEFAULT_TRAJECTORY_APPEARANCE.targetCircle).toBe("pulse-ring");
  });

  it("validates line styles correctly", () => {
    expect(isFinishedLineStyle("dotted-blueprint")).toBe(true);
    expect(isFinishedLineStyle("solid-blue")).toBe(true);
    expect(isFinishedLineStyle("solid-green")).toBe(true);
    expect(isFinishedLineStyle("faded-grey")).toBe(true);
    expect(isFinishedLineStyle("invalid")).toBe(false);
  });

  it("validates unfinished line types correctly", () => {
    expect(isUnfinishedLineType("dashed")).toBe(true);
    expect(isUnfinishedLineType("solid")).toBe(true);
    expect(isUnfinishedLineType("dots")).toBe(true);
    expect(isUnfinishedLineType("other")).toBe(false);
  });

  it("validates target circle styles correctly", () => {
    expect(isTargetCircleStyle("pulse-ring")).toBe(true);
    expect(isTargetCircleStyle("precision-circle")).toBe(true);
    expect(isTargetCircleStyle("glow-halo")).toBe(true);
    expect(isTargetCircleStyle("off")).toBe(true);
    expect(isTargetCircleStyle("unknown")).toBe(false);
  });

  it("sanitizes malformed or incomplete objects safely", () => {
    expect(sanitizeTrajectoryAppearance(null)).toEqual(DEFAULT_TRAJECTORY_APPEARANCE);
    expect(sanitizeTrajectoryAppearance(undefined)).toEqual(DEFAULT_TRAJECTORY_APPEARANCE);
    expect(sanitizeTrajectoryAppearance("string")).toEqual(DEFAULT_TRAJECTORY_APPEARANCE);

    const partial = {
      finishedLine: "solid-blue",
      unfinishedColor: "grey",
    };
    const sanitized = sanitizeTrajectoryAppearance(partial);
    expect(sanitized.finishedLine).toBe("solid-blue");
    expect(sanitized.unfinishedColor).toBe("grey");
    expect(sanitized.unfinishedType).toBe(DEFAULT_TRAJECTORY_APPEARANCE.unfinishedType);
    expect(sanitized.targetCircle).toBe(DEFAULT_TRAJECTORY_APPEARANCE.targetCircle);
  });

  it("has valid hex colors defined for each key", () => {
    expect(FINISHED_LINE_COLORS["dotted-blueprint"]).toBe("#1475EE");
    expect(UNFINISHED_LINE_COLORS.cyan).toBe("#38BDF8");
    expect(FINISHED_POINT_COLORS.blue).toBe("#1475EE");
    expect(UNFINISHED_POINT_COLORS.grey).toBe("#64748B");
  });
});
