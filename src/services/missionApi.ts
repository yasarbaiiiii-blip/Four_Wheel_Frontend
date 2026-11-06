/**
 * DYX 4WD Rover mission API.
 *
 * Backend responsibilities:
 * - Validate and store one active mission.csv
 * - Prepare the trajectory automatically after upload
 * - Control Start, Pause, Resume, Next, Skip, Stop and Clear
 *
 * The frontend never calculates dummy points or interpolation points.
 */

import type {
  DocumentPickerAsset,
} from "expo-document-picker";

import {
  PX4_MISSION,
} from "../config/px4Endpoints";

import {
  apiDelete,
  apiGet,
  apiPost,
  apiPostMultipart,
  apiPut,
} from "./apiClient";

import {
  FALLBACK_EXTENSION_BOUNDS,
  validateChoice,
  type ExtensionChoice,
  type ExtensionApplyResponse,
  type ExtensionPreviewResponse,
  type MissionExtensionResponse,
} from "../utils/missionExtension";

// ── Extension settings ────────────────────────────────────────────────────────

export type MissionExtensionMode =
  | "ENABLE"
  | "DISABLE";

export type MissionExecutionMode =
  | "AUTO"
  | "MANUAL";

export type MissionMarkingTool = "LASER" | "SPRAY";

export interface MissionUploadOptions {
  file: DocumentPickerAsset;

  extensionMode:
    MissionExtensionMode;

  /**
   * Used only when extensionMode is ENABLE.
   * Required for ENABLE so the exact operator-selected row-extension
   * distance is sent to the rover.
   */
  dummyPointDistanceM?: number;

  /** Used only when extensionMode is ENABLE; the rover defaults to 3.0 m. */
  triggerDistanceM?: number;
}

// ── Backend response types ────────────────────────────────────────────────────

export interface MissionUploadMetadata {
  schema_version: number;
  mission_id: string;
  active_filename: string;
  original_filename: string;
  checksum_sha256: string;

  coordinate_mode:
    | "gps"
    | "local"
    | string;

  extension_mode:
    MissionExtensionMode;

  dummy_point_distance_m:
    number | null;

  row_transition_threshold_m:
    number;

  total_points:
    number;

  uploaded_at:
    string;
}

// DYX RAW GNSS WAYPOINT DISPLAY
// Backend-computed, DISPLAY-ONLY physical stop measurement.
// Frontend must never recompute this from latitude/longitude.
export interface RawGnssSurveySnapshot {
  measurement_source?: "RAW_GNSS_SURVEY" | string;
  truth_frame?: string;
  available: boolean;
  reason?: string | null;

  point_id?: string | null;
  point_index?: number | null;

  target_latitude_deg?: number | null;
  target_longitude_deg?: number | null;

  stopped_latitude_deg?: number | null;
  stopped_longitude_deg?: number | null;

  north_error_m?: number | null;
  east_error_m?: number | null;

  along_track_error_mm?: number | null;
  cross_track_error_mm?: number | null;
  radial_error_mm?: number | null;

  fix_type?: number | null;
  satellites?: number | null;
  horizontal_accuracy_m?: number | null;
  sample_count?: number;
  sample_scatter_m?: number | null;

  tolerance_m?: number | null;
  within_tolerance?: boolean | null;

  [key: string]: unknown;
}

export interface MissionRuntimeState {
  state?: string;
  loaded?: boolean;
  ready?: boolean;

  /**
   * True once trajectory_generator has committed the fixed surveyed
   * P1->Pn /nav_path. This is independent of mission-manager READY/START.
   */
  trajectory_ready?: boolean;

  /**
   * True after POST /api/mission/load. START stays off until this is true.
   */
  accepted_for_start?: boolean;

  message?: string;
  error?: string | null;
  terminal_cleanup_status?: string | null;
  terminal_cleanup_error?: string | null;

  pause_reason?: string | null;
  resume_available?: boolean;
  pause_available?: boolean;
  skip_available?: boolean;

