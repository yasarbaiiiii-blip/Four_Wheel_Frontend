/**
 * Normalisation of the Jetson backend `point_event@1` Socket.IO payload.
 *
 * Wire contract (point_event, point_completed, point_skipped, point_failed):
 *   event_id           STRING (opaque; never coerced to a number for identity)
 *   event_kind         "COMPLETED" | "FAILED" | "SKIPPED"
 *   timestamp_unix_ms  integer milliseconds since the Unix epoch
 *   point_index        0-based
 *   mission_run_id / mission_id
 *
 * Rules:
 *  - A generic `point_event` with no recognisable kind is NOT an arrival; it
 *    is dropped. Nothing is inferred.
 *  - The backend's own string `event_id` is the only dedupe identity, so the
 *    generic and the specific socket event for the same result apply once.
 */

import type { PointEventType, PointMissionEvent } from "../types/px4/mission";

type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

export function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Original backend event_id as a string, or null when absent/empty. */
export function backendEventIdString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function isoFromUnixMs(value: unknown): string | undefined {
  const ms = finiteNumber(value);
  if (ms === null) return undefined;
  const date = new Date(ms);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

/** Explicit kind mapping; returns null when nothing recognisable is present. */
export function pointEventTypeFromKind(
  socketEventName: string,
  payload: UnknownRecord,
): PointEventType | null {
  // event_kind is authoritative; the socket event name is only a fallback.
  const kind = stringValue(payload.event_kind).toUpperCase();
  if (kind) {
    if (kind === "COMPLETED") return "point_completed";
    if (kind === "FAILED") return "point_failed";
    if (kind === "SKIPPED") return "point_skipped";
    return null; // unknown kind: never guess
  }

  if (socketEventName === "point_skipped") return "point_skipped";
  if (socketEventName === "point_failed") return "point_failed";
  if (socketEventName === "point_completed") return "point_completed";

  const raw = stringValue(
    payload.event_type ?? payload.event ?? payload.status,
  ).toUpperCase();
  if (!raw) return null;

  if (raw.includes("SKIP")) return "point_skipped";
  if (raw.includes("FAIL")) return "point_failed";
  if (raw.includes("COMPLETE") || raw.includes("MARKED")) {
    return "point_completed";
  }
  if (raw.includes("PAUSE")) return "point_paused";
  if (raw.includes("RESUME")) return "point_resumed";
  if (raw.includes("DWELL") || raw.includes("HOLD")) {
    return "point_dwell_started";
  }
  if (raw.includes("ARRIV") || raw.includes("REACH")) return "point_arrived";
  if (raw.includes("START") || raw.includes("ACTIVE")) {
    return "point_leg_started";
  }
  return null;
}

export interface NormalizeOptions {
  /** Run currently loaded on the rover; foreign/missing run ids are dropped. */
  expectedRun: string | null;
  /** Allocator for the local ordering counter (not backend identity). */
  nextLocalOrder: () => number;
  fallbackPosition?: { lat: number; lng: number } | null;
  now?: () => Date;
}

export function normalizeBackendPointEvent(
  socketEventName: string,
  raw: unknown,
  options: NormalizeOptions,
): PointMissionEvent | null {
  const payload = asRecord(raw);
  if (!payload) return null;

  const runId = stringValue(payload.mission_run_id ?? payload.mission_id);
  if (options.expectedRun && runId !== options.expectedRun) return null;

  const pointIndex = finiteNumber(
    payload.point_index ??
      payload.active_point_index ??
      payload.current_point_index,
  );
  if (pointIndex === null || pointIndex < 0) return null;

  const eventType = pointEventTypeFromKind(socketEventName, payload);
  if (!eventType) return null;

  const eventKey = backendEventIdString(payload.event_id);
  const numericId = eventKey !== null ? finiteNumber(eventKey) : null;
  const generation = finiteNumber(payload.generation) ?? 0;
  const latitude = finiteNumber(payload.lat ?? payload.latitude);
  const longitude = finiteNumber(
    payload.lon ?? payload.lng ?? payload.longitude,
  );
  // The rover's point events carry an `accuracy` block and, when it measured the
  // stop, the stop position in lat/lon. Such an event must never take the live
  // rover position instead: that is where the rover is when the event arrives,
  // not where it stopped, and it gave a second, different accuracy.
  const roverMeasured = asRecord(payload.accuracy) !== null;
  const position = roverMeasured ? null : options.fallbackPosition;

  const timestamp =
    isoFromUnixMs(payload.timestamp_unix_ms) ??
    (stringValue(
      payload.timestamp ?? payload.received_at ?? payload.updated_at,
    ) ||
      (options.now?.() ?? new Date()).toISOString());

  return {
    // Numeric ordering only; identity for dedupe is `event_key`.
    event_id:
      numericId !== null ? Math.trunc(numericId) : options.nextLocalOrder(),
    event_key: eventKey ?? undefined,
    mission_run_id: runId || undefined,
    event_type: eventType,
    point_index: Math.trunc(pointIndex),
    generation: Math.trunc(generation),
    timestamp,
    terminal: payload.terminal === true,
    lat: latitude ?? position?.lat,
    lon: longitude ?? position?.lng,
    reason: stringValue(payload.reason) || undefined,
    message:
      stringValue(payload.message ?? payload.event_kind ?? payload.status) ||
      undefined,
  };
}

/** Bounded set of already-applied backend event ids, scoped per run. */
export class PointEventDeduper {
  private seen = new Set<string>();
  constructor(private readonly limit = 4096) {}

  /** True the first time a backend event_id is seen; false for repeats. */
  firstSighting(event: PointMissionEvent): boolean {
    if (!event.event_key) return true; // no identity: cannot dedupe by id
    const key = `${event.mission_run_id ?? ""}|${event.event_key}`;
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    if (this.seen.size > this.limit) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    return true;
  }

  clear(): void {
    this.seen.clear();
  }
}
