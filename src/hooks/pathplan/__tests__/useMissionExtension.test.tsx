import React from "react";
import TestRenderer, { act } from "react-test-renderer";

jest.mock("../../../services/missionApi", () => ({
  getMissionExtension: jest.fn(), previewMissionExtension: jest.fn(), applyMissionExtension: jest.fn(),
}));

import { getMissionExtension, previewMissionExtension, applyMissionExtension } from "../../../services/missionApi";
import { ApiError } from "../../../services/apiError";
import { useMissionExtension, type ApplyExtensionOutcome } from "../useMissionExtension";
import { FALLBACK_EXTENSION_BOUNDS, type ExtensionChoice } from "../../../utils/missionExtension";

const get = getMissionExtension as jest.Mock;
const dryRun = previewMissionExtension as jest.Mock;
const apply = applyMissionExtension as jest.Mock;
const choice: ExtensionChoice = { enabled: true, distanceM: 4, triggerDistanceM: 2 };
const extension = { enabled: true, distance_m: 4, trigger_m: 2, source: "EXTENSION_API" };
const current = {
  success: true, available: true, mission_id: "app_1", editable: true, locked_reason: null,
  extension, limits: FALLBACK_EXTENSION_BOUNDS, row_ends: [], dummy_point_count: 0,
};

function renderHook() {
  const result: { current: ReturnType<typeof useMissionExtension> | null } = { current: null };
  function Wrapper() {
    result.current = useMissionExtension({ missionId: "app_1", trajectoryReady: true, pathSignature: "sig_1", connected: true });
    return null;
  }
  let renderer: ReturnType<typeof TestRenderer.create>;
  act(() => { renderer = TestRenderer.create(React.createElement(Wrapper)); });
  return { result, unmount: () => act(() => renderer!.unmount()) };
}

beforeEach(() => {
  get.mockReset().mockResolvedValue(current);
  dryRun.mockReset();
  apply.mockReset();
});

it("keeps the known mission ID when apply reports no change", async () => {
  const hook = renderHook();
  await act(async () => { await Promise.resolve(); });
  apply.mockResolvedValue({ ...current, changed: false, mission_id: null, message: "No change.", points: [] });
  let outcome: ApplyExtensionOutcome | undefined;
  await act(async () => { outcome = await hook.result.current!.apply(choice); });
  expect(outcome).toMatchObject({ status: "applied", changed: false, missionId: "app_1" });
  expect(hook.result.current?.missionId).toBe("app_1");
  hook.unmount();
});

it("uses the new ID after a confirmed changed apply", async () => {
  const hook = renderHook();
  await act(async () => { await Promise.resolve(); });
  apply.mockResolvedValue({ ...current, changed: true, mission_id: "app_2", previous_mission_id: "app_1", message: "Path updated.", points: [] });
  let outcome: ApplyExtensionOutcome | undefined;
  await act(async () => { outcome = await hook.result.current!.apply(choice); });
  expect(outcome).toMatchObject({ status: "applied", changed: true, missionId: "app_2" });
  expect(hook.result.current?.missionId).toBe("app_2");
  hook.unmount();
});

it("reports a GET failure separately from an absent mission", async () => {
  get.mockRejectedValue(new Error("link down"));
  const hook = renderHook();
  await act(async () => { await Promise.resolve(); });
  expect(hook.result.current?.availability).toBe("error");
  expect(hook.result.current?.settings).toBeNull();
  hook.unmount();
});

it("takes the restored ID from a failed apply and never claims success", async () => {
  const hook = renderHook();
  await act(async () => { await Promise.resolve(); });
  apply.mockRejectedValue(new ApiError("failed", 409, JSON.stringify({ detail: {
    code: "EXTENSION_NOT_APPLIED", message: "Previous path restored.", mission_id: "app_2", restored: true,
  } })));
  get.mockResolvedValue({ ...current, mission_id: "app_2" });
  let outcome: ApplyExtensionOutcome | undefined;
  await act(async () => { outcome = await hook.result.current!.apply(choice); await Promise.resolve(); });
  expect(outcome).toMatchObject({ status: "restored", missionId: "app_2" });
  expect(hook.result.current?.missionId).toBe("app_2");
  hook.unmount();
});

it("drops a preview result from an older slider setting", async () => {
  jest.useFakeTimers();
  const hook = renderHook();
  await act(async () => { await Promise.resolve(); });
  let finishFirst!: (value: unknown) => void;
  dryRun.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
  dryRun.mockResolvedValueOnce({ ...current, preview: true, applied: false, mission_id: "app_1", points: [], changes_path: true, extension: { ...extension, distance_m: 5 } });
  act(() => { hook.result.current!.preview(choice); jest.advanceTimersByTime(350); });
  act(() => { hook.result.current!.preview({ ...choice, distanceM: 5 }); jest.advanceTimersByTime(350); });
  await act(async () => { finishFirst({ ...current, preview: true, applied: false, mission_id: "app_1", points: [], changes_path: true }); await Promise.resolve(); });
  expect(hook.result.current?.previewState?.extension.distance_m).toBe(5);
  hook.unmount();
  jest.useRealTimers();
});
