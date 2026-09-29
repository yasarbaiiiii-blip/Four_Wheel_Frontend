/** Obstacle API contract and status normalisation (rover_ws obstacle_routes.py). */

jest.mock("../apiClient", () => ({
  apiGet: jest.fn(),
  apiPost: jest.fn(),
}));

import { apiGet, apiPost } from "../apiClient";
import { getObstacleStatus, setObstacleConfig } from "../obstacleService";
import {
  obstacleReadingText,
  sameObstacleView,
  toObstacleView,
} from "../../utils/obstacleStatus";

const get = apiGet as jest.Mock;
const post = apiPost as jest.Mock;

const LIVE = {
  enabled: false,
  healthy: true,
  zone: "danger",
  distance_mm: 795,
  danger_mm: 1500,
  warning_mm: 3000,
  port: "/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_A5069RR4-if00-port0",
  serial_error: null,
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe("obstacle service", () => {
  it("reads the rover status", async () => {
    get.mockResolvedValue({ success: true, available: true, status: LIVE });
    const view = await getObstacleStatus();
    expect(get).toHaveBeenCalledWith("/api/obstacle/status");
    expect(view).toMatchObject({ enabled: false, healthy: true, zone: "danger", distance_mm: 795 });
  });

  it("returns null before obstacle_monitor has reported", async () => {
    get.mockResolvedValue({ success: true, available: false, status: {} });
    expect(await getObstacleStatus()).toBeNull();
  });

  it("sends only the requested change and returns the rover's state", async () => {
    post.mockResolvedValue({ success: true, message: "Obstacle settings saved.", status: { ...LIVE, enabled: true } });
    const result = await setObstacleConfig({ enabled: true });
    expect(post).toHaveBeenCalledWith("/api/obstacle/config", { enabled: true });
    expect(result.status?.enabled).toBe(true);
  });

  it("never reports success for a rejected change", async () => {
    post.mockResolvedValue({ success: false, message: "danger_mm must be below warning_mm" });
    await expect(setObstacleConfig({ danger_mm: 4000 })).rejects.toThrow("danger_mm must be below warning_mm");
  });
});

describe("toObstacleView", () => {
  it("hides distance and zone when the reading is not healthy", () => {
    const view = toObstacleView({ ...LIVE, healthy: false });
    expect(view).toMatchObject({ healthy: false, zone: "unknown", distance_mm: null });
    expect(obstacleReadingText(view)).toBe("No reading");
  });

  it("treats a missing or empty section as no status", () => {
    expect(toObstacleView(undefined)).toBeNull();
    expect(toObstacleView({})).toBeNull();
    expect(obstacleReadingText(null)).toBe("Sensor status unavailable");
  });

  it("formats the live reading", () => {
    expect(obstacleReadingText(toObstacleView(LIVE))).toBe("0.80 m · DANGER");
    expect(obstacleReadingText(toObstacleView({ ...LIVE, zone: "clear", distance_mm: null }))).toBe(
      "Nothing in range · CLEAR",
    );
  });

  it("compares views by value", () => {
    expect(sameObstacleView(toObstacleView(LIVE), toObstacleView({ ...LIVE }))).toBe(true);
    expect(sameObstacleView(toObstacleView(LIVE), toObstacleView({ ...LIVE, distance_mm: 900 }))).toBe(false);
    expect(sameObstacleView(null, null)).toBe(true);
  });
});
