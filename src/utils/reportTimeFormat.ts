/**
 * Operator-friendly time text for mission reports.
 *
 *   10:42 AM, Monday Oct 12      (formatDateTime)
 *   10:42:07 AM                  (formatClock with seconds)
 *   21 min 41 s                  (formatTotalTime)
 *
 * Everything is formatted in the device's local time zone with plain Date
 * getters, so it does not depend on Intl support in the JS engine.
 */

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const NO_TIME = "—";

const pad2 = (value: number): string => String(value).padStart(2, "0");

/** Parse an ISO string, epoch number or Date. Anything else gives null. */
export function parseReportTime(
  value: string | number | Date | null | undefined,
): Date | null {
  if (value === null || value === undefined) return null;
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    // Seconds (about 1.7e9) versus milliseconds (about 1.7e12).
    date = new Date(value < 1e11 ? value * 1000 : value);
  } else {
    const text = value.trim();
    // A bare clock such as "10:42:07" has no date, so it cannot be placed.
    if (!text || !/\d{4}-\d{2}-\d{2}/.test(text)) return null;
    date = new Date(text);
  }
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "10:42 AM", or "10:42:07 AM" with seconds. */
export function formatClock(date: Date, withSeconds = false): string {
  const hours24 = date.getHours();
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const seconds = withSeconds ? `:${pad2(date.getSeconds())}` : "";
  return `${hours12}:${pad2(date.getMinutes())}${seconds} ${suffix}`;
}

/** "Monday Oct 12". */
export function formatDay(date: Date): string {
  return `${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** "10:42 AM, Monday Oct 12". */
export function formatDateTime(date: Date): string {
  return `${formatClock(date)}, ${formatDay(date)}`;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Time a point was marked. Seconds are kept because points are marked a few
 * seconds apart. The day is added only when it differs from the mission start
 * (a mission that runs past midnight).
 */
export function formatPointTime(date: Date, missionStart: Date | null): string {
  const clock = formatClock(date, true);
  if (missionStart && !sameCalendarDay(date, missionStart)) {
    return `${clock}, ${SHORT_DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}`;
  }
  return clock;
}

/** "45 s", "21 min 41 s", "1 h 05 min". NO_TIME when not a valid span. */
export function formatTotalTime(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return NO_TIME;
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} h ${pad2(minutes)} min`;
  if (minutes > 0) return `${minutes} min ${pad2(seconds)} s`;
  return `${seconds} s`;
}