  /**
   * Backend-owned power-cycle recovery state.
   * The frontend must only project these fields; it never decides recovery.
   */
  recovery_required?: boolean;
  recovery_available?: boolean;
  recovery_state?: string | null;
  recovery_reason?: string | null;
  recovery_previous_state?: string | null;
  recovery_current_point_id?: string | null;
  recovery_current_point_number?: number | null;
  recovery_saved_at?: string | null;
  recovery_error?: string | null;

  gps_fix_type?: number;

  rtk_state?: string | null;
  rtk_fixed?: boolean;
  rtk_healthy?: boolean;
  rtk_motion_ok?: boolean;
  rtk_reason?: string | null;
  rtk_correction_age_sec?: number | null;

  backend_heartbeat_healthy?: boolean;

  mission_enable?: boolean;
  emergency_stop?: boolean;
  px4_connected?: boolean;
  px4_link_ok?: boolean;
  px4_link_reason?: string | null;
  px4_armed?: boolean;

  arrival_settle_elapsed_sec?: number;
  arrival_settle_required_sec?: number;

  mission_id?: string;
  mission_run_id?: string | null;
  filename?: string;

  coordinate_mode?: string;

  extension_mode?:
    MissionExtensionMode;
  extension?: {
    enabled: boolean;
    distance_m: number | null;
    trigger_m: number;
    source: string | null;
  };
  extension_editable?: boolean;

  execution_mode?: MissionExecutionMode;
  marking_tool?: MissionMarkingTool;
  default_execution_mode?: MissionExecutionMode;
  default_marking_tool?: MissionMarkingTool;
  defaults_source?: "launch" | "saved";
  laser_hold_point_id?: string | null;
  laser_hold_mode?: "STEADY" | "BLINK" | null;
  laser_on?: boolean;

  dummy_point_distance_m?:
    number | null;

  total_points?: number;

  completed_points?: number;
  failed_points?: number;
  skipped_points?: number;
  remaining_points?: number;

  current_point_index?: number;
  next_point_index?: number;

  /**
   * DISPLAY ONLY.
   * Frozen CSV-vs-RAW-GNSS snapshots keyed by P0001, P0002, ...
   * They do not control spray or mission state.
   */
  waypoint_survey_snapshots?:
    Record<string, RawGnssSurveySnapshot>;

  last_waypoint_survey_snapshot?: {
    point_id?: string | null;
    point_index?: number | null;
    mission_run_id?: string | null;
    event?: string | null;
    survey?: RawGnssSurveySnapshot | null;
    received_at?: string | null;
    [key: string]: unknown;
  } | null;

  waypoint_survey_run_id?: string | null;

  progress_pct?: number;

  navigation_point_count?: number;
  path_frame_id?: string;

  [key: string]: unknown;
}

export interface MissionUploadResponse {
  success: boolean;
  message: string;

  upload:
    MissionUploadMetadata;

  mission:
    MissionRuntimeState;
}

export interface MissionControlResponse {
  success: boolean;

  operation:
    | "prepare"
    | "load"
    | "start"
    | "pause"
    | "resume"
    | "next-point"
    | "skip-point"
    | "stop"
    | "clear"
    | "restore"
    | string;

  message?: string;

  mission:
    MissionRuntimeState;
}

export interface MissionStatusResponse {
  success: boolean;
  mission: MissionRuntimeState;
}

export interface MissionHistoryEntry {
  mission_id: string;
  original_filename?: string;
  coordinate_mode?: string;
  extension_mode?: MissionExtensionMode | string;
  dummy_point_distance_m?: number | null;
  total_points?: number;
  uploaded_at?: string | null;
  archived_at?: string | null;
  checksum_sha256?: string;
}

export interface MissionHistoryResponse {
  success: boolean;
  missions: MissionHistoryEntry[];
}

// ── Canonical Mission Report ──────────────────────────────────────────────────

export type MissionReportPointStatus =
  | "PENDING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export type RppTerminalOutcome =
  | "CAPTURED"
  | "MISSED"
  | null;

export interface MissionReportAccuracy {
  /**
   * RPP is the ONLY final marking-accuracy authority.
   */
  measurement_source:
    "RPP_TERMINAL_RESULT";

  /**
   * True only when an RPP terminal result exists
   * for this marking point.
   *
   * PENDING / SKIPPED normally return false.
   */
  available: boolean;

