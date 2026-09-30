export interface RecoveryUiInput {
  recoveryRequired: boolean;
  recoveryAvailable: boolean;
  recoveryState: string;
  missionState: string;
  resumeAvailable: boolean;
  batteryLockout: boolean;
  /**
   * Rover-reported E-stop latch. The backend boots with E-stop asserted, and
   * Mission Manager withholds resume_available while it is set, so a
   * recovered mission would otherwise never offer Resume.
   */
  emergencyStopActive: boolean;
}

const HIDDEN_STATES = new Set([
  "NONE",
  "RESUMED",
  "DISCARDED",
  "RESYNCED",
]);

export function shouldShowRecovery(
  recoveryRequired: boolean,
  recoveryState: string,
): boolean {
  if (!recoveryRequired) return false;
  return !HIDDEN_STATES.has(recoveryState.trim().toUpperCase());
}

export function canResumeRecoveredMission(
  input: RecoveryUiInput,
): boolean {
  return (
    input.recoveryRequired &&
    input.recoveryAvailable &&
    input.recoveryState.trim().toUpperCase() === "READY" &&
    input.missionState.trim().toUpperCase() === "PAUSED" &&
    (input.resumeAvailable || input.emergencyStopActive) &&
    !input.batteryLockout
  );
}

export function canDiscardRecoveredMission(
  recoveryRequired: boolean,
  recoveryState: string,
): boolean {
  if (!recoveryRequired) return false;
  const stage = recoveryState.trim().toUpperCase();
  return stage === "READY" || stage === "ERROR";
}
