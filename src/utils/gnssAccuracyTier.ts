/**
 * GNSS accuracy rating used in mission reports.
 *
 * Same limits as the progress deck (`commandAccuracyTier`):
 *   Excellent  up to 20 mm
 *   Good       over 20, up to 35 mm
 *   Poor       over 35, up to 60 mm
 *   Failed     over 60 mm
 *
 * The value rated is the backend's raw-GNSS radial error. It is rounded to
 * whole millimetres first, so the number printed in the report and its rating
 * can never disagree (20.4 mm prints as 20 mm and rates Excellent).
 */

export type GnssRatingKey = "excellent" | "good" | "poor" | "failed";

export interface GnssRating {
  key: GnssRatingKey;
  label: string;
  /** Solid colour for dots, bars and text. */
  color: string;
  /** Soft background for pills and cells. */
  background: string;
  /** Readable text colour on `background`. */
  ink: string;
}

export const GNSS_RATING_ORDER: readonly GnssRatingKey[] = [
  "excellent",
  "good",
  "poor",
  "failed",
];

export const GNSS_RATINGS: Record<GnssRatingKey, GnssRating> = {
  excellent: {
    key: "excellent",
    label: "Excellent",
    color: "#16B980",
    background: "#E6F8F1",
    ink: "#0B7A57",
  },
  good: {
    key: "good",
    label: "Good",
    color: "#1475EE",
    background: "#E8F1FE",
    ink: "#0F55B3",
  },
  poor: {
    key: "poor",
    label: "Poor",
    color: "#F08A24",
    background: "#FEF1E2",
    ink: "#A35A0C",
  },
  failed: {
    key: "failed",
    label: "Failed",
    color: "#D94A42",
    background: "#FCEAE8",
    ink: "#A82B24",
  },
};

export const GNSS_LIMITS_MM = { excellent: 20, good: 35, poor: 60 } as const;

/** Operator-facing range text for each rating. */
export const GNSS_RATING_RANGE: Record<GnssRatingKey, string> = {
  excellent: "up to 20 mm",
  good: "20 to 35 mm",
  poor: "35 to 60 mm",
  failed: "over 60 mm",
};

/** Whole-millimetre value to print, or null when there is no measurement. */
export function roundGnssMm(mm: number | null | undefined): number | null {
  if (typeof mm !== "number" || !Number.isFinite(mm) || mm < 0) return null;
  return Math.round(mm);
}

/** Rating for a measured error in mm, or null when there is no measurement. */
export function gnssRating(mm: number | null | undefined): GnssRating | null {
  const rounded = roundGnssMm(mm);
  if (rounded === null) return null;
  if (rounded <= GNSS_LIMITS_MM.excellent) return GNSS_RATINGS.excellent;
  if (rounded <= GNSS_LIMITS_MM.good) return GNSS_RATINGS.good;
  if (rounded <= GNSS_LIMITS_MM.poor) return GNSS_RATINGS.poor;
  return GNSS_RATINGS.failed;
}