  /**
   * Signed lateral error from RPP.
   */
  cross_track_error_mm:
    number | null;

  /**
   * Signed front/back error from RPP.
   */
  along_track_error_mm:
    number | null;

  /**
   * Exact radial/overall terminal error from RPP.
   */
  overall_accuracy_mm:
    number | null;

  /**
   * Compatibility alias from backend.
   * Frontend Mission Report should use
   * overall_accuracy_mm.
   */
  total_accuracy_mm?:
    number | null;

  tolerance_mm:
    number | null;

  /**
   * Copied from RPP terminal result.
   * Frontend must not calculate this.
   */
  within_tolerance?:
    boolean | null;

  rpp_outcome?:
    RppTerminalOutcome;

  /**
   * Independent DISPLAY-ONLY physical stop measurement:
   * uploaded CSV coordinate vs RAW GPS1 RTK stop.
   */
  survey?: RawGnssSurveySnapshot | null;

  captured_at:
    string | null;
}

export interface MissionReportSpray {
  attempted: boolean;

  outcome: string;

  confirmed:
    boolean | null;

  reason:
    string | null;

  elapsed_sec:
    number | null;
}

export interface MissionReportPoint {
  point_id: string;

  point_index: number;

  /**
   * 1-based point number.
   * P1 = sequence 1.
   */
  sequence: number;

  status:
    MissionReportPointStatus;

  is_active: boolean;

  accuracy:
    MissionReportAccuracy;

  spray:
    MissionReportSpray;

  reason:
    string | null;

  updated_at:
    string | null;

  target:
    Record<string, unknown>;
}

export interface MissionReportSummary {
  total_points: number;

  pending_points: number;

  completed_points: number;

  failed_points: number;

  skipped_points: number;

  resolved_points: number;

  progress_percent: number;
}

export interface CanonicalMissionReport {
  schema_version: number;

  source: string;

  lifecycle: string;

  report_id: string;

  mission_id: string;

  mission_run_id:
    string | null;

  generated_at: string;

  state: string;

  summary:
    MissionReportSummary;

  points:
    MissionReportPoint[];

  [key: string]:
    unknown;
}

export interface MissionReportResponse {
  success: boolean;

  available: boolean;

  report:
    CanonicalMissionReport | null;
}


export interface LoadedPathPoint {
  x?: number;
  y?: number;
  latitude?: number;
  longitude?: number;
  type?: "marking" | "extension" | "path";
  marking_index?: number;
  label?: string;

  [key: string]: unknown;
}

export interface LoadedPathResponse {
  success: boolean;
  mission_id?: string | null;
  signature?: string | null;

  frame_id:
    string | null;

  navigation_point_count:
    number;

  preview_truncated:
    boolean;

  points:
    LoadedPathPoint[];

  /**
   * Identity of the verified generator snapshot (new backend). `null` or absent
   * on old backends / while no verified snapshot is live: such a response is the
   * legacy capped preview and must never replace a path already pushed.
   */
  snapshot?: {
    server_instance_id: string;
    seq: number;
    mission_id: string;
    signature: string;
  } | null;

  /**
   * Present when the new backend has no live snapshot: why there are no points.
   * "assembling" = keep waiting; "invalid" = a new preparation is required.
   */
  snapshot_state?: "live" | "assembling" | "invalid" | "idle" | "disabled";
  snapshot_reason?: string | null;
  requires_reprepare?: boolean;
  assembling?: boolean;
  /** Ordering identity of this response (not-live case). */
  server_instance_id?: string;
  seq?: number;
}

