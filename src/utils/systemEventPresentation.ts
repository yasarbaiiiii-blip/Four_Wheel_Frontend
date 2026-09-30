/**
 * Rover `system_event` socket notifications (system_event@1) -> toast view.
 *
 * rover_backend forwards Mission Manager notifications that are not tied to a
 * mission point (obstacle pause, RTK float, E-stop, ...). Safety stops stay on
 * screen until closed; recoveries and completions hide themselves.
 */
import type { ToastType } from "../components/shared/Toast";

export interface SystemEvent {
  event: string;
  message: string | null;
  missionRunId: string | null;
  timestampNs: number | null;
}

export interface SystemEventToast {
  key: string;
  type: ToastType;
  title: string;
  message: string;
  /** true: stays until the operator closes it. */
  sticky: boolean;
}

export const SYSTEM_EVENT_AUTO_HIDE_MS = 6000;
/** Same event + message within this window is shown once. */
export const SYSTEM_EVENT_DEDUP_MS = 2000;

interface Presentation {
  type: ToastType;
  title: string;
  sticky: boolean;
  fallback: string;
}

const PRESENTATION: Record<string, Presentation> = {
  ESTOP_ACTIVE: { type: "error", title: "EMERGENCY STOP", sticky: true, fallback: "Emergency stop is active. The rover will not move." },
  ESTOP_RELEASED: { type: "success", title: "E-stop released", sticky: false, fallback: "Emergency stop released." },
  OBSTACLE_PAUSED: { type: "error", title: "OBSTACLE AHEAD — MISSION PAUSED", sticky: true, fallback: "Clear the path, then press Resume." },
  OBSTACLE_CLEARED: { type: "success", title: "Path clear", sticky: false, fallback: "Obstacle cleared. You can resume the mission." },
  OBSTACLE_SENSOR_LOST: { type: "error", title: "Obstacle sensor lost", sticky: true, fallback: "Mission continues WITHOUT obstacle protection." },
  ODOM_PAUSED: { type: "error", title: "POSITION LOST — MISSION PAUSED", sticky: true, fallback: "Rover position is not reliable. Mission paused." },
  RTK_FLOAT: { type: "error", title: "RTK FLOAT — MISSION PAUSED", sticky: true, fallback: "Waiting for RTK FIXED to continue." },
  RTK_PAUSED: { type: "error", title: "RTK LOST — MISSION PAUSED", sticky: true, fallback: "RTK fix lost. Press Resume once RTK is FIXED." },
  RTK_RECOVERED: { type: "success", title: "RTK FIXED again", sticky: false, fallback: "RTK fix recovered." },
  MISSION_COMPLETED: { type: "success", title: "Mission completed", sticky: false, fallback: "All points are done." },
  MISSION_STOPPED: { type: "info", title: "Mission stopped", sticky: false, fallback: "The mission was stopped." },
  MISSION_AUTO_STOP: { type: "error", title: "MISSION STOPPED AUTOMATICALLY", sticky: true, fallback: "The rover stopped the mission. Check the mission status." },
  MISSION_TERMINATION_BLOCKED: { type: "error", title: "MISSION END BLOCKED", sticky: true, fallback: "The mission could not finish safely. Check the rover." },
  SPRAY_FAILED_MONITOR_ONLY: { type: "error", title: "Spray failed", sticky: true, fallback: "A spray did not complete. Check the marking." },
  SPRAY_TIMEOUT_MONITOR_ONLY: { type: "error", title: "Spray timed out", sticky: true, fallback: "A spray timed out. Check the marking." },
};

/**
 * Shown by their own dedicated notices already (BatteryCriticalNotice,
 * MissionRecoveryNotice); a second toast would only duplicate them.
 */
const HANDLED_ELSEWHERE = new Set(["BATTERY_CRITICAL_PAUSE", "MISSION_RECOVERED"]);

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseSystemEvent(raw: unknown): SystemEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (record.event_kind !== "SYSTEM") return null;
  const event = optionalString(record.event)?.toUpperCase();
  if (!event) return null;
  const timestamp = record.timestamp_unix_ns;
  return {
    event,
    message: optionalString(record.message),
    missionRunId: optionalString(record.mission_run_id),
    timestampNs:
      typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : null,
  };
}

function titleFromEventName(event: string): string {
  const words = event.toLowerCase().split("_").filter(Boolean);
  if (words.length === 0) return "Rover notification";
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function presentSystemEvent(event: SystemEvent): SystemEventToast | null {
  if (HANDLED_ELSEWHERE.has(event.event)) return null;
  const known = PRESENTATION[event.event];
  const message = event.message ?? known?.fallback ?? "";
  return {
    key: `${event.event}|${event.timestampNs ?? ""}|${message}`,
    type: known?.type ?? "info",
    title: known?.title ?? titleFromEventName(event.event),
    message,
    sticky: known?.sticky ?? false,
  };
}

/** true when this event repeats the previous one within the dedup window. */
export function isDuplicateSystemEvent(
  previous: { event: string; message: string; atMs: number } | null,
  next: { event: string; message: string; atMs: number },
): boolean {
  return (
    previous !== null &&
    previous.event === next.event &&
    previous.message === next.message &&
    next.atMs - previous.atMs < SYSTEM_EVENT_DEDUP_MS
  );
}
