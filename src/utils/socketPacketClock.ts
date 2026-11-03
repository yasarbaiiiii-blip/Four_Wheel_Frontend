/**
 * Tablet-clock time of the last Socket.IO telemetry packet.
 *
 * TelemetryContext's `stale` flag uses the backend's generated_at (skew
 * dependent) with a 2.5 s window and a 1 s tick, so a silent socket that
 * never reports a disconnect could keep live panels LIVE for ~3.5 s. Live
 * panels poll this receive clock instead. One socket per app, so a module
 * singleton is sufficient.
 */

let lastPacketMs: number | null = null;

export function markSocketTelemetryPacket(nowMs: number = Date.now()): void {
  lastPacketMs = nowMs;
}

export function clearSocketTelemetryPacket(): void {
  lastPacketMs = null;
}

/** Milliseconds since the last telemetry packet, or null if none this connection. */
export function socketTelemetryPacketAgeMs(nowMs: number = Date.now()): number | null {
  return lastPacketMs === null ? null : Math.max(0, nowMs - lastPacketMs);
}

/** Live panels treat a silent stream as stale after this long. */
export const LIVE_PANEL_PACKET_STALE_MS = 750;

export function isSocketTelemetryStalled(
  nowMs: number = Date.now(),
  limitMs: number = LIVE_PANEL_PACKET_STALE_MS,
): boolean {
  const age = socketTelemetryPacketAgeMs(nowMs);
  return age === null || age > limitMs;
}

/** The socket watchdog reconnects after this long with no sign of life. */
export const SOCKET_WATCHDOG_SILENCE_MS = 8_000;

/**
 * Decides whether a "connected" socket has gone silent.
 *
 * Once telemetry has started, only telemetry counts, so a stream that stops
 * cannot leave old values on screen. Before the first packet the backend's
 * ping proves the link is up: a rover with no telemetry source yet is connected,
 * and reconnecting would not help.
 */
export function isSocketSilent(input: {
  lastPacketMs: number | null;
  lastHeartbeatMs: number | null;
  connectedAtMs: number | null;
  nowMs: number;
}): boolean {
  const { lastPacketMs, lastHeartbeatMs, connectedAtMs, nowMs } = input;
  if (lastPacketMs !== null) {
    return nowMs - lastPacketMs > SOCKET_WATCHDOG_SILENCE_MS;
  }
  if (connectedAtMs === null) {
    return false;
  }
  const lastAlive = Math.max(connectedAtMs, lastHeartbeatMs ?? connectedAtMs);
  return nowMs - lastAlive > SOCKET_WATCHDOG_SILENCE_MS;
}
