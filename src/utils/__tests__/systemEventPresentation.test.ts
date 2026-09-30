import {
  SYSTEM_EVENT_DEDUP_MS,
  isDuplicateSystemEvent,
  parseSystemEvent,
  presentSystemEvent,
} from "../systemEventPresentation";

const raw = (overrides: Record<string, unknown> = {}) => ({
  schema: "system_event@1",
  event_kind: "SYSTEM",
  event: "OBSTACLE_PAUSED",
  message: "Obstacle ahead at 90 cm; rover stopped and waiting",
  mission_run_id: "run-1",
  state: "PAUSED",
  timestamp_unix_ns: 1790760000000000000,
  ...overrides,
});

describe("parseSystemEvent", () => {
  it("accepts a rover system_event@1 payload", () => {
    expect(parseSystemEvent(raw())).toEqual({
      event: "OBSTACLE_PAUSED",
      message: "Obstacle ahead at 90 cm; rover stopped and waiting",
      missionRunId: "run-1",
      timestampNs: 1790760000000000000,
    });
  });

  it("rejects anything that is not a system event", () => {
    expect(parseSystemEvent(null)).toBeNull();
    expect(parseSystemEvent("OBSTACLE_PAUSED")).toBeNull();
    expect(parseSystemEvent(raw({ event_kind: undefined }))).toBeNull();
    expect(parseSystemEvent(raw({ event: "  " }))).toBeNull();
  });

  it("normalises the event name and blank message", () => {
    const event = parseSystemEvent(raw({ event: "rtk_float", message: "" }));
    expect(event?.event).toBe("RTK_FLOAT");
    expect(event?.message).toBeNull();
  });
});

describe("presentSystemEvent", () => {
  it("keeps safety stops on screen as errors with the rover's message", () => {
    const toast = presentSystemEvent(parseSystemEvent(raw())!);
    expect(toast).toMatchObject({
      type: "error",
      sticky: true,
      title: "OBSTACLE AHEAD — MISSION PAUSED",
      message: "Obstacle ahead at 90 cm; rover stopped and waiting",
    });
  });

  it.each(["ESTOP_ACTIVE", "RTK_FLOAT", "RTK_PAUSED", "ODOM_PAUSED", "OBSTACLE_SENSOR_LOST"])(
    "%s is a sticky error",
    (name) => {
      const toast = presentSystemEvent(parseSystemEvent(raw({ event: name }))!);
      expect(toast?.type).toBe("error");
      expect(toast?.sticky).toBe(true);
    },
  );

  it.each(["RTK_RECOVERED", "OBSTACLE_CLEARED", "ESTOP_RELEASED", "MISSION_COMPLETED"])(
    "%s is a self-hiding success",
    (name) => {
      const toast = presentSystemEvent(parseSystemEvent(raw({ event: name }))!);
      expect(toast?.type).toBe("success");
      expect(toast?.sticky).toBe(false);
    },
  );

  it("uses a fallback message when the rover sends none", () => {
    const toast = presentSystemEvent(parseSystemEvent(raw({ event: "RTK_FLOAT", message: null }))!);
    expect(toast?.message).toBe("Waiting for RTK FIXED to continue.");
  });

  it("skips events that have their own notice", () => {
    for (const name of ["BATTERY_CRITICAL_PAUSE", "MISSION_RECOVERED"]) {
      expect(presentSystemEvent(parseSystemEvent(raw({ event: name }))!)).toBeNull();
    }
  });

  it("shows unknown future events as info with a readable title", () => {
    const toast = presentSystemEvent(
      parseSystemEvent(raw({ event: "NEW_THING_HAPPENED", message: "details" }))!,
    );
    expect(toast).toMatchObject({ type: "info", sticky: false, title: "New thing happened" });
  });
});

describe("isDuplicateSystemEvent", () => {
  const first = { event: "RTK_FLOAT", message: "m", atMs: 1000 };

  it("drops the same event and message inside the window", () => {
    expect(isDuplicateSystemEvent(first, { ...first, atMs: 1000 + SYSTEM_EVENT_DEDUP_MS - 1 })).toBe(true);
  });

  it("shows it again after the window, or when anything differs", () => {
    expect(isDuplicateSystemEvent(first, { ...first, atMs: 1000 + SYSTEM_EVENT_DEDUP_MS })).toBe(false);
    expect(isDuplicateSystemEvent(first, { ...first, message: "other" })).toBe(false);
    expect(isDuplicateSystemEvent(null, first)).toBe(false);
  });
});
