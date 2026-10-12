/**
 * missionDeckControls — which mission buttons are shown/enabled for a given
 * rover state. Pure so the rules are unit-tested instead of buried in JSX.
 *
 * All inputs come from backend-confirmed state (mission lifecycle, execution
 * mode). The buttons only ever REQUEST an action; they never assume it worked.
 */

export type DeckPhase = "idle" | "running" | "paused" | "waiting";

export interface DeckControlInput {
  isMissionActive: boolean;
  isMissionPaused: boolean;
  /** MANUAL mode: rover reached a point and waits for the operator's NEXT. */
  waitingForManual: boolean;
  canStart: boolean;
  isPreparing: boolean;
  /** Mission edit mode is open; Start must not run an unsaved draft. */
  isEditing: boolean;
  /** Another control request is in flight (not including a STOP in flight). */
  isBusy: boolean;
  /** A STOP request is in flight. */
  isStopping: boolean;
  mode: "auto" | "manual";
}

export interface DeckControlState {
  phase: DeckPhase;
  /** START when idle, STOP otherwise. */
  primary: "start" | "stop";
  primaryEnabled: boolean;
  /** PAUSE while running/waiting, RESUME while paused. */
  secondary: "pause" | "resume";
  secondaryEnabled: boolean;
  skipEnabled: boolean;
  /** NEXT is only meaningful in MANUAL mode while waiting for the operator. */
  nextEnabled: boolean;
  modeEnabled: boolean;
}

export function getDeckPhase(
  input: Pick<
    DeckControlInput,
    "isMissionActive" | "isMissionPaused" | "waitingForManual"
  >,
): DeckPhase {
  if (input.isMissionPaused) return "paused";
  if (!input.isMissionActive) return "idle";
  return input.waitingForManual ? "waiting" : "running";
}

export function getDeckControlState(input: DeckControlInput): DeckControlState {
  const phase = getDeckPhase(input);
  const active = phase !== "idle";
  const busy = input.isBusy || input.isStopping;

  return {
    phase,
    primary: active ? "stop" : "start",
    // STOP must stay available while another request is pending; it is only
    // locked against a second STOP.
    primaryEnabled: active
      ? !input.isStopping
      : input.canStart && !input.isPreparing && !input.isEditing && !busy,
    secondary: phase === "paused" ? "resume" : "pause",
    secondaryEnabled: active && !busy,
    skipEnabled: active && !busy,
    // The backend state (WAITING_FOR_NEXT) is the authority, not the local mode.
    nextEnabled: phase === "waiting" && !busy,
    modeEnabled: !busy && !input.isPreparing,
  };
}
