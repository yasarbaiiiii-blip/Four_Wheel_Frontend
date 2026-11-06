/** Rover-owned row-end extension contract. Geometry is never computed here. */
import { ApiError } from "../services/apiError";

export interface ExtensionSettings {
  enabled: boolean;
  distance_m: number | null;
  trigger_m: number;
  source: string | null;
}

export interface ExtensionLimits {
  min_distance_m: number;
  max_distance_m: number;
  default_distance_m: number;
  min_trigger_m: number;
  max_trigger_m: number;
  default_trigger_m: number;
  trigger_rule: string;
}

export interface ExtensionPoint {
  x: number;
  y: number;
  latitude: number;
  longitude: number;
  type: "marking" | "extension" | "path";
  marking_index?: number;
  label?: string;
}

export interface ExtensionRowEnd {
  from_marking_index: number;
  to_marking_index: number;
  from_label: string;
  to_label: string;
  gap_m: number;
  sideways_angle_deg: number;
  next_row_angle_deg: number;
  result: "ADDED" | "SKIPPED_GAP" | "DISABLED" | "SKIPPED_OPERATOR";
  extension_point: Omit<ExtensionPoint, "type"> | null;
  extra_length_m: number;
}

export interface ExtensionGeometry {
  dummy_point_count: number;
  row_end_count: number;
  row_ends_extended: number;
  row_ends_skipped_gap: number;
  navigation_point_count: number;
  path_length_m: number;
  extra_length_m: number;
  signature: string;
  row_ends: ExtensionRowEnd[];
  points?: ExtensionPoint[];
}

export interface MissionExtensionResponse extends Partial<ExtensionGeometry> {
  success: boolean;
  available: boolean;
  mission_id: string | null;
  editable: boolean;
  locked_reason: string | null;
  message?: string;
  extension: ExtensionSettings;
  limits: ExtensionLimits;
}

export interface ExtensionPreviewResponse extends ExtensionGeometry {
  success: boolean;
  preview: true;
  applied: false;
  mission_id: string;
  extension: ExtensionSettings;
  current_extension: ExtensionSettings;
  changes_path: boolean;
  limits: ExtensionLimits;
  points: ExtensionPoint[];
}

export interface ExtensionApplyResponse extends ExtensionGeometry {
  success: boolean;
  changed: boolean;
  mission_id: string | null;
  previous_mission_id: string | null;
  editable: boolean;
  message: string;
  extension: ExtensionSettings;
  limits: ExtensionLimits;
  mission: unknown;
  points: ExtensionPoint[];
}

export interface ExtensionChoice {
  enabled: boolean;
  distanceM: number;
  triggerDistanceM: number;
}

export const FALLBACK_EXTENSION_BOUNDS: ExtensionLimits = {
  min_distance_m: 0.1,
  max_distance_m: 20,
  default_distance_m: 4,
  min_trigger_m: 1,
  max_trigger_m: 5,
  default_trigger_m: 3,
  trigger_rule: "Added only where the two row-end points are less than the trigger distance apart.",
};

export const DEFAULT_EXTENSION_CHOICE: ExtensionChoice = {
  enabled: false,
  distanceM: FALLBACK_EXTENSION_BOUNDS.default_distance_m,
  triggerDistanceM: FALLBACK_EXTENSION_BOUNDS.default_trigger_m,
};

export function choiceFromSettings(settings: ExtensionSettings | null, limits: ExtensionLimits = FALLBACK_EXTENSION_BOUNDS): ExtensionChoice {
  return {
    enabled: settings?.enabled === true,
    distanceM: settings?.distance_m ?? limits.default_distance_m,
    triggerDistanceM: settings?.trigger_m ?? limits.default_trigger_m,
  };
}

export interface ChoiceValidation {
  distanceError: string | null;
  triggerError: string | null;
  distanceWarning: string | null;
}

function rangeError(label: string, value: number, min: number, max: number): string | null {
  if (!Number.isFinite(value)) return `Enter a valid ${label.toLowerCase()}.`;
  if (value < min || value > max) return `${label} must be between ${min.toFixed(1)} and ${max.toFixed(1)} m.`;
  return null;
}

/** Distance and trigger are sent only while enabled. */
export function validateChoice(choice: ExtensionChoice, limits: ExtensionLimits = FALLBACK_EXTENSION_BOUNDS): ChoiceValidation {
  if (!choice.enabled) return { distanceError: null, triggerError: null, distanceWarning: null };
  const distanceError = rangeError("Extension distance", choice.distanceM, limits.min_distance_m, limits.max_distance_m);
  return {
    distanceError,
    triggerError: rangeError("Trigger distance", choice.triggerDistanceM, limits.min_trigger_m, limits.max_trigger_m),
    distanceWarning: !distanceError && choice.distanceM > 8 ? "Over 8 m past every row end. Check the ground there is clear." : null,
  };
}

export function describeDecision(row: ExtensionRowEnd, settings: ExtensionSettings | null): string {
  const pair = `${row.from_label} → ${row.to_label}`;
  if (row.result === "ADDED") return `${pair}: extension added${settings?.distance_m != null ? `, ${settings.distance_m.toFixed(1)} m past the row end` : ""}`;
  if (row.result === "SKIPPED_GAP") return `${pair}: no extension, rows ${row.gap_m.toFixed(2)} m apart (trigger ${(settings?.trigger_m ?? 3).toFixed(2)} m)`;
  if (row.result === "SKIPPED_OPERATOR") return `${pair}: skipped by operator`;
  return `${pair}: row end, extension is off`;
}

export function extensionSummary(settings: ExtensionSettings | null): string {
  if (!settings) return "—";
  if (!settings.enabled) return "OFF";
  return `ON · ${settings.distance_m?.toFixed(1) ?? "?"} m · trigger ${settings.trigger_m.toFixed(1)} m`;
}

export interface ExtensionPointFeatureCollection {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: { label: string } }>;
}

export function extensionPointFeatures(points: Array<Pick<ExtensionPoint, "latitude" | "longitude"> & Partial<ExtensionPoint>>): ExtensionPointFeatureCollection | null {
  const features: ExtensionPointFeatureCollection["features"] = [];
  for (const point of points) {
    if (point.type !== "extension" || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) continue;
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [point.longitude, point.latitude] }, properties: { label: "X" } });
  }
  return features.length ? { type: "FeatureCollection", features } : null;
}

export function extensionErrorDetail(error: unknown): { code: string | null; message: string; missionId: string | null; missionCleared: boolean } {
  const fallback = error instanceof Error ? error.message : "The rover did not accept the change.";
  if (!(error instanceof ApiError) || !error.responseBody) return { code: null, message: fallback, missionId: null, missionCleared: false };
  try {
    const detail = JSON.parse(error.responseBody)?.detail;
    return {
      code: typeof detail?.code === "string" ? detail.code : null,
      message: typeof detail?.message === "string" ? detail.message : fallback,
      missionId: typeof detail?.mission_id === "string" ? detail.mission_id : null,
      missionCleared: detail?.mission_cleared === true,
    };
  } catch {
    return { code: null, message: fallback, missionId: null, missionCleared: false };
  }
}

export function extensionErrorCode(error: unknown): string | null { return extensionErrorDetail(error).code; }
