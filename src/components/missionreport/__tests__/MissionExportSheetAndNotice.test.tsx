import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { MissionExportSheet } from "../MissionExportSheet";
import { MissionDeckControls } from "../MissionDeckControls";
import { getDeckControlState } from "../../../utils/missionDeckControls";
import { pauseNotice } from "../../../utils/pauseReasonPresentation";

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  Modal: "Modal",
  Pressable: "Pressable",
  TouchableOpacity: "TouchableOpacity",
  StyleSheet: { create: (styles: unknown) => styles },
}));

jest.mock("@expo/vector-icons", () => {
  const { Text } = require("react-native");
  return {
    MaterialCommunityIcons: ({ name }: { name: string }) => (
      <Text>{`[icon:${name}]`}</Text>
    ),
  };
});

const environment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
});

function render(element: React.ReactElement) {
  let renderer: any;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  const button = (label: string) =>
    renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === label,
    );
  const allText = () =>
    renderer.root
      .findAllByType("Text")
      .map((node: any) => [node.props.children].flat(Infinity).join(""))
      .join(" ");
  const alerts = () =>
    renderer.root.findAll(
      (node: any) => node.type === "View" && node.props.accessibilityRole === "alert",
    );
  return { button, allText, alerts };
}

describe("MissionExportSheet", () => {
  const baseProps = () => ({
    visible: true,
    onClose: jest.fn(),
    onExportFile: jest.fn(),
    onExportReport: jest.fn(),
    onClearLogs: jest.fn(),
    fileDisabled: false,
    reportDisabled: false,
    clearBlockedReason: null as string | null,
  });

  it("offers the mission file, the report and clear logs", () => {
    const { allText } = render(<MissionExportSheet {...baseProps()} />);
    const text = allText();
    expect(text).toContain("Mission file (CSV)");
    expect(text).toContain("Mission report (Excel / PDF)");
    expect(text).toContain("Clear mission logs");
  });

  it("routes each row to its own action", () => {
    const props = baseProps();
    const { button } = render(<MissionExportSheet {...props} />);
    act(() => button("Export mission file").props.onPress());
    act(() => button("Export mission report").props.onPress());
    act(() => button("Clear mission logs").props.onPress());
    expect(props.onExportFile).toHaveBeenCalledTimes(1);
    expect(props.onExportReport).toHaveBeenCalledTimes(1);
    expect(props.onClearLogs).toHaveBeenCalledTimes(1);
  });

  it("disables the file and report rows when no mission is loaded", () => {
    const { button } = render(
      <MissionExportSheet {...baseProps()} fileDisabled reportDisabled />,
    );
    expect(button("Export mission file").props.disabled).toBe(true);
    expect(button("Export mission report").props.disabled).toBe(true);
    expect(button("Clear mission logs").props.disabled).toBe(false);
  });

  it("blocks clearing logs and says why while a mission runs", () => {
    const { button, allText } = render(
      <MissionExportSheet
        {...baseProps()}
        clearBlockedReason="Stop the mission before clearing its logs."
      />,
    );
    expect(button("Clear mission logs").props.disabled).toBe(true);
    expect(allText()).toContain("Stop the mission before clearing its logs.");
  });

  it("closes from the close button", () => {
    const props = baseProps();
    const { button } = render(<MissionExportSheet {...props} />);
    act(() => button("Close export menu").props.onPress());
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("MissionDeckControls pause notice", () => {
  const controls = getDeckControlState({
    isMissionActive: true,
    isMissionPaused: true,
    waitingForManual: false,
    canStart: false,
    isPreparing: false,
    isEditing: false,
    isBusy: false,
    isStopping: false,
    mode: "auto",
  });
  const baseProps = {
    controls,
    mode: "auto" as const,
    isPreparing: false,
    pending: null,
    onPrimary: () => undefined,
    onSecondary: () => undefined,
    onSkip: () => undefined,
    onNext: () => undefined,
    onSetMode: () => undefined,
  };

  it("shows nothing without a notice", () => {
    const { alerts } = render(<MissionDeckControls {...baseProps} />);
    expect(alerts()).toHaveLength(0);
  });

  it("shows why the rover is paused", () => {
    const { alerts, allText } = render(
      <MissionDeckControls
        {...baseProps}
        notice={pauseNotice(true, "OBSTACLE", null, false)}
      />,
    );
    expect(alerts()).toHaveLength(1);
    expect(allText()).toContain("Obstacle ahead");
    expect(allText()).toContain("Clear the path");
  });
});
