/**
 * Always-visible emergency stop for rover control screens.
 *
 * Safety Invariants:
 * - STOP is one tap, never disabled, and never behind confirmation.
 * - When E-Stop latch is clear, one tap asserts E-Stop immediately.
 * - When fresh backend state confirms E-Stop latch is active:
 *     First tap prompts "Tap again to release".
 *     Second tap within 450 ms opens confirmation popup.
 *     Neither tap sends a release request.
 * - Confirmation popup offers: Keep Stopped, STOP NOW, and Confirm Release.
 *     Only Confirm Release sends POST /api/estop/release.
 *     STOP NOW reasserts E-Stop immediately.
 * - Unknown, stale, or disconnected state must never enable release.
 *     STOP remains immediately available at all times.
 * - "Released" is only displayed after fresh backend status confirms latch is
 *     clear and PX4 is disarmed.
 */

import React, { useContext, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ConnectionContext } from "../../context/ConnectionContext";
import { useTelemetryControl } from "../../context/TelemetryContext";
import { LiveTelemetryStoreContext } from "../../context/liveTelemetryStore";
import {
  emergencyStop,
  releaseEmergencyStop,
} from "../../services/vehicleControlService";
import { getMissionStatus } from "../../services/missionApi";
import { colors } from "../../theme/colors";
import { estopControlsView } from "../../utils/estopControlsView";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 };

type EstopControlsProps = {
  /** Header keeps redundant STOP access; vertical swaps STOP for RELEASE when latched. */
  variant?: "header" | "vertical" | "mission";
  /** The rover reports a latched stop. Mission variant only. */
  stopLatched?: boolean;
  /** The rover answered success, so the caller can fetch fresh status. */
  onStopRecorded?: () => void;
  /** Optional callback after a confirmed release. */
  onReleaseConfirmed?: () => void;
};

