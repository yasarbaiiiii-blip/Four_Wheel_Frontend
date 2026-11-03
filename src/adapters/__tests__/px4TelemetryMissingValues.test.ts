import { isPx4Payload, toRoverTelemetry } from "../px4TelemetryAdapter";

const adapt = (packet: Record<string, unknown>) =>
  toRoverTelemetry(packet as Parameters<typeof toRoverTelemetry>[0]);

describe("toRoverTelemetry reported and missing values", () => {
  it("reads every value of the app telemetry packet", () => {
    const packet = {
      generated_at: 1793600000000,
      vehicle: { connected: true, armed: false, mode: "offboard", heading_deg: 87.5, ground_speed_mps: 0.6 },
      position: { latitude: 12.9716, longitude: 77.5946, altitude_m: 900 },
      gps: { fix_type: 6, satellites_visible: 24, raw_hrms_m: 0.014, raw_vrms_m: 0.021 },
      battery: { voltage_v: 26.1, remaining_percent: 80 },
    };
    expect(isPx4Payload(packet)).toBe(true);

    const telemetry = adapt(packet);
    expect(telemetry.rtk.fix_type).toBe(6);
    expect(telemetry.global.satellites_visible).toBe(24);
    expect(telemetry.global.vel).toBe(0.6);
    expect(telemetry.global.lat).toBe(12.9716);
    expect(telemetry.global.lon).toBe(77.5946);
    expect(telemetry.hrms).toBe(0.014);
    expect(telemetry.vrms).toBe(0.021);
    expect(telemetry.battery.voltage).toBe(26.1);
    expect(telemetry.battery.percentage).toBe(80);
    expect(telemetry.attitude?.yaw_deg).toBe(87.5);
    expect(telemetry.state.mode).toBe("OFFBOARD");
  });

  it("keeps a real zero", () => {
    const telemetry = adapt({
      vehicle: { heading_deg: 0, ground_speed_mps: 0 },
      gps: { fix_type: 3, satellites_visible: 0 },
      battery: { voltage_v: 22, remaining_percent: 0 },
    });
    expect(telemetry.global.vel).toBe(0);
    expect(telemetry.global.satellites_visible).toBe(0);
    expect(telemetry.battery.percentage).toBe(0);
    expect(telemetry.attitude?.yaw_deg).toBe(0);
  });

  it.each([
    ["null", { vehicle: { heading_deg: null, ground_speed_mps: null }, position: { latitude: null, longitude: null, altitude_m: null }, gps: { fix_type: null, satellites_visible: null }, battery: { voltage_v: null, remaining_percent: null } }],
    ["absent", { gps: {} }],
  ])("reports %s values as null, not 0", (_name, packet) => {
    const telemetry = adapt(packet);
    expect(telemetry.global.lat).toBeNull();
    expect(telemetry.global.lon).toBeNull();
    expect(telemetry.global.alt_rel).toBeNull();
    expect(telemetry.global.vel).toBeNull();
    expect(telemetry.global.satellites_visible).toBeNull();
    expect(telemetry.battery.percentage).toBeNull();
    expect(telemetry.attitude?.yaw_deg).toBeNull();
  });

  it("never turns an extrapolated PX4 fix (8) into RTK Fixed", () => {
    const telemetry = adapt({ gps: { fix_type: 8 } });
    expect(telemetry.rtk.fix_type).toBe(0);
    expect(telemetry.rtk.base_linked).toBe(false);
  });
});
