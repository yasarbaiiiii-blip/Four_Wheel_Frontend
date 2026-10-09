import fs from "fs";
import path from "path";
import { APP_ICONS } from "../../constants/icons";

// Typographical, scientific, and engineering symbols allow-listed for rover GCS UI
const ALLOW_LIST = new Set([
  "µ", // Micro (e.g. microseconds PWM)
  "μ", // Greek small letter mu
  "°", // Degrees (e.g. heading angle)
  "²", // Square
  "·", // Middle dot separator
  "—", // Em dash
  "–", // En dash
  "±", // Plus-minus
  "≤", // Less than or equal
  "≥", // Greater than or equal
  "≈", // Approximately
]);

// Unicode Extended Pictographic & common emoji / dingbat codepoints
const EMOJI_REGEX =
  /(\p{Extended_Pictographic}|[✕›✓●⚡⚙📡🎯🚫🔊💡💧💾⏳👨👩🎵📋⚠️✅❌⛔])/u;

describe("Production Icons Regression Guard", () => {
  const inScopeFiles = [
    path.resolve("src/screens/SettingsScreen.tsx"),
    path.resolve("src/components/settings/SprayActuatorCard.tsx"),
  ];

  it("verifies in-scope files contain zero casual emojis or unlisted symbols", () => {
    for (const filePath of inScopeFiles) {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");

      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        // Skip comment lines
        if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("/*") ||
          trimmed.startsWith("*")
        ) {
          return;
        }

        const matches = line.match(new RegExp(EMOJI_REGEX.source, "gu"));
        if (matches) {
          const violations = matches.filter((char) => !ALLOW_LIST.has(char));
          if (violations.length > 0) {
            throw new Error(
              `Emoji regression found in ${path.basename(filePath)} line ${idx + 1}: ${violations.join(", ")} in "${trimmed}"`,
            );
          }
        }
      });
    }
  });

  it("verifies all APP_ICONS keys are valid non-empty glyph names", () => {
    expect(Object.keys(APP_ICONS).length).toBeGreaterThanOrEqual(15);
    for (const [key, glyphName] of Object.entries(APP_ICONS)) {
      expect(typeof glyphName).toBe("string");
      expect(glyphName.length).toBeGreaterThan(0);
      expect(key).toBeTruthy();
    }
  });

  it("verifies specific revised production glyph choices", () => {
    // Mission defaults uses bullseye-arrow (not crosshairs-gps)
    expect(APP_ICONS.categoryMission).toBe("bullseye-arrow");
    // Tool selectors use spray and laser-pointer
    expect(APP_ICONS.toolSpray).toBe("spray");
    expect(APP_ICONS.toolLaser).toBe("laser-pointer");
    // LED controller uses led-on (chassis indicator diode)
    expect(APP_ICONS.categoryLed).toBe("led-on");
    // Obstacle safety uses radar (LiDAR scanning sweep)
    expect(APP_ICONS.categoryObstacle).toBe("radar");
    // Hardware pulse uses solid lightning-bolt
    expect(APP_ICONS.testPulse).toBe("lightning-bolt");
  });
});
