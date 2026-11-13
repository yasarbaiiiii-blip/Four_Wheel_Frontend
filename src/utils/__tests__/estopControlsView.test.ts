import { estopControlsView } from "../estopControlsView";

describe("estopControlsView", () => {
  it("offers RELEASE and shows the badge only when E-stop is confirmed latched, connected, and fresh", () => {
    expect(estopControlsView(true)).toEqual({
      showLatchedBadge: true,
      showRelease: true,
      canRelease: true,
    });
    expect(estopControlsView({ emergencyStop: true, isConnected: true, isStale: false })).toEqual({
      showLatchedBadge: true,
      showRelease: true,
      canRelease: true,
    });
  });

  it("hides RELEASE when the rover reports E-stop is clear / released", () => {
    expect(estopControlsView(false)).toEqual({
      showLatchedBadge: false,
      showRelease: false,
      canRelease: false,
    });
  });

  it("never enables RELEASE when E-stop state is unknown / undefined", () => {
    expect(estopControlsView(undefined)).toEqual({
      showLatchedBadge: false,
      showRelease: false,
      canRelease: false,
    });
    expect(estopControlsView({ emergencyStop: undefined, isConnected: true })).toEqual({
      showLatchedBadge: false,
      showRelease: false,
      canRelease: false,
    });
  });

  it("never enables RELEASE when disconnected even if previously latched", () => {
    expect(estopControlsView({ emergencyStop: true, isConnected: false })).toEqual({
      showLatchedBadge: true,
      showRelease: false,
      canRelease: false,
    });
    expect(estopControlsView(true, { isConnected: false })).toEqual({
      showLatchedBadge: true,
      showRelease: false,
      canRelease: false,
    });
  });

  it("never enables RELEASE when telemetry is stale even if previously latched", () => {
    expect(estopControlsView({ emergencyStop: true, isConnected: true, isStale: true })).toEqual({
      showLatchedBadge: true,
      showRelease: false,
      canRelease: false,
    });
  });
});
