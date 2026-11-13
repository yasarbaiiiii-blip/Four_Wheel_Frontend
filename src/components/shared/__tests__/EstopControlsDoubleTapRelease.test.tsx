import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Alert, AppState } from "react-native";
import { EstopControls } from "../EstopControls";
import {
  emergencyStop,
  releaseEmergencyStop,
} from "../../../services/vehicleControlService";
import { getMissionStatus } from "../../../services/missionApi";

let mockEstopState: boolean | undefined = false;
let mockConnectionState: string = "connected";
let mockDisplayState: "live" | "stale" | "offline" = "live";
let appStateCallback: ((state: string) => void) | null = null;

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  Modal: "Modal",
  ActivityIndicator: "ActivityIndicator",
  AppState: {
    addEventListener: jest.fn((event: string, cb: (state: string) => void) => {
      appStateCallback = cb;
      return { remove: jest.fn() };
    }),
  },
  Alert: { alert: jest.fn() },
  StyleSheet: { create: (styles: unknown) => styles },
}));

jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: "Icon" }));

jest.mock("../../../context/TelemetryContext", () => ({
  useTelemetryControl: () => ({
    missionLifecycle: { emergency_stop: mockEstopState },
  }),
}));

jest.mock("../../../context/ConnectionContext", () => ({
  ConnectionContext: {
    Consumer: ({ children }: any) =>
      children({ connectionState: mockConnectionState }),
    Provider: ({ children }: any) => children,
  },
}));

jest.mock("../../../context/liveTelemetryStore", () => ({
  LiveTelemetryStoreContext: {
    Consumer: ({ children }: any) => children(null),
    Provider: ({ children }: any) => children,
  },
}));

jest.mock("../../../services/vehicleControlService", () => ({
  emergencyStop: jest.fn(async () => ({
    success: true,
    message: "Stop recorded",
  })),
  releaseEmergencyStop: jest.fn(async () => ({
    success: true,
    message: "Release accepted",
  })),
}));

