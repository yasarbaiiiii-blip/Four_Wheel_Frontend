import { gnssFixLabel } from "../gnssFixLabel";

describe("gnssFixLabel", () => {
  it.each([
    [6, "RTK Fixed"],
    [5, "RTK Float"],
    [4, "DGPS"],
    [3, "3D Fix"],
    [2, "2D Fix"],
    [1, "No Fix"],
    [0, "No Fix"],
  ])("labels fix type %i as %s", (fixType, label) => {
    expect(gnssFixLabel(fixType)).toBe(label);
  });

  it("does not call an unknown fix type a fix", () => {
    expect(gnssFixLabel(8)).toBe("No Fix");
  });

  it("shows a dash when there is no reading", () => {
    expect(gnssFixLabel(null)).toBe("—");
    expect(gnssFixLabel(undefined)).toBe("—");
  });
});
