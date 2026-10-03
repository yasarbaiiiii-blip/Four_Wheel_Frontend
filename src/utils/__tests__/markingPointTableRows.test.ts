import {
  buildMarkingPointListRevision,
  buildMarkingPointRows,
  formatRawGnssAccuracyCells,
  markingPointRowRevision,
  markingPointStatusRevision,
  RAW_GNSS_UNAVAILABLE,
} from "../markingPointTableRows";

const wp = (sn: number, lat = 1 + sn, lon = 2 + sn) => ({
  sn,
  lat,
  lon,
  block: "A",
  row: "1",
  pile: String(sn),
});

describe("markingPointTableRows", () => {
  test("status revision is stable across object identity", () => {
    const a = {
      status: "completed",
      timestamp: "2026-09-10T12:00:00",
      remark: "Along 1 | Cross 2 | Overall 3",
      survey: { available: true, radial_error_mm: 12.5 },
    };
    const b = { ...a, survey: { ...a.survey } };

    expect(markingPointStatusRevision(a)).toBe(markingPointStatusRevision(b));
  });

  test("status revision changes when live fields change", () => {
    const pending = { status: "pending" };
    const reached = { status: "reached", timestamp: "12:00:01" };
    const marked = {
      status: "completed",
      timestamp: "12:00:02",
      remark: "Along 4.0 mm | Cross 1.0 mm | Overall 4.1 mm",
      survey: { available: true, radial_error_mm: 4.1 },
    };

    expect(markingPointStatusRevision(pending)).not.toBe(
      markingPointStatusRevision(reached),
    );
    expect(markingPointStatusRevision(reached)).not.toBe(
      markingPointStatusRevision(marked),
    );
  });

  test("row revision includes current-waypoint flag", () => {
    const waypoint = wp(3);
    const status = { status: "reached" };

    expect(markingPointRowRevision(waypoint, status, false)).not.toBe(
      markingPointRowRevision(waypoint, status, true),
    );
  });

  test("list revision is stable when only statusMap identity changes", () => {
    const waypoints = [wp(1), wp(2)];
    const statusA = {
      1: { status: "completed", remark: "RPP" },
      2: { status: "pending" },
    };
    const statusB = {
      1: { status: "completed", remark: "RPP" },
      2: { status: "pending" },
    };

    expect(buildMarkingPointListRevision(waypoints, statusA, 2)).toBe(
      buildMarkingPointListRevision(waypoints, statusB, 2),
    );
  });

  test("list revision changes when a point is marked without remounting", () => {
    const waypoints = [wp(1), wp(2)];
    const before = {
      1: { status: "reached" },
      2: { status: "pending" },
    };
    const after = {
      1: {
        status: "completed",
        timestamp: "12:00:03",
        remark: "Along 2.0 mm | Cross 0.5 mm | Overall 2.1 mm",
        survey: { available: true, radial_error_mm: 2.1 },
      },
      2: { status: "reached" },
    };

    expect(buildMarkingPointListRevision(waypoints, before, 1)).not.toBe(
      buildMarkingPointListRevision(waypoints, after, 2),
    );
  });

  test("rows bake live status so recycled cells do not keep stale closures", () => {
    const waypoints = [wp(1), wp(2)];
    const statusMap = {
      1: { status: "completed", remark: "Along 1" },
      2: { status: "reached" },
    };

    const rows = buildMarkingPointRows(waypoints, statusMap, 2);

    expect(rows).toHaveLength(2);
    expect(rows[0].wpStatus?.status).toBe("completed");
    expect(rows[0].wpStatus?.remark).toBe("Along 1");
    expect(rows[0].isCurrentWaypoint).toBe(false);
    expect(rows[1].wpStatus?.status).toBe("reached");
    expect(rows[1].isCurrentWaypoint).toBe(true);
    expect(rows[0].revision).not.toBe(rows[1].revision);
  });
});

