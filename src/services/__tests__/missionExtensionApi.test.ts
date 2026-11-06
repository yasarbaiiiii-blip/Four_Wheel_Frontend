/** Extension JSON is strict; multipart upload retains its legacy fields. */
jest.mock("../apiClient", () => ({
  apiDelete: jest.fn(), apiGet: jest.fn(), apiPost: jest.fn(), apiPostMultipart: jest.fn(), apiPut: jest.fn(),
}));

import { apiGet, apiPost, apiPostMultipart, apiPut } from "../apiClient";
import { applyMissionExtension, getMissionExtension, previewMissionExtension, uploadMissionCsv } from "../missionApi";

const get = apiGet as jest.Mock;
const post = apiPost as jest.Mock;
const put = apiPut as jest.Mock;
const upload = apiPostMultipart as jest.Mock;

beforeEach(() => {
  for (const mock of [get, post, put, upload]) mock.mockReset().mockResolvedValue({ success: true });
});

it("reads the staged mission extension", async () => {
  await getMissionExtension();
  expect(get).toHaveBeenCalledWith("/api/mission/extension");
});

it("previews without old keys and pins the mission identity", async () => {
  await previewMissionExtension({ enabled: true, distanceM: 0.5, triggerDistanceM: 2.5 }, "app_1");
  expect(post).toHaveBeenCalledWith("/api/mission/extension/preview", {
    enabled: true, distance_m: 0.5, trigger_m: 2.5, mission_id: "app_1",
  });
});

it("applies with the new contract and omits irrelevant disabled values", async () => {
  await applyMissionExtension({ enabled: true, distanceM: 4, triggerDistanceM: 2 }, "app_1");
  expect(put).toHaveBeenCalledWith("/api/mission/extension", {
    enabled: true, distance_m: 4, trigger_m: 2, mission_id: "app_1",
  }, { timeoutMs: 60_000 });
  await applyMissionExtension({ enabled: false, distanceM: Number.NaN, triggerDistanceM: 9 }, "app_1");
  expect(put.mock.calls[1][1]).toEqual({ enabled: false, mission_id: "app_1" });
});

describe("legacy multipart upload", () => {
  const file = { uri: "file:///m.csv", name: "m.csv", mimeType: "text/csv" } as never;
  function sentFields(): Record<string, string> {
    const form = upload.mock.calls[0][1] as FormData & { _parts?: [string, unknown][] };
    const parts: [string, unknown][] = form._parts ?? Array.from((form as unknown as { entries(): Iterable<[string, unknown]> }).entries());
    return Object.fromEntries(parts.filter(([, value]) => typeof value === "string") as [string, string][]);
  }

  it("keeps the operator marker, upload distance and trigger", async () => {
    await uploadMissionCsv({ file, extensionMode: "ENABLE", dummyPointDistanceM: 0.5, triggerDistanceM: 2 });
    expect(sentFields()).toMatchObject({
      extension_mode: "ENABLE", dummy_point_distance_m: "0.5", trigger_distance_m: "2", extension_distance_source: "OPERATOR",
    });
  });

  it("rejects values outside backend bounds before upload", async () => {
    await expect(uploadMissionCsv({ file, extensionMode: "ENABLE", dummyPointDistanceM: 0.05 })).rejects.toThrow(/0\.1 and 20\.0/);
    await expect(uploadMissionCsv({ file, extensionMode: "ENABLE", dummyPointDistanceM: 4, triggerDistanceM: 9 })).rejects.toThrow(/1\.0 and 5\.0/);
    expect(upload).not.toHaveBeenCalled();
  });
});
