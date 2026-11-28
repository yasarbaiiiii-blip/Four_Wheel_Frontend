import {
  DEFAULT_TRAJECTORY_APPEARANCE,
  type TrajectoryAppearanceSettings,
} from "../../constants/trajectoryAppearance";
import {
  loadTrajectoryAppearance,
  saveTrajectoryAppearance,
  TRAJECTORY_APPEARANCE_STORAGE_KEY,
  type KeyValueStorage,
} from "../trajectoryAppearanceStorage";

describe("Trajectory Appearance Storage", () => {
  function makeMockStorage(initial: Record<string, string> = {}): KeyValueStorage {
    const store = new Map<string, string>(Object.entries(initial));
    return {
      getItem: jest.fn(async (key: string) => store.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    };
  }

  it("returns defaults when storage is empty", async () => {
    const storage = makeMockStorage();
    const result = await loadTrajectoryAppearance(storage);
    expect(result).toEqual(DEFAULT_TRAJECTORY_APPEARANCE);
  });

  it("loads and sanitizes stored settings correctly", async () => {
    const custom: TrajectoryAppearanceSettings = {
      finishedLine: "solid-blue",
      unfinishedType: "dots",
      unfinishedColor: "indigo",
      finishedPoints: "green",
      unfinishedPoints: "blue",
      rtkRibbon: "on",
      targetCircle: "precision-circle",
    };
    const storage = makeMockStorage({
      [TRAJECTORY_APPEARANCE_STORAGE_KEY]: JSON.stringify(custom),
    });
    const result = await loadTrajectoryAppearance(storage);
    expect(result).toEqual(custom);
  });

  it("saves settings to storage key", async () => {
    const storage = makeMockStorage();
    const custom: TrajectoryAppearanceSettings = {
      ...DEFAULT_TRAJECTORY_APPEARANCE,
      finishedLine: "solid-green",
    };
    const ok = await saveTrajectoryAppearance(custom, storage);
    expect(ok).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(
      TRAJECTORY_APPEARANCE_STORAGE_KEY,
      JSON.stringify(custom),
    );
  });

  it("handles storage write error gracefully without throwing", async () => {
    const failingStorage: KeyValueStorage = {
      getItem: jest.fn(async () => null),
      setItem: jest.fn(async () => {
        throw new Error("Disk full");
      }),
    };
    const ok = await saveTrajectoryAppearance(
      DEFAULT_TRAJECTORY_APPEARANCE,
      failingStorage,
    );
    expect(ok).toBe(false);
  });
});
