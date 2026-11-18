import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Alert } from "react-native";
import { EstopControls } from "../EstopControls";
import { emergencyStop, releaseEmergencyStop } from "../../../services/vehicleControlService";

let mockEstopState: boolean | undefined;

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  Modal: "Modal",
  ActivityIndicator: "ActivityIndicator",
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Alert: { alert: jest.fn() },
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: "Icon" }));
jest.mock("../../../context/TelemetryContext", () => ({
  useTelemetryControl: () => ({ missionLifecycle: { emergency_stop: mockEstopState } }),
}));
jest.mock("../../../services/vehicleControlService", () => ({
  emergencyStop: jest.fn(async () => ({ success: true, message: "Stop recorded" })),
  releaseEmergencyStop: jest.fn(async () => ({ success: false })),
}));

beforeAll(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("mission emergency stop", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([false, undefined])("keeps Stop enabled when the latch is %s", async (latched) => {
    mockEstopState = latched;
    let renderer: any;
    act(() => { renderer = TestRenderer.create(<EstopControls variant="mission" />); });
    const stop = renderer.root.find((node: any) => node.type === "TouchableOpacity" && node.props.accessibilityLabel === "Emergency stop");
    expect(stop.props.accessibilityRole).toBe("button");
    expect(stop.props.disabled).not.toBe(true);
    expect(stop.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ minHeight: 48 })]));
    await act(async () => { await stop.props.onPress(); });
    expect(emergencyStop).toHaveBeenCalledTimes(1);
    expect(releaseEmergencyStop).not.toHaveBeenCalled();
  });

  it("shows the rover's answer and asks for fresh status after a recorded stop", async () => {
    mockEstopState = undefined;
    const onStopRecorded = jest.fn();
    let renderer: any;
    act(() => { renderer = TestRenderer.create(<EstopControls variant="mission" onStopRecorded={onStopRecorded} />); });
    const stop = renderer.root.find((node: any) => node.props.accessibilityLabel === "Emergency stop");
    await act(async () => { await stop.props.onPress(); });
    expect(Alert.alert).toHaveBeenCalledWith("E-STOP RECORDED", "Stop recorded");
    expect(onStopRecorded).toHaveBeenCalledTimes(1);
  });

  it("does not report a stop or ask for status when the rover refuses", async () => {
    mockEstopState = undefined;
    (emergencyStop as jest.Mock).mockResolvedValueOnce({ success: false, message: "refused" });
    const onStopRecorded = jest.fn();
    let renderer: any;
    act(() => { renderer = TestRenderer.create(<EstopControls variant="mission" onStopRecorded={onStopRecorded} />); });
    const stop = renderer.root.find((node: any) => node.props.accessibilityLabel === "Emergency stop");
    await act(async () => { await stop.props.onPress(); });
    expect(Alert.alert).toHaveBeenCalledWith("E-STOP NOT CONFIRMED", "refused");
    expect(onStopRecorded).not.toHaveBeenCalled();
  });

  it("transforms into Release button when latched without separate badge", async () => {
    mockEstopState = true;
    let renderer: any;
    act(() => { renderer = TestRenderer.create(<EstopControls variant="mission" stopLatched={true} />); });
    const release = renderer.root.find((node: any) => node.type === "TouchableOpacity" && node.props.accessibilityLabel === "Release emergency stop");
    expect(release.props.accessibilityRole).toBe("button");
    expect(release.props.disabled).not.toBe(true);
    // Verified: No separate Stop button or STOP LATCHED text badge is rendered
    expect(renderer.root.findAll((node: any) => node.type === "TouchableOpacity" && node.props.accessibilityLabel === "Emergency stop")).toHaveLength(0);
    expect(renderer.root.findAll((node: any) => node.type === "View" && node.props.accessibilityLabel === "A stop is latched on the rover")).toHaveLength(0);
  });
});
