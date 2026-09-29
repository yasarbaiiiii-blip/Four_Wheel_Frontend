import { estopControlsView } from "../estopControlsView";

describe("estopControlsView", () => {
  it("offers RELEASE and shows the badge while the E-stop is on", () => {
    expect(estopControlsView(true)).toEqual({ showLatchedBadge: true, showRelease: true });
  });

  it("hides RELEASE once the rover reports the E-stop released", () => {
    expect(estopControlsView(false)).toEqual({ showLatchedBadge: false, showRelease: false });
  });

  it("still offers RELEASE before the first status arrives", () => {
    expect(estopControlsView(undefined)).toEqual({ showLatchedBadge: false, showRelease: true });
  });
});
