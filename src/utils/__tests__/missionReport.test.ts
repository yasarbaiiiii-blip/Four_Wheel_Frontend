// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExcelJS = require("exceljs");

import {
  buildMissionReportModel,
  generatePDFHTML,
  generateReportCsv,
  REPORT_COLUMNS,
  type ReportStatusEntry,
  type ReportWaypoint,
} from "../exportHelpers";
import { buildMissionReportXlsx } from "../missionReportXlsx";

const survey = (radialMm: number | null, available = true) => ({
  available,
  radial_error_mm: radialMm,
});

const waypoints: ReportWaypoint[] = [
  { sn: 1, row: "01", block: "A", pile: "01", lat: 12.971599, lon: 77.594566 },
  { sn: 2, row: "01", block: "A", pile: "02", lat: 12.971734, lon: 77.594642 },
  { sn: 3, row: "01", block: "A", pile: "03", lat: 12.971861, lon: 77.594721 },
  { sn: 4, row: "02", block: "A", pile: "01", lat: 12.971982, lon: 77.594808 },
  { sn: 5, row: "02", block: "A", pile: "02", lat: 12.972104, lon: 77.594894 },
  { sn: 6, row: "02", block: "A", pile: "03", lat: 12.972229, lon: 77.594978 },
  { sn: 7, row: "03", block: "A", pile: "01", lat: 12.972351, lon: 77.595063 },
  { sn: 8, row: "03", block: "A", pile: "02", lat: 12.972474, lon: 77.595149 },
];

// Times are ISO with Z so the span is the same in every time zone.
const statusMap: Record<number, ReportStatusEntry> = {
  1: { status: "completed", timestamp: "2026-10-12T05:12:07Z", survey: survey(8.2) },
  2: { status: "completed", timestamp: "2026-10-12T05:12:51Z", survey: survey(19.4) },
  3: { status: "skipped", timestamp: "2026-10-12T05:13:30Z" },
  4: { status: "completed", timestamp: "2026-10-12T05:14:12Z", survey: survey(27) },
  5: { status: "completed", timestamp: "2026-10-12T05:14:58Z", survey: survey(41) },
  6: { status: "completed", timestamp: "2026-10-12T05:15:40Z", survey: survey(72.4) },
  7: { status: "failed", timestamp: "2026-10-12T05:16:22Z" },
  8: { status: "pending" },
};

const timing = {
  startedAt: "2026-10-12T05:12:07Z",
  finishedAt: "2026-10-12T05:33:48Z",
};

const NOW = new Date(2026, 9, 12, 11, 8, 0);

function model(overrides: Partial<Parameters<typeof buildMissionReportModel>[0]> = {}) {
  return buildMissionReportModel({
    waypoints,
    statusMap,
    missionMode: "DGPS Mark",
    timing,
    now: NOW,
    ...overrides,
  });
}

describe("buildMissionReportModel", () => {
  it("counts points by status and computes the success rate", () => {
    const { stats } = model();
    expect(stats.totalPoints).toBe(8);
    expect(stats.completedPoints).toBe(5);
    expect(stats.skippedPoints).toBe(1);
    expect(stats.errorPoints).toBe(1);
    expect(stats.pendingPoints).toBe(1);
    expect(stats.successRate).toBe("62.5");
  });

  it("reports total mission time from the rover's start and finish", () => {
    const { stats } = model();
    expect(stats.totalMissionTime).toBe("21 min 41 s");
    expect(stats.startedAt).toMatch(/^\d{1,2}:\d{2} (AM|PM), [A-Z][a-z]+day [A-Z][a-z]{2} \d{1,2}$/);
    expect(stats.generatedAt).toBe("11:08 AM, Monday Oct 12");
  });

  it("falls back to the first and last point time, and never invents one", () => {
    const fromPoints = model({ timing: null }).stats;
    expect(fromPoints.totalMissionTime).toBe("4 min 15 s");

    const none = model({ timing: null, statusMap: {} }).stats;
    expect(none.totalMissionTime).toBe("—");
    expect(none.startedAt).toBe("—");
    expect(none.finishedAt).toBe("—");
  });

  it("rates the GNSS accuracy and counts each tier", () => {
    const { rows, stats } = model();
    expect(rows.map((r) => r.gnssMm)).toEqual([8, 19, null, 27, 41, 72, null, null]);
    expect(rows.map((r) => r.rating?.label ?? null)).toEqual([
      "Excellent",
      "Excellent",
      null,
      "Good",
      "Poor",
      "Failed",
      null,
      null,
    ]);
    expect(stats.ratingCounts).toEqual({ excellent: 2, good: 1, poor: 1, failed: 1 });
    expect(stats.ratedPoints).toBe(5);
    expect(stats.averageMm).toBe(33);
  });

  it("gives no accuracy when the survey is unavailable, and never uses another source", () => {
    const { rows } = model({
      statusMap: {
        1: { status: "completed", survey: survey(12, false) },
        2: { status: "completed" },
      },
    });
    expect(rows[0].gnssMm).toBeNull();
    expect(rows[1].gnssMm).toBeNull();
    expect(rows[0].rating).toBeNull();
  });

  it("lists skipped, errored and failed-accuracy points under attention", () => {
    const { stats } = model();
    expect(stats.attention.map((a) => [a.n, a.reason])).toEqual([
      [3, "Skipped"],
      [6, "Failed accuracy, 72 mm"],
      [7, "Failed"],
    ]);
    expect(stats.attention[0].where).toBe("Row 01, Block A, Pile 03");
  });

  it("shows friendly point times and a dash when a point was never marked", () => {
    const { rows } = model();
    expect(rows[0].markedAt).toMatch(/^\d{1,2}:\d{2}:07 (AM|PM)$/);
    expect(rows[7].markedAt).toBe("—");
  });

  it("handles an empty mission", () => {
    const { rows, stats } = model({ waypoints: [], statusMap: {}, timing: null });
    expect(rows).toEqual([]);
    expect(stats.successRate).toBe("0.0");
    expect(stats.averageMm).toBeNull();
  });
});

