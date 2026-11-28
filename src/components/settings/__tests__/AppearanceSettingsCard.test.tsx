import React from "react";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  ScrollView: "ScrollView",
  TouchableOpacity: "TouchableOpacity",
  StyleSheet: { create: (styles: unknown) => styles },
}));

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: "Svg",
  Path: "Path",
  Line: "Line",
  Circle: "Circle",
  G: "G",
  Rect: "Rect",
  Text: "SvgText",
}));

jest.mock("../../shared/AppIcon", () => ({
  AppIcon: ({ name }: { name: string }) => `[icon:${name}]`,
}));

jest.mock("../../shared/RoverIconArt", () => ({
  RoverIconArt: "RoverIconArt",
}));

import { AppearanceSettingsCard } from "../AppearanceSettingsCard";
import { RoverIconProvider } from "../../../context/RoverIconContext";
import { TrajectoryAppearanceProvider } from "../../../context/TrajectoryAppearanceContext";
import type { KeyValueStorage } from "../../../services/trajectoryAppearanceStorage";

const environment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
});

function makeMockStorage(): KeyValueStorage {
  const store = new Map<string, string>();
  return {
    getItem: jest.fn(async (key: string) => store.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

describe("AppearanceSettingsCard", () => {
  it("renders both Section 1 (Rover Vehicle Icon) and Section 2 (Trajectory Visibility)", async () => {
    const storage = makeMockStorage();
    let renderer!: ReturnType<typeof TestRenderer.create>;

    await act(async () => {
      renderer = TestRenderer.create(
        <RoverIconProvider storage={storage}>
          <TrajectoryAppearanceProvider storage={storage}>
            <AppearanceSettingsCard />
          </TrajectoryAppearanceProvider>
        </RoverIconProvider>,
      );
    });

    const allText = renderer.root
      .findAllByType("Text")
      .map((node: any) => [node.props.children].flat(Infinity).join(""))
      .join(" | ");

    expect(allText).toContain("Section 1: Rover Vehicle Icon");
    expect(allText).toContain("Section 2: Trajectory Visibility & Styling");
    expect(allText).toContain("Finished Line Style");
    expect(allText).toContain("Unfinished Line Type");
    expect(allText).toContain("Unfinished Line Color");
    expect(allText).toContain("Reaching Waypoint Target Circle");
  });

  it("renders rover icon radio choices", async () => {
    const storage = makeMockStorage();
    let renderer!: ReturnType<typeof TestRenderer.create>;

    await act(async () => {
      renderer = TestRenderer.create(
        <RoverIconProvider storage={storage}>
          <TrajectoryAppearanceProvider storage={storage}>
            <AppearanceSettingsCard />
          </TrajectoryAppearanceProvider>
        </RoverIconProvider>,
      );
    });

    for (const id of ["amber", "solar", "clean", "classic"]) {
      const node = renderer.root.find(
        (n: any) => n.type === "TouchableOpacity" && n.props.testID === `rover-icon-${id}`,
      );
      expect(node).toBeTruthy();
    }
  });
});