export interface DeleteMissionResponse {
  success: boolean;
  deleted: boolean;
  message: string;
  mission: MissionRuntimeState;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateCsvFile(
  file: DocumentPickerAsset,
): void {
  const filename =
    file.name?.trim() ?? "";

  if (!file.uri) {
    throw new Error(
      "The selected CSV file has no readable URI.",
    );
  }

  if (
    !filename ||
    !filename
      .toLowerCase()
      .endsWith(".csv")
  ) {
    throw new Error(
      "Please select a valid CSV mission file.",
    );
  }
}

// ── Mission upload ────────────────────────────────────────────────────────────

export async function uploadMissionCsv(
  options: MissionUploadOptions,
): Promise<MissionUploadResponse> {
  const {
    file,
    extensionMode,
    dummyPointDistanceM,
    triggerDistanceM,
  } = options;

  validateCsvFile(file);

  if (
    extensionMode !== "ENABLE" &&
    extensionMode !== "DISABLE"
  ) {
    throw new Error(
      "Extension mode must be ENABLE or DISABLE.",
    );
  }

  if (
    extensionMode === "ENABLE"
  ) {
    if (dummyPointDistanceM === undefined) {
      throw new Error(
        "Enter an extension distance before enabling row extension.",
      );
    }

    const validation = validateChoice({
      enabled: true,
      distanceM: dummyPointDistanceM,
      triggerDistanceM:
        triggerDistanceM ??
        FALLBACK_EXTENSION_BOUNDS.default_trigger_m,
    });
    const problem = validation.distanceError ?? validation.triggerError;
    if (problem) {
      throw new Error(problem);
    }
  }

  const formData =
    new FormData();

  /**
   * React Native fetch accepts this URI-based file object.
   * The `any` cast is required because browser FormData typings expect Blob,
   * while React Native accepts uri/name/type.
   */
  formData.append(
    "file",
    {
      uri: file.uri,
      name:
        file.name ||
        "mission.csv",
      type:
        file.mimeType ||
        "text/csv",
    } as any,
  );

  formData.append(
    "extension_mode",
    extensionMode,
  );

  if (
    extensionMode === "ENABLE" &&
    dummyPointDistanceM !== undefined
  ) {
    formData.append(
      "dummy_point_distance_m",
      String(
        dummyPointDistanceM,
      ),
    );

    if (triggerDistanceM !== undefined) {
      formData.append(
        "trigger_distance_m",
        String(triggerDistanceM),
      );
    }

    // The rover honours dummy_point_distance_m only with this marker;
    // earlier builds sent a fixed 3.5 m that it must keep ignoring.
    formData.append(
      "extension_distance_source",
      "OPERATOR",
    );
  }

  return apiPostMultipart<MissionUploadResponse>(
    PX4_MISSION.UPLOAD,
    formData,
    {
      timeoutMs: 60_000,
    },
  );
}

/** Row-extension settings, limits and row-end geometry of the staged mission. */
export async function getMissionExtension(): Promise<MissionExtensionResponse> {
  return apiGet<MissionExtensionResponse>(PX4_MISSION.EXTENSION);
}

/** Preview changes without mutating the staged mission. */
export async function previewMissionExtension(
  choice: ExtensionChoice,
  missionId: string,
): Promise<ExtensionPreviewResponse> {
  return apiPost<ExtensionPreviewResponse>(
    PX4_MISSION.EXTENSION_PREVIEW,
    {
      enabled: choice.enabled,
      ...(choice.enabled ? { distance_m: choice.distanceM, trigger_m: choice.triggerDistanceM } : {}),
      mission_id: missionId,
    },
  );
}

/** A changed apply rebuilds the staged mission under a new ID. */
export async function applyMissionExtension(
  choice: ExtensionChoice,
  missionId: string,
): Promise<ExtensionApplyResponse> {
  return apiPut<ExtensionApplyResponse>(
    PX4_MISSION.EXTENSION,
    {
      enabled: choice.enabled,
      ...(choice.enabled ? { distance_m: choice.distanceM, trigger_m: choice.triggerDistanceM } : {}),
      mission_id: missionId,
    },
    { timeoutMs: 60_000 },
  );
}

export async function loadMission(missionId?: string): Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.LOAD,
    missionId ? { mission_id: missionId } : undefined,
    { timeoutMs: 15_000 },
  );
}

export async function restoreMission(missionId: string): Promise<MissionControlResponse> {
  const id = missionId.trim();
  if (!id) throw new Error("A mission ID is required to restore a mission.");
  return apiPost<MissionControlResponse>(PX4_MISSION.RESTORE, { mission_id: id }, { timeoutMs: 60_000 });
}

// ── Mission information ───────────────────────────────────────────────────────

