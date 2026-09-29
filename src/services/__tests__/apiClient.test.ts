/**
 * A rover refusal must reach the operator with the rover's own reason; only a
 * request that never got an answer is a network error.
 */

jest.mock("../../config", () => ({
  getBackendURL: () => "http://192.168.3.101:5001",
}));

import { apiPost } from "../apiClient";
import { ApiError, ConflictError, NetworkError } from "../apiError";

const originalFetch = global.fetch;

function respond(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe("apiClient error classification", () => {
  it("keeps a 409 refusal as a ConflictError with the rover's message", async () => {
    respond(409, {
      detail: {
        success: false,
        operation: "manual_spray_test_on",
        message: "Manual spray requires PX4 armed",
        outcome: "FAILED",
      },
    });

    const error = await apiPost("/api/spray/test", { on: true, duration_s: 0.5 }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ConflictError);
    expect(error).not.toBeInstanceOf(NetworkError);
    expect((error as ApiError).statusCode).toBe(409);
    expect((error as Error).message).toBe("Manual spray requires PX4 armed");
  });

  it.each([404, 422, 503, 504])("does not report HTTP %i as unreachable", async (status) => {
    respond(status, { detail: { message: "rover said no" } });
    const error = await apiPost("/api/anything").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as Error).message).not.toMatch(/Unable to reach backend/);
  });

  it("still reports a request with no answer as unreachable", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new TypeError("Network request failed")) as unknown as typeof fetch;

    const error = await apiPost("/api/spray/test", { on: true }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect((error as Error).message).toMatch(/Unable to reach backend at http:\/\/192\.168\.3\.101:5001/);
  });
});
