import React, { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";

import { useConnection } from "../../context/ConnectionContext";
import {
  SYSTEM_EVENT_AUTO_HIDE_MS,
  isDuplicateSystemEvent,
  parseSystemEvent,
  presentSystemEvent,
  type SystemEventToast,
} from "../../utils/systemEventPresentation";
import { Toast } from "../shared/Toast";

/**
 * Global toast for rover `system_event` notifications (obstacle pause,
 * RTK float, E-stop, ...). The newest event replaces the one on screen.
 * Safety stops stay until closed; the rest hide after a few seconds.
 */
export const SystemEventNotice: React.FC = () => {
  const { socket, connectionState } = useConnection();
  const [toast, setToast] = useState<SystemEventToast | null>(null);
  const lastEventRef = useRef<{ event: string; message: string; atMs: number } | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!socket || connectionState !== "connected") return undefined;

    const handleSystemEvent = (raw: unknown) => {
      const event = parseSystemEvent(raw);
      if (!event) return;
      const next = presentSystemEvent(event);
      if (!next) return;
      const seen = { event: event.event, message: next.message, atMs: Date.now() };
      if (isDuplicateSystemEvent(lastEventRef.current, seen)) return;
      lastEventRef.current = seen;
      setToast(next);
    };

    socket.on("system_event", handleSystemEvent);
    return () => {
      socket.off("system_event", handleSystemEvent);
    };
  }, [socket, connectionState]);

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (toast && !toast.sticky) {
      const key = toast.key;
      hideTimerRef.current = setTimeout(() => {
        setToast((current) => (current?.key === key ? null : current));
      }, SYSTEM_EVENT_AUTO_HIDE_MS);
    }
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [toast]);

  return (
    <Toast
      visible={toast !== null}
      type={toast?.type ?? "info"}
      title={toast?.title}
      message={toast?.message}
      position="bottom"
      style={styles.systemEvent}
      showCloseButton
      onDismiss={() => setToast(null)}
    />
  );
};

const styles = StyleSheet.create({
  // Below BatteryCriticalNotice (top: 146) so both can show at once.
  systemEvent: {
    top: 236,
    left: 180,
    right: 180,
    elevation: 10050,
    zIndex: 10050,
  },
});

export default SystemEventNotice;
