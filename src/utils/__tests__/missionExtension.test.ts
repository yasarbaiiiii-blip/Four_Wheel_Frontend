/** Row extension: limits, reasons and map points must match the rover contract. */

import { ApiError } from "../../services/apiError";
import {
  DEFAULT_EXTENSION_CHOICE,
  FALLBACK_EXTENSION_BOUNDS,
  choiceFromSettings,
  describeDecision,
  describeWarnings,
  isSkippable,
  extensionErrorCode,
  extensionPointFeatures,
  extensionSummary,
  validateChoice,
  type ExtensionDecision,
  type ExtensionSettings,
} from "../missionExtension";

const ON: ExtensionSettings = {
  enabled: true,
  distance_m: 4,
  trigger_distance_m: 3,
  source: "OPERATOR",
  revision: 2,
};

const ADDED: ExtensionDecision = {
  from_point: "P0004",
  to_point: "P0005",
  gap_m: 1.02,
  transfer_deg: 90,
  reversal_deg: 180,
  decision: "ADDED",
  point: { lat: 13.0831, lon: 80.2709 },
  revision: 2,
};

const SKIPPED: ExtensionDecision = {
  ...ADDED,
  from_point: "P0012",
  to_point: "P0013",
  gap_m: 3.2,
  decision: "SKIPPED_GAP",
  point: null,
};

describe("validateChoice", () => {
  it("accepts the rover's limits at both ends", () => {
    expect(validateChoice({ enabled: true, distanceM: 1, triggerDistanceM: 5 })).toEqual({
      distanceError: null,
      triggerError: null,
      distanceWarning: null,
    });
    expect(validateChoice({ enabled: true, distanceM: 20, triggerDistanceM: 1 }).distanceError).toBeNull();
  });

  it("refuses values outside the limits", () => {
    expect(validateChoice({ enabled: true, distanceM: 0.5, triggerDistanceM: 3 }).distanceError).toMatch(/1\.0 and 20\.0/);
    expect(validateChoice({ enabled: true, distanceM: 4, triggerDistanceM: 5.5 }).triggerError).toMatch(/1\.0 and 5\.0/);
    expect(validateChoice({ enabled: true, distanceM: Number.NaN, triggerDistanceM: 3 }).distanceError).toMatch(/valid/);
  });

  it("warns above 8 m but still allows it", () => {
    const result = validateChoice({ enabled: true, distanceM: 9, triggerDistanceM: 3 });
    expect(result.distanceError).toBeNull();
    expect(result.distanceWarning).toMatch(/clear/);
  });

  it("never blocks turning the extension off", () => {
    expect(validateChoice({ enabled: false, distanceM: Number.NaN, triggerDistanceM: 99 }).distanceError).toBeNull();
  });
});

describe("choiceFromSettings", () => {
  it("takes the rover's values", () => {
    expect(choiceFromSettings({ ...ON, skip_row_ends: ["P0004"] })).toEqual({
      enabled: true,
      distanceM: 4,
      triggerDistanceM: 3,
      skipRowEnds: ["P0004"],
    });
  });

  it("fills defaults when the rover reports the extension off", () => {
    const off = { ...ON, enabled: false, distance_m: null, trigger_distance_m: null };
    expect(choiceFromSettings(off)).toEqual({ ...DEFAULT_EXTENSION_CHOICE, skipRowEnds: [] });
    expect(choiceFromSettings(null)).toEqual({ ...DEFAULT_EXTENSION_CHOICE, skipRowEnds: [] });
  });

  it("uses saved defaults where the rover has no value", () => {
    expect(
      choiceFromSettings(null, undefined, { distance_m: 6, trigger_distance_m: 2 }),
    ).toMatchObject({ distanceM: 6, triggerDistanceM: 2 });
  });
});

describe("reason text and summary", () => {
  it("explains an added and a skipped row end", () => {
    expect(describeDecision(ADDED, ON)).toBe("P0004 → P0005: extension added, 4.0 m past the row end");
    expect(describeDecision(SKIPPED, ON)).toBe("P0012 → P0013: no extension, rows 3.20 m apart (trigger 3.00 m)");
  });

  it("summarises the settings for the panel", () => {
    expect(extensionSummary(ON)).toBe("ON · 4.0 m · trigger 3.0 m");
    expect(extensionSummary({ ...ON, enabled: false })).toBe("OFF");
    expect(extensionSummary(null)).toBe("—");
  });
});

describe("extensionPointFeatures", () => {
  it("draws only ADDED points with lat/lon", () => {
    const local: ExtensionDecision = { ...ADDED, from_point: "P0008", point: { x: 1, y: -4 } };
    const shape = extensionPointFeatures([ADDED, SKIPPED, local], true);
    expect(shape?.features).toHaveLength(1);
    expect(shape?.features[0].geometry.coordinates).toEqual([80.2709, 13.0831]);
  });

  it("draws nothing unless the rover marked the decisions current", () => {
    expect(extensionPointFeatures([ADDED], false)).toBeNull();
    expect(extensionPointFeatures([SKIPPED], true)).toBeNull();
  });
});

describe("extensionErrorCode", () => {
  it("reads the rover's refusal code", () => {
    const body = JSON.stringify({ detail: { code: "REVISION_CONFLICT", message: "changed" } });
    expect(extensionErrorCode(new ApiError("changed", 409, body))).toBe("REVISION_CONFLICT");
  });

  it("returns null for other errors", () => {
    expect(extensionErrorCode(new ApiError("x", 409, "{\"detail\":\"plain\"}"))).toBeNull();
    expect(extensionErrorCode(new Error("x"))).toBeNull();
  });
});

it("fallback limits match the rover", () => {
  expect(FALLBACK_EXTENSION_BOUNDS.distance_m).toMatchObject({ min: 1, max: 20, warn_above: 8, default: 4 });
  expect(FALLBACK_EXTENSION_BOUNDS.trigger_distance_m).toMatchObject({ min: 1, max: 5, default: 3 });
});

describe("phase 3: skips and warnings", () => {
  it("only extendable row ends can be skipped", () => {
    expect(isSkippable(ADDED)).toBe(true);
    expect(isSkippable({ ...ADDED, decision: "SKIPPED_OPERATOR", point: null })).toBe(true);
    expect(isSkippable(SKIPPED)).toBe(false);
  });

  it("explains an operator skip and counts skips in the summary", () => {
    expect(describeDecision({ ...ADDED, decision: "SKIPPED_OPERATOR", point: null }, ON)).toBe(
      "P0004 → P0005: skipped by operator",
    );
    expect(extensionSummary({ ...ON, skip_row_ends: ["P0004", "P0008"] })).toBe(
      "ON · 4.0 m · trigger 3.0 m · 2 skipped",
    );
  });

  it("lists clearance warnings", () => {
    expect(describeWarnings({ ...ADDED, warnings: [{ point: "P0013", distance_m: 0.2 }] })).toEqual([
      "passes 0.20 m from P0013",
    ]);
    expect(describeWarnings(ADDED)).toEqual([]);
  });
});
