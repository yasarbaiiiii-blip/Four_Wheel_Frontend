jest.mock("../apiClient", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
}));

import { apiPost } from "../apiClient";
import {
  cancelSprayTest,
  setLaserConfig,
  setSprayDuration,
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
  it("sends the confirmed test contract", async () => {
    await testSpray(1.5);
    expect(post).toHaveBeenCalledWith("/api/spray/test", { on: true, duration_s: 1.5 });
  });

  it("rejects zero, negative, and unsafe durations locally", async () => {
    await expect(testSpray(0)).rejects.toThrow("greater than 0");
    await expect(setSprayDuration(-1)).rejects.toThrow("greater than 0");
    await expect(testSpray(3.1)).rejects.toThrow("no more than 3");
    expect(post).not.toHaveBeenCalled();
  });

  it("supports an explicit stop request for a spray test", async () => {
    await cancelSprayTest();
    expect(post).toHaveBeenCalledWith("/api/spray/test", { on: false });
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
