import React, { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";

import { useRover } from "../../context/RoverContext";
import { getWholeBatteryPercentage } from "../../utils/batteryDisplay";
import { Toast } from "../shared/Toast";

// Used only when the rover backend does not report `mission_lockout`
// (older backend). The backend flag is the authority when present.
const FALLBACK_CRITICAL_BATTERY_PERCENT = 10;

/**
 * Global critical-battery warning.
 *
 * Driven by the rover's `battery_mission_lockout` flag so the app always
 * agrees with the backend that refuses START / RESUME / NEXT / SKIP. Also
 * reports the rover's automatic mission PAUSE, and re-opens if that PAUSE
 * fails so the operator knows the mission did not enter the safe paused state.
 *
 * The warning has no timer and cannot be swiped away. Once shown, it remains
 * visible until the operator explicitly presses the close button.
 */
export const BatteryCriticalNotice: React.FC = () => {
  const { telemetry, connectionState } = useRover();
  const previousCriticalRef = useRef(false);
  const previousPauseErrorRef = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [triggerPercent, setTriggerPercent] = useState<number | null>(null);
  const [triggerVoltage, setTriggerVoltage] = useState<number | null>(null);

  const connected = connectionState === "connected";
  const percentage = getWholeBatteryPercentage(
    telemetry.battery?.percentage,
  );
  const rawVoltage = telemetry.battery?.voltage;
  const voltage =
    typeof rawVoltage === "number" &&
    Number.isFinite(rawVoltage) &&
    rawVoltage > 0
      ? rawVoltage
      : null;
  const backendLockout = telemetry.battery?.mission_lockout;
  const pauseInProgress =
    connected && telemetry.battery?.critical_stop_in_progress === true;
  const pauseError = connected
    ? telemetry.battery?.critical_stop_error ?? null
    : null;

  const criticalNow =
    connected &&
    (typeof backendLockout === "boolean"
      ? backendLockout
      : percentage !== null &&
        voltage !== null &&
        percentage <= FALLBACK_CRITICAL_BATTERY_PERCENT);

  useEffect(() => {
    const wasCritical = previousCriticalRef.current;

    if (criticalNow && !wasCritical) {
      setTriggerPercent(percentage);
      setTriggerVoltage(voltage);
      setVisible(true);
    }

    previousCriticalRef.current = criticalNow;
  }, [criticalNow, percentage, voltage]);

  // A failed automatic PAUSE must reach the operator even if the warning was
  // already closed: re-open on every new error.
  useEffect(() => {
    if (pauseError && pauseError !== previousPauseErrorRef.current) {
      setTriggerPercent((current) => current ?? percentage);
      setTriggerVoltage((current) => current ?? voltage);
      setVisible(true);
    }
    previousPauseErrorRef.current = pauseError;
  }, [pauseError, percentage, voltage]);

  const shownPercent = triggerPercent ?? percentage;
  const shownVoltage = triggerVoltage ?? voltage;
  const percentageText =
    shownPercent !== null ? `${shownPercent}%` : "unknown %";
  const voltageText =
    shownVoltage !== null
      ? `${shownVoltage.toFixed(2)} V`
      : "voltage unavailable";

  let pauseText = "";
  if (pauseError) {
    pauseText =
      ` Automatic mission PAUSE FAILED: ${pauseError}. ` +
      "Keep the rover stopped and resolve the backend error before continuing.";
  } else if (pauseInProgress) {
    pauseText = " Pausing the running mission automatically…";
  }

  return (
    <Toast
      visible={visible}
      type="error"
      title={
        pauseError
          ? "BATTERY CRITICAL — AUTO PAUSE FAILED"
          : "BATTERY CRITICAL — OPERATION DISABLED"
      }
      message={
        `Battery: ${percentageText} • ${voltageText}. ` +
        "Mission operation is disabled. Change the battery before continuing operation." +
        pauseText
      }
      position="top"
      style={styles.criticalWarning}
      showCloseButton
      swipeToDismiss={false}
      onDismiss={() => setVisible(false)}
    />
  );
};

const styles = StyleSheet.create({
  criticalWarning: {
    top: 146,
    left: 180,
    right: 180,
    backgroundColor: "#991B1B",
    borderColor: "#EF4444",
    elevation: 10060,
    zIndex: 10060,
  },
});

export default BatteryCriticalNotice;
