import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { SprayActuatorCard } from "../SprayActuatorCard";

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TextInput: "TextInput",
  TouchableOpacity: "TouchableOpacity",
  Switch: "Switch",
  ActivityIndicator: "ActivityIndicator",
  StyleSheet: { create: (styles: unknown) => styles },
  Animated: {
    Value: jest.fn(() => ({
      interpolate: jest.fn(() => "0%"),
      setValue: jest.fn(),
    })),
    timing: jest.fn(() => ({
      start: jest.fn((cb?: () => void) => cb?.()),
    })),
    View: "Animated.View",
  },
}));

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  return {
    MaterialCommunityIcons: ({ name, testID, ...props }: any) => {
      const { Text } = require("react-native");
      return <Text testID={testID ?? `icon-${name}`} {...props}>{`[icon:${name}]`}</Text>;
    },
  };
});

const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
});

describe("SprayActuatorCard Component", () => {
  const defaultProps = {
    draftServoEnabled: true,
    onToggleEnabled: jest.fn(),
    draftDurationMs: 500,
    onAdjustDuration: jest.fn(),
    onSetDirectDuration: jest.fn(),
    isDirty: false,
    channel: 5,
    pressPwmUs: 2000,
    releasePwmUs: 1500,
    configLoaded: true,
    isLoadingConfig: false,
    isOnline: true,
    canTestSpray: true,
    disabledTestReason: null,
    isTesting: false,
    testStatus: "idle" as const,
    testErrorMessage: null,
    onExecuteTest: jest.fn().mockResolvedValue({ success: true }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders actuator header, telemetry, and duration", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<SprayActuatorCard {...defaultProps} />);
    });
    const texts = renderer.root
      .findAllByType("Text")
      .map((node: any) => node.props.children);
    const joined = texts.flat(Infinity).join(" ");

    expect(joined).toContain("Spray Actuator");
    expect(joined).toContain("AUX5 CHANNEL");
    expect(joined).toContain("2000 µs");
    expect(joined).toContain("1500 µs");
    expect(joined).toContain("0.50");
    expect(joined).toContain("ENABLED");
  });

  it("renders validation warning banner when draftServoEnabled is false", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <SprayActuatorCard {...defaultProps} draftServoEnabled={false} />,
      );
    });
    const texts = renderer.root
      .findAllByType("Text")
      .map((node: any) => node.props.children);
    const joined = texts.flat(Infinity).join(" ");

    expect(joined).toContain("Spray Controller Power is OFF");
    expect(joined).toContain("Missions will execute without active spray dispensing");
  });

  it("renders dirty indicator pill when isDirty is true", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <SprayActuatorCard {...defaultProps} isDirty={true} />,
      );
    });
    const texts = renderer.root
      .findAllByType("Text")
      .map((node: any) => node.props.children);
    const joined = texts.flat(Infinity).join(" ");

    expect(joined).toContain("Unsaved Changes");
  });

  it("does not render dirty indicator pill when isDirty is false", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <SprayActuatorCard {...defaultProps} isDirty={false} />,
      );
    });
    const texts = renderer.root
      .findAllByType("Text")
      .map((node: any) => node.props.children);
    const joined = texts.flat(Infinity).join(" ");

    expect(joined).not.toContain("Unsaved Changes");
  });

  it("shows disabled explanation for spray test when test is blocked", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <SprayActuatorCard
          {...defaultProps}
          canTestSpray={false}
          disabledTestReason="Rover not connected"
        />,
      );
    });
    const texts = renderer.root
      .findAllByType("Text")
      .map((node: any) => node.props.children);
    const joined = texts.flat(Infinity).join(" ");

    expect(joined).toContain("Rover not connected");
  });

  it("shows offline telemetry warning when rover is offline", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <SprayActuatorCard {...defaultProps} isOnline={false} />,
      );
    });
    const texts = renderer.root
      .findAllByType("Text")
      .map((node: any) => node.props.children);
    const joined = texts.flat(Infinity).join(" ");

    expect(joined).toContain("Telemetry offline — Rover disconnected");
  });

  it("triggers onToggleEnabled when switch is changed", () => {
    const onToggleEnabled = jest.fn();
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <SprayActuatorCard
          {...defaultProps}
          draftServoEnabled={false}
          onToggleEnabled={onToggleEnabled}
        />,
      );
    });

    const switchComponent = renderer.root.findByType("Switch");
    act(() => {
      switchComponent.props.onValueChange(true);
    });

    expect(onToggleEnabled).toHaveBeenCalledWith(true);
  });

  it("triggers onExecuteTest when test pulse button is tapped", async () => {
    const onExecuteTest = jest.fn().mockResolvedValue({ success: true });
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <SprayActuatorCard
          {...defaultProps}
          onExecuteTest={onExecuteTest}
        />,
      );
    });

    const buttons = renderer.root.findAllByType("TouchableOpacity");
    const testButton = buttons.find((btn: any) =>
      btn.props.accessibilityLabel?.includes("Test spray pulse"),
    );
    expect(testButton).toBeTruthy();

    await act(async () => {
      await testButton.props.onPress();
    });

    expect(onExecuteTest).toHaveBeenCalled();
  });
});
