import {
  DEFAULT_ROVER_ICON_ID,
  toRoverIconId,
  type RoverIconId,
} from "../constants/roverIcons";

/** Bump the suffix only if the stored value ever changes shape. */
export const ROVER_ICON_STORAGE_KEY = "@dyx/rover_icon_v1";

/**
 * The device storage is loaded on first use, not at import, so screens and
 * tests that only draw the rover never touch the native storage module.
 */
function deviceStorage(): KeyValueStorage {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("@react-native-async-storage/async-storage").default;
}

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/**
 * The saved rover icon, or the default. Reading never throws: missing, empty,
 * unknown or unreadable storage all give the default, so a bad value on the
 * device can never leave the map without a rover.
 */
export async function loadRoverIconId(
  storage?: KeyValueStorage,
): Promise<RoverIconId> {
  try {
    return toRoverIconId(
      await (storage ?? deviceStorage()).getItem(ROVER_ICON_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_ROVER_ICON_ID;
  }
}

/** True when the choice was written; false when storage refused it. */
export async function saveRoverIconId(
  id: RoverIconId,
  storage?: KeyValueStorage,
): Promise<boolean> {
  try {
    await (storage ?? deviceStorage()).setItem(ROVER_ICON_STORAGE_KEY, id);
    return true;
  } catch {
    return false;
  }
}
