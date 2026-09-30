import React, { useEffect, useState } from "react";
import { StyleSheet } from "react-native";

import { useConnection } from "../../context/ConnectionContext";
import { useBackendMissionStatus } from "../../hooks/useBackendMissionStatus";
import { Toast } from "../shared/Toast";

/** Ignore short gaps, e.g. MAVROS still connecting right after a boot. */
const LINK_LOST_CONFIRM_MS = 5000;

/**
 * Global PX4/MAVROS link warning.
 *
 * Mission Manager reports px4_link_ok=false when MAVROS state is stale or
 * disconnected (2026-09-30: MAVROS aborted and every START was refused as
 * "spray controller not ready"). This names the real cause. Dismissing hides
 * it until the link recovers and is lost again.
 */
export const Px4LinkNotice: React.FC = () => {
  const { connectionState } = useConnection();
  const { mission } = useBackendMissionStatus(connectionState === "connected");
  const linkLost =
    connectionState === "connected" && mission.px4LinkOk === false;

  const [confirmed, setConfirmed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!linkLost) {
      setConfirmed(false);
      setDismissed(false);
      return undefined;
    }
    const timer = setTimeout(() => setConfirmed(true), LINK_LOST_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [linkLost]);

  return (
    <Toast
      visible={linkLost && confirmed && !dismissed}
      type="error"
      title="PX4 LINK LOST"
      message={
        mission.px4LinkReason ??
        "The rover has no live connection to the flight controller."
      }
      position="top"
      style={styles.toast}
      onDismiss={() => setDismissed(true)}
    />
  );
};

const styles = StyleSheet.create({
  toast: {
    top: 78,
    left: 180,
    right: 180,
    elevation: 10060,
    zIndex: 10060,
  },
});

export default Px4LinkNotice;
