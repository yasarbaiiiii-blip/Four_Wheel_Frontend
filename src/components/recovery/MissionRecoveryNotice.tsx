import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import useBackendMissionStatus from "../../hooks/useBackendMissionStatus";
import {
  clearMission,
  resumeMission,
  stopMission,
} from "../../services/missionApi";
import { releaseEmergencyStop } from "../../services/vehicleControlService";
import { useConnection } from "../../context/ConnectionContext";
import { useMission } from "../../context/MissionContext";
import { useTelemetryControl } from "../../context/TelemetryContext";
import {
  shallowEqual,
  useLiveTelemetrySelector,
} from "../../context/liveTelemetryStore";
import {
  canDiscardRecoveredMission,
  canResumeRecoveredMission,
  shouldShowRecovery,
} from "../../utils/missionRecoveryUi";

interface MissionRecoveryNoticeProps {
  onUploadNewMission: () => void;
}

type RecoveryAction = "resume" | "discard" | null;

function formatSavedAt(value: string | null): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function stageTitle(stage: string): string {
  switch (stage) {
    case "READY":
      return "Mission Recovery Ready";
    case "ERROR":
      return "Mission Recovery Failed";
    case "PX4_SAFE":
      return "Recovery Waiting for PX4 Safety";
    case "PREPARING":
      return "Rebuilding Mission Trajectory";
    case "RESTORING":
      return "Restoring Mission Progress";
    case "CHECKING":
    case "DETECTED":
      return "Checking Previous Mission";
    default:
      return "Mission Recovery";
  }
}

/**
 * Global power-cycle recovery UI.
 *
 * Backend is the only authority for recovery eligibility/state. This component
 * only projects backend fields and sends existing RESUME / STOP / CLEAR calls.
 */
