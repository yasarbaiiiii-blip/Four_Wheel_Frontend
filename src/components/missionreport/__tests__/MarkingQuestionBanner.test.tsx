import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { MarkingQuestionBanner } from "../MarkingQuestionBanner";

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

describe("MarkingQuestionBanner", () => {
  it("renders nothing when visible is false", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <MarkingQuestionBanner
          visible={false}
          pointId="P0003"
          radialMm={33}
          onAnswer={jest.fn()}
        />,
      );
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it("renders point name and radial distance when visible", () => {
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <MarkingQuestionBanner
          visible={true}
          pointId="P0003"
          radialMm={34.2}
          onAnswer={jest.fn()}
        />,
      );
    });
    const textNodes = renderer.root
      .findAll((node: any) => node.type === "Text")
      .map((n: any) => n.children)
      .flat();
    const joined = textNodes.join(" ");
    expect(joined).toContain("P0003");
    expect(joined).toContain("34 mm");
    expect(joined).toContain("Mark Anyway");
    expect(joined).toContain("Skip Point");
  });

  it("calls onAnswer(true) when Mark Anyway button is pressed", async () => {
    const onAnswer = jest.fn().mockResolvedValue(undefined);
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <MarkingQuestionBanner
          visible={true}
          pointId="P0003"
          radialMm={33}
          onAnswer={onAnswer}
        />,
      );
    });

    const markBtn = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Mark Anyway",
    );

    await act(async () => {
      markBtn.props.onPress();
    });

    expect(onAnswer).toHaveBeenCalledWith(true);
  });

  it("calls onAnswer(false) when Skip Point button is pressed", async () => {
    const onAnswer = jest.fn().mockResolvedValue(undefined);
    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(
        <MarkingQuestionBanner
          visible={true}
          pointId="P0003"
          radialMm={33}
          onAnswer={onAnswer}
        />,
      );
    });

    const skipBtn = renderer.root.find(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Skip Point",
    );

    await act(async () => {
      skipBtn.props.onPress();
    });

    expect(onAnswer).toHaveBeenCalledWith(false);
  });
});
