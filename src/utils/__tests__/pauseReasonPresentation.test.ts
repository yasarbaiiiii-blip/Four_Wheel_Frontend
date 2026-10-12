import { pauseNotice, pauseReasonText } from "../pauseReasonPresentation";

describe("pauseReasonText", () => {
  it("names an obstacle pause instead of a generic block", () => {
    const text = pauseReasonText("OBSTACLE");
    expect(text.blockedLabel).toBe("OBSTACLE AHEAD");
    expect(text.blockedMessage).toMatch(/Clear the path/);
  });

  it("keeps the RTK_LOST label and prefers the rover's RTK reason", () => {
    expect(pauseReasonText("RTK_LOST", "Correction age 12 s")).toEqual({
      blockedLabel: "WAIT RTK",
      blockedMessage: "Correction age 12 s",
    });
  });

  it("explains that an RTK FLOAT pause resumes by itself", () => {
    const text = pauseReasonText("rtk_float");
    expect(text.blockedLabel).toBe("WAIT RTK FIX");
    expect(text.blockedMessage).toMatch(/resumes by itself/);
  });

  it("asks for a manual resume after an RTK FLOAT timeout", () => {
    expect(pauseReasonText("RTK_FLOAT_TIMEOUT").blockedMessage).toMatch(/manually/);
  });

  it("does not show an RTK reason for a non-RTK pause", () => {
    expect(pauseReasonText("OBSTACLE", "RTK FIXED").blockedMessage).not.toMatch(/RTK/);
  });

  it("falls back to the raw reason for unknown pauses", () => {
    expect(pauseReasonText("ODOM_STALE")).toEqual({
      blockedLabel: "RESUME BLOCKED",
      blockedMessage: "Resume blocked: ODOM_STALE",
    });
    expect(pauseReasonText(null).blockedLabel).toBe("RESUME BLOCKED");
  });
});

describe("pauseNotice", () => {
  it("is null when the mission is not paused", () => {
    expect(pauseNotice(false, "OBSTACLE")).toBeNull();
  });

  it("is null for a plain operator pause with no rover reason", () => {
    expect(pauseNotice(true, null)).toBeNull();
    expect(pauseNotice(true, "  ")).toBeNull();
  });

  it("names the reason and blocks Resume until the rover allows it", () => {
    const notice = pauseNotice(true, "obstacle", null, false);
    expect(notice).toEqual({
      title: "Obstacle ahead",
      detail: "Obstacle ahead. Clear the path; Resume unlocks when it is clear.",
      blocking: true,
    });
  });

  it("uses the rover's RTK reason for an RTK pause", () => {
    expect(pauseNotice(true, "RTK_LOST", "Correction age 12 s")?.detail).toBe(
      "Correction age 12 s",
    );
  });

  it("stops blocking once the rover reports Resume available", () => {
    expect(pauseNotice(true, "RTK_FLOAT", null, true)).toEqual({
      title: "RTK float",
      detail: "Resume is available.",
      blocking: false,
    });
  });

  it("falls back to the raw reason for unknown pauses", () => {
    expect(pauseNotice(true, "ODOM_STALE")?.title).toBe("Paused: ODOM_STALE");
  });
});