export async function getMissionStatus():
Promise<MissionStatusResponse> {
  return apiGet<MissionStatusResponse>(
    PX4_MISSION.STATUS,
  );
}

export async function getMissionHistory(): Promise<MissionHistoryResponse> {
  return apiGet<MissionHistoryResponse>(PX4_MISSION.HISTORY);
}
/**
 * Canonical Mission Report.
 *
 * Accuracy values are already calculated by RPP.
 * This function only retrieves them.
 *
 * Frontend must NOT calculate:
 * - cross-track
 * - along-track
 * - overall accuracy
 */
export async function getMissionReport():
Promise<MissionReportResponse> {
  return apiGet<MissionReportResponse>(
    PX4_MISSION.REPORT,
  );
}

export async function getLoadedMissionPath():
Promise<LoadedPathResponse> {
  return apiGet<LoadedPathResponse>(
    PX4_MISSION.LOADED_PATH,
  );
}

export function getMissionDownloadUrl(
  backendURL: string,
): string {
  return (
    `${backendURL.replace(/\/+$/, "")}` +
    PX4_MISSION.FILE
  );
}

// ── Mission controls ──────────────────────────────────────────────────────────

export async function prepareMission(missionId?: string):
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.PREPARE,
    missionId ? { mission_id: missionId } : undefined,
  );
}

export async function setMissionExecutionMode(
  executionMode: MissionExecutionMode,
): Promise<MissionControlResponse> {
  if (
    executionMode !== "AUTO" &&
    executionMode !== "MANUAL"
  ) {
    throw new Error(
      "Mission execution mode must be AUTO or MANUAL.",
    );
  }

  return apiPost<MissionControlResponse>(
    PX4_MISSION.EXECUTION_MODE,
    {
      execution_mode: executionMode,
    },
  );
}

/** Select the backend-authoritative marking actuator for the next mission. */
export async function setMissionMarkingTool(
  markingTool: MissionMarkingTool,
): Promise<MissionControlResponse> {
  if (markingTool !== "LASER" && markingTool !== "SPRAY") {
    throw new Error("Mission marking tool must be LASER or SPRAY.");
  }
  return apiPost<MissionControlResponse>(PX4_MISSION.MARKING_TOOL, {
    marking_tool: markingTool,
  });
}

/** Persist the currently backend-confirmed execution mode and marking tool. */
export async function saveMissionDefaults(): Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(PX4_MISSION.DEFAULTS);
}

export async function startMission(missionId?: string):
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.START,
    missionId ? { mission_id: missionId } : undefined,
    { timeoutMs: 35_000 },
  );
}

export async function pauseMission():
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.PAUSE,
  );
}

export async function resumeMission():
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.RESUME,
    undefined,
    { timeoutMs: 35_000 },
  );
}

export async function nextMissionPoint():
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.NEXT_POINT,
    undefined,
    { timeoutMs: 35_000 },
  );
}

export async function skipMissionPoint():
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.SKIP_POINT,
  );
}

export async function stopMission():
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.STOP,
    undefined,
    { timeoutMs: 25_000 },
  );
}

/**
 * Clears generated path and runtime mission progress.
 * The active mission.csv remains stored.
 */
export async function clearMission():
Promise<MissionControlResponse> {
  return apiPost<MissionControlResponse>(
    PX4_MISSION.CLEAR,
  );
}

/**
 * Deletes the active mission.csv completely.
 * This is different from Clear.
 */
export async function deleteMissionCsv():
Promise<DeleteMissionResponse> {
  return apiDelete<DeleteMissionResponse>(
    PX4_MISSION.FILE,
  );
}

export default {
  uploadMissionCsv,
  loadMission,
  restoreMission,

  getMissionStatus,
  getMissionHistory,
  getMissionReport,
  getLoadedMissionPath,
  getMissionDownloadUrl,

  prepareMission,
  setMissionExecutionMode,
  setMissionMarkingTool,
  saveMissionDefaults,

  startMission,
  pauseMission,
  resumeMission,
  nextMissionPoint,
  skipMissionPoint,
  stopMission,
  clearMission,

  deleteMissionCsv,
};
