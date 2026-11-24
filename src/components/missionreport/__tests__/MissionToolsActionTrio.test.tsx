import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { MissionToolsActionTrio } from "../MissionToolsActionTrio";

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
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

function renderTrio(hasMissionLoaded = true) {
  const props = {
    hasMissionLoaded,
    onUpload: jest.fn(),
    onOpenExtension: jest.fn(),
    onOpenExport: jest.fn(),
  };
  let renderer: any;
  act(() => {
    renderer = TestRenderer.create(<MissionToolsActionTrio {...props} />);
  });
  const button = (label: string) =>
    renderer!.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === label,
    );
  const labels = () =>
    renderer!.root
      .findAll((node: any) => node.type === "TouchableOpacity")
      .map((node: any) => node.props.accessibilityLabel);
  return { props, button, labels };
}

describe("MissionToolsActionTrio", () => {
  it("shows exactly Upload, Extension and Export actions without Load", () => {
    const { labels } = renderTrio();
    expect(labels()).toEqual([
      "Upload mission plan",
      "Open mission extension tools",
      "Open export and logs menu",
    ]);
    expect(labels()).not.toContain("Load mission plan");
  });

  it("routes all three controls to their handlers", () => {
    const { props, button } = renderTrio();
    act(() => button("Upload mission plan").props.onPress());
    act(() => button("Open mission extension tools").props.onPress());
    act(() => button("Open export and logs menu").props.onPress());
    expect(props.onUpload).toHaveBeenCalledTimes(1);
    expect(props.onOpenExtension).toHaveBeenCalledTimes(1);
    expect(props.onOpenExport).toHaveBeenCalledTimes(1);
  });

  it("keeps Extension disabled until a mission is available", () => {
    const { button } = renderTrio(false);
    expect(button("Open mission extension tools").props.disabled).toBe(true);
    expect(button("Upload mission plan").props.disabled).not.toBe(true);
    expect(button("Open export and logs menu").props.disabled).not.toBe(true);
  });
});
