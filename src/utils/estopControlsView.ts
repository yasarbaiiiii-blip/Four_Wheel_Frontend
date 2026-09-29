/** Which header E-stop controls to show for the rover-reported E-stop state. */

export interface EstopControlsView {
  /** Show the "E-STOP ON" badge. */
  showLatchedBadge: boolean;
  /** Offer RELEASE (latched, or state not known yet). */
  showRelease: boolean;
}

export function estopControlsView(emergencyStop: boolean | undefined): EstopControlsView {
  return {
    showLatchedBadge: emergencyStop === true,
    showRelease: emergencyStop !== false,
  };
}
