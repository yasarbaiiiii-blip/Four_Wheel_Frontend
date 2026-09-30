import React, { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";

import { useRover } from "../../context/RoverContext";
import { getWholeBatteryPercentage } from "../../utils/batteryDisplay";
import { Toast } from "../shared/Toast";

const CRITICAL_BATTERY_PERCENT = 10;

/**
 * Global critical-battery warning.
 *
 * The warning has no timer and cannot be swiped away. Once shown, it remains
 * visible until the operator explicitly presses the close button.
 */
export const BatteryCriticalNotice: React.FC = () => {
  const { telemetry, connectionState } = useRover();
  const previousCriticalRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const [triggerPercent, setTriggerPercent] = useState<number | null>(null);
  const [triggerVoltage, setTriggerVoltage] = useState<number | null>(null);

  const percentage = getWholeBatteryPercentage(
    telemetry.battery?.percentage,
  );
  const voltage = telemetry.battery?.voltage;

  const hasLiveBatterySample =
    connectionState === "connected" &&
    percentage !== null &&
    typeof voltage === "number" &&
    Number.isFinite(voltage) &&
    voltage > 0;

  const criticalNow =
    hasLiveBatterySample && percentage <= CRITICAL_BATTERY_PERCENT;

  useEffect(() => {
    const wasCritical = previousCriticalRef.current;

    if (criticalNow && !wasCritical) {
      setTriggerPercent(percentage);
      setTriggerVoltage(voltage);
      setVisible(true);
    }

    previousCriticalRef.current = criticalNow;
  }, [criticalNow, percentage, voltage]);

  const percentageText =
    triggerPercent !== null ? `${triggerPercent}%` : "10%";
  const voltageText =
    triggerVoltage !== null ? `${triggerVoltage.toFixed(2)} V` : "22.50 V";

  return (
    <Toast
      visible={visible}
      type="error"
      title="BATTERY LOW — OPERATION DISABLED"
      message={
        `Battery: ${percentageText} • ${voltageText}. ` +
        "Mission operation is disabled. Change the battery before continuing operation."
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
