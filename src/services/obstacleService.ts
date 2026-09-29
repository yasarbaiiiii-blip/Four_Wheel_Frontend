/**
 * Forward obstacle sensor API (rover_ws rover_backend obstacle_routes.py).
 *
 * Settings are validated and saved on the rover by obstacle_monitor; a
 * rejected change raises an ApiError (409) carrying the rover's reason.
 */

import { apiGet, apiPost } from "./apiClient";
import { PX4_OBSTACLE } from "../config/px4Endpoints";
import { ObstacleView, toObstacleView } from "../utils/obstacleStatus";

interface ObstacleStatusResponse {
  success: boolean;
  available?: boolean;
  status?: Record<string, unknown>;
}

interface ObstacleConfigResponse {
  success: boolean;
  message?: string;
  status?: Record<string, unknown>;
}

export interface ObstacleConfigChanges {
  enabled?: boolean;
  danger_mm?: number;
  warning_mm?: number;
}

/** Current rover status; null when obstacle_monitor has not reported yet. */
export async function getObstacleStatus(): Promise<ObstacleView | null> {
  const response = await apiGet<ObstacleStatusResponse>(PX4_OBSTACLE.STATUS);
  if (!response?.available) return null;
  return toObstacleView(response.status);
}

/** Apply settings on the rover; resolves with the status the rover now reports. */
export async function setObstacleConfig(
  changes: ObstacleConfigChanges,
): Promise<{ message: string; status: ObstacleView | null }> {
  const response = await apiPost<ObstacleConfigResponse>(PX4_OBSTACLE.CONFIG, changes);
  if (!response?.success) {
    throw new Error(response?.message || "The rover rejected the obstacle settings");
  }
  return {
    message: response.message || "Obstacle settings saved.",
    status: toObstacleView(response.status),
  };
}

export default { getObstacleStatus, setObstacleConfig };
