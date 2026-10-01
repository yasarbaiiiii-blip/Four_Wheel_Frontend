/**
 * Always-visible emergency stop for the app header (every tab).
 *
 * STOP is one tap, never disabled and never behind a confirmation: in an
 * emergency the request must leave immediately. RELEASE only clears the
 * latch (the rover does not move until START), so it asks first. Both show
 * the rover's answer; nothing is reported as done unless the rover said so.
 * The E-stop state comes from mission_status (missionLifecycle.emergency_stop).
 */

import React, { useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTelemetryControl } from "../../context/TelemetryContext";
import {
  emergencyStop,
  releaseEmergencyStop,
} from "../../services/vehicleControlService";
import { colors } from "../../theme/colors";
import { estopControlsView } from "../../utils/estopControlsView";

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const HIT_SLOP = { top: 6, bottom: 6, left: 4, right: 4 };

type EstopControlsProps = {
  /** Header keeps redundant STOP access; the Manual bar swaps STOP for RELEASE. */
  variant?: "header" | "vertical";
};

export const EstopControls: React.FC<EstopControlsProps> = ({
  variant = "header",
}) => {
  const { missionLifecycle } = useTelemetryControl();
  const view = estopControlsView(missionLifecycle.emergency_stop);
  const [isStopping, setIsStopping] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);

  const handleStop = async () => {
    // No confirmation and no in-flight guard: a second tap sends another
    // assert, which is harmless and better than a swallowed press.
    setIsStopping(true);
    try {
      const response = await emergencyStop();
      if (!response?.success) {
        Alert.alert("E-STOP NOT CONFIRMED", response?.message || "The rover did not confirm the emergency stop.");
      }
    } catch (error) {
      Alert.alert("E-STOP FAILED", errorText(error, "Could not send the emergency stop."));
    } finally {
      setIsStopping(false);
    }
  };

  const doRelease = async () => {
    setIsReleasing(true);
    try {
      const response = await releaseEmergencyStop();
      if (response?.success) {
        Alert.alert(
          "E-stop released",
          response.message || "Emergency stop released; mission movement remains disabled.",
        );
      } else {
        Alert.alert("Release refused", response?.message || "The rover did not release the E-stop.");
      }
    } catch (error) {
      Alert.alert("Release refused", errorText(error, "Could not release the E-stop."));
    } finally {
      setIsReleasing(false);
    }
  };

  const handleRelease = () => {
    Alert.alert(
      "Release E-stop?",
      "Clears the E-stop latch. The rover will not move until you press START. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "RELEASE", style: "destructive", onPress: () => void doRelease() },
      ],
    );
  };

  const isVertical = variant === "vertical";
  const actionIsRelease = isVertical && view.showRelease;

  return (
    <View style={[styles.row, isVertical && styles.vertical]}>
      {view.showLatchedBadge && !isVertical && (
        <View style={styles.latchedBadge} accessibilityLabel="Emergency stop is on">
          <Text style={styles.latchedText}>E-STOP ON</Text>
        </View>
      )}

      {view.showRelease && !isVertical && (
        <TouchableOpacity
          onPress={handleRelease}
          disabled={isReleasing}
          style={[styles.releaseBtn, isReleasing && styles.busy]}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Release emergency stop"
        >
          <MaterialCommunityIcons name="lock-open-variant-outline" size={16} color="#1F1300" />
          <Text style={styles.releaseText}>{isReleasing ? "…" : "RELEASE"}</Text>
        </TouchableOpacity>
      )}

      {actionIsRelease ? (
        <TouchableOpacity
          onPress={handleRelease}
          disabled={isReleasing}
          style={[styles.releaseBtn, isVertical && styles.verticalButton, isReleasing && styles.busy]}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Release emergency stop"
        >
          <MaterialCommunityIcons name="lock-open-variant-outline" size={18} color="#1F1300" />
          <Text style={styles.releaseText}>{isReleasing ? "RELEASING" : "RELEASE"}</Text>
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
          <MaterialCommunityIcons name="octagon" size={isVertical ? 18 : 16} color="#FFFFFF" />
          <Text style={styles.stopText}>{isStopping ? "STOPPING" : "STOP"}</Text>
        </TouchableOpacity>
      )}
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
  latchedText: { color: colors.danger, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  releaseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.warning,
  },
  releaseText: { color: "#1F1300", fontSize: 12, fontWeight: "800" },
  stopBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.danger,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  stopText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900", letterSpacing: 0.5 },
  busy: { opacity: 0.6 },
  verticalButton: {
    width: "100%",
    minHeight: 72,
    justifyContent: "center",
    borderRadius: 12,
  },
});

export default EstopControls;
