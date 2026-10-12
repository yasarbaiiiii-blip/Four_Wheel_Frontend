/**
 * missionProgressMetrics — pure, backend-truthful numbers for the progress
 * deck. Nothing here invents a value: when the input is unknown the result is
 * null (or "—" for the formatters) so the UI never shows a made-up figure.
 */

import {
  isTerminalWaypointStatus,
  type WaypointUiStatus,
} from "../types/missionWaypointStatus";

export interface PointStatusEntry {
  status?: string;
  position_error_cm?: number;
}

export type PointStatusMap = Record<number, PointStatusEntry | undefined>;

export interface MissionProgress {
  total: number;
  /** Points the rover will not revisit (completed, skipped, failed, ...). */
  done: number;
  /** 0-100, from done/total. */
  pct: number;
  /** First point that is not terminal, or null when all are (or none exist). */
  activeIndex: number | null;
}

function isTerminal(entry: PointStatusEntry | undefined): boolean {
  return isTerminalWaypointStatus(
    (entry?.status ?? "").toLowerCase() as WaypointUiStatus,
  );
}

export function computeMissionProgress(
  waypoints: ReadonlyArray<{ sn: number }>,
  statusMap: PointStatusMap,
): MissionProgress {
  const total = waypoints.length;
  let done = 0;
  let activeIndex: number | null = null;

  waypoints.forEach((waypoint, index) => {
    if (isTerminal(statusMap[waypoint.sn])) {
      done += 1;
    } else if (activeIndex === null) {
      activeIndex = index;
    }
  });

  return {
    total,
    done,
    pct: total > 0 ? Math.round((done / total) * 100) : 0,
    activeIndex,
  };
}

/** Recorded per-point accuracy in millimetres, or null when none exists. */
export function pointAccuracyMm(
  entry: PointStatusEntry | undefined,
): number | null {
  const cm = entry?.position_error_cm;
  return typeof cm === "number" && Number.isFinite(cm) ? Math.round(cm * 10) : null;
}

/** Live receiver horizontal RMS (metres) as whole millimetres; null if unknown. */
export function hrmsToMm(hrmsM: number | null | undefined): number | null {
  return typeof hrmsM === "number" && Number.isFinite(hrmsM) && hrmsM > 0
    ? Math.round(hrmsM * 1000)
    : null;
}

/** Seconds to cover `remainingM` at the measured speed; null if not moving. */
export function estimateRemainingSec(
  remainingM: number,
  speedMps: number | null | undefined,
): number | null {
  if (
    typeof speedMps !== "number" ||
    !Number.isFinite(speedMps) ||
    speedMps < 0.1 ||
    !Number.isFinite(remainingM) ||
    remainingM < 0
  ) {
    return null;
  }
  return remainingM / speedMps;
}

export function formatDuration(totalSec: number | null | undefined): string {
  if (typeof totalSec !== "number" || !Number.isFinite(totalSec) || totalSec < 0) {
    return "—";
  }
  const seconds = Math.round(totalSec);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/** Elapsed seconds between two instants; null when the start is unknown. */
export function elapsedSec(
  startMs: number | null | undefined,
  nowMs: number,
): number | null {
  if (typeof startMs !== "number" || !Number.isFinite(startMs)) return null;
  return Math.max(0, (nowMs - startMs) / 1000);
}
