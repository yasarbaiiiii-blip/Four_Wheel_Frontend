/**
 * Rover icon choices the operator can pick in Settings > Rover Icon.
 *
 * The artwork is drawn in code (RoverIconArt.tsx), so there are no image files
 * to ship and every icon stays sharp at any size. Ids are stored on the device,
 * so never rename or reuse one; add a new id instead.
 */

export type RoverIconId = "amber" | "solar" | "clean" | "classic";

export interface RoverIconOption {
  id: RoverIconId;
  name: string;
  description: string;
}

export const DEFAULT_ROVER_ICON_ID: RoverIconId = "amber";

export const ROVER_ICON_OPTIONS: readonly RoverIconOption[] = [
  {
    id: "amber",
    name: "Amber",
    description: "Amber body, dark panel and a sensor ring.",
  },
  {
    id: "solar",
    name: "Solar",
    description: "Orange body with a blue solar panel grid.",
  },
  {
    id: "clean",
    name: "Clean",
    description: "White body with a green outline and spray bar.",
  },
  {
    id: "classic",
    name: "Classic",
    description: "The original small yellow marker.",
  },
];

const KNOWN_IDS: ReadonlySet<string> = new Set(
  ROVER_ICON_OPTIONS.map((option) => option.id),
);

export function isRoverIconId(value: unknown): value is RoverIconId {
  return typeof value === "string" && KNOWN_IDS.has(value);
}

/** A stored or received value as a usable id; anything unknown is the default. */
export function toRoverIconId(value: unknown): RoverIconId {
  return isRoverIconId(value) ? value : DEFAULT_ROVER_ICON_ID;
}

export function getRoverIconOption(id: RoverIconId): RoverIconOption {
  return (
    ROVER_ICON_OPTIONS.find((option) => option.id === id) ??
    ROVER_ICON_OPTIONS[0]
  );
}
