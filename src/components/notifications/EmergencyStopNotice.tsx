import React from "react";
import { StyleSheet } from "react-native";

import { useTelemetryControl } from "../../context/TelemetryContext";
import { Toast } from "../shared/Toast";

/** Persistent, backend-confirmed E-stop warning. It clears only on RELEASE. */
export const EmergencyStopNotice: React.FC = () => {
  const { missionLifecycle } = useTelemetryControl();
  const active = missionLifecycle.emergency_stop === true;

  return (
    <Toast
      visible={active}
      type="error"
      title="EMERGENCY STOP ACTIVE"
      message="Rover motion is stopped. Use RELEASE in Mission Progress only when the area is safe."
      position="top"
      style={styles.toast}
      onDismiss={() => undefined}
      swipeToDismiss={false}
    />
  );
};

const styles = StyleSheet.create({
  toast: {
    top: 218,
    left: 180,
    right: 180,
    elevation: 10070,
    zIndex: 10070,
  },
});

export default EmergencyStopNotice;
