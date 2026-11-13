/**
 * Which header / mission E-stop controls to show for the rover-reported E-stop state.
 *
 * Unknown, stale, or disconnected state must never enable release.
 * STOP remains immediately available in all states.
 */

export interface EstopControlsViewOptions {
  emergencyStop?: boolean;
  isConnected?: boolean;
  isStale?: boolean;
}

export interface EstopControlsView {
  /** Show the "E-STOP ON" or "STOP LATCHED" badge. */
  showLatchedBadge: boolean;
  /** Offer RELEASE (only when confirmed latched, connected, and fresh). */
  showRelease: boolean;
  /** Whether release sequence is permitted to be triggered. */
  canRelease: boolean;
}

export function estopControlsView(
  input: boolean | undefined | EstopControlsViewOptions,
  legacyOptions?: { isConnected?: boolean; isStale?: boolean },
): EstopControlsView {
  let emergencyStop: boolean | undefined;
  let isConnected = true;
  let isStale = false;

  if (typeof input === "object" && input !== null) {
    emergencyStop = input.emergencyStop;
    isConnected = input.isConnected ?? true;
    isStale = input.isStale ?? false;
  } else {
    emergencyStop = input;
    if (legacyOptions) {
      isConnected = legacyOptions.isConnected ?? true;
      isStale = legacyOptions.isStale ?? false;
    }
  }

  // Authoritative E-Stop latch must be strictly true.
  const isConfirmedLatched = emergencyStop === true;
  // Connection must be active and not stale.
  const isHealthyConnection = isConnected && !isStale;
  // Unknown (undefined), clear (false), stale, or disconnected states NEVER enable release.
  const canRelease = isConfirmedLatched && isHealthyConnection;

  return {
    showLatchedBadge: isConfirmedLatched,
    showRelease: canRelease,
    canRelease,
  };
}
