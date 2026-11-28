import {
  DEFAULT_TRAJECTORY_APPEARANCE,
  sanitizeTrajectoryAppearance,
  type TrajectoryAppearanceSettings,
} from "../constants/trajectoryAppearance";

export const TRAJECTORY_APPEARANCE_STORAGE_KEY = "@dyx/trajectory_appearance_v1";

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

function deviceStorage(): KeyValueStorage {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("@react-native-async-storage/async-storage").default;
}

export async function loadTrajectoryAppearance(
  storage?: KeyValueStorage,
): Promise<TrajectoryAppearanceSettings> {
  try {
    const raw = await (storage ?? deviceStorage()).getItem(
      TRAJECTORY_APPEARANCE_STORAGE_KEY,
    );
    if (!raw) {
      return { ...DEFAULT_TRAJECTORY_APPEARANCE };
    }
    const parsed = JSON.parse(raw);
    return sanitizeTrajectoryAppearance(parsed);
  } catch {
    return { ...DEFAULT_TRAJECTORY_APPEARANCE };
  }
}

export async function saveTrajectoryAppearance(
  settings: TrajectoryAppearanceSettings,
  storage?: KeyValueStorage,
): Promise<boolean> {
  try {
    const serialized = JSON.stringify(settings);
    await (storage ?? deviceStorage()).setItem(
      TRAJECTORY_APPEARANCE_STORAGE_KEY,
      serialized,
    );
    return true;
  } catch {
    return false;
  }
}
