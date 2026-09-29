/**
 * Operator-facing text for mission_manager pause reasons.
 *
 * `resumeAvailable` comes from the rover; this only chooses the words shown
 * on the Resume button and in the "resume blocked" toast.
 */

export interface PauseReasonText {
  /** Button label while Resume is not yet available. */
  blockedLabel: string;
  /** Toast shown when Resume is pressed while blocked. */
  blockedMessage: string;
}

export function pauseReasonText(
  pauseReason: string | null | undefined,
  rtkReason?: string | null,
): PauseReasonText {
  const reason = (pauseReason ?? "").trim().toUpperCase();
  switch (reason) {
    case "OBSTACLE":
      return {
        blockedLabel: "OBSTACLE AHEAD",
        blockedMessage:
          "Obstacle ahead. Clear the path; Resume unlocks when it is clear.",
      };
    case "RTK_LOST":
      return {
        blockedLabel: "WAIT RTK",
        blockedMessage: rtkReason || "Waiting for RTK FIXED and healthy corrections.",
      };
    case "RTK_FLOAT":
      return {
        blockedLabel: "WAIT RTK FIX",
        blockedMessage:
          "RTK FLOAT: the mission resumes by itself after 3 s of RTK FIXED.",
      };
    case "RTK_FLOAT_TIMEOUT":
    case "RTK_FLOAT_MANUAL":
      return {
        blockedLabel: "WAIT RTK",
        blockedMessage:
          rtkReason || "RTK stayed FLOAT. Resume manually once RTK is FIXED.",
      };
    case "":
      return {
        blockedLabel: "RESUME BLOCKED",
        blockedMessage: "Resume is not available yet.",
      };
    default:
      return {
        blockedLabel: "RESUME BLOCKED",
        blockedMessage: `Resume blocked: ${reason}`,
      };
  }
}
