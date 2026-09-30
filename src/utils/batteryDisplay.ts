/**
 * Shared battery display thresholds for the entire GCS.
 *
 * Display and color use the same whole percentage:
 *   30..100% -> GREEN
 *   11..29%  -> YELLOW
 *   10%      -> RED
 *   invalid  -> UNKNOWN
 *
 * The rover backend is the battery-percentage authority. It derives a smooth
 * whole-number percentage from measured pack voltage.
 */
export type BatteryDisplayBand = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export interface BatteryDisplayPalette {
  green: string;
  yellow: string;
  red: string;
  unknown: string;
}

export function getWholeBatteryPercentage(
  percentage: number | null | undefined,
): number | null {
  if (typeof percentage !== 'number' || !Number.isFinite(percentage)) {
    return null;
  }

  return Math.round(Math.max(0, Math.min(100, percentage)));
}

export function getBatteryDisplayBand(
  percentage: number | null | undefined,
): BatteryDisplayBand {
  const wholePercentage = getWholeBatteryPercentage(percentage);

  if (wholePercentage === null) return 'UNKNOWN';
  if (wholePercentage <= 10) return 'RED';
  if (wholePercentage <= 29) return 'YELLOW';
  return 'GREEN';
}

export function getBatteryDisplayColor(
  percentage: number | null | undefined,
  palette: BatteryDisplayPalette,
): string {
  const band = getBatteryDisplayBand(percentage);

  if (band === 'GREEN') return palette.green;
  if (band === 'YELLOW') return palette.yellow;
  if (band === 'RED') return palette.red;
  return palette.unknown;
}
