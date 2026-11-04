import {
  getDeckControlState,
  getDeckPhase,
  type DeckControlInput,
} from "../missionDeckControls";

const base: DeckControlInput = {
  isMissionActive: false,
  isMissionPaused: false,
  waitingForManual: false,
  canStart: true,
  isPreparing: false,
  isEditing: false,
  isBusy: false,
  isStopping: false,
  pauseAvailable: true,
  skipAvailable: true,
  resumeAvailable: true,
  canChangeMode: true,
  mode: "auto",
};

const state = (overrides: Partial<DeckControlInput>) =>
  getDeckControlState({ ...base, ...overrides });

describe("deck phase", () => {
  it("derives idle / running / paused / waiting", () => {
    expect(getDeckPhase(base)).toBe("idle");
    expect(getDeckPhase({ ...base, isStarting: true })).toBe("starting");
    expect(getDeckPhase({ ...base, isMissionActive: true })).toBe("running");
    expect(getDeckPhase({ ...base, isMissionActive: true, isMissionPaused: true })).toBe("paused");
    expect(getDeckPhase({ ...base, isMissionActive: true, waitingForManual: true })).toBe("waiting");
  });
});

describe("idle", () => {
  it("shows START, enabled only when the rover says the mission can start", () => {
    expect(state({})).toMatchObject({ primary: "start", primaryEnabled: true });
    expect(state({ canStart: false }).primaryEnabled).toBe(false);
    expect(state({ isPreparing: true }).primaryEnabled).toBe(false);
  });

  it("disables pause, skip and next", () => {
    expect(state({})).toMatchObject({
      secondaryEnabled: false,
      skipEnabled: false,
      nextEnabled: false,
    });
  });

  it("blocks START while an unsaved edit is open", () => {
    expect(state({ isEditing: true }).primaryEnabled).toBe(false);
  });
});

describe("running", () => {
  const running = { isMissionActive: true };

  it("turns the primary button into STOP and offers PAUSE and SKIP, not NEXT", () => {
    expect(state(running)).toMatchObject({
      phase: "running",
      primary: "stop",
      primaryEnabled: true,
      secondary: "pause",
      secondaryEnabled: true,
      skipEnabled: true,
      nextEnabled: false,
    });
  });
});

describe("paused", () => {
  it("keeps STOP and swaps PAUSE for RESUME", () => {
    expect(state({ isMissionActive: true, isMissionPaused: true })).toMatchObject({
      phase: "paused",
      primary: "stop",
      secondary: "resume",
      secondaryEnabled: true,
    });
  });
  it("requires the backend resume flag", () => {
    expect(state({ state: "PAUSED", resumeAvailable: false }).secondaryEnabled).toBe(false);
  });
});

describe("waiting for the operator (MANUAL point mode)", () => {
  it("enables NEXT, driven by backend state rather than the local mode", () => {
    const waiting = { isMissionActive: true, waitingForManual: true };
    expect(state({ ...waiting, mode: "manual" }).nextEnabled).toBe(true);
    expect(state({ ...waiting, mode: "auto" }).nextEnabled).toBe(true);
  });
  it("uses backend state, even when a local waiting flag is stale", () => {
    expect(state({ state: "READY", waitingForManual: true }).nextEnabled).toBe(false);
    expect(state({ state: "WAITING_FOR_NEXT", waitingForManual: false }).nextEnabled).toBe(true);
    expect(state({ state: "WAITING_FOR_NEXT" }).skipEnabled).toBe(false);
  });
});

describe("request in flight", () => {
  const running = { isMissionActive: true };

  it("locks pause, skip, next and mode while another request is pending", () => {
    expect(state({ ...running, waitingForManual: true, isBusy: true })).toMatchObject({
      secondaryEnabled: false,
      skipEnabled: false,
      nextEnabled: false,
      modeEnabled: false,
    });
  });

  it("keeps STOP available during another pending request", () => {
    expect(state({ ...running, isBusy: true }).primaryEnabled).toBe(true);
  });

  it("only locks STOP against a second STOP", () => {
    expect(state({ ...running, isStopping: true }).primaryEnabled).toBe(false);
  });

  it("locks START while a request is pending", () => {
    expect(state({ isBusy: true }).primaryEnabled).toBe(false);
  });
});

describe("mode switch", () => {
  it("is enabled before Load only, locked while active, busy or preparing", () => {
    expect(state({}).modeEnabled).toBe(true);
    expect(state({ isMissionActive: true }).modeEnabled).toBe(false);
    expect(state({ canChangeMode: false }).modeEnabled).toBe(false);
    expect(state({ isBusy: true }).modeEnabled).toBe(false);
    expect(state({ isPreparing: true }).modeEnabled).toBe(false);
  });
});

describe("backend state table", () => {
  it.each<[string, "start" | "stop", boolean, boolean, boolean]>([
    ["EMPTY", "start", false, false, false],
    ["READY", "start", false, false, false],
    ["RUNNING", "stop", true, true, false],
    ["PAUSED", "stop", true, false, false],
    ["WAITING_FOR_NEXT", "stop", true, false, true],
    ["STOPPED", "start", false, false, false],
    ["UNKNOWN_STAGE", "stop", true, false, false],
  ])("%s has safe controls", (backendState, primary, stopAvailable, pauseAvailable, nextAvailable) => {
    const controls = state({ state: backendState, isMissionActive: false });
    expect(controls.primary).toBe(primary);
    expect(primary === "stop" && controls.primaryEnabled).toBe(stopAvailable);
    expect(controls.secondaryEnabled && controls.secondary === "pause").toBe(pauseAvailable);
    expect(controls.nextEnabled).toBe(nextAvailable);
  });
  it("keeps Stop during pending Start and an unknown state", () => {
    expect(state({ state: "READY", isStarting: true, isBusy: true })).toMatchObject({
      phase: "starting", primary: "stop", primaryEnabled: true,
    });
    expect(state({ state: "UNKNOWN_STAGE", isBusy: true }).primaryEnabled).toBe(true);
  });
  it("does not offer Start from a terminal or fault state", () => {
    for (const backendState of ["STOPPED", "ERROR", "COMPLETED", "EMPTY"]) {
      expect(state({ state: backendState, canStart: true }).primaryEnabled).toBe(false);
    }
  });
  it("requires the backend pause and skip flags", () => {
    expect(state({ state: "RUNNING", pauseAvailable: false, skipAvailable: false })).toMatchObject({
      secondaryEnabled: false, skipEnabled: false,
    });
  });
});
