/**
 * Shared battery display thresholds for the entire GCS.
 *
 * 30..100%  -> GREEN
 * >10..<30% -> YELLOW
 * 0..10%    -> RED
 * invalid   -> UNKNOWN
 *
 * PX4/backend remains the battery-percentage authority. This file controls
 * presentation only; it does not estimate state-of-charge from voltage.
 */
export type BatteryDisplayBand = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export interface BatteryDisplayPalette {
  green: string;
  yellow: string;
  red: string;
  unknown: string;
}

export function getBatteryDisplayBand(
  percentage: number | null | undefined,
): BatteryDisplayBand {
  if (typeof percentage !== 'number' || !Number.isFinite(percentage)) {
    return 'UNKNOWN';
  }

  const bounded = Math.max(0, Math.min(100, percentage));

  if (bounded <= 10) return 'RED';
  if (bounded < 30) return 'YELLOW';
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
