import React from "react";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: "Svg",
  Line: "Line",
}));
jest.mock("../../shared/AppIcon", () => ({
  AppIcon: ({ name }: { name: string }) => `[icon:${name}]`,
}));
jest.mock("../../shared/RoverIconArt", () => ({
  RoverIconArt: "RoverIconArt",
}));

import { RoverIconPicker } from "../RoverIconPicker";
import { RoverIconProvider } from "../../../context/RoverIconContext";
import {
  ROVER_ICON_STORAGE_KEY,
  type KeyValueStorage,
} from "../../../services/roverIconStorage";

const environment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

function storageWith(initial: string | null, failWrite = false) {
  const writes: string[] = [];
  const storage: KeyValueStorage = {
    getItem: async (key) => {
      expect(key).toBe(ROVER_ICON_STORAGE_KEY);
      return initial;
    },
    setItem: async (_key, value) => {
      if (failWrite) throw new Error("write failed");
      writes.push(value);
    },
  };
  return { storage, writes };
}

async function mount(storage: KeyValueStorage) {
  let renderer!: ReturnType<typeof TestRenderer.create>;
  act(() => {
    renderer = TestRenderer.create(
      <RoverIconProvider storage={storage}>
        <RoverIconPicker />
      </RoverIconProvider>,
    );
  });
  await flush();
  const option = (id: string) =>
    renderer.root.find(
      (node: any) => node.type === "TouchableOpacity" && node.props.testID === `rover-icon-${id}`,
    );
  const allText = () =>
    renderer.root
      .findAllByType("Text")
      .map((node: any) => [node.props.children].flat(Infinity).join(""))
      .join(" | ");
  const reset = () =>
    renderer.root.findAll(
      (node: any) =>
        node.type === "TouchableOpacity" &&
        node.props.accessibilityLabel === "Reset the rover icon to the default",
    );
  return { renderer, option, allText, reset };
}

describe("RoverIconPicker", () => {
  it("lists every icon as a radio choice with a label", async () => {
    const { option } = await mount(storageWith(null).storage);
    for (const id of ["amber", "solar", "clean", "classic"]) {
      const node = option(id);
      expect(node.props.accessibilityRole).toBe("radio");
      expect(String(node.props.accessibilityLabel)).toMatch(/rover icon/i);
    }
  });

  it("marks the saved icon as selected", async () => {
    const { option } = await mount(storageWith("clean").storage);
    expect(option("clean").props.accessibilityState.selected).toBe(true);
    expect(option("amber").props.accessibilityState.selected).toBe(false);
  });

  it("switches icon on tap and saves it", async () => {
    const { storage, writes } = storageWith(null);
    const { option } = await mount(storage);
    act(() => option("solar").props.onPress());
    await flush();
    expect(option("solar").props.accessibilityState.selected).toBe(true);
    expect(option("amber").props.accessibilityState.selected).toBe(false);
    expect(writes).toEqual(["solar"]);
  });

  it("offers a reset only when the icon is not the default", async () => {
    const { option, reset } = await mount(storageWith(null).storage);
    expect(reset()).toHaveLength(0);
    act(() => option("classic").props.onPress());
    await flush();
    expect(reset()).toHaveLength(1);
    act(() => reset()[0].props.onPress());
    await flush();
    expect(option("amber").props.accessibilityState.selected).toBe(true);
    expect(reset()).toHaveLength(0);
  });

  it("tells the operator when a choice could not be saved", async () => {
    const { option, allText } = await mount(storageWith(null, true).storage);
    act(() => option("clean").props.onPress());
    await flush();
    expect(allText()).toContain("could not be saved");
    expect(option("clean").props.accessibilityState.selected).toBe(true);
  });

  it("shows the preview on the map with the chosen icon", async () => {
    const { renderer, option } = await mount(storageWith("solar").storage);
    const art = renderer.root.findAll((node: any) => node.type === "RoverIconArt");
    // Four cards plus the map preview.
    expect(art).toHaveLength(5);
    expect(art[art.length - 1].props.id).toBe("solar");
    act(() => option("clean").props.onPress());
    await flush();
    const after = renderer.root.findAll((node: any) => node.type === "RoverIconArt");
    expect(after[after.length - 1].props.id).toBe("clean");
  });
});
