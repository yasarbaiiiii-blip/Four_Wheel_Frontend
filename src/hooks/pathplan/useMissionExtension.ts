/**
 * Rover-owned row-extension state for the loaded mission.
 *
 * Reads GET /api/mission/extension whenever the mission, its readiness or its
 * pushed path changes, and applies operator changes with PUT. Nothing is kept
 * beyond what the rover last returned: a new mission, a disconnect or a
 * settings change in flight drops the previous settings and decisions, so
 * stale extension points are never shown.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getMissionExtension,
  saveExtensionDefaults,
  updateMissionExtension,
} from "../../services/missionApi";
import {
  FALLBACK_EXTENSION_BOUNDS,
  extensionErrorCode,
  type ExtensionBounds,
  type ExtensionChoice,
  type ExtensionDecision,
  type ExtensionDefaults,
  type ExtensionSettings,
  type MissionExtensionResponse,
} from "../../utils/missionExtension";

export interface MissionExtensionState {
  missionId: string | null;
  settings: ExtensionSettings | null;
  bounds: ExtensionBounds;
  decisions: ExtensionDecision[];
  decisionsCurrent: boolean;
  unusedSkips: string[];
  /** Saved starting values; null until the rover has answered. */
  defaults: ExtensionDefaults | null;
  defaultsSaved: boolean;
}

const EMPTY_STATE: MissionExtensionState = {
  missionId: null,
  settings: null,
  bounds: FALLBACK_EXTENSION_BOUNDS,
  decisions: [],
  decisionsCurrent: false,
  unusedSkips: [],
  defaults: null,
  defaultsSaved: false,
};

export type ApplyExtensionOutcome =
  | { status: "applied"; settings: ExtensionSettings | null }
  | { status: "conflict"; message: string }
  | { status: "failed"; message: string };

interface UseMissionExtensionOptions {
  /** Mission the rover has loaded, or null. */
  missionId: string | null;
  /** Rover reports the trajectory ready (decisions are computed by then). */
  trajectoryReady: boolean;
  /** Signature of the last pushed path; a new one may carry new decisions. */
  pathSignature: string | null;
  /** False while offline or disconnected. */
  connected: boolean;
}

function fromResponse(response: MissionExtensionResponse): MissionExtensionState {
  return {
    missionId: response.mission_id ?? null,
    settings: response.extension ?? null,
    bounds: response.bounds ?? FALLBACK_EXTENSION_BOUNDS,
    decisions: Array.isArray(response.decisions) ? response.decisions : [],
    decisionsCurrent: response.decisions_current === true,
    unusedSkips: Array.isArray(response.unused_skips) ? response.unused_skips : [],
    defaults: response.defaults ?? null,
    defaultsSaved: response.defaults_source === "saved",
  };
}

export function useMissionExtension({
  missionId,
  trajectoryReady,
  pathSignature,
  connected,
}: UseMissionExtensionOptions) {
  const [state, setState] = useState<MissionExtensionState>(EMPTY_STATE);
  const [applying, setApplying] = useState(false);
  const mountedRef = useRef(true);
  // Only the newest request may write state.
  const requestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const request = ++requestRef.current;
    try {
      const response = await getMissionExtension();
      if (mountedRef.current && request === requestRef.current) {
        setState(fromResponse(response));
      }
    } catch {
      // An older rover build has no endpoint (404) or the link dropped:
      // show nothing rather than something possibly stale.
      if (mountedRef.current && request === requestRef.current) {
        setState(EMPTY_STATE);
      }
    }
  }, []);

  // Read even without a mission: the saved defaults pre-fill the dialog.
  useEffect(() => {
    if (!connected) {
      requestRef.current += 1;
      setState(EMPTY_STATE);
      return;
    }
    void refresh();
  }, [connected, missionId, trajectoryReady, pathSignature, refresh]);

  const apply = useCallback(
    async (choice: ExtensionChoice): Promise<ApplyExtensionOutcome> => {
      const revision = state.settings?.revision;
      if (revision === undefined) {
        return {
          status: "failed",
          message: "The rover has not reported this mission's extension yet.",
        };
      }
      setApplying(true);
      // The previous decisions belong to the previous revision.
      requestRef.current += 1;
      setState((previous) => ({
        ...previous,
        decisions: [],
        decisionsCurrent: false,
        unusedSkips: [],
      }));
      try {
        const response = await updateMissionExtension(choice, revision);
        if (mountedRef.current) {
          setState(fromResponse({ ...response, decisions: [], decisions_current: false }));
        }
        return { status: "applied", settings: response.extension ?? null };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "The rover did not accept the change.";
        // Whatever happened, show the rover's current settings again.
        void refresh();
        if (extensionErrorCode(error) === "REVISION_CONFLICT") {
          return {
            status: "conflict",
            message:
              "Another tablet changed the row extension. Its settings are shown now; " +
              "apply again if you still want yours.",
          };
        }
        return { status: "failed", message };
      } finally {
        if (mountedRef.current) setApplying(false);
      }
    },
    [refresh, state.settings?.revision],
  );

  const saveDefaults = useCallback(
    async (choice: ExtensionChoice): Promise<string | null> => {
      try {
        const response = await saveExtensionDefaults(
          choice.distanceM,
          choice.triggerDistanceM,
        );
        if (mountedRef.current) {
          setState((previous) => ({
            ...previous,
            defaults: response.defaults,
            defaultsSaved: true,
          }));
        }
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : "The defaults were not saved.";
      }
    },
    [],
  );

  return { ...state, applying, refresh, apply, saveDefaults };
}
