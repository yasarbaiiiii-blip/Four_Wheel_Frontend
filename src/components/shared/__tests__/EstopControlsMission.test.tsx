import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { EstopControls } from "../EstopControls";
import { emergencyStop, releaseEmergencyStop } from "../../../services/vehicleControlService";

let mockEstopState: boolean | undefined;

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
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

  it.each([true, false, undefined])("keeps Stop enabled when the latch is %s", async (latched) => {
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
});
