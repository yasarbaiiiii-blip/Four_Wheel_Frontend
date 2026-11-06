import {
  admitMissionStatus,
  isStopTerminalState,
  runStopCommand,
  type StopFencePhase,
} from "../missionStopFence";

type Mission = { state: string };
type StopReply = { success: boolean; message?: string };

/** Mirrors how the screen's setBackendMission uses the fence. */
function makeScreen() {
  const generationRef = { current: 0 };
  const phaseRef: { current: StopFencePhase } = { current: "idle" };
  const shown: string[] = [];
  const notices: string[] = [];
  const setBackendMission = (mission: Mission, fresh: boolean) => {
    if (!admitMissionStatus(phaseRef.current, mission.state, fresh)) return false;
    phaseRef.current = "idle";
    shown.push(mission.state);
    return true;
  };
  const run = (
    stop: () => Promise<StopReply>,
    fetchStatus: () => Promise<{ success?: boolean; mission?: Mission } | null>,
  ) =>
    runStopCommand<StopReply, Mission, { success: false; message: string }>({
      generationRef,
      phaseRef,
      stop,
      fetchStatus,
      applyFreshStatus: (mission) => setBackendMission(mission, true),
      shouldContinue: () => true,
      onRecorded: () => notices.push("recorded"),
      onRefused: () => notices.push("refused"),
      onFailed: (error) => {
        notices.push("failed");
        return { success: false, message: String(error) };
      },
      retryDelaysMs: [0, 1, 1],
      sleep: () => Promise.resolve(),
    });
  return { generationRef, phaseRef, shown, notices, setBackendMission, run };
}

const statusOf = (state: string) => async () => ({ success: true, mission: { state } });
const stopOk = async (): Promise<StopReply> => ({ success: true });
const networkDown = async () => {
  throw new Error("network");
};

describe("admitMissionStatus", () => {
  test.each(["stopped", "ERROR", " Fault "])("%s counts as terminal", (state) => {
    expect(isStopTerminalState(state)).toBe(true);
  });

  test.each(["READY", "EMPTY", "RUNNING", "", null, undefined])("%s is not terminal", (state) => {
    expect(isStopTerminalState(state)).toBe(false);
  });

  test("idle accepts everything", () => {
    expect(admitMissionStatus("idle", "RUNNING", false)).toBe(true);
  });

  test("while Stop is in flight only a terminal state gets through, even if fresh", () => {
    expect(admitMissionStatus("request_in_flight", "RUNNING", true)).toBe(false);
    expect(admitMissionStatus("request_in_flight", "ERROR", false)).toBe(true);
  });

  test("after Stop has settled fresh status gets through and an unmarked reply does not", () => {
    expect(admitMissionStatus("awaiting_fresh_status", "EMPTY", true)).toBe(true);
    expect(admitMissionStatus("awaiting_fresh_status", "READY", false)).toBe(false);
    expect(admitMissionStatus("awaiting_fresh_status", "ERROR", false)).toBe(true);
  });
});

describe("runStopCommand", () => {
  test("a recorded Stop followed by a latched status releases the fence", async () => {
    const s = makeScreen();
    const { result, confirmation } = await s.run(stopOk, statusOf("ERROR"));
    await confirmation;
    expect(result).toEqual({ success: true });
    expect(s.notices).toEqual(["recorded"]);
    expect(s.shown).toEqual(["ERROR"]);
    expect(s.phaseRef.current).toBe("idle");
  });

  test("a failed Stop does not freeze status", async () => {
    const s = makeScreen();
    const { result, confirmation } = await s.run(networkDown, statusOf("RUNNING"));
    await confirmation;
    expect(result).toMatchObject({ success: false });
    expect(s.notices).toEqual(["failed"]);
    expect(s.shown).toEqual(["RUNNING"]);
    expect(s.phaseRef.current).toBe("idle");
  });

  test("a refused Stop does not freeze status", async () => {
    const s = makeScreen();
    const { confirmation } = await s.run(async () => ({ success: false }), statusOf("READY"));
    await confirmation;
    expect(s.notices).toEqual(["refused"]);
    expect(s.shown).toEqual(["READY"]);
  });

  test("status is retried after a failure", async () => {
    const s = makeScreen();
    const fetchStatus = jest
      .fn()
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true, mission: { state: "ERROR" } });
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const { confirmation } = await s.run(stopOk, fetchStatus);
    await confirmation;
    warn.mockRestore();
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(s.shown).toEqual(["ERROR"]);
  });

  test("when every status attempt fails, a later poll still releases it, even as EMPTY after a manager restart", async () => {
    const s = makeScreen();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const { confirmation } = await s.run(networkDown, networkDown);
    await confirmation;
    warn.mockRestore();
    expect(s.phaseRef.current).toBe("awaiting_fresh_status");
    expect(s.shown).toEqual([]);

    expect(s.setBackendMission({ state: "EMPTY" }, true)).toBe(true);
    expect(s.shown).toEqual(["EMPTY"]);
    expect(s.phaseRef.current).toBe("idle");
  });

  test("a status request sent before Stop settled is recognised as stale", async () => {
    const s = makeScreen();
    let finishStop: (reply: StopReply) => void = () => undefined;
    const pending = s.run(
      () => new Promise<StopReply>((resolve) => { finishStop = resolve; }),
      statusOf("ERROR"),
    );
    const generationOfOldRequest = s.generationRef.current;
    expect(s.setBackendMission({ state: "RUNNING" }, true)).toBe(false);
    finishStop({ success: true });
    const { confirmation } = await pending;
    expect(s.generationRef.current).not.toBe(generationOfOldRequest);
    await confirmation;
    expect(s.shown).toEqual(["ERROR"]);
  });

  test("Stop's result does not wait for status, so the button is not held locked", async () => {
    const s = makeScreen();
    const never = () => new Promise<{ success?: boolean; mission?: Mission } | null>(() => undefined);
    const { result } = await s.run(stopOk, never);
    expect(result).toEqual({ success: true });
  });

  test("a second Stop takes over and the first one's status is ignored", async () => {
    const s = makeScreen();
    let releaseFirstStatus: (value: { success: boolean; mission: Mission }) => void = () => undefined;
    const first = await s.run(
      stopOk,
      () => new Promise((resolve) => { releaseFirstStatus = resolve; }),
    );
    const second = await s.run(stopOk, statusOf("ERROR"));
    releaseFirstStatus({ success: true, mission: { state: "RUNNING" } });
    await first.confirmation;
    await second.confirmation;
    expect(s.shown).toEqual(["ERROR"]);
  });

  test("a first Stop answered after a second one started does not take the fence back", async () => {
    const s = makeScreen();
    let finishFirst: (reply: StopReply) => void = () => undefined;
    const first = s.run(
      () => new Promise<StopReply>((resolve) => { finishFirst = resolve; }),
      statusOf("RUNNING"),
    );
    const second = await s.run(stopOk, statusOf("ERROR"));
    await second.confirmation;
    finishFirst({ success: true });
    await (await first).confirmation;
    expect(s.shown).toEqual(["ERROR"]);
    expect(s.notices).toEqual(["recorded"]);
  });
});
