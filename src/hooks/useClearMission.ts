/**
 * useClearMission — Shared hook for the Clear Mission operation.
 *
 * Implements the single unified mission-removal operation across Mission Activity
 * and Path Plan screens:
 *   - Backend CLEAR deletes the runtime mission, the uploaded CSV and the path.
 *   - Active missions (running/paused/armed) must be STOPPED first; Clear never stops one.
 *   - Guarantees fail-closed safety: never arms, starts, resumes, sprays, or moves the rover.
 *   - Synchronous in-flight mutex prevents race conditions / double taps.
 *   - Authoritative post-clear verification: status must be EMPTY with an empty
 *     mission id and an empty loaded path before success is reported. A
 *     verification that cannot be completed is a failure, never a success.
 *   - After verified success the local waypoints, preview and trajectory are reset
 *     so nothing stale can be auto-uploaded again.
 */

import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";

import { useBackendTrajectory } from "../context/BackendTrajectoryContext";
import { useConnection } from "../context/ConnectionContext";
import { useMission } from "../context/MissionContext";
import { useVerifiedMissionContext } from "../context/VerifiedMissionContext";
import { ApiError } from "../services/apiError";
import PersistentStorage from "../services/PersistentStorage";
import {
  clearMission,
  getLoadedMissionPath,
  getMissionStatus,
  type ClearMissionRequest,
  type ClearMissionResponse,
  type LoadedPathResponse,
  type MissionRuntimeState,
  type MissionStatusResponse,
} from "../services/missionApi";

export interface UseClearMissionOptions {
  currentMission?: MissionRuntimeState | null;
  filename?: string | null;
  fileId?: string | null;
  /** The screen holds an uploaded/previewed mission the controller may own. */
  hasMissionHint?: boolean;
  /** Caller-supplied refusal (e.g. an upload is in flight). */
  blockedReason?: string | null;
  /** Re-checked at execution time (refs that do not re-render, e.g. uploads). */
  getBlockedReason?: () => string | null;
  onCleared?: () => void;
  onError?: (error: Error) => void;
}

const EMPTY_STATES = new Set(["", "EMPTY", "CLEARED"]);

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

/**
 * Post-clear proof. Returns null when the rover is verifiably EMPTY, otherwise
 * the reason it is not. Missing/failed reads are NOT proof of an empty rover.
 */
export function verifyMissionCleared(
  status: MissionStatusResponse | null,
  path: LoadedPathResponse | null,
  pathError: unknown,
): string | null {
  const mission = status?.mission;
  if (!status || status.success === false || !mission) {
    return "Could not confirm the rover is empty (mission status unavailable).";
  }
  if (String(mission.state ?? "").trim().toUpperCase() !== "EMPTY") {
    return `Rover mission state is ${String(mission.state ?? "unknown")}, not EMPTY.`;
  }
  if (!isBlank(mission.mission_id) || !isBlank(mission.mission_run_id)) {
    return "Rover still reports a mission ID after clear.";
  }
  if (mission.loaded || mission.active || mission.ready || mission.accepted_for_start) {
    return "Rover still reports a loaded or ready mission after clear.";
  }

  if (path) {
    if (path.success === false) {
      return "Could not confirm the loaded path is empty.";
    }
    if ((path.points?.length ?? 0) > 0 || (path.navigation_point_count ?? 0) > 0) {
      return "Rover still reports a loaded path after clear.";
    }
    if (!isBlank(path.mission_id)) {
      return "Rover still reports a path mission ID after clear.";
    }
    return null;
  }
  // "No path" answers from the rover are the expected result of a clear.
  if (
    pathError instanceof ApiError &&
    (pathError.statusCode === 404 ||
      pathError.statusCode === 409 ||
      pathError.statusCode === 410)
  ) {
    return null;
  }
  return "Could not confirm the loaded path is empty (path check failed).";
}

export interface UseClearMissionResult {
  isClearing: boolean;
  canClear: boolean;
  refusalReason: string | null;
  confirmAndClear: () => void;
  executeClearDirectly: () => Promise<ClearMissionResponse | null>;
}

