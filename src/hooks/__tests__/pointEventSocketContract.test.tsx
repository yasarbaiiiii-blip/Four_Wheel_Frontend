/**
 * Socket.IO payload contract for backend point_event@1:
 *   event_id STRING, event_kind COMPLETED|FAILED|SKIPPED, timestamp_unix_ms,
 *   0-based point_index, mission_run_id.
 */
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import type { Socket } from "socket.io-client";

let mockLifecycle: { mission_run_id?: string } | null = null;

jest.mock("../../context/TelemetryContext", () => ({
  useTelemetry: () => ({
    roverPosition: { lat: 12, lng: 77, timestamp: 1 },
    missionLifecycle: mockLifecycle,
  }),
}));
jest.mock("../../config/featureFlags", () => ({ POINT_MISSION_ENABLED: true }));
jest.mock("../../services/missionLifecycleService", () => ({
  getPointEvents: jest.fn(),
  getPointStatus: jest.fn(),
}));

import {
  normalizeBackendPointEvent,
  PointEventDeduper,
} from "../../adapters/backendPointEvent";
import {
  usePointMissionEvents,
  type UsePointMissionEventsResult,
} from "../usePointMissionEvents";

const RUN = "run-7";
const T_MS = 1_790_000_000_123;
const T_ISO = new Date(T_MS).toISOString();

function payload(over: Record<string, unknown> = {}) {
  return {
    event_id: "evt-0001",
    event_kind: "COMPLETED",
    timestamp_unix_ms: T_MS,
    point_index: 0,
    mission_run_id: RUN,
    ...over,
  };
}

function createSocket() {
  const listeners = new Map<string, Set<(p: unknown) => void>>();
  return {
    on: jest.fn((name: string, l: (p: unknown) => void) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(l);
    }),
    off: jest.fn((name: string, l: (p: unknown) => void) => {
      listeners.get(name)?.delete(l);
    }),
    emit(name: string, p: unknown) {
      act(() => listeners.get(name)?.forEach((l) => l(p)));
    },
  };
}

function renderHook(socket: ReturnType<typeof createSocket>) {
  const result = { current: undefined as unknown as UsePointMissionEventsResult };
  function Probe() {
    result.current = usePointMissionEvents(socket as unknown as Socket, "connected");
    return null;
  }
  let renderer!: ReturnType<typeof TestRenderer.create>;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });
  return { result, unmount: () => act(() => renderer.unmount()) };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mockLifecycle = { mission_run_id: RUN };
});

describe("normalizeBackendPointEvent (pure contract)", () => {
  const opts = { expectedRun: RUN, nextLocalOrder: () => 1 };

  it.each([
    ["COMPLETED", "point_completed"],
    ["FAILED", "point_failed"],
    ["SKIPPED", "point_skipped"],
  ])("maps event_kind %s to %s", (kind, type) => {
    const ev = normalizeBackendPointEvent("point_event", payload({ event_kind: kind }), opts);
    expect(ev?.event_type).toBe(type);
  });

  it("event_kind wins over the socket event name", () => {
    const ev = normalizeBackendPointEvent("point_completed", payload({ event_kind: "FAILED" }), opts);
    expect(ev?.event_type).toBe("point_failed");
  });

  it("keeps the original string event_id, 0-based index and run identity", () => {
    const ev = normalizeBackendPointEvent("point_event", payload({ event_id: "01HZX-abc", point_index: 0 }), opts)!;
    expect(ev.event_key).toBe("01HZX-abc");
    expect(ev.point_index).toBe(0);
    expect(ev.mission_run_id).toBe(RUN);
  });

  it("converts timestamp_unix_ms to ISO", () => {
    const ev = normalizeBackendPointEvent("point_event", payload(), opts)!;
    expect(ev.timestamp).toBe(T_ISO);
  });

  it("does not treat a generic point_event without a kind as ARRIVED", () => {
    const { event_kind, ...bare } = payload();
    expect(normalizeBackendPointEvent("point_event", bare, opts)).toBeNull();
  });

  it("drops unknown event_kind instead of guessing", () => {
    expect(normalizeBackendPointEvent("point_event", payload({ event_kind: "WARP" }), opts)).toBeNull();
  });

  it("drops other-run, run-less and negative-index payloads", () => {
    expect(normalizeBackendPointEvent("point_event", payload({ mission_run_id: "old" }), opts)).toBeNull();
    const { mission_run_id, ...noRun } = payload();
    expect(normalizeBackendPointEvent("point_event", noRun, opts)).toBeNull();
    expect(normalizeBackendPointEvent("point_event", payload({ point_index: -1 }), opts)).toBeNull();
  });

  it("deduper admits a string event_id once per run", () => {
    const d = new PointEventDeduper();
    const a = normalizeBackendPointEvent("point_event", payload(), opts)!;
    const b = normalizeBackendPointEvent("point_completed", payload(), opts)!;
    expect(d.firstSighting(a)).toBe(true);
    expect(d.firstSighting(b)).toBe(false);
    const c = normalizeBackendPointEvent("point_event", payload({ event_id: "evt-0002" }), opts)!;
    expect(d.firstSighting(c)).toBe(true);
  });
});

describe("usePointMissionEvents over Socket.IO", () => {
  it("applies generic + specific events with the same string event_id once", () => {
    const socket = createSocket();
    const hook = renderHook(socket);

    socket.emit("point_event", payload({ point_index: 0 }));
    const afterFirst = hook.result.current.statusMap;
    socket.emit("point_completed", payload({ point_index: 0 }));

    expect(hook.result.current.statusMap).toBe(afterFirst); // no second apply
    expect(hook.result.current.statusMap[0]).toMatchObject({
      status: "completed",
      eventType: "point_completed",
      timestamp: T_ISO,
    });
    expect(hook.result.current.currentPointIndex).toBe(0);
    hook.unmount();
  });

  it("records FAILED and SKIPPED per their own point_index", () => {
    const socket = createSocket();
    const hook = renderHook(socket);

    socket.emit("point_event", payload({ event_id: "a", event_kind: "FAILED", point_index: 0 }));
    socket.emit("point_event", payload({ event_id: "b", event_kind: "SKIPPED", point_index: 1 }));

    expect(hook.result.current.statusMap[0].status).toBe("failed");
    expect(hook.result.current.statusMap[1].status).toBe("skipped");
    hook.unmount();
  });

  it("ignores a generic point_event with no kind: nothing is fabricated", () => {
    const socket = createSocket();
    const hook = renderHook(socket);
    const { event_kind, ...bare } = payload();

    socket.emit("point_event", bare);

    expect(hook.result.current.statusMap).toEqual({});
    expect(hook.result.current.currentPointIndex).toBeNull();
    hook.unmount();
  });

  it("ignores events from a different run", () => {
    const socket = createSocket();
    const hook = renderHook(socket);

    socket.emit("point_event", payload({ mission_run_id: "run-OLD" }));

    expect(hook.result.current.statusMap).toEqual({});
    hook.unmount();
  });

  it("a mission_completed alone never creates a point result", () => {
    const socket = createSocket();
    const hook = renderHook(socket);

    socket.emit("mission_completed", { mission_run_id: RUN, state: "COMPLETED", total_points: 3 });

    expect(hook.result.current.statusMap).toEqual({});
    expect(hook.result.current.missionTerminal).toBeNull();
    hook.unmount();
  });
});
