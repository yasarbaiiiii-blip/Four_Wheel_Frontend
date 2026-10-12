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

export interface PauseNotice {
  /** Short headline, e.g. "Obstacle ahead". */
  title: string;
  /** One sentence telling the operator what to do or wait for. */
  detail: string;
  /** True when the rover will not accept Resume yet. */
  blocking: boolean;
}

const PAUSE_TITLES: Record<string, string> = {
  OBSTACLE: "Obstacle ahead",
  RTK_LOST: "RTK lost",
  RTK_FLOAT: "RTK float",
  RTK_FLOAT_TIMEOUT: "RTK float timeout",
  RTK_FLOAT_MANUAL: "RTK float",
};

/**
 * Banner content for the progress deck while the rover is paused.
 *
 * Returns null when nothing is paused or the rover gave no reason (a plain
 * operator pause needs no explanation). `resumeAvailable` is the rover's own
 * flag; the notice never decides that Resume is allowed.
 */
export function pauseNotice(
  isPaused: boolean,
  pauseReason: string | null | undefined,
  rtkReason?: string | null,
  resumeAvailable?: boolean,
): PauseNotice | null {
  const reason = (pauseReason ?? "").trim().toUpperCase();
  if (!isPaused || !reason) return null;
  const title = PAUSE_TITLES[reason] ?? `Paused: ${reason}`;
  if (resumeAvailable === true) {
    return { title, detail: "Resume is available.", blocking: false };
  }
  return {
    title,
    detail: pauseReasonText(reason, rtkReason).blockedMessage,
    blocking: true,
  };
}
