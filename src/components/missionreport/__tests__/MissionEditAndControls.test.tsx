import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { MissionEditToolbar } from "../MissionEditToolbar";
import { MissionDeckControls } from "../MissionDeckControls";
import {
  getDeckControlState,
  type DeckControlInput,
} from "../../../utils/missionDeckControls";

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  ActivityIndicator: "ActivityIndicator",
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
  return { button, allText };
}

describe("MissionEditToolbar", () => {
  const noop = () => undefined;
  const props = {
    pointCount: 6,
    canReverse: true,
    canUndo: false,
    canRedo: false,
    isDirty: false,
    isApplying: false,
    onReverse: noop,
    onUndo: noop,
    onRedo: noop,
    onCancel: noop,
    onApply: noop,
  };

  it("shows Reverse, Undo and Redo buttons", () => {
    const { button } = render(<MissionEditToolbar {...props} />);
    expect(button("Reverse")).toBeTruthy();
    expect(button("Undo")).toBeTruthy();
    expect(button("Redo")).toBeTruthy();
  });

  it("enables Reverse but disables Undo, Redo and Apply on a clean draft", () => {
    const { button } = render(<MissionEditToolbar {...props} />);
    expect(button("Reverse").props.disabled).toBe(false);
    expect(button("Undo").props.disabled).toBe(true);
    expect(button("Redo").props.disabled).toBe(true);
    expect(button("Apply changes to the rover").props.disabled).toBe(true);
  });

  it("enables Undo/Redo/Apply from state and calls the handlers", () => {
    const onReverse = jest.fn();
    const onUndo = jest.fn();
    const onRedo = jest.fn();
    const onApply = jest.fn();
    const { button, allText } = render(
      <MissionEditToolbar
        {...props}
        canUndo
        canRedo
        isDirty
        onReverse={onReverse}
        onUndo={onUndo}
        onRedo={onRedo}
        onApply={onApply}
      />,
    );

    expect(allText()).toContain("UNSAVED CHANGES");
    act(() => button("Reverse").props.onPress());
    act(() => button("Undo").props.onPress());
    act(() => button("Redo").props.onPress());
    act(() => button("Apply changes to the rover").props.onPress());
    expect(onReverse).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRedo).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it("locks every action while applying so a double tap cannot upload twice", () => {
    const { button, allText } = render(
      <MissionEditToolbar {...props} canUndo canRedo isDirty isApplying />,
    );
    for (const label of ["Reverse", "Undo", "Redo", "Discard changes", "Apply changes to the rover"]) {
      expect(button(label).props.disabled).toBe(true);
    }
    expect(allText()).toContain("Applying");
  });
});

describe("MissionDeckControls", () => {
  const base: DeckControlInput = {
    isMissionActive: false,
    isMissionPaused: false,
    waitingForManual: false,
    canStart: true,
    isPreparing: false,
    isEditing: false,
    isBusy: false,
    isStopping: false,
    pauseAvailable: true,
    skipAvailable: true,
    resumeAvailable: true,
    canChangeMode: true,
    mode: "auto",
  };

  const view = (
    input: Partial<DeckControlInput>,
    extra: Partial<React.ComponentProps<typeof MissionDeckControls>> = {},
  ) => {
    const merged = { ...base, ...input };
    const handlers = {
      onPrimary: jest.fn(),
      onSecondary: jest.fn(),
      onSkip: jest.fn(),
      onNext: jest.fn(),
      onSetMode: jest.fn(),
    };
    const rendered = render(
      <MissionDeckControls
        controls={getDeckControlState(merged)}
        mode={merged.mode}
        isPreparing={merged.isPreparing}
        pending={null}
        {...handlers}
        {...extra}
      />,
    );
    return { ...rendered, ...handlers };
  };

  it("idle: START MISSION is the primary button and PAUSE is shown but disabled", () => {
    const { button, allText } = view({});
    expect(allText()).toContain("START MISSION");
    expect(button("Start mission").props.disabled).toBe(false);
    expect(button("Pause mission").props.disabled).toBe(true);
    expect(button("Skip current goal").props.disabled).toBe(true);
    expect(button("Continue to next waypoint").props.disabled).toBe(true);
  });

  it("running: the primary button becomes STOP and PAUSE/SKIP are enabled", () => {
    const { button, allText } = view({ isMissionActive: true });
    expect(allText()).toContain("STOP MISSION");
    expect(button("Stop mission").props.disabled).toBe(false);
    expect(button("Pause mission").props.disabled).toBe(false);
    expect(button("Skip current goal").props.disabled).toBe(false);
    expect(button("Continue to next waypoint").props.disabled).toBe(true);
  });

  it("paused: PAUSE turns into RESUME", () => {
    const { button, allText, onSecondary } = view({
      isMissionActive: true,
      isMissionPaused: true,
    });
    expect(allText()).toContain("RESUME");
    expect(allText()).not.toContain("PAUSE");
    act(() => button("Resume mission").props.onPress());
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it("waiting for the operator: NEXT is enabled and calls onNext", () => {
    const { button, onNext } = view({
      isMissionActive: true,
      waitingForManual: true,
      mode: "manual",
    });
    expect(button("Continue to next waypoint").props.disabled).toBe(false);
    act(() => button("Continue to next waypoint").props.onPress());
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("shows the confirmed mode as selected and only switches to the other one", () => {
    const { button, onSetMode } = view({ mode: "manual" });
    expect(button("Manual mode").props.accessibilityState.selected).toBe(true);
    expect(button("Auto mode").props.accessibilityState.selected).toBe(false);

    act(() => button("Manual mode").props.onPress()); // already selected: no request
    expect(onSetMode).not.toHaveBeenCalled();
    act(() => button("Auto mode").props.onPress());
    expect(onSetMode).toHaveBeenCalledWith("auto");
  });

  it("labels the in-flight request and keeps STOP usable while another is pending", () => {
    const { button, allText } = view({ isMissionActive: true, isBusy: true }, { pending: "pause" });
    expect(button("Stop mission").props.disabled).toBe(false);
    expect(button("Pause mission").props.disabled).toBe(true);
    expect(allText()).toContain("STOP MISSION");

    const starting = view({ isBusy: true }, { pending: "start" });
    expect(starting.allText()).toContain("STARTING");
    expect(starting.button("Start mission").props.disabled).toBe(true);
  });
});
