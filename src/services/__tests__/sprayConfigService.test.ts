/**
 * Spray config service: request bodies must match the rover backend contract
 * (rover_ws src/rover_backend/rover_backend/spray_routes.py).
 */

jest.mock("../apiClient", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(async () => ({ success: true })),
}));

import { apiPost } from "../apiClient";
import {
  SPRAY_DURATION_MAX_SEC,
  cancelSprayTest,
  setSprayDuration,
  sprayDurationError,
  testSpray,
} from "../sprayConfigService";

const mockedPost = apiPost as jest.MockedFunction<typeof apiPost>;

describe("sprayConfigService", () => {
  beforeEach(() => mockedPost.mockClear());

  it("sends the backend's { on, duration_s } body for a test spray", async () => {
    await testSpray(0.3);

    expect(mockedPost).toHaveBeenCalledWith("/api/spray/test", {
      on: true,
      duration_s: 0.3,
    });
  });

  it("cancels a test with { on: false }", async () => {
    await cancelSprayTest();

    expect(mockedPost).toHaveBeenCalledWith("/api/spray/test", { on: false });
  });

  it("saves the hold time as { spray_duration_sec }", async () => {
    await setSprayDuration(0.45);

    expect(mockedPost).toHaveBeenCalledWith("/api/spray/duration", {
      spray_duration_sec: 0.45,
    });
  });

  it.each([0, -0.1, 3.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects %p locally without calling the backend",
    async (value) => {
      await expect(testSpray(value)).rejects.toThrow();
      await expect(setSprayDuration(value)).rejects.toThrow();
      expect(mockedPost).not.toHaveBeenCalled();
    },
  );

  it("accepts the 3.0 s upper limit", () => {
    expect(sprayDurationError(SPRAY_DURATION_MAX_SEC)).toBeNull();
    expect(sprayDurationError(0.05)).toBeNull();
  });
});
