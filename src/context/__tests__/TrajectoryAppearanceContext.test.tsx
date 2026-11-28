import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import { DEFAULT_TRAJECTORY_APPEARANCE } from "../../constants/trajectoryAppearance";
import {
  TrajectoryAppearanceProvider,
  useTrajectoryAppearance,
} from "../TrajectoryAppearanceContext";
import type { KeyValueStorage } from "../../services/trajectoryAppearanceStorage";

function makeMockStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: jest.fn(async (key: string) => store.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

function Consumer({ onValue }: { onValue: (v: any) => void }) {
  const value = useTrajectoryAppearance();
  onValue(value);
  return null;
}

describe("TrajectoryAppearanceContext", () => {
  it("provides defaults initially and loads storage value", async () => {
    let captured: any = null;
    const storage = makeMockStorage();

    await act(async () => {
      TestRenderer.create(
        <TrajectoryAppearanceProvider storage={storage}>
          <Consumer onValue={(v) => { captured = v; }} />
        </TrajectoryAppearanceProvider>,
      );
    });

    expect(captured.isReady).toBe(true);
    expect(captured.settings).toEqual(DEFAULT_TRAJECTORY_APPEARANCE);
  });

  it("updates settings and saves to storage", async () => {
    let captured: any = null;
    const storage = makeMockStorage();

    await act(async () => {
      TestRenderer.create(
        <TrajectoryAppearanceProvider storage={storage}>
          <Consumer onValue={(v) => { captured = v; }} />
        </TrajectoryAppearanceProvider>,
      );
    });

    await act(async () => {
      captured.updateSettings({ finishedLine: "solid-blue", rtkRibbon: "on" });
    });

    expect(captured.settings.finishedLine).toBe("solid-blue");
    expect(captured.settings.rtkRibbon).toBe("on");
    expect(storage.setItem).toHaveBeenCalled();
  });

  it("applies presets correctly", async () => {
    let captured: any = null;
    const storage = makeMockStorage();

    await act(async () => {
      TestRenderer.create(
        <TrajectoryAppearanceProvider storage={storage}>
          <Consumer onValue={(v) => { captured = v; }} />
        </TrajectoryAppearanceProvider>,
      );
    });

    await act(async () => {
      captured.applyPreset("style7");
    });
    expect(captured.settings.finishedLine).toBe("solid-blue");
    expect(captured.settings.targetCircle).toBe("pulse-ring");

    await act(async () => {
      captured.applyPreset("classicGreen");
    });
    expect(captured.settings.finishedLine).toBe("solid-green");
    expect(captured.settings.finishedPoints).toBe("green");

    await act(async () => {
      captured.resetSettings();
    });
    expect(captured.settings).toEqual(DEFAULT_TRAJECTORY_APPEARANCE);
  });
});