jest.mock("../../../services/missionApi", () => ({
  getMissionStatus: jest.fn(async () => ({
    success: true,
    mission: { emergency_stop: false, px4_armed: false },
  })),
}));

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("EstopControls — Double-Tap Release & Safety Interlocks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockEstopState = false;
    mockConnectionState = "connected";
    mockDisplayState = "live";
    appStateCallback = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("asserts E-Stop immediately on single tap when latch is clear", async () => {
    mockEstopState = false;
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<EstopControls variant="header" />);
    });

    const stopButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Emergency stop",
    );

    await act(async () => {
      await stopButton.props.onPress();
    });

    expect(emergencyStop).toHaveBeenCalledTimes(1);
    expect(releaseEmergencyStop).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      "E-STOP RECORDED",
      "Stop recorded",
    );
  });

  it("first tap when latched prompts 'Tap again to release' and sends NO release", async () => {
    mockEstopState = true;
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<EstopControls variant="header" />);
    });

    const releaseButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Release emergency stop",
    );

    act(() => {
      releaseButton.props.onPress();
    });

    // Does NOT send release request
    expect(releaseEmergencyStop).not.toHaveBeenCalled();
    expect(emergencyStop).not.toHaveBeenCalled();

    // Text updates to prompt operator
    const updatedButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Tap again to release E-Stop",
    );
    expect(updatedButton).toBeDefined();

    // Modal is NOT open yet
    const modal = renderer.root.findByType("Modal");
    expect(modal.props.visible).toBe(false);
  });

  it("first tap prompt expires after 450 ms", () => {
    mockEstopState = true;
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<EstopControls variant="header" />);
    });

    const releaseButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Release emergency stop",
    );

    act(() => {
      releaseButton.props.onPress();
    });

    // Advance 450 ms
    act(() => {
      jest.advanceTimersByTime(450);
    });

    // Returns to initial RELEASE state
    expect(
      renderer.root.findAll(
        (node: any) =>
          node.type === "TouchableOpacity" &&
          node.props.accessibilityLabel === "Tap again to release E-Stop",
      ),
    ).toHaveLength(0);

    expect(
      renderer.root.findAll(
        (node: any) =>
          node.type === "TouchableOpacity" &&
          node.props.accessibilityLabel === "Release emergency stop",
      ),
    ).toHaveLength(1);
  });

  it("second tap within 450 ms opens confirmation popup without sending release", () => {
    mockEstopState = true;
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<EstopControls variant="header" />);
    });

    const releaseButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Release emergency stop",
    );

    // Tap 1
    act(() => {
      releaseButton.props.onPress();
    });

    // Advance 200 ms (< 450 ms)
    act(() => {
      jest.advanceTimersByTime(200);
    });

    const pendingButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Tap again to release E-Stop",
    );

    // Tap 2
    act(() => {
      pendingButton.props.onPress();
    });

    // Modal is now visible
    const modal = renderer.root.findByType("Modal");
    expect(modal.props.visible).toBe(true);

    // Neither tap sent a release request!
    expect(releaseEmergencyStop).not.toHaveBeenCalled();
  });

  it("popup 'Keep Stopped' closes modal and sends nothing", () => {
    mockEstopState = true;
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<EstopControls variant="header" />);
    });

    const releaseButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Release emergency stop",
    );
    act(() => {
      releaseButton.props.onPress();
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    const pendingButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Tap again to release E-Stop",
    );
    act(() => {
      pendingButton.props.onPress();
    });

    const keepStoppedBtn = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Keep Stopped",
    );

    act(() => {
      keepStoppedBtn.props.onPress();
    });

    const modal = renderer.root.findByType("Modal");
    expect(modal.props.visible).toBe(false);
    expect(releaseEmergencyStop).not.toHaveBeenCalled();
    expect(emergencyStop).not.toHaveBeenCalled();
  });

  it("popup 'STOP NOW' immediately reasserts E-Stop and closes modal", async () => {
    mockEstopState = true;
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<EstopControls variant="header" />);
    });

    const releaseButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Release emergency stop",
    );
    act(() => {
      releaseButton.props.onPress();
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    const pendingButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Tap again to release E-Stop",
    );
    act(() => {
      pendingButton.props.onPress();
    });

    const stopNowBtn = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "STOP NOW",
    );

    await act(async () => {
      await stopNowBtn.props.onPress();
    });

    expect(emergencyStop).toHaveBeenCalledTimes(1);
    expect(releaseEmergencyStop).not.toHaveBeenCalled();

    const modal = renderer.root.findByType("Modal");
    expect(modal.props.visible).toBe(false);
  });

  it("popup 'Confirm Release' sends release request and confirms with fresh status", async () => {
    mockEstopState = true;
    const onReleaseConfirmed = jest.fn();
    (getMissionStatus as jest.Mock).mockResolvedValueOnce({
      success: true,
      mission: { emergency_stop: false, px4_armed: false },
    });

    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <EstopControls
          variant="header"
          onReleaseConfirmed={onReleaseConfirmed}
        />,
      );
    });

    const releaseButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Release emergency stop",
    );
    act(() => {
      releaseButton.props.onPress();
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    const pendingButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Tap again to release E-Stop",
    );
    act(() => {
      pendingButton.props.onPress();
    });

    const confirmReleaseBtn = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Confirm Release",
    );

    await act(async () => {
      const releasePromise = confirmReleaseBtn.props.onPress();
      await jest.advanceTimersByTimeAsync(600);
      await releasePromise;
    });

    expect(releaseEmergencyStop).toHaveBeenCalledTimes(1);
    expect(getMissionStatus).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      "E-stop released",
      "Release accepted",
    );
    expect(onReleaseConfirmed).toHaveBeenCalled();
  });

  it("shows 'Release status unknown' if fresh status cannot confirm disarmed release", async () => {
    mockEstopState = true;
    // Status still reports emergency_stop = true or armed = true
    (getMissionStatus as jest.Mock).mockResolvedValue({
      success: true,
      mission: { emergency_stop: true, px4_armed: false },
    });

    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<EstopControls variant="header" />);
    });

    const releaseButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Release emergency stop",
    );
    act(() => {
      releaseButton.props.onPress();
    });
    act(() => {
      jest.advanceTimersByTime(100);
    });
    const pendingButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Tap again to release E-Stop",
    );
    act(() => {
      pendingButton.props.onPress();
    });

    const confirmReleaseBtn = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Confirm Release",
    );

    await act(async () => {
      const releasePromise = confirmReleaseBtn.props.onPress();
      await jest.advanceTimersByTimeAsync(1000);
      await releasePromise;
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      "Release status unknown",
      expect.stringContaining("could not confirm"),
    );
  });

  it("app backgrounding cancels the first-tap gesture and dismisses modal", () => {
    mockEstopState = true;
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<EstopControls variant="header" />);
    });

    const releaseButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Release emergency stop",
    );
    act(() => {
      releaseButton.props.onPress();
    });

    expect(
      renderer.root.findAll(
        (node: any) =>
          node.type === "TouchableOpacity" &&
          node.props.accessibilityLabel === "Tap again to release E-Stop",
      ),
    ).toHaveLength(1);

    // App goes to background
    act(() => {
      appStateCallback?.("background");
    });

    // Gesture is cancelled
    expect(
      renderer.root.findAll(
        (node: any) =>
          node.type === "TouchableOpacity" &&
          node.props.accessibilityLabel === "Tap again to release E-Stop",
      ),
    ).toHaveLength(0);
  });

  it("concurrent STOP wins: cancels release attempt and reasserts E-Stop", async () => {
    mockEstopState = true;
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<EstopControls variant="header" />);
    });

    const stopButton = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Emergency stop",
    );

    // Call stop
    await act(async () => {
      await stopButton.props.onPress();
    });

    expect(emergencyStop).toHaveBeenCalledTimes(1);
    expect(releaseEmergencyStop).not.toHaveBeenCalled();
  });
});
