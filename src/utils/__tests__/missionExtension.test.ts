import { ApiError } from "../../services/apiError";
import { filterLoadedPathPoints } from "../backendTrajectoryPreview";
import {
  DEFAULT_EXTENSION_CHOICE, FALLBACK_EXTENSION_BOUNDS, choiceFromSettings,
  describeDecision, extensionErrorDetail, extensionPointFeatures, extensionSummary,
  validateChoice, type ExtensionRowEnd, type ExtensionSettings,
} from "../missionExtension";

const settings: ExtensionSettings = { enabled: true, distance_m: 4, trigger_m: 2, source: "EXTENSION_API" };
const added: ExtensionRowEnd = {
  from_marking_index: 0, to_marking_index: 1, from_label: "P0001", to_label: "P0002",
  gap_m: 1.9, sideways_angle_deg: 95, next_row_angle_deg: 178,
  result: "ADDED", extension_point: { x: 4, y: 7, latitude: 13.0831, longitude: 80.2709 }, extra_length_m: 1.3,
};

it("accepts the backend bounds and rejects out-of-range enabled choices", () => {
  expect(validateChoice({ enabled: true, distanceM: 0.1, triggerDistanceM: 5 }).distanceError).toBeNull();
  expect(validateChoice({ enabled: true, distanceM: 20, triggerDistanceM: 1 }).triggerError).toBeNull();
  expect(validateChoice({ enabled: true, distanceM: 0.05, triggerDistanceM: 2 }).distanceError).toMatch(/0\.1 and 20\.0/);
  expect(validateChoice({ enabled: true, distanceM: 4, triggerDistanceM: 9 }).triggerError).toMatch(/1\.0 and 5\.0/);
  expect(validateChoice({ enabled: false, distanceM: Number.NaN, triggerDistanceM: 9 }).triggerError).toBeNull();
});

it("uses live rover settings or limits without saved-default state", () => {
  expect(choiceFromSettings(settings)).toEqual({ enabled: true, distanceM: 4, triggerDistanceM: 2 });
  expect(choiceFromSettings(null)).toEqual(DEFAULT_EXTENSION_CHOICE);
  expect(choiceFromSettings({ ...settings, enabled: false, distance_m: null }, { ...FALLBACK_EXTENSION_BOUNDS, default_distance_m: 6 })).toEqual({ enabled: false, distanceM: 6, triggerDistanceM: 2 });
});

it("describes server row ends and counts only typed extension points", () => {
  expect(describeDecision(added, settings)).toContain("extension added");
  expect(describeDecision({ ...added, result: "SKIPPED_GAP", extension_point: null }, settings)).toContain("trigger 2.00 m");
  expect(extensionSummary(settings)).toBe("ON · 4.0 m · trigger 2.0 m");
  expect(extensionPointFeatures([
    { x: 4, y: 7, latitude: 13.0831, longitude: 80.2709, type: "extension" },
    { x: 5, y: 8, latitude: 13.0832, longitude: 80.2710, type: "marking" },
  ])?.features).toHaveLength(1);
  expect(filterLoadedPathPoints([
    { latitude: 13.0831, longitude: 80.2709, x: 4, y: 7, type: "extension" },
    { latitude: 13.0832, longitude: 80.2710, type: "marking", marking_index: 1, label: "P0002" },
  ])).toMatchObject([{ type: "extension" }, { type: "marking", label: "P0002" }]);
});

it("extracts recovery identity and operator message from a failed apply", () => {
  const error = new ApiError("HTTP 409", 409, JSON.stringify({ detail: {
    code: "EXTENSION_NOT_APPLIED", message: "Previous path restored.", mission_id: "app_restored", restored: true,
  } }));
  expect(extensionErrorDetail(error)).toEqual({ code: "EXTENSION_NOT_APPLIED", message: "Previous path restored.", missionId: "app_restored", missionCleared: false });
});