export const EstopControls: React.FC<EstopControlsProps> = ({
  variant = "header",
  stopLatched = false,
  onStopRecorded,
  onReleaseConfirmed,
}) => {
  const { missionLifecycle } = useTelemetryControl();
  const connectionContext = useContext(ConnectionContext);
  const isConnected = connectionContext
    ? connectionContext.connectionState === "connected"
    : true;
  const liveStore = useContext(LiveTelemetryStoreContext);
  const isStale = liveStore
    ? liveStore.getSnapshot().displayState === "stale" ||
      liveStore.getSnapshot().displayState === "offline"
    : false;

  const isAuthoritativeLatched =
    missionLifecycle.emergency_stop === true || stopLatched === true;

  const view = estopControlsView({
    emergencyStop: isAuthoritativeLatched,
    isConnected,
    isStale,
  });

  const [isStopping, setIsStopping] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const [firstTapActive, setFirstTapActive] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const firstTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReleasingRef = useRef(false);
  const releaseAbortedRef = useRef(false);

  const clearFirstTapTimer = () => {
    if (firstTapTimerRef.current) {
      clearTimeout(firstTapTimerRef.current);
      firstTapTimerRef.current = null;
    }
    setFirstTapActive(false);
  };

  // Timer cleanup on unmount, state change, disconnect, or background
  useEffect(() => {
    return () => {
      clearFirstTapTimer();
    };
  }, []);

  useEffect(() => {
    if (!view.canRelease) {
      clearFirstTapTimer();
      setShowConfirmModal(false);
    }
  }, [view.canRelease]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        clearFirstTapTimer();
        setShowConfirmModal(false);
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const handleStop = async () => {
    // STOP always wins: cancel pending gesture, release sequence, and dismiss modal
    releaseAbortedRef.current = true;
    clearFirstTapTimer();
    setShowConfirmModal(false);

    setIsStopping(true);
    try {
      const response = await emergencyStop();
      if (!response?.success) {
        Alert.alert(
          "E-STOP NOT CONFIRMED",
          response?.message || "The rover did not confirm the emergency stop.",
        );
      } else {
        Alert.alert(
          "E-STOP RECORDED",
          response.message || "Emergency stop recorded. Physical stop is not confirmed.",
        );
        onStopRecorded?.();
      }
    } catch (error) {
      Alert.alert(
        "E-STOP FAILED",
        errorText(error, "Could not send the emergency stop."),
      );
    } finally {
      setIsStopping(false);
    }
  };

  const handleReleasePress = () => {
    if (!view.canRelease) {
      // Release is ineligible; immediate STOP assertion
      void handleStop();
      return;
    }

    if (!firstTapActive) {
      // First tap prompts operator; start 450 ms expiration timer
      setFirstTapActive(true);
      firstTapTimerRef.current = setTimeout(() => {
        setFirstTapActive(false);
        firstTapTimerRef.current = null;
      }, 450);
      return;
    }

    // Second tap within 450 ms opens confirmation popup
    clearFirstTapTimer();
    setShowConfirmModal(true);
  };

  const handleKeepStopped = () => {
    clearFirstTapTimer();
    setShowConfirmModal(false);
  };

  const handleStopNow = () => {
    clearFirstTapTimer();
    setShowConfirmModal(false);
    void handleStop();
  };

  const doRelease = async () => {
    if (isReleasingRef.current) return;
    isReleasingRef.current = true;
    setIsReleasing(true);
    releaseAbortedRef.current = false;

    try {
      const response = await releaseEmergencyStop();
      if (releaseAbortedRef.current) {
        return;
      }

      if (!response?.success) {
        setShowConfirmModal(false);
        Alert.alert(
          "Release refused",
          response?.message || "The rover did not release the E-stop.",
        );
        return;
      }

      // Backend transaction accepted. Dismiss modal, but wait for fresh status
      setShowConfirmModal(false);

      let verified = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await new Promise((r) => setTimeout(r, 200));
          if (releaseAbortedRef.current) break;
          const status = await getMissionStatus();
          const mission = status?.mission;
          if (
            mission &&
            mission.emergency_stop === false &&
            mission.px4_armed !== true
          ) {
            verified = true;
            break;
          }
        } catch {
          // Poll retry
        }
      }

      if (releaseAbortedRef.current) {
        return;
      }

      if (verified) {
        Alert.alert(
          "E-stop released",
          response.message || "Emergency stop released. Rover is disarmed and motion remains disabled.",
        );
        onStopRecorded?.();
        onReleaseConfirmed?.();
      } else {
        Alert.alert(
          "Release status unknown",
          "Release request was accepted, but fresh status could not confirm unlatched and disarmed state. Recovery controls remain guarded.",
        );
      }
    } catch (error) {
      if (!releaseAbortedRef.current) {
        setShowConfirmModal(false);
        Alert.alert(
          "Release refused",
          errorText(error, "Could not release the E-stop."),
        );
      }
    } finally {
      isReleasingRef.current = false;
      setIsReleasing(false);
    }
  };

  const isVertical = variant === "vertical";
  const actionIsRelease = isVertical && view.showRelease;

  const releaseButtonLabel = isReleasing
    ? "RELEASING…"
    : firstTapActive
    ? "TAP AGAIN TO RELEASE"
    : "RELEASE";

  const releaseAccessibilityLabel = firstTapActive
    ? "Tap again to release E-Stop"
    : "Release emergency stop";

  return (
    <View style={[styles.row, isVertical && styles.vertical]}>
      {view.showLatchedBadge && variant === "header" && (
        <View style={styles.latchedBadge} accessibilityLabel="Emergency stop is on">
          <Text style={styles.latchedText}>E-STOP ON</Text>
        </View>
      )}

      {stopLatched && variant === "mission" && (
        <View style={styles.latchedBadge} accessibilityLabel="A stop is latched on the rover">
          <Text style={styles.latchedText}>STOP LATCHED</Text>
        </View>
      )}

      {view.showRelease && (variant === "header" || variant === "mission") && (
        <TouchableOpacity
          onPress={handleReleasePress}
          disabled={isReleasing}
          style={[
            styles.releaseBtn,
            firstTapActive && styles.releaseBtnPending,
            isReleasing && styles.busy,
          ]}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={releaseAccessibilityLabel}
        >
          <MaterialCommunityIcons
            name="lock-open-variant-outline"
            size={16}
            color="#1F1300"
          />
          <Text style={styles.releaseText}>{releaseButtonLabel}</Text>
        </TouchableOpacity>
      )}

      {actionIsRelease ? (
        <TouchableOpacity
          onPress={handleReleasePress}
          disabled={isReleasing}
          style={[
            styles.releaseBtn,
            styles.verticalButton,
            firstTapActive && styles.releaseBtnPending,
            isReleasing && styles.busy,
          ]}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={releaseAccessibilityLabel}
        >
          <MaterialCommunityIcons
            name="lock-open-variant-outline"
            size={18}
            color="#1F1300"
          />
          <Text style={styles.releaseText}>{releaseButtonLabel}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => void handleStop()}
          style={[styles.stopBtn, isVertical && styles.verticalButton]}
          hitSlop={HIT_SLOP}
          activeOpacity={0.6}
          accessibilityRole="button"
          accessibilityLabel="Emergency stop"
        >
          <MaterialCommunityIcons
            name="octagon"
            size={isVertical ? 18 : 16}
            color="#FFFFFF"
          />
          <Text style={styles.stopText}>{isStopping ? "STOPPING" : "STOP"}</Text>
        </TouchableOpacity>
      )}

      {/* Deliberate Confirmation Popup Modal */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={handleKeepStopped}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <MaterialCommunityIcons
                name="alert-octagon-outline"
                size={28}
                color={colors.warning}
              />
              <Text style={styles.modalTitle}>Release E-Stop?</Text>
            </View>

            <Text style={styles.modalMessage}>
              The rover must be disarmed. This will clear the stop latch, but will
              not arm or resume the mission.
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => void doRelease()}
                disabled={isReleasing}
                style={[styles.confirmReleaseBtn, isReleasing && styles.busy]}
                accessibilityRole="button"
                accessibilityLabel="Confirm Release"
              >
                {isReleasing ? (
                  <ActivityIndicator size="small" color="#1F1300" />
                ) : (
                  <MaterialCommunityIcons
                    name="lock-open-variant"
                    size={18}
                    color="#1F1300"
                  />
                )}
                <Text style={styles.confirmReleaseText}>
                  {isReleasing ? "RELEASING…" : "Confirm Release"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleStopNow}
                style={styles.stopNowBtn}
                accessibilityRole="button"
                accessibilityLabel="STOP NOW"
              >
                <MaterialCommunityIcons
                  name="octagon"
                  size={18}
                  color="#FFFFFF"
                />
                <Text style={styles.stopNowText}>STOP NOW</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleKeepStopped}
                disabled={isReleasing}
                style={styles.keepStoppedBtn}
                accessibilityRole="button"
                accessibilityLabel="Keep Stopped"
              >
                <Text style={styles.keepStoppedText}>Keep Stopped</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  vertical: { width: "100%" },
  latchedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: "rgba(239, 68, 68, 0.16)",
  },
  latchedText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  releaseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.warning,
  },
  releaseBtnPending: {
    backgroundColor: "#FBBF24",
    borderWidth: 1,
    borderColor: "#B45309",
  },
  releaseText: {
    color: "#1F1300",
    fontSize: 12,
    fontWeight: "800",
  },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.danger,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  stopText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  busy: { opacity: 0.6 },
  verticalButton: {
    width: "100%",
    minHeight: 72,
    justifyContent: "center",
    borderRadius: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(16, 36, 75, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#DDE8F7",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#10244B",
  },
  modalMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: "#334155",
    marginBottom: 20,
  },
  modalActions: {
    gap: 10,
  },
  confirmReleaseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.warning,
    paddingHorizontal: 16,
  },
  confirmReleaseText: {
    color: "#1F1300",
    fontSize: 15,
    fontWeight: "800",
  },
  stopNowBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: colors.danger,
    paddingHorizontal: 16,
  },
  stopNowText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  keepStoppedBtn: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 16,
  },
  keepStoppedText: {
    color: "#10244B",
    fontSize: 15,
    fontWeight: "700",
  },
});

export default EstopControls;
