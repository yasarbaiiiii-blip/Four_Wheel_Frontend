import React from "react";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  StyleSheet: { create: (styles: unknown) => styles, absoluteFillObject: {} },
  TouchableOpacity: "TouchableOpacity",
  Pressable: "Pressable",
  Animated: {
    View: "Animated.View",
    Value: jest.fn(() => ({ interpolate: jest.fn() })),
    spring: jest.fn(() => ({ start: (cb?: any) => cb && cb() })),
    timing: jest.fn(() => ({ start: (cb?: any) => cb && cb() })),
    parallel: jest.fn(() => ({ start: (cb?: any) => cb && cb() })),
  },
}));

jest.mock("@expo/vector-icons", () => ({
  MaterialCommunityIcons: "MaterialCommunityIcons",
}));

import { RadialOrbitDial, type OrbitClusterMember } from "../RadialOrbitDial";

describe("RadialOrbitDial", () => {
  const sampleMembers: OrbitClusterMember[] = [
    { sn: 1, sequence: 1, status: "completed", lat: 13.0827, lon: 80.2707 },
    { sn: 2, sequence: 2, status: "active", active: true, lat: 13.0827, lon: 80.2707 },
    { sn: 3, sequence: 3, status: "pending", lat: 13.0827, lon: 80.2707 },
  ];

  it("does not render when visible is false", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    act(() => {
      tree = TestRenderer.create(
        <RadialOrbitDial visible={false} members={sampleMembers} onClose={jest.fn()} />
      );
    });
    expect(tree!.toJSON()).toBeNull();
  });

  it("renders all satellite nodes and center count when visible", () => {
    let tree: ReturnType<typeof TestRenderer.create>;
    act(() => {
      tree = TestRenderer.create(
        <RadialOrbitDial visible={true} members={sampleMembers} onClose={jest.fn()} />
      );
    });

    const root = tree!.root;
    // Check satellite nodes
    const touchables = root.findAllByType("TouchableOpacity");
    const satellites = touchables.filter((t: any) => t.props.accessibilityLabel && t.props.accessibilityLabel.startsWith("Waypoint"));
    expect(satellites.length).toBe(3);

    // Check center count text
    const centerCount = root.find((node: any) => node.props.children === "3×");
    expect(centerCount).toBeTruthy();
  });

  it("calls onSelectMember when a satellite node is pressed", () => {
    const handleSelect = jest.fn();
    let tree: ReturnType<typeof TestRenderer.create>;
    act(() => {
      tree = TestRenderer.create(
        <RadialOrbitDial visible={true} members={sampleMembers} onSelectMember={handleSelect} onClose={jest.fn()} />
      );
    });

    const root = tree!.root;
    const touchables = root.findAllByType("TouchableOpacity");
    // Find the first satellite touchable (accessibilityLabel="Waypoint 1")
    const sat1 = touchables.find((t: any) => t.props.accessibilityLabel === "Waypoint 1");
    expect(sat1).toBeTruthy();

    act(() => {
      sat1!.props.onPress();
    });

    expect(handleSelect).toHaveBeenCalledWith(sampleMembers[0]);
  });

  it("calls onClose when close button or backdrop is pressed", () => {
    const handleClose = jest.fn();
    let tree: ReturnType<typeof TestRenderer.create>;
    act(() => {
      tree = TestRenderer.create(
        <RadialOrbitDial visible={true} members={sampleMembers} onClose={handleClose} />
      );
    });

    const root = tree!.root;
    const closeBtn = root.find((node: any) => node.props.accessibilityLabel === "Close dial");
    expect(closeBtn).toBeTruthy();

    act(() => {
      closeBtn.props.onPress();
    });

    expect(handleClose).toHaveBeenCalled();
  });
});
