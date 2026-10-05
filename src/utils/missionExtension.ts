/**
 * Row extension: rover-owned settings and the decisions the rover reports.
 *
 * The rover computes every extension point (trajectory_generator). The tablet
 * only edits the settings and shows what the rover returns, and it never keeps
 * a copy of either beyond the current screen (Upgrade Extension plan, rover_ws
 * docs/UPGRADE_EXTENSION_PLAN.md, sections 6.1-6.5).
 */

import { ApiError } from "../services/apiError";

export interface ExtensionSettings {
  enabled: boolean;
  distance_m: number | null;
  trigger_distance_m: number | null;
  source: "OPERATOR" | "DEFAULT" | null;
  revision: number;
  /** Row ends (marking point IDs) where the operator turned it off. */
  skip_row_ends?: string[];
}

export interface ExtensionBounds {
  distance_m: { min: number; max: number; warn_above: number; default: number };
  trigger_distance_m: { min: number; max: number; default: number };
}

export type ExtensionDecisionCode =
  | "ADDED"
  | "SKIPPED_OPERATOR"
  | "SKIPPED_GAP"
  | "DISABLED";

/** Another marking point within 0.30 m of an extension leg (warn only). */
export interface ExtensionClearanceWarning {
  point: string;
  distance_m: number;
}

export interface ExtensionDecision {
  from_point: string;
  to_point: string;
  gap_m: number;
  transfer_deg: number;
  reversal_deg: number;
  decision: ExtensionDecisionCode;
  /** lat/lon for GPS missions, x/y for local ones; ADDED only. */
  point: { lat: number; lon: number } | { x: number; y: number } | null;
  warnings?: ExtensionClearanceWarning[];
  revision: number | null;
}

export interface ExtensionDefaults {
  distance_m: number;
  trigger_distance_m: number;
}

export interface MissionExtensionResponse {
  success: boolean;
  mission_id: string | null;
  extension: ExtensionSettings | null;
  bounds: ExtensionBounds;
  decisions_current?: boolean;
  decisions?: ExtensionDecision[];
  /** Skipped row ends that no longer match an extendable row end. */
  unused_skips?: string[];
  defaults?: ExtensionDefaults;
  defaults_source?: "saved" | "factory";
}

export interface ExtensionDefaultsResponse {
  success: boolean;
  defaults: ExtensionDefaults;
  defaults_source: "saved" | "factory";
}

/** What the operator applies from the dialog. */
export interface ExtensionChoice {
  enabled: boolean;
  distanceM: number;
  triggerDistanceM: number;
  /**
   * Row ends to skip. Only sent when changing a loaded mission in place; a
   * new upload always starts with none.
   */
  skipRowEnds?: string[];
}

/** Used only until the rover has answered (same values the rover enforces). */
export const FALLBACK_EXTENSION_BOUNDS: ExtensionBounds = {
  distance_m: { min: 1.0, max: 20.0, warn_above: 8.0, default: 4.0 },
  trigger_distance_m: { min: 1.0, max: 5.0, default: 3.0 },
};

export const DEFAULT_EXTENSION_CHOICE: ExtensionChoice = {
  enabled: false,
  distanceM: FALLBACK_EXTENSION_BOUNDS.distance_m.default,
  triggerDistanceM: FALLBACK_EXTENSION_BOUNDS.trigger_distance_m.default,
};

/** Dialog values from the rover's settings; defaults where a value is absent. */
export function choiceFromSettings(
  settings: ExtensionSettings | null,
  bounds: ExtensionBounds = FALLBACK_EXTENSION_BOUNDS,
  defaults?: ExtensionDefaults | null,
): ExtensionChoice {
  return {
    enabled: settings?.enabled === true,
    distanceM:
      settings?.distance_m ?? defaults?.distance_m ?? bounds.distance_m.default,
    triggerDistanceM:
      settings?.trigger_distance_m ??
      defaults?.trigger_distance_m ??
      bounds.trigger_distance_m.default,
    skipRowEnds: [...(settings?.skip_row_ends ?? [])],
  };
}

/** Row ends the operator may skip or un-skip: the ones that would extend. */
export function isSkippable(decision: ExtensionDecision): boolean {
  return decision.decision === "ADDED" || decision.decision === "SKIPPED_OPERATOR";
}

