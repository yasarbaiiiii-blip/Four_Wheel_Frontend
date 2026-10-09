import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  useSprayActuator,
  SPRAY_DURATION_MIN_MS,
  SPRAY_DURATION_MAX_MS,
} from "../useSprayActuator";
import * as sprayConfigService from "../../services/sprayConfigService";

jest.mock("react-native", () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock("../../services/sprayConfigService", () => ({
  getSprayConfig: jest.fn(),
  enableSpray: jest.fn(),
  disableSpray: jest.fn(),
  setSprayDuration: jest.fn(),
  testSpray: jest.fn(),
  cancelSprayTest: jest.fn(),
  SPRAY_DURATION_MAX_SEC: 3.0,
}));

function renderHook<T>(useHook: () => T) {
  const ref: { current: T } = { current: undefined as unknown as T };

  function Wrapper() {
    ref.current = useHook();
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const unmount = () => {
    act(() => {
      renderer.unmount();
    });
  };

  return { result: ref, rerender, unmount };
}

describe("useSprayActuator hook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (sprayConfigService.getSprayConfig as jest.Mock).mockResolvedValue({
      success: true,
      config: {
        available: true,
        enabled: true,
        press_pwm_us: 2000,
        release_pwm_us: 1500,
        spray_duration_sec: 0.5,
      },
    });
    (sprayConfigService.enableSpray as jest.Mock).mockResolvedValue({ success: true });
    (sprayConfigService.disableSpray as jest.Mock).mockResolvedValue({ success: true });
    (sprayConfigService.setSprayDuration as jest.Mock).mockResolvedValue({ success: true });
    (sprayConfigService.testSpray as jest.Mock).mockResolvedValue({ success: true });
    (sprayConfigService.cancelSprayTest as jest.Mock).mockResolvedValue({ success: true });
  });

  describe("Duration Stepper Integer Math & Clamping", () => {
    it("increments and decrements duration in integer ms steps", () => {
      const { result } = renderHook(() => useSprayActuator());

      expect(result.current.draftDurationMs).toBe(500);

      act(() => {
        result.current.adjustDuration(100);
      });
      expect(result.current.draftDurationMs).toBe(600);

      act(() => {
        result.current.adjustDuration(-200);
      });
      expect(result.current.draftDurationMs).toBe(400);
    });

    it("clamps at lower bound (100 ms)", () => {
      const { result } = renderHook(() => useSprayActuator());

      act(() => {
        result.current.adjustDuration(-1000);
      });
      expect(result.current.draftDurationMs).toBe(SPRAY_DURATION_MIN_MS);
    });

    it("clamps at upper bound (3000 ms)", () => {
      const { result } = renderHook(() => useSprayActuator());

      act(() => {
        result.current.adjustDuration(5000);
      });
      expect(result.current.draftDurationMs).toBe(SPRAY_DURATION_MAX_MS);
    });

    it("supports direct duration setting with rounding and clamping", () => {
      const { result } = renderHook(() => useSprayActuator());

      act(() => {
        result.current.setDirectDuration(1250);
      });
      expect(result.current.draftDurationMs).toBe(1250);

      act(() => {
        result.current.setDirectDuration(50); // Below min
      });
      expect(result.current.draftDurationMs).toBe(SPRAY_DURATION_MIN_MS);

      act(() => {
        result.current.setDirectDuration(9999); // Above max
      });
      expect(result.current.draftDurationMs).toBe(SPRAY_DURATION_MAX_MS);
    });
  });

  describe("Draft Tracking & Dirty State", () => {
    it("tracks isDirty when draft values differ from saved values", () => {
      const { result } = renderHook(() => useSprayActuator());

      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.adjustDuration(100);
      });
      expect(result.current.isDirty).toBe(true);

      act(() => {
        result.current.discardDraft();
      });
      expect(result.current.isDirty).toBe(false);
      expect(result.current.draftDurationMs).toBe(500);
    });

    it("tracks isDirty when draft switch is toggled", () => {
      const { result } = renderHook(() => useSprayActuator());

      expect(result.current.isDirty).toBe(false);

      act(() => {
        result.current.setDraftServoEnabled(true);
      });
      expect(result.current.isDirty).toBe(true);

      act(() => {
        result.current.discardDraft();
      });
      expect(result.current.isDirty).toBe(false);
      expect(result.current.draftServoEnabled).toBe(false);
    });
  });

  describe("Safety Interlocks for Spray Test (Option B Disarmed Policy)", () => {
    it("blocks testing when rover is disconnected", () => {
      const { result } = renderHook(() =>
        useSprayActuator({
          connectionState: "disconnected",
          isMissionActive: false,
          isArmed: false,
          groundSpeed: 0,
        }),
      );

      expect(result.current.canTestSpray).toBe(false);
      expect(result.current.disabledTestReason).toContain("not connected");
    });

    it("blocks testing when mission is active", () => {
      const { result } = renderHook(() =>
        useSprayActuator({
          connectionState: "connected",
          isMissionActive: true,
          isArmed: false,
          groundSpeed: 0,
        }),
      );

      expect(result.current.canTestSpray).toBe(false);
      expect(result.current.disabledTestReason).toContain("mission running");
    });

    it("blocks testing when rover is moving", () => {
      const { result } = renderHook(() =>
        useSprayActuator({
          connectionState: "connected",
          isMissionActive: false,
          isArmed: true,
          groundSpeed: 0.5,
        }),
      );

      expect(result.current.canTestSpray).toBe(false);
      expect(result.current.disabledTestReason).toContain("stationary");
    });

    it("blocks testing when spray controller power switch is OFF", () => {
      const { result } = renderHook(() =>
        useSprayActuator({
          connectionState: "connected",
          isMissionActive: false,
          isArmed: false,
          groundSpeed: 0,
        }),
      );

      expect(result.current.draftServoEnabled).toBe(false);
      expect(result.current.canTestSpray).toBe(false);
      expect(result.current.disabledTestReason).toContain("Enable spray controller");
    });

    it("permits testing when connected, stationary, disarmed (Option B), and switch is ON", () => {
      const { result } = renderHook(() =>
        useSprayActuator({
          connectionState: "connected",
          isMissionActive: false,
          isArmed: false, // Disarmed bench test allowed!
          groundSpeed: 0,
        }),
      );

      act(() => {
        result.current.setDraftServoEnabled(true);
      });

      expect(result.current.canTestSpray).toBe(true);
      expect(result.current.disabledTestReason).toBeNull();
    });
  });

  describe("Option A Laser Selection Behavior", () => {
    it("dispatches disableSpray() and sets draft power to OFF when committing LASER", async () => {
      const { result } = renderHook(() => useSprayActuator());

      act(() => {
        result.current.setDraftServoEnabled(true);
      });

      let res: { success: boolean; message?: string } | undefined;
      await act(async () => {
        res = await result.current.commitSpraySettings("LASER");
      });

      expect(res?.success).toBe(true);
      expect(sprayConfigService.disableSpray).toHaveBeenCalled();
      expect(result.current.draftServoEnabled).toBe(false);
      expect(result.current.savedServoEnabled).toBe(false);
    });
  });

  describe("Atomic Commit for SPRAY Tool", () => {
    it("commits switch and duration atomically when saving SPRAY", async () => {
      const { result } = renderHook(() => useSprayActuator());

      act(() => {
        result.current.setDraftServoEnabled(true);
        result.current.adjustDuration(300); // 500 -> 800 ms
      });

      await act(async () => {
        await result.current.commitSpraySettings("SPRAY");
      });

      expect(sprayConfigService.enableSpray).toHaveBeenCalled();
      expect(sprayConfigService.setSprayDuration).toHaveBeenCalledWith(0.8);
      expect(result.current.isDirty).toBe(false);
      expect(result.current.savedServoEnabled).toBe(true);
      expect(result.current.savedDurationMs).toBe(800);
    });
  });

  describe("Guaranteed Hardware Release on Test Failure", () => {
    it("dispatches emergency cancelSprayTest() if testSpray rejects", async () => {
      (sprayConfigService.testSpray as jest.Mock).mockRejectedValueOnce(
        new Error("Hardware comms failure"),
      );

      const { result } = renderHook(() =>
        useSprayActuator({
          connectionState: "connected",
          isMissionActive: false,
          isArmed: false,
          groundSpeed: 0,
        }),
      );

      act(() => {
        result.current.setDraftServoEnabled(true);
      });

      await act(async () => {
        const testRes = await result.current.executeSprayTest();
        expect(testRes.success).toBe(false);
      });

      expect(sprayConfigService.cancelSprayTest).toHaveBeenCalled();
      expect(result.current.isTesting).toBe(false);
      expect(result.current.testStatus).toBe("error");
    });
  });
});
