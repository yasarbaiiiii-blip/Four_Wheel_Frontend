export type FinishedLineStyle =
  | "dotted-blueprint"
  | "solid-blue"
  | "solid-green"
  | "faded-grey";

export type UnfinishedLineType = "dashed" | "solid" | "dots";

export type UnfinishedLineColor = "cyan" | "grey" | "indigo";

export type FinishedPointsColor = "blue" | "green";

export type UnfinishedPointsColor = "grey" | "blue";

export type RtkRibbonMode = "on" | "off";

export type TargetCircleStyle =
  | "pulse-ring"
  | "precision-circle"
  | "glow-halo"
  | "off";

export interface TrajectoryAppearanceSettings {
  finishedLine: FinishedLineStyle;
  unfinishedType: UnfinishedLineType;
  unfinishedColor: UnfinishedLineColor;
  finishedPoints: FinishedPointsColor;
  unfinishedPoints: UnfinishedPointsColor;
  rtkRibbon: RtkRibbonMode;
  targetCircle: TargetCircleStyle;
}

export const DEFAULT_TRAJECTORY_APPEARANCE: TrajectoryAppearanceSettings = {
  finishedLine: "dotted-blueprint",
  unfinishedType: "dashed",
  unfinishedColor: "cyan",
  finishedPoints: "blue",
  unfinishedPoints: "grey",
  rtkRibbon: "off",
  targetCircle: "pulse-ring",
};

export const FINISHED_LINE_COLORS: Record<FinishedLineStyle, string> = {
  "dotted-blueprint": "#1475EE",
  "solid-blue": "#1475EE",
  "solid-green": "#16B980",
  "faded-grey": "#64748B",
};

export const UNFINISHED_LINE_COLORS: Record<UnfinishedLineColor, string> = {
  cyan: "#38BDF8",
  grey: "#94A3B8",
  indigo: "#6366F1",
};

export const FINISHED_POINT_COLORS: Record<FinishedPointsColor, string> = {
  blue: "#1475EE",
  green: "#16B980",
};

export const UNFINISHED_POINT_COLORS: Record<UnfinishedPointsColor, string> = {
  grey: "#64748B",
  blue: "#38BDF8",
};

export function isFinishedLineStyle(val: unknown): val is FinishedLineStyle {
  return (
    val === "dotted-blueprint" ||
    val === "solid-blue" ||
    val === "solid-green" ||
    val === "faded-grey"
  );
}

export function isUnfinishedLineType(val: unknown): val is UnfinishedLineType {
  return val === "dashed" || val === "solid" || val === "dots";
}

export function isUnfinishedLineColor(val: unknown): val is UnfinishedLineColor {
  return val === "cyan" || val === "grey" || val === "indigo";
}

export function isFinishedPointsColor(val: unknown): val is FinishedPointsColor {
  return val === "blue" || val === "green";
}

export function isUnfinishedPointsColor(val: unknown): val is UnfinishedPointsColor {
  return val === "grey" || val === "blue";
}

export function isRtkRibbonMode(val: unknown): val is RtkRibbonMode {
  return val === "on" || val === "off";
}

export function isTargetCircleStyle(val: unknown): val is TargetCircleStyle {
  return (
    val === "pulse-ring" ||
    val === "precision-circle" ||
    val === "glow-halo" ||
    val === "off"
  );
}

export function sanitizeTrajectoryAppearance(
  raw: unknown,
): TrajectoryAppearanceSettings {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_TRAJECTORY_APPEARANCE };
  }
  const r = raw as Record<string, unknown>;
  return {
    finishedLine: isFinishedLineStyle(r.finishedLine)
      ? r.finishedLine
      : DEFAULT_TRAJECTORY_APPEARANCE.finishedLine,
    unfinishedType: isUnfinishedLineType(r.unfinishedType)
      ? r.unfinishedType
      : DEFAULT_TRAJECTORY_APPEARANCE.unfinishedType,
    unfinishedColor: isUnfinishedLineColor(r.unfinishedColor)
      ? r.unfinishedColor
      : DEFAULT_TRAJECTORY_APPEARANCE.unfinishedColor,
    finishedPoints: isFinishedPointsColor(r.finishedPoints)
      ? r.finishedPoints
      : DEFAULT_TRAJECTORY_APPEARANCE.finishedPoints,
    unfinishedPoints: isUnfinishedPointsColor(r.unfinishedPoints)
      ? r.unfinishedPoints
      : DEFAULT_TRAJECTORY_APPEARANCE.unfinishedPoints,
    rtkRibbon: isRtkRibbonMode(r.rtkRibbon)
      ? r.rtkRibbon
      : DEFAULT_TRAJECTORY_APPEARANCE.rtkRibbon,
    targetCircle: isTargetCircleStyle(r.targetCircle)
      ? r.targetCircle
      : DEFAULT_TRAJECTORY_APPEARANCE.targetCircle,
  };
}
