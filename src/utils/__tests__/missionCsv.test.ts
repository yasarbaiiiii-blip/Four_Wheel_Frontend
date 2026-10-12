import {
  buildMissionCsvFromWaypoints,
  escapeMissionCsvCell,
} from "../missionCsv";

describe("buildMissionCsvFromWaypoints", () => {
  it("writes the header and one row per point with 9-decimal coordinates", () => {
    const csv = buildMissionCsvFromWaypoints([
      { lat: 12.9716, lon: 77.5946, alt: 3, block: "A", row: "1", pile: "7" },
      { lat: 12.97, lon: 77.59 },
    ]);

    expect(csv.split("\n")).toEqual([
      "latitude,longitude,altitude,block,row,pile",
      "12.971600000,77.594600000,3,A,1,7",
      // missing alt -> 0, missing block/row -> empty, pile defaults to its number
      "12.970000000,77.590000000,0,,,2",
      "",
    ]);
  });

  it("keeps the order it is given (export of a reversed mission is reversed)", () => {
    const points = [
      { lat: 1, lon: 1, pile: "a" },
      { lat: 2, lon: 2, pile: "b" },
    ];
    const forward = buildMissionCsvFromWaypoints(points).split("\n");
    const reversed = buildMissionCsvFromWaypoints([...points].reverse()).split("\n");
    expect(forward[1]).toContain("1.000000000");
    expect(reversed[1]).toContain("2.000000000");
  });

  it("quotes cells that contain commas, quotes or newlines", () => {
    expect(escapeMissionCsvCell('a,"b"')).toBe('"a,""b"""');
    expect(escapeMissionCsvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(escapeMissionCsvCell(undefined)).toBe("");
  });

  it.each([
    [{ lat: NaN, lon: 1 }, "Point 2 has invalid coordinates."],
    [{ lat: 91, lon: 1 }, "Point 2 has an invalid latitude."],
    [{ lat: 1, lon: 181 }, "Point 2 has an invalid longitude."],
  ])("refuses to write an invalid point %j", (point, message) => {
    expect(() => buildMissionCsvFromWaypoints([{ lat: 0, lon: 0 }, point])).toThrow(
      message,
    );
  });
});
