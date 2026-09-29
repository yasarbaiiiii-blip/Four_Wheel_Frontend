/** Spray request bodies and local safety checks must match the rover contract. */

jest.mock("../apiClient", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
}));

import { apiPost } from "../apiClient";
import {
  SPRAY_DURATION_MAX_SEC,
  cancelSprayTest,
  setLaserConfig,
  setSprayDuration,
  sprayDurationError,
  testSpray,
  turnSprayOff,
  turnSprayOn,
} from "../sprayConfigService";

const post = apiPost as jest.Mock;

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ success: true });
});

describe("spray control contract", () => {
  it("sends the backend test body", async () => {
    await testSpray(0.3);
    expect(post).toHaveBeenCalledWith("/api/spray/test", { on: true, duration_s: 0.3 });
  });

  it("cancels a test with an explicit safe-off request", async () => {
    await cancelSprayTest();
    expect(post).toHaveBeenCalledWith("/api/spray/test", { on: false });
  });

  it("saves the hold time with the backend field name", async () => {
    await setSprayDuration(0.45);
    expect(post).toHaveBeenCalledWith("/api/spray/duration", { spray_duration_sec: 0.45 });
  });

  it.each([0, -0.1, 3.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects unsafe duration %p before making a request",
    async (value) => {
      await expect(testSpray(value)).rejects.toThrow();
      await expect(setSprayDuration(value)).rejects.toThrow();
      expect(post).not.toHaveBeenCalled();
    },
  );

  it("accepts the backend upper limit", () => {
    expect(sprayDurationError(SPRAY_DURATION_MAX_SEC)).toBeNull();
    expect(sprayDurationError(0.05)).toBeNull();
  });

  it("validates laser PWM before it is sent", async () => {
    await expect(setLaserConfig(1000, 1000)).rejects.toThrow("must be different");
    await expect(setLaserConfig(999, 1000)).rejects.toThrow("between 1000 and 2000");
    await setLaserConfig(2000, 1000);
    expect(post).toHaveBeenCalledWith("/api/spray/laser-config", { on_pwm_us: 2000, off_pwm_us: 1000 });
  });

  it("uses dedicated endpoints for manual ON and OFF", async () => {
    await turnSprayOn();
    await turnSprayOff();
    expect(post).toHaveBeenNthCalledWith(1, "/api/spray/on");
    expect(post).toHaveBeenNthCalledWith(2, "/api/spray/off");
  });
});
