import {
  GNSS_RATINGS,
  gnssRating,
  roundGnssMm,
} from "../gnssAccuracyTier";

describe("gnssRating", () => {
  it.each([
    [0, "excellent"],
    [20, "excellent"],
    [20.4, "excellent"],
    [20.5, "good"],
    [21, "good"],
    [35, "good"],
    [36, "poor"],
    [60, "poor"],
    [60.4, "poor"],
    [61, "failed"],
    [72, "failed"],
    [500, "failed"],
  ])("rates %p mm as %s", (mm, key) => {
    expect(gnssRating(mm)?.key).toBe(key);
  });

  it("gives no rating without a usable measurement", () => {
    expect(gnssRating(null)).toBeNull();
    expect(gnssRating(undefined)).toBeNull();
    expect(gnssRating(Number.NaN)).toBeNull();
    expect(gnssRating(Number.POSITIVE_INFINITY)).toBeNull();
    expect(gnssRating(-1)).toBeNull();
  });

  it("rates the rounded value so the printed mm and the rating agree", () => {
    expect(roundGnssMm(20.4)).toBe(20);
    expect(gnssRating(roundGnssMm(20.4))?.label).toBe("Excellent");
    expect(roundGnssMm(35.6)).toBe(36);
    expect(gnssRating(35.6)).toBe(GNSS_RATINGS.poor);
  });
});
