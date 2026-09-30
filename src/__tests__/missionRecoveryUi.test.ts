import {
  canDiscardRecoveredMission,
  canResumeRecoveredMission,
  shouldShowRecovery,
} from "../utils/missionRecoveryUi";

describe("missionRecoveryUi", () => {
  test("shows only unresolved recovery states", () => {
    expect(shouldShowRecovery(true, "CHECKING")).toBe(true);
    expect(shouldShowRecovery(true, "READY")).toBe(true);
    expect(shouldShowRecovery(true, "ERROR")).toBe(true);
    expect(shouldShowRecovery(false, "READY")).toBe(false);
    expect(shouldShowRecovery(true, "RESUMED")).toBe(false);
    expect(shouldShowRecovery(true, "RESYNCED")).toBe(false);
  });

  test("resume requires backend READY + PAUSED and no battery lockout", () => {
    const base = {
      recoveryRequired: true,
      recoveryAvailable: true,
      recoveryState: "READY",
      missionState: "PAUSED",
      resumeAvailable: true,
      batteryLockout: false,
    };

    expect(canResumeRecoveredMission(base)).toBe(true);
    expect(
      canResumeRecoveredMission({
        ...base,
        batteryLockout: true,
      }),
    ).toBe(false);
    expect(
      canResumeRecoveredMission({
        ...base,
        recoveryAvailable: false,
      }),
    ).toBe(false);
  });

  test("discard is offered after recovery is ready or failed", () => {
    expect(canDiscardRecoveredMission(true, "READY")).toBe(true);
    expect(canDiscardRecoveredMission(true, "ERROR")).toBe(true);
    expect(canDiscardRecoveredMission(true, "PREPARING")).toBe(false);
  });
});