describe("generateReportCsv", () => {
  it("writes the same ten columns, quotes text and keeps blanks for no measurement", () => {
    const { rows } = model({
      waypoints: [{ sn: 1, row: "01", block: 'A "north", 2', pile: "01", lat: 1, lon: 2 }],
      statusMap: { 1: { status: "completed", survey: survey(8) } },
    });
    const csv = generateReportCsv(rows);
    expect(csv.startsWith("﻿")).toBe(true);
    const [header, line] = csv.replace("﻿", "").split("\n");
    expect(header.split(",")).toHaveLength(REPORT_COLUMNS.length);
    expect(header).toContain("GNSS accuracy (mm)");
    expect(header).not.toMatch(/Along|Cross|Overall|Altitude/);
    expect(line).toContain('"A ""north"", 2"');
    expect(line).toContain(",8,Excellent,");
  });
});

describe("generatePDFHTML", () => {
  it("has the summary, accuracy bar, attention list and grouped points", () => {
    const html = generatePDFHTML(model());
    expect(html).toContain("Way To Mark — Mission Report");
    expect(html).toContain("Total mission time");
    expect(html).toContain("21 min 41 s");
    expect(html).toContain("GNSS accuracy · average 33 mm");
    expect(html).toContain("Needs attention · 3 points");
    expect(html).toContain("Row 01 · Block A");
    expect(html).toContain("Row 03 · Block A");
    expect(html).toContain("2 of 3 completed");
    for (const label of ["Excellent", "Good", "Poor", "Failed"]) {
      expect(html).toContain(label);
    }
  });

  it("no longer shows Along, Cross or Overall", () => {
    const html = generatePDFHTML(model());
    expect(html).not.toMatch(/Along|Cross|Overall/);
  });

  it("escapes text that comes from the uploaded mission file", () => {
    const html = generatePDFHTML(
      model({
        waypoints: [{ sn: 1, row: "<b>1</b>", block: "<script>x()</script>", pile: "1", lat: 0, lon: 0 }],
        statusMap: { 1: { status: "completed" } },
      }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("buildMissionReportXlsx", () => {
  it("writes a real workbook that Excel libraries can read back", async () => {
    const built = await buildMissionReportXlsx(model());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(built.base64, "base64"));
    const sheet = workbook.getWorksheet("Mission Report")!;
    expect(sheet).toBeDefined();

    expect(sheet.getCell("A1").value).toBe("Way To Mark — Mission Report");
    expect(String(sheet.getCell("A2").value)).toContain("Mode: DGPS Mark");

    const header = sheet.getRow(built.tableHeaderRow);
    const names = REPORT_COLUMNS.map((_, i) => String(header.getCell(i + 1).value));
    expect(names).toEqual(REPORT_COLUMNS.map((c) => c.toUpperCase()));

    const first = sheet.getRow(built.tableHeaderRow + 1);
    expect(first.getCell(1).value).toBe(1);
    expect(first.getCell(2).value).toBe("01"); // leading zero kept as text
    expect(first.getCell(5).value).toBe("Completed");
    expect(first.getCell(7).value).toBe(8); // a number, so Excel can sort and average it
    expect(first.getCell(7).numFmt).toBe('0" mm"');
    expect(first.getCell(8).value).toBe("Excellent");

    const unmeasured = sheet.getRow(built.tableHeaderRow + 3); // point 3, skipped
    expect(unmeasured.getCell(7).value).toBe("—");
    expect(unmeasured.getCell(8).value).toBe("—");

    // The summary is on the sheet too.
    const text: string[] = [];
    sheet.eachRow((row: any) => row.eachCell((cell: any) => text.push(String(cell.value))));
    expect(text).toContain("Total mission time");
    expect(text).toContain("21 min 41 s");
    expect(text.some((t) => t.startsWith("Needs attention · 3 points"))).toBe(true);
  });

  it("builds an empty sheet without a filter when there are no points", async () => {
    const built = await buildMissionReportXlsx(
      model({ waypoints: [], statusMap: {}, timing: null }),
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(built.base64, "base64"));
    expect(workbook.getWorksheet("Mission Report")).toBeDefined();
  });
});
