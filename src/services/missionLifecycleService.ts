/**
 * missionLifecycleService — Start / Stop / Pause / Resume / Restart / Status.
 *
 * All calls go through apiClient with automatic token injection.
 * State machine: idle → arming → switching_offboard → running → stopped/completed
 */

import { apiGet, apiPost } from './apiClient';
import { PX4_MISSION } from '../config/px4Endpoints';
import type {
  MissionRestartRequest,
  MissionRestartResponse,
  MissionStatusResponse,
  PointPauseResponse,
  PointResumeResponse,
  PointMissionStatusResponse,
  PointEventHistoryResponse,
} from '../types/px4/mission';
import {
  normalizePointMissionStatus,
} from './px4PointApiNormalize';

// ── Mission lifecycle ─────────────────────────────────────────────────────────

/**
 * Pause a point mission. Returns 409 on continuous/dash missions.
 */
export async function pauseMission(): Promise<PointPauseResponse> {
  return apiPost<PointPauseResponse>(PX4_MISSION.PAUSE);
}

/**
 * Resume a paused point mission.
 * @param expectedGeneration Optional generation guard to prevent stale resume.
 */
export async function resumeMission(
  expectedGeneration?: number,
): Promise<PointResumeResponse> {
  return apiPost<PointResumeResponse>(
    PX4_MISSION.RESUME,
    expectedGeneration !== undefined ? { expected_generation: expectedGeneration } : undefined,
  );
}

/**
 * Restart a stopped or completed mission from the beginning.
 */
export async function restartMission(
  request: MissionRestartRequest = {},
): Promise<MissionRestartResponse> {
  return apiPost<MissionRestartResponse>(PX4_MISSION.RESTART, request);
}

/**
 * Get current mission status snapshot.
 * Use for polling or initial page load.
 */
export async function getMissionStatus(): Promise<MissionStatusResponse> {
  return apiGet<MissionStatusResponse>(PX4_MISSION.STATUS);
}

// ── Point mission ─────────────────────────────────────────────────────────────

/**
 * Get detailed point mission status (index, generation, waiting state).
 */
export async function getPointStatus(): Promise<PointMissionStatusResponse> {
  const raw = await apiGet<Record<string, unknown>>(PX4_MISSION.POINT_STATUS);
  return normalizePointMissionStatus(raw);
}

/**
 * Get event history for reconnect backfill.
 * @param sinceEventId Last event ID seen — server returns events after this ID.
 */
export async function getPointEvents(
  sinceEventId?: number,
): Promise<PointEventHistoryResponse> {
  const query = sinceEventId !== undefined ? `?since_event_id=${sinceEventId}` : '';
  return apiGet<PointEventHistoryResponse>(`${PX4_MISSION.POINT_EVENTS}${query}`);
}

export default {
  pauseMission,
  resumeMission,
  restartMission,
  getMissionStatus,
  getPointStatus,
  getPointEvents,
};