export const MissionRecoveryNotice: React.FC<MissionRecoveryNoticeProps> = ({
  onUploadNewMission,
}) => {
  const { connectionState } = useConnection();
  const { clearMissionWaypoints } = useMission();
  const { mission, refresh } = useBackendMissionStatus(
    connectionState === "connected",
  );
  const battery = useLiveTelemetrySelector(
    (snapshot) => ({
      lockout: snapshot.telemetry.battery?.mission_lockout === true,
      percentage: snapshot.telemetry.battery?.percentage ?? null,
      voltage: snapshot.telemetry.battery?.voltage ?? null,
    }),
    shallowEqual,
  );
  const { missionLifecycle } = useTelemetryControl();
  const emergencyStopActive = missionLifecycle.emergency_stop === true;

  const [action, setAction] = useState<RecoveryAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const stage = mission.recoveryState.trim().toUpperCase();
  const visible =
    connectionState === "connected" &&
    shouldShowRecovery(
      mission.recoveryRequired,
      stage,
    );

  const canResume =
    action === null &&
    canResumeRecoveredMission({
      recoveryRequired: mission.recoveryRequired,
      recoveryAvailable: mission.recoveryAvailable,
      recoveryState: stage,
      missionState: mission.state,
      resumeAvailable: mission.resumeAvailable,
      batteryLockout: battery.lockout,
      emergencyStopActive,
    });

  const canDiscard =
    action === null &&
    canDiscardRecoveredMission(
      mission.recoveryRequired,
      stage,
    );

  const currentPoint =
    mission.recoveryCurrentPointId ??
    (
      mission.recoveryCurrentPointNumber !== null
        ? `P${mission.recoveryCurrentPointNumber}`
        : null
    );

  const progressText = useMemo(() => {
    const total = mission.totalPoints;
    if (total <= 0) return null;
    return (
      `${mission.completedPoints} completed` +
      (mission.skippedPoints ? ` • ${mission.skippedPoints} skipped` : "") +
      (mission.failedPoints ? ` • ${mission.failedPoints} failed` : "") +
      ` • ${mission.remainingPoints} remaining`
    );
  }, [
    mission.completedPoints,
    mission.failedPoints,
    mission.remainingPoints,
    mission.skippedPoints,
    mission.totalPoints,
  ]);

  const handleResume = async (): Promise<void> => {
    if (!canResume) return;
    setAction("resume");
    setActionError(null);

    try {
      // Same smart release as Start: the backend boots with E-stop latched,
      // and the latch is not always visible as emergency_stop=true, so
      // always RELEASE before RESUME. A refusal only aborts when the rover
      // says the E-stop is on; otherwise RESUME reports the real blocker.
      try {
        const release = await releaseEmergencyStop();
        if (!release?.success && emergencyStopActive) {
          throw new Error(
            release?.message || "The rover did not release the E-stop.",
          );
        }
      } catch (releaseError) {
        if (emergencyStopActive) throw releaseError;
        console.log(
          "[MissionRecoveryNotice] Pre-resume E-stop release skipped/failed:",
          releaseError,
        );
      }

      const response = await resumeMission();
      if (!response.success) {
        throw new Error(
          response.mission?.message ||
            "The backend rejected the resume request.",
        );
      }
      await refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to resume the recovered mission.",
      );
    } finally {
      setAction(null);
    }
  };

  const handleDiscard = async (): Promise<void> => {
    if (!canDiscard) return;
    setAction("discard");
    setActionError(null);

    try {
      const state = mission.state.trim().toUpperCase();
      if (
        state === "RUNNING" ||
        state === "PAUSED" ||
        state === "WAITING_FOR_NEXT"
      ) {
        await stopMission();
      }

      await clearMission();
      clearMissionWaypoints();
      await refresh();
      onUploadNewMission();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Unable to stop and clear the recovered mission.",
      );
    } finally {
      setAction(null);
    }
  };

  if (!visible) return null;

  const busy = action !== null;
  const recovering =
    stage !== "READY" &&
    stage !== "ERROR";

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Recovery is intentionally operator-blocking.
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons
              name={stage === "ERROR" ? "alert-circle" : "backup-restore"}
              size={32}
              color={stage === "ERROR" ? "#F87171" : "#60A5FA"}
            />
          </View>

          <Text style={styles.title}>
            {stageTitle(stage)}
          </Text>

          <Text style={styles.message}>
            {mission.message ??
              "The rover found an unfinished mission from the previous run."}
          </Text>

          <View style={styles.details}>
            <View style={styles.row}>
              <Text style={styles.label}>Mission</Text>
              <Text style={styles.value}>
                {mission.missionId
                  ? mission.missionId.slice(0, 12)
                  : "Unknown"}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Previous state</Text>
              <Text style={styles.value}>
                {mission.recoveryPreviousState ?? "Unknown"}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Resume point</Text>
              <Text style={styles.value}>
                {currentPoint ?? "Preparing…"}
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Saved</Text>
              <Text style={styles.value}>
                {formatSavedAt(mission.recoverySavedAt)}
              </Text>
            </View>

            {progressText ? (
              <Text style={styles.progress}>
                {progressText}
              </Text>
            ) : null}
          </View>

          {stage === "PX4_SAFE" && mission.px4Armed ? (
            <View style={styles.warning}>
              <Text style={styles.warningText}>
                PX4 is armed. Disarm the rover before recovery can continue.
              </Text>
            </View>
          ) : null}

          {battery.lockout ? (
            <View style={styles.warning}>
              <Text style={styles.warningText}>
                Battery critical lockout is active. Change the battery before
                Resume Mission.
              </Text>
            </View>
          ) : null}

          {mission.recoveryError ? (
            <Text style={styles.errorText}>
              {mission.recoveryError}
            </Text>
          ) : null}

          {actionError ? (
            <Text style={styles.errorText}>
              {actionError}
            </Text>
          ) : null}

          {recovering ? (
            <View style={styles.progressRow}>
              <ActivityIndicator
                size="small"
                color="#60A5FA"
              />
              <Text style={styles.progressLabel}>
                Recovery is controlled by the rover backend…
              </Text>
            </View>
          ) : null}

          {stage === "READY" ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.resumeButton,
                  !canResume && styles.disabledButton,
                ]}
                disabled={!canResume}
                onPress={() => {
                  void handleResume();
                }}
                activeOpacity={0.8}
              >
                {action === "resume" ? (
                  <ActivityIndicator
                    size="small"
                    color="#FFFFFF"
                  />
                ) : (
                  <MaterialCommunityIcons
                    name="play"
                    size={20}
                    color="#FFFFFF"
                  />
                )}
                <Text style={styles.buttonText}>
                  {emergencyStopActive
                    ? "Release E-stop & Resume"
                    : "Resume Mission"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.stopButton,
                  !canDiscard && styles.disabledButton,
                ]}
                disabled={!canDiscard}
                onPress={() => {
                  void handleDiscard();
                }}
                activeOpacity={0.8}
              >
                {action === "discard" ? (
                  <ActivityIndicator
                    size="small"
                    color="#FFFFFF"
                  />
                ) : (
                  <MaterialCommunityIcons
                    name="stop-circle-outline"
                    size={20}
                    color="#FFFFFF"
                  />
                )}
                <Text style={styles.buttonText}>
                  Stop & Upload New Mission
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {stage === "ERROR" ? (
            <TouchableOpacity
              style={[
                styles.button,
                styles.stopButton,
                !canDiscard && styles.disabledButton,
              ]}
              disabled={!canDiscard}
              onPress={() => {
                void handleDiscard();
              }}
              activeOpacity={0.8}
            >
              {action === "discard" ? (
                <ActivityIndicator
                  size="small"
                  color="#FFFFFF"
                />
              ) : (
                <MaterialCommunityIcons
                  name="delete-alert-outline"
                  size={20}
                  color="#FFFFFF"
                />
              )}
              <Text style={styles.buttonText}>
                Stop & Upload New Mission
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.82)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 620,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#0F172A",
    padding: 24,
    elevation: 10080,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#172554",
    marginBottom: 12,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  message: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
  },
  details: {
    marginTop: 18,
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#111C2D",
    gap: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  label: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
  },
  value: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  progress: {
    color: "#93C5FD",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
    textAlign: "center",
  },
  warning: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F59E0B",
    backgroundColor: "#422006",
    padding: 10,
  },
  warningText: {
    color: "#FDE68A",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  errorText: {
    marginTop: 12,
    color: "#FCA5A5",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  progressRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  progressLabel: {
    color: "#93C5FD",
    fontSize: 12,
    fontWeight: "700",
  },
  actions: {
    marginTop: 20,
    flexDirection: "row",
    gap: 12,
  },
  button: {
    minHeight: 52,
    borderRadius: 12,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  resumeButton: {
    backgroundColor: "#15803D",
  },
  stopButton: {
    backgroundColor: "#B91C1C",
  },
  disabledButton: {
    opacity: 0.38,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
});

export default MissionRecoveryNotice;