describe("shareUnchangedRows (P0025 completes in a 1000-point mission)", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { shareUnchangedRows } = require("../markingPointTableRows");

  function build(completedUpTo: number, p25Remark = "Along — | Cross — | Overall —") {
    const map: Record<number, any> = {};
    for (let sn = 1; sn <= 1000; sn += 1) {
      const done = sn <= completedUpTo;
      map[sn] = {
        reached: done,
        marked: done,
        status: done ? "completed" : "pending",
        timestamp: done ? `t${sn}` : undefined,
        remark: sn === 25 ? p25Remark : "Along — | Cross — | Overall —",
        survey: done ? { available: true, radial_error_mm: sn / 10, reason: null } : null,
      };
    }
    return map;
  }

  test("only the completed row gets a new object", () => {
    const before = shareUnchangedRows(null, build(24));
    const after = shareUnchangedRows(
      before,
      build(25, "Along -4.5 mm | Cross +12.3 mm | Overall 13.1 mm"),
    );
    expect(after).not.toBe(before);
    const changed = Object.keys(after).filter(
      (k) => after[Number(k)] !== before[Number(k)],
    );
    expect(changed).toEqual(["25"]);
  });

  test("a rebuild with no displayed change returns the previous map", () => {
    const before = shareUnchangedRows(null, build(10));
    expect(shareUnchangedRows(before, build(10))).toBe(before);
  });

  test("a survey detail change is not swallowed", () => {
    const before = shareUnchangedRows(null, build(10));
    const next = build(10);
    next[5] = { ...next[5], survey: { ...next[5].survey, extra: 1 } };
    const after = shareUnchangedRows(before, next);
    expect(after[5]).toBe(next[5]);
    expect(after[6]).toBe(before[6]);
  });
});

describe("formatRawGnssAccuracyCells (Along / Cross / Overall = RAW GNSS)", () => {
  test("formats backend survey-truth along/cross (signed) and radial (overall)", () => {
    expect(
      formatRawGnssAccuracyCells({
        available: true,
        along_track_error_mm: 12.34,
        cross_track_error_mm: -7.25,
        radial_error_mm: 14.31,
      }),
    ).toEqual({ along: "+12.3 mm", cross: "-7.3 mm", overall: "14.3 mm" });
  });

  test("zero is unsigned", () => {
    expect(
      formatRawGnssAccuracyCells({
        available: true,
        along_track_error_mm: 0,
        cross_track_error_mm: 0,
        radial_error_mm: 0,
      }),
    ).toEqual({ along: "0.0 mm", cross: "0.0 mm", overall: "0.0 mm" });
  });

  test.each([
    ["missing survey", undefined],
    ["null survey", null],
    ["unavailable survey", { available: false, reason: "not stationary", radial_error_mm: 9 }],
  ])("%s shows the unavailable marker for every column", (_label, survey) => {
    expect(formatRawGnssAccuracyCells(survey as never)).toEqual({
      along: RAW_GNSS_UNAVAILABLE,
      cross: RAW_GNSS_UNAVAILABLE,
      overall: RAW_GNSS_UNAVAILABLE,
    });
  });

  test("radial-only survey shows overall but leaves along/cross unavailable", () => {
    expect(
      formatRawGnssAccuracyCells({ available: true, radial_error_mm: 21 }),
    ).toEqual({
      along: RAW_GNSS_UNAVAILABLE,
      cross: RAW_GNSS_UNAVAILABLE,
      overall: "21.0 mm",
    });
  });

  test("RPP remark never leaks into the raw GNSS cells", () => {
    const status = {
      status: "completed",
      remark: "Along +4.0 mm | Cross -1.0 mm | Overall 4.1 mm",
      survey: null,
    };
    const rows = buildMarkingPointRows([wp(1)], { 1: status }, null);
    expect(formatRawGnssAccuracyCells(rows[0].wpStatus?.survey)).toEqual({
      along: RAW_GNSS_UNAVAILABLE,
      cross: RAW_GNSS_UNAVAILABLE,
      overall: RAW_GNSS_UNAVAILABLE,
    });
  });

  test("revision changes when only raw GNSS along/cross change", () => {
    const a = {
      status: "completed",
      survey: { available: true, along_track_error_mm: 1, cross_track_error_mm: 2, radial_error_mm: 3 },
    };
    const b = { ...a, survey: { ...a.survey, cross_track_error_mm: -2 } };
    const c = { ...a, survey: { ...a.survey, along_track_error_mm: 5 } };
    expect(markingPointStatusRevision(a)).not.toBe(markingPointStatusRevision(b));
    expect(markingPointStatusRevision(a)).not.toBe(markingPointStatusRevision(c));
  });

  test("revision ignores the (no longer displayed) remark", () => {
    const a = { status: "completed", remark: "Along 1" };
    const b = { status: "completed", remark: "Along 2" };
    expect(markingPointStatusRevision(a)).toBe(markingPointStatusRevision(b));
  });
});
