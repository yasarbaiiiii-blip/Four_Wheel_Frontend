/**
 * Forward ultrasonic obstacle status (rover_ws obstacle_monitor, schema
 * dyx4wd/obstacle@1), as served by GET /api/obstacle/status and by the
 * `obstacle` section of the telemetry socket payload.
 *
 * Only the rover decides the zone: danger pauses a RUNNING mission (manual
 * resume only) and blocks START/RESUME/NEXT; warning is spoken only; a dead
 * sensor is a warning only and the mission continues without protection.
 */

export type ObstacleZone = "clear" | "warning" | "danger" | "unknown";

export interface ObstacleView {
  /** The rover has reported a status at least once. */
  available: boolean;
  enabled: boolean;
  /** A fresh reading exists (the backend clears this when the status is stale). */
  healthy: boolean;
  zone: ObstacleZone;
  distance_mm: number | null;
  danger_mm: number | null;
  warning_mm: number | null;
  port: string | null;
  serial_error: string | null;
}

const ZONES: ReadonlySet<string> = new Set(["clear", "warning", "danger", "unknown"]);

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/** Normalise a raw status object; returns null when there is nothing usable. */
export function toObstacleView(raw: unknown): ObstacleView | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).length === 0) return null;

  const healthy = r.healthy === true;
  const zoneText = typeof r.zone === "string" ? r.zone.toLowerCase() : "unknown";
  return {
    available: r.available === undefined ? true : r.available === true,
    enabled: r.enabled === true,
    healthy,
    zone: healthy && ZONES.has(zoneText) ? (zoneText as ObstacleZone) : "unknown",
    distance_mm: healthy ? finiteOrNull(r.distance_mm) : null,
    danger_mm: finiteOrNull(r.danger_mm),
    warning_mm: finiteOrNull(r.warning_mm),
    port: stringOrNull(r.port),
    serial_error: stringOrNull(r.serial_error),
  };
}

export function formatMetres(mm: number | null): string {
  return mm === null ? "--" : `${(mm / 1000).toFixed(2)} m`;
}

/** Short live line, e.g. "0.80 m · DANGER" or "No reading". */
export function obstacleReadingText(view: ObstacleView | null): string {
  if (!view || !view.available) return "Sensor status unavailable";
  if (!view.healthy) return "No reading";
  if (view.distance_mm === null) return `Nothing in range · ${view.zone.toUpperCase()}`;
  return `${formatMetres(view.distance_mm)} · ${view.zone.toUpperCase()}`;
}

/** True when two views would render the same (used to skip telemetry re-renders). */
export function sameObstacleView(a: ObstacleView | null | undefined, b: ObstacleView | null | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.available === b.available &&
    a.enabled === b.enabled &&
    a.healthy === b.healthy &&
    a.zone === b.zone &&
    a.distance_mm === b.distance_mm &&
    a.danger_mm === b.danger_mm &&
    a.warning_mm === b.warning_mm &&
    a.serial_error === b.serial_error
  );
}
