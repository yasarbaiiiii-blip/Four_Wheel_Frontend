/**
 * missionDeckControls — which mission buttons are shown/enabled for a given
 * rover state. Pure so the rules are unit-tested instead of buried in JSX.
 *
 * All inputs come from backend-confirmed state (mission lifecycle, execution
 * mode). The buttons only ever REQUEST an action; they never assume it worked.
 */

export type DeckPhase = "idle" | "starting" | "running" | "paused" | "waiting";

export interface DeckControlInput {
  /** Backend state; an unknown state keeps STOP reachable. */
  state?: string | null;
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
  isStarting?: boolean;
  pauseAvailable?: boolean;
  skipAvailable?: boolean;
  resumeAvailable?: boolean;
  canChangeMode?: boolean;
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
  input: Pick<DeckControlInput, "isMissionActive" | "isMissionPaused" | "waitingForManual" | "state" | "isStarting">,
): DeckPhase {
  if (input.isStarting) return "starting";
  const state = input.state?.trim().toUpperCase();
  if (state === "PAUSED") return "paused";
  if (state === "WAITING_FOR_NEXT") return "waiting";
  if (state === "RUNNING" || state === "APPROACHING" || state === "VERIFY_HOLD" || state === "SPRAY_ACK" || state === "RESOLVED") return "running";
  if (state && !["EMPTY", "READY", "COMPLETED", "STOPPED", "ERROR", "FAILED", "UNLOADED", "FINISHED", "FAULT"].includes(state)) return "running";
  if (state) return "idle";
  if (input.isMissionPaused) return "paused";
  if (!input.isMissionActive) return "idle";
  return input.waitingForManual ? "waiting" : "running";
}

export function getDeckControlState(input: DeckControlInput): DeckControlState {
  const phase = getDeckPhase(input);
  const active = phase !== "idle";
  const busy = input.isBusy || input.isStopping;
  const backendState = input.state?.trim().toUpperCase();
  const knownMoving = !backendState || ["RUNNING", "APPROACHING", "VERIFY_HOLD", "SPRAY_ACK", "RESOLVED"].includes(backendState);
  const startStateReady = !backendState || backendState === "READY";

  return {
    phase,
    primary: active ? "stop" : "start",
    // STOP must stay available while another request is pending; it is only
    // locked against a second STOP.
    primaryEnabled: active
      ? !input.isStopping
      : startStateReady && input.canStart && !input.isPreparing && !input.isEditing && !busy,
    secondary: phase === "paused" ? "resume" : "pause",
    secondaryEnabled: phase === "paused"
      ? input.resumeAvailable === true && !busy
      : phase === "running" && knownMoving && input.pauseAvailable === true && !busy,
    skipEnabled: phase === "running" && knownMoving && input.skipAvailable === true && !busy,
    // The backend state (WAITING_FOR_NEXT) is the authority, not the local mode.
    nextEnabled: phase === "waiting" && !busy,
    modeEnabled: phase === "idle" && input.canChangeMode === true && !busy && !input.isPreparing,
  };
}
