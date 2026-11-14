import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Alert } from "react-native";
import { useClearMission } from "../useClearMission";
import * as missionApi from "../../services/missionApi";
import PersistentStorage from "../../services/PersistentStorage";

jest.mock("react-native", () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

const mockClearLoadedMission = jest.fn();
jest.mock("../../context/VerifiedMissionContext", () => ({
  useVerifiedMissionContext: () => ({
    missionId: "run_test_123",
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
        retained: true,
        reloadable: true,
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
        loaded: false,
        active: false,
        ready: false,
      },
    });

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
});
