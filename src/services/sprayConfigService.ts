import { PX4_SPRAY } from "../config/px4Endpoints";
import { apiGet, apiPost } from "./apiClient";

export interface SprayConfig {
  available: boolean;
  status_age_sec?: number | null;
  /** Backend-confirmed controller enable state; never derive this locally. */
  enabled?: boolean;
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
  spray_duration_source?: "launch" | "saved" | null;
  manual_override_timeout_sec?: number | null;
  marking_tool?: "LASER" | "SPRAY" | null;
  laser_on?: boolean;
  laser_blinking?: boolean;
  laser_on_point_id?: string | null;
  laser_on_pwm_us?: number | null;
  laser_off_pwm_us?: number | null;
  laser_value_source?: "launch" | "saved" | null;
  laser_pwm_min_us?: number;
  laser_pwm_max_us?: number;
  manual_active?: boolean;
  press_may_be_active?: boolean;
  release_confirmed?: boolean;
}

export interface SprayConfigResponse {
  success: boolean;
  message?: string;
  config: SprayConfig;
}

export interface SprayBasicResponse {
  success: boolean;
  message?: string;
  physical_state_confirmed?: boolean;
  retry_safe?: boolean;
}

const DEFAULT_MANUAL_OVERRIDE_TIMEOUT_SEC = 3;

function assertValidDuration(durationS: number, maximumS = DEFAULT_MANUAL_OVERRIDE_TIMEOUT_SEC): void {
  if (!Number.isFinite(durationS) || durationS <= 0 || durationS > maximumS) {
    throw new Error(`Spray duration must be greater than 0 and no more than ${maximumS} seconds.`);
  }
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

export async function setSprayDuration(spray_duration_sec: number): Promise<SprayBasicResponse> {
  assertValidDuration(spray_duration_sec);
  return apiPost<SprayBasicResponse>("/api/spray/duration", { spray_duration_sec });
}

export async function testSpray(spray_duration_sec: number): Promise<SprayBasicResponse> {
  assertValidDuration(spray_duration_sec);
  return apiPost<SprayBasicResponse>(PX4_SPRAY.TEST, { on: true, duration_s: spray_duration_sec });
}

export async function cancelSprayTest(): Promise<SprayBasicResponse> {
  return apiPost<SprayBasicResponse>(PX4_SPRAY.TEST, { on: false });
}

export async function setLaserConfig(on_pwm_us: number, off_pwm_us: number): Promise<SprayConfigResponse> {
  if (!Number.isInteger(on_pwm_us) || !Number.isInteger(off_pwm_us) || on_pwm_us < 1000 || on_pwm_us > 2000 || off_pwm_us < 1000 || off_pwm_us > 2000 || on_pwm_us === off_pwm_us) {
    throw new Error("Laser ON and OFF PWM must be different whole numbers between 1000 and 2000 µs.");
  }
  return apiPost<SprayConfigResponse>(PX4_SPRAY.LASER_CONFIG, { on_pwm_us, off_pwm_us });
}

export async function turnSprayOn(): Promise<SprayBasicResponse> {
  return apiPost<SprayBasicResponse>(PX4_SPRAY.ON);
}

export async function turnSprayOff(): Promise<SprayBasicResponse> {
  return apiPost<SprayBasicResponse>(PX4_SPRAY.OFF);
}

export default {
  getSprayConfig,
  enableSpray,
  disableSpray,
  setSprayDuration,
  testSpray,
  cancelSprayTest,
  setLaserConfig,
  turnSprayOn,
  turnSprayOff,
};
