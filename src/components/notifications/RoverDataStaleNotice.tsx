import React, { useEffect, useState } from "react";
import { StyleSheet } from "react-native";

import { useConnection } from "../../context/ConnectionContext";
import {
  shallowEqual,
  useLiveTelemetrySelector,
} from "../../context/liveTelemetryStore";
import { Toast } from "../shared/Toast";

const STALE_CONFIRM_MS = 3_000;

/**
 * A connected socket is not proof that rover values are fresh. Confirm a
 * stale stream before warning, then reset automatically on the next packet.
 */
export const RoverDataStaleNotice: React.FC = () => {
  const { connectionState } = useConnection();
  const live = useLiveTelemetrySelector(
    (snapshot) => ({
      stale: snapshot.telemetry.stale === true,
      ageMs: snapshot.telemetry.ageMs ?? null,
    }),
    shallowEqual,
  );
  const stale = connectionState === "connected" && live.stale;
  const [confirmed, setConfirmed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!stale) {
      setConfirmed(false);
      setDismissed(false);
      return undefined;
    }
    const timer = setTimeout(() => setConfirmed(true), STALE_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [stale]);

  const seconds = live.ageMs == null ? null : Math.ceil(live.ageMs / 1000);
  return (
    <Toast
      visible={stale && confirmed && !dismissed}
      type="error"
      title="ROVER DATA STALE"
      message={
        seconds == null
          ? "No fresh rover telemetry is arriving. Check rover Wi-Fi and backend connection."
          : `No fresh rover telemetry for ${seconds}s. Check rover Wi-Fi and backend connection.`
      }
      position="top"
      style={styles.toast}
      onDismiss={() => setDismissed(true)}
      showCloseButton
    />
  );
};

const styles = StyleSheet.create({
  toast: {
    top: 148,
    left: 180,
    right: 180,
    elevation: 10055,
    zIndex: 10055,
  },
});

export default RoverDataStaleNotice;
