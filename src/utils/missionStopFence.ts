/**
 * Decides which mission status replies may reach the screen around a Stop.
 *
 * request_in_flight: only a terminal state is accepted, so a reply that was
 * already on its way cannot overwrite the Stop.
 * awaiting_fresh_status: the Stop has been answered or has failed. Replies from
 * before that point are dropped through the generation counter, and the next
 * status requested after it is the truth, whatever its state. Keeping this phase
 * open to fresh status is what stops a failed request freezing the deck.
 */

export type StopFencePhase = "idle" | "request_in_flight" | "awaiting_fresh_status";

const STOP_TERMINAL_STATES = ["STOPPED", "ERROR", "FAULT"];

export function isStopTerminalState(state: unknown): boolean {
  return STOP_TERMINAL_STATES.includes(String(state ?? "").trim().toUpperCase());
}

export function admitMissionStatus(
  phase: StopFencePhase,
  state: unknown,
  isFresh: boolean,
): boolean {
  if (phase === "idle" || isStopTerminalState(state)) return true;
  return phase === "awaiting_fresh_status" && isFresh;
}

export const STOP_STATUS_RETRY_DELAYS_MS = [0, 500, 1500];

export interface StopCommandDeps<R extends { success?: boolean }, M, F> {
  generationRef: { current: number };
  phaseRef: { current: StopFencePhase };
  stop: () => Promise<R>;
  fetchStatus: () => Promise<{ success?: boolean; mission?: M | null } | null | undefined>;
  applyFreshStatus: (mission: M) => void;
  shouldContinue: () => boolean;
  onRecorded: (response: R) => void;
  onRefused: (response: R) => void;
  onFailed: (error: unknown) => F;
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends Stop and then looks for fresh status in the background. `result` does not
 * wait for that status, so slow status requests never hold the Stop button locked.
 * If every attempt fails the phase stays open and the next poll or socket packet
 * releases it.
 */
export async function runStopCommand<R extends { success?: boolean }, M, F>(
  deps: StopCommandDeps<R, M, F>,
): Promise<{ result: R | F; confirmation: Promise<void> }> {
  const { generationRef, phaseRef } = deps;
  const requestGeneration = ++generationRef.current;
  phaseRef.current = "request_in_flight";

  let result: R | F;
  let report: () => void;
  try {
    const response = await deps.stop();
    result = response;
    report = () => (response.success ? deps.onRecorded(response) : deps.onRefused(response));
  } catch (error) {
    const failed = deps.onFailed(error);
    result = failed;
    report = () => undefined;
  }

  // A newer Stop now owns the fence.
  if (requestGeneration !== generationRef.current) {
    return { result, confirmation: Promise.resolve() };
  }

  const statusGeneration = ++generationRef.current;
  if (phaseRef.current === "request_in_flight") {
    phaseRef.current = "awaiting_fresh_status";
  }
  report();

  const confirm = async () => {
    const sleep = deps.sleep ?? defaultSleep;
    for (const delayMs of deps.retryDelaysMs ?? STOP_STATUS_RETRY_DELAYS_MS) {
      if (delayMs > 0) await sleep(delayMs);
      if (statusGeneration !== generationRef.current || !deps.shouldContinue()) return;
      try {
        const status = await deps.fetchStatus();
        if (statusGeneration !== generationRef.current) return;
        if (status?.success && status.mission) {
          deps.applyFreshStatus(status.mission);
          return;
        }
      } catch (error) {
        console.warn("[missionStopFence] Status after Stop failed:", error);
      }
    }
  };

  return { result, confirmation: confirm() };
}