function generateRequestId(): string {
  return `clear_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function useClearMission(
  options: UseClearMissionOptions = {},
): UseClearMissionResult {
  const {
    currentMission,
    filename,
    fileId,
    hasMissionHint,
    blockedReason,
    getBlockedReason,
    onCleared,
    onError,
  } = options;

  const { connectionState } = useConnection();
  const {
    missionId: verifiedMissionId,
    missionName: verifiedMissionName,
    clearLoadedMission,
  } = useVerifiedMissionContext();
  const { clearTrajectory, refreshNow } = useBackendTrajectory();
  const { clearMissionWaypoints } = useMission();

  const [isClearing, setIsClearing] = useState(false);
  const isClearingRef = useRef(false);

  const isConnected = connectionState === "connected";

  // Active mission state resolution
  const effectiveState = (currentMission?.state ?? "").toUpperCase();
  const isArmed = Boolean(currentMission?.px4_armed);
  const isRunning =
    effectiveState === "RUNNING" ||
    effectiveState === "PAUSED" ||
    effectiveState === "ARMING" ||
    effectiveState === "SWITCHING_OFFBOARD" ||
    effectiveState === "LOADING" ||
    effectiveState === "STOPPING" ||
    currentMission?.active === true;

  const hasRuntimeMission = Boolean(
    currentMission?.loaded ||
      currentMission?.ready ||
      currentMission?.completed ||
      currentMission?.accepted_for_start ||
      (currentMission?.mission_id && !EMPTY_STATES.has(effectiveState)) ||
      verifiedMissionId ||
      hasMissionHint,
  );

  // Eligibility evaluation
  let refusalReason: string | null = null;
  if (!isConnected) {
    refusalReason = "Rover is disconnected. Clear requires an authoritative connection.";
  } else if (isArmed) {
    refusalReason = "Cannot clear mission while PX4 is armed. Disarm first.";
  } else if (isRunning) {
    refusalReason =
      effectiveState === "PAUSED"
        ? "Mission is paused. Stop the mission before clearing."
        : "Stop the running mission before clearing.";
  } else if (isClearing) {
    refusalReason = "Clear mission operation is already in progress.";
  } else if (blockedReason) {
    refusalReason = blockedReason;
  }

  const canClear =
    isConnected &&
    !isArmed &&
    !isRunning &&
    !isClearing &&
    !blockedReason &&
    hasRuntimeMission;

  const targetFilename =
    filename ??
    currentMission?.filename ??
    verifiedMissionName ??
    "mission.csv";

  const executeClearDirectly = useCallback(async (): Promise<ClearMissionResponse | null> => {
    // 1. Synchronous mutex
    if (isClearingRef.current) {
      console.warn("[useClearMission] Clear already in flight, ignoring duplicate request");
      return null;
    }
    // STOP-first: Clear never stops, disarms or interrupts an active mission,
    // even when called directly rather than through the confirm dialog.
    const lateBlock =
      !isConnected || isArmed || isRunning
        ? refusalReason
        : (getBlockedReason?.() ?? null);
    if (lateBlock) {
      const blocked = new Error(lateBlock);
      onError?.(blocked);
      throw blocked;
    }
    isClearingRef.current = true;
    setIsClearing(true);

    try {
      // 2. Build payload with identity and fencing
      const activeMissionId =
        currentMission?.mission_id ??
        currentMission?.mission_run_id ??
        verifiedMissionId ??
        null;
      const generation =
        typeof currentMission?.generation === "number"
          ? currentMission.generation
          : 0;

      const payload: ClearMissionRequest = {
        file_id: fileId ?? targetFilename,
        expected_mission_id: activeMissionId,
        expected_generation: generation,
        request_id: generateRequestId(),
      };

      console.log("[useClearMission] Sending clear request:", payload);
      const clearRes = await clearMission(payload);

      if (!clearRes.success && !clearRes.cleared) {
        throw new Error(clearRes.message || "The rover refused the clear mission request.");
      }

      // 3. Post-clear authoritative verification. Never report success on a
      //    failed or missing read.
      const pathErrorRef: { current: unknown } = { current: null };
      const [freshStatusRes, freshPathRes] = await Promise.all([
        getMissionStatus().catch((err) => {
          console.warn("[useClearMission] Verification status check error:", err);
          return null;
        }),
        getLoadedMissionPath().catch((err) => {
          pathErrorRef.current = err;
          console.warn("[useClearMission] Verification path check error:", err);
          return null;
        }),
      ]);

      const verificationFailure = verifyMissionCleared(
        freshStatusRes,
        freshPathRes,
        pathErrorRef.current,
      );
      if (verificationFailure) {
        // The rover accepted CLEAR but we cannot prove it is empty: leave
        // local state untouched and re-sync from the rover.
        void refreshNow().catch(() => {});
        throw new Error(`Verification failed: ${verificationFailure}`);
      }

      // 4. Update local persistence (Phase 8)
      const runtimeCleared = await PersistentStorage.clearActiveMissionRuntime();
      if (!runtimeCleared) {
        console.warn("[useClearMission] Warning: PersistentStorage.clearActiveMissionRuntime returned false");
      }

      // 5. Reconcile frontend contexts
      clearLoadedMission();
      clearTrajectory();
      // The CSV is gone on the rover; stale local waypoints must not be
      // re-uploaded or shown as a live plan.
      try {
        await clearMissionWaypoints();
      } catch (waypointError) {
        console.warn("[useClearMission] Local waypoint reset failed:", waypointError);
      }
      await refreshNow();

      console.log("[useClearMission] Successfully cleared mission runtime state");
      onCleared?.();
      return clearRes;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[useClearMission] Clear mission failed:", error);
      onError?.(error);
      throw error;
    } finally {
      isClearingRef.current = false;
      setIsClearing(false);
    }
  }, [
    currentMission,
    fileId,
    targetFilename,
    verifiedMissionId,
    clearLoadedMission,
    clearTrajectory,
    clearMissionWaypoints,
    refreshNow,
    getBlockedReason,
    isConnected,
    isArmed,
    isRunning,
    refusalReason,
    onCleared,
    onError,
  ]);

  const confirmAndClear = useCallback(() => {
    if (!canClear) {
      if (refusalReason) {
        Alert.alert("Cannot Clear Mission", refusalReason);
      }
      return;
    }

    Alert.alert(
      `Clear “${targetFilename}” mission?`,
      "This will:\n• unload the mission from the controller\n• delete the uploaded mission file and path from the rover\n• clear current progress, trajectory and local waypoints\n• disable Start and Resume\n\nThis cannot be undone. Upload a new plan to continue.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Clear Mission",
          style: "destructive",
          onPress: () => {
            void executeClearDirectly()
              .then(() => {
                Alert.alert("Mission Cleared", "The mission, uploaded file and path were deleted from the rover. Upload a new plan to continue.");
              })
              .catch((err) => {
                const message = err instanceof Error ? err.message : String(err);
                Alert.alert("Clear Failed", message);
              });
          },
        },
      ],
      { cancelable: true },
    );
  }, [canClear, refusalReason, targetFilename, executeClearDirectly]);

  return {
    isClearing,
    canClear,
    refusalReason,
    confirmAndClear,
    executeClearDirectly,
  };
}

export default useClearMission;