/** One line per clearance warning, for the reason list. */
export function describeWarnings(decision: ExtensionDecision): string[] {
  return (decision.warnings ?? []).map(
    (warning) =>
      `passes ${warning.distance_m.toFixed(2)} m from ${warning.point}`,
  );
}

export interface ChoiceValidation {
  distanceError: string | null;
  triggerError: string | null;
  distanceWarning: string | null;
}

function rangeError(
  label: string,
  value: number,
  min: number,
  max: number,
): string | null {
  if (!Number.isFinite(value)) {
    return `Enter a valid ${label.toLowerCase()}.`;
  }
  if (value < min || value > max) {
    return `${label} must be between ${min.toFixed(1)} and ${max.toFixed(1)} m.`;
  }
  return null;
}

/** Same limits the rover enforces; a disabled choice is always valid. */
export function validateChoice(
  choice: ExtensionChoice,
  bounds: ExtensionBounds = FALLBACK_EXTENSION_BOUNDS,
): ChoiceValidation {
  if (!choice.enabled) {
    return { distanceError: null, triggerError: null, distanceWarning: null };
  }
  const distanceError = rangeError(
    "Extension distance",
    choice.distanceM,
    bounds.distance_m.min,
    bounds.distance_m.max,
  );
  return {
    distanceError,
    triggerError: rangeError(
      "Trigger distance",
      choice.triggerDistanceM,
      bounds.trigger_distance_m.min,
      bounds.trigger_distance_m.max,
    ),
    distanceWarning:
      !distanceError && choice.distanceM > bounds.distance_m.warn_above
        ? `Over ${bounds.distance_m.warn_above.toFixed(0)} m past every row end. ` +
          "Check the ground there is clear."
        : null,
  };
}

/** Plain-language reason for one row-end decision. */
export function describeDecision(
  decision: ExtensionDecision,
  settings: ExtensionSettings | null,
): string {
  const pair = `${decision.from_point} → ${decision.to_point}`;
  if (decision.decision === "ADDED") {
    const distance = settings?.distance_m;
    return distance != null
      ? `${pair}: extension added, ${distance.toFixed(1)} m past the row end`
      : `${pair}: extension added`;
  }
  if (decision.decision === "SKIPPED_OPERATOR") {
    return `${pair}: skipped by operator`;
  }
  if (decision.decision === "SKIPPED_GAP") {
    const trigger = settings?.trigger_distance_m;
    return trigger != null
      ? `${pair}: no extension, rows ${decision.gap_m.toFixed(2)} m apart ` +
          `(trigger ${trigger.toFixed(2)} m)`
      : `${pair}: no extension, rows ${decision.gap_m.toFixed(2)} m apart`;
  }
  return `${pair}: row end, extension is off`;
}

/** Panel label: OFF, or ON with distance and trigger. */
export function extensionSummary(settings: ExtensionSettings | null): string {
  if (!settings) return "—";
  if (!settings.enabled) return "OFF";
  const distance = settings.distance_m?.toFixed(1) ?? "?";
  const trigger = settings.trigger_distance_m?.toFixed(1) ?? "?";
  const skipped = settings.skip_row_ends?.length ?? 0;
  const suffix = skipped > 0 ? ` · ${skipped} skipped` : "";
  return `ON · ${distance} m · trigger ${trigger} m${suffix}`;
}

export interface ExtensionPointFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: { label: string };
  }>;
}

/**
 * Map features for ADDED decisions with lat/lon. Returns null unless the rover
 * marked the decisions current, so stale points are never drawn.
 */
export function extensionPointFeatures(
  decisions: ExtensionDecision[],
  decisionsCurrent: boolean,
): ExtensionPointFeatureCollection | null {
  if (!decisionsCurrent) return null;
  const features: ExtensionPointFeatureCollection["features"] = [];
  for (const decision of decisions) {
    const point = decision.point;
    if (decision.decision !== "ADDED" || !point || !("lat" in point)) continue;
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [point.lon, point.lat] },
      properties: { label: "X" },
    });
  }
  return features.length > 0 ? { type: "FeatureCollection", features } : null;
}

/** The rover's refusal code (e.g. REVISION_CONFLICT), when it sent one. */
export function extensionErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.responseBody) return null;
  try {
    const parsed = JSON.parse(error.responseBody);
    const code = parsed?.detail?.code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
}
