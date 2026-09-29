import { PX4_SPRAY } from "../config/px4Endpoints";
import { apiGet, apiPost } from "./apiClient";

/**
 * Spray hold time / test duration limits enforced by the rover backend
 * (POST /api/spray/duration and /api/spray/test): > 0 and <= 3.0 s. The
 * upper bound is spray_controller's manual_override_timeout_sec.
 */
export const SPRAY_DURATION_MIN_EXCLUSIVE_SEC = 0;
export const SPRAY_DURATION_MAX_SEC = 3.0;

export function sprayDurationError(value: number): string | null {
  if (!Number.isFinite(value) || value <= SPRAY_DURATION_MIN_EXCLUSIVE_SEC) {
    return "Spray time must be greater than 0 seconds.";
  }
  if (value > SPRAY_DURATION_MAX_SEC) {
    return `Spray time must be at most ${SPRAY_DURATION_MAX_SEC.toFixed(1)} seconds.`;
  }
  return null;
}

function assertValidSprayDuration(value: number): void {
  const error = sprayDurationError(value);
  if (error) {
    throw new Error(error);
  }
}

export interface SprayConfig {
  available: boolean;
  status_age_sec?: number | null;
  press_pwm_us: number | null;
  release_pwm_us: number | null;
  press_value?: number | null;
  release_value?: number | null;
  spray_duration_sec?: number | null;
  controller_state?: string | null;
  ready?: boolean;
  fault_latched?: boolean;
  fault_reason?: string | null;
  config_request_id?: string | null;
  config_result?: string | null;
  config_reason?: string | null;
  pwm_min_us?: number;
  pwm_max_us?: number;

  // Added 2026-09-28 (rover_ws latency-hardening 5f92816 / b16c158 / eb0d3b8).
  /** Runtime master gate (POST /enable, /disable). */
  enabled?: boolean;
  /** "saved" = operator value from POST /duration; "launch" = launch file. */
  spray_duration_source?: "saved" | "launch" | null;
  /** Upper bound for hold time / test duration (3.0 s). */
  manual_override_timeout_sec?: number | null;
  spraying?: boolean;
  manual_active?: boolean;
  manual_requested?: boolean;
  manual_deadline_remaining_sec?: number | null;
  press_may_be_active?: boolean;
  release_confirmed?: boolean;
  marking_tool?: "LASER" | "SPRAY" | null;
  laser_on?: boolean;
  laser_blinking?: boolean;
  laser_on_point_id?: string | null;
  laser_on_pwm_us?: number | null;
  laser_off_pwm_us?: number | null;
  laser_value_source?: "saved" | "launch" | null;
  laser_pwm_min_us?: number;
  laser_pwm_max_us?: number;
}

export interface SprayConfigResponse {
  success: boolean;
  message?: string;
  config: SprayConfig;
}

export interface SprayBasicResponse {
  success: boolean;
  message?: string;
  /** Present on /duration and /enable|/disable responses. */
  config?: SprayConfig;
  /** /test only: the duration actually used, and whether it was capped. */
  duration_s?: number;
  duration_capped?: boolean;
  /** /test and /on: acceptance is not physical confirmation (GET /status). */
  physical_state_confirmed?: boolean;
}

export async function getSprayConfig(): Promise<SprayConfigResponse> {
  return apiGet<SprayConfigResponse>(PX4_SPRAY.CONFIG);
}

export async function enableSpray(): Promise<SprayBasicResponse> {
  return apiPost<SprayBasicResponse>(PX4_SPRAY.ENABLE, {});
}

export async function disableSpray(): Promise<SprayBasicResponse> {
  return apiPost<SprayBasicResponse>(PX4_SPRAY.DISABLE, {});
}

/** Save the mission spray hold time on the rover (persists across restarts). */
export async function setSprayDuration(spray_duration_sec: number): Promise<SprayBasicResponse> {
  assertValidSprayDuration(spray_duration_sec);
  return apiPost<SprayBasicResponse>("/api/spray/duration", { spray_duration_sec });
}

/**
 * One server-timed test spray: ON, hold duration_s, OFF.
 *
 * The backend contract is { on: boolean, duration_s?: number }; it refuses
 * while a mission is active and needs PX4 armed. Success means the
 * controller accepted the request, not that the servo physically moved.
 */
export async function testSpray(spray_duration_sec: number): Promise<SprayBasicResponse> {
  assertValidSprayDuration(spray_duration_sec);
  return apiPost<SprayBasicResponse>(PX4_SPRAY.TEST, {
    on: true,
    duration_s: spray_duration_sec,
  });
}

/** Cancel a running test and release the servo (safe to repeat). */
export async function cancelSprayTest(): Promise<SprayBasicResponse> {
  return apiPost<SprayBasicResponse>(PX4_SPRAY.TEST, { on: false });
}

export default {
  getSprayConfig,
  enableSpray,
  disableSpray,
  setSprayDuration,
  testSpray,
  cancelSprayTest,
};
