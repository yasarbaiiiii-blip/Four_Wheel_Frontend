import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Alert } from "react-native";
import { useClearMission } from "../useClearMission";
import * as missionApi from "../../services/missionApi";
import PersistentStorage from "../../services/PersistentStorage";
import { ApiError } from "../../services/apiError";

jest.mock("react-native", () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

let mockVerifiedMissionId: string | null = "run_test_123";
const mockClearLoadedMission = jest.fn();
jest.mock("../../context/VerifiedMissionContext", () => ({
  useVerifiedMissionContext: () => ({
    missionId: mockVerifiedMissionId,
    missionName: "field-a.csv",
    clearLoadedMission: mockClearLoadedMission,
  }),
}));

const mockClearTrajectory = jest.fn();
const mockRefreshNow = jest.fn().mockResolvedValue(undefined);
jest.mock("../../context/BackendTrajectoryContext", () => ({
  useBackendTrajectory: () => ({
    clearTrajectory: mockClearTrajectory,
    refreshNow: mockRefreshNow,
  }),
}));

const mockClearMissionWaypoints = jest.fn().mockResolvedValue(undefined);
jest.mock("../../context/MissionContext", () => ({
  useMission: () => ({ clearMissionWaypoints: mockClearMissionWaypoints }),
}));

let mockConnectionState = "connected";
jest.mock("../../context/ConnectionContext", () => ({
  useConnection: () => ({
    connectionState: mockConnectionState,
  }),
}));

jest.mock("../../services/PersistentStorage", () => ({
  clearActiveMissionRuntime: jest.fn().mockResolvedValue(true),
}));

function renderHookHelper<T>(renderCallback: () => T) {
  const ref = { current: null as unknown as T };
  function Wrapper() {
    ref.current = renderCallback();
    return null;
  }
  let renderer: any;
  act(() => {
    renderer = TestRenderer.create(React.createElement(Wrapper));
  });

  const rerender = (next: () => T) => {
    function NextWrapper() {
      ref.current = next();
      return null;
    }
    act(() => {
      renderer.update(React.createElement(NextWrapper));
    });
  };

  return { result: ref, rerender };
}

describe("useClearMission Hook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnectionState = "connected";
    mockVerifiedMissionId = "run_test_123";
    jest.spyOn(missionApi, "clearMission").mockResolvedValue({
      success: true,
      operation: "clear",
      cleared: true,
      cleared_mission_id: "run_test_123",
      clear_generation: 18,
      mission: {
        state: "EMPTY",
        mission_id: null,
        loaded: false,
        active: false,
        ready: false,
        accepted_for_start: false,
      },
      file: {
        retained: false,
        reloadable: false,
        file_id: "file_test_123",
        filename: "field-a.csv",
      },
      trajectory: {
        available: false,
        mission_id: null,
      },
    });

    jest.spyOn(missionApi, "getMissionStatus").mockResolvedValue({
      success: true,
      mission: {
        state: "EMPTY",
        mission_id: null,
        loaded: false,
        active: false,
        ready: false,
      },
    } as any);

    jest.spyOn(missionApi, "getLoadedMissionPath").mockResolvedValue({
      success: true,
      points: [],
      frame_id: "map",
      navigation_point_count: 0,
      preview_truncated: false,
    });
  });

  it("permits clear when connected, disarmed and mission is loaded", () => {
    const { result } = renderHookHelper(() =>
      useClearMission({
        currentMission: {
          state: "READY",
          loaded: true,
          px4_armed: false,
        },
        filename: "field-a.csv",
      }),
    );

    expect(result.current.canClear).toBe(true);
    expect(result.current.refusalReason).toBeNull();
  });

  it("blocks clear and returns refusal reason when PX4 is armed", () => {
    const { result } = renderHookHelper(() =>
      useClearMission({
        currentMission: {
          state: "READY",
          loaded: true,
          px4_armed: true,
        },
      }),
    );

    expect(result.current.canClear).toBe(false);
    expect(result.current.refusalReason).toMatch(/PX4 is armed/);
  });

  it("blocks clear and returns refusal reason when mission is running", () => {
    const { result } = renderHookHelper(() =>
      useClearMission({
        currentMission: {
          state: "RUNNING",
          loaded: true,
          px4_armed: false,
        },
      }),
    );

    expect(result.current.canClear).toBe(false);
    expect(result.current.refusalReason).toMatch(/Stop the running mission/);
  });

  it("blocks clear when disconnected", () => {
    mockConnectionState = "disconnected";
    const { result } = renderHookHelper(() =>
      useClearMission({
        currentMission: {
          state: "READY",
          loaded: true,
          px4_armed: false,
        },
      }),
    );

    expect(result.current.canClear).toBe(false);
    expect(result.current.refusalReason).toMatch(/disconnected/);
  });

  it("presents confirmation dialog with exact text and handles Cancel", () => {
    const { result } = renderHookHelper(() =>
      useClearMission({
        currentMission: {
          state: "READY",
          loaded: true,
          px4_armed: false,
        },
        filename: "field-a.csv",
      }),
    );

    act(() => {
      result.current.confirmAndClear();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Clear “field-a.csv” mission?',
      expect.stringContaining("unload the mission from the controller"),
      expect.arrayContaining([
        expect.objectContaining({ text: "Cancel", style: "cancel" }),
        expect.objectContaining({ text: "Clear Mission", style: "destructive" }),
      ]),
      expect.anything(),
    );
  });

  it("executes clear transaction, verifies empty state, and updates persistence and contexts", async () => {
    const onCleared = jest.fn();
    const { result } = renderHookHelper(() =>
      useClearMission({
        currentMission: {
          state: "READY",
          loaded: true,
          px4_armed: false,
          generation: 17,
        },
        filename: "field-a.csv",
        onCleared,
      }),
    );

    await act(async () => {
      const response = await result.current.executeClearDirectly();
      expect(response?.cleared).toBe(true);
    });

    expect(missionApi.clearMission).toHaveBeenCalledWith(
      expect.objectContaining({
        file_id: "field-a.csv",
        expected_mission_id: "run_test_123",
        expected_generation: 17,
      }),
    );

    // Verify verification calls
    expect(missionApi.getMissionStatus).toHaveBeenCalled();
    expect(missionApi.getLoadedMissionPath).toHaveBeenCalled();

    // Verify local persistence and context reconciliations
    expect(PersistentStorage.clearActiveMissionRuntime).toHaveBeenCalledTimes(1);
    expect(mockClearLoadedMission).toHaveBeenCalledTimes(1);
    expect(mockClearTrajectory).toHaveBeenCalledTimes(1);
    expect(mockRefreshNow).toHaveBeenCalledTimes(1);
    expect(onCleared).toHaveBeenCalledTimes(1);
    // Backend deleted the CSV: local waypoints are reset too.
    expect(mockClearMissionWaypoints).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate simultaneous clear executions via in-flight mutex", async () => {
    let resolveClear: (val: any) => void = () => {};
    jest.spyOn(missionApi, "clearMission").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveClear = resolve;
        }),
    );

    const { result } = renderHookHelper(() =>
      useClearMission({
        currentMission: {
          state: "READY",
          loaded: true,
          px4_armed: false,
        },
      }),
    );

    // Start first clear
    let p1: Promise<any>;
    act(() => {
      p1 = result.current.executeClearDirectly();
    });

    // Attempt second clear while first is in-flight
    let res2: any;
    await act(async () => {
      res2 = await result.current.executeClearDirectly();
    });

    expect(res2).toBeNull();

    // Resolve first
    await act(async () => {
      resolveClear({
        success: true,
        cleared: true,
        mission: { state: "EMPTY", loaded: false },
      });
      await p1;
    });
  });

  // ── Backend CLEAR deletes CSV + path ───────────────────────────────────────

  const readyMission = { state: "READY", loaded: true, px4_armed: false } as any;

  function mountReady(extra: Record<string, unknown> = {}) {
    return renderHookHelper(() =>
      useClearMission({ currentMission: readyMission, filename: "field-a.csv", ...extra }),
    );
  }

  function expectNothingResetLocally() {
    expect(mockClearMissionWaypoints).not.toHaveBeenCalled();
    expect(mockClearTrajectory).not.toHaveBeenCalled();
    expect(mockClearLoadedMission).not.toHaveBeenCalled();
    expect(PersistentStorage.clearActiveMissionRuntime).not.toHaveBeenCalled();
  }

  it("confirmation and success text no longer claim the CSV is retained", async () => {
    const { result } = mountReady();
    act(() => result.current.confirmAndClear());

    const [, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(message).toMatch(/delete the uploaded mission file and path/);
    expect(message).not.toMatch(/keep the uploaded file|remains available|retained/i);

    await act(async () => {
      buttons.find((b: any) => b.text === "Clear Mission").onPress();
    });
    const success = (Alert.alert as jest.Mock).mock.calls.find((c) => c[0] === "Mission Cleared");
    expect(success?.[1]).toMatch(/deleted/);
    expect(success?.[1]).not.toMatch(/remains available|retained/i);
  });

  it.each(["RUNNING", "PAUSED", "ARMING", "STOPPING"])(
    "STOP-first: refuses a %s mission, also on direct execution, with no request sent",
    async (state) => {
      const { result } = renderHookHelper(() =>
        useClearMission({ currentMission: { state, loaded: true, px4_armed: false } as any }),
      );
      expect(result.current.canClear).toBe(false);
      await expect(result.current.executeClearDirectly()).rejects.toThrow(/[Ss]top|paused/);
      expect(missionApi.clearMission).not.toHaveBeenCalled();
      expectNothingResetLocally();
    },
  );

  it("STOP-first: refuses when the backend reports active, and when armed", async () => {
    const active = renderHookHelper(() =>
      useClearMission({ currentMission: { state: "READY", active: true, loaded: true } as any }),
    );
    expect(active.result.current.canClear).toBe(false);
    const armed = renderHookHelper(() =>
      useClearMission({ currentMission: { state: "READY", loaded: true, px4_armed: true } as any }),
    );
    await expect(armed.result.current.executeClearDirectly()).rejects.toThrow(/armed/);
    expect(missionApi.clearMission).not.toHaveBeenCalled();
  });

  it.each(["LOADED", "READY", "COMPLETED", "STOPPED", "FAILED"])(
    "allows clearing an inactive %s mission",
    (state) => {
      const { result } = renderHookHelper(() =>
        useClearMission({ currentMission: { state, mission_id: "m1", px4_armed: false } as any }),
      );
      expect(result.current.canClear).toBe(true);
    },
  );

  it("allows clearing an uploaded-but-not-loaded mission shown only as a preview", () => {
    mockVerifiedMissionId = null;
    const { result } = renderHookHelper(() =>
      useClearMission({ currentMission: null, hasMissionHint: true }),
    );
    expect(result.current.canClear).toBe(true);
  });

  it("does not offer clear when nothing exists, and honours a caller block", () => {
    mockVerifiedMissionId = null;
    const none = renderHookHelper(() => useClearMission({ currentMission: null }));
    expect(none.result.current.canClear).toBe(false);
    const blocked = mountReady({ blockedReason: "Wait for the mission upload to finish before clearing." });
    expect(blocked.result.current.canClear).toBe(false);
    expect(blocked.result.current.refusalReason).toMatch(/upload/);
  });

  it("refuses at execution time while an upload is in flight", async () => {
    const { result } = mountReady({ getBlockedReason: () => "Wait for the mission upload to finish before clearing." });
    await expect(result.current.executeClearDirectly()).rejects.toThrow(/upload/);
    expect(missionApi.clearMission).not.toHaveBeenCalled();
  });

  it.each([
    ["state is not EMPTY", { state: "READY", mission_id: null, loaded: false }],
    ["a mission id remains", { state: "EMPTY", mission_id: "run_test_123", loaded: false }],
    ["a run id remains", { state: "EMPTY", mission_id: null, mission_run_id: "r1", loaded: false }],
    ["still loaded", { state: "EMPTY", mission_id: null, loaded: true }],
    ["still ready", { state: "EMPTY", mission_id: null, ready: true }],
  ])("fails and keeps local state when verification shows %s", async (_n, mission) => {
    jest.spyOn(missionApi, "getMissionStatus").mockResolvedValue({ success: true, mission } as any);
    const onCleared = jest.fn();
    const onError = jest.fn();
    const { result } = mountReady({ onCleared, onError });

    await expect(result.current.executeClearDirectly()).rejects.toThrow(/Verification failed/);
    expectNothingResetLocally();
    expect(onCleared).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("fails when the status read fails (no proof of EMPTY)", async () => {
    jest.spyOn(missionApi, "getMissionStatus").mockRejectedValue(new Error("offline"));
    const { result } = mountReady();
    await expect(result.current.executeClearDirectly()).rejects.toThrow(/Verification failed/);
    expectNothingResetLocally();
  });

  it("fails when a loaded path still exists", async () => {
    jest.spyOn(missionApi, "getLoadedMissionPath").mockResolvedValue({
      success: true,
      points: [{ lat: 1, lon: 2 }],
      navigation_point_count: 1,
      frame_id: "map",
      preview_truncated: false,
    } as any);
    const { result } = mountReady();
    await expect(result.current.executeClearDirectly()).rejects.toThrow(/loaded path/);
    expectNothingResetLocally();
  });

  it("accepts a 404 no-path answer but fails on a network error for the path", async () => {
    jest.spyOn(missionApi, "getLoadedMissionPath").mockRejectedValue(new ApiError("no mission", 404));
    const ok = mountReady();
    await act(async () => {
      await ok.result.current.executeClearDirectly();
    });
    expect(mockClearMissionWaypoints).toHaveBeenCalledTimes(1);

    mockClearMissionWaypoints.mockClear();
    mockClearTrajectory.mockClear();
    mockClearLoadedMission.mockClear();
    (PersistentStorage.clearActiveMissionRuntime as jest.Mock).mockClear();
    jest.spyOn(missionApi, "getLoadedMissionPath").mockRejectedValue(new Error("timeout"));
    const bad = mountReady();
    await expect(bad.result.current.executeClearDirectly()).rejects.toThrow(/path check failed/);
    expectNothingResetLocally();
  });

  it("does not reset anything when the backend refuses CLEAR (409)", async () => {
    jest.spyOn(missionApi, "clearMission").mockRejectedValue(
      new ApiError("Stop the mission first", 409, JSON.stringify({ code: "MISSION_ACTIVE_STOP_REQUIRED" })),
    );
    const { result } = mountReady();
    await expect(result.current.executeClearDirectly()).rejects.toThrow(/Stop the mission first/);
    expect(missionApi.getMissionStatus).not.toHaveBeenCalled();
    expectNothingResetLocally();
  });

  it("shows Clear Failed, never Mission Cleared, when verification fails", async () => {
    jest.spyOn(missionApi, "getMissionStatus").mockResolvedValue({
      success: true,
      mission: { state: "READY", mission_id: "m", loaded: true },
    } as any);
    const { result } = mountReady();
    act(() => result.current.confirmAndClear());
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    await act(async () => {
      buttons.find((b: any) => b.text === "Clear Mission").onPress();
    });
    const titles = (Alert.alert as jest.Mock).mock.calls.map((c) => c[0]);
    expect(titles).toContain("Clear Failed");
    expect(titles).not.toContain("Mission Cleared");
  });

  it("resets local waypoints only after verification succeeds", async () => {
    const order: string[] = [];
    jest.spyOn(missionApi, "getMissionStatus").mockImplementation((async () => {
      order.push("verify");
      return { success: true, mission: { state: "EMPTY", mission_id: null, loaded: false } };
    }) as any);
    mockClearMissionWaypoints.mockImplementation(async () => {
      order.push("waypoints");
    });
    const { result } = mountReady();
    await act(async () => {
      await result.current.executeClearDirectly();
    });
    expect(order).toEqual(["verify", "waypoints"]);
  });
});
