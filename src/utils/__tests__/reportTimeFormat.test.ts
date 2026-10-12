import {
  NO_TIME,
  formatClock,
  formatDateTime,
  formatDay,
  formatPointTime,
  formatTotalTime,
  parseReportTime,
} from "../reportTimeFormat";

// Local-time dates, so the tests do not depend on the machine's time zone.
// Oct 12, 2026 is a Monday.
const at = (hour: number, minute: number, second = 0, day = 12) =>
  new Date(2026, 9, day, hour, minute, second);

describe("reportTimeFormat", () => {
  it("formats the operator-facing date and time", () => {
    expect(formatDateTime(at(10, 30))).toBe("10:30 AM, Monday Oct 12");
    expect(formatDay(at(10, 30))).toBe("Monday Oct 12");
  });

  it("uses a 12-hour clock with noon and midnight handled", () => {
    expect(formatClock(at(0, 5))).toBe("12:05 AM");
    expect(formatClock(at(12, 0))).toBe("12:00 PM");
    expect(formatClock(at(15, 9, 3), true)).toBe("3:09:03 PM");
  });

  it("keeps seconds for point times and adds the day only after midnight", () => {
    const start = at(23, 50);
    expect(formatPointTime(at(23, 55, 7), start)).toBe("11:55:07 PM");
    expect(formatPointTime(at(0, 10, 2, 13), start)).toBe("12:10:02 AM, Tue Oct 13");
    expect(formatPointTime(at(10, 42, 7), null)).toBe("10:42:07 AM");
  });

  it("formats total mission time", () => {
    expect(formatTotalTime(45_000)).toBe("45 s");
    expect(formatTotalTime(21 * 60_000 + 41_000)).toBe("21 min 41 s");
    expect(formatTotalTime(21 * 60_000 + 5_000)).toBe("21 min 05 s");
    expect(formatTotalTime(3_900_000)).toBe("1 h 05 min");
    expect(formatTotalTime(0)).toBe("0 s");
  });

  it("shows a dash for an invalid span", () => {
    expect(formatTotalTime(null)).toBe(NO_TIME);
    expect(formatTotalTime(-5)).toBe(NO_TIME);
    expect(formatTotalTime(Number.NaN)).toBe(NO_TIME);
  });

  it("parses ISO text, epoch numbers and dates, and rejects the rest", () => {
    const iso = parseReportTime("2026-10-12T05:12:07.000Z");
    expect(iso?.toISOString()).toBe("2026-10-12T05:12:07.000Z");
    expect(parseReportTime(1_792_000_000)?.getTime()).toBe(1_792_000_000_000);
    expect(parseReportTime(1_792_000_000_000)?.getTime()).toBe(1_792_000_000_000);
    expect(parseReportTime(new Date(2026, 9, 12))).not.toBeNull();
    expect(parseReportTime("10:42:07")).toBeNull();
    expect(parseReportTime("-")).toBeNull();
    expect(parseReportTime("")).toBeNull();
    expect(parseReportTime(null)).toBeNull();
    expect(parseReportTime("2026-13-45T99:99:99Z")).toBeNull();
  });
});
