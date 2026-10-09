import type { ComponentProps } from "react";
import type { MaterialCommunityIcons } from "@expo/vector-icons";

export type MaterialCommunityIconName =
  ComponentProps<typeof MaterialCommunityIcons>["name"];

/**
 * Single typed source of truth for GCS system icon glyphs.
 * All keys map strictly to valid MaterialCommunityIcons glyph names.
 * Invalid glyph names fail TypeScript compilation via `satisfies Record<string, MaterialCommunityIconName>`.
 */
export const APP_ICONS = {
  // Modal Navigation & Frame
  settings: "cog",
  close: "close",
  chevronRight: "chevron-right",
  chevronLeft: "chevron-left",

  // Settings Sidebar Categories (Solid/Filled for Sunlight Readability)
  categoryRtk: "satellite-uplink",
  categoryMission: "bullseye-arrow",
  categoryObstacle: "radar",
  categoryVoice: "volume-high",
  categoryLed: "led-on",
  categoryMavlink: "tune-vertical",

  // Mission Defaults & Marking Tool Selectors (Solid)
  toolSpray: "spray",
  toolLaser: "laser-pointer",
  laserInfo: "crosshairs",
  save: "content-save",

  // Spray Actuator Card & Hardware Test
  actuatorSpray: "spray",
  testPulse: "lightning-bolt",
  testSuccess: "check-circle-outline",
  testError: "alert-circle-outline",
  stepperMinus: "minus",
  stepperPlus: "plus",
  circle: "circle",

  // Voice Feedback Controls
  genderMale: "gender-male",
  genderFemale: "gender-female",
  audioTest: "volume-vibrate",

  // MAVLink Parameter Browser
  paramBrowser: "file-document-edit-outline",

  // Caution & Failsafe Banners
  warning: "alert-circle-outline",
  danger: "alert-octagon",
} as const satisfies Record<string, MaterialCommunityIconName>;

export type AppIconKey = keyof typeof APP_ICONS;
