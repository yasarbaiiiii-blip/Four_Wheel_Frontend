import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { AppIcon, ICON_SIZES } from "../../shared/AppIcon";
import { APP_ICONS } from "../../../constants/icons";
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
    MaterialCommunityIcons: ({ name, testID, size, color, ...props }: any) => {
      const { Text } = require("react-native");
      return (
        <Text
          testID={testID ?? `icon-${name}`}
          size={size}
          color={color}
          {...props}
        >
          {`[icon:${name}]`}
        </Text>
      );
    },
  };
});

const environment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
});

describe("GCS Icon System & Component Icon Tests", () => {
  describe("AppIcon Component", () => {
    it("renders MaterialCommunityIcons with verified glyph name from APP_ICONS key", () => {
      let renderer: any;
      act(() => {
        renderer = TestRenderer.create(
          <AppIcon name="categoryMission" size="lg" color="#4F46E5" />,
        );
      });
      const iconNode = renderer.root.findByProps({
        testID: "app-icon-bullseye-arrow",
      });
      expect(iconNode).toBeTruthy();
      expect(iconNode.props.size).toBe(ICON_SIZES.lg);
      expect(iconNode.props.color).toBe("#4F46E5");
    });

    it("applies accessibilityElementsHidden by default for decorative icons", () => {
      let renderer: any;
      act(() => {
        renderer = TestRenderer.create(
          <AppIcon name="toolSpray" size="md" color="#1475EE" />,
        );
      });
      const iconNode = renderer.root.findByProps({
        testID: "app-icon-spray",
      });
      expect(iconNode.props.accessibilityElementsHidden).toBe(true);
      expect(iconNode.props.importantForAccessibility).toBe("no");
    });

    it("supports non-decorative standalone icons with explicit accessibility label", () => {
      let renderer: any;
      act(() => {
        renderer = TestRenderer.create(
          <AppIcon
            name="close"
            size="md"
            color="#64748B"
            decorative={false}
            accessibilityLabel="Close window"
          />
        );
      });
      const iconNode = renderer.root.findByProps({
        testID: "app-icon-close",
      });
      expect(iconNode.props.accessibilityElementsHidden).toBe(false);
      expect(iconNode.props.importantForAccessibility).toBe("auto");
      expect(iconNode.props.accessibilityLabel).toBe("Close window");
    });
  });

  describe("SprayActuatorCard Production Icons", () => {
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

    it("renders spray actuator header icon (spray) and idle test pulse icon (lightning-bolt)", () => {
      let renderer: any;
      act(() => {
        renderer = TestRenderer.create(<SprayActuatorCard {...defaultProps} />);
      });

      expect(
        renderer.root.findByProps({ testID: "app-icon-spray" }),
      ).toBeTruthy();
      expect(
        renderer.root.findByProps({ testID: "app-icon-lightning-bolt" }),
      ).toBeTruthy();
    });

    it("renders stepper minus and plus icons inside accessible 48dp buttons", () => {
      let renderer: any;
      act(() => {
        renderer = TestRenderer.create(<SprayActuatorCard {...defaultProps} />);
      });

      const minusIcon = renderer.root.findByProps({
        testID: "app-icon-minus",
      });
      const plusIcon = renderer.root.findByProps({
        testID: "app-icon-plus",
      });
      expect(minusIcon).toBeTruthy();
      expect(plusIcon).toBeTruthy();

      const touchables = renderer.root.findAllByType("TouchableOpacity");
      const minusBtn = touchables.find((t: any) =>
        t.props.accessibilityLabel?.includes("Decrease spray pulse duration"),
      );
      const plusBtn = touchables.find((t: any) =>
        t.props.accessibilityLabel?.includes("Increase spray pulse duration"),
      );
      expect(minusBtn.props.accessibilityRole).toBe("button");
      expect(plusBtn.props.accessibilityRole).toBe("button");
    });

    it("renders warning banner icon (alert-circle-outline) when controller is OFF", () => {
      let renderer: any;
      act(() => {
        renderer = TestRenderer.create(
          <SprayActuatorCard {...defaultProps} draftServoEnabled={false} />,
        );
      });

      const warningIcon = renderer.root.findByProps({
        testID: "app-icon-alert-circle-outline",
      });
      expect(warningIcon).toBeTruthy();
    });

    it("renders success icon (check-circle-outline) when pulse succeeds", () => {
      let renderer: any;
      act(() => {
        renderer = TestRenderer.create(
          <SprayActuatorCard {...defaultProps} testStatus="success" />,
        );
      });

      const successIcon = renderer.root.findByProps({
        testID: "app-icon-check-circle-outline",
      });
      expect(successIcon).toBeTruthy();
    });

    it("renders error icon (alert-circle-outline) when pulse fails", () => {
      let renderer: any;
      act(() => {
        renderer = TestRenderer.create(
          <SprayActuatorCard {...defaultProps} testStatus="error" />,
        );
      });

      const errorIcon = renderer.root.findByProps({
        testID: "app-icon-alert-circle-outline",
      });
      expect(errorIcon).toBeTruthy();
    });

    it("renders dirty indicator dot icon (circle) when isDirty is true", () => {
      let renderer: any;
      act(() => {
        renderer = TestRenderer.create(
          <SprayActuatorCard {...defaultProps} isDirty={true} />,
        );
      });

      const dotIcon = renderer.root.findByProps({
        testID: "app-icon-circle",
      });
      expect(dotIcon).toBeTruthy();
    });
  });
});
