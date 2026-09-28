import { PX4_SPRAY } from "../config/px4Endpoints";
import { apiGet, apiPost } from "./apiClient";

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
}

export interface SprayConfigResponse {
  success: boolean;
  message?: string;
  config: SprayConfig;
}

export interface SprayBasicResponse {
  success: boolean;
  message?: string;
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

export async function testSpray(spray_duration_sec: number): Promise<SprayBasicResponse> {
  if (!Number.isFinite(spray_duration_sec) || spray_duration_sec < 0) {
    throw new Error("Spray duration must be a valid positive number.");
  }
  return apiPost<SprayBasicResponse>(PX4_SPRAY.TEST, { spray_duration_sec });
}

export default {
  getSprayConfig,
  enableSpray,
  disableSpray,
  testSpray,
};
