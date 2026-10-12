import {
  DEFAULT_ROVER_ICON_ID,
  ROVER_ICON_OPTIONS,
  getRoverIconOption,
  isRoverIconId,
  toRoverIconId,
} from "../roverIcons";

describe("rover icon registry", () => {
  it("offers the three new icons and the original one", () => {
    expect(ROVER_ICON_OPTIONS.map((o) => o.id)).toEqual([
      "amber",
      "solar",
      "clean",
      "classic",
    ]);
  });

  it("has unique ids, names and descriptions for every option", () => {
    const ids = ROVER_ICON_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const option of ROVER_ICON_OPTIONS) {
      expect(option.name.trim()).not.toBe("");
      expect(option.description.trim()).not.toBe("");
    }
  });

  it("defaults to an icon that exists", () => {
    expect(isRoverIconId(DEFAULT_ROVER_ICON_ID)).toBe(true);
    expect(DEFAULT_ROVER_ICON_ID).toBe("amber");
  });

  it("turns any unknown or malformed value into the default", () => {
    for (const bad of [null, undefined, "", " amber", "AMBER", "rover", 3, {}, [], true]) {
      expect(toRoverIconId(bad)).toBe(DEFAULT_ROVER_ICON_ID);
    }
    expect(toRoverIconId("clean")).toBe("clean");
    expect(toRoverIconId("classic")).toBe("classic");
  });

  it("finds an option by id and never returns undefined", () => {
    expect(getRoverIconOption("solar").name).toBe("Solar");
    expect(getRoverIconOption("nope" as never).id).toBe("amber");
  });
});
