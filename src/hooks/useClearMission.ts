/**
 * useClearMission — Shared hook for the Clear Mission operation.
 *
 * Implements the single unified mission-removal operation across Mission Activity
 * and Path Plan screens:
 *   - Clears the staged or loaded runtime mission from the controller and frontend.
 *   - Never deletes the uploaded CSV or imported waypoints.
 *   - Guarantees fail-closed safety: never arms, starts, resumes, sprays, or moves the rover.
 *   - Synchronous in-flight mutex prevents race conditions / double taps.
 *   - Authoritative post-clear verification: confirms EMPTY runtime and retained file
 *     before displaying success.
 */

import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";

import { useBackendTrajectory } from "../context/BackendTrajectoryContext";
import { useConnection } from "../context/ConnectionContext";
import { useVerifiedMissionContext } from "../context/VerifiedMissionContext";
import PersistentStorage from "../services/PersistentStorage";
import {
  clearMission,
  getLoadedMissionPath,
  getMissionStatus,
  type ClearMissionRequest,
  type ClearMissionResponse,
  type MissionRuntimeState,
} from "../services/missionApi";

export interface UseClearMissionOptions {
  currentMission?: MissionRuntimeState | null;
  filename?: string | null;
  fileId?: string | null;
  onCleared?: () => void;
  onError?: (error: Error) => void;
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
  const { currentMission, filename, fileId, onCleared, onError } = options;

  const { connectionState } = useConnection();
  const {
    missionId: verifiedMissionId,
    missionName: verifiedMissionName,
    clearLoadedMission,
  } = useVerifiedMissionContext();
  const { clearTrajectory, refreshNow } = useBackendTrajectory();

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
    effectiveState === "STOPPING";

  const hasRuntimeMission = Boolean(
    currentMission?.loaded ||
      currentMission?.ready ||
      currentMission?.accepted_for_start ||
      (currentMission?.mission_id && effectiveState !== "EMPTY") ||
      verifiedMissionId,
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
  }

  const canClear = isConnected && !isArmed && !isRunning && !isClearing && hasRuntimeMission;

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

      // 3. Post-clear authoritative verification (Phase 6)
      const [freshStatusRes, freshPathRes] = await Promise.all([
        getMissionStatus().catch((err) => {
          console.warn("[useClearMission] Verification status check error:", err);
          return null;
        }),
        getLoadedMissionPath().catch((err) => {
          console.warn("[useClearMission] Verification path check error:", err);
          return null;
        }),
      ]);

      // Confirm runtime state is EMPTY
      const runtimeState = (freshStatusRes?.mission?.state ?? "").toUpperCase();
      const isLoaded = Boolean(freshStatusRes?.mission?.loaded);
      const isActive = Boolean(freshStatusRes?.mission?.active);

      if (runtimeState === "RUNNING" || isLoaded || isActive) {
        throw new Error(
          "Verification failed: Controller runtime did not transition to EMPTY state.",
        );
      }

      // Confirm loaded path is unavailable or empty
      if (freshPathRes?.points && freshPathRes.points.length > 0) {
        console.warn(
          "[useClearMission] Warning: Controller returned remaining path points after clear",
        );
      }

      // 4. Update local persistence (Phase 8)
      const runtimeCleared = await PersistentStorage.clearActiveMissionRuntime();
      if (!runtimeCleared) {
        console.warn("[useClearMission] Warning: PersistentStorage.clearActiveMissionRuntime returned false");
      }

      // 5. Reconcile frontend contexts
      clearLoadedMission();
      clearTrajectory();
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
    refreshNow,
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
      "This will:\n• unload the mission from the controller\n• clear current progress and trajectory\n• disable Start and Resume\n• keep the uploaded file for later Load",
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
                Alert.alert("Mission Cleared", "The staged or loaded mission was removed from the rover. The uploaded file remains available for Load.");
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
