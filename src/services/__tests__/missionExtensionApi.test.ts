/** Row-extension requests must match the rover's GET/PUT contract. */

jest.mock("../apiClient", () => ({
  apiDelete: jest.fn(),
  apiGet: jest.fn(),
  apiPost: jest.fn(),
  apiPostMultipart: jest.fn(),
  apiPut: jest.fn(),
}));

import { apiGet, apiPost, apiPostMultipart, apiPut } from "../apiClient";
import {
  getMissionExtension,
  saveExtensionDefaults,
  updateMissionExtension,
  uploadMissionCsv,
} from "../missionApi";

const get = apiGet as jest.Mock;
const put = apiPut as jest.Mock;
const upload = apiPostMultipart as jest.Mock;
const post = apiPost as jest.Mock;

beforeEach(() => {
  get.mockReset().mockResolvedValue({ success: true });
  put.mockReset().mockResolvedValue({ success: true });
  upload.mockReset().mockResolvedValue({ success: true });
  post.mockReset().mockResolvedValue({ success: true });
});

it("reads the loaded mission's extension", async () => {
  await getMissionExtension();
  expect(get).toHaveBeenCalledWith("/api/mission/extension");
});

it("sends the operator's values with the revision it edited", async () => {
  await updateMissionExtension(
    { enabled: true, distanceM: 5.5, triggerDistanceM: 2.5, skipRowEnds: ["P0004"] },
    3,
  );
  expect(put).toHaveBeenCalledWith(
    "/api/mission/extension",
    {
      enabled: true,
      distance_m: 5.5,
      trigger_distance_m: 2.5,
      skip_row_ends: ["P0004"],
      expected_revision: 3,
    },
    { timeoutMs: 60_000 },
  );
});

it("sends no distance or trigger when turning it off", async () => {
  await updateMissionExtension({ enabled: false, distanceM: 5.5, triggerDistanceM: 2.5 }, 4);
  expect(put.mock.calls[0][1]).toEqual({
    enabled: false,
    distance_m: null,
    trigger_distance_m: null,
    skip_row_ends: [],
    expected_revision: 4,
  });
});

it("saves defaults without touching the mission", async () => {
  await saveExtensionDefaults(6, 2.5);
  expect(post).toHaveBeenCalledWith("/api/mission/extension/defaults", {
    distance_m: 6,
    trigger_distance_m: 2.5,
  });
  expect(put).not.toHaveBeenCalled();
});

describe("upload", () => {
  const file = { uri: "file:///m.csv", name: "m.csv", mimeType: "text/csv" } as never;

  function sentFields(): Record<string, string> {
    const form = upload.mock.calls[0][1] as FormData & { _parts?: [string, unknown][] };
    // React Native's FormData keeps _parts; the Jest (Node) one has entries().
    const parts: [string, unknown][] =
      form._parts ?? Array.from((form as unknown as { entries(): Iterable<[string, unknown]> }).entries());
    return Object.fromEntries(
      parts.filter(([, value]) => typeof value === "string") as [string, string][],
    );
  }

  it("marks operator values and sends the trigger", async () => {
    await uploadMissionCsv({ file, extensionMode: "ENABLE", dummyPointDistanceM: 6, triggerDistanceM: 2 });
    expect(sentFields()).toMatchObject({
      extension_mode: "ENABLE",
      dummy_point_distance_m: "6",
      trigger_distance_m: "2",
      extension_distance_source: "OPERATOR",
    });
  });

  it("refuses a distance under the rover's 1.0 m minimum", async () => {
    await expect(
      uploadMissionCsv({ file, extensionMode: "ENABLE", dummyPointDistanceM: 0.5 }),
    ).rejects.toThrow(/1\.0 and 20\.0/);
    expect(upload).not.toHaveBeenCalled();
  });
});
