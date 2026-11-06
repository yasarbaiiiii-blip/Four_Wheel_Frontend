/** Rover-owned extension state and separate, debounced dry-run preview. */
import { useCallback, useEffect, useRef, useState } from "react";
import { applyMissionExtension, getMissionExtension, previewMissionExtension } from "../../services/missionApi";
import {
  extensionErrorDetail,
  FALLBACK_EXTENSION_BOUNDS,
  type ExtensionApplyResponse,
  type ExtensionChoice,
  type ExtensionLimits,
  type ExtensionPreviewResponse,
  type ExtensionRowEnd,
  type ExtensionSettings,
  type MissionExtensionResponse,
} from "../../utils/missionExtension";

export interface MissionExtensionState {
  availability: "unknown" | "available" | "absent" | "error";
  missionId: string | null;
  settings: ExtensionSettings | null;
  bounds: ExtensionLimits;
  editable: boolean;
  lockedReason: string | null;
  message: string | null;
  rowEnds: ExtensionRowEnd[];
  geometry: MissionExtensionResponse | ExtensionApplyResponse | null;
}

const EMPTY_STATE: MissionExtensionState = {
  availability: "unknown",
  missionId: null,
  settings: null,
  bounds: FALLBACK_EXTENSION_BOUNDS,
  editable: false,
  lockedReason: null,
  message: null,
  rowEnds: [],
  geometry: null,
};

export type ApplyExtensionOutcome =
  | { status: "applied"; changed: boolean; missionId: string; message: string }
  | { status: "conflict" | "restored" | "cleared" | "failed"; message: string; missionId?: string };

interface UseMissionExtensionOptions {
  missionId: string | null;
  trajectoryReady: boolean;
  pathSignature: string | null;
  connected: boolean;
}

function fromResponse(response: MissionExtensionResponse): MissionExtensionState {
  return {
    availability: response.available ? "available" : "absent",
    missionId: response.available ? response.mission_id : null,
    settings: response.available ? response.extension : null,
    bounds: response.limits ?? FALLBACK_EXTENSION_BOUNDS,
    editable: response.available && response.editable === true,
    lockedReason: response.locked_reason ?? null,
    message: response.message ?? null,
    rowEnds: response.available && Array.isArray(response.row_ends) ? response.row_ends : [],
    geometry: response.available ? response : null,
  };
}

export function useMissionExtension({ missionId, trajectoryReady, pathSignature, connected }: UseMissionExtensionOptions) {
  const [state, setState] = useState<MissionExtensionState>(EMPTY_STATE);
  const [previewState, setPreviewState] = useState<ExtensionPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [applying, setApplying] = useState(false);
  const applyInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);
  const previewRef = useRef(0);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPreview = useCallback(() => {
    previewRef.current += 1;
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
    setPreviewState(null);
    setPreviewError(null);
    setPreviewPending(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      previewRef.current += 1;
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, []);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    try {
      const response = await getMissionExtension();
      if (mountedRef.current && request === requestRef.current) setState(fromResponse(response));
    } catch {
      if (mountedRef.current && request === requestRef.current) {
        setState({ ...EMPTY_STATE, availability: "error", message: "Could not read the rover's row extension settings. Try again after reconnecting." });
      }
    }
  }, []);

  useEffect(() => {
    clearPreview();
    if (!connected) {
      requestRef.current += 1;
      setState(EMPTY_STATE);
      return;
    }
    void refresh();
  }, [connected, missionId, trajectoryReady, pathSignature, clearPreview, refresh]);

  const preview = useCallback((choice: ExtensionChoice) => {
    const id = state.missionId;
    clearPreview();
    if (!id || !state.editable) return;
    const token = ++previewRef.current;
    setPreviewPending(true);
    previewTimerRef.current = setTimeout(() => {
      previewTimerRef.current = null;
      void previewMissionExtension(choice, id).then((response) => {
        if (mountedRef.current && token === previewRef.current && response.mission_id === id) {
          setPreviewState(response);
          setPreviewPending(false);
        }
      }).catch((error: unknown) => {
        if (!mountedRef.current || token !== previewRef.current) return;
        const detail = extensionErrorDetail(error);
        setPreviewError(detail.message);
        setPreviewPending(false);
        if (detail.code === "MISSION_CHANGED" || detail.code === "UPLOAD_REQUIRED") void refresh();
      });
    }, 350);
  }, [clearPreview, refresh, state.editable, state.missionId]);

  const apply = useCallback(async (choice: ExtensionChoice): Promise<ApplyExtensionOutcome> => {
    if (applyInFlightRef.current) return { status: "failed", message: "The rover is already applying a row extension change." };
    const id = state.missionId;
    if (!id || !state.editable) return { status: "failed", message: state.message ?? "The rover has not reported an editable mission." };
    applyInFlightRef.current = true;
    setApplying(true);
    clearPreview();
    requestRef.current += 1;
    try {
      const response = await applyMissionExtension(choice, id);
      const nextId = response.mission_id ?? id;
      if (mountedRef.current) {
        setState({
          availability: "available",
          missionId: nextId,
          settings: response.extension,
          bounds: response.limits,
          editable: response.editable,
          lockedReason: null,
          message: response.message,
          rowEnds: response.row_ends,
          geometry: response,
        });
      }
      return { status: "applied", changed: response.changed, missionId: nextId, message: response.message };
    } catch (error) {
      const detail = extensionErrorDetail(error);
      if (detail.code === "EXTENSION_APPLY_FAILED_UPLOAD_AGAIN" || detail.missionCleared) {
        if (mountedRef.current) setState({ ...EMPTY_STATE, availability: "absent" });
        return { status: "cleared", message: detail.message };
      }
      if (detail.code === "EXTENSION_NOT_APPLIED" && detail.missionId) {
        if (mountedRef.current) setState((previous) => ({ ...previous, missionId: detail.missionId }));
        void refresh();
        return { status: "restored", message: detail.message, missionId: detail.missionId };
      }
      void refresh();
      return {
        status: detail.code === "MISSION_CHANGED" ? "conflict" : "failed",
        message: detail.message,
      };
    } finally {
      applyInFlightRef.current = false;
      if (mountedRef.current) setApplying(false);
    }
  }, [clearPreview, refresh, state.editable, state.message, state.missionId]);

  return { ...state, previewState, previewError, previewPending, applying, refresh, preview, clearPreview, apply };
}
