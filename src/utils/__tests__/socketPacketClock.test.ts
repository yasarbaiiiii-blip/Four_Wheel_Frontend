import {
  LIVE_PANEL_PACKET_STALE_MS,
  SOCKET_WATCHDOG_SILENCE_MS,
  clearSocketTelemetryPacket,
  isSocketSilent,
  isSocketTelemetryStalled,
  markSocketTelemetryPacket,
  socketTelemetryPacketAgeMs,
} from "../socketPacketClock";

describe("socketPacketClock", () => {
  afterEach(() => clearSocketTelemetryPacket());

  test("no packet on this connection is stalled", () => {
    clearSocketTelemetryPacket();
    expect(socketTelemetryPacketAgeMs(1000)).toBeNull();
    expect(isSocketTelemetryStalled(1000)).toBe(true);
  });

  test("a silent socket stalls live panels within the window", () => {
    markSocketTelemetryPacket(10_000);
    expect(isSocketTelemetryStalled(10_000 + LIVE_PANEL_PACKET_STALE_MS)).toBe(false);
    expect(isSocketTelemetryStalled(10_000 + LIVE_PANEL_PACKET_STALE_MS + 1)).toBe(true);
    // Far tighter than TelemetryContext's 2.5 s + 1 s tick socket staleness.
    expect(LIVE_PANEL_PACKET_STALE_MS).toBeLessThan(1000);
  });

  test("disconnect clears the clock so reconnect cannot look live", () => {
    markSocketTelemetryPacket(10_000);
    clearSocketTelemetryPacket();
    expect(isSocketTelemetryStalled(10_001)).toBe(true);
  });
});

describe("isSocketSilent", () => {
  const limit = SOCKET_WATCHDOG_SILENCE_MS;

  test("not connected is never silent", () => {
    expect(
      isSocketSilent({
        lastPacketMs: null,
        lastHeartbeatMs: null,
        connectedAtMs: null,
        nowMs: 1_000_000,
      }),
    ).toBe(false);
  });

  test("no telemetry and no heartbeat is silent after the limit", () => {
    const base = { lastPacketMs: null, lastHeartbeatMs: null, connectedAtMs: 1000 };
    expect(isSocketSilent({ ...base, nowMs: 1000 + limit })).toBe(false);
    expect(isSocketSilent({ ...base, nowMs: 1000 + limit + 1 })).toBe(true);
  });

  test("heartbeat keeps a connected rover with no telemetry source alive", () => {
    expect(
      isSocketSilent({
        lastPacketMs: null,
        lastHeartbeatMs: 60_000,
        connectedAtMs: 1000,
        nowMs: 60_000 + limit,
      }),
    ).toBe(false);
  });

  test("heartbeat stopping is silent, so a dead link still reconnects", () => {
    expect(
      isSocketSilent({
        lastPacketMs: null,
        lastHeartbeatMs: 60_000,
        connectedAtMs: 1000,
        nowMs: 60_000 + limit + 1,
      }),
    ).toBe(true);
  });

  test("heartbeat does not hide telemetry that started and then stopped", () => {
    expect(
      isSocketSilent({
        lastPacketMs: 50_000,
        lastHeartbeatMs: 70_000,
        connectedAtMs: 1000,
        nowMs: 50_000 + limit + 1,
      }),
    ).toBe(true);
  });
});
