import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { shareUnchangedRows } from "../utils/markingPointTableRows";
import {
  countSocketPacket,
  markPointEventReceived,
  markPointRowDisplayed,
  useRenderCounter,
} from "../utils/realtimeDiagnostics";
import {
  EMPTY_POINT_RESULTS,
  applyPointResult,
  indexRuntimePointResults,
  newerPointResult,
  parsePointResultEvent,
  pointResultsForRun,
  pruneToIdentity,
  type MissionIdentity,
  type PointResultMap,
} from "../utils/pointResultStore";
import {
  AppState,
  Animated,
  Easing,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  View,
  StyleSheet,
  StatusBar,
  Text,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme/colors";
import { Toast } from "../components/shared/Toast";
import { SettingsScreen } from "./SettingsScreen";
import { MissionProgressCard } from "../components/missionreport/MissionProgressCard";
import {
  CoalescedRefresh,
  classifyMissionEventForReport,
  isTerminalPointEventPayload,
} from "../utils/reportRefreshScheduler";
import { QuickNtripStartCard } from "../components/missionreport/QuickNtripStartCard";
import { EstopControls } from "../components/shared/EstopControls";
import {
  admitMissionStatus,
  isStopTerminalState,
  runStopCommand,
  type StopFencePhase,
} from "../utils/missionStopFence";
import { ManualDrivePanel } from "../components/manual/ManualDrivePanel";
import MissionControlCard from "../components/missionreport/MissionControlCard";
import { WaypointsTable } from "../components/missionreport/WaypointsTable";
import { DraggableCard } from "../components/shared/DraggableCard";
import { MissionTableHeader } from "../components/missionreport/MissionTableHeader";
import { MissionTableToolbarActions } from "../components/missionreport/MissionTableToolbarActions";
import {
  useMissionProgressOverlay,
  migrateLegacyPanelVisibility,
} from "../context/MissionProgressOverlayContext";
import {
  MISSION_PROGRESS_LAYOUT,
  getMissionProgressBottomTableInsets,
} from "../constants/missionProgressLayout";
import { PATH_PLAN_GLASS } from "../constants/pathPlanGlass";
import {
  Mode,
  Waypoint,
} from "../components/missionreport/types";
import { RTKInjectionScreen } from "../components/missionreport/RTKInjectionScreen";
import { useTelemetryControl } from "../context/TelemetryContext";
import type { RoverTelemetry } from "../types/telemetry";
import {
  shallowEqual,
  useLiveTelemetrySelector,
  useLiveTelemetryStore,
  type LiveTelemetrySnapshot,
} from "../context/liveTelemetryStore";
import {
  LiveAccuracyMonitorPanel,
  LiveDistanceToTargetPanel,
  LiveMissionMap,
  LiveVehicleStatusCard,
  isTelemetryMissionActive,
} from "../components/missionreport/LiveTelemetryPanels";
import { useFieldMap } from "../context/FieldMapContext";
import { useBackendTrajectory } from "../context/BackendTrajectoryContext";
import { useConnection } from "../context/ConnectionContext";
import { useMission } from "../context/MissionContext";
import { AutoAssignDialog } from "../components/missionreport/AutoAssignDialog";
import { WaypointPreviewDialog } from "../components/missionreport/WaypointPreviewDialog";
import { MissionCompletionDialog } from "../components/missionreport/MissionCompletionDialog";
import { LogClearDialog } from "../components/missionreport/LogClearDialog";
import { useScreenReadiness } from "../hooks/useComponentReadiness";
import PersistentStorage from "../services/PersistentStorage";
import { getRtkStatus, startRtk } from "../services/rtkService";
import { formatRtkApiError } from "../services/rtkService";
import {
  decideMissionRtkQuickStart,
  toRtkControlView,
  unwrapRtkStatus,
  type RtkHeadlineState,
} from "../adapters/rtkControlAdapter";
import {
  armVehicle,
  setManualMode,
} from "../services/vehicleControlService";
// NOTE: calculateAccuracy and formatAccuracyDisplay commented out - now using backend wp_dist_cm
// import { calculateAccuracy, formatAccuracyDisplay } from '../utils/accuracyCalculation';
import { getAccuracyLevel } from "../utils/accuracyCalculation";
import type { UsePointMissionEventsResult } from "../hooks/usePointMissionEvents";

const EMPTY_POINT_EVENTS: UsePointMissionEventsResult = {
  statusMap: {},
  waitingForContinue: false,
  currentPointIndex: null,
  lastEventId: null,
  expectedGeneration: null,
  missionTerminal: null,
  resetStatusMap: () => undefined,
  acknowledgeContinueSuccess: () => undefined,
  clearMissionTerminal: () => undefined,
};
import {
  POINT_MISSION_ENABLED,
  JOYSTICK_OFFLINE_UI_PREVIEW_BYPASS,
} from "../config/featureFlags";
import { isOfflineMode } from "../config";
import {
  buildLegacyStatusMapFromPointMap,
  mergeLegacyStatusMap,
  pointIndexToSn,
} from "../adapters/px4PointStatusBridge";
import { useVerifiedMissionContext } from "../context/VerifiedMissionContext";
import { useVerifiedMissionProgress } from "../hooks/useVerifiedMissionProgress";
import { verifiedProgressToLegacy } from "../adapters/verifiedTargetBridge";
import { getMissionProgressRef } from "../utils/missionStatusPresentation";
import { pauseNotice, pauseReasonText } from "../utils/pauseReasonPresentation";
import {
  getMissionStartEligibility,
  isMissionStoredOnRover,
  classifyMissionStartOutcome,
  shouldSkipExecutionModePost,
} from "../utils/missionStartEligibility";
import { shouldAcceptCanonicalReport } from "../utils/missionReportRunGuard";
import {
  isSameMissionRuntimeLifecycle,
  isSameMissionPointResults,
  resolveEffectiveMissionLifecycle,
} from "../utils/missionLifecycleState";
import {
  extractRawGnssSurvey,
  pickBestRawGnssSurvey,
} from "../utils/rawGnssSurvey";
import {
  createMissionStartAttemptId,
  logMissionStartTiming,
} from "../utils/missionStartTiming";
import {
  getMissionStatus,
  getMissionReport,
  uploadMissionCsv,
  loadMission,
  restoreMission,
  setMissionExecutionMode,
  prepareMission,
  startMission,
  pauseMission,
  resumeMission,
  nextMissionPoint,
  skipMissionPoint,
  stopMission,
  clearMission,
  getMissionExtension,
  type MissionRuntimeState,
  type CanonicalMissionReport,
  type RawGnssSurveySnapshot,
} from "../services/missionApi";
import * as FileSystem from "expo-file-system/legacy";
import { buildMissionCsvFromWaypoints } from "../utils/missionCsv";
import {
  choiceFromSettings,
  DEFAULT_EXTENSION_CHOICE,
  extensionErrorDetail,
  extensionPointFeatures,
  type ExtensionChoice,
} from "../utils/missionExtension";
import { canLoadBackendPreview } from "../utils/backendTrajectoryPreview";
import { MissionExtensionDistanceDialog } from "../components/pathplan/MissionExtensionDistanceDialog";
import { useMissionExtension } from "../hooks/pathplan/useMissionExtension";
import { downloadFileToDevice, getMimeType } from "../utils/downloadHelper";
import { useDraftHistory } from "../hooks/useDraftHistory";
import {
  removeMissionWaypoint,
  reverseMissionWaypoints,
  sameMissionRoute,
} from "../utils/missionEdit";
import {
  computeMissionProgress,
  elapsedSec,
  estimateRemainingSec,
  formatDuration,
  hrmsToMm,
  pointAccuracyMm,
  type PointStatusMap,
} from "../utils/missionProgressMetrics";
import { gnssFixLabel as commandRtkLabel } from "../utils/gnssFixLabel";
import { modeDisplayLabel } from "../adapters/px4ModeAdapter";
import { getDeckControlState } from "../utils/missionDeckControls";
import {
  isTerminalWaypointStatus,
  type WaypointUiStatus,
} from "../types/missionWaypointStatus";
import {
  MissionDeckControls,
  type DeckPendingAction,
} from "../components/missionreport/MissionDeckControls";
import { MissionEditToolbar } from "../components/missionreport/MissionEditToolbar";
import { MissionExportSheet } from "../components/missionreport/MissionExportSheet";
import MissionReportExport from "../components/missionreport/MissionReportExport";

import {
  projectBackendMissionReport,
  projectCanonicalReportForExport,
  reconcileMissionReportRow,
} from "../adapters/backendMissionReportAdapter";

import {
  captureTerminalRppAccuracy,
  formatTerminalRppAccuracy,
  isTerminalRppAccuracyStatus,
  selectMissionReportRemark,
  type TerminalRppAccuracySnapshot,
} from "../adapters/terminalRppAccuracyFallback";

// Status map type matching web application
type WpStatus = {
  reached?: boolean;
  marked?: boolean;
  status?:
    | "completed"
    | "loading"
    | "skipped"
    | "reached"
    | "marked"
    | "pending"
    | "spray_on"
    | "spray_off"
    | "passed"
    | "mission_end"
    | "failed"
    | "aborted"
    | "stopped";
  timestamp?: string;
  pile?: string | number;
  rowNo?: string | number;
  remark?: string;
  // Accuracy tracking fields
  hrms?: number; // Horizontal accuracy (meters)
  vrms?: number; // Vertical accuracy (meters)
  lat_achieved?: number; // Actual rover lat when reached
  lon_achieved?: number; // Actual rover lon when reached
  accuracy_level?: string; // 'excellent' | 'good' | 'fair' | 'poor'
  position_error_cm?: number; // Distance error in cm (was position_error_mm)

  // DYX RAW GNSS WAYPOINT DISPLAY
  // Frozen display-only physical stop snapshot from backend.
  survey?: RawGnssSurveySnapshot | null;
};

/**
 * Calculate target-to-rover horizontal position error in millimetres.
 * Kept local so MissionReportScreen does not depend on an incompatible
 * calculateAccuracy return shape.
 */

const getRtkFailureMessage = (err: unknown, fallback: string) =>
  formatRtkApiError(err, fallback);

type PlanOpenIntent = "upload";

interface MissionReportScreenProps {
  isVisible?: boolean;
  embedMap?: boolean;
  /** Increments after a home-screen file upload so status is refreshed now. */
  missionUploadCompletedToken?: number;
  /** Lets the shell reveal mission tools before status polling catches up. */
  missionUploadConfirmed?: boolean;
  onMissionCleared?: () => void;
  /** Opens the existing route-authoring tools inside the unified workspace. */
  onOpenPlan?: (intent?: PlanOpenIntent) => void;
}

/** The only telemetry the screen itself re-renders for (slow-changing). */
function selectScreenTelemetry(snapshot: LiveTelemetrySnapshot) {
  return {
    missionStatus: snapshot.telemetry.mission?.status,
  };
}

/** Canonical report confirmation read after a meaningful mission event. */
const LIVE_REPORT_REFRESH_DELAY_MS = 80;

export default function MissionReportScreen({
  isVisible = true,
  embedMap = false,
  missionUploadCompletedToken = 0,
  missionUploadConfirmed = false,
  onMissionCleared,
  onOpenPlan,
}: MissionReportScreenProps) {
  useRenderCounter("MissionReportScreen");
  const DEBUG_MISSION_LOGS = false;
  const missionLog = (...args: any[]) => {
    if (DEBUG_MISSION_LOGS) console.log(...args);
  };
  const mapBackendMissionModeToUiMode = (backendMode: unknown): Mode | null => {
    const normalized = String(backendMode ?? "")
      .trim()
      .toLowerCase();
    if (normalized === "auto") return "AUTO";
    if (normalized === "manual") return "MANUAL";
    if (normalized === "continuous") return "CONTINUOUS";
    if (normalized === "dash") return "DASH";
    return null;
  };
  // High-rate telemetry is NOT subscribed here: the screen re-renders only
  // when its slow slice changes. Live panels subscribe to their own slices.
  const { onMissionEvent, socket, socketTransport, pointEvents, missionLifecycle } =
    useTelemetryControl();
  const liveStore = useLiveTelemetryStore();
  const screenTelemetry = useLiveTelemetrySelector(selectScreenTelemetry, shallowEqual);
  const { setMissionSnapshot } = useFieldMap();
  const {
    preview,
    authoringChanged,
    invalidateForUpload,
    resumePreviewAfterFailedUpload,
    clearTrajectory,
    refreshNow,
    markLoadAccepted,
  } = useBackendTrajectory();
  const { services, connectionState } = useConnection();

  // Home-screen Load and Row Extension. The old planner panels are disabled,
  // so these are the operator's only way to reach both actions.
  const missionExtension = useMissionExtension({
    missionId: preview.missionId,
    trajectoryReady: preview.liveTrajectoryReady,
    pathSignature: preview.pushMeta?.signature ?? null,
    connected: connectionState === "connected",
  });
  const [showExtensionDialog, setShowExtensionDialog] = useState(false);
  const [heldExtensionChoice, setHeldExtensionChoice] =
    useState<ExtensionChoice>(DEFAULT_EXTENSION_CHOICE);
  const [isApplyingHomeExtension, setIsApplyingHomeExtension] = useState(false);
  const [isLoadingHomeMission, setIsLoadingHomeMission] = useState(false);
  const homeMissionRequestRef = useRef(false);
  const extensionDialogChoice = useMemo(
    (): ExtensionChoice =>
      missionExtension.settings
        ? choiceFromSettings(
            missionExtension.settings,
            missionExtension.bounds,
          )
        : heldExtensionChoice,
    [
      missionExtension.settings,
      missionExtension.bounds,
      heldExtensionChoice,
    ],
  );
  const extensionMapPreview = showExtensionDialog && missionExtension.previewState?.mission_id === preview.missionId
    ? missionExtension.previewState.points : null;
  const extensionMapPoints = useMemo(() => {
    if (extensionMapPreview) return extensionPointFeatures(extensionMapPreview);
    if (missionExtension.missionId !== preview.missionId) return null;
    const typed = preview.points.some((point) => point.type != null);
    const points = typed ? preview.points : missionExtension.rowEnds.flatMap((row) =>
      row.result === "ADDED" && row.extension_point ? [{ ...row.extension_point, type: "extension" as const }] : []);
    return extensionPointFeatures(points);
  }, [extensionMapPreview, missionExtension.missionId, missionExtension.rowEnds, preview.missionId, preview.points]);

  // 4WD verified mission hooks
  const verifiedCtx = useVerifiedMissionContext();
  const {
    verifiedProgressMap,

    currentTargetIndex: verifiedTargetIndex,

    missionTerminal: verifiedTerminal,

    waitingForContinue: verifiedWaiting,

    resetProgress: resetVerifiedProgress,

    clearMissionTerminal: clearVerifiedTerminal,
  } = useVerifiedMissionProgress(
    socket,
    connectionState,
    verifiedCtx.missionId,
    verifiedCtx.totalTargets,
  );

  const {
    statusMap: pointStatusMap,
    waitingForContinue: px4WaitingForContinue,
    currentPointIndex: px4CurrentPointIndex,
    missionTerminal: px4MissionTerminal,
    resetStatusMap: resetPointStatusMap,
    clearMissionTerminal,
  } = pointEvents ?? EMPTY_POINT_EVENTS;
  const {
    missionWaypoints,
    setMissionWaypoints,
    clearMissionWaypoints,
    missionMode,
    setMissionMode,
  } = useMission();
  const [mode, setMode] = useState<Mode>("AUTO");
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [statusMap, setStatusMap] = useState<Record<number, WpStatus>>({});

  const [backendMission, setBackendMissionState] =
    useState<MissionRuntimeState | null>(null);
  const [stopAwaitingTerminal, setStopAwaitingTerminal] = useState(false);
  const backendMissionRef = useRef<MissionRuntimeState | null>(null);
  const commandGenerationRef = useRef(0);
  const stopFencePhaseRef = useRef<StopFencePhase>("idle");
  // When the current backendMission object was accepted. Lets a newer
  // Socket.IO lifecycle push win over an older REST snapshot and vice versa.
  const backendMissionReceivedAtRef = useRef<number | null>(null);
  // When the last accepted socket mission_status arrived (REST ordering guard).
  const lastSocketMissionStatusAtRef = useRef(0);

  /**
   * The backend intentionally archives the active CSV after COMPLETED and
   * clears the active slot. Keep the last confirmed mission identity in the
   * screen so terminal status polling cannot turn a loaded mission into
   * "NO MISSION" while its report/path is still being displayed.
   */
  const [retainedMission, setRetainedMission] =
    useState<MissionRuntimeState | null>(null);
  const retainedMissionRef = useRef<MissionRuntimeState | null>(null);

  const rememberMission = useCallback((mission: MissionRuntimeState | null | undefined) => {
    if (!mission) return;

    const missionId = String(mission.mission_id ?? "").trim();
    const filename = String(mission.filename ?? "").trim();
    if (!missionId && !filename) return;

    // Only retain a mission that the rover has accepted/stored. This avoids
    // treating arbitrary status payloads as a loaded mission.
    if (!isMissionStoredOnRover(mission)) return;

    const previous = retainedMissionRef.current;
    const previousId = String(previous?.mission_id ?? "").trim();
    const previousFilename = String(previous?.filename ?? "").trim();
    const sameMission =
      (missionId && previousId && missionId === previousId) ||
      (!missionId && filename && previousFilename && filename === previousFilename);

    // The status endpoint is polled frequently. Once the identity is known,
    // do not replace the snapshot on every telemetry/status tick.
    if (sameMission) return;

    const next = mission;

    retainedMissionRef.current = next;
    setRetainedMission(next);
  }, []);

  const setBackendMission = useCallback(
    (
      mission: MissionRuntimeState | null | undefined,
      options?: { fresh?: boolean },
    ) => {
      const incoming = mission ?? null;
      const fencePhase = stopFencePhaseRef.current;
      if (!admitMissionStatus(fencePhase, incoming?.state, options?.fresh === true)) return;
      if (fencePhase !== "idle") {
        stopFencePhaseRef.current = "idle";
        setStopAwaitingTerminal(false);
        if (isStopTerminalState(incoming?.state)) {
          setCurrentIndex(null);
          setIsMissionActive(false);
          setWaitingForManual(false);
          preserveCurrentMission.current();
        }
      }
      setBackendMissionState((prev) => {
        // A compact mission_lifecycle@1 packet carries no point_results or
        // report. Merge it into the same mission/run's previous snapshot
        // instead of dropping those fields (which made REST and socket
        // snapshots flip the table back and forth).
        const next =
          incoming &&
          prev &&
          (incoming as { contract?: unknown }).contract === "mission_lifecycle@1" &&
          String(incoming.mission_id ?? "") === String(prev.mission_id ?? "") &&
          String(incoming.mission_run_id ?? "") === String(prev.mission_run_id ?? "")
            ? ({ ...prev, ...incoming } as MissionRuntimeState)
            : incoming;
        // Keep the old object only when no lifecycle field changed. A PAUSED
        // snapshot flipping resume_available must reach the Resume button.
        if (
          prev &&
          next &&
          isSameMissionRuntimeLifecycle(prev, next) &&
          isSameMissionPointResults(prev, next)
        ) {
          return prev;
        }
        backendMissionReceivedAtRef.current = Date.now();
        backendMissionRef.current = next;
        return next;
      });
      rememberMission(incoming);
    },
    [rememberMission],
  );

  // FastAPI emits this complete snapshot immediately on Socket.IO connection
  // and on every backend tick. It is the live marking-point authority; REST
  // remains a slow recovery/export path only.
  useEffect(() => {
    // This also protects embedded/retained uses of the screen: do not keep
    // reconciling the full lifecycle stream while the operator is working
    // elsewhere. The visible screen rehydrates immediately from REST.
    if (!isVisible || !socket || connectionState !== "connected") return;
    const handleMissionStatus = (raw: unknown) => {
      if (!raw || typeof raw !== "object") return;
      const incoming = raw as MissionRuntimeState;
      if (!admitMissionStatus(stopFencePhaseRef.current, incoming.state, true)) return;
      const current = backendMissionRef.current;
      const incomingId = String(incoming.mission_id ?? "").trim();
      const currentId = String(current?.mission_id ?? "").trim();
      const incomingRun = String(incoming.mission_run_id ?? "").trim();
      const currentRun = String(current?.mission_run_id ?? "").trim();
      if (current && ((currentId && incomingId && currentId !== incomingId) ||
        (currentRun && incomingRun && currentRun !== incomingRun))) return;

      lastSocketMissionStatusAtRef.current = Date.now();
      setBackendMission(incoming, { fresh: true });
      const state = String(incoming.state ?? "").trim().toUpperCase();
      const executionMode = mapBackendMissionModeToUiMode(incoming.execution_mode);
      if (executionMode) setMode(executionMode);
      setWaitingForManual(state === "WAITING_FOR_NEXT");
      setIsMissionActive(["RUNNING", "PAUSED", "WAITING_FOR_NEXT", "ARMING", "PREPARING"].includes(state));
    };
    socket.on("mission_status", handleMissionStatus);
    return () => {
      socket.off("mission_status", handleMissionStatus);
    };
  }, [isVisible, socket, connectionState, setBackendMission]);

  /*
   * Current-run immutable point results from Socket.IO point events.
   * One event updates exactly one entry; identity is checked against the
   * current mission/run so a previous run's late event can never land.
   */
  const [socketPointResults, setSocketPointResults] =
    useState<PointResultMap>(EMPTY_POINT_RESULTS);
  const liveMissionId = String(backendMission?.mission_id ?? "").trim() || null;
  const liveRunId = String(backendMission?.mission_run_id ?? "").trim() || null;
  const liveIdentity = useMemo<MissionIdentity>(
    () => ({ missionId: liveMissionId, runId: liveRunId }),
    [liveMissionId, liveRunId],
  );
  const liveIdentityRef = useRef(liveIdentity);
  useLayoutEffect(() => {
    // Only a committed identity may gate incoming point events.
    liveIdentityRef.current = liveIdentity;
  }, [liveIdentity]);

  useEffect(() => {
    setSocketPointResults((previous) => pruneToIdentity(previous, liveIdentity));
  }, [liveIdentity]);

  useEffect(() => {
    if (!isVisible || !socket || connectionState !== "connected") return;
    const names = [
      "point_completed",
      "point_failed",
      "point_skipped",
      "point_event",
    ] as const;
    const handlers = names.map((name) => {
      const handler = (raw: unknown) => {
        countSocketPacket(name);
        const entry = parsePointResultEvent(raw);
        if (!entry) return;
        markPointEventReceived(`${entry.runId}:${entry.pointId}`);
        setSocketPointResults((previous) =>
          applyPointResult(previous, entry, liveIdentityRef.current),
        );
      };
      socket.on(name, handler);
      return { name, handler };
    });
    return () => {
      handlers.forEach(({ name, handler }) => socket.off(name, handler));
    };
  }, [isVisible, socket, connectionState]);

  const currentRunSocketPointResults = useMemo(
    () => pointResultsForRun(socketPointResults, liveIdentity),
    [socketPointResults, liveIdentity],
  );

  // backendMission.point_results (REST / full socket snapshot), restricted to
  // the current run and indexed once so row lookup is O(1).
  const currentRunBackendPointResults = useMemo(
    () => indexRuntimePointResults(backendMission?.point_results, liveRunId),
    [backendMission?.point_results, liveRunId],
  );

  const clearRetainedMission = useCallback(() => {
    retainedMissionRef.current = null;
    setRetainedMission(null);
  }, []);

  const [canonicalMissionReport, setCanonicalMissionReport] =
    useState<CanonicalMissionReport | null>(null);
  const canonicalMissionReportRef = useRef<CanonicalMissionReport | null>(
    null,
  );
  const staleMissionRunIdRef = useRef<string | null>(null);
  const holdingForNewReportRunRef = useRef(false);
  const [isPreparingMission, setIsPreparingMission] = useState(false);
  const [isStartingMission, setIsStartingMission] = useState(false);
  const startTimingAttemptRef = useRef<string | null>(null);
  // The confirmation dialog can be tapped again before React has rendered the
  // button's loading state. Keep a synchronous guard so duplicate START calls
  // never queue behind the first rover-side startup sequence.
  const startInFlightRef = useRef(false);
  const startOriginRef = useRef<{ lat: number; lon: number } | null>(null);
  const firstMotionLoggedRef = useRef(false);
  const lastLoggedStartPhaseRef = useRef<string | null>(null);

  /**
   * Temporary frontend fallback for terminal RPP accuracy.
   *
   * Key = waypoint serial number (1-based wp.sn).
   *
   * Once captured it NEVER follows live telemetry again.
   * The canonical Mission Report replaces it automatically
   * when report accuracy becomes available.
   */
  const [
    terminalRppAccuracyFallbackMap,
    setTerminalRppAccuracyFallbackMap,
  ] = useState<
    Record<
      number,
      TerminalRppAccuracySnapshot
    >
  >({});

  const terminalRppAccuracyFallbackRef =
    useRef<
      Record<
        number,
        TerminalRppAccuracySnapshot
      >
    >({});

  const clearTerminalRppAccuracyFallback =
    useCallback(() => {
      terminalRppAccuracyFallbackRef.current =
        {};

      setTerminalRppAccuracyFallbackMap(
        {},
      );
    }, []);

  // STATUS DOWNGRADE GUARD: Defines priority order — higher index = more "final"
  // Once a waypoint reaches 'completed' or 'skipped', backend events cannot regress it
  const STATUS_PRIORITY: Record<string, number> = {
    pending: 0,
    loading: 1,
    reached: 2,
    passed: 2,
    spray_on: 3,
    spray_off: 3,
    marked: 3,
    completed: 4,
    skipped: 4,
    mission_end: 4,
  };

  /** Returns true if the incoming status would be a downgrade from the existing one */
  const isStatusDowngrade = (
    existingStatus: string | undefined,
    incomingStatus: string | undefined,
  ): boolean => {
    if (!existingStatus || !incomingStatus) return false;
    const existingPriority = STATUS_PRIORITY[existingStatus] ?? 0;
    const incomingPriority = STATUS_PRIORITY[incomingStatus] ?? 0;
    return incomingPriority < existingPriority;
  };

  // Track screen readiness - prevents user actions until all components initialized
  const { isReady: screenReady } = useScreenReadiness(
    "mission-report-screen",
    "Mission Report Screen",
    async (setProgress) => {
      // No artificial delays — screen becomes ready as soon as async init completes
      setProgress(100, "Ready");
    },
    true, // critical
    [], // No dependencies
  );

  // Mission log persistence states
  const [previousMissionData, setPreviousMissionData] = useState<{
    waypoints: Waypoint[];
    statusMap: Record<number, WpStatus>;
    missionMode: string | null;
    startTime: Date | null;
    endTime: Date | null;
  } | null>(null);
  const [hasPendingMissionStart, setHasPendingMissionStart] = useState(false);
  const [notification, setNotification] = useState<{
    visible: boolean;
    type: "success" | "error" | "info";
    title?: string;
    message?: string;
  }>({ visible: false, type: "info", title: undefined, message: undefined });

  // Dialog states for mission upload workflow
  const [showAutoAssignDialog, setShowAutoAssignDialog] = useState(false);
  const [showWaypointPreviewDialog, setShowWaypointPreviewDialog] =
    useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [isUploadingMission, setIsUploadingMission] = useState(false);

  // Mission completion dialog state
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [showClearLogsDialog, setShowClearLogsDialog] = useState(false); // Post-export clear logs dialog
  // True when the dialog follows a saved export; false when opened from the Export sheet.
  const [clearLogsAfterExport, setClearLogsAfterExport] = useState(false);
  const [missionStartTime, setMissionStartTime] = useState<Date | null>(null);
  const [missionEndTime, setMissionEndTime] = useState<Date | null>(null);
  const [isMissionActive, setIsMissionActive] = useState(false); // Track if mission is currently running
  const [waitingForManual, setWaitingForManual] = useState(false); // MANUAL mode: waiting for user to press NEXT

  // Skip audit / undo support
  type SkipAuditRecord = {
    id: string;
    skipFrom: number;
    skipTo: number;
    timestamp: string;
    previousStatuses: Record<number, WpStatus | null>;
    undone?: boolean;
    undoneAt?: string | null;
  };

  const [skipHistory, setSkipHistory] = useState<SkipAuditRecord[]>([]);
  const [undoPrompt, setUndoPrompt] = useState<{
    visible: boolean;
    id?: string | null;
  }>({ visible: false, id: null });
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isBottomTableExpanded, setIsBottomTableExpanded] = useState(false);

  const [robotPanelHeight, setRobotPanelHeight] = useState(0);

  const [missionProgressPanelHeight, setMissionProgressPanelHeight] =
    useState(0);

  const { panelVisibility, setPanelVisibility, setPanelVisible } =
    useMissionProgressOverlay();
  const {
    robotStatus: isRobotStatusVisible,
    missionProgress: isMissionProgressVisible,
    distanceToTarget: isDistanceToTargetVisible,
    accuracyMonitor: isAccuracyMonitorVisible,
    missionControls: isMissionControlsVisible,
    bottom: isBottomTableVisible,
  } = panelVisibility;

  // RTK Injection overlay
  const [showRTKInjection, setShowRTKInjection] = useState(false);
  const [isQuickNtripStarting, setIsQuickNtripStarting] = useState(false);
  const [quickRtkState, setQuickRtkState] =
    useState<RtkHeadlineState>("off");
  const quickRtkStatusInFlightRef = useRef(false);
  const lastQuickRtkSocketAtRef = useRef(0);
  const [isManualPreparing, setIsManualPreparing] = useState(false);
  const [isManualDriveVisible, setIsManualDriveVisible] = useState(false);
  const missionControlsRestoreRef = useRef(false);
  const joystickSwapActiveRef = useRef(false);

  const openManualDrivePanel = useCallback(() => {
    setPanelVisibility((prev) => {
      missionControlsRestoreRef.current = prev.missionControls;
      joystickSwapActiveRef.current = true;
      return prev.missionControls ? { ...prev, missionControls: false } : prev;
    });
    setIsManualDriveVisible(true);
  }, [setPanelVisibility]);

  const closeManualDrivePanel = useCallback(() => {
    setIsManualDriveVisible(false);
  }, []);

  useEffect(() => {
    if (isManualDriveVisible) return;
    if (!joystickSwapActiveRef.current) return;
    joystickSwapActiveRef.current = false;
    if (missionControlsRestoreRef.current) {
      setPanelVisible("missionControls", true);
    }
    missionControlsRestoreRef.current = false;
  }, [isManualDriveVisible, setPanelVisible]);

  useEffect(() => {
    if (isManualDriveVisible && isMissionControlsVisible) {
      setPanelVisible("missionControls", false);
    }
  }, [isManualDriveVisible, isMissionControlsVisible, setPanelVisible]);

  const openRTKInjection = () => setShowRTKInjection(true);
  const closeRTKInjection = () => setShowRTKInjection(false);

  // TRAIL DISABLED: Trail tracking for rover path visualization
  // const [trailPoints, setTrailPoints] = useState<Array<{ latitude: number; longitude: number }>>([]);
  // const MAX_TRAIL_POINTS = 500;

  // Ref to track notification timeout for cleanup
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const missionReportSignatureRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  // Use waypoints from shared context for persistence across screens
  const waypoints = missionWaypoints;
  const PINNED_COUNT = 4;
  const canonicalReportProjection = useMemo(
    () => projectBackendMissionReport(canonicalMissionReport),
    [canonicalMissionReport],
  );

  const px4LegacyStatusMap = useMemo(
    () =>
      // Live HRMS/VRMS are not stamped onto historical rows (never displayed,
      // and they made every row rebuild at telemetry rate).
      buildLegacyStatusMapFromPointMap(pointStatusMap, waypoints),
    [pointStatusMap, waypoints],
  );

  const verifiedLegacyMap = useMemo(
    () => verifiedProgressToLegacy(verifiedProgressMap),
    [verifiedProgressMap],
  );

  const effectiveStatusMap = useMemo(() => {
    const base = POINT_MISSION_ENABLED
      ? mergeLegacyStatusMap(statusMap, px4LegacyStatusMap)
      : statusMap;
    return verifiedCtx.isLoaded
      ? mergeLegacyStatusMap(base, verifiedLegacyMap)
      : base;
  }, [statusMap, px4LegacyStatusMap, verifiedLegacyMap, verifiedCtx.isLoaded]);

  /**
   * ============================================================
   * TERMINAL RPP ACCURACY FALLBACK
   * ============================================================
   *
   * pointStatusMap receives terminal state immediately from:
   *
   * - point_completed
   * - point_failed
   * - authoritative point_status snapshot reconciliation
   *
   * /api/mission/report may lag behind that terminal state.
   *
   * During that short gap, freeze the current RPP accuracy exactly
   * once for the point that just became terminal.
   *
   * IMPORTANT:
   *
   * This does NOT calculate accuracy.
   * It copies already-calculated backend/RPP telemetry.
   *
   * It also does NOT continuously follow telemetry after capture.
   */
  // Transitional live-telemetry terminal capture, driven by a store
  // subscription so it never re-renders the screen at telemetry rate.
  // Only terminal points can be captured; recomputed when point status
  // changes so the per-packet subscription does not scan every point.
  const terminalCaptureCandidates = useMemo(
    () =>
      Object.entries(pointStatusMap).filter(([, entry]) =>
        isTerminalRppAccuracyStatus(entry.status),
      ),
    [pointStatusMap],
  );
  const terminalCaptureInputsRef = useRef({
    pointStatusMap,
    px4CurrentPointIndex,
    waypoints,
    candidates: terminalCaptureCandidates,
  });
  useLayoutEffect(() => {
    terminalCaptureInputsRef.current = {
      pointStatusMap,
      px4CurrentPointIndex,
      waypoints,
      candidates: terminalCaptureCandidates,
    };
  }, [pointStatusMap, px4CurrentPointIndex, waypoints, terminalCaptureCandidates]);
  const runTerminalCaptureRef = useRef<(telemetry: RoverTelemetry) => void>(
    () => {},
  );
  runTerminalCaptureRef.current = (telemetry: RoverTelemetry) => {
    // Never freeze a retained or stale /rpp/accuracy sample.
    if (telemetry.rpp_accuracy_stream_fresh !== true) {
      return;
    }
    const { px4CurrentPointIndex, waypoints, candidates } =
      terminalCaptureInputsRef.current;
    if (candidates.length === 0) {
      return;
    }
    const currentPx4PointIndex =
      px4CurrentPointIndex;

    for (
      const [
        pointIndexText,
        entry,
      ] of candidates
    ) {
      const pointIndex =
        Number.parseInt(
          pointIndexText,
          10,
        );

      if (
        !Number.isInteger(
          pointIndex,
        )
        || pointIndex < 0
      ) {
        continue;
      }

      if (
        !isTerminalRppAccuracyStatus(
          entry.status,
        )
      ) {
        continue;
      }

      const serialNumber =
        pointIndexToSn(
          pointIndex,
          waypoints,
        );

      /*
       * Already frozen.
       *
       * Never update this value from later
       * live telemetry packets.
       */
      if (
        terminalRppAccuracyFallbackRef
          .current[
          serialNumber
        ]
      ) {
        continue;
      }

      const telemetryGoalNumber =
        Number(
          telemetry.accuracy
            ?.goal_number,
        );

      const telemetryActiveIndex =
        Number(
          telemetry.mission
            ?.active_point_index,
        );

      const telemetryActiveNumber =
        Number(
          telemetry.mission
            ?.active_point_number,
        );

      /*
       * Only capture telemetry belonging to
       * the terminal point.
       *
       * This prevents P1/P2/P3 from accidentally
       * receiving P4's final telemetry on reconnect.
       */
      const pointIdentityMatches =
        currentPx4PointIndex
          === pointIndex
        || (
          Number.isFinite(
            telemetryGoalNumber,
          )
          && Math.trunc(
            telemetryGoalNumber,
          ) === pointIndex + 1
        )
        || (
          Number.isFinite(
            telemetryActiveIndex,
          )
          && Math.trunc(
            telemetryActiveIndex,
          ) === pointIndex
        )
        || (
          Number.isFinite(
            telemetryActiveNumber,
          )
          && Math.trunc(
            telemetryActiveNumber,
          ) === pointIndex + 1
        );

      if (!pointIdentityMatches) {
        continue;
      }

      /*
       * Don't reconstruct historical terminal
       * accuracy from current rover position.
       *
       * Snapshot reconciliation normally happens
       * immediately, so five seconds gives enough
       * time for the telemetry packet to arrive.
       */
      const terminalTimeMs =
        Date.parse(
          entry.timestamp ?? "",
        );

      if (
        Number.isFinite(
          terminalTimeMs,
        )
        && Math.abs(
          Date.now()
          - terminalTimeMs
        ) > 5000
      ) {
        continue;
      }

      const snapshot =
        captureTerminalRppAccuracy(
          telemetry,
          pointIndex,
          entry.timestamp
            ?? new Date()
              .toISOString(),
        );

      if (!snapshot) {
        /*
         * Accuracy may arrive one telemetry packet
         * after the terminal status.
         *
         * Because this effect also depends on the
         * RPP telemetry fields below, it will retry
         * during the five-second capture window.
         */
        continue;
      }

      const next = {
        ...terminalRppAccuracyFallbackRef
          .current,
        [serialNumber]:
          snapshot,
      };

      terminalRppAccuracyFallbackRef.current =
        next;

      setTerminalRppAccuracyFallbackMap(
        next,
      );

      console.log(
        "[MissionReportScreen] Frozen terminal RPP accuracy",
        {
          pointIndex,
          serialNumber,

          status:
            entry.status,

          alongMm:
            snapshot
              .alongTrackErrorMm,

          crossMm:
            snapshot
              .crossTrackErrorMm,

          overallMm:
            snapshot
              .overallAccuracyMm,
        },
      );
    }
  };

  useEffect(() => {
    runTerminalCaptureRef.current(liveStore.getSnapshot().telemetry);
    return liveStore.subscribe(() =>
      runTerminalCaptureRef.current(liveStore.getSnapshot().telemetry),
    );
  }, [liveStore]);

  useEffect(() => {
    runTerminalCaptureRef.current(liveStore.getSnapshot().telemetry);
  }, [liveStore, pointStatusMap, px4CurrentPointIndex, waypoints]);

  const telemetryMissionActive = isTelemetryMissionActive(
    screenTelemetry.missionStatus,
  );

  const effectiveMissionActive = isMissionActive || telemetryMissionActive;

  const backendMissionState = String(backendMission?.state ?? "")
    .trim()
    .toUpperCase();

  // Live accuracy panel states are derived inside LiveAccuracyMonitorPanel /
  // LiveDistanceToTargetPanel from their own telemetry subscriptions.

  /**
   * Controls whether the main button displays
   * NO MISSION or START.
   */
  const backendMissionStored = isMissionStoredOnRover(backendMission);
  // BackendTrajectoryContext retains the last ready path (and its mission ID)
  // through terminal cleanup. Use that shared identity as a fallback when the
  // progress screen was not visible during the short RUNNING/COMPLETED window.
  const previewMissionId = String(preview.missionId ?? "").trim();
  const hasRetainedPreviewMission =
    previewMissionId.length > 0 && preview.points.length >= 2;
  const hasUploadedMission =
    backendMissionStored ||
    retainedMission !== null ||
    hasRetainedPreviewMission;

  /**
   * AUTO and MANUAL are both autonomous OFFBOARD
   * mission execution modes.
   *
   * MANUAL means the backend waits for NEXT after
   * each completed marking point.
   *
   * After COMPLETED/STOPPED the stored CSV stays loaded.
   * If mission-manager dropped `ready`, Start prepares
   * that CSV instead of forcing a Path Plan re-upload.
   */
  const startEligibility = useMemo(
    () =>
      getMissionStartEligibility({
        connected: connectionState === "connected",
        loaded: hasUploadedMission,
        state: backendMissionStored
          ? backendMissionState
          : retainedMission?.state ?? backendMissionState,
      }),
    [
      connectionState,
      hasUploadedMission,
      backendMissionState,
      backendMissionStored,
      retainedMission?.state,
      hasRetainedPreviewMission,
      previewMissionId,
    ],
  );
  const canStartMission = startEligibility.canPressStart;

  /**
   * Single authoritative lifecycle view for the control buttons: the
   * Socket.IO push when it describes this exact mission run and is at least
   * as recent as the REST snapshot, otherwise REST. handleResume uses the
   * same view, so the button and the handler cannot disagree.
   */
  const effectiveLifecycle = useMemo(
    () =>
      resolveEffectiveMissionLifecycle(
        missionLifecycle,
        backendMission,
        backendMissionReceivedAtRef.current,
      ),
    [missionLifecycle, backendMission],
  );

  const isBackendMissionPaused =
    (effectiveLifecycle.state ?? backendMissionState) === "PAUSED";

  // A start/restore HTTP request can finish after the rover has already
  // transitioned through Socket.IO. Never leave the operator behind a
  // "Preparing Mission" overlay once the authoritative live lifecycle says
  // the run is active.
  useEffect(() => {
    if (!isPreparingMission) return;
    const state = String(
      effectiveLifecycle.state ||
        backendMissionState ||
        screenTelemetry.missionStatus ||
        "",
    )
      .trim()
      .toUpperCase();
    if (["RUNNING", "PAUSED", "WAITING_FOR_NEXT"].includes(state)) {
      setIsPreparingMission(false);
    }
  }, [
    isPreparingMission,
    effectiveLifecycle.state,
    backendMissionState,
    screenTelemetry.missionStatus,
  ]);

  const backendResumeAvailable = effectiveLifecycle.resumeAvailable;

  const backendPauseReason = effectiveLifecycle.pauseReason;

  const backendRtkReason = effectiveLifecycle.rtkReason;

  /**
   * Current marking-point index selected from
   * the currently active mission workflow.
   */
  const effectiveCurrentIndex = useMemo<number | null>(() => {
    const socketActiveIndex = Number(
      backendMission?.active_point_index ?? backendMission?.current_point_index,
    );
    if (Number.isInteger(socketActiveIndex) && socketActiveIndex >= 0) {
      return socketActiveIndex;
    }

    if (POINT_MISSION_ENABLED && px4CurrentPointIndex !== null) {
      return px4CurrentPointIndex;
    }
    /*
     * Canonical Mission Report active point
     * has first priority for the table.
     */
    if (canonicalReportProjection?.activeIndex != null) {
      return canonicalReportProjection.activeIndex;
    }

    if (verifiedCtx.isLoaded && verifiedTargetIndex !== null) {
      return verifiedTargetIndex;
    }

    return currentIndex;
  }, [
    backendMission?.active_point_index,
    backendMission?.current_point_index,
    canonicalReportProjection,
    verifiedCtx.isLoaded,
    verifiedTargetIndex,
    px4CurrentPointIndex,
    currentIndex,
  ]);

  /**
   * Mission Report uses only stored waypoint results.
   *
   * Live rover-to-target distance is displayed separately
   * by DistanceToTargetCard and must not overwrite report accuracy.
   */
  // O(1) canonical lookup per waypoint (was an O(N) find per row: O(N^2)).
  const canonicalPointsBySequence = useMemo(() => {
    const bySequence = new Map<
      number,
      NonNullable<CanonicalMissionReport["points"]>[number]
    >();
    for (const point of canonicalMissionReport?.points ?? []) {
      bySequence.set(Number(point.sequence), point);
    }
    return bySequence;
  }, [canonicalMissionReport]);

  const previousReportStatusMapRef = useRef<Record<number, WpStatus> | null>(null);

  const reportStatusMap = useMemo<Record<number, WpStatus>>(() => {
    const next: Record<number, WpStatus> = {};

    for (const [waypointIndex, waypoint] of waypoints.entries()) {
      // Backend report points are sequenced P0001, P0002, ... in mission
      // order. `waypoint.sn` comes from the editable Path Plan ID and can
      // contain gaps, so it must not be used to look up backend point data.
      const pointNumber = waypointIndex + 1;
      // Keep a terminal row while the backend transitions from the live
      // mission to its persisted terminal report. The active mission slot is
      // intentionally cleared during that transition, so without this small
      // bridge the last point can briefly lose its status/survey/remark.
      const previousRow = previousReportStatusMapRef.current?.[waypoint.sn];
      const previousRowIsTerminal = [
        "completed",
        "failed",
        "skipped",
        "aborted",
        "stopped",
        "mission_end",
      ].includes(String(previousRow?.status ?? ""));
      const liveRunId = String(backendMission?.mission_run_id ?? "").trim();
      const reportRunId = String(canonicalMissionReport?.mission_run_id ?? "").trim();
      const canonicalMatchesLiveRun =
        !liveRunId || (Boolean(reportRunId) && liveRunId === reportRunId);
      const reportRow = canonicalMatchesLiveRun
        ? canonicalReportProjection?.statusMap[pointNumber]
        : undefined;

      const runtimeRow =
        effectiveStatusMap[
          waypoint.sn
        ];

      const reconciledRow =
        reconcileMissionReportRow(
          reportRow,
          runtimeRow,
        );

      // DYX KEEP RPP ADD RAW LIVE
      //
      // Keep the original table contract:
      //   REMARK = RPP Along | Cross | Overall
      // Add only one independent column:
      //   RAW GNSS = CSV-vs-raw-GNSS radial/overall error
      //
      // No frontend accuracy calculation is performed.
      const pointId =
        `P${String(pointNumber).padStart(4, "0")}`;

      const canonicalPoint =
        canonicalMatchesLiveRun
          ? canonicalPointsBySequence.get(pointNumber)
          : undefined;

      /*
       * Fast final-point RPP fallback.
       *
       * rover_backend puts the exact terminal point result into
       * mission.point_results immediately when the point event arrives.
       * Use that stored RPP result while /api/mission/report catches up.
       * This is copy/format only; no accuracy is reconstructed.
       */
      // Newest current-run result wins, whichever transport delivered it.
      const runtimePointResult = newerPointResult(
        currentRunSocketPointResults[pointId],
        currentRunBackendPointResults.byId.get(pointId) ??
          currentRunBackendPointResults.byIndex.get(waypointIndex),
      );

      const runtimePointAccuracy =
        runtimePointResult &&
        typeof runtimePointResult === "object"
          ? (
              runtimePointResult as {
                accuracy?: unknown;
                received_at?: unknown;
              }
            ).accuracy
          : undefined;

      const runtimeAccuracy =
        runtimePointAccuracy &&
        typeof runtimePointAccuracy === "object"
          ? runtimePointAccuracy as Record<string, unknown>
          : null;

      // DYX RAW GNSS SAME RPP POINT
      //
      // RPP and RAW GNSS now come from the SAME point_results[Pxxxx]
      // accuracy object. This prevents RAW GNSS from using a separately
      // indexed live snapshot while RPP is already tied to the exact point.
      //
      // No frontend geometry is calculated here.
      const runtimeSurveyCandidate =
        runtimeAccuracy?.survey;

      const reportSurveyCandidate =
        canonicalPoint
          ?.accuracy
          ?.survey;

      const surveySnapshot: RawGnssSurveySnapshot | null =
        pickBestRawGnssSurvey(
          extractRawGnssSurvey(runtimeSurveyCandidate),
          extractRawGnssSurvey(reportSurveyCandidate),
          extractRawGnssSurvey((runtimeRow as any)?.survey),
          // A missing/unavailable follow-up payload must never erase a real
          // frozen RAW GNSS measurement already displayed for this run.
          previousRowIsTerminal ? previousRow?.survey : null,
        );

      // DYX FINAL POINT RUNTIME STATUS
      //
      // Use backend mission.point_results to promote the final table row
      // immediately while /api/mission/report is still catching up.
      // Only true final outcomes are mapped here.
      const runtimePointOutcome =
        runtimePointResult &&
        typeof runtimePointResult === "object"
          ? String(
              (
                runtimePointResult as {
                  point_outcome?: unknown;
                }
              ).point_outcome ?? "",
            )
              .trim()
              .toUpperCase()
          : "";

      const runtimeTerminalStatus:
        "completed" | "failed" | "skipped" | null =
        runtimePointOutcome === "COMPLETED"
          ? "completed"
          : runtimePointOutcome === "FAILED"
            ? "failed"
            : runtimePointOutcome === "SKIPPED"
              ? "skipped"
              : null;

      const runtimeReceivedAt =
        runtimePointResult &&
        typeof runtimePointResult === "object" &&
        typeof (
          runtimePointResult as {
            received_at?: unknown;
          }
        ).received_at === "string"
          ? (
              runtimePointResult as {
                received_at: string;
              }
            ).received_at
          : undefined;

      const runtimeTerminalRow =
        runtimeTerminalStatus !== null
          ? {
              reached:
                runtimeTerminalStatus === "completed" ||
                runtimeTerminalStatus === "failed",

              marked:
                runtimeTerminalStatus === "completed",

              status:
                runtimeTerminalStatus,

              timestamp:
                runtimeReceivedAt,
            }
          : undefined;

      // A terminal Socket.IO result is the live authority.  REST reports are
      // intentionally allowed to lag, but may still supply their RPP remark.
      const displayRow = runtimeTerminalRow
        ? {
            ...reconciledRow,
            ...runtimeTerminalRow,
            remark: reconciledRow?.remark ?? "Along — | Cross — | Overall —",
          }
        : reconciledRow ?? (previousRowIsTerminal ? previousRow : null);

      const runtimeAlong =
        typeof runtimeAccuracy?.along_track_error_mm === "number" &&
        Number.isFinite(runtimeAccuracy.along_track_error_mm)
          ? runtimeAccuracy.along_track_error_mm
          : null;

      const runtimeCross =
        typeof runtimeAccuracy?.cross_track_error_mm === "number" &&
        Number.isFinite(runtimeAccuracy.cross_track_error_mm)
          ? runtimeAccuracy.cross_track_error_mm
          : null;

      const runtimeOverall =
        typeof runtimeAccuracy?.overall_accuracy_mm === "number" &&
        Number.isFinite(runtimeAccuracy.overall_accuracy_mm)
          ? runtimeAccuracy.overall_accuracy_mm
          : null;

      const runtimeRppFallback:
        TerminalRppAccuracySnapshot | undefined =
        runtimeAccuracy?.measurement_source ===
          "RPP_TERMINAL_RESULT" &&
        runtimeAccuracy.available === true &&
        runtimeAlong !== null &&
        runtimeCross !== null &&
        runtimeOverall !== null
          ? {
              pointIndex: waypointIndex,
              alongTrackErrorMm: runtimeAlong,
              crossTrackErrorMm: runtimeCross,
              overallAccuracyMm: runtimeOverall,
              capturedAt: new Date().toISOString(),
            }
          : undefined;

      // Authority: the exact RPP_TERMINAL_RESULT carried by the current-run
      // point result outranks everything; the transitional live-telemetry
      // capture is used only when no exact result or canonical remark exists.
      const exactRemark = runtimeRppFallback
        ? formatTerminalRppAccuracy(runtimeRppFallback)
        : null;
      const rppFallback = terminalRppAccuracyFallbackMap[waypoint.sn];

      if (displayRow) {
        next[waypoint.sn] = {
          reached:
            displayRow.reached,

          marked:
            displayRow.marked,

          status:
            displayRow.status,

          timestamp:
            displayRow.timestamp,

          // Restore original RPP table output exactly:
          // Along ... | Cross ... | Overall ...
          remark:
            exactRemark ??
            selectMissionReportRemark(
              displayRow.remark,
              rppFallback,
            ),

          // Independent RAW GNSS value for the new column only.
          survey:
            surveySnapshot,
        };

        continue;
      }

      /*
       * No canonical row yet. A terminal RPP fallback may already exist,
       * especially for the final point while the report is checkpointing.
       */
      next[waypoint.sn] = {
        reached: false,
        marked: false,

        status: "pending",

        remark:
          exactRemark ??
          selectMissionReportRemark(
            null,
            rppFallback,
          ),

        survey:
          surveySnapshot,
      };
    }

    // Unchanged rows keep their identity; an unchanged rebuild returns the
    // previous map so WaypointsTable does no work at all.
    const shared = shareUnchangedRows(previousReportStatusMapRef.current, next);
    previousReportStatusMapRef.current = shared;
    return shared;
  }, [
    waypoints,
    canonicalReportProjection,
    canonicalMissionReport,
    canonicalPointsBySequence,
    currentRunBackendPointResults,
    currentRunSocketPointResults,
    effectiveStatusMap,
    terminalRppAccuracyFallbackMap,
  ]);

  // Development instrumentation: point event received -> row committed.
  useEffect(() => {
    for (const entry of Object.values(socketPointResults)) {
      markPointRowDisplayed(`${entry.runId}:${entry.pointId}`);
    }
  }, [reportStatusMap, socketPointResults]);

  const effectiveWaitingForManual = effectiveLifecycle.state === "WAITING_FOR_NEXT";

  // Check if showing previous mission data
  const isShowingPreviousMission =
    previousMissionData &&
    !isMissionActive &&
    Object.keys(statusMap).length === 0;

  // Refs to store latest values for mission event handler (prevents stale closures)
  const waypointsRef = useRef(waypoints);
  const statusMapRef = useRef(statusMap);
  const reportStatusMapRef = useRef<Record<number, WpStatus>>({});
  const missionStartTimeRef = useRef(missionStartTime);
  const missionEndTimeRef = useRef(missionEndTime);
  const isMissionActiveRef = useRef(isMissionActive);
  const modeRef = useRef(mode);
  const missionModeRef = useRef(missionMode);
  // Always the latest live telemetry, read on demand (no render dependency).
  const telemetryRef = useMemo(
    () => ({
      get current(): RoverTelemetry {
        return liveStore.getSnapshot().telemetry;
      },
    }),
    [liveStore],
  );

  // Keep refs in sync with state
  useEffect(() => {
    waypointsRef.current = waypoints;
  }, [waypoints]);

  useEffect(() => {
    statusMapRef.current = statusMap;
  }, [statusMap]);

  useEffect(() => {
    reportStatusMapRef.current = reportStatusMap;
  }, [reportStatusMap]);

  useEffect(() => {
    missionStartTimeRef.current = missionStartTime;
  }, [missionStartTime]);

  useEffect(() => {
    missionEndTimeRef.current = missionEndTime;
  }, [missionEndTime]);

  useEffect(() => {
    isMissionActiveRef.current = isMissionActive;
  }, [isMissionActive]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    missionModeRef.current = missionMode;
  }, [missionMode]);

  const showNotification = (
    type: "success" | "error" | "info",
    title: string,
    message?: string,
    duration = 3000,
  ) => {
    // Clear any existing notification timeout to prevent memory leaks
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }

    setNotification({ visible: true, type, title, message });
    notificationTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setNotification((prev) => ({ ...prev, visible: false }));
      }
      notificationTimeoutRef.current = null;
    }, duration);
  };

  const dismissNotification = useCallback(() => {
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
      notificationTimeoutRef.current = null;
    }
    setNotification((previous) => ({ ...previous, visible: false }));
  }, []);

  const refreshBackendMission = useCallback(async (): Promise<void> => {
    if (isOfflineMode()) {
      return;
    }

    try {
      const requestStartedAt = Date.now();
      const generation = commandGenerationRef.current;
      const response = await getMissionStatus();
      if (
        generation !== commandGenerationRef.current ||
        stopFencePhaseRef.current === "request_in_flight"
      ) {
        return;
      }

      if (!response?.success || !response?.mission) {
        return;
      }

      const mission = response.mission;

      // A REST snapshot that was in flight while a newer socket packet for
      // the SAME mission/run was accepted is older; do not let it roll the
      // lifecycle back. An identity change is always accepted.
      const current = backendMissionRef.current;
      const sameIdentity =
        current !== null &&
        String(current.mission_id ?? "") === String(mission.mission_id ?? "") &&
        String(current.mission_run_id ?? "") === String(mission.mission_run_id ?? "");
      if (sameIdentity && lastSocketMissionStatusAtRef.current > requestStartedAt) {
        return;
      }

      setBackendMission(mission, { fresh: true });

      const state = String(mission.state ?? "")
        .trim()
        .toUpperCase();

      const executionMode = String(mission.execution_mode ?? "")
        .trim()
        .toUpperCase();

      /*
       * Keep AUTO/MANUAL UI synchronized with mission_manager.
       */
      if (executionMode === "AUTO" || executionMode === "MANUAL") {
        setMode(executionMode);
      }

      /*
       * MANUAL mission waits here after finishing one marking point.
       */
      setWaitingForManual(state === "WAITING_FOR_NEXT");

      /*
       * Backend is the source of truth for whether the mission
       * is currently active.
       */
      if (
        state === "RUNNING" ||
        state === "PAUSED" ||
        state === "WAITING_FOR_NEXT"
      ) {
        setIsMissionActive(true);
      } else if (
        state === "READY" ||
        state === "PREPARING" ||
        state === "EMPTY" ||
        state === "COMPLETED" ||
        state === "ERROR" ||
        state === "STOPPED" ||
        state === "FAULT"
      ) {
        setIsMissionActive(false);
      }

      // console.log("[MissionReportScreen] Backend mission:", {
      //   state,
      //   loaded: mission.loaded,
      //   ready: mission.ready,
      //   executionMode,
      //   navigationPoints: mission.navigation_point_count,
      // });
    } catch (error) {
      /*
       * IMPORTANT:
       * Do not erase the previous valid mission state because one
       * 500 ms status request failed.
       *
       * connectionState already handles actual disconnection.
       */
      console.warn(
        "[MissionReportScreen] Mission status refresh failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [setBackendMission]);

  // The hidden direct-upload host already completed successfully. Do not wait
  // for the normal 15-second polling cadence before replacing Upload with the
  // available mission actions on the modern home.
  useEffect(() => {
    if (missionUploadCompletedToken < 1) return;
    void Promise.all([refreshBackendMission(), refreshNow()]);
  }, [missionUploadCompletedToken, refreshBackendMission, refreshNow]);

  const refreshCanonicalMissionReport = useCallback(async (): Promise<void> => {
    if (isOfflineMode()) {
      return;
    }

    try {
      const response = await getMissionReport();

      if (!response?.success) {
        return;
      }

      if (response.available === true && response.report) {
        const accept = shouldAcceptCanonicalReport({
          incomingRunId: response.report.mission_run_id,
          staleRunId: staleMissionRunIdRef.current,
          holdingForNewRun: holdingForNewReportRunRef.current,
        });

        if (!accept) {
          return;
        }

        holdingForNewReportRunRef.current = false;
        staleMissionRunIdRef.current = null;
        canonicalMissionReportRef.current = response.report;
        setCanonicalMissionReport(response.report);
      } else if (!holdingForNewReportRunRef.current) {
        canonicalMissionReportRef.current = null;
        setCanonicalMissionReport(null);
      }
    } catch (error) {
      /*
       * Do not destroy the last valid
       * report because one request failed.
       */
      console.warn(
        "[MissionReportScreen] " + "Mission report refresh failed:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }, []);

  // Canonical report reads are confirmation/hydration only. The coalescer
  // never pushes its timer back, so a burst of requests still refreshes
  // within LIVE_REPORT_REFRESH_DELAY_MS of the first one.
  const refreshCanonicalNowRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    refreshCanonicalNowRef.current = () => {
      if (!isVisible || connectionState !== "connected" || isOfflineMode()) return;
      void Promise.all([refreshBackendMission(), refreshCanonicalMissionReport()]);
    };
  }, [isVisible, connectionState, refreshBackendMission, refreshCanonicalMissionReport]);
  const liveReportRefreshRef = useRef<CoalescedRefresh | null>(null);
  if (liveReportRefreshRef.current === null) {
    liveReportRefreshRef.current = new CoalescedRefresh({
      delayMs: LIVE_REPORT_REFRESH_DELAY_MS,
      run: () => refreshCanonicalNowRef.current(),
    });
  }

  const refreshLiveMarkingPoints = useCallback(() => {
    if (!isVisible || connectionState !== "connected" || isOfflineMode()) return;
    liveReportRefreshRef.current?.request();
  }, [connectionState, isVisible]);

  useEffect(
    () => () => {
      liveReportRefreshRef.current?.cancel();
    },
    [],
  );

  // Returning to the foreground may follow missed Socket.IO events even when
  // the socket never reported a disconnect: re-hydrate once from REST.
  // (Socket reconnects re-hydrate through the connectionState effects.)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") refreshLiveMarkingPoints();
    });
    return () => subscription.remove();
  }, [refreshLiveMarkingPoints]);

  // Terminal point events are the meaningful trigger for a canonical
  // confirmation read. Row state itself is already updated from the event.
  useEffect(() => {
    if (!isVisible || !socket || connectionState !== "connected") return;
    const handler = () => refreshLiveMarkingPoints();
    const names = ["point_completed", "point_failed", "point_skipped"] as const;
    names.forEach((name) => socket.on(name, handler));
    const onGenericPointEvent = (payload: unknown) => {
      if (isTerminalPointEventPayload(payload)) refreshLiveMarkingPoints();
    };
    socket.on("point_event", onGenericPointEvent);
    return () => {
      names.forEach((name) => socket.off(name, handler));
      socket.off("point_event", onGenericPointEvent);
    };
  }, [isVisible, socket, connectionState, refreshLiveMarkingPoints]);

  /*
   * ============================================================
   * MISSION STATUS SYNCHRONIZATION
   * ============================================================
   *
   * LOAD MISSION is asynchronous:
   *
   * PREPARING
   *   ↓
   * trajectory_generator READY
   *   ↓
   * mission_manager accepts complete trajectory
   *   ↓
   * READY
   *
   * Therefore Mission Report must continue checking state instead
   * of reading it only once.
   */
  useEffect(() => {
    if (!isVisible || connectionState !== "connected" || isOfflineMode()) {
      return;
    }

    let cancelled = false;
    let requestInFlight = false;

    const pollMission = async () => {
      if (cancelled || requestInFlight) {
        return;
      }

      requestInFlight = true;

      try {
        await refreshBackendMission();
      } finally {
        requestInFlight = false;
      }
    };

    /*
     * Immediate read when opening Mission Report.
     */
    void pollMission();

    /*
     * Continue synchronizing.
     *
     * Fast operator display refresh.
     * Backend already owns the data; this only shortens UI observation latency.
     */
    const timer = setInterval(() => {
      void pollMission();
    }, 15_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isVisible, connectionState, refreshBackendMission]);

  /*
   * ============================================================
   * CANONICAL MISSION REPORT SYNCHRONIZATION
   * ============================================================
   *
   * Mission Report point status + terminal
   * RPP accuracy comes only from:
   *
   * GET /api/mission/report
   */
  useEffect(() => {
    if (!isVisible || connectionState !== "connected" || isOfflineMode()) {
      return;
    }

    let cancelled = false;
    let requestInFlight = false;

    const pollReport = async () => {
      if (cancelled || requestInFlight) {
        return;
      }

      requestInFlight = true;

      try {
        await refreshCanonicalMissionReport();
      } finally {
        requestInFlight = false;
      }
    };

    /*
     * Immediate first request.
     */
    void pollReport();

    /*
     * Keep terminal RPP/report rows close to live runtime state.
     * The in-flight guard prevents overlapping requests.
     */
    const timer = setInterval(() => {
      void pollReport();
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isVisible, connectionState, refreshCanonicalMissionReport]);

  useEffect(() => {
    canonicalMissionReportRef.current = canonicalMissionReport;
  }, [canonicalMissionReport]);

  useEffect(() => {
    const attemptId = startTimingAttemptRef.current;
    if (!attemptId || !isMissionActive) {
      return;
    }

    const phase = backendMissionState || String(screenTelemetry.missionStatus ?? "");
    if (!phase || lastLoggedStartPhaseRef.current === phase) {
      return;
    }

    lastLoggedStartPhaseRef.current = phase;
    logMissionStartTiming(attemptId, "backend_phase", phase);
  }, [
    backendMissionState,
    screenTelemetry.missionStatus,
    isMissionActive,
  ]);

  // First-motion start timing, checked on position updates without
  // re-rendering the screen.
  const checkFirstMotionRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    checkFirstMotionRef.current = () => {
      const attemptId = startTimingAttemptRef.current;
      const origin = startOriginRef.current;
      if (
        !attemptId ||
        !origin ||
        firstMotionLoggedRef.current ||
        !isMissionActive
      ) {
        return;
      }

      const roverPosition = liveStore.getSnapshot().roverPosition;
      const lat = roverPosition?.lat ?? 0;
      const lon = roverPosition?.lng ?? 0;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return;
      }

      const moved =
        Math.abs(lat - origin.lat) > 0.00001 ||
        Math.abs(lon - origin.lon) > 0.00001;
      if (!moved) {
        return;
      }

      firstMotionLoggedRef.current = true;
      logMissionStartTiming(
        attemptId,
        "first_motion",
        `lat=${lat.toFixed(7)} lon=${lon.toFixed(7)}`,
      );
      };
  });
  useEffect(() => {
    checkFirstMotionRef.current();
    return liveStore.subscribe(() => checkFirstMotionRef.current());
  }, [liveStore, isMissionActive]);

  const refreshQuickNtripStatus = useCallback(async () => {
    if (connectionState !== "connected") {
      setQuickRtkState("rover_offline");
      return;
    }

    if (quickRtkStatusInFlightRef.current) {
      return;
    }

    quickRtkStatusInFlightRef.current = true;

    try {
      const response = await getRtkStatus();
      const view = toRtkControlView(response, { connected: true });
      setQuickRtkState(view.headline);
    } catch {
      setQuickRtkState("rover_offline");
    } finally {
      quickRtkStatusInFlightRef.current = false;
    }
  }, [connectionState]);

  // Quick RTK badge: the socket rtk_status stream (~1 Hz, same body as
  // GET /api/rtk/status); the REST poll only runs while that stream is silent.
  useEffect(() => {
    if (!isVisible || !socket || connectionState !== "connected") {
      return undefined;
    }
    const handleRtkStatus = (payload: unknown) => {
      const status = unwrapRtkStatus(payload as Parameters<typeof unwrapRtkStatus>[0]);
      if (!status) return;
      const view = toRtkControlView(status, { connected: true });
      lastQuickRtkSocketAtRef.current = Date.now();
      setQuickRtkState(view.headline);
    };
    socket.on("rtk_status", handleRtkStatus);
    return () => {
      socket.off("rtk_status", handleRtkStatus);
    };
  }, [isVisible, socket, connectionState]);

  useEffect(() => {
    if (
      !isVisible ||
      connectionState !== "connected" ||
      showRTKInjection
    ) {
      return undefined;
    }

    void refreshQuickNtripStatus();

    const timer = setInterval(() => {
      if (Date.now() - lastQuickRtkSocketAtRef.current < 3000) return;
      void refreshQuickNtripStatus();
    }, 3000);

    return () => clearInterval(timer);
  }, [
    connectionState,
    isVisible,
    refreshQuickNtripStatus,
    showRTKInjection,
  ]);

  const handleQuickStartNtrip = async () => {
    if (isQuickNtripStarting) return;

    setIsQuickNtripStarting(true);

    try {
      const response = await getRtkStatus();
      const view = toRtkControlView(response, {
        connected: connectionState === "connected",
      });

      setQuickRtkState(view.headline);

      const decision = decideMissionRtkQuickStart({
        connected: connectionState === "connected",
        activeProfileId: view.activeProfileId,
        correctionSource: view.correctionSource,
        loraConfigured: view.loraConfigured,
      });

      if (decision === "offline") {
        Alert.alert(
          "Rover Offline",
          "Connect to the rover before starting RTK.",
        );
        return;
      }

      if (decision === "open_config") {
        openRTKInjection();
        return;
      }

      // A running/transitional/error lifecycle is status-only here.
      // Mission Progress must never issue a duplicate start.
      if (!view.canStart) {
        return;
      }

      const intent = await startRtk();

      if (intent?.persisted?.desired_state === "RUNNING") {
        setQuickRtkState("start_requested");
      }

      showNotification(
        "success",
        "RTK Start Requested",
        intent.message ||
          "Desired RUNNING accepted. Waiting for backend status.",
      );
    } catch (err) {
      const message = getRtkFailureMessage(err, "Failed to start RTK.");
      showNotification("error", "RTK Start Failed", message, 5000);
      Alert.alert("RTK Start Failed", message);
    } finally {
      setIsQuickNtripStarting(false);
      void refreshQuickNtripStatus();
    }
  };

  const handleOpenManualDrive = async () => {
    if (isManualPreparing) return;

    if (JOYSTICK_OFFLINE_UI_PREVIEW_BYPASS && isOfflineMode()) {
      openManualDrivePanel();
      return;
    }

    setIsManualPreparing(true);
    try {
      const liveTelemetry = liveStore.getSnapshot().telemetry;
      const currentMode = String(liveTelemetry.state?.mode || "").toUpperCase();
      if (currentMode !== "MANUAL") {
        console.log(
          "[ManualDrive] Setting mode to MANUAL from",
          currentMode || "UNKNOWN",
        );
        const modeResponse = await setManualMode();
        if (!modeResponse.success) {
          const message =
            modeResponse.message || "Unable to switch vehicle to MANUAL mode.";
          showNotification("error", "Manual Mode Failed", message, 5000);
          Alert.alert("Manual Mode Failed", message);
          return;
        }
      }

      if (!liveTelemetry.state?.armed) {
        console.log("[ManualDrive] Arming vehicle before opening joystick");
        const armResponse = await armVehicle();
        if (!armResponse.success) {
          const message = armResponse.message || "Unable to arm vehicle.";
          showNotification("error", "Arm Failed", message, 5000);
          Alert.alert("Arm Failed", message);
          return;
        }
      }

      openManualDrivePanel();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to prepare manual control.";
      console.error("[ManualDrive] Prepare failed", err);
      showNotification("error", "Manual Control Failed", message, 5000);
      Alert.alert("Manual Control Failed", message);
    } finally {
      setIsManualPreparing(false);
    }
  };

  // Check for missing Block/Row/Pile fields in waypoints
  const checkMissingFields = (): string[] => {
    const missing: string[] = [];
    let hasRow = false;
    let hasBlock = false;
    let hasPile = false;

    waypoints.forEach((wp) => {
      if (wp.row) hasRow = true;
      if (wp.block) hasBlock = true;
      if (wp.pile) hasPile = true;
    });

    if (!hasRow) missing.push("Row");
    if (!hasBlock) missing.push("Block");
    if (!hasPile) missing.push("Pile");

    return missing;
  };

  // Auto-assign sequence numbers to missing fields
  const handleAutoAssignSequence = () => {
    setShowAutoAssignDialog(false);

    try {
      const updatedWaypoints = waypoints.map((wp, idx) => ({
        ...wp,
        row: wp.row || `R${idx + 1}`,
        block: wp.block || "B1",
        pile: wp.pile || `${idx + 1}`,
      }));

      setMissionWaypoints(updatedWaypoints);
      showNotification(
        "success",
        "Success",
        "Sequence numbers auto-assigned successfully!",
      );

      if (mountedRef.current) {
        setShowWaypointPreviewDialog(true);
      }
    } catch (error) {
      console.error("[MissionReportScreen] Auto-assign error:", error);
      showNotification(
        "error",
        "Error",
        "Failed to auto-assign sequence numbers",
      );
    }
  };

  // Proceed without auto-assignment
  const handleProceedWithoutAssign = () => {
    setShowAutoAssignDialog(false);
    setShowWaypointPreviewDialog(true);
  };

  // Confirm and upload through the canonical backend mission flow.
  const handleConfirmUpload = async () => {
    setShowWaypointPreviewDialog(false);
    setIsUploadingMission(true);
    invalidateForUpload();

    try {
      console.log("[MissionReportScreen] Uploading mission through the canonical CSV endpoint...");
      const csvEscape = (value: unknown) => {
        const text = String(value ?? "");
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const csv = [
        "latitude,longitude,alt,block,row,pile",
        ...waypoints.map((wp) =>
          [wp.lat, wp.lon, wp.alt, wp.block, wp.row, wp.pile]
            .map(csvEscape)
            .join(","),
        ),
        "",
      ].join("\n");
      const cacheDirectory = FileSystem.cacheDirectory;
      if (!cacheDirectory) throw new Error("Temporary storage is unavailable.");
      const temporaryFileUri = `${cacheDirectory}mission-progress-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(temporaryFileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      let result: Awaited<ReturnType<typeof uploadMissionCsv>>;
      try {
        result = await uploadMissionCsv({
          file: { uri: temporaryFileUri, name: "mission.csv", mimeType: "text/csv", lastModified: Date.now() },
          extensionMode: "DISABLE",
        });
      } finally {
        await FileSystem.deleteAsync(temporaryFileUri, { idempotent: true }).catch(() => undefined);
      }

      if (result.success) {
        console.log("[MissionReportScreen] Mission uploaded successfully");
        // The canonical mission is now owned by MissionContext/backend status.
        setIsMissionActive(false);
        setStatusMap({});
        setMissionStartTime(null);
        setMissionEndTime(null);
        setCurrentIndex(null);
        // Defensive redundancy: the progress hook also resets on mission-id
        // change, but clear here too so a replacement upload can never show the
        // previous mission's target progress.
        resetVerifiedProgress();
        clearVerifiedTerminal();
        showNotification(
          "success",
          "Success",
          "Mission uploaded successfully!",
        );

        await refreshBackendMission();
        await refreshNow();
      } else {
        resumePreviewAfterFailedUpload();
        void refreshNow();
        console.error("[MissionReportScreen] Upload failed:", result.message);
        showNotification(
          "error",
          "Upload Failed",
          result.message ?? "Failed to upload mission",
        );
      }
    } catch (error) {
      resumePreviewAfterFailedUpload();
      void refreshNow();
      console.error("[MissionReportScreen] Upload Error:", error);
      showNotification("error", "Error", "Failed to upload mission");
    } finally {
      setIsUploadingMission(false);
    }
  };

  // Debug waypoints setup
  React.useEffect(() => {
    missionLog("[MissionReportScreen] Waypoints updated:", {
      count: waypoints.length,
      waypoints: waypoints.map((wp) => ({ sn: wp.sn, status: wp.status })),
    });
  }, [waypoints]);

  // Debug current waypoint tracking
  React.useEffect(() => {
    const currentWaypointNumber =
      currentIndex !== null ? currentIndex + 1 : null;
    missionLog("[MissionReportScreen] Current waypoint tracking:", {
      currentIndex,
      currentWaypointNumber,
      waypoints_count: waypoints.length,
      target_waypoint: currentWaypointNumber
        ? waypoints.find((wp) => wp.sn === currentWaypointNumber)
        : null,
    });
  }, [currentIndex, waypoints]);

  // LIVE UPDATE FIX: Fetch fresh statusMap when component mounts or focus returns (handles tab switching)
  // This ensures table shows live data instead of stale/memorized data
  useEffect(() => {
    console.log(
      "[MissionReportScreen] 🔄 Component mounted/focused - verifying live data",
    );
    // StatusMap is updated via real-time socket events
    // No explicit fetch needed - socket listener will update it
    // This useEffect serves as a lifecycle marker for debugging
  }, []);

  // STALE STATUS CLEANUP: Clear old waypoint statuses that are no longer current
  // When rover moves from point 5 to point 9, clear marks from points that won't be revisited
  useEffect(() => {
    if (!isMissionActive || waypoints.length === 0 || currentIndex === null)
      return;

    // Only clean up old statuses during active missions
    const currentWaypointSn = currentIndex + 1; // Convert 0-based index to 1-based SN

    // Use ref to read latest statusMap without it being a dependency (prevents self-triggering loop)
    const currentStatusMap = statusMapRef.current;
    const newStatusMap = { ...currentStatusMap };
    let hasChanges = false;

    Object.keys(currentStatusMap).forEach((snStr) => {
      const sn = parseInt(snStr, 10);
      const status = currentStatusMap[sn];

      // Keep statuses that are completed or skipped (mission history)
      if (status?.status === "completed" || status?.status === "skipped") {
        return; // Keep this entry
      }

      // Only clean up 'loading' status for waypoints that are no longer current
      // IMPORTANT: Never delete 'reached' or 'marked' — waypoint_marked fires AFTER currentIndex
      // advances, so deleting 'reached' before 'waypoint_marked' arrives loses accuracy data
      if (sn !== currentWaypointSn && sn !== currentWaypointSn + 1) {
        if (status?.status === "loading") {
          delete newStatusMap[sn];
          hasChanges = true;
          console.log(
            `[MissionReportScreen] 🗑️ Cleaned up stale "loading" status for waypoint ${sn}`,
          );
        }
      }
    });

    // Update statusMap only if we removed old statuses
    if (hasChanges) {
      setStatusMap(newStatusMap);
    }
  }, [currentIndex, isMissionActive, waypoints]);

  // PRESERVE STATUS ON MISSION COMPLETION: Keep statusMap after mission ends for export and review
  // Previously this was clearing statusMap, but that prevented proper export of skipped waypoints
  // The statusMap should only be cleared when a new mission is started or user manually clears data
  useEffect(() => {
    // This effect is intentionally disabled - statusMap is preserved after mission completion
    // It will be cleared when:
    // 1. New mission is started (handleStartMission clears it)
    // 2. User manually clears mission data
    // 3. Mission is uploaded (PathPlanScreen clears it)
  }, []);

  const handleReorder = (fromIndex: number, direction: "up" | "down") => {
    // Only allow reordering of indices >= PINNED_COUNT and keep them >= PINNED_COUNT
    if (fromIndex < PINNED_COUNT) return;
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < PINNED_COUNT || toIndex >= waypoints.length) return;
    const next = waypoints.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    // Recompute S/N if desired (optional)
    setMissionWaypoints(next.map((wp, i) => ({ ...wp, sn: i + 1 })));
  };

  // Vehicle status and map pose are rendered by LiveVehicleStatusCard and
  // LiveMissionMap, which subscribe to live telemetry themselves.

  const missionProgressStats = useMemo(() => {
    const totalPoints = waypoints.length;

    if (totalPoints === 0) {
      return {
        markedPoints: 0,
        currentPoint: 0,
        totalPoints: 0,
      };
    }

    const markedPoints = waypoints.reduce((count, waypoint) => {
      const pointStatus = reportStatusMap[waypoint.sn]?.status;

      const isMarked = pointStatus === "completed" || pointStatus === "marked";

      return isMarked ? count + 1 : count;
    }, 0);

    const safeMarkedPoints = Math.min(markedPoints, totalPoints);

    if (safeMarkedPoints >= totalPoints) {
      return {
        markedPoints: totalPoints,
        currentPoint: totalPoints,
        totalPoints,
      };
    }

    const currentFromBackend =
      effectiveCurrentIndex !== null && effectiveCurrentIndex >= 0
        ? effectiveCurrentIndex + 1
        : 1;

    const currentFromMarked = safeMarkedPoints + 1;

    const currentPoint = Math.min(
      totalPoints,
      Math.max(1, currentFromBackend, currentFromMarked),
    );

    return {
      markedPoints: safeMarkedPoints,
      currentPoint,
      totalPoints,
    };
  }, [waypoints, reportStatusMap, effectiveCurrentIndex]);

  // The field command experience is a presentation layer over the established
  // mission workflow. Keep the legacy widgets mounted in source (and all of
  // their data/control handlers intact), while the operator uses the focused
  // map-first surface requested for normal field operation.
  const useMissionActivityExperience = true;

  // Automatically derive currentIndex from statusMap to keep UI in sync
  // This fixes the issue where currentIndex gets stuck even though statusMap updates correctly
  useEffect(() => {
    if (POINT_MISSION_ENABLED) return;
    if (waypoints.length === 0 || !isMissionActive) return;

    // Find the first waypoint that is NOT completed or skipped
    // This represents the current active waypoint
    let derivedIndex: number | null = null;

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const wpStatus = statusMap[wp.sn];

      // If no status exists, this is the current waypoint (not yet reached)
      if (!wpStatus) {
        derivedIndex = i;
        break;
      }

      // If status is not completed/skipped, this is the current waypoint
      if (wpStatus.status !== "completed" && wpStatus.status !== "skipped") {
        derivedIndex = i;
        break;
      }
    }

    // If all waypoints are completed/skipped, set to null (mission complete)
    if (derivedIndex === null && waypoints.length > 0) {
      const allCompleted = waypoints.every((wp) => {
        const wpStatus = statusMap[wp.sn];
        return (
          wpStatus &&
          (wpStatus.status === "completed" || wpStatus.status === "skipped")
        );
      });

      if (!allCompleted) {
        // Mission not started yet, keep currentIndex as is
        return;
      }
    }

    // Only update if the derived index is different from current
    setCurrentIndex((prev) => {
      if (prev !== derivedIndex) {
        // Forward-guard: do not advance past a non-terminal waypoint
        // This mirrors the guard in the socket event handler (lines 1828-1837)
        if (derivedIndex !== null && prev !== null && derivedIndex > prev) {
          const leavingWp = waypoints[prev];
          if (leavingWp) {
            const leavingStatus = statusMap[leavingWp.sn];
            if (
              !leavingStatus ||
              (leavingStatus.status !== "completed" &&
                leavingStatus.status !== "skipped")
            ) {
              // The waypoint we're leaving is not yet terminal — hold position
              return prev;
            }
          }
        }
        missionLog(
          `[MissionReportScreen] 🔄 Auto-derived currentIndex from statusMap: ${prev} -> ${derivedIndex} (waypoint #${derivedIndex !== null ? derivedIndex + 1 : "null"})`,
        );
        return derivedIndex;
      }
      return prev;
    });
  }, [statusMap, waypoints, isMissionActive]);

  // Separate effect to handle mission completion detection without circular dependencies
  // Using refs to avoid infinite loops - only triggers when currentIndex becomes null
  useEffect(() => {
    // Check for mission completion: currentIndex is null, all waypoints completed, and mission is active
    if (
      currentIndex === null &&
      waypointsRef.current.length > 0 &&
      isMissionActiveRef.current
    ) {
      const allCompleted = waypointsRef.current.every((wp) => {
        const wpStatus = statusMapRef.current[wp.sn];
        return (
          wpStatus &&
          (wpStatus.status === "completed" || wpStatus.status === "skipped")
        );
      });

      if (allCompleted && !missionEndTimeRef.current) {
        console.log(
          "[MissionReportScreen] 🏁 Mission completion detected - all waypoints processed!",
        );

        // Set mission start time if not set (fallback)
        if (!missionStartTimeRef.current) {
          console.log(
            "[MissionReportScreen] ⚠️ Mission start time missing, using fallback (1 minute ago)",
          );
          setMissionStartTime(new Date(Date.now() - 60000));
        }

        const completionTime = new Date();
        setMissionEndTime(completionTime);

        // CRITICAL: Mark mission as inactive to reset START/STOP button
        setIsMissionActive(false);
        console.log(
          "[MissionReportScreen] ✅ isMissionActive set to false - button should reset to START",
        );

        // Preserve mission data for export access
        preserveCurrentMission.current();

        // Show completion notification
        showNotification(
          "success",
          "Mission Completed",
          "All marking points have been processed!",
        );

        if (mountedRef.current) {
          setShowCompletionDialog(true);
        }
      }
    }
  }, [currentIndex]);

  // TRAIL DISABLED: WEB APP STYLE: Trail system with timestamps, fading, and smart filtering
  // const trailPointsRef = useRef<Array<{lat: number, lng: number, timestamp: number}>>([]);
  // const lastTrailUpdateRef = useRef<number>(0);
  // const TRAIL_UPDATE_THROTTLE_MS = 100; // Update every 100ms like web app
  // const MIN_TRAIL_DISTANCE_M = 1.5; // Minimum distance between permanent points
  // const TRAIL_FADE_START_SEC = 15; // Start fading after 15 seconds
  // const TRAIL_MAX_AGE_SEC = 30; // Remove points older than 30 seconds

  // TRAIL DISABLED: Update trail when rover position changes (web app style)
  // useEffect(() => {
  //   if (roverPosition && roverPosition.lat && roverPosition.lng) {
  //     const now = Date.now();
  //
  //     // Smart trail filtering with Haversine distance calculation
  //     const shouldAddTrailPoint = (() => {
  //       if (trailPointsRef.current.length === 0) return true;
  //
  //       const lastPoint = trailPointsRef.current[trailPointsRef.current.length - 1];
  //       const timeSinceLastPoint = now - lastTrailUpdateRef.current;
  //
  //       if (timeSinceLastPoint < TRAIL_UPDATE_THROTTLE_MS) return false;
  //
  //       // Haversine distance calculation (meters)
  //       const R = 6371000; // Earth radius in meters
  //       const lat1 = lastPoint.lat * Math.PI / 180;
  //       const lat2 = roverPosition.lat * Math.PI / 180;
  //       const deltaLat = (roverPosition.lat - lastPoint.lat) * Math.PI / 180;
  //       const deltaLng = (roverPosition.lng - lastPoint.lng) * Math.PI / 180;
  //
  //       const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
  //                Math.cos(lat1) * Math.cos(lat2) *
  //                Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
  //       const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  //       const distance = R * c;
  //
  //       return distance >= MIN_TRAIL_DISTANCE_M;
  //     })();
  //
  //     if (shouldAddTrailPoint) {
  //       trailPointsRef.current.push({
  //         lat: roverPosition.lat,
  //         lng: roverPosition.lng,
  //         timestamp: now
  //       });
  //       lastTrailUpdateRef.current = now;
  //     }
  //
  //     // Remove old trail points (older than TRAIL_MAX_AGE_SEC)
  //     const maxAgeMs = TRAIL_MAX_AGE_SEC * 1000;
  //     trailPointsRef.current = trailPointsRef.current.filter(p => (now - p.timestamp) < maxAgeMs);
  //
  //     // Keep only MAX_TRAIL_POINTS
  //     if (trailPointsRef.current.length > MAX_TRAIL_POINTS) {
  //       trailPointsRef.current = trailPointsRef.current.slice(-MAX_TRAIL_POINTS);
  //     }
  //
  //     // Convert to format expected by MissionMap with fading
  //     const trailWithFading = trailPointsRef.current.map(p => {
  //       const ageSeconds = (now - p.timestamp) / 1000;
  //       let opacity = 1.0;
  //
  //       // Start fading after TRAIL_FADE_START_SEC
  //       if (ageSeconds > TRAIL_FADE_START_SEC) {
  //         const fadeProgress = (ageSeconds - TRAIL_FADE_START_SEC) / (TRAIL_MAX_AGE_SEC - TRAIL_FADE_START_SEC);
  //         opacity = Math.max(0.1, 1.0 - fadeProgress);
  //       }
  //
  //       return {
  //         latitude: p.lat,
  //         longitude: p.lng,
  //         opacity: opacity,
  //         timestamp: p.timestamp
  //       };
  //     });
  //
  //     // Only update trailPoints state when the trail actually changes (new point added or old point removed)
  //     // Don't trigger updates on every position change - this prevents unnecessary re-renders
  //     setTrailPoints(trailWithFading);
  //   }
  // }, [roverPosition]);

  // Preserve current mission data as previous mission (for export access)
  // Using a stable ref callback that always has access to current values
  const preserveCurrentMission = useRef(() => {
    const wps = waypointsRef.current;
    const sMap = reportStatusMapRef.current;
    if (wps.length > 0 || Object.keys(sMap).length > 0) {
      console.log(
        "[MissionReportScreen] Preserving current mission data for export access",
      );
      setPreviousMissionData({
        waypoints: [...wps],
        statusMap: { ...sMap },
        missionMode: missionModeRef.current,
        startTime: missionStartTimeRef.current,
        endTime: missionEndTimeRef.current,
      });
    }
  });

  // PX4 point journal terminal events (point_completed / point_failed / point_aborted)
  useEffect(() => {
    // Flow isolation: when a verified GPS mission is loaded, the PX4 point
    // terminal handler must NOT fire — the verified handler owns terminal state.
    // This prevents duplicate completion dialogs across the two flows.
    if (verifiedCtx.isLoaded) return;
    if (!POINT_MISSION_ENABLED || !px4MissionTerminal) return;

    const { outcome, event } = px4MissionTerminal;
    console.log(
      "[MissionReportScreen] PX4 point mission terminal:",
      outcome,
      event.event_type,
    );

    setIsMissionActive(false);
    preserveCurrentMission.current();

    if (!missionEndTimeRef.current) {
      const endTime = event.timestamp ? new Date(event.timestamp) : new Date();
      setMissionEndTime(endTime);
    }

    if (outcome === "completed") {
      showNotification(
        "success",
        "Mission Completed",
        "All marking points have been processed!",
      );
      if (mountedRef.current) {
        setShowCompletionDialog(true);
      }
      clearMissionTerminal();
      return;
    }

    const detail = event.message || event.reason || `Mission ${outcome}`;
    showNotification("error", "Mission Ended", detail);
    clearMissionTerminal();
  }, [px4MissionTerminal, clearMissionTerminal, verifiedCtx.isLoaded]);

  // 4WD verified mission terminal handler
  useEffect(() => {
    // Flow isolation: only handle verified terminal state for a verified mission.
    if (!verifiedCtx.isLoaded) return;
    if (!verifiedTerminal) return;

    setIsMissionActive(false);
    preserveCurrentMission.current();

    if (!missionEndTimeRef.current) {
      const endTime = verifiedTerminal.event.timestamp
        ? new Date(verifiedTerminal.event.timestamp)
        : new Date();
      setMissionEndTime(endTime);
    }

    if (verifiedTerminal.outcome === "completed") {
      showNotification(
        "success",
        "Mission Completed",
        "All marking points processed!",
      );
      if (mountedRef.current) setShowCompletionDialog(true);
      clearVerifiedTerminal();
      return;
    }

    const detail =
      verifiedTerminal.event.message ??
      verifiedTerminal.event.reason ??
      `Mission ${verifiedTerminal.outcome}`;
    showNotification("error", "Mission Ended", detail);
    clearVerifiedTerminal();
  }, [verifiedTerminal, clearVerifiedTerminal, verifiedCtx.isLoaded]);

  // Get mission data for display (current or previous) — memoized to avoid
  // creating new object references on every telemetry-driven re-render
  const displayData = useMemo(() => {
    // If there is no current mission data, keep the completed mission available
    // for report/export review. Once new waypoints are loaded, they are the
    // authoritative mission and must replace the previous display immediately.
    if (
      previousMissionData &&
      !isMissionActive &&
      Object.keys(statusMap).length === 0 &&
      waypoints.length === 0
    ) {
      return {
        waypoints: previousMissionData.waypoints,
        statusMap: previousMissionData.statusMap,
        missionMode: previousMissionData.missionMode,
        startTime: previousMissionData.startTime,
        endTime: previousMissionData.endTime,
      };
    }
    // Otherwise show current mission data
    return {
      waypoints,
      statusMap: reportStatusMap,
      missionMode,
      startTime: missionStartTime,
      endTime: missionEndTime,
    };
  }, [
    previousMissionData,
    isMissionActive,
    statusMap,
    reportStatusMap,
    waypoints,
    missionMode,
    missionStartTime,
    missionEndTime,
  ]);

  useEffect(() => {
    const statusMap: Record<number, { status?: string }> = {};
    Object.entries(displayData.statusMap ?? {}).forEach(([key, value]) => {
      const sn = Number(key);
      if (!Number.isFinite(sn)) return;
      const raw =
        value && typeof value === "object" && "status" in value
          ? String((value as { status?: string }).status ?? "")
          : "";
      statusMap[sn] = { status: raw.toLowerCase() };
    });
    setMissionSnapshot({
      waypoints: (displayData.waypoints ?? []).map((wp) => ({
        lat: wp.lat,
        lon: wp.lon,
        sn: wp.sn,
      })),
      statusMap,
      activeWaypointIndex: effectiveCurrentIndex,
      trajectoryPoints: preview.points,
    });
  }, [
    displayData.waypoints,
    displayData.statusMap,
    effectiveCurrentIndex,
    preview.points,
    setMissionSnapshot,
  ]);

  const missionProgressRef = useMemo(
    () =>
      getMissionProgressRef(
        displayData.waypoints,
        effectiveCurrentIndex,
        effectiveMissionActive,
      ),
    [displayData.waypoints, effectiveCurrentIndex, effectiveMissionActive],
  );

  // Calculate mission statistics for completion dialog
  const getMissionStats = () => {
    const totalWaypoints = displayData.waypoints.length;
    const completedWaypoints = displayData.waypoints.filter((wp) => {
      const wpStatus = displayData.statusMap[wp.sn];
      return wpStatus && wpStatus.status === "completed";
    }).length;
    const skippedWaypoints = displayData.waypoints.filter((wp) => {
      const wpStatus = displayData.statusMap[wp.sn];
      return wpStatus && wpStatus.status === "skipped";
    }).length;

    const formatTime = (date: Date | null) => {
      if (!date) return "N/A";
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    };

    const formatDuration = () => {
      const startTime = displayData.startTime;
      const endTime = displayData.endTime;
      if (!startTime || !endTime) return "N/A";
      const durationMs = endTime.getTime() - startTime.getTime();
      const minutes = Math.floor(durationMs / 60000);
      const seconds = Math.floor((durationMs % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    };

    return {
      totalWaypoints,
      completedWaypoints,
      skippedWaypoints,
      missionDuration: formatDuration(),
      startTime: formatTime(displayData.startTime),
      endTime: formatTime(displayData.endTime),
    };
  };

  // DEBUG: Manual function to test completion dialog
  const testCompletionDialog = () => {
    console.log(
      "[MissionReportScreen] 🧪 TEST: Manually opening completion dialog",
    );
    console.log("[MissionReportScreen] 🧪 Current state:", {
      showCompletionDialog,
      isMissionActive,
      missionStartTime,
      missionEndTime,
      waypointCount: waypoints.length,
      statusMapKeys: Object.keys(statusMap).length,
    });
    setShowCompletionDialog(true);
  };

  // Check if there's existing mission data that would be cleared
  const hasExistingMissionData = () => {
    const hasWaypoints = waypoints.length > 0;
    const hasProgress = Object.keys(statusMap).length > 0;
    const hasPreviousData = previousMissionData !== null;
    return hasWaypoints || hasProgress || hasPreviousData;
  };

  // Get existing mission info for confirmation dialog
  const getExistingMissionInfo = () => {
    return {
      waypointCount: waypoints.length,
      hasProgress: Object.keys(statusMap).length > 0,
    };
  };

  // Clear current mission data when starting new mission
  const clearCurrentMissionData = () => {
    console.log(
      "[MissionReportScreen] Clearing current mission data for new mission",
    );
    setStatusMap({});
    resetPointStatusMap();
    // Do not let terminal rows from the prior mission bridge into a new run.
    previousReportStatusMapRef.current = null;

    /*
     * Never allow terminal accuracy from the
     * previous mission run to leak into the next run.
     */
    clearTerminalRppAccuracyFallback();
    const previousRunId =
      canonicalMissionReportRef.current?.mission_run_id ?? null;
    if (previousRunId) {
      staleMissionRunIdRef.current = previousRunId;
    }
    holdingForNewReportRunRef.current = true;
    canonicalMissionReportRef.current = null;
    setCanonicalMissionReport(null);
    setCurrentIndex(null);
    setMissionStartTime(null);
    setMissionEndTime(null);
    setWaitingForManual(false);
    // TRAIL DISABLED: Clear trail commented out
    // setTrailPoints([]);
    // trailPointsRef.current = [];
  };

  /**
   * A completed mission may be archived by the rover and leave the active
   * mission status as EMPTY. Rehydrate that same mission transparently before
   * Start so the operator does not have to upload or press Restore again.
   */
  const restoreRetainedMissionForStart = useCallback(async (): Promise<MissionRuntimeState> => {
    const retained = retainedMissionRef.current;
    const missionId = String(retained?.mission_id ?? "").trim();
    if (!missionId) {
      throw new Error("The completed mission identity is unavailable. Upload the mission again.");
    }

    const restoredResponse = await restoreMission(missionId);
    if (!restoredResponse?.success || !restoredResponse.mission) {
      throw new Error(
        restoredResponse?.message || "The rover could not restore the completed mission.",
      );
    }

    let restoredMission = restoredResponse.mission;
    setBackendMission(restoredMission);

    // Restore already waits for preparation on current rover backends. Prefer
    // the live Socket.IO status if a slower rover still needs a little longer;
    // REST is a sparse fallback only. The previous 400 ms polling delay made
    // a repeat Start feel slow even when the restored path was already ready.
    const deadline = Date.now() + 30_000;
    const REST_FALLBACK_DELAY_MS = 250;
    const REST_FALLBACK_INTERVAL_MS = 500;
    const isReadyForLoad = (mission: MissionRuntimeState | null | undefined) =>
      mission?.loaded === true && mission.trajectory_ready === true;
    const isSameMission = (mission: MissionRuntimeState | null | undefined) =>
      String(mission?.mission_id ?? "").trim() === missionId;
    let nextRestFallbackAt = Date.now() + REST_FALLBACK_DELAY_MS;
    while (
      Date.now() < deadline &&
      mountedRef.current &&
      !isReadyForLoad(restoredMission)
    ) {
      const liveMission = backendMissionRef.current;
      if (isSameMission(liveMission) && isReadyForLoad(liveMission)) {
        restoredMission = liveMission!;
        break;
      }

      if (Date.now() >= nextRestFallbackAt) {
        const status = await getMissionStatus();
        nextRestFallbackAt = Date.now() + REST_FALLBACK_INTERVAL_MS;
        if (status?.success && status.mission) {
          restoredMission = status.mission;
          setBackendMission(restoredMission);
          const state = String(restoredMission.state ?? "")
            .trim()
            .toUpperCase();
          if (state === "ERROR") {
            throw new Error(
              restoredMission.error ||
                restoredMission.message ||
                "The rover failed to prepare the completed mission.",
            );
          }
        }
      }

      if (isReadyForLoad(restoredMission)) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (!isReadyForLoad(restoredMission)) {
      throw new Error("The restored mission path is still preparing. Please try Start again shortly.");
    }

    // Restore intentionally leaves accepted_for_start false. Confirm the
    // already restored preview in the same hidden step the user previously
    // performed with Load Mission.
    const loadResponse = await loadMission(missionId);
    if (!loadResponse?.success || !loadResponse.mission) {
      throw new Error(
        loadResponse?.message || "The rover could not load the restored mission.",
      );
    }

    setBackendMission(loadResponse.mission);
    return loadResponse.mission;
  }, [setBackendMission]);

  const handleSetExecutionMode = async (newMode: "AUTO" | "MANUAL") => {
    try {
      console.log("[MissionReportScreen] Setting execution mode:", newMode);

      const response = await setMissionExecutionMode(newMode);

      if (!response.success || response.mission?.execution_mode !== newMode) {
        const message =
          response.success
            ? "The rover did not confirm the requested execution mode."
            : response.mission?.message || response.message || "Backend rejected execution mode.";
        showNotification("error", "Mode Change Failed", message, 5000);
        return {
          success: false,
          message,
        };
      }

      setBackendMission(response.mission);

      setMode(newMode);

      setWaitingForManual(
        String(response.mission?.state ?? "")
          .trim()
          .toUpperCase() === "WAITING_FOR_NEXT",
      );

      console.log("[MissionReportScreen] Execution mode accepted:", {
        executionMode: response.mission?.execution_mode,

        state: response.mission?.state,
      });

      return response;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to set mission execution mode.";

      console.error("[MissionReportScreen] Execution mode failed:", error);

      void refreshBackendMission();

      showNotification("error", "Mode Change Failed", message, 5000);

      return {
        success: false,
        message,
      };
    }
  };

  const handleStart = async () => {
    if (!mountedRef.current) {
      return {
        success: false,
        message: "Mission screen is not active.",
      };
    }

    if (effectiveLifecycle.state !== "READY" || backendMission?.accepted_for_start !== true) {
      const message = "Load a mission and wait for the rover to report READY before starting.";
      showNotification("info", "Start Unavailable", message, 5000);
      return { success: false, message };
    }

    if (authoringChanged) {
      const message =
        "Wait for the automatic path update to finish before starting this mission.";
      showNotification("info", "Path Updating", message, 4000);
      return {
        success: false,
        message,
      };
    }

    if (startInFlightRef.current) {
      return {
        success: false,
        message: "Mission start is already in progress.",
      };
    }
    startInFlightRef.current = true;
    setIsStartingMission(true);
    const generation = commandGenerationRef.current;
    const superseded = () => generation !== commandGenerationRef.current;
    const stoppedDuringStart = () => ({ success: false, message: "Stop superseded the pending Start." });

    const attemptId = createMissionStartAttemptId();
    startTimingAttemptRef.current = attemptId;
    lastLoggedStartPhaseRef.current = null;
    firstMotionLoggedRef.current = false;
    logMissionStartTiming(attemptId, "handle_enter");

    try {
      console.log("[MissionReportScreen] Requesting mission start...");

      // Use the last confirmed mission when a terminal status briefly omits
      // its identity. If terminal cleanup archived the active slot, restore
      // and confirm that same mission automatically before evaluating Start.
      let latestMission = backendMission ?? retainedMissionRef.current;
      const backendState = String(backendMission?.state ?? "")
        .trim()
        .toUpperCase();
      const terminalStates = new Set([
        "EMPTY",
        "COMPLETED",
        "STOPPED",
        "FAILED",
        "ERROR",
      ]);
      const retainedMissionId = String(
        retainedMissionRef.current?.mission_id ?? previewMissionId,
      ).trim();

      // If Mission Progress was mounted only after the run completed, the
      // shared retained preview is still enough to recover the mission ID.
      // Seed the same snapshot used by the normal status path before restore.
      if (!retainedMissionRef.current && previewMissionId) {
        rememberMission({
          mission_id: previewMissionId,
          loaded: true,
          state: backendState || "EMPTY",
        });
      }

      if (
        !backendMissionStored &&
        retainedMissionId &&
        terminalStates.has(backendState)
      ) {
        setIsPreparingMission(true);
        logMissionStartTiming(attemptId, "backend_phase", "restore");
        latestMission = await restoreRetainedMissionForStart();
        if (superseded()) return stoppedDuringStart();
      }

      const eligibility = getMissionStartEligibility({
        connected: connectionState === "connected",
        loaded:
          isMissionStoredOnRover(latestMission) ||
          Boolean(retainedMissionRef.current),
        state: latestMission?.state,
      });

      if (!eligibility.canPressStart) {
        const message =
          eligibility.reason ?? "Mission is not ready to start.";

        showNotification("error", "Mission Not Ready", message, 4000);

        return {
          success: false,
          message,
        };
      }

      if (waypoints.length === 0) {
        const message = "No marking points are available in the frontend.";

        showNotification("error", "No Marking Points", message);

        return {
          success: false,
          message,
        };
      }

      const invalidWaypoints = waypoints.filter(
        (waypoint) =>
          !Number.isFinite(waypoint.lat) ||
          !Number.isFinite(waypoint.lon) ||
          waypoint.lat === 0 ||
          waypoint.lon === 0,
      );

      if (invalidWaypoints.length > 0) {
        const message =
          `${invalidWaypoints.length} marking point(s) ` +
          "have invalid coordinates.";

        showNotification("error", "Invalid Marking Points", message);

        return {
          success: false,
          message,
        };
      }

      if (mode !== "AUTO" && mode !== "MANUAL") {
        const message = "Select AUTO or MANUAL before starting.";

        showNotification("error", "Invalid Mission Mode", message);

        return {
          success: false,
          message,
        };
      }

      const executionMode: "AUTO" | "MANUAL" =
        mode === "MANUAL" ? "MANUAL" : "AUTO";

      if (latestMission?.marking_tool === "LASER" && executionMode === "AUTO") {
        const message = "Laser marking requires MANUAL execution. Select MANUAL before starting.";
        showNotification("error", "Laser needs MANUAL", message, 5000);
        return { success: false, message };
      }

      if (eligibility.needsPrepare) {
        setIsPreparingMission(true);
        logMissionStartTiming(attemptId, "backend_phase", "prepare");

        const prepareResponse = await prepareMission();
        if (superseded()) return stoppedDuringStart();
        latestMission = prepareResponse.mission;
        setBackendMission(prepareResponse.mission);

        if (!prepareResponse.success) {
          const message =
            prepareResponse.mission?.message ||
            "Failed to prepare the stored mission.";

          showNotification("error", "Prepare Failed", message, 4000);

          return {
            success: false,
            message,
          };
        }

        if (prepareResponse.mission?.ready !== true) {
          const deadline = Date.now() + 20_000;
          let readyMission = prepareResponse.mission;

          while (
            Date.now() < deadline &&
            readyMission?.ready !== true &&
            mountedRef.current
          ) {
            const status = await getMissionStatus();
            if (superseded()) return stoppedDuringStart();
            if (status?.success && status.mission) {
              readyMission = status.mission;
              latestMission = status.mission;
              setBackendMission(status.mission);
              const prepState = String(status.mission.state ?? "")
                .trim()
                .toUpperCase();
              if (prepState === "ERROR" || prepState === "EMPTY") {
                break;
              }
            }
            if (readyMission?.ready === true) {
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          if (readyMission?.ready !== true) {
            const message =
              "The stored mission did not become ready after prepare.";

            showNotification("error", "Mission Not Ready", message, 4000);

            return {
              success: false,
              message,
            };
          }
        }
      }

      if (
        !shouldSkipExecutionModePost(
          latestMission?.execution_mode,
          executionMode,
        )
      ) {
        const modeResponse = await setMissionExecutionMode(executionMode);
        if (superseded()) return stoppedDuringStart();
        if (!modeResponse.success || modeResponse.mission?.execution_mode !== executionMode) {
          const message = modeResponse.message || "The rover did not confirm the requested execution mode.";
          showNotification("error", "Mode Change Failed", message, 5000);
          return { success: false, message };
        }
        latestMission = modeResponse.mission;
        setBackendMission(modeResponse.mission);
        logMissionStartTiming(
          attemptId,
          "execution_mode",
          String(modeResponse.mission?.execution_mode ?? mode),
        );
      } else {
        logMissionStartTiming(attemptId, "execution_mode", "skipped");
      }

      logMissionStartTiming(attemptId, "start_post_sent");
      const response = await startMission(latestMission?.mission_id);
      if (superseded()) return stoppedDuringStart();
      logMissionStartTiming(
        attemptId,
        "start_post_returned",
        `success=${String(response.success)} state=${String(
          response.mission?.state ?? "",
        )} pause=${String(response.mission?.pause_reason ?? "")}`,
      );

      if (!response.success) {
        const message =
          response.mission?.message ||
          "The backend rejected the mission start request.";

        showNotification("error", "Start Failed", message, 4000);

        return {
          success: false,
          message,
        };
      }

      // Only a confirmed running, paused or waiting state counts as Start.
      // An unexpected response triggers a fresh status request below.
      const startedMission = response.mission;
      const startOutcome = classifyMissionStartOutcome({
        state: startedMission?.state,
        pauseReason: startedMission?.pause_reason,
      });
      logMissionStartTiming(
        attemptId,
        "backend_phase",
        `start_outcome=${startOutcome.kind}`,
      );

      if (startOutcome.kind === "other") {
        const message = `Start was not confirmed (rover state: ${startOutcome.state || "unknown"}).`;
        showNotification("error", "Start Not Confirmed", message, 6000);
        void refreshBackendMission();
        return { success: false, message };
      }

      clearCurrentMissionData();
      setBackendMission(startedMission);

      setIsMissionActive(true);
      setMissionStartTime(new Date());
      setMissionEndTime(null);
      setCurrentIndex(0);
      const startPosition = liveStore.getSnapshot().roverPosition;
      startOriginRef.current = {
        lat: startPosition?.lat ?? 0,
        lon: startPosition?.lng ?? 0,
      };

      if (startOutcome.kind === "paused") {
        showNotification(
          "info",
          "Mission Started — Paused",
          startOutcome.pauseReason
            ? `Rover paused (${startOutcome.pauseReason}). Press Resume when it is allowed.`
            : "Rover paused. Press Resume when it is allowed.",
          6000,
        );
      } else if (startOutcome.kind === "waiting") {
        showNotification("info", "Waiting for Operator", "The rover is waiting for the next point command.", 6000);
      } else {
        showNotification(
          "success",
          "Mission Started",
          "The rover mission started successfully.",
        );
      }

      console.log("[MissionReportScreen] Mission start accepted:", {
        state: startedMission?.state,
        loaded: startedMission?.loaded,
        ready: startedMission?.ready,
        pause_reason: startedMission?.pause_reason,
      });

      return response;
    } catch (error) {
      if (superseded()) return stoppedDuringStart();
      const message =
        error instanceof Error ? error.message : "Failed to start mission.";

      console.error("[MissionReportScreen] Mission start failed:", error);

      void refreshBackendMission();

      showNotification("error", "Mission Start Blocked", message, 8000);

      Alert.alert("Mission Start Blocked", message, [
        {
          text: "OK",
        },
      ]);

      return {
        success: false,
        message,
      };
    } finally {
      startInFlightRef.current = false;
      setIsPreparingMission(false);
      setIsStartingMission(false);
    }
  };

  const handlePause = async () => {
    const generation = commandGenerationRef.current;
    try {
      console.log("[MissionReportScreen] Pausing mission...");

      const response = await pauseMission();
      if (generation !== commandGenerationRef.current) return { success: false, message: "Stop superseded Pause." };

      if (response.mission) setBackendMission(response.mission);

      if (response.success && String(response.mission?.state ?? "").trim().toUpperCase() === "PAUSED") {
        // A paused mission is still an active mission.
        setIsMissionActive(true);

        showNotification(
          "success",
          "Mission Paused",
          response.mission.message || "Mission paused successfully.",
        );
      } else {
        const message = response.message || response.mission?.message || "Pause was not confirmed by the rover.";
        showNotification("error", "Pause Not Confirmed", message, 5000);
        void refreshBackendMission();
        return { success: false, message };
      }

      return response;
    } catch (error) {
      if (generation !== commandGenerationRef.current) return { success: false, message: "Stop superseded Pause." };
      const message =
        error instanceof Error ? error.message : "Failed to pause mission.";

      console.error("[MissionReportScreen] Pause failed:", error);

      void refreshBackendMission();

      showNotification("error", "Pause Failed", message, 5000);

      return {
        success: false,
        message,
      };
    }
  };

  const handleResume = async () => {
    const generation = commandGenerationRef.current;
    if (!backendResumeAvailable) {
      const reason = pauseReasonText(backendPauseReason, backendRtkReason).blockedMessage;

      showNotification("info", "Resume Blocked", reason, 4500);

      return {
        success: false,
        message: reason,
      };
    }

    try {
      console.log("[MissionReportScreen] Resuming mission...");

      const response = await resumeMission();
      if (generation !== commandGenerationRef.current) return { success: false, message: "Stop superseded Resume." };

      if (response.mission) setBackendMission(response.mission);

      if (response.success && ["RUNNING", "WAITING_FOR_NEXT"].includes(String(response.mission?.state ?? "").trim().toUpperCase())) {
        setIsMissionActive(true);

        showNotification(
          "success",
          "Mission Resumed",
          response.mission.message || "Mission resumed successfully.",
        );
      } else {
        const message = response.message || response.mission?.message || "Resume was not confirmed by the rover.";
        showNotification("error", "Resume Not Confirmed", message, 5000);
        void refreshBackendMission();
        return { success: false, message };
      }

      return response;
    } catch (error) {
      if (generation !== commandGenerationRef.current) return { success: false, message: "Stop superseded Resume." };
      const message =
        error instanceof Error ? error.message : "Failed to resume mission.";

      console.error("[MissionReportScreen] Resume failed:", error);

      void refreshBackendMission();

      showNotification("error", "Resume Failed", message, 5000);

      return {
        success: false,
        message,
      };
    }
  };

  const handleStop = async () => {
    setStopAwaitingTerminal(true);
    console.log("[MissionReportScreen] Stopping mission...");

    const { result } = await runStopCommand({
      generationRef: commandGenerationRef,
      phaseRef: stopFencePhaseRef,
      stop: stopMission,
      fetchStatus: getMissionStatus,
      applyFreshStatus: (mission: MissionRuntimeState) => {
        setBackendMission(mission, { fresh: true });
      },
      shouldContinue: () => mountedRef.current,
      onRecorded: () => {
        showNotification("info", "Stop recorded", "Stop request recorded. Physical stop is not confirmed.", 6000);
      },
      onRefused: (response) => {
        showNotification("error", "Stop Not Confirmed", response.message || response.mission?.message || "The rover refused Stop.", 6000);
      },
      onFailed: (error) => {
        const message =
          error instanceof Error ? error.message : "Failed to stop mission.";

        console.error("[MissionReportScreen] Stop failed:", error);

        showNotification("error", "Stop Failed", message, 5000);

        return {
          success: false,
          message,
        };
      },
    });

    return result;
  };

  const handleNext = async () => {
    const generation = commandGenerationRef.current;
    try {
      console.log("[MissionReportScreen] Moving to next marking point...");

      const response = await nextMissionPoint();
      if (generation !== commandGenerationRef.current) return { success: false, message: "Stop superseded Next." };

      if (response.mission) setBackendMission(response.mission);

      if (response.success) {
        if (response.mission?.state) {
          setWaitingForManual(String(response.mission.state).trim().toUpperCase() === "WAITING_FOR_NEXT");
        }

        showNotification(
          "info",
          "Next request recorded",
          response.mission?.message || response.message || "The rover recorded the Next request.",
        );
      }

      return response;
    } catch (error) {
      if (generation !== commandGenerationRef.current) return { success: false, message: "Stop superseded Next." };
      const message =
        error instanceof Error
          ? error.message
          : "Failed to move to the next marking point.";

      console.error("[MissionReportScreen] Next point failed:", error);

      void refreshBackendMission();

      showNotification("error", "Next Failed", message, 5000);

      return {
        success: false,
        message,
      };
    }
  };

  const handleSkip = async () => {
    const generation = commandGenerationRef.current;
    try {
      console.log("[MissionReportScreen] Skipping current marking point...");

      const response = await skipMissionPoint();
      if (generation !== commandGenerationRef.current) return { success: false, message: "Stop superseded Skip." };

      if (response.mission) setBackendMission(response.mission);

      if (response.success) {
        showNotification(
          "info",
          "Skip current goal",
          response.mission?.message || response.message || "The rover recorded the Skip request.",
        );
      }

      return response;
    } catch (error) {
      if (generation !== commandGenerationRef.current) return { success: false, message: "Stop superseded Skip." };
      const message =
        error instanceof Error
          ? error.message
          : "Failed to skip the marking point.";

      console.error("[MissionReportScreen] Skip point failed:", error);

      void refreshBackendMission();

      showNotification("error", "Skip Failed", message, 5000);

      return {
        success: false,
        message,
      };
    }
  };

  // Save the mission currently shown in the app (including any applied edits)
  // as a CSV the rover can accept again.
  const exportInFlightRef = useRef(false);
  const handleExportMissionFile = async (): Promise<void> => {
    if (waypoints.length === 0) {
      showNotification("error", "Nothing to export", "Upload a mission first.");
      return;
    }
    if (exportInFlightRef.current) return;
    exportInFlightRef.current = true;

    let temporaryFileUri: string | null = null;
    try {
      const csv = buildMissionCsvFromWaypoints(waypoints);
      const cacheDirectory = FileSystem.cacheDirectory;
      if (!cacheDirectory) throw new Error("Temporary storage is unavailable.");

      const stamp = new Date()
        .toISOString()
        .replace(/[-:]/g, "")
        .replace("T", "-")
        .slice(0, 15);
      const filename = `mission-${stamp}.csv`;
      temporaryFileUri = `${cacheDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(temporaryFileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const saved = await downloadFileToDevice(
        temporaryFileUri,
        filename,
        getMimeType(filename),
      );
      if (saved) {
        showNotification(
          "success",
          "Mission exported",
          `${waypoints.length} points saved as ${filename}`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not export the mission.";
      console.error("[MissionReportScreen] Mission export failed:", error);
      showNotification("error", "Export failed", message, 5000);
    } finally {
      exportInFlightRef.current = false;
      if (temporaryFileUri) {
        await FileSystem.deleteAsync(temporaryFileUri, { idempotent: true }).catch(
          () => undefined,
        );
      }
    }
  };

  // Confirms the rover's prepared path, exactly as the planner's Load did, but
  // stays on the home screen. Success shows only after the rover confirms it.
  const handleHomeLoadMission = async (): Promise<void> => {
    if (homeMissionRequestRef.current) return;
    if (connectionState !== "connected") {
      showNotification("error", "Connect Rover", "Connect to the rover first.", 5000);
      return;
    }
    if (preview.acceptedForStart) {
      showNotification("info", "Already Loaded", "This mission is already loaded on the rover.", 4500);
      return;
    }
    if (!canLoadBackendPreview(preview)) {
      showNotification("info", "Not Ready", "The rover is still preparing the path. Try again shortly.", 4500);
      return;
    }

    homeMissionRequestRef.current = true;
    setIsLoadingHomeMission(true);
    try {
      if (!missionExtension.missionId || missionExtension.missionId !== preview.missionId) {
        throw new Error("Wait for the rover's current mission settings and path before loading it.");
      }
      const response = await loadMission(preview.missionId ?? undefined);
      if (!response.success) {
        throw new Error(response.message || "The rover rejected Load Mission.");
      }
      markLoadAccepted();
      showNotification("success", "Mission Loaded", "The rover has the mission. It has not started.", 4500);
      // Keep status in step, but a failed refresh must not undo a confirmed Load.
      void refreshBackendMission().catch((error: unknown) =>
        console.warn("[MissionReport] Mission refresh after Load failed:", error),
      );
      void refreshNow().catch((error: unknown) =>
        console.warn("[MissionReport] Preview refresh after Load failed:", error),
      );
    } catch (error) {
      const detail = extensionErrorDetail(error);
      if (detail.code === "MISSION_CHANGED") {
        void missionExtension.refresh();
        void refreshBackendMission();
        void refreshNow();
      }
      showNotification(
        "error",
        "Load Failed",
        detail.code === "MISSION_CHANGED"
          ? "The mission changed on the rover. Wait for the current path and try again."
          : detail.message,
        6000,
      );
    } finally {
      homeMissionRequestRef.current = false;
      setIsLoadingHomeMission(false);
    }
  };

  // Same two routes as the planner: change the rover's mission in place when it
  // reports extension settings, otherwise send the mission again with the choice.
  const handleApplyHomeExtension = async (choice: ExtensionChoice): Promise<void> => {
    if (homeMissionRequestRef.current) return;
    homeMissionRequestRef.current = true;
    setIsApplyingHomeExtension(true);
    let temporaryFileUri: string | null = null;
    try {
      if (missionExtension.availability === "error" ||
          (preview.missionId && missionExtension.availability !== "available")) {
        showNotification("error", "Row Extension", missionExtension.message ?? "Wait for the rover's row extension settings.", 6000);
        return;
      }
      if (missionExtension.settings) {
        const outcome = await missionExtension.apply(choice);
        if (outcome.status === "applied") {
          if (outcome.changed) {
            invalidateForUpload();
            void refreshNow();
          }
          setHeldExtensionChoice(choice);
          showNotification(
            outcome.changed ? "success" : "info",
            "Row Extension",
            outcome.message,
            5000,
          );
        } else {
          if (outcome.status === "restored") { invalidateForUpload(); void refreshNow(); }
          if (outcome.status === "cleared") clearTrajectory();
          showNotification(
            outcome.status === "conflict" ? "info" : "error",
            "Row Extension",
            outcome.message,
            6000,
          );
        }
        return;
      }

      if (connectionState !== "connected") {
        showNotification("error", "Connect Rover", "Connect to the rover first.", 5000);
        return;
      }
      if (effectiveMissionActive) {
        showNotification("error", "Row Extension", "Stop the mission before changing the extension.", 5000);
        return;
      }
      if (waypoints.length < 2) {
        showNotification("error", "Row Extension", "Upload a mission with at least 2 points first.", 5000);
        return;
      }

      const uploadChoice: ExtensionChoice = choice;
      const cacheDirectory = FileSystem.cacheDirectory;
      if (!cacheDirectory) throw new Error("Temporary storage is unavailable.");
      temporaryFileUri = `${cacheDirectory}mission-extension-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(
        temporaryFileUri,
        buildMissionCsvFromWaypoints(waypoints),
        { encoding: FileSystem.EncodingType.UTF8 },
      );

      invalidateForUpload();
      const result = await uploadMissionCsv({
        file: {
          uri: temporaryFileUri,
          name: "mission.csv",
          mimeType: "text/csv",
        } as any,
        extensionMode: uploadChoice.enabled ? "ENABLE" : "DISABLE",
        dummyPointDistanceM: uploadChoice.enabled ? uploadChoice.distanceM : undefined,
        triggerDistanceM: uploadChoice.enabled ? uploadChoice.triggerDistanceM : undefined,
      });

      if (!result.success) {
        resumePreviewAfterFailedUpload();
        void refreshNow().catch(() => undefined);
        showNotification(
          "error",
          "Row Extension",
          result.message ?? "The rover rejected the mission.",
          6000,
        );
        return;
      }

      setHeldExtensionChoice(uploadChoice);
      setStatusMap({});
      setMissionStartTime(null);
      setMissionEndTime(null);
      setCurrentIndex(null);
      resetVerifiedProgress();
      clearVerifiedTerminal();
      await refreshBackendMission();
      await refreshNow();
      showNotification(
        "success",
        "Row Extension",
        uploadChoice.enabled
          ? "The rover is preparing the extended path. Load it once it is ready."
          : "Extension off. The rover is preparing the path. Load it once it is ready.",
        5000,
      );
    } catch (error) {
      resumePreviewAfterFailedUpload();
      void refreshNow().catch(() => undefined);
      showNotification(
        "error",
        "Row Extension",
        error instanceof Error ? error.message : "Could not update the mission on the rover.",
        6000,
      );
    } finally {
      if (temporaryFileUri) {
        await FileSystem.deleteAsync(temporaryFileUri, { idempotent: true }).catch(
          () => undefined,
        );
      }
      homeMissionRequestRef.current = false;
      setIsApplyingHomeExtension(false);
    }
  };

  // Push an edited point list to the rover. The rover only ever sees a normal
  // CSV upload, so every backend safety rule (not while a mission is active,
  // validation, trajectory preparation) applies unchanged.
  const handleCommitMissionEdit = async (
    edited: Waypoint[],
  ): Promise<{ success: boolean; message?: string }> => {
    if (connectionState !== "connected") {
      return { success: false, message: "Connect to the rover first." };
    }
    if (effectiveMissionActive) {
      return { success: false, message: "Stop the mission before editing it." };
    }
    if (edited.length < 2) {
      return { success: false, message: "A mission needs at least 2 points." };
    }

    let temporaryFileUri: string | null = null;
    try {
      // Keep the row-extension choice the rover currently holds. If it cannot
      // be read, stop: guessing would silently change the mission.
      let extension;
      try {
        extension = await getMissionExtension();
      } catch {
        return {
          success: false,
          message:
            "Could not read the rover's row-extension settings. Nothing was changed.",
        };
      }
      if (!extension.available || !extension.mission_id) {
        return { success: false, message: "The rover has no staged mission to edit. Upload the mission again." };
      }
      if (extension.mission_id !== preview.missionId) {
        void refreshNow();
        return { success: false, message: "The mission changed on the rover. Wait for the current path before editing it." };
      }
      const choice = choiceFromSettings(
        extension.extension ?? null,
        extension.limits,
      );

      const csv = buildMissionCsvFromWaypoints(edited);
      const cacheDirectory = FileSystem.cacheDirectory;
      if (!cacheDirectory) throw new Error("Temporary storage is unavailable.");
      temporaryFileUri = `${cacheDirectory}mission-edit-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(temporaryFileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      invalidateForUpload();
      const result = await uploadMissionCsv({
        file: {
          uri: temporaryFileUri,
          name: "mission.csv",
          mimeType: "text/csv",
        } as any,
        extensionMode: choice.enabled ? "ENABLE" : "DISABLE",
        dummyPointDistanceM: choice.enabled ? choice.distanceM : undefined,
        triggerDistanceM: choice.enabled ? choice.triggerDistanceM : undefined,
      });

      if (!result.success) {
        resumePreviewAfterFailedUpload();
        void refreshNow();
        return {
          success: false,
          message: result.message ?? "The rover rejected the edited mission.",
        };
      }

      // Only now, with the rover's confirmation, does the app show the edit.
      setMissionWaypoints(edited);
      setIsMissionActive(false);
      setStatusMap({});
      setMissionStartTime(null);
      setMissionEndTime(null);
      setCurrentIndex(null);
      resetVerifiedProgress();
      clearVerifiedTerminal();
      await refreshBackendMission();
      await refreshNow();

      return {
        success: true,
        message: "The rover has the edited mission. Load it again before starting.",
      };
    } catch (error) {
      resumePreviewAfterFailedUpload();
      void refreshNow();
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Could not update the mission on the rover.",
      };
    } finally {
      if (temporaryFileUri) {
        await FileSystem.deleteAsync(temporaryFileUri, { idempotent: true }).catch(
          () => undefined,
        );
      }
    }
  };

  const handleClearMission = async () => {
    try {
      console.log("[MissionReportScreen] Clearing mission...");
      const result = await clearMission();
      if (!result.success) {
        throw new Error(result.message || "The rover could not clear the mission.");
      }
      clearRetainedMission();
      setBackendMission(null);
      verifiedCtx.clearLoadedMission();
      resetVerifiedProgress();
      onMissionCleared?.();
      showNotification("success", "Cleared", "Mission cleared from controller");
    } catch (err) {
      console.error("[MissionReportScreen] Clear mission error:", err);
      showNotification("error", "Clear Failed", String(err));
    }
  };

  const handleExport = () => {
    console.log("[MissionReportScreen] Export report triggered");
  };

  // The export window asks for the report's points and its timing together.
  // One short-lived request serves both, so the rover is not asked twice.
  const exportReportRef = useRef<{
    at: number;
    request: ReturnType<typeof getMissionReport>;
  } | null>(null);
  const getReportForExport = useCallback(() => {
    const cached = exportReportRef.current;
    if (cached && Date.now() - cached.at < 3000) return cached.request;
    const request = getMissionReport();
    exportReportRef.current = { at: Date.now(), request };
    request.catch(() => {
      if (exportReportRef.current?.request === request) {
        exportReportRef.current = null;
      }
    });
    return request;
  }, []);

  const fetchCanonicalExportData = useCallback(async () => {
    const response = await getReportForExport();
    if (!response?.success || response.available !== true || !response.report) {
      return null;
    }
    return projectCanonicalReportForExport(response.report);
  }, [getReportForExport]);

  const fetchCanonicalExportTiming = useCallback(async () => {
    const response = await getReportForExport();
    if (!response?.success || response.available !== true || !response.report) {
      return null;
    }
    const mission = (response.report as { mission?: unknown }).mission as
      | { started_at?: unknown; completed_at?: unknown }
      | undefined;
    const text = (value: unknown) =>
      typeof value === "string" && value.trim() !== "" ? value : null;
    return {
      startedAt: text(mission?.started_at),
      finishedAt: text(mission?.completed_at),
    };
  }, [getReportForExport]);

  // Handle export completion - prompt user to clear logs or keep for review
  const handleExportComplete = () => {
    console.log(
      "[MissionReportScreen] 📤 Export completed - showing clear logs prompt",
    );
    // Show dialog asking if user wants to clear mission logs
    setClearLogsAfterExport(true);
    setShowClearLogsDialog(true);
  };

  // Export sheet -> open the Excel / PDF report exporter (hidden trigger below).
  const [reportExportSignal, setReportExportSignal] = useState(0);
  const handleRequestExportReport = useCallback(() => {
    setReportExportSignal((value) => value + 1);
  }, []);

  // Logs belong to the running mission, so they cannot be cleared mid-run.
  const clearLogsBlockedReason = effectiveMissionActive
    ? "Stop the mission before clearing its logs."
    : null;

  const handleRequestClearLogs = useCallback(() => {
    if (clearLogsBlockedReason) {
      showNotification("error", "Cannot Clear Logs", clearLogsBlockedReason);
      return;
    }
    setClearLogsAfterExport(false);
    setShowClearLogsDialog(true);
  }, [clearLogsBlockedReason]);

  // User confirmed to clear logs after export
  const handleClearLogsAfterExport = async () => {
    if (clearLogsBlockedReason) {
      // A mission started while the confirm dialog was open.
      setShowClearLogsDialog(false);
      showNotification("error", "Cannot Clear Logs", clearLogsBlockedReason);
      return;
    }
    try {
      console.log(
        "[MissionReportScreen] 🗑️ User confirmed - clearing mission logs after export",
      );
      // Clear all mission data
      await PersistentStorage.clearMissionData();

      // Clear local state
      setStatusMap({});
      setPreviousMissionData(null);
      setCurrentIndex(null);
      setMissionStartTime(null);
      setMissionEndTime(null);
      setShowClearLogsDialog(false);

      showNotification(
        "success",
        "Logs Cleared",
        "Mission logs cleared successfully",
      );
      console.log("[MissionReportScreen] ✅ Mission logs cleared after export");
    } catch (error) {
      console.error("[MissionReportScreen] ❌ Failed to clear logs:", error);
      showNotification("error", "Clear Failed", "Failed to clear mission logs");
    }
  };

  // User declined to clear logs - keep for review
  const handleKeepLogsAfterExport = () => {
    console.log(
      "[MissionReportScreen] 📋 User declined - keeping mission logs for review",
    );
    setShowClearLogsDialog(false);
    showNotification("info", "Logs Kept", "Mission logs preserved for review");
  };

  // Clear all mission data (user-initiated)
  const handleClearMissionData = async () => {
    Alert.alert(
      "Clear Mission Data",
      "This will clear all marking points, progress, and mission logs. This cannot be undone. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            try {
              // Clear from persistent storage
              await PersistentStorage.clearMissionData();

              // Clear local state
              clearMissionWaypoints();
              clearRetainedMission();
              setBackendMission(null);
              setStatusMap({});
              setMissionStartTime(null);
              setMissionEndTime(null);
              setIsMissionActive(false);
              setMissionMode("DGPS Mark");
              setCurrentIndex(null);

              showNotification(
                "success",
                "Mission Data Cleared",
                "All mission data has been cleared from storage",
              );
              console.log("[MissionReportScreen] ✅ All mission data cleared");
            } catch (error) {
              console.error(
                "[MissionReportScreen] ❌ Failed to clear mission data:",
                error,
              );
              showNotification(
                "error",
                "Clear Failed",
                "Failed to clear mission data",
              );
            }
          },
        },
      ],
    );
  };

  // Debug function to test mission events (for development/testing)
  const simulateWaypointReached = (wpSn: number) => {
    console.log(`[MissionReportScreen] 🧪 Simulating waypoint ${wpSn} reached`);
    setStatusMap((prev) => ({
      ...prev,
      [wpSn]: {
        ...(prev[wpSn] || {}),
        reached: true,
        status: "reached",
        timestamp: new Date().toISOString(),
      },
    }));
  };

  const simulateWaypointCompleted = (wpSn: number) => {
    console.log(
      `[MissionReportScreen] 🧪 Simulating waypoint ${wpSn} completed`,
    );
    setStatusMap((prev) => ({
      ...prev,
      [wpSn]: {
        ...(prev[wpSn] || {}),
        marked: true,
        status: "completed",
        timestamp: new Date().toISOString(),
        remark: "Test completion",
      },
    }));
  };

  // Test mission events by triggering them manually
  const testMissionEvents = () => {
    console.log(
      "[MissionReportScreen] 🧪 Testing mission events with waypoints:",
      waypoints.length,
    );

    if (waypoints.length === 0) {
      showNotification(
        "error",
        "No Marking Points",
        "Please load marking points first to test mission events",
      );
      return;
    }

    // Test waypoint 1 reached
    setTimeout(() => {
      console.log("[MissionReportScreen] 🧪 Simulating waypoint 1 reached...");
      simulateWaypointReached(1);
    }, 1000);

    // Test waypoint 1 completed
    setTimeout(() => {
      console.log(
        "[MissionReportScreen] 🧪 Simulating waypoint 1 completed...",
      );
      simulateWaypointCompleted(1);
    }, 3000);

    // Test current waypoint change
    setTimeout(() => {
      console.log(
        "[MissionReportScreen] 🧪 Simulating current waypoint change to 2...",
      );
      setCurrentIndex(1); // Waypoint 2 (0-based index)
    }, 5000);

    showNotification(
      "info",
      "Test Started",
      "Mission event simulation started - check console logs",
    );
  };

  // Add to window for debugging in development
  React.useEffect(() => {
    if (__DEV__) {
      (global as any).simulateWaypointReached = simulateWaypointReached;
      (global as any).simulateWaypointCompleted = simulateWaypointCompleted;
      (global as any).testMissionEvents = testMissionEvents;
      console.log(
        "[MissionReportScreen] Debug functions added to global scope:",
      );
      console.log("  - simulateWaypointReached(wpSn)");
      console.log("  - simulateWaypointCompleted(wpSn)");
      console.log("  - testMissionEvents() - runs full test sequence");
    }
  }, [waypoints.length]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;

      // Clear notification timeout on unmount to prevent memory leaks
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
        notificationTimeoutRef.current = null;
      }

      console.log(
        "[MissionReportScreen] Component unmounting - cleaned up timers",
      );
    };
  }, []);

  // Load persisted mission state on mount — single batch read for speed
  useEffect(() => {
    const loadPersistedState = async () => {
      try {
        // BATCH READ: Single AsyncStorage.multiGet instead of 6 separate reads
        const data = await PersistentStorage.loadAllMissionReportData();
        if (!data) return;

        if (data.statusMap && Object.keys(data.statusMap).length > 0) {
          setStatusMap(data.statusMap);
          console.log(
            "[MissionReportScreen] 📂 Restored status map with",
            Object.keys(data.statusMap).length,
            "entries",
          );
        }

        if (data.startTime) {
          setMissionStartTime(data.startTime);
          console.log("[MissionReportScreen] 📂 Restored mission start time");
        }

        if (data.endTime) {
          setMissionEndTime(data.endTime);
          console.log("[MissionReportScreen] 📂 Restored mission end time");
        }

        if (data.isActive) {
          // 🔧 FIX: Only restore mission active state if backend telemetry confirms mission is actually running
          // This prevents showing STOP button when backend mission is not running
          const currentBackendStatus = liveStore.getSnapshot().telemetry?.mission?.status
            ?.toString()
            .toLowerCase();
          const isBackendActuallyRunning =
            currentBackendStatus === "running" ||
            currentBackendStatus === "active";

          if (isBackendActuallyRunning) {
            setIsMissionActive(data.isActive);
            console.log(
              "[MissionReportScreen] 📂 Restored mission active state:",
              data.isActive,
              "(confirmed by backend)",
            );
          } else if (
            currentBackendStatus === undefined ||
            currentBackendStatus === ""
          ) {
            // If no telemetry yet, temporarily restore but will be corrected by MissionControlCard sync
            setIsMissionActive(data.isActive);
            console.log(
              "[MissionReportScreen] 📂 Restored mission active state temporarily (no telemetry yet):",
              data.isActive,
            );
          } else {
            setIsMissionActive(false);
            console.log(
              "[MissionReportScreen] 📂 Skipped restoring mission active state - backend shows:",
              currentBackendStatus || "no status",
            );
          }
        }

        if (data.mode) {
          setMissionMode(data.mode);
          console.log(
            "[MissionReportScreen] 📂 Restored mission mode:",
            data.mode,
          );
        } else {
          // Ensure mode is set to default if no saved mode
          setMissionMode("DGPS Mark");
        }

        // Restore UI state
        if (data.uiState) {
          if (data.uiState.currentIndex !== undefined) {
            setCurrentIndex(data.uiState.currentIndex);
            console.log(
              "[MissionReportScreen] 📂 Restored current waypoint index:",
              data.uiState.currentIndex,
            );
          }
          if (data.uiState.mode) {
            setMode(data.uiState.mode);
            console.log(
              "[MissionReportScreen] 📂 Restored mode:",
              data.uiState.mode,
            );
          }
          const migratedPanels = migrateLegacyPanelVisibility(data.uiState);
          if (Object.keys(migratedPanels).length > 0) {
            setPanelVisibility((prev) => ({ ...prev, ...migratedPanels }));
          }
          // Always start collapsed. Restoring expanded mounts LegendList
          // before waypoint coords are normalized and crashes on launch.
        }
      } catch (error) {
        console.error(
          "[MissionReportScreen] Failed to load persisted state:",
          error,
        );
      }
    };

    loadPersistedState();
  }, []);

  // Auto-save statusMap changes
  useEffect(() => {
    if (Object.keys(statusMap).length > 0) {
      PersistentStorage.saveStatusMap(statusMap).catch((error) => {
        console.error(
          "[MissionReportScreen] Failed to persist statusMap:",
          error,
        );
      });
    }
  }, [statusMap]);

  // Auto-save mission times and active state
  useEffect(() => {
    if (missionStartTime) {
      PersistentStorage.saveMissionStartTime(missionStartTime).catch(
        (error) => {
          console.error(
            "[MissionReportScreen] Failed to persist start time:",
            error,
          );
        },
      );
    }
  }, [missionStartTime]);

  useEffect(() => {
    if (missionEndTime) {
      PersistentStorage.saveMissionEndTime(missionEndTime).catch((error) => {
        console.error(
          "[MissionReportScreen] Failed to persist end time:",
          error,
        );
      });
    }
  }, [missionEndTime]);

  useEffect(() => {
    PersistentStorage.saveMissionActive(isMissionActive).catch((error) => {
      console.error(
        "[MissionReportScreen] Failed to persist active state:",
        error,
      );
    });
  }, [isMissionActive]);

  useEffect(() => {
    if (missionMode) {
      PersistentStorage.saveMissionMode(missionMode).catch((error) => {
        console.error(
          "[MissionReportScreen] Failed to persist mission mode:",
          error,
        );
      });
    }
  }, [missionMode]);

  // Auto-save UI state changes
  useEffect(() => {
    PersistentStorage.saveMissionReportUIState({
      currentIndex,
      mode,
      isRobotStatusVisible,
      isMissionProgressVisible,
      isDistanceToTargetVisible,
      isAccuracyMonitorVisible,
      isMissionControlsVisible,
      isBottomTableVisible,
      isBottomTableExpanded,
    });
  }, [
    currentIndex,
    mode,
    isRobotStatusVisible,
    isMissionProgressVisible,
    isAccuracyMonitorVisible,
    isDistanceToTargetVisible,
    isMissionControlsVisible,
    isBottomTableVisible,
    isBottomTableExpanded,
  ]);
  useEffect(() => {
    if (!isVisible) {
      return undefined;
    }

    // Subscribe to mission events from backend
    const unsubscribe = onMissionEvent((event: any) => {
      if (!mountedRef.current) return;
      // Only meaningful report changes may request a canonical read; a
      // steady 50 Hz mission_status stream must not (and cannot) postpone it.
      const classification = classifyMissionEventForReport(
        event,
        missionReportSignatureRef.current,
      );
      missionReportSignatureRef.current = classification.signature;
      if (classification.refresh) refreshLiveMarkingPoints();

      const rawEventType = event.type || event.event || event.event_type;
      const eventType = (() => {
        if (rawEventType) {
          const raw = String(rawEventType);
          if (raw.startsWith("point_")) return "point_mission_event";
          return raw;
        }
        if (
          event.state !== undefined &&
          (event.dist_to_goal !== undefined || event.rpp_state !== undefined)
        ) {
          return "mission_status";
        }
        if (
          event.mission_state !== undefined ||
          event.mission_mode !== undefined ||
          event.current_waypoint !== undefined ||
          event.total_waypoints !== undefined
        ) {
          return "mission_status";
        }
        return "unknown";
      })();

      // NRP_ROS LEGACY DISABLED — ignore old mission_event types (use point_mission_event on PX4)
      const NRP_ROS_LEGACY_EVENTS = new Set([
        "bulk_skip",
        "waypoint_reached",
        "waypoint_marked",
        "waypoint_completed",
        "waiting_for_manual",
        "mission_event",
        "failsafe_resumed",
        "failsafe_restarted",
        "obstacle_detection_changed",
        "led_controller_changed",
      ]);
      if (NRP_ROS_LEGACY_EVENTS.has(eventType)) {
        return;
      }
      // NRP_ROS LEGACY DISABLED — nested NRP mission_status shape (mission_state + current_waypoint)
      if (
        event.mission_state !== undefined &&
        event.current_waypoint !== undefined &&
        event.state === undefined
      ) {
        return;
      }

      // WORKAROUND: Check if this is a spray suppressed message from SERVER_ACTIVITY
      // Backend logs "Mission: Spray suppressed: accuracy XXmm > YYmm" but doesn't send proper events
      // Match only the full "Mission: Spray suppressed" pattern to avoid duplicates
      if (
        event.message &&
        typeof event.message === "string" &&
        event.message.includes("Mission: Spray suppressed")
      ) {
        console.log(
          "[MissionReportScreen] 🚫 Detected spray suppression message:",
          event.message,
        );
        // Mark the most recent waypoint as skipped — read prev inside functional updater
        setStatusMap((prev) => {
          const currentWpIndex = Object.keys(prev).length;
          const allWps = waypointsRef.current;
          if (currentWpIndex > 0 && currentWpIndex <= allWps.length) {
            const wpId = allWps[currentWpIndex - 1]?.sn;
            if (wpId && prev[wpId]) {
              console.log(
                `[MissionReportScreen] ⏭️ Marking waypoint ${wpId} as SKIPPED (spray suppressed)`,
              );
              return {
                ...prev,
                [wpId]: {
                  ...prev[wpId],
                  status: "skipped",
                  remark: "Skipped - GPS accuracy too low",
                },
              };
            }
          }
          return prev;
        });
      }

      // Handle bulk skip events (backend emits event_type: 'bulk_skip')
      if (
        eventType === "bulk_skip" ||
        event.event_type === "bulk_skip" ||
        (event.data && event.data.event_type === "bulk_skip")
      ) {
        try {
          const skipFrom =
            event.skip_from ??
            event.data?.skip_from ??
            event.skipped_from ??
            event.data?.skipped_from;
          const skipTo =
            event.skip_to ??
            event.data?.skip_to ??
            event.skipped_to ??
            event.data?.skipped_to;
          const nextWp =
            event.next_waypoint ??
            event.data?.next_waypoint ??
            event.next_waypoint_id ??
            null;
          console.log("[MissionReportScreen] ⏭️ Bulk skip event received", {
            skipFrom,
            skipTo,
            nextWp,
          });

          if (
            typeof skipFrom === "number" &&
            typeof skipTo === "number" &&
            skipTo >= skipFrom
          ) {
            const timestamp = event.timestamp
              ? typeof event.timestamp === "string"
                ? event.timestamp
                : new Date(event.timestamp).toISOString()
              : new Date().toISOString();

            // Capture previous statuses for audit/undo and mark as skipped —
            // both read prev inside the functional updater to avoid stale refs
            setStatusMap((prev) => {
              const copy = { ...prev };
              const prevStatuses: Record<number, WpStatus | null> = {};
              waypointsRef.current.forEach((wp) => {
                if (wp.sn >= skipFrom && wp.sn <= skipTo) {
                  prevStatuses[wp.sn] = prev[wp.sn] ?? null;
                  copy[wp.sn] = {
                    ...(copy[wp.sn] || {}),
                    status: "skipped",
                    timestamp,
                    remark: "Skipped (bulk)",
                  } as WpStatus;
                }
              });

              // Fire-and-forget: persist audit then update UI history
              const recordId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              const auditRecord: any = {
                id: recordId,
                skipFrom,
                skipTo,
                timestamp,
                previousStatuses: prevStatuses,
              };
              PersistentStorage.saveSkipAuditRecord(auditRecord).catch((err) =>
                console.warn(
                  "[MissionReportScreen] Failed to save skip audit",
                  err,
                ),
              );
              setSkipHistory((h) => [auditRecord as any].concat(h));
              setUndoPrompt({ visible: true, id: recordId });
              if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
              undoTimerRef.current = setTimeout(() => {
                setUndoPrompt({ visible: false, id: null });
                undoTimerRef.current = null;
              }, 8000);

              return copy;
            });

            // Advance current index to next waypoint if provided
            if (typeof nextWp === "number" && nextWp > 0) {
              const newIndex = Math.max(0, nextWp - 1);
              setCurrentIndex(newIndex);
            }
          }
        } catch (err) {
          console.error(
            "[MissionReportScreen] Error processing bulk_skip event",
            err,
          );
        }
      }

      // DEBUG: Log ALL mission events to diagnose the issue
      // console.log(`[MissionReportScreen] 🔔 ALL Mission Events [${eventType}]`, {
      //   eventType,
      //   event,
      //   waypoint_id: event.waypoint_id,
      //   id: event.id,
      //   current_waypoint: event.current_waypoint,
      //   waypoints_count: waypoints.length
      // });

      // DEBUG: Log distance-to-next-waypoint from backend
      const distToNext =
        event.wp_dist_cm ??
        event.distance_to_next ??
        event.dist_to_wp ??
        event.data?.wp_dist_cm ??
        event.data?.distance_to_next ??
        telemetryRef.current.wp_dist_cm;
      if (distToNext != null) {
        console.log(
          `[MissionReportScreen] 📏 Distance to next WP: ${distToNext} cm (${(distToNext / 100).toFixed(2)} m) [eventType: ${eventType}]`,
        );
      }

      // Skip high-frequency events (mission_status, unknown telemetry updates)
      if (eventType === "mission_status" || eventType === "unknown") {
        // Process state updates silently without logging
        if (
          eventType === "unknown" &&
          event.data?.message === "Telemetry update"
        ) {
          return; // Ignore telemetry update events
        }
      }

      // Handle waypoint reached events (multiple possible event formats)
      if (
        eventType === "waypoint_reached" ||
        event.event_type === "waypoint_reached" ||
        (event.data && event.data.event_type === "waypoint_reached")
      ) {
        const wpId =
          event.waypoint_id ??
          event.waypointId ??
          event.id ??
          event.data?.waypoint_id ??
          event.data?.waypointId ??
          event.data?.id ??
          0;
        const timestamp = event.timestamp
          ? typeof event.timestamp === "string"
            ? event.timestamp
            : new Date(event.timestamp).toISOString()
          : new Date().toISOString();

        console.log(
          `[MissionReportScreen] 🎯 Processing waypoint_reached: wpId=${wpId}, mode=${modeRef.current}, waypoints.length=${waypointsRef.current.length}`,
        );

        // Find the corresponding waypoint by waypoint_id to get the correct sn
        const targetWaypoint = waypointsRef.current.find(
          (wp) => wp.sn === wpId,
        );
        const statusKey = targetWaypoint ? targetWaypoint.sn : wpId;
        const currentMode = modeRef.current;

        // CONTINUOUS / DASH modes — simplified status, no accuracy tracking
        if (currentMode === "CONTINUOUS" || currentMode === "DASH") {
          let status: WpStatus["status"];
          let remark: string;

          if (currentMode === "CONTINUOUS") {
            if (event.is_first) {
              status = "spray_on";
              remark = "Spray ON";
            } else if (event.is_last) {
              status = "spray_off";
              remark = "Spray OFF";
            } else {
              status = "passed";
              remark = "Passed";
            }
          } else {
            // DASH mode
            if (event.is_first) {
              status = "spray_on";
              remark = "Dash Started";
            } else {
              status = "passed";
              remark = "Passed";
            }
          }

          // Move downgrade guard and nextEntry construction inside functional updater
          // so they read fresh state from `prev` instead of stale `statusMapRef.current`
          setStatusMap((prev) => {
            const prevEntry = prev[statusKey];
            if (isStatusDowngrade(prevEntry?.status, status)) {
              console.log(
                `[MissionReportScreen] 🛡️ Blocked status downgrade for WP ${statusKey}: ${prevEntry?.status} → ${status}`,
              );
              return prev;
            }
            const nextEntry = {
              ...(prevEntry || {}),
              reached: true,
              status,
              timestamp,
              remark,
              pile: event.pile ?? prevEntry?.pile,
              rowNo: event.rowNo ?? event.row_no ?? prevEntry?.rowNo,
            } as WpStatus;

            if (!prevEntry || prevEntry.status !== nextEntry.status) {
              console.log(
                `[MissionReportScreen] ✅ [${currentMode}] Waypoint ${statusKey} → ${status} at ${timestamp}`,
              );
              return { ...prev, [statusKey]: nextEntry };
            }
            return prev;
          });
        } else {
          // AUTO / MANUAL modes — existing logic with accuracy tracking
          const roverLat =
            event.position?.lat ?? telemetryRef.current.global?.lat;
          const roverLon =
            event.position?.lng ?? telemetryRef.current.global?.lon;
          const hrms = telemetryRef.current.hrms;
          const vrms = telemetryRef.current.vrms;

          const rawBackendAccuracyMm =
            event.radial_error_mm ??
            event.accuracy_error_mm ??
            event.data?.radial_error_mm ??
            event.data?.accuracy_error_mm ??
            telemetryRef.current.radial_error_mm ??
            telemetryRef.current.accuracy?.radial_error_mm ??
            null;

          const parsedBackendAccuracyMm =
            rawBackendAccuracyMm !== null ? Number(rawBackendAccuracyMm) : null;

          const backendAccuracyMm =
            parsedBackendAccuracyMm !== null &&
            Number.isFinite(parsedBackendAccuracyMm) &&
            parsedBackendAccuracyMm >= 0
              ? parsedBackendAccuracyMm
              : null;

          let accuracyData: {
            accuracy_level?: string;
            position_error_cm?: number;
          } = {};
          if (backendAccuracyMm != null) {
            const accuracy = getAccuracyLevel(backendAccuracyMm);
            accuracyData = {
              accuracy_level: accuracy.level,
              position_error_cm: backendAccuracyMm / 10,
            };
            console.log(
              `[MissionReportScreen] 📊 Backend accuracy for WP ${statusKey}: ${backendAccuracyMm.toFixed(1)}mm (${accuracy.label})`,
            );
          } else {
            console.log(
              `[MissionReportScreen] ⚠️ No backend accuracy for WP ${statusKey}, sources checked:`,
              {
                event_accuracy_error_mm: event.accuracy_error_mm,
              },
            );
          }

          // Move downgrade guard and nextEntry inside functional updater
          // to read fresh state from `prev` instead of stale `statusMapRef.current`
          setStatusMap((prev) => {
            const prevEntry = prev[statusKey];

            // GUARD: Don't downgrade a completed/skipped waypoint back to reached
            if (isStatusDowngrade(prevEntry?.status, "reached")) {
              console.log(
                `[MissionReportScreen] 🛡️ Blocked status downgrade for WP ${statusKey}: ${prevEntry?.status} → reached`,
              );
              return prev;
            }

            const nextEntry = {
              ...(prevEntry || {}),
              reached: true,
              status: "reached",
              timestamp,
              pile: event.pile ?? prevEntry?.pile,
              rowNo: event.rowNo ?? event.row_no ?? prevEntry?.rowNo,
              hrms: hrms ?? prevEntry?.hrms,
              vrms: vrms ?? prevEntry?.vrms,
              lat_achieved: roverLat ?? prevEntry?.lat_achieved,
              lon_achieved: roverLon ?? prevEntry?.lon_achieved,
              ...accuracyData,
            } as WpStatus;

            const changed =
              !prevEntry ||
              prevEntry.status !== nextEntry.status ||
              prevEntry.reached !== nextEntry.reached ||
              prevEntry.pile !== nextEntry.pile ||
              prevEntry.rowNo !== nextEntry.rowNo ||
              prevEntry.accuracy_level !== nextEntry.accuracy_level;

            if (changed) {
              console.log(
                `[MissionReportScreen] ✅ Waypoint ${statusKey} reached at ${timestamp}`,
              );
              return { ...prev, [statusKey]: nextEntry };
            }
            return prev;
          });
        }
      }

      // Handle waypoint marked/completed events (multiple possible event formats)
      if (
        eventType === "waypoint_marked" ||
        eventType === "waypoint_completed" ||
        event.event_type === "waypoint_marked" ||
        event.event_type === "waypoint_completed" ||
        (event.data &&
          (event.data.event_type === "waypoint_marked" ||
            event.data.event_type === "waypoint_completed"))
      ) {
        const wpId =
          event.waypoint_id ??
          event.waypointId ??
          event.id ??
          event.data?.waypoint_id ??
          event.data?.waypointId ??
          event.data?.id ??
          0;
        const timestamp = event.timestamp
          ? typeof event.timestamp === "string"
            ? event.timestamp
            : new Date(event.timestamp).toISOString()
          : new Date().toISOString();
        const markingStatus =
          event.marking_status ??
          event.markingStatus ??
          event.status ??
          event.data?.marking_status ??
          "completed";

        // DEBUG: Log the full event to see what backend is sending
        console.log(
          "[MissionReportScreen] 📦 Full waypoint event:",
          JSON.stringify(event, null, 2),
        );
        console.log(
          `[MissionReportScreen] ✅ Processing waypoint_marked/completed: wpId=${wpId}, status=${markingStatus}`,
        );
        console.log("[MissionReportScreen] 🔍 Event fields:", {
          marking_status: event.marking_status,
          markingStatus: event.markingStatus,
          status: event.status,
          servo_suppressed: event.servo_suppressed,
          gps_failsafe: event.gps_failsafe,
        });

        // Find the corresponding waypoint by waypoint_id to get the correct sn
        const targetWaypoint = waypointsRef.current.find(
          (wp) => wp.sn === wpId,
        );
        const statusKey = targetWaypoint ? targetWaypoint.sn : wpId;

        // Get hrms from telemetry for accuracy fallback
        const hrms = telemetryRef.current.hrms;

        const rawAccuracyMm =
          event.accuracy_error_mm ?? event.data?.accuracy_error_mm ?? null;

        const parsedAccuracyMm =
          rawAccuracyMm !== null ? Number(rawAccuracyMm) : null;

        const backendAccuracyMm =
          parsedAccuracyMm !== null &&
          Number.isFinite(parsedAccuracyMm) &&
          parsedAccuracyMm >= 0
            ? parsedAccuracyMm
            : null;

        const isSkipped = String(markingStatus).toLowerCase() === "skipped";

        setStatusMap((prev) => {
          const prevEntry = prev[statusKey];

          /**
           * Once a completed point has a valid accuracy,
           * later events must not replace it.
           */
          const hasFrozenAccuracy =
            prevEntry?.status === "completed" &&
            typeof prevEntry.position_error_cm === "number" &&
            Number.isFinite(prevEntry.position_error_cm);

          const accuracyData:
            | {
                accuracy_level: string;
                position_error_cm: number;
              }
            | Record<string, never> =
            !isSkipped && !hasFrozenAccuracy && backendAccuracyMm !== null
              ? {
                  accuracy_level: getAccuracyLevel(backendAccuracyMm).level,

                  /**
                   * Mission Report currently stores this
                   * field in centimetres.
                   */
                  position_error_cm: backendAccuracyMm / 10,
                }
              : {};

          const nextEntry: WpStatus = {
            ...(prevEntry ?? {}),

            marked: !isSkipped,

            status: isSkipped ? "skipped" : "completed",

            timestamp,

            pile: event.pile ?? event.data?.pile ?? prevEntry?.pile,

            rowNo:
              event.rowNo ??
              event.row_no ??
              event.data?.rowNo ??
              event.data?.row_no ??
              prevEntry?.rowNo,

            remark:
              event.remark ??
              event.data?.remark ??
              (isSkipped ? "Skipped" : "Marked"),

            ...accuracyData,

            survey: pickBestRawGnssSurvey(
              prevEntry?.survey,
              extractRawGnssSurvey(event),
              extractRawGnssSurvey(event.data),
              extractRawGnssSurvey(event.accuracy),
            ),
          };

          const changed =
            !prevEntry ||
            prevEntry.status !== nextEntry.status ||
            prevEntry.marked !== nextEntry.marked ||
            prevEntry.timestamp !== nextEntry.timestamp ||
            prevEntry.pile !== nextEntry.pile ||
            prevEntry.rowNo !== nextEntry.rowNo ||
            prevEntry.remark !== nextEntry.remark ||
            prevEntry.accuracy_level !== nextEntry.accuracy_level ||
            prevEntry.position_error_cm !== nextEntry.position_error_cm ||
            prevEntry.survey !== nextEntry.survey;

          if (!changed) {
            return prev;
          }

          return {
            ...prev,
            [statusKey]: nextEntry,
          };
        });

        const statusEmoji = markingStatus === "skipped" ? "⏭️" : "✅";
        console.log(
          `[MissionReportScreen] ${statusEmoji} Waypoint ${statusKey} ${markingStatus} at ${timestamp}`,
        );
      }

      // waypoint_hold_complete — hold period done, servo sequence about to run (AUTO + MANUAL)
      // No statusMap update needed here — waypoint_marked/waypoint_skipped follows immediately
      if (
        eventType === "waypoint_hold_complete" ||
        event.event_type === "waypoint_hold_complete"
      ) {
        const wpId =
          event.waypoint_id ?? event.waypointId ?? event.current_waypoint ?? 0;
        console.log(
          `[MissionReportScreen] ⏱️ Hold complete for WP ${wpId}, should_mark=${event.should_mark}`,
        );
        // Intentionally no statusMap change — waypoint_marked or waypoint_skipped fires next
      }

      // DASH MODE: dash_completed — overwrite last waypoint with final summary
      if (
        eventType === "dash_completed" ||
        event.event_type === "dash_completed"
      ) {
        const allWps = waypointsRef.current;
        if (allWps.length > 0) {
          const lastWpSn = allWps[allWps.length - 1].sn;
          const timestamp = event.timestamp
            ? typeof event.timestamp === "string"
              ? event.timestamp
              : new Date(event.timestamp).toISOString()
            : new Date().toISOString();
          const distance =
            event.cumulative_distance ?? event.total_distance ?? "";
          const distanceDisplay = distance
            ? ` | ${Number(distance).toFixed(1)}m`
            : "";

          setStatusMap((prev) => ({
            ...prev,
            [lastWpSn]: {
              ...(prev[lastWpSn] || {}),
              status: "mission_end",
              remark: `Done${distanceDisplay}`,
              timestamp,
            } as WpStatus,
          }));
          console.log(
            `[MissionReportScreen] 🏁 [DASH] dash_completed: last WP ${lastWpSn} → mission_end${distanceDisplay}`,
          );
        }
      }

      // MANUAL MODE ONLY: waypoint_completed_manual — WP is done, mission paused waiting for user NEXT
      if (
        eventType === "waypoint_completed_manual" ||
        event.event_type === "waypoint_completed_manual"
      ) {
        const wpId =
          event.waypoint_id ?? event.waypointId ?? event.current_waypoint ?? 0;
        const timestamp = event.timestamp
          ? typeof event.timestamp === "string"
            ? event.timestamp
            : new Date(event.timestamp).toISOString()
          : new Date().toISOString();

        console.log(
          `[MissionReportScreen] 🖐️ MANUAL waypoint_completed_manual: wpId=${wpId}, waiting_for_manual=${event.waiting_for_manual}`,
        );

        if (wpId > 0) {
          const targetWaypoint = waypointsRef.current.find(
            (wp) => wp.sn === wpId,
          );
          const statusKey = targetWaypoint ? targetWaypoint.sn : wpId;

          // Move downgrade guard inside functional updater for fresh state
          setStatusMap((prev) => {
            const prevEntry = prev[statusKey];
            if (isStatusDowngrade(prevEntry?.status, "completed")) {
              console.log(
                `[MissionReportScreen] 🛡️ Blocked status downgrade for WP ${statusKey}: ${prevEntry?.status} → completed`,
              );
              return prev;
            }
            return {
              ...prev,
              [statusKey]: {
                ...(prevEntry || {}),
                marked: true,
                status: "completed",
                timestamp,
              } as WpStatus,
            };
          });
        }

        // Signal UI that NEXT button needs to be pressed to continue
        if (event.waiting_for_manual) {
          setWaitingForManual(true);
          console.log(
            "[MissionReportScreen] 🖐️ MANUAL mode: waiting for user to press NEXT",
          );
        }
      }

      // PX4 point_mission_event — consumed by usePointMissionEvents; skip duplicate handling here
      if (
        eventType === "point_mission_event" ||
        (event.event_type && String(event.event_type).startsWith("point_"))
      ) {
        return;
      }

      // Handle mission completed event - including mission_state: completed
      if (
        eventType === "mission_completed" ||
        event.event_type === "mission_completed" ||
        event.mission_state === "completed" ||
        event.state === "completed" ||
        (event.data && event.data.event_type === "mission_completed") ||
        (event.data && event.data.mission_state === "completed")
      ) {
        console.log(
          "[MissionReportScreen] 🏁 Mission completed event received from backend",
        );
        console.log("[MissionReportScreen] Completion event details:", {
          eventType,
          mission_state: event.mission_state,
          completion_time: event.completion_time,
          mission_duration: event.mission_duration,
        });

        // Set mission start time if not set (fallback for missed start event)
        if (!missionStartTimeRef.current) {
          console.log(
            "[MissionReportScreen] ⚠️ Mission start time was not set! Using fallback.",
          );
          // Calculate start time from completion_time and mission_duration if available
          if (event.completion_time && event.mission_duration) {
            const completionDate = new Date(event.completion_time);
            const startDate = new Date(
              completionDate.getTime() - event.mission_duration * 1000,
            );
            setMissionStartTime(startDate);
            console.log(
              "[MissionReportScreen] ✅ Calculated mission start time from duration:",
              startDate,
            );
          } else {
            // Fallback: use current time minus 1 minute as approximate start
            setMissionStartTime(new Date(Date.now() - 60000));
            console.log(
              "[MissionReportScreen] ⚠️ Using fallback start time (1 minute ago)",
            );
          }
        }

        // Set mission end time if not already set
        if (!missionEndTimeRef.current) {
          const completionTime = event.completion_time
            ? new Date(event.completion_time)
            : new Date();
          setMissionEndTime(completionTime);
          console.log(
            "[MissionReportScreen] ✅ Mission end time set:",
            completionTime,
          );
        }

        // Mark mission as inactive
        setIsMissionActive(false);
        console.log(
          "[MissionReportScreen] ✅ isMissionActive set to false - button will reset to START",
        );

        // Preserve mission data for export
        preserveCurrentMission.current();

        // Show completion notification
        showNotification(
          "success",
          "Mission Completed",
          "All marking points have been processed!",
        );

        // Show completion dialog immediately after confirmed backend completion.
        if (mountedRef.current) {
          // console.log('[MissionReportScreen] 📋 Opening mission completion dialog');
          setShowCompletionDialog(true);
        }
        return;
      }

      // Handle mission status updates (high frequency - no notifications)
      if (eventType === "mission_status") {
        const px4State = event.state ?? event.mission_state;
        if (px4State === "running" || px4State === "paused") {
          setIsMissionActive(true);
        } else if (
          px4State === "completed" ||
          px4State === "stopped" ||
          px4State === "idle"
        ) {
          setIsMissionActive(false);
        }

        if (
          POINT_MISSION_ENABLED &&
          typeof event.point_index === "number" &&
          event.point_index >= 0
        ) {
          setCurrentIndex(event.point_index);
        }

        // Check if mission was paused (by GPS failsafe or manual action)
        if (px4State === "paused" || px4State === "PAUSED") {
          console.log(
            "[MissionReportScreen] 🔴 MISSION STATE CHANGED TO PAUSED",
          );
          console.log(
            "[MissionReportScreen] 📋 Pause reason:",
            event.pause_reason || event.reason || "Unknown",
          );
          console.log(
            "[MissionReportScreen] 📋 GPS Failsafe mode:",
            telemetryRef.current.gps_failsafe?.mode,
          );
          console.log(
            "[MissionReportScreen] 📋 Full pause event:",
            JSON.stringify(event),
          );
        }

        let statusUpdated = false;

        if (event.current_waypoint != null) {
          const newIndex = event.current_waypoint - 1; // Convert from 1-based to 0-based
          const currentWaypointNumber = event.current_waypoint;
          setCurrentIndex((prev) => {
            if (prev === newIndex) return prev;

            // Guard: only advance forward when the waypoint being left is terminal.
            // Backend can send current_waypoint:N before waypoint_marked for N-1 arrives,
            // which would jump the indicator ahead. Auto-derive corrects it once the
            // waypoint_marked event arrives and statusMap updates.
            if (newIndex > (prev ?? -1)) {
              const leavingWp =
                prev !== null ? waypointsRef.current[prev] : null;
              if (leavingWp) {
                const leavingStatus = statusMapRef.current[leavingWp.sn];
                if (
                  !leavingStatus ||
                  (leavingStatus.status !== "completed" &&
                    leavingStatus.status !== "skipped")
                ) {
                  console.log(
                    `[MissionReportScreen] ⏸ Holding indicator at index ${prev} — WP${leavingWp.sn} not yet terminal (${leavingStatus?.status ?? "no status"})`,
                  );
                  return prev;
                }
              }
            }

            console.log(
              `[MissionReportScreen] ✦ Current waypoint changed: index ${prev} -> ${newIndex} (waypoint #${currentWaypointNumber})`,
            );
            console.log(
              `[MissionReportScreen] ✦ Looking for waypoint with sn=${currentWaypointNumber} in ${waypointsRef.current.length} waypoints`,
            );

            const targetWaypoint = waypointsRef.current.find(
              (wp) => wp.sn === currentWaypointNumber,
            );
            if (targetWaypoint) {
              console.log(`[MissionReportScreen] ✦ Found target waypoint:`, {
                sn: targetWaypoint.sn,
                block: targetWaypoint.block,
                row: targetWaypoint.row,
                pile: targetWaypoint.pile,
              });
            } else {
              console.log(
                `[MissionReportScreen] ⚠️ Target waypoint sn=${currentWaypointNumber} not found in waypoints array`,
              );
            }

            statusUpdated = true;
            return newIndex;
          });
        }

        if (event.mission_mode) {
          const backendMode = String(event.mission_mode).toLowerCase();
          const nextMode = mapBackendMissionModeToUiMode(event.mission_mode);

          if (nextMode && nextMode !== modeRef.current) {
            console.log(
              `[MissionReportScreen] Syncing Mission Control mode from backend: ${modeRef.current} -> ${nextMode}`,
            );
            modeRef.current = nextMode;
            setMode(nextMode);
            statusUpdated = true;
          }
        }

        // Check if mission_status contains waypoint completion info
        if (event.waypoint_status && event.current_waypoint) {
          const wpId = event.current_waypoint;
          const targetWaypoint = waypointsRef.current.find(
            (wp) => wp.sn === wpId,
          );
          const statusKey = targetWaypoint ? targetWaypoint.sn : wpId;

          const incomingStatus =
            event.waypoint_status === "completed"
              ? "completed"
              : event.waypoint_status === "reached"
                ? "reached"
                : event.waypoint_status;

          console.log(
            `[MissionReportScreen] 📊 Mission status contains waypoint info: wpId=${wpId}, status=${incomingStatus}`,
          );

          // Move downgrade guard and nextEntry inside functional updater
          setStatusMap((prev) => {
            const prevEntry = prev[statusKey];

            if (isStatusDowngrade(prevEntry?.status, incomingStatus)) {
              console.log(
                `[MissionReportScreen] 🛡️ Blocked status downgrade for WP ${statusKey}: ${prevEntry?.status} → ${incomingStatus}`,
              );
              return prev;
            }

            const nextEntry = {
              ...(prevEntry || {}),
              status: incomingStatus,
              timestamp: event.timestamp
                ? typeof event.timestamp === "string"
                  ? event.timestamp
                  : new Date(event.timestamp).toISOString()
                : new Date().toISOString(),
              reached:
                event.waypoint_status === "reached" ||
                event.waypoint_status === "completed",
              marked: event.waypoint_status === "completed",
              pile: event.pile ?? prevEntry?.pile,
              rowNo: event.rowNo ?? event.row_no ?? prevEntry?.rowNo,
              remark: event.remark ?? prevEntry?.remark,
              accuracy_level: event.accuracy_level ?? prevEntry?.accuracy_level,
              position_error_cm:
                event.position_error_cm ?? prevEntry?.position_error_cm,
            } as WpStatus;

            const changed =
              !prevEntry ||
              prevEntry.status !== nextEntry.status ||
              prevEntry.reached !== nextEntry.reached ||
              prevEntry.marked !== nextEntry.marked ||
              prevEntry.pile !== nextEntry.pile ||
              prevEntry.rowNo !== nextEntry.rowNo ||
              prevEntry.remark !== nextEntry.remark ||
              prevEntry.accuracy_level !== nextEntry.accuracy_level ||
              prevEntry.position_error_cm !== nextEntry.position_error_cm;

            if (changed) {
              return { ...prev, [statusKey]: nextEntry };
            }
            return prev;
          });
          statusUpdated = true;
        }

        // Only log mission_status when something actually changed to reduce noise
        if (statusUpdated) {
          console.log("[MissionReportScreen] Mission status updated:", {
            current_waypoint: event.current_waypoint,
            mission_mode: event.mission_mode,
            waypoint_status: event.waypoint_status,
            waypoints_count: waypointsRef.current.length,
          });
        }
        return;
      }

      // Handle mission errors
      if (eventType === "mission_error") {
        const errorMsg =
          event.message || event.error || "Unknown mission error";
        console.error(
          `[MissionReportScreen] ❌ Mission error: ${errorMsg}`,
          event,
        );
        showNotification("error", "Mission Error", errorMsg);
      }

      // Handle mission state changes (show notifications only for important events)
      if (eventType === "mission_started") {
        console.log("[MissionReportScreen] 🚀 Mission started");
        setMissionStartTime(new Date());
        setMissionEndTime(null); // Reset end time for new mission
        setIsMissionActive(true); // Mark mission as active
        // TRAIL DISABLED: Clear trail on new mission start commented out
        // trailPointsRef.current = [];
        // setTrailPoints([]); // Clear trail on new mission start
      }

      if (
        eventType === "mission_paused" ||
        event.mission_state === "paused" ||
        (event.data && event.data.mission_state === "paused")
      ) {
        console.log("[MissionReportScreen] ⏸️ Mission paused");
        console.log("[MissionReportScreen] 📋 Pause event details:", {
          eventType,
          mission_state: event.mission_state,
          gps_failsafe_triggered: event.gps_failsafe_triggered,
          reason: event.reason,
          current_waypoint: event.current_waypoint,
          wp_dist_cm: event.wp_dist_cm,
          full_event: JSON.stringify(event),
        });
        // Show notification to user
        showNotification(
          "info",
          "Mission Paused",
          event.reason || "Mission paused by system",
        );
      }

      if (eventType === "mission_resumed") {
        console.log("[MissionReportScreen] ▶️ Mission resumed");
      }

      // Note: mission_completed is handled earlier in the event handler (line ~848)

      // Catch-all handler for any other mission events that might contain waypoint updates
      // Exclude mission_progress - it's a high-frequency status ping, not a waypoint state change
      if (
        eventType !== "mission_status" &&
        eventType !== "unknown" &&
        eventType !== "mission_progress" &&
        eventType !== "waypoint_hold_complete" &&
        eventType !== "waypoint_completed_manual" &&
        (event.waypoint_id || event.id || event.current_waypoint)
      ) {
        console.log(
          `[MissionReportScreen] 🔍 Unhandled mission event with waypoint info:`,
          {
            eventType,
            waypoint_id: event.waypoint_id,
            id: event.id,
            current_waypoint: event.current_waypoint,
            status: event.status,
            event_type: event.event_type,
          },
        );

        // Try to extract waypoint status updates from any unhandled events
        const wpId =
          event.waypoint_id ??
          event.waypointId ??
          event.id ??
          event.current_waypoint ??
          0;
        if (wpId > 0 && waypointsRef.current.length > 0) {
          const targetWaypoint = waypointsRef.current.find(
            (wp) => wp.sn === wpId,
          );
          const statusKey = targetWaypoint ? targetWaypoint.sn : wpId;

          // Check for any status indicators in the event
          if (
            event.status === "completed" ||
            event.status === "reached" ||
            event.status === "marked" ||
            event.status === "skipped"
          ) {
            // Move all reads inside functional updater to avoid stale statusMapRef
            setStatusMap((prev) => {
              const prevEntry = prev[statusKey];

              // GUARD: Don't downgrade a completed/skipped waypoint
              if (isStatusDowngrade(prevEntry?.status, event.status)) {
                console.log(
                  `[MissionReportScreen] 🛡️ Blocked status downgrade for WP ${statusKey}: ${prevEntry?.status} → ${event.status}`,
                );
                return prev;
              }

              console.log(
                `[MissionReportScreen] 📝 Extracting status from unhandled event: wpId=${wpId}, status=${event.status}`,
              );

              const nextEntry = {
                ...(prevEntry || {}),
                status: event.status,
                timestamp: event.timestamp
                  ? typeof event.timestamp === "string"
                    ? event.timestamp
                    : new Date(event.timestamp).toISOString()
                  : new Date().toISOString(),
                reached:
                  event.status === "reached" || event.status === "completed",
                marked:
                  event.status === "completed" || event.status === "marked",
                remark: event.remark ?? prevEntry?.remark ?? "—",
              } as WpStatus;

              const changed =
                !prevEntry ||
                prevEntry.status !== nextEntry.status ||
                prevEntry.reached !== nextEntry.reached ||
                prevEntry.marked !== nextEntry.marked ||
                prevEntry.remark !== nextEntry.remark;

              if (changed) {
                return { ...prev, [statusKey]: nextEntry };
              }
              return prev;
            });
          }
        }
      }
    });

    return () => {
      // Cleanup subscription
      unsubscribe();
    };
  }, [isVisible, onMissionEvent, refreshLiveMarkingPoints]);

  // Mission mode is now managed by RoverContext and synced with Mission Ops Panel
  // Initial mode is set to 'DGPS Mark' by default in context

  // Mission waypoints come from context (uploaded via PathPlan tab)
  // No need to fetch from backend as PathPlan handles upload and syncs to context

  return (
    <SafeAreaView
      style={[styles.container, !embedMap && styles.containerOverMap]}
      edges={["left", "right", "bottom"]}
      pointerEvents={embedMap ? "auto" : "box-none"}
    >
      <StatusBar backgroundColor={colors.headerBlue} barStyle="light-content" />

      <View style={styles.absoluteMapContainer}>
        {embedMap && (
        <LiveMissionMap
          waypoints={displayData.waypoints}
          extensionPreviewPath={extensionMapPreview}
          extensionPoints={extensionMapPoints}
          activeWaypointIndex={effectiveCurrentIndex}
          statusMap={displayData.statusMap}
          edgeToEdge
          isVisible={isVisible}
        />
        )}
      </View>

      {/* OLD UI (disabled): the floating panels below belong to the previous
          Mission screen and never render while useMissionActivityExperience is
          true. Kept commented, not deleted, for reference. Their replacements:
            - Live vehicle status / progress / accuracy / distance -> header + progress deck
            - Mission control card                                  -> MissionDeckControls
            - Bottom table export + clear logs                      -> Export sheet (Mission tools)
            - Quick NTRIP card                                      -> Settings / RTK screen
            - Manual Drive entry (Quick NTRIP "manual" button)      -> not available yet
      {!useMissionActivityExperience && isVisible && isRobotStatusVisible && (
        <DraggableCard
          style={styles.floatingRobotStatusPanel}
          handleType="custom"
          onLayout={(e) => setRobotPanelHeight(e.nativeEvent.layout.height)}
        >
          <LiveVehicleStatusCard
            onClose={() => setPanelVisible("robotStatus", false)}
          />
        </DraggableCard>
      )}

      {!useMissionActivityExperience && isMissionProgressVisible && (
        <DraggableCard
          style={[
            styles.floatingMissionProgressPanel,
            {
              top:
                robotPanelHeight > 0
                  ? MISSION_PROGRESS_LAYOUT.HEADER_CLEARANCE +
                    robotPanelHeight +
                    MISSION_PROGRESS_LAYOUT.PANEL_GAP
                  : MISSION_PROGRESS_LAYOUT.MISSION_PROGRESS_STACK_FALLBACK,
            },
          ]}
          handleType="custom"
          onLayout={(e) =>
            setMissionProgressPanelHeight(e.nativeEvent.layout.height)
          }
        >
          <MissionProgressCard
            markedCount={missionProgressStats.markedPoints}
            currentPoint={missionProgressStats.currentPoint}
            totalPoints={missionProgressStats.totalPoints}
            onClose={() => setPanelVisible("missionProgress", false)}
          />
        </DraggableCard>
      )}

      {!useMissionActivityExperience && isMissionProgressVisible && (
        <View
          style={styles.floatingQuickNtripPanel}
        >
          <QuickNtripStartCard
            onPress={handleQuickStartNtrip}
            onManualPress={handleOpenManualDrive}
            manualLoading={isManualPreparing}
            loading={isQuickNtripStarting}
            rtkState={quickRtkState}
          />
        </View>
      )}

      {!useMissionActivityExperience && isVisible && isAccuracyMonitorVisible && (
        <DraggableCard
          style={styles.floatingAccuracyMonitorPanel}
          handleType="custom"
        >
          <LiveAccuracyMonitorPanel
            backendMissionState={backendMissionState}
            onClose={() => setPanelVisible("accuracyMonitor", false)}
          />
        </DraggableCard>
      )}

      {!useMissionActivityExperience && isVisible && isDistanceToTargetVisible && (
        <DraggableCard
          style={styles.floatingDistanceToTargetPanel}
          handleType="custom"
        >
          <LiveDistanceToTargetPanel backendMissionState={backendMissionState} />
        </DraggableCard>
      )}

      {!useMissionActivityExperience && isMissionControlsVisible && !isManualDriveVisible && (
        <DraggableCard
          style={styles.floatingMissionControlsPanel}
          handleType="custom"
        >
          <MissionControlCard
            waypoints={waypoints}
            mode={mode}
            onSetMode={handleSetExecutionMode}
            markingTool={backendMission?.marking_tool}
            laserHoldMode={backendMission?.laser_hold_mode}
            laserHoldPointId={backendMission?.laser_hold_point_id}
            remainingPointCount={backendMission?.remaining_points}
            onStart={handleStart}
            onPause={handlePause}
            resumeAvailable={backendResumeAvailable}
            pauseReason={backendPauseReason}
            rtkReason={backendRtkReason}
            stopStage={effectiveLifecycle.stopStage}
            onResume={handleResume}
            onStop={handleStop}
            onNext={handleNext}
            onSkip={handleSkip}
            missionMode={missionMode}
            isMissionActive={effectiveMissionActive}
            isMissionPaused={isBackendMissionPaused}
            waitingForManual={effectiveWaitingForManual}
            isMissionLoaded={hasUploadedMission}
            isMissionReady={canStartMission}
            isPlanUpdateRequired={authoringChanged}
            isPreparing={isPreparingMission}
            onClose={() => setPanelVisible("missionControls", false)}
          />
        </DraggableCard>
      )}

      {!useMissionActivityExperience && isBottomTableVisible && (
        <DraggableCard style={styles.floatingBottomTable} handleType="custom">
          <MissionTableHeader
            progressCurrent={missionProgressRef.current}
            progressTotal={missionProgressRef.total}
            isExpanded={isBottomTableExpanded}
            onToggleExpand={() => setIsBottomTableExpanded((prev) => !prev)}
            onClose={() => setPanelVisible("bottom", false)}
            toolbarActions={
              <MissionTableToolbarActions
                onClear={() => setShowClearLogsDialog(true)}
                exportProps={{
                  waypoints: displayData.waypoints,
                  statusMap: displayData.statusMap,
                  missionMode: displayData.missionMode,
                  onExport: handleExport,
                  onExportComplete: handleExportComplete,
                  fetchExportData: fetchCanonicalExportData,
                }}
              />
            }
          />
          {isBottomTableExpanded && (
            <View style={styles.floatingBottomTableBody}>
              <WaypointsTable
                embedded
                waypoints={displayData.waypoints}
                statusMap={displayData.statusMap}
                missionMode={displayData.missionMode}
                currentIndex={effectiveCurrentIndex}
                pinnedCount={PINNED_COUNT}
                onReorder={handleReorder}
              />
            </View>
          )}
        </DraggableCard>
      )}
      END OF OLD UI (disabled) */}

      <MissionExtensionDistanceDialog
        visible={showExtensionDialog}
        initialChoice={extensionDialogChoice}
        bounds={missionExtension.bounds}
        settings={missionExtension.settings}
        rowEnds={missionExtension.rowEnds}
        editable={missionExtension.editable}
        lockedReason={missionExtension.lockedReason}
        lockMessage={missionExtension.message}
        blockedReason={preview.acceptedForStart || effectiveMissionActive
          ? "The mission is loaded or active. Its row extension cannot be changed."
          : preview.missionId && missionExtension.availability !== "available"
            ? missionExtension.message ?? "Wait for the rover's row extension settings."
            : null}
        previewState={missionExtension.previewState}
        previewError={missionExtension.previewError}
        previewPending={missionExtension.previewPending}
        onPreview={missionExtension.preview}
        onClearPreview={missionExtension.clearPreview}
        applying={missionExtension.applying || isApplyingHomeExtension}
        onCancel={() => setShowExtensionDialog(false)}
        onApply={(choice) => {
          void handleApplyHomeExtension(choice);
        }}
      />

      {useMissionActivityExperience && (
        <MissionActivityExperience
          waypoints={displayData.waypoints}
          statusMap={displayData.statusMap as PointStatusMap}
          currentIndex={effectiveCurrentIndex}
          missionStartTime={displayData.startTime}
          missionEndTime={displayData.endTime}
          isMissionActive={effectiveMissionActive}
          hasMissionLoaded={hasUploadedMission || missionUploadConfirmed}
          onClearMission={() => { void handleClearMission(); }}
          onOpenPlan={onOpenPlan ?? (() => undefined)}
          onLoadMission={() => { void handleHomeLoadMission(); }}
          loadBusy={isLoadingHomeMission}
          onOpenExtension={() => setShowExtensionDialog(true)}
          onStart={() => handleStart()}
          onPause={() => handlePause()}
          onResume={() => handleResume()}
          onStop={() => handleStop()}
          canStart={canStartMission && effectiveLifecycle.state === "READY" && backendMission?.accepted_for_start === true}
          isPreparing={isPreparingMission}
          isMissionPaused={isBackendMissionPaused}
          missionState={effectiveLifecycle.state}
          isStarting={isStartingMission || stopAwaitingTerminal}
          pauseAvailable={effectiveLifecycle.pauseAvailable}
          skipAvailable={effectiveLifecycle.skipAvailable}
          canChangeMode={effectiveLifecycle.state === "READY" && backendMission?.accepted_for_start === false}
          stopLatched={backendMission?.emergency_stop === true}
          onEmergencyStopRecorded={() => { void refreshBackendMission(); }}
          mode={mode === "MANUAL" ? "manual" : "auto"}
          onSetMode={(nextMode) =>
            handleSetExecutionMode(nextMode === "manual" ? "MANUAL" : "AUTO")
          }
          onSkip={() => handleSkip()}
          onNext={() => handleNext()}
          waitingForManual={effectiveWaitingForManual}
          onExport={handleExportMissionFile}
          onExportReport={handleRequestExportReport}
          onClearLogs={handleRequestClearLogs}
          clearLogsBlockedReason={clearLogsBlockedReason}
          pauseReason={backendPauseReason}
          rtkReason={backendRtkReason}
          resumeAvailable={backendResumeAvailable}
          onCommitEdit={handleCommitMissionEdit}
          editBlockedReason={
            connectionState !== "connected" ? "Connect to the rover to edit the mission." : null
          }
          onNotify={(type, title, message) => showNotification(type, title, message, 4500)}
        />
      )}

      <Toast
        visible={notification.visible}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        onDismiss={dismissNotification}
      />

      {/* Undo prompt for recent bulk-skip */}
      {undoPrompt.visible && (
        <View style={styles.undoBanner}>
          <Text style={styles.undoText}>Bulk skip performed — </Text>
          <TouchableOpacity
            style={styles.undoButton}
            onPress={async () => {
              const id = undoPrompt.id;
              if (!id) return;
              // Find record
              const rec = skipHistory.find((r) => r.id === id);
              if (!rec) return;

              // Restore previous statuses
              setStatusMap((prev) => {
                const copy = { ...prev };
                Object.keys(rec.previousStatuses).forEach((k) => {
                  const sn = parseInt(k, 10);
                  const prevEntry = rec.previousStatuses[sn];
                  if (!prevEntry) {
                    delete copy[sn];
                  } else {
                    copy[sn] = prevEntry;
                  }
                });
                return copy;
              });

              // Mark audit record undone in persistent storage
              await PersistentStorage.markSkipAuditUndone(id).catch((err) =>
                console.warn(
                  "[MissionReportScreen] Failed to mark audit undone",
                  err,
                ),
              );

              // Remove prompt and record
              setSkipHistory((prev) => prev.filter((r) => r.id !== id));
              setUndoPrompt({ visible: false, id: null });
              if (undoTimerRef.current) {
                clearTimeout(undoTimerRef.current);
                undoTimerRef.current = null;
              }

              showNotification("info", "Undo", "Bulk skip undone locally");
            }}
          >
            <Text style={styles.undoButtonText}>Undo</Text>
          </TouchableOpacity>
        </View>
      )}

      <RTKInjectionScreen
        visible={showRTKInjection}
        onClose={closeRTKInjection}
        services={services}
        isConnected={connectionState === "connected"}
      />

      {/* Auto-Assign Dialog */}
      <AutoAssignDialog
        visible={showAutoAssignDialog}
        missingFields={missingFields}
        onAutoAssign={handleAutoAssignSequence}
        onProceedWithout={handleProceedWithoutAssign}
        onCancel={() => setShowAutoAssignDialog(false)}
      />

      {/* Waypoint Preview Dialog */}
      <WaypointPreviewDialog
        visible={showWaypointPreviewDialog}
        waypoints={waypoints}
        onConfirm={handleConfirmUpload}
        onCancel={() => setShowWaypointPreviewDialog(false)}
        isUploading={isUploadingMission}
      />

      {/* Mission Completion Dialog */}
      <MissionCompletionDialog
        visible={showCompletionDialog}
        onDismiss={() => {
          console.log(
            "[MissionReportScreen] Closing mission completion dialog",
          );

          setShowCompletionDialog(false);
        }}
        onExport={handleExport}
        missionStats={getMissionStats()}
        waypoints={displayData.waypoints}
        statusMap={displayData.statusMap}
        missionMode={displayData.missionMode}
        fetchExportData={fetchCanonicalExportData}
        fetchExportTiming={fetchCanonicalExportTiming}
      />

      {/* Mission report exporter (Excel / PDF), opened from the Export sheet */}
      <MissionReportExport
        hideTrigger
        openSignal={reportExportSignal}
        waypoints={displayData.waypoints}
        statusMap={displayData.statusMap}
        missionMode={displayData.missionMode}
        onExport={handleExport}
        onExportComplete={handleExportComplete}
        fetchExportData={fetchCanonicalExportData}
        fetchExportTiming={fetchCanonicalExportTiming}
      />

      {/* Clear Logs After Export Dialog */}
      <LogClearDialog
        visible={showClearLogsDialog}
        onConfirm={handleClearLogsAfterExport}
        onCancel={handleKeepLogsAfterExport}
        message={
          clearLogsAfterExport
            ? undefined
            : "Clear the saved point status and timing for this mission? The mission plan stays loaded."
        }
      />
    </SafeAreaView>
  );
}

const bottomTableInsets = getMissionProgressBottomTableInsets();

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    position: "relative",
  },
  containerOverMap: {
    backgroundColor: "transparent",
  },
  absoluteMapContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  floatingRobotStatusPanel: {
    position: "absolute",
    top: MISSION_PROGRESS_LAYOUT.HEADER_CLEARANCE,
    left: MISSION_PROGRESS_LAYOUT.EDGE,
    width: MISSION_PROGRESS_LAYOUT.LEFT_PANEL_WIDTH,
    zIndex: 1000,
  },
  floatingMissionProgressPanel: {
    position: "absolute",
    left: MISSION_PROGRESS_LAYOUT.EDGE,
    width: MISSION_PROGRESS_LAYOUT.LEFT_PANEL_WIDTH,
    zIndex: 1000,
  },

  floatingQuickNtripPanel: {
    position: "absolute",
    left: MISSION_PROGRESS_LAYOUT.EDGE,
    width: MISSION_PROGRESS_LAYOUT.LEFT_PANEL_WIDTH,
    bottom: MISSION_PROGRESS_LAYOUT.BOTTOM_INSET,
    zIndex: 1001,
  },

  floatingAccuracyMonitorPanel: {
    position: "absolute",
    left: MISSION_PROGRESS_LAYOUT.EDGE,
    width: MISSION_PROGRESS_LAYOUT.LEFT_PANEL_WIDTH,

    /**
     * Initial position only.
     * The operator can long-press and drag
     * it anywhere after rendering.
     */
    bottom: MISSION_PROGRESS_LAYOUT.BOTTOM_INSET + 390,

    zIndex: 1000,
  },

  floatingDistanceToTargetPanel: {
    position: "absolute",
    left: MISSION_PROGRESS_LAYOUT.EDGE,
    width: MISSION_PROGRESS_LAYOUT.LEFT_PANEL_WIDTH,
    bottom: MISSION_PROGRESS_LAYOUT.BOTTOM_INSET + 260,
    zIndex: 1000,
  },
  floatingMissionControlsPanel: {
    position: "absolute",
    top: MISSION_PROGRESS_LAYOUT.HEADER_CLEARANCE,
    right: MISSION_PROGRESS_LAYOUT.EDGE,
    width: MISSION_PROGRESS_LAYOUT.RIGHT_PANEL_WIDTH,
    zIndex: 1000,
  },
  floatingBottomTable: {
    position: "absolute",
    bottom: MISSION_PROGRESS_LAYOUT.BOTTOM_INSET,
    left: bottomTableInsets.left,
    right: bottomTableInsets.right,
    zIndex: 1000,
    elevation: 6,
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    borderRadius: PATH_PLAN_GLASS.borderRadius,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  floatingBottomTableBody: {
    height: MISSION_PROGRESS_LAYOUT.BOTTOM_TABLE_BODY_HEIGHT,
    overflow: "hidden",
  },
  previousMissionBanner: {
    backgroundColor: "#FFF3CD",
    borderBottomWidth: 1,
    borderBottomColor: "#FDBF47",
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  previousMissionText: {
    color: "#856404",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  undoBanner: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 110,
    backgroundColor: "#072334",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  undoText: {
    color: "#E6F7FF",
    fontSize: 13,
  },
  undoButton: {
    marginLeft: 10,
    backgroundColor: "#0ea5a5",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  undoButtonText: {
    color: "#001219",
    fontWeight: "700",
  },
});

// -----------------------------------------------------------------------------
// Field command presentation
// Kept in this screen intentionally: it is a visual layer over the existing
// mission state and handlers, rather than a second mission implementation.

type DeckAction = () => Promise<unknown> | void;

interface MissionActivityExperienceProps {
  waypoints: Waypoint[];
  /** Per-point report status incl. recorded accuracy (position_error_cm). */
  statusMap: PointStatusMap;
  /** Backend-confirmed active point index, when the rover reports one. */
  currentIndex?: number | null;
  missionStartTime?: Date | null;
  missionEndTime?: Date | null;
  isMissionActive: boolean;
  hasMissionLoaded: boolean;
  onClearMission: () => void;
  onOpenPlan: (intent?: PlanOpenIntent) => void;
  onLoadMission: () => void;
  loadBusy: boolean;
  onOpenExtension: () => void;
  onStart: DeckAction;
  onPause: DeckAction;
  onResume: DeckAction;
  onStop: DeckAction;
  canStart: boolean;
  isPreparing: boolean;
  isMissionPaused: boolean;
  missionState?: string | null;
  isStarting?: boolean;
  pauseAvailable?: boolean;
  skipAvailable?: boolean;
  canChangeMode?: boolean;
  stopLatched?: boolean;
  onEmergencyStopRecorded?: () => void;
  mode?: "auto" | "manual";
  onSetMode?: (mode: "auto" | "manual") => Promise<unknown> | void;
  onSkip?: DeckAction;
  onNext?: DeckAction;
  waitingForManual?: boolean;
  /** Save the (modified) uploaded mission to the device as a CSV file. */
  onExport?: () => Promise<void> | void;
  /** Open the Excel / PDF mission report exporter. */
  onExportReport?: () => void;
  /** Ask to clear the mission logs (the screen shows the confirm dialog). */
  onClearLogs?: () => void;
  /** Why clearing logs is blocked right now, or null when it is allowed. */
  clearLogsBlockedReason?: string | null;
  /** Rover-reported pause reason / RTK reason / resume flag, for the deck notice. */
  pauseReason?: string | null;
  rtkReason?: string | null;
  resumeAvailable?: boolean;
  /** Push an edited point list to the rover (re-upload). */
  onCommitEdit?: (
    points: Waypoint[],
  ) => Promise<{ success: boolean; message?: string }>;
  /** Why editing is currently not allowed (offline, ...), or null. */
  editBlockedReason?: string | null;
  onNotify?: (
    type: "success" | "error" | "info",
    title: string,
    message: string,
  ) => void;
}

// UI preview only. These points are never written to mission state, shown on
// the map, or sent to the backend. Real uploaded points replace them instantly.
const COMMAND_DEMO_WAYPOINTS: Waypoint[] = [
  { sn: 9001, block: "DEMO", row: "01", pile: "01", lat: 12.971599, lon: 77.594566, alt: 0, status: "Pending", time: "", remark: "UI preview" },
  { sn: 9002, block: "DEMO", row: "01", pile: "02", lat: 12.971734, lon: 77.594642, distance: 17.1, alt: 0, status: "Pending", time: "", remark: "UI preview" },
  { sn: 9003, block: "DEMO", row: "01", pile: "03", lat: 12.971861, lon: 77.594721, distance: 16.5, alt: 0, status: "Pending", time: "", remark: "UI preview" },
  { sn: 9004, block: "DEMO", row: "02", pile: "01", lat: 12.971982, lon: 77.594808, distance: 16.3, alt: 0, status: "Pending", time: "", remark: "UI preview" },
  { sn: 9005, block: "DEMO", row: "02", pile: "02", lat: 12.972104, lon: 77.594894, distance: 16.4, alt: 0, status: "Pending", time: "", remark: "UI preview" },
  { sn: 9006, block: "DEMO", row: "02", pile: "03", lat: 12.972229, lon: 77.594978, distance: 16.7, alt: 0, status: "Pending", time: "", remark: "UI preview" },
  { sn: 9007, block: "DEMO", row: "03", pile: "01", lat: 12.972351, lon: 77.595063, distance: 16.4, alt: 0, status: "Pending", time: "", remark: "UI preview" },
  { sn: 9008, block: "DEMO", row: "03", pile: "02", lat: 12.972474, lon: 77.595149, distance: 16.5, alt: 0, status: "Pending", time: "", remark: "UI preview" },
];

function finiteOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Top-bar / progress-deck telemetry. When the rover link is down every value
 * is null so the UI shows "—" instead of a stale or default-zero reading.
 */
function selectCommandTelemetry(snapshot: LiveTelemetrySnapshot) {
  const telemetry = snapshot.telemetry;
  const connected = snapshot.connectionState === "connected";

  if (!connected) {
    return {
      connected,
      battery: null as number | null,
      voltage: null as number | null,
      current: null as number | null,
      speed: null as number | null,
      heading: null as number | null,
      fixType: null as number | null,
      satellites: null as number | null,
      hrms: null as number | null,
      vrms: null as number | null,
      distToNext: null as number | null,
      mode: "—",
    };
  }

  const percentage = finiteOrNull(telemetry.battery?.percentage);
  const voltageRaw = finiteOrNull(telemetry.battery?.voltage);
  // 0 V / 0 % with no cell voltage means "no reading yet", not an empty pack.
  const voltage = voltageRaw !== null && voltageRaw > 0 ? voltageRaw : null;

  return {
    connected,
    battery:
      percentage !== null && (percentage > 0 || voltage !== null)
        ? percentage
        : null,
    voltage,
    current: voltage !== null ? finiteOrNull(telemetry.battery?.current) : null,
    speed: finiteOrNull(
      telemetry.global?.vel ?? telemetry.rpp_actual_speed_mps,
    ),
    heading: finiteOrNull(telemetry.attitude?.yaw_deg),
    // Connected but no packet yet is "no reading", not "No Fix".
    fixType: telemetry.lastMessageTs ? finiteOrNull(telemetry.rtk?.fix_type) : null,
    satellites: finiteOrNull(telemetry.global?.satellites_visible),
    hrms: finiteOrNull(telemetry.hrms),
    vrms: finiteOrNull(telemetry.vrms),
    distToNext: finiteOrNull(telemetry.distance_to_next_m),
    mode: modeDisplayLabel(telemetry.state?.mode ?? "UNKNOWN"),
  };
}

function commandValue(value: number | null, suffix: string, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(digits)}${suffix}`
    : "—";
}

function commandHeadingDirection(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const normalized = ((value % 360) + 360) % 360;
  return labels[Math.round(normalized / 45) % labels.length] ?? "—";
}

function commandRouteKm(waypoints: Waypoint[]): number {
  if (waypoints.length < 2) return 0;
  const radiusKm = 6371;
  return waypoints.slice(1).reduce((total, point, index) => {
    const previous = waypoints[index];
    if (Number.isFinite(point.distance)) return total + Number(point.distance) / 1000;
    const lat1 = previous.lat * (Math.PI / 180);
    const lat2 = point.lat * (Math.PI / 180);
    const dLat = lat2 - lat1;
    const dLon = (point.lon - previous.lon) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return total + radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, 0);
}

function commandSegmentDistanceM(previous: Waypoint | undefined, point: Waypoint): number | null {
  if (!previous || !Number.isFinite(previous.lat) || !Number.isFinite(previous.lon) || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
    return null;
  }
  if (Number.isFinite(point.distance)) return Number(point.distance);
  const radiusM = 6371000;
  const lat1 = previous.lat * (Math.PI / 180);
  const lat2 = point.lat * (Math.PI / 180);
  const dLat = lat2 - lat1;
  const dLon = (point.lon - previous.lon) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function commandCoordinate(value: number): string {
  return Number.isFinite(value) ? value.toFixed(6) : "—";
}

function commandDistanceLabel(distanceM: number | null): string {
  if (distanceM == null) return "Distance unavailable";
  return distanceM >= 1000 ? `${(distanceM / 1000).toFixed(2)} km from previous` : `${distanceM.toFixed(1)} m from previous`;
}

function CommandMeta({ icon, text }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; text: string }) {
  return <View style={fieldExperienceStyles.meta}><MaterialCommunityIcons name={icon} size={15} color="#5C78A8" /><Text style={fieldExperienceStyles.metaText}>{text}</Text></View>;
}

function commandAccuracyTier(accMm: number | null): { label: string; color: string; solidBg: string; bg: string; border: string } | null {
  if (accMm == null) return null;
  if (accMm <= 20) {
    return { label: "Excellent", color: "#16B980", solidBg: "#16B980", bg: "#ECFDF5", border: "#148263" };
  } else if (accMm <= 35) {
    return { label: "Good", color: "#1475EE", solidBg: "#1475EE", bg: "#F0F9FF", border: "#1162C9" };
  } else if (accMm <= 60) {
    return { label: "Poor", color: "#F08A24", solidBg: "#F08A24", bg: "#FFFBEB", border: "#C86412" };
  } else {
    return { label: "Failed", color: "#D94A42", solidBg: "#D94A42", bg: "#FEF2F2", border: "#C43C34" };
  }
}

function MissionActivityExperience({
  waypoints, statusMap, currentIndex, missionStartTime, missionEndTime,
  isMissionActive,
  hasMissionLoaded, onClearMission, onOpenPlan, onLoadMission, loadBusy, onOpenExtension,
  onStart, onPause, onResume, onStop,
  canStart, isPreparing, isMissionPaused, missionState, isStarting,
  pauseAvailable, skipAvailable, canChangeMode, stopLatched, onEmergencyStopRecorded,
  mode, onSetMode, onSkip, onNext, waitingForManual,
  onExport, onExportReport, onClearLogs, clearLogsBlockedReason,
  pauseReason, rtkReason, resumeAvailable,
  onCommitEdit, editBlockedReason, onNotify,
}: MissionActivityExperienceProps) {
  const telemetry = useLiveTelemetrySelector(selectCommandTelemetry, shallowEqual);
  const { width: viewportWidth } = useWindowDimensions();
  const timelineAvailableWidth = Math.max(viewportWidth - 232, 250);
  const stepWidth = Math.max(85, Math.floor((timelineAvailableWidth - 28) / 5));
  const snapInterval = (stepWidth + 7) * 5;
  const [showSettings, setShowSettings] = useState(false);
  const [isLightHeader, setIsLightHeader] = useState(true);
  const [isPointsExpanded, setIsPointsExpanded] = useState(false);
  const [isExportSheetOpen, setIsExportSheetOpen] = useState(false);
  const editHistory = useDraftHistory<Waypoint[]>();
  const isEditingPoints = editHistory.isEditing;
  const [isApplyingEdit, setIsApplyingEdit] = useState(false);
  const applyingEditRef = useRef(false);
  const [pendingAction, setPendingAction] = useState<DeckPendingAction>(null);
  const [isStopping, setIsStopping] = useState(false);
  const controlLockRef = useRef(false);
  const stopLockRef = useRef(false);
  const skipConfirmOpenRef = useRef(false);
  const deckMountedRef = useRef(true);
  const [activityCardHeight, setActivityCardHeight] = useState(0);
  const [isTelemetryExpanded, setIsTelemetryExpanded] = useState(false);
  const expandTelemetryAnim = useRef(new Animated.Value(0)).current;
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [middleDeckWidth, setMiddleDeckWidth] = useState<number>(0);
  const pointCardWidth =
    middleDeckWidth > 0
      ? Math.floor((middleDeckWidth - 24 - 48) / 4)
      : Math.max(140, Math.floor((viewportWidth - 32 - 340 - 24 - 48) / 4));

  const [activeHudModal, setActiveHudModal] = useState<"rtk" | "battery" | "dynamics" | "odometer" | "brand" | null>(null);
  const [speedUnitKmh, setSpeedUnitKmh] = useState(false);
  const [distanceEtaMode, setDistanceEtaMode] = useState<"dist" | "eta">("dist");
  const hudModalAnim = useRef(new Animated.Value(0)).current;

  const openHudModal = useCallback((type: "rtk" | "battery" | "dynamics" | "odometer" | "brand") => {
    setActiveHudModal(type);
    hudModalAnim.setValue(0);
    Animated.spring(hudModalAnim, {
      toValue: 1,
      friction: 8,
      tension: 65,
      useNativeDriver: true,
    }).start();
  }, [hudModalAnim]);

  const closeHudModal = useCallback(() => {
    Animated.timing(hudModalAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setActiveHudModal(null));
  }, [hudModalAnim]);

  const toggleTelemetry = useCallback((expand?: boolean) => {
    setIsTelemetryExpanded((prev) => {
      const next = typeof expand === "boolean" ? expand : !prev;
      Animated.spring(expandTelemetryAnim, {
        toValue: next ? 1 : 0,
        friction: 8,
        tension: 50,
        useNativeDriver: true,
      }).start();
      return next;
    });
  }, [expandTelemetryAnim]);

  const { isActivityScreenOpen: isProgressVisible, setIsActivityScreenOpen: setIsProgressVisible } = useMissionProgressOverlay();
  const progressScreenAnim = useRef(new Animated.Value(0)).current;

  const openProgressScreen = useCallback(() => {
    setIsProgressVisible(true);
    Animated.timing(progressScreenAnim, {
      toValue: 1,
      duration: 350,
      easing: Easing.out(Easing.poly(4)),
      useNativeDriver: false,
    }).start();
  }, [progressScreenAnim]);

  const closeProgressScreen = useCallback(() => {
    Animated.timing(progressScreenAnim, {
      toValue: 0,
      duration: 250,
      easing: Easing.in(Easing.poly(4)),
      useNativeDriver: false,
    }).start(() => setIsProgressVisible(false));
  }, [progressScreenAnim]);
  const [activityCardWidth, setActivityCardWidth] = useState(0);
  const pointsPanelProgress = useRef(new Animated.Value(0)).current;
  const isDemoPoints = waypoints.length === 0;
  const activityWaypoints = isDemoPoints ? COMMAND_DEMO_WAYPOINTS : waypoints;
  const listWaypoints = editHistory.draft ?? activityWaypoints;
  // Progress comes from the backend-reported per-point status map, never from
  // the (never-updated) waypoint.status field and never from sample points.
  const realStatusMap: PointStatusMap = isDemoPoints ? {} : statusMap;
  const progress = useMemo(
    () => computeMissionProgress(activityWaypoints, realStatusMap),
    [activityWaypoints, realStatusMap],
  );
  const currentPoint = useMemo(() => {
    const count = activityWaypoints.length;
    if (
      isMissionActive &&
      typeof currentIndex === "number" &&
      currentIndex >= 0 &&
      currentIndex < count
    ) {
      return currentIndex;
    }
    return progress.activeIndex ?? Math.max(0, count - 1);
  }, [activityWaypoints.length, currentIndex, isMissionActive, progress.activeIndex]);
  const routeKm = useMemo(() => commandRouteKm(activityWaypoints), [activityWaypoints]);
  const mapAreaWidth = Math.max(viewportWidth - 410, 0);
  const currentActivityWidth = activityCardWidth || 378;
  const expandedPanelWidth = currentActivityWidth + Math.max(280, Math.round(mapAreaWidth / 2));
  const expandedPointCardWidth = Math.max(240, Math.floor((expandedPanelWidth - 34) / 2));
  // Green only for a true RTK fixed solution. 3D Fix, DGPS or RTK float is not
  // centimetre-grade, so it must not look "good".
  const rtkIsFixed = telemetry.fixType === 6;
  const headingRotation = typeof telemetry.heading === "number" && Number.isFinite(telemetry.heading)
    ? ((telemetry.heading % 360) + 360) % 360
    : 0;
  const headingValue = typeof telemetry.heading === "number" && Number.isFinite(telemetry.heading)
    ? `${Math.round(headingRotation)}°`
    : "—";
  const headingDirection = commandHeadingDirection(telemetry.heading);
  const progressPct = progress.pct;
  const doneCount = progress.done;
  const nextWp = activityWaypoints[currentPoint] || activityWaypoints[0];
  // Length of the leg that ends at the current target (not distance-to-go).
  const nextLegM = currentPoint > 0
    ? commandSegmentDistanceM(activityWaypoints[currentPoint - 1], nextWp)
    : (activityWaypoints.length > 1 ? commandSegmentDistanceM(nextWp, activityWaypoints[1]) : null);
  // Live distance to the current target, reported by the rover while it drives.
  const distToTargetM = isMissionActive ? telemetry.distToNext : null;
  const hrmsMm = hrmsToMm(telemetry.hrms);
  const vrmsMm = hrmsToMm(telemetry.vrms);
  const totalKm = routeKm;
  const coveredKm = useMemo(() => {
    if (isDemoPoints || activityWaypoints.length < 2) return 0;
    let meters = 0;
    for (let i = 1; i < currentPoint; i += 1) {
      meters += commandSegmentDistanceM(activityWaypoints[i - 1], activityWaypoints[i]) ?? 0;
    }
    return Math.min(routeKm, meters / 1000);
  }, [activityWaypoints, currentPoint, isDemoPoints, routeKm]);
  const remainingKm = Math.max(0, totalKm - coveredKm);

  // Elapsed / ETA: real clock and measured speed only; "—" when unknown.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isMissionActive) return undefined;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isMissionActive]);
  const startMs = missionStartTime instanceof Date ? missionStartTime.getTime() : null;
  const endMs = missionEndTime instanceof Date ? missionEndTime.getTime() : null;
  const elapsedSeconds = isMissionActive
    ? elapsedSec(startMs, nowMs)
    : endMs !== null
      ? elapsedSec(startMs, endMs)
      : null;
  const etaSeconds = isMissionActive
    ? estimateRemainingSec(remainingKm * 1000, telemetry.speed)
    : null;

  const { end: endEditing } = editHistory;

  const openPointsPanel = useCallback(() => {
    endEditing();
    setIsPointsExpanded(true);
    pointsPanelProgress.setValue(0);
    requestAnimationFrame(() => {
      Animated.timing(pointsPanelProgress, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });
  }, [pointsPanelProgress, endEditing]);

  const closePointsPanel = useCallback(() => {
    Animated.timing(pointsPanelProgress, {
      toValue: 0,
      duration: 280,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) {
        endEditing();
        setIsPointsExpanded(false);
      }
    });
  }, [pointsPanelProgress, endEditing]);

  useEffect(() => () => pointsPanelProgress.stopAnimation(), [pointsPanelProgress]);
  useEffect(() => {
    deckMountedRef.current = true;
    return () => {
      deckMountedRef.current = false;
    };
  }, []);

  // ── Edit mode (Reverse / Undo / Redo / Delete, applied to the rover) ──────
  const editBlocked: string | null = isDemoPoints
    ? "Upload a mission first."
    : isMissionActive
      ? "Stop the mission before editing its points."
      : (editBlockedReason ?? null);
  const isDraftDirty =
    editHistory.draft !== null && !sameMissionRoute(editHistory.draft, waypoints);

  const handleToggleEdit = useCallback(() => {
    if (editHistory.isEditing) {
      if (!isDraftDirty) {
        editHistory.end();
        return;
      }
      Alert.alert(
        "Unsaved changes",
        "Apply the changes to the rover, or discard them.",
      );
      return;
    }
    if (editBlocked) {
      onNotify?.("info", "Editing unavailable", editBlocked);
      return;
    }
    editHistory.begin(waypoints.map((point) => ({ ...point })));
  }, [editBlocked, editHistory, isDraftDirty, onNotify, waypoints]);

  const handleDiscardEdit = useCallback(() => {
    if (!isDraftDirty) {
      editHistory.end();
      return;
    }
    Alert.alert("Discard changes?", "Your edits to the points will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => editHistory.end() },
    ]);
  }, [editHistory, isDraftDirty]);

  const handleReverseDraft = useCallback(() => {
    const current = editHistory.draft;
    if (!current || current.length < 2) return;
    editHistory.apply(reverseMissionWaypoints(current));
  }, [editHistory]);

  const handleDeleteDraftPoint = useCallback(
    (index: number) => {
      const current = editHistory.draft;
      if (!current) return;
      const next = removeMissionWaypoint(current, index);
      if (next === current) {
        onNotify?.("info", "Cannot delete", "A mission needs at least 2 points.");
        return;
      }
      editHistory.apply(next);
    },
    [editHistory, onNotify],
  );

  const handleApplyEdit = useCallback(() => {
    const draft = editHistory.draft;
    if (!draft || !isDraftDirty || applyingEditRef.current || !onCommitEdit) return;
    Alert.alert(
      "Apply changes to the rover?",
      `${draft.length} points will replace the uploaded mission. ` +
        "The mission must be loaded again before it can start.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Apply",
          onPress: () => {
            if (applyingEditRef.current) return;
            applyingEditRef.current = true;
            setIsApplyingEdit(true);
            void (async () => {
              try {
                const result = await onCommitEdit(draft);
                if (!deckMountedRef.current) return;
                if (result.success) {
                  editHistory.end();
                  onNotify?.(
                    "success",
                    "Mission updated",
                    result.message ?? "The rover has the edited mission. Load it again before starting.",
                  );
                } else {
                  onNotify?.(
                    "error",
                    "Update failed",
                    result.message ?? "The rover did not accept the edited mission. Your changes are kept.",
                  );
                }
              } catch (error) {
                onNotify?.(
                  "error",
                  "Update failed",
                  error instanceof Error ? error.message : "Could not update the mission. Your changes are kept.",
                );
              } finally {
                applyingEditRef.current = false;
                if (deckMountedRef.current) setIsApplyingEdit(false);
              }
            })();
          },
        },
      ],
    );
  }, [editHistory, isDraftDirty, onCommitEdit, onNotify]);

  // The mission was cleared while editing: there is nothing left to edit.
  useEffect(() => {
    if (isDemoPoints && editHistory.isEditing) editHistory.end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoPoints]);

  // A running mission must never be edited under the operator.
  useEffect(() => {
    if (isMissionActive && editHistory.isEditing) {
      editHistory.end();
      onNotify?.("info", "Editing closed", "Editing is closed while the mission runs.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMissionActive]);

  /** Run a home mission action, but never silently throw away an unsaved draft. */
  const runWithoutDraft = useCallback(
    (action: () => void) => {
      if (isDraftDirty) {
        Alert.alert(
          "Unsaved changes",
          "Apply or discard your point edits first.",
        );
        return;
      }
      endEditing();
      action();
    },
    [endEditing, isDraftDirty],
  );

  /** Open the planner, but never silently throw away an unsaved draft. */
  const openPlanGuarded = useCallback(
    (intent?: PlanOpenIntent) => {
      if (isDraftDirty) {
        Alert.alert(
          "Unsaved changes",
          "Apply or discard your point edits first.",
        );
        return;
      }
      endEditing();
      onOpenPlan(intent);
    },
    [endEditing, isDraftDirty, onOpenPlan],
  );

  const handleExportPress = useCallback(() => {
    if (isDraftDirty) {
      Alert.alert(
        "Unsaved changes",
        "Apply or discard your point edits first, so the exported file matches the rover.",
      );
      return;
    }
    void onExport?.();
  }, [isDraftDirty, onExport]);

  // Export tile opens the export & logs sheet; each row closes it first so the
  // next dialog (file save, report modal, clear-logs prompt) is the only one up.
  const closeExportSheet = useCallback(() => setIsExportSheetOpen(false), []);
  const handleSheetExportFile = useCallback(() => {
    setIsExportSheetOpen(false);
    handleExportPress();
  }, [handleExportPress]);
  const handleSheetExportReport = useCallback(() => {
    setIsExportSheetOpen(false);
    onExportReport?.();
  }, [onExportReport]);
  const handleSheetClearLogs = useCallback(() => {
    setIsExportSheetOpen(false);
    onClearLogs?.();
  }, [onClearLogs]);

  const deckPauseNotice = useMemo(
    () => pauseNotice(isMissionPaused, pauseReason, rtkReason, resumeAvailable),
    [isMissionPaused, pauseReason, rtkReason, resumeAvailable],
  );

  // ── Mission control buttons: one request at a time, STOP always available ──
  const runControl = useCallback(
    async (key: Exclude<DeckPendingAction, null>, action?: DeckAction) => {
      if (!action) return;
      const isStop = key === "stop";
      if (isStop ? stopLockRef.current : controlLockRef.current) return;
      if (isStop) {
        stopLockRef.current = true;
        setIsStopping(true);
      } else {
        controlLockRef.current = true;
        setPendingAction(key);
      }
      try {
        await action();
      } catch (error) {
        console.warn(`[MissionActivity] ${key} request failed:`, error);
      } finally {
        if (isStop) {
          stopLockRef.current = false;
          if (deckMountedRef.current) setIsStopping(false);
        } else {
          controlLockRef.current = false;
          if (deckMountedRef.current) setPendingAction(null);
        }
      }
    },
    [],
  );

  const controls = getDeckControlState({
    state: missionState,
    isMissionActive,
    isMissionPaused,
    waitingForManual: Boolean(waitingForManual),
    canStart,
    isPreparing,
    isEditing: isEditingPoints,
    isBusy: pendingAction !== null,
    isStopping,
    isStarting,
    pauseAvailable,
    skipAvailable,
    resumeAvailable,
    canChangeMode,
    mode: mode ?? "auto",
  });

  const pointsPanelAnimatedWidth = pointsPanelProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [currentActivityWidth, expandedPanelWidth],
  });

  const homeOpacity = progressScreenAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0, 0],
  });
  
  const homeScale = progressScreenAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.96],
  });

  const selectedWp = selectedPointIndex !== null ? activityWaypoints[selectedPointIndex] : null;
  const selectedPointAccMm = selectedWp?.sn !== undefined ? pointAccuracyMm(realStatusMap[selectedWp.sn]) : null;
  const selectedTier = commandAccuracyTier(selectedPointAccMm);
  const selectedPointRemark = selectedWp?.remark || (selectedWp?.sn !== undefined ? (realStatusMap[selectedWp.sn] as any)?.remark : null) || "No remark recorded";

  // When a run starts, bring the progress deck up so the operator sees it
  // fill in. Only on the idle -> active transition: a deck the operator closed
  // mid-run is left closed.
  const wasMissionActiveRef = useRef(isMissionActive);
  useEffect(() => {
    if (isMissionActive && !wasMissionActiveRef.current && !isProgressVisible && !isDemoPoints) {
      openProgressScreen();
    }
    wasMissionActiveRef.current = isMissionActive;
  }, [isMissionActive, isProgressVisible, isDemoPoints, openProgressScreen]);

  return (
    <View style={fieldExperienceStyles.host} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: homeOpacity, transform: [{ scale: homeScale }] }]} pointerEvents={isProgressVisible ? "none" : "box-none"}>
        <View style={[fieldExperienceStyles.homeHeader, !isLightHeader && fieldExperienceStyles.homeHeaderDark]}>
        <View style={fieldExperienceStyles.homeBrand}><View style={fieldExperienceStyles.homeBrandIcon}><MaterialCommunityIcons name="map-marker-path" size={22} color="#FFFFFF" /></View><Text style={[fieldExperienceStyles.homeBrandTitle, !isLightHeader && fieldExperienceStyles.homeBrandTitleDark]}>Way To Mark</Text></View>
        <View style={fieldExperienceStyles.homeStatusGroup}>
          <View style={[fieldExperienceStyles.homeStatusBlock, telemetry.connected ? (isLightHeader ? fieldExperienceStyles.homeWatchBadgeGood : fieldExperienceStyles.homeWatchBadgeGoodDark) : (isLightHeader ? fieldExperienceStyles.homeWatchBadgeAlert : fieldExperienceStyles.homeWatchBadgeAlertDark)]}><View style={[fieldExperienceStyles.homeStatusIconCircle, telemetry.connected ? fieldExperienceStyles.homeStatusIconGood : fieldExperienceStyles.homeStatusIconAlert]}><MaterialCommunityIcons name="lan-connect" size={17} color="#FFFFFF" /></View><View><View style={fieldExperienceStyles.homeStatusHeading}><View style={[fieldExperienceStyles.homeStatusDot, { backgroundColor: telemetry.connected ? "#16B980" : "#F97316" }]} /><Text style={[fieldExperienceStyles.homeStatusLabelText, !isLightHeader && fieldExperienceStyles.homeStatusLabelTextDark]}>LINK</Text></View><Text style={[fieldExperienceStyles.homeStatusValue, telemetry.connected ? (isLightHeader ? fieldExperienceStyles.homeStatusValueGood : fieldExperienceStyles.homeStatusValueGoodDark) : (isLightHeader ? fieldExperienceStyles.homeStatusValueAlert : fieldExperienceStyles.homeStatusValueAlertDark)]}>{telemetry.connected ? "Connected" : "Offline"}</Text></View></View>
          <View style={[fieldExperienceStyles.homeStatusBlock, rtkIsFixed ? (isLightHeader ? fieldExperienceStyles.homeWatchBadgeGood : fieldExperienceStyles.homeWatchBadgeGoodDark) : (isLightHeader ? fieldExperienceStyles.homeWatchBadgeAlert : fieldExperienceStyles.homeWatchBadgeAlertDark)]}><View style={[fieldExperienceStyles.homeStatusIconCircle, rtkIsFixed ? fieldExperienceStyles.homeStatusIconGood : fieldExperienceStyles.homeStatusIconAlert]}><MaterialCommunityIcons name="satellite-uplink" size={17} color="#FFFFFF" /></View><View><View style={fieldExperienceStyles.homeStatusHeading}><View style={[fieldExperienceStyles.homeStatusDot, { backgroundColor: rtkIsFixed ? "#16B980" : "#F97316" }]} /><Text style={[fieldExperienceStyles.homeStatusLabelText, !isLightHeader && fieldExperienceStyles.homeStatusLabelTextDark]}>RTK</Text></View><Text style={[fieldExperienceStyles.homeStatusValue, rtkIsFixed ? (isLightHeader ? fieldExperienceStyles.homeStatusValueGood : fieldExperienceStyles.homeStatusValueGoodDark) : (isLightHeader ? fieldExperienceStyles.homeStatusValueAlert : fieldExperienceStyles.homeStatusValueAlertDark)]}>{commandRtkLabel(telemetry.fixType)}</Text></View></View>
          <View style={[fieldExperienceStyles.homeStatusBlock, telemetry.battery != null && telemetry.battery >= 20 ? (isLightHeader ? fieldExperienceStyles.homeWatchBadgeGood : fieldExperienceStyles.homeWatchBadgeGoodDark) : (isLightHeader ? fieldExperienceStyles.homeWatchBadgeAlert : fieldExperienceStyles.homeWatchBadgeAlertDark)]}><View style={[fieldExperienceStyles.homeStatusIconCircle, telemetry.battery != null && telemetry.battery >= 20 ? fieldExperienceStyles.homeStatusIconGood : fieldExperienceStyles.homeStatusIconAlert]}><MaterialCommunityIcons name={telemetry.battery != null && telemetry.battery < 20 ? "battery-alert-variant-outline" : telemetry.battery != null && telemetry.battery < 60 ? "battery-medium" : "battery-high"} size={18} color="#FFFFFF" /></View><View><View style={fieldExperienceStyles.homeStatusHeading}><View style={[fieldExperienceStyles.homeStatusDot, { backgroundColor: telemetry.battery != null && telemetry.battery >= 20 ? "#16B980" : "#F97316" }]} /><Text style={[fieldExperienceStyles.homeStatusLabelText, !isLightHeader && fieldExperienceStyles.homeStatusLabelTextDark]}>BATTERY</Text></View><Text style={[fieldExperienceStyles.homeStatusValue, telemetry.battery != null && telemetry.battery >= 20 ? (isLightHeader ? fieldExperienceStyles.homeStatusValueGood : fieldExperienceStyles.homeStatusValueGoodDark) : (isLightHeader ? fieldExperienceStyles.homeStatusValueAlert : fieldExperienceStyles.homeStatusValueAlertDark)]}>{commandValue(telemetry.battery, "%", 0)}</Text></View></View>
          <View style={[fieldExperienceStyles.homeStatusBlock, telemetry.satellites != null && telemetry.satellites >= 8 ? (isLightHeader ? fieldExperienceStyles.homeWatchBadgeGood : fieldExperienceStyles.homeWatchBadgeGoodDark) : (isLightHeader ? fieldExperienceStyles.homeWatchBadgeAlert : fieldExperienceStyles.homeWatchBadgeAlertDark)]}><View style={[fieldExperienceStyles.homeStatusIconCircle, telemetry.satellites != null && telemetry.satellites >= 8 ? fieldExperienceStyles.homeStatusIconGood : fieldExperienceStyles.homeStatusIconAlert]}><MaterialCommunityIcons name="satellite-variant" size={17} color="#FFFFFF" /></View><View><View style={fieldExperienceStyles.homeStatusHeading}><View style={[fieldExperienceStyles.homeStatusDot, { backgroundColor: telemetry.satellites != null && telemetry.satellites >= 8 ? "#16B980" : "#F97316" }]} /><Text style={[fieldExperienceStyles.homeStatusLabelText, !isLightHeader && fieldExperienceStyles.homeStatusLabelTextDark]}>SATELLITES</Text></View><Text style={[fieldExperienceStyles.homeStatusValue, telemetry.satellites != null && telemetry.satellites >= 8 ? (isLightHeader ? fieldExperienceStyles.homeStatusValueGood : fieldExperienceStyles.homeStatusValueGoodDark) : (isLightHeader ? fieldExperienceStyles.homeStatusValueAlert : fieldExperienceStyles.homeStatusValueAlertDark)]}>{telemetry.satellites == null ? "—" : `${telemetry.satellites} used`}</Text></View></View>
          <View style={[fieldExperienceStyles.homeStatusBlock, isMissionActive ? (isLightHeader ? fieldExperienceStyles.homeWatchBadgeGood : fieldExperienceStyles.homeWatchBadgeGoodDark) : (isLightHeader ? fieldExperienceStyles.homeWatchBadgeInfo : fieldExperienceStyles.homeWatchBadgeInfoDark)]}><View style={[fieldExperienceStyles.homeStatusIconCircle, isMissionActive ? fieldExperienceStyles.homeStatusIconGood : fieldExperienceStyles.homeStatusIconInfo]}><MaterialCommunityIcons name="robot-industrial" size={17} color="#FFFFFF" /></View><View><View style={fieldExperienceStyles.homeStatusHeading}><View style={[fieldExperienceStyles.homeStatusDot, { backgroundColor: isMissionActive ? "#16B980" : "#1475EE" }]} /><Text style={[fieldExperienceStyles.homeStatusLabelText, !isLightHeader && fieldExperienceStyles.homeStatusLabelTextDark]}>MODE</Text></View><Text style={[fieldExperienceStyles.homeStatusValue, isMissionActive ? (isLightHeader ? fieldExperienceStyles.homeStatusValueGood : fieldExperienceStyles.homeStatusValueGoodDark) : (isLightHeader ? fieldExperienceStyles.homeStatusValueInfo : fieldExperienceStyles.homeStatusValueInfoDark)]} numberOfLines={1}>{String(telemetry.mode)}</Text></View></View>
        </View>
        <View style={[fieldExperienceStyles.homeControls, !isLightHeader && fieldExperienceStyles.homeControlsDark]}><EstopControls variant="mission" stopLatched={stopLatched} onStopRecorded={onEmergencyStopRecorded} /><TouchableOpacity style={[fieldExperienceStyles.homeControl, fieldExperienceStyles.homeThemeButton, !isLightHeader && fieldExperienceStyles.homeThemeButtonDark]} onPress={() => setIsLightHeader((value) => !value)} accessibilityRole="button" accessibilityLabel="Toggle light and dark top bar"><MaterialCommunityIcons name={isLightHeader ? "weather-night" : "white-balance-sunny"} size={19} color="#FFFFFF" /><Text style={fieldExperienceStyles.homeControlLabel}>THEME</Text></TouchableOpacity><TouchableOpacity style={[fieldExperienceStyles.homeControl, fieldExperienceStyles.homeSettingsButton, !isLightHeader && fieldExperienceStyles.homeControlDark]} onPress={() => setShowSettings(true)} accessibilityRole="button" accessibilityLabel="Open settings"><MaterialCommunityIcons name="tune-variant" size={19} color={isLightHeader ? "#173563" : "#F8FAFC"} /><Text style={[fieldExperienceStyles.homeSettingsLabel, !isLightHeader && fieldExperienceStyles.homeSettingsLabelDark]}>SETTINGS</Text></TouchableOpacity></View>
      </View>
      <View style={fieldExperienceStyles.homeHeadingCard}>
        <View style={fieldExperienceStyles.homeHeadingDial}><MaterialCommunityIcons name="navigation-variant" size={20} color="#1475EE" style={{ transform: [{ rotate: `${headingRotation}deg` }] }} /></View>
        <View><Text style={fieldExperienceStyles.homeHeadingValue}>{headingValue}</Text><Text style={fieldExperienceStyles.homeHeadingLabel}>HEADING · {headingDirection}</Text></View>
      </View>
      <View style={fieldExperienceStyles.overview}>
        <View style={fieldExperienceStyles.railHeader}>
          <View><Text style={fieldExperienceStyles.eyebrow}>MISSION</Text><Text style={fieldExperienceStyles.missionTitle} numberOfLines={1}>Field Survey</Text></View>
          <View style={fieldExperienceStyles.liveBadge}><View style={[fieldExperienceStyles.dot, { backgroundColor: telemetry.connected ? "#16B980" : "#F97316" }]} /><Text style={fieldExperienceStyles.liveText}>{isMissionActive ? "Autonomous" : "Ready"}</Text></View>
        </View>
        <View style={fieldExperienceStyles.routeMeta}>
          <CommandMeta icon="map-marker-radius-outline" text={`${activityWaypoints.length} ${isDemoPoints ? "sample points" : "points"}`} />
          <CommandMeta icon="source-branch" text={`${routeKm.toFixed(1)} km`} />
        </View>
        <View style={[fieldExperienceStyles.card, fieldExperienceStyles.missionToolSection]}>
          <View style={fieldExperienceStyles.cardHeading}><View style={fieldExperienceStyles.missionToolHeading}><View style={fieldExperienceStyles.missionToolHeadingIcon}><MaterialCommunityIcons name="toolbox-outline" size={20} color="#1475EE" /></View><View><Text style={fieldExperienceStyles.missionToolTitle}>Mission tools</Text><Text style={fieldExperienceStyles.toolSectionSub}>{hasMissionLoaded ? "Mission ready to use" : "Upload a plan to enable tools"}</Text></View></View><View style={fieldExperienceStyles.toolHeaderActions}><Text style={fieldExperienceStyles.toolSectionHint}>{hasMissionLoaded ? "READY" : "SETUP"}</Text>{hasMissionLoaded && <TouchableOpacity style={fieldExperienceStyles.clearMissionCompact} onPress={onClearMission} accessibilityRole="button" accessibilityLabel="Clear mission"><MaterialCommunityIcons name="trash-can-outline" size={15} color="#D94A42" /><Text style={fieldExperienceStyles.clearMissionCompactText}>Clear</Text></TouchableOpacity>}</View></View>
          <View style={fieldExperienceStyles.missionToolGrid}>
            <TouchableOpacity style={[fieldExperienceStyles.missionToolTile, fieldExperienceStyles.missionToolTilePrimary]} onPress={() => openPlanGuarded("upload")} accessibilityRole="button" accessibilityLabel="Upload mission plan"><MaterialCommunityIcons name="file-upload-outline" size={24} color="#FFFFFF" /><Text style={fieldExperienceStyles.missionToolTilePrimaryText}>Upload</Text></TouchableOpacity>
            <TouchableOpacity style={[fieldExperienceStyles.missionToolTile, !hasMissionLoaded && fieldExperienceStyles.missionToolTileDisabled]} onPress={() => runWithoutDraft(onLoadMission)} disabled={!hasMissionLoaded || loadBusy} accessibilityRole="button" accessibilityLabel="Load mission plan" accessibilityState={{ disabled: !hasMissionLoaded || loadBusy, busy: loadBusy }}><MaterialCommunityIcons name="tray-arrow-down" size={24} color={hasMissionLoaded ? "#1475EE" : "#9BAABD"} /><Text style={[fieldExperienceStyles.missionToolTileText, !hasMissionLoaded && fieldExperienceStyles.missionToolTileTextDisabled]}>Load</Text></TouchableOpacity>
            <TouchableOpacity style={fieldExperienceStyles.missionToolTile} onPress={() => setIsExportSheetOpen(true)} accessibilityRole="button" accessibilityLabel="Open export and logs menu"><MaterialCommunityIcons name="file-export-outline" size={24} color="#1475EE" /><Text style={fieldExperienceStyles.missionToolTileText}>Export</Text></TouchableOpacity>
            <TouchableOpacity style={[fieldExperienceStyles.missionToolTile, !hasMissionLoaded && fieldExperienceStyles.missionToolTileDisabled]} onPress={() => runWithoutDraft(onOpenExtension)} disabled={!hasMissionLoaded} accessibilityRole="button" accessibilityLabel="Open mission extension tools" accessibilityState={{ disabled: !hasMissionLoaded }}><MaterialCommunityIcons name="vector-polyline-plus" size={24} color={hasMissionLoaded ? "#1475EE" : "#9BAABD"} /><Text style={[fieldExperienceStyles.missionToolTileText, !hasMissionLoaded && fieldExperienceStyles.missionToolTileTextDisabled]}>Extension</Text></TouchableOpacity>
          </View>
        </View>
        <View style={[fieldExperienceStyles.card, fieldExperienceStyles.missionActivityCard]} onLayout={(event) => { setActivityCardHeight(Math.round(event.nativeEvent.layout.height)); setActivityCardWidth(Math.round(event.nativeEvent.layout.width)); }}>
          <View style={fieldExperienceStyles.activityHeader}>
            <View style={fieldExperienceStyles.activityTitleGroup}><View style={fieldExperienceStyles.activityTitleIcon}><MaterialCommunityIcons name="map-marker-path" size={22} color="#FFFFFF" /></View><Text style={fieldExperienceStyles.activityTitle}>Mission activity</Text></View>
            <View style={[fieldExperienceStyles.activityStateBadge, isDemoPoints ? fieldExperienceStyles.activityStateDemo : fieldExperienceStyles.activityStateLive]}><View style={[fieldExperienceStyles.activityStateDot, isDemoPoints && fieldExperienceStyles.activityStateDotDemo]} /><Text style={[fieldExperienceStyles.activityStateText, isDemoPoints && fieldExperienceStyles.activityStateTextDemo]}>{isDemoPoints ? "DEMO" : "LIVE"}</Text></View>
          </View>
          <View style={fieldExperienceStyles.activityListHeading}><Text style={fieldExperienceStyles.activityListTitle}>POINTS</Text><MaterialCommunityIcons name="gesture-swipe-vertical" size={15} color="#7185A4" /></View>
          <ScrollView style={fieldExperienceStyles.activityPointList} contentContainerStyle={fieldExperienceStyles.activityPointListContent} nestedScrollEnabled showsVerticalScrollIndicator>
            {activityWaypoints.map((waypoint, index) => <View key={`activity-${waypoint.sn}-${index}`} style={[fieldExperienceStyles.activityPointRow, fieldExperienceStyles.readableHomePointRow]}>
              <View style={[fieldExperienceStyles.activityPointIcon, fieldExperienceStyles.readableHomePointIcon]}><Text style={[fieldExperienceStyles.activityPointIconText, fieldExperienceStyles.readablePointNumber]}>{String(index + 1).padStart(2, "0")}</Text></View>
              <View style={[fieldExperienceStyles.activityPointDetails, fieldExperienceStyles.pointDataCentered]}><View style={fieldExperienceStyles.activityCoordinatePair}><View style={fieldExperienceStyles.activityCoordinateItem}><Text style={[fieldExperienceStyles.activityCoordinateLabel, fieldExperienceStyles.readableCoordinateLabel]}>LAT</Text><Text style={[fieldExperienceStyles.activityCoordinateValue, fieldExperienceStyles.readableCoordinateValue]}>{commandCoordinate(waypoint.lat)}</Text></View><View style={fieldExperienceStyles.activityCoordinateDivider} /><View style={fieldExperienceStyles.activityCoordinateItem}><Text style={[fieldExperienceStyles.activityCoordinateLabel, fieldExperienceStyles.readableCoordinateLabel]}>LON</Text><Text style={[fieldExperienceStyles.activityCoordinateValue, fieldExperienceStyles.readableCoordinateValue]}>{commandCoordinate(waypoint.lon)}</Text></View></View></View>
            </View>)}
          </ScrollView>
          <View style={fieldExperienceStyles.actionRow}>
            <TouchableOpacity style={[fieldExperienceStyles.expandPointsButton, fieldExperienceStyles.actionButtonHalf]} onPress={isProgressVisible ? closeProgressScreen : openProgressScreen} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel="View mission progress">
              <View style={fieldExperienceStyles.expandPointsIcon}><MaterialCommunityIcons name="chart-box-outline" size={18} color="#FFFFFF" /></View>
              <Text style={fieldExperienceStyles.expandPointsText}>Progress</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[fieldExperienceStyles.expandPointsButton, fieldExperienceStyles.actionButtonHalf]} onPress={openPointsPanel} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel="Expand mission points">
              <View style={fieldExperienceStyles.expandPointsIcon}><MaterialCommunityIcons name="arrow-expand-horizontal" size={18} color="#FFFFFF" /></View>
              <Text style={fieldExperienceStyles.expandPointsText}>Expand</Text>
              <MaterialCommunityIcons name="chevron-left" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </Animated.View>

      {isProgressVisible && (
        <Animated.View style={[fieldExperienceStyles.activityScreen, { opacity: progressScreenAnim }]} pointerEvents="box-none">
          {/* Top Telemetry & Distance HUD Strip (Tactile Boxy Interactive View) */}
          <Animated.View style={[fieldExperienceStyles.deckTopbar, { transform: [{ translateY: progressScreenAnim.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) }] }]}>
            {/* Left: Mission Brand & Live Sensor Telemetry */}
            <View style={fieldExperienceStyles.topHudLeftGroup}>
              {/* Module 1: Brand / Mission Info (Interactive) */}
              <TouchableOpacity
                style={fieldExperienceStyles.topHudBrandWrap}
                onPress={() => openHudModal("brand")}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="View rover system profile"
              >
                <View style={fieldExperienceStyles.topHudBrandIcon}>
                  <MaterialCommunityIcons name="map-marker-path" size={15} color="#FFFFFF" />
                </View>
                <View style={[fieldExperienceStyles.topHudLiveDot, { backgroundColor: rtkIsFixed ? "#16B980" : "#F08A24" }]} />
                <Text style={fieldExperienceStyles.topHudBrandText}>WAY TO MARK</Text>
                <MaterialCommunityIcons name="chevron-down" size={13} color="#64748B" />
              </TouchableOpacity>

              {/* Module 2: RTK GNSS Status (Interactive, matching homeWatchSummaryGood) */}
              <TouchableOpacity
                style={[
                  fieldExperienceStyles.topHudRtkPill,
                  {
                    backgroundColor: rtkIsFixed ? "#E9F9F1" : "#FFF1DF",
                    borderColor: rtkIsFixed ? "#CBEFDD" : "#FFD5A3",
                  },
                ]}
                onPress={() => openHudModal("rtk")}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="View RTK GNSS diagnostics"
              >
                <MaterialCommunityIcons name="satellite-uplink" size={14} color={rtkIsFixed ? "#16B980" : "#F08A24"} />
                <Text style={[fieldExperienceStyles.topHudRtkText, { color: rtkIsFixed ? "#148263" : "#C86412" }]}>
                  {commandRtkLabel(telemetry.fixType)}{hrmsMm != null ? ` (${hrmsMm}mm)` : ""}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={12} color={rtkIsFixed ? "#16B980" : "#F08A24"} />
              </TouchableOpacity>

              {/* Module 3: Battery Power Gauge (Interactive, matching homeSignalBattery) */}
              <TouchableOpacity
                style={[fieldExperienceStyles.topHudSensorBadge, fieldExperienceStyles.topHudBatteryBadge]}
                onPress={() => openHudModal("battery")}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="View power system diagnostics"
              >
                <View style={fieldExperienceStyles.topHudBatterySegmentRow}>
                  {[0, 25, 50, 75].map((threshold) => (
                    <View
                      key={`batt-seg-${threshold}`}
                      style={[
                        fieldExperienceStyles.topHudBatterySeg,
                        {
                          backgroundColor:
                            telemetry.battery != null && telemetry.battery > threshold
                              ? telemetry.battery < 20
                                ? "#DC2626"
                                : "#16B980"
                              : "#E2E8F0",
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[fieldExperienceStyles.topHudSensorVal, { color: telemetry.battery != null && telemetry.battery < 20 ? "#D94A42" : "#148263" }]}>
                  {commandValue(telemetry.battery, "%", 0)}
                </Text>
              </TouchableOpacity>

              {/* Module 4: Speed & Heading Dynamics (Interactive toggle between m/s and km/h, matching homeSignalRtk & homeHeadingDial) */}
              <TouchableOpacity
                style={[fieldExperienceStyles.topHudSensorBadge, fieldExperienceStyles.topHudDynamicsBadge]}
                onPress={() => setSpeedUnitKmh((prev) => !prev)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Toggle speed units"
              >
                <MaterialCommunityIcons name="speedometer" size={14} color="#1475EE" />
                <Text style={[fieldExperienceStyles.topHudSensorVal, { color: "#1475EE" }]}>
                  {telemetry.speed == null
                    ? "—"
                    : speedUnitKmh
                      ? `${(telemetry.speed * 3.6).toFixed(1)} km/h`
                      : `${telemetry.speed.toFixed(1)} m/s`}
                </Text>
                <Text style={fieldExperienceStyles.topHudUnitToggleHint}>⇄</Text>
                <MaterialCommunityIcons name="compass-outline" size={13} color="#1475EE" style={{ marginLeft: 3 }} />
                <Text style={[fieldExperienceStyles.topHudSensorVal, { color: "#173563" }]}>
                  {headingValue} {headingDirection}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Center: Distance & ETA Cluster (Interactive toggle between Distance and ETA) */}
            <View style={fieldExperienceStyles.topHudCenterGroup}>
              <TouchableOpacity
                style={fieldExperienceStyles.topHudDistOdometer}
                onPress={() => setDistanceEtaMode((prev) => (prev === "dist" ? "eta" : "dist"))}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Toggle odometer and ETA display"
              >
                {distanceEtaMode === "dist" ? (
                  <>
                    <View style={fieldExperienceStyles.topHudDistSegment}>
                      <Text style={fieldExperienceStyles.topHudDistLabel}>TOTAL</Text>
                      <Text style={fieldExperienceStyles.topHudDistVal}>{totalKm.toFixed(2)} km</Text>
                    </View>
                    <View style={fieldExperienceStyles.topHudDistSep} />
                    <View style={fieldExperienceStyles.topHudDistSegment}>
                      <Text style={[fieldExperienceStyles.topHudDistLabel, { color: "#148263" }]}>DONE</Text>
                      <Text style={[fieldExperienceStyles.topHudDistVal, { color: "#148263" }]}>{coveredKm.toFixed(2)} km</Text>
                    </View>
                    <View style={fieldExperienceStyles.topHudDistSep} />
                    <View style={fieldExperienceStyles.topHudDistSegment}>
                      <Text style={[fieldExperienceStyles.topHudDistLabel, { color: "#1475EE" }]}>LEFT</Text>
                      <Text style={[fieldExperienceStyles.topHudDistVal, { color: "#1475EE" }]}>{remainingKm.toFixed(2)} km</Text>
                    </View>
                    <View style={fieldExperienceStyles.topHudModeBadgePill}>
                      <Text style={fieldExperienceStyles.topHudModeBadgeText}>⇄ ETA</Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={fieldExperienceStyles.topHudDistSegment}>
                      <Text style={fieldExperienceStyles.topHudDistLabel}>ELAPSED</Text>
                      <Text style={fieldExperienceStyles.topHudDistVal}>{formatDuration(elapsedSeconds)}</Text>
                    </View>
                    <View style={fieldExperienceStyles.topHudDistSep} />
                    <View style={fieldExperienceStyles.topHudDistSegment}>
                      <Text style={[fieldExperienceStyles.topHudDistLabel, { color: "#148263" }]}>EST. LEFT</Text>
                      <Text style={[fieldExperienceStyles.topHudDistVal, { color: "#148263" }]}>{formatDuration(etaSeconds)}</Text>
                    </View>
                    <View style={fieldExperienceStyles.topHudDistSep} />
                    <View style={fieldExperienceStyles.topHudDistSegment}>
                      <Text style={[fieldExperienceStyles.topHudDistLabel, { color: "#1475EE" }]}>SPEED</Text>
                      <Text style={[fieldExperienceStyles.topHudDistVal, { color: "#1475EE" }]}>{commandValue(telemetry.speed, " m/s", 1)}</Text>
                    </View>
                    <View style={fieldExperienceStyles.topHudModeBadgePill}>
                      <Text style={fieldExperienceStyles.topHudModeBadgeText}>⇄ KM</Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>

              {(distToTargetM != null || nextLegM != null) && (
                <View style={fieldExperienceStyles.topHudTargetCapsule}>
                  <MaterialCommunityIcons name="crosshairs-gps" size={14} color="#1D4ED8" />
                  <Text style={fieldExperienceStyles.topHudTargetText}>
                    {distToTargetM != null
                      ? `WP ${currentPoint + 1} · ${distToTargetM.toFixed(distToTargetM < 10 ? 1 : 0)} m to go`
                      : `WP ${currentPoint + 1} · leg ${nextLegM!.toFixed(0)} m`}
                  </Text>
                </View>
              )}
            </View>

            <EstopControls variant="mission" stopLatched={stopLatched} onStopRecorded={onEmergencyStopRecorded} />
            {/* Right: Close Button */}
            <TouchableOpacity style={fieldExperienceStyles.deckCloseBtn} onPress={closeProgressScreen} activeOpacity={0.82} accessibilityRole="button" accessibilityLabel="Close mission operations deck">
              <MaterialCommunityIcons name="close" size={18} color="#64748B" />
            </TouchableOpacity>
          </Animated.View>

          {/* Interactive HUD Detail Popover Modal */}
          {activeHudModal !== null && (
            <Animated.View style={[fieldExperienceStyles.hudModalOverlay, { opacity: hudModalAnim }]}>
              <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeHudModal} activeOpacity={1} />
              <Animated.View
                style={[
                  fieldExperienceStyles.hudModalCard,
                  {
                    transform: [
                      {
                        translateY: hudModalAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [-12, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={fieldExperienceStyles.hudModalHeader}>
                  <View style={fieldExperienceStyles.hudModalHeaderTitleWrap}>
                    <MaterialCommunityIcons
                      name={
                        activeHudModal === "rtk"
                          ? "satellite-uplink"
                          : activeHudModal === "battery"
                          ? "battery-charging"
                          : "robot-industrial"
                      }
                      size={17}
                      color="#1475EE"
                    />
                    <Text style={fieldExperienceStyles.hudModalHeaderTitle}>
                      {activeHudModal === "rtk"
                        ? "GNSS & RTK PRECISION TELEMETRY"
                        : activeHudModal === "battery"
                        ? "POWER SYSTEM & BATTERY DIAGNOSTICS"
                        : "SURVEY SYSTEM & JOB PROFILE"}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={closeHudModal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="close" size={16} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {activeHudModal === "rtk" && (
                  <View style={fieldExperienceStyles.hudModalGrid}>
                    <View style={fieldExperienceStyles.hudModalGridItem}>
                      <Text style={fieldExperienceStyles.hudModalGridLabel}>FIX SOLUTION</Text>
                      <Text style={[fieldExperienceStyles.hudModalGridVal, { color: rtkIsFixed ? "#059669" : "#D97706" }]}>
                        {commandRtkLabel(telemetry.fixType).toUpperCase()}
                      </Text>
                    </View>
                    <View style={fieldExperienceStyles.hudModalGridItem}>
                      <Text style={fieldExperienceStyles.hudModalGridLabel}>HORIZONTAL ACCURACY</Text>
                      <Text style={fieldExperienceStyles.hudModalGridVal}>{hrmsMm != null ? `${hrmsMm} mm` : "—"}</Text>
                    </View>
                    <View style={fieldExperienceStyles.hudModalGridItem}>
                      <Text style={fieldExperienceStyles.hudModalGridLabel}>VERTICAL ACCURACY</Text>
                      <Text style={fieldExperienceStyles.hudModalGridVal}>{vrmsMm != null ? `${vrmsMm} mm` : "—"}</Text>
                    </View>
                    <View style={fieldExperienceStyles.hudModalGridItem}>
                      <Text style={fieldExperienceStyles.hudModalGridLabel}>SATELLITES</Text>
                      <Text style={fieldExperienceStyles.hudModalGridVal}>{telemetry.satellites != null ? `${telemetry.satellites} used` : "—"}</Text>
                    </View>
                  </View>
                )}

                {activeHudModal === "battery" && (
                  <View style={fieldExperienceStyles.hudModalGrid}>
                    <View style={fieldExperienceStyles.hudModalGridItem}>
                      <Text style={fieldExperienceStyles.hudModalGridLabel}>BATTERY</Text>
                      <Text style={[fieldExperienceStyles.hudModalGridVal, { color: telemetry.battery != null && telemetry.battery < 20 ? "#DC2626" : "#059669" }]}>
                        {commandValue(telemetry.battery, "%", 0)}
                      </Text>
                    </View>
                    <View style={fieldExperienceStyles.hudModalGridItem}>
                      <Text style={fieldExperienceStyles.hudModalGridLabel}>VOLTAGE</Text>
                      <Text style={fieldExperienceStyles.hudModalGridVal}>{commandValue(telemetry.voltage, " V", 1)}</Text>
                    </View>
                    <View style={fieldExperienceStyles.hudModalGridItem}>
                      <Text style={fieldExperienceStyles.hudModalGridLabel}>CURRENT</Text>
                      <Text style={fieldExperienceStyles.hudModalGridVal}>{commandValue(telemetry.current, " A", 1)}</Text>
                    </View>
                  </View>
                )}

                {activeHudModal === "brand" && (
                  <View style={fieldExperienceStyles.hudModalGrid}>
                    <View style={fieldExperienceStyles.hudModalGridItem}>
                      <Text style={fieldExperienceStyles.hudModalGridLabel}>ROVER UNIT</Text>
                      <Text style={fieldExperienceStyles.hudModalGridVal}>DYX 4WD Rover</Text>
                    </View>
                    <View style={fieldExperienceStyles.hudModalGridItem}>
                      <Text style={fieldExperienceStyles.hudModalGridLabel}>MISSION</Text>
                      <Text style={fieldExperienceStyles.hudModalGridVal}>{isDemoPoints ? "None loaded" : `${activityWaypoints.length} points`}</Text>
                    </View>
                    <View style={fieldExperienceStyles.hudModalGridItem}>
                      <Text style={fieldExperienceStyles.hudModalGridLabel}>TELEMETRY LINK</Text>
                      <Text style={[fieldExperienceStyles.hudModalGridVal, { color: telemetry.connected ? "#059669" : "#DC2626" }]}>
                        {telemetry.connected ? "Connected" : "Disconnected"}
                      </Text>
                    </View>
                    <View style={fieldExperienceStyles.hudModalGridItem}>
                      <Text style={fieldExperienceStyles.hudModalGridLabel}>DRIVE MODE</Text>
                      <Text style={fieldExperienceStyles.hudModalGridVal}>{mode === "manual" ? "Manual" : "Auto"}</Text>
                    </View>
                  </View>
                )}
              </Animated.View>
            </Animated.View>
          )}

          {/* Minimal Waypoint Callout on Map */}
          <Animated.View style={[fieldExperienceStyles.floatingMapCallout, { opacity: progressScreenAnim, transform: [{ translateY: progressScreenAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]} pointerEvents="none">
            <View style={fieldExperienceStyles.floatingCalloutIcon}>
              <MaterialCommunityIcons name="robot-industrial" size={15} color="#1475EE" />
            </View>
            <Text style={fieldExperienceStyles.floatingCalloutTitle}>
              TARGET WP {currentPoint + 1}
            </Text>
            {distToTargetM != null && (
              <Text style={fieldExperienceStyles.floatingCalloutSub}>
                {distToTargetM.toFixed(distToTargetM < 10 ? 1 : 0)} m away
              </Text>
            )}
          </Animated.View>

          {/* Operations Deck: Left-Aligned Route Progress (flex: 1) + Right Expandable Drawer */}
          <Animated.View style={[fieldExperienceStyles.bottomDeckContainer, { transform: [{ translateY: progressScreenAnim.interpolate({ inputRange: [0, 1], outputRange: [240, 0] }) }] }]}>
            
            {/* COLUMN 1: LEFT-ALIGNED ROUTE PROGRESS & STEPPER (Height: 216px with 124px tall points cards) */}
            <View
              style={fieldExperienceStyles.deckColMiddleCard}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                if (w > 0 && Math.abs(w - middleDeckWidth) > 2) {
                  setMiddleDeckWidth(w);
                }
              }}
            >
              {/* Optional Selected Point Inspection Overlay */}
              {selectedWp != null && (
                <View style={fieldExperienceStyles.pointInspectionBanner}>
                  <View style={fieldExperienceStyles.pointInspectionHeader}>
                    <View style={fieldExperienceStyles.pointInspectionTitleWrap}>
                      <View style={[fieldExperienceStyles.inspectionDot, { backgroundColor: selectedTier?.color ?? "#1475EE" }]} />
                      <Text style={fieldExperienceStyles.pointInspectionTitle}>WP {selectedPointIndex! + 1} DATA</Text>
                      {selectedTier != null && (
                        <View style={[fieldExperienceStyles.inspectionTierBadge, { backgroundColor: selectedTier.solidBg, borderColor: selectedTier.solidBg }]}>
                          <Text style={[fieldExperienceStyles.inspectionTierText, { color: "#FFFFFF" }]}>
                            {selectedTier.label.toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => setSelectedPointIndex(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <MaterialCommunityIcons name="close" size={15} color="#64748B" />
                    </TouchableOpacity>
                  </View>
                  <View style={fieldExperienceStyles.pointInspectionBody}>
                    <Text style={fieldExperienceStyles.inspectionItem}>
                      GNSS: <Text style={{ color: selectedTier?.color ?? "#0F172A", fontWeight: "500" }}>{selectedPointAccMm != null ? `${selectedPointAccMm} mm` : "—"}</Text>
                    </Text>
                    <Text style={fieldExperienceStyles.inspectionDivider}>·</Text>
                    <Text style={fieldExperienceStyles.inspectionItem}>
                      Remark: <Text style={{ fontStyle: "italic", fontWeight: "500" }}>"{selectedPointRemark}"</Text>
                    </Text>
                    <Text style={fieldExperienceStyles.inspectionDivider}>·</Text>
                    <Text style={fieldExperienceStyles.inspectionItem}>
                      Coords: <Text style={{ fontFamily: "monospace" }}>{selectedWp.lat.toFixed(5)}, {selectedWp.lon.toFixed(5)}</Text>
                    </Text>
                  </View>
                </View>
              )}

              {/* Route Progress Header */}
              <View style={fieldExperienceStyles.progressHeaderRowMinimal}>
                <View style={fieldExperienceStyles.progressHeaderLeft}>
                  <Text style={fieldExperienceStyles.colEyebrowMinimal}>Waypoints Route</Text>
                  <View style={fieldExperienceStyles.progressWpCompletedBadge}>
                    <Text style={fieldExperienceStyles.progressWpCompletedText}>
                      {doneCount} / {activityWaypoints.length} Done
                    </Text>
                  </View>
                </View>
                <View style={fieldExperienceStyles.progressPercentBadgeMinimal}>
                  <Text style={fieldExperienceStyles.progressPercentBadgeTextMinimal}>{progressPct}%</Text>
                </View>
              </View>

              {/* Multi-Color Progress Track with Waypoint Milestone Dots */}
              <View style={fieldExperienceStyles.trackWrapper}>
                <View style={fieldExperienceStyles.progressBarTrackMinimal}>
                  <View style={[fieldExperienceStyles.progressBarFillMinimal, { width: `${progressPct}%` }]} />
                </View>
                <View style={fieldExperienceStyles.trackMilestonesRow}>
                  {activityWaypoints.slice(0, 6).map((_, mIdx) => {
                    const mDone = mIdx < currentPoint;
                    const mActive = mIdx === currentPoint;
                    return (
                      <View
                        key={`m-dot-${mIdx}`}
                        style={[
                          fieldExperienceStyles.milestoneDot,
                          mDone && fieldExperienceStyles.milestoneDotDone,
                          mActive && fieldExperienceStyles.milestoneDotActive,
                        ]}
                      >
                        <Text
                          style={[
                            fieldExperienceStyles.milestoneDotText,
                            (mDone || mActive) && fieldExperienceStyles.milestoneDotTextWhite,
                          ]}
                        >
                          {mIdx + 1}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Waypoint Stepper Scroller: Only Point Number + mm Accuracy + Remark */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={fieldExperienceStyles.deckStepperScrollMinimal}
              >
                {activityWaypoints.map((waypoint, index) => {
                  const pointStatus = String(realStatusMap[waypoint.sn]?.status ?? "").toLowerCase();
                  const isDone = isTerminalWaypointStatus(pointStatus as WaypointUiStatus);
                  const isActive = index === currentPoint && !isDone;

                  // Recorded accuracy only. A finished point without a measurement
                  // shows its outcome, never an invented number.
                  const accMm = pointAccuracyMm(realStatusMap[waypoint.sn]);
                  const outcomeTier =
                    pointStatus === "failed" || pointStatus === "aborted" || pointStatus === "stopped"
                      ? { label: "Failed", color: "#DC2626", solidBg: "#DC2626", bg: "#FEF2F2", border: "#C43C34" }
                      : pointStatus === "skipped"
                        ? { label: "Skipped", color: "#64748B", solidBg: "#64748B", bg: "#F1F5F9", border: "#CBD5E1" }
                        : { label: "Done", color: "#148263", solidBg: "#16B980", bg: "#ECFDF5", border: "#148263" };
                  const tier =
                    commandAccuracyTier(accMm) ??
                    (isDone
                      ? outcomeTier
                      : { label: "Pending", color: "#64748B", solidBg: "#64748B", bg: "#F1F5F9", border: "#CBD5E1" });
                  const isSelected = selectedPointIndex === index;
                  const cardNum = index + 1 < 10 ? `WP 0${index + 1}` : `WP ${index + 1}`;

                  return (
                    <TouchableOpacity
                      key={`step-wp-${waypoint.sn}-${index}`}
                      style={[
                        fieldExperienceStyles.stepCapsuleChip,
                        isActive && fieldExperienceStyles.stepCapsuleChipActive,
                        isSelected && fieldExperienceStyles.stepChipSelected,
                        { width: pointCardWidth },
                      ]}
                      onPress={() => setSelectedPointIndex(isSelected ? null : index)}
                      activeOpacity={0.78}
                    >
                      {/* Top: Point Number + Status Indicator Dot */}
                      <View style={fieldExperienceStyles.stepCardTopMinimal}>
                        <Text style={[fieldExperienceStyles.stepCardWpNum, isActive && { color: "#1475EE" }]}>{cardNum}</Text>
                        <View style={[fieldExperienceStyles.stepCardDotBadge, { backgroundColor: isDone ? "#E8F8F0" : isActive ? "#EEF5FF" : "#F1F5F9" }]}>
                          <Text style={[fieldExperienceStyles.stepCardDotText, { color: isDone ? "#148263" : isActive ? "#1475EE" : "#64748B" }]}>
                            {isDone ? "✓" : isActive ? "●" : "—"}
                          </Text>
                        </View>
                      </View>

                      {/* Sub-Block with Colored Background & White Text */}
                      <View style={[fieldExperienceStyles.stepCardSubBlock, { backgroundColor: tier.solidBg }]}>
                        <Text style={fieldExperienceStyles.stepCardSubBlockAcc}>
                          {accMm != null ? `${accMm} mm` : "— mm"}
                        </Text>
                        <Text style={fieldExperienceStyles.stepCardSubBlockRemark}>
                          {tier.label}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* COLUMN 2: mission controls. Buttons follow the confirmed rover state. */}
            <View style={fieldExperienceStyles.deckColRightWrap}>
              <View style={fieldExperienceStyles.deckRightBaseCard}>
                <MissionDeckControls
                  controls={controls}
                  mode={mode ?? "auto"}
                  isPreparing={isPreparing}
                  pending={isStopping ? "stop" : pendingAction}
                  notice={deckPauseNotice}
                  onPrimary={() => {
                    void (controls.primary === "stop"
                      ? runControl("stop", onStop)
                      : runControl("start", onStart));
                  }}
                  onSecondary={() => {
                    void (controls.secondary === "resume"
                      ? runControl("resume", onResume)
                      : runControl("pause", onPause));
                  }}
                  onSkip={() => {
                    if (skipConfirmOpenRef.current) return;
                    skipConfirmOpenRef.current = true;
                    Alert.alert("Skip current goal?", "The rover will skip the current goal if its safety checks allow it.", [
                      { text: "Cancel", style: "cancel", onPress: () => { skipConfirmOpenRef.current = false; } },
                      { text: "Skip goal", style: "destructive", onPress: () => { skipConfirmOpenRef.current = false; void runControl("skip", onSkip); } },
                    ], { onDismiss: () => { skipConfirmOpenRef.current = false; } });
                  }}
                  onNext={() => { void runControl("next", onNext); }}
                  onSetMode={(next) => {
                    void runControl("mode", onSetMode ? () => onSetMode(next) : undefined);
                  }}
                />
              </View>
            </View>

          </Animated.View>
        </Animated.View>
      )}

      {isPointsExpanded && <Animated.View style={[fieldExperienceStyles.pointsPanel, { width: pointsPanelAnimatedWidth, height: activityCardHeight || 320 }]}>
        <View style={fieldExperienceStyles.pointsPanelHeader}>
          <View style={fieldExperienceStyles.expandedActivityTitle}>
            <View style={fieldExperienceStyles.expandedActivityIcon}><MaterialCommunityIcons name="map-marker-path" size={21} color="#FFFFFF" /></View>
            <Text style={fieldExperienceStyles.pointsPanelTitle}>Mission activity</Text>
          </View>
          <View style={fieldExperienceStyles.pointsPanelHeaderActions}>
            <TouchableOpacity
              style={[fieldExperienceStyles.editAllButton, { minHeight: 48, minWidth: 72 }, isEditingPoints && fieldExperienceStyles.editAllButtonActive, !isEditingPoints && editBlocked != null && fieldExperienceStyles.disabled]}
              onPress={handleToggleEdit}
              accessibilityRole="button"
              accessibilityLabel={isEditingPoints ? "Finish editing mission points" : "Edit mission points"}
              accessibilityState={{ disabled: !isEditingPoints && editBlocked != null }}
            >
              <MaterialCommunityIcons name={isEditingPoints ? "check" : "pencil-outline"} size={16} color={isEditingPoints ? "#FFFFFF" : "#1475EE"} />
              <Text style={[fieldExperienceStyles.editAllText, { fontSize: 12 }, isEditingPoints && fieldExperienceStyles.editAllTextActive]}>{isEditingPoints ? "Done" : "Edit"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[fieldExperienceStyles.pointsPanelClose, { minHeight: 48, minWidth: 48 }]}
              onPress={() => {
                if (isDraftDirty) {
                  Alert.alert("Unsaved changes", "Apply or discard your point edits before closing.");
                  return;
                }
                closePointsPanel();
              }}
              accessibilityRole="button"
              accessibilityLabel="Close mission activity"
            >
              <MaterialCommunityIcons name="chevron-right" size={23} color="#173563" />
            </TouchableOpacity>
          </View>
        </View>
        {isEditingPoints && (
          <MissionEditToolbar
            pointCount={listWaypoints.length}
            canReverse={listWaypoints.length >= 2}
            canUndo={editHistory.canUndo}
            canRedo={editHistory.canRedo}
            isDirty={isDraftDirty}
            isApplying={isApplyingEdit}
            onReverse={handleReverseDraft}
            onUndo={editHistory.undo}
            onRedo={editHistory.redo}
            onCancel={handleDiscardEdit}
            onApply={handleApplyEdit}
          />
        )}
        <ScrollView showsVerticalScrollIndicator contentContainerStyle={fieldExperienceStyles.pointsPanelList}>
          {listWaypoints.map((waypoint, index) => <View key={`${waypoint.sn}-${index}`} style={[fieldExperienceStyles.pointRow, fieldExperienceStyles.readableExpandedPointRow, { width: expandedPointCardWidth }]}>
            <View style={[fieldExperienceStyles.pointIcon, fieldExperienceStyles.readableExpandedPointIcon]}><Text style={[fieldExperienceStyles.pointIconText, fieldExperienceStyles.readablePointNumber]}>{String(index + 1).padStart(2, "0")}</Text></View>
            <View style={[fieldExperienceStyles.pointDetails, fieldExperienceStyles.pointDataCentered]}><View style={fieldExperienceStyles.pointCoordinatePair}><View style={fieldExperienceStyles.pointCoordinateItem}><Text style={[fieldExperienceStyles.pointCoordinateLabel, fieldExperienceStyles.readableCoordinateLabel]}>LAT</Text><Text style={[fieldExperienceStyles.pointCoordinateValue, fieldExperienceStyles.readableCoordinateValue]}>{commandCoordinate(waypoint.lat)}</Text></View><View style={fieldExperienceStyles.pointCoordinateDivider} /><View style={fieldExperienceStyles.pointCoordinateItem}><Text style={[fieldExperienceStyles.pointCoordinateLabel, fieldExperienceStyles.readableCoordinateLabel]}>LON</Text><Text style={[fieldExperienceStyles.pointCoordinateValue, fieldExperienceStyles.readableCoordinateValue]}>{commandCoordinate(waypoint.lon)}</Text></View></View><View style={fieldExperienceStyles.pointDistance}><MaterialCommunityIcons name={index === 0 ? "flag-variant-outline" : "ruler"} size={12} color="#60799D" /><Text style={[fieldExperienceStyles.pointDistanceText, fieldExperienceStyles.readableDistanceText]}>{index === 0 ? "Start" : commandDistanceLabel(commandSegmentDistanceM(listWaypoints[index - 1], waypoint)).replace(" from previous", "")}</Text></View></View>
            {isEditingPoints && <View style={fieldExperienceStyles.pointActions}>
              <TouchableOpacity style={[fieldExperienceStyles.pointAction, { minHeight: 48 }, isApplyingEdit && fieldExperienceStyles.disabled]} disabled={isApplyingEdit} onPress={() => { if (!isDemoPoints) openPlanGuarded(); }} accessibilityRole="button" accessibilityLabel={`Edit point ${index + 1} in planner`}><MaterialCommunityIcons name="pencil-outline" size={17} color="#1475EE" /><Text style={[fieldExperienceStyles.pointActionText, fieldExperienceStyles.readableActionText]}>Edit</Text></TouchableOpacity>
              <TouchableOpacity style={[fieldExperienceStyles.pointAction, fieldExperienceStyles.pointDeleteAction, { minHeight: 48 }, (isApplyingEdit || listWaypoints.length <= 2) && fieldExperienceStyles.disabled]} disabled={isApplyingEdit || listWaypoints.length <= 2} onPress={() => handleDeleteDraftPoint(index)} accessibilityRole="button" accessibilityLabel={`Delete point ${index + 1}`}><MaterialCommunityIcons name="trash-can-outline" size={17} color="#DC2626" /><Text style={[fieldExperienceStyles.pointDeleteText, fieldExperienceStyles.readableActionText]}>Delete</Text></TouchableOpacity>
            </View>}
          </View>)}
        </ScrollView>
      </Animated.View>}
      <MissionExportSheet
        visible={isExportSheetOpen}
        onClose={closeExportSheet}
        onExportFile={handleSheetExportFile}
        onExportReport={handleSheetExportReport}
        onClearLogs={handleSheetClearLogs}
        fileDisabled={!hasMissionLoaded || isDemoPoints}
        reportDisabled={!hasMissionLoaded || isDemoPoints || !onExportReport}
        clearBlockedReason={onClearLogs ? (clearLogsBlockedReason ?? null) : "Not available."}
      />
      <SettingsScreen visible={showSettings} onClose={() => setShowSettings(false)} />
    </View>
  );
}

const fieldExperienceStyles = StyleSheet.create({
  host: { ...StyleSheet.absoluteFillObject, zIndex: 21 },
  missionToolSection: { padding: 16, marginBottom: 8, backgroundColor: "#FCFDFF", shadowColor: "#315987", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 }, missionToolHeading: { flexDirection: "row", alignItems: "center", gap: 9, flex: 1 }, missionToolHeadingIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF3FF" }, missionToolTitle: { color: "#152A50", fontSize: 15, fontWeight: "900" }, toolSectionSub: { color: "#7A8DA8", fontSize: 9, fontWeight: "700", marginTop: 2 }, toolHeaderActions: { flexDirection: "row", alignItems: "center", gap: 7 }, toolSectionHint: { color: "#7183A1", fontSize: 8, fontWeight: "900", letterSpacing: 0.7 }, clearMissionCompact: { height: 32, paddingHorizontal: 10, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "#FFF5F3", borderWidth: 1, borderColor: "#FFD9D2" }, clearMissionCompactText: { color: "#D94A42", fontSize: 9, fontWeight: "900" },
  missionToolGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, marginTop: 14 }, missionToolTile: { width: "48.6%", height: 62, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, borderRadius: 16, backgroundColor: "#F7FAFF", borderWidth: 1, borderColor: "#D5E3F5", shadowColor: "#315987", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 }, missionToolTilePrimary: { backgroundColor: "#1475EE", borderColor: "#1475EE", shadowColor: "#1475EE", shadowOpacity: 0.28, shadowRadius: 9, elevation: 5 }, missionToolTileDisabled: { backgroundColor: "#F3F6FA", borderColor: "#E0E7F0", shadowOpacity: 0, elevation: 0 }, missionToolTileClear: { backgroundColor: "#FFF7F5", borderColor: "#FFD9D2" }, missionToolTileText: { color: "#315987", fontSize: 13, fontWeight: "900", letterSpacing: 0.1 }, missionToolTileTextDisabled: { color: "#9BAABD" }, missionToolTilePrimaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900", letterSpacing: 0.1 }, missionToolTileClearText: { color: "#D94A42", fontSize: 11, fontWeight: "900", letterSpacing: 0.1 },
  uploadMissionOnly: { height: 58, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 11, borderRadius: 14, backgroundColor: "#1475EE", shadowColor: "#1475EE", shadowOpacity: 0.24, shadowRadius: 8, elevation: 3 }, uploadMissionOnlyIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)" }, uploadMissionOnlyTitle: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" }, uploadMissionOnlySub: { color: "#DCEBFF", fontSize: 10, fontWeight: "600", marginTop: 2 },
  missionTools: { height: 58, flexDirection: "row", gap: 8, marginBottom: 12 }, missionTool: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 12, backgroundColor: "#F4F8FE", borderWidth: 1, borderColor: "#DCE8F7" }, missionToolPrimary: { backgroundColor: "#1475EE", borderColor: "#1475EE", shadowColor: "#1475EE", shadowOpacity: 0.22, shadowRadius: 6, elevation: 3 }, missionToolText: { color: "#315987", fontSize: 9, fontWeight: "900" }, missionToolPrimaryText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  homeHeadingCard: { position: "absolute", top: 80, left: 18, width: 162, height: 64, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.97)", borderWidth: 1, borderColor: "#DDE8F6", shadowColor: "#173563", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 9, elevation: 5, zIndex: 22 },
  homeHeadingDial: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF3FF", borderWidth: 1, borderColor: "#D6E6FF" }, homeHeadingLabel: { color: "#7183A1", fontSize: 8, fontWeight: "900", letterSpacing: 0.7, marginTop: 1 }, homeHeadingValue: { color: "#10244B", fontSize: 25, fontWeight: "900", letterSpacing: -0.8 },
  homeStatusGroup: { flexDirection: "row", alignItems: "center", gap: 12, marginLeft: 28, marginRight: 0 },
  homeStatusBlock: { minWidth: 114, height: 42, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 13, borderRadius: 13, borderWidth: 1, shadowColor: "#173563", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 }, homeStatusBlockFirst: {}, homeStatusBlockDark: {},
  homeStatusIconCircle: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", transform: [{ scale: 1.08 }], shadowColor: "#173563", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2 }, homeStatusIconGood: { backgroundColor: "#16B980" }, homeStatusIconAlert: { backgroundColor: "#F08A24" }, homeStatusIconInfo: { backgroundColor: "#1475EE" },
  homeWatchSummary: { minWidth: 118, height: 42, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1 }, homeWatchSummaryGood: { backgroundColor: "#E9F9F1", borderColor: "#CBEFDD" }, homeWatchSummaryGoodDark: { backgroundColor: "#123C3D", borderColor: "#236363" }, homeWatchSummaryAlert: { backgroundColor: "#FFF1DF", borderColor: "#FFD5A3" }, homeWatchSummaryAlertDark: { backgroundColor: "#4B321C", borderColor: "#82562B" },
  homeWatchSummaryTitle: { color: "#536D97", fontSize: 8, fontWeight: "900", letterSpacing: 0.55 }, homeWatchSummaryTitleDark: { color: "#C9D9EF" }, homeWatchSummaryValue: { color: "#173563", fontSize: 10, fontWeight: "900", marginTop: 2 }, homeWatchSummaryValueDark: { color: "#F8FAFC" },
  homeWatchBadgeGood: { backgroundColor: "#FFFFFF", borderColor: "#DCE9E3" }, homeWatchBadgeGoodDark: { backgroundColor: "#16383D", borderColor: "#28565B" },
  homeWatchBadgeAlert: { backgroundColor: "#FFF8F0", borderColor: "#FFDEB8" }, homeWatchBadgeAlertDark: { backgroundColor: "#4B321C", borderColor: "#82562B" },
  homeWatchBadgeInfo: { backgroundColor: "#F7FAFF", borderColor: "#D8E6FA" }, homeWatchBadgeInfoDark: { backgroundColor: "#19375F", borderColor: "#315A90" },
  homeStatusHeading: { flexDirection: "row", alignItems: "center" }, homeStatusDot: { display: "none" },
  homeStatusLabelText: { color: "#173563", fontSize: 10, fontWeight: "900", letterSpacing: -0.1 }, homeStatusLabelTextDark: { color: "#F8FAFC" },
  homeStatusValue: { color: "#7183A1", fontSize: 10, fontWeight: "800", marginTop: 2, maxWidth: 86 }, homeStatusValueDark: { color: "#A9BFDE" }, homeStatusValueGood: { color: "#148263" }, homeStatusValueGoodDark: { color: "#64E0B1" }, homeStatusValueAlert: { color: "#C86412" }, homeStatusValueAlertDark: { color: "#FFC077" }, homeStatusValueInfo: { color: "#176BD1" }, homeStatusValueInfoDark: { color: "#86BEFF" },
  homeSignalsClean: { gap: 10, marginLeft: 22, padding: 0, backgroundColor: "transparent", borderWidth: 0 },
  homeSignalClean: { width: 92, minWidth: 92, height: 48, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: "#FFFFFF", borderColor: "#DDE8F7", shadowColor: "#163A6B", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 5, elevation: 2 },
  homeSignalIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  homeSignalIconLink: { backgroundColor: "#E7F8F0" }, homeSignalIconRtk: { backgroundColor: "#EAF3FF" }, homeSignalIconBattery: { backgroundColor: "#EAF3FF" }, homeSignalIconSatellite: { backgroundColor: "#EAF3FF" }, homeSignalIconMode: { backgroundColor: "#EAF3FF" },
  homeSignalLink: { borderLeftWidth: 3, borderLeftColor: "#16B980" }, homeSignalRtk: { borderLeftWidth: 3, borderLeftColor: "#1475EE" }, homeSignalBattery: { borderLeftWidth: 3, borderLeftColor: "#3B82F6" }, homeSignalSatellite: { borderLeftWidth: 3, borderLeftColor: "#0D8DB5" }, homeSignalMode: { borderLeftWidth: 3, borderLeftColor: "#7956D9" },
  homeHeader: { position: "absolute", top: 0, left: 0, right: 0, height: 64, backgroundColor: "rgba(250,252,255,0.99)", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: "#D9E3F0", zIndex: 23, shadowColor: "#10244B", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 6 }, homeHeaderDark: { backgroundColor: "#10244B", borderBottomColor: "#29446F" }, homeBrand: { flexDirection: "row", alignItems: "center", gap: 10, minWidth: 182 }, homeBrandIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#1475EE", shadowColor: "#1475EE", shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 }, homeBrandTitle: { color: "#10244B", fontSize: 19, fontWeight: "900", letterSpacing: -0.45 }, homeBrandTitleDark: { color: "#F8FAFC" }, homeSignals: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 18, padding: 4, borderRadius: 15, backgroundColor: "#EDF3FB", borderWidth: 1, borderColor: "#E1EAF5" }, homeSignalsDark: { backgroundColor: "#0C1C3B", borderColor: "#29446F" }, homeSignal: { minWidth: 76, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E1EAF5" }, homeSignalDark: { backgroundColor: "#173563", borderColor: "#29446F" }, homeSignalTitle: { color: "#486384", fontSize: 9, fontWeight: "900", letterSpacing: 0.35, textTransform: "uppercase" }, homeSignalTitleDark: { color: "#D8E6FA" }, homeSignalSub: { color: "#122750", fontSize: 10, fontWeight: "800", marginTop: 2, maxWidth: 64 }, homeSignalSubDark: { color: "#B6C6DF" }, homeDivider: { display: "none" }, homeDividerDark: { backgroundColor: "#36537B" }, homeControls: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: "auto", paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: "#D9E3F0" }, homeControlsDark: { borderLeftColor: "#29446F" }, homeControl: { height: 38, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 11, borderWidth: 1 }, homeThemeButton: { backgroundColor: "#1475EE", borderColor: "#1475EE", shadowColor: "#1475EE", shadowOpacity: 0.24, shadowRadius: 7, elevation: 3 }, homeThemeButtonDark: { backgroundColor: "#2A83F2", borderColor: "#4C9AF5" }, homeSettingsButton: { backgroundColor: "#F4F8FE", borderColor: "#D3E2FB" }, homeControlDark: { backgroundColor: "#173563", borderColor: "#29446F" }, homeControlLabel: { color: "#FFFFFF", fontSize: 9, fontWeight: "900", letterSpacing: 0.55 }, homeSettingsLabel: { color: "#173563", fontSize: 9, fontWeight: "900", letterSpacing: 0.45 }, homeSettingsLabelDark: { color: "#F8FAFC" },
  overview: { position: "absolute", top: 64, right: 0, bottom: 0, width: 410, padding: 16, overflow: "hidden", backgroundColor: "rgba(250,252,255,0.98)", borderLeftWidth: 1, borderLeftColor: "#D9E3F0", zIndex: 22 }, overviewContent: { padding: 18, paddingBottom: 34 },
  railHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, eyebrow: { color: "#6681AD", fontSize: 10, letterSpacing: 1.2, fontWeight: "800" }, missionTitle: { color: "#10244B", fontSize: 30, lineHeight: 36, fontWeight: "800", marginTop: 2, maxWidth: 215 }, liveBadge: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#E6F8F1", paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20 }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#16B980" }, liveText: { color: "#1B5360", fontSize: 11, fontWeight: "800" },
  routeMeta: { flexDirection: "row", gap: 13, marginTop: 8, paddingBottom: 7 }, meta: { flexDirection: "row", alignItems: "center", gap: 4 }, metaText: { color: "#526B93", fontSize: 11, fontWeight: "700" }, tabs: { height: 42, backgroundColor: "#EAF0F8", borderRadius: 11, padding: 3, flexDirection: "row", marginBottom: 12 }, tab: { flex: 1, justifyContent: "center", alignItems: "center", borderRadius: 8 }, tabActive: { backgroundColor: "#1475EE" }, tabText: { color: "#426189", fontSize: 12, fontWeight: "800" }, tabActiveText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  card: { borderWidth: 1, borderColor: "#DDE7F3", borderRadius: 15, padding: 13, marginTop: 8 }, missionActivityCard: { flex: 1, minHeight: 0, padding: 14, overflow: "hidden", backgroundColor: "#FCFDFF", shadowColor: "#315987", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 }, cardHeading: { flexDirection: "row", alignItems: "center", gap: 7 }, cardTitle: { color: "#152A50", fontWeight: "800", fontSize: 15, flex: 1 },
  liveNow: { color: "#13A978", fontSize: 10, fontWeight: "900", letterSpacing: 0.6 }, telemetryRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 }, telemetry: { width: "24%", alignItems: "center" }, telemetryValue: { color: "#1A3159", fontWeight: "800", fontSize: 11, marginTop: 5, maxWidth: 78 }, telemetryLabel: { color: "#7183A1", fontSize: 9, marginTop: 2 },
  activityHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, activityTitleGroup: { flexDirection: "row", alignItems: "center", gap: 10 }, activityTitle: { color: "#10244B", fontSize: 16, fontWeight: "900" }, activityTitleIcon: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#1475EE", shadowColor: "#1475EE", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 7, elevation: 3 }, activityHeaderActions: { flexDirection: "row", alignItems: "center", gap: 6 }, activityStateBadge: { minWidth: 58, height: 28, paddingHorizontal: 9, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1 }, activityStateLive: { backgroundColor: "#E9F9F2", borderColor: "#C8EEDD" }, activityStateDemo: { backgroundColor: "#FFF5DF", borderColor: "#FFE1A8" }, activityStateDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#16B980" }, activityStateDotDemo: { backgroundColor: "#E89A24" }, activityStateText: { color: "#148263", fontSize: 9, fontWeight: "900", letterSpacing: 0.6 }, activityStateTextDemo: { color: "#B66A06" }, editAllButton: { height: 30, paddingHorizontal: 9, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: "#EEF5FF", borderWidth: 1, borderColor: "#D2E4FB" }, editAllButtonActive: { backgroundColor: "#1475EE", borderColor: "#1475EE" }, editAllText: { color: "#1475EE", fontSize: 8, fontWeight: "900" }, editAllTextActive: { color: "#FFFFFF" },
  activitySummary: { height: 40, flexDirection: "row", alignItems: "center", marginTop: 10, paddingHorizontal: 11, borderRadius: 12, backgroundColor: "#F5F8FC", borderWidth: 1, borderColor: "#E0E9F4" }, activitySummaryItem: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, activitySummaryValue: { color: "#36567F", fontSize: 10, fontWeight: "900" }, activitySummaryDivider: { width: 1, height: 20, backgroundColor: "#D8E3EF" },
  activityListHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginBottom: 6, paddingHorizontal: 2 }, activityListTitle: { color: "#48678F", fontSize: 9, fontWeight: "900", letterSpacing: 0.95 },
  activityPointList: { flex: 1, minHeight: 104, borderRadius: 14, borderWidth: 1, borderColor: "#E1E9F3", backgroundColor: "#F7F9FC" }, activityPointListContent: { padding: 6, gap: 5 }, activityPointRow: { minHeight: 86, flexDirection: "row", alignItems: "stretch", gap: 7, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: "#E5EBF2", backgroundColor: "#FFFFFF" }, activityPointRail: { width: 27, alignItems: "center" }, activityPointIndex: { width: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F6FD", borderWidth: 1, borderColor: "#BFD7F5" }, activityPointIndexText: { color: "#1475EE", fontSize: 8, fontWeight: "900" }, activityPointConnector: { width: 1, flex: 1, minHeight: 32, marginTop: 4, backgroundColor: "#D6E2F0" }, activityPointDetails: { flex: 1, minWidth: 0 }, activityPointTopline: { minHeight: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 }, activityPointTitle: { color: "#203B62", fontSize: 10, fontWeight: "900" }, activityDistanceBadge: { maxWidth: 76, minHeight: 19, paddingHorizontal: 6, borderRadius: 7, flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F1F5FA" }, activityPointDistanceText: { color: "#60799D", fontSize: 7, fontWeight: "800", flexShrink: 1 }, activityCoordinates: { flexDirection: "row", alignItems: "center", marginTop: 5, paddingVertical: 4 }, activityCoordinateBlock: { flex: 1, minWidth: 0 }, activityCoordinateLabel: { color: "#94A2B5", fontSize: 6, fontWeight: "900", letterSpacing: 0.45 }, activityCoordinateValue: { color: "#456184", fontSize: 9, fontWeight: "800", marginTop: 2 }, activityCoordinateDivider: { width: 1, height: 20, marginHorizontal: 5, backgroundColor: "#E1E7EF" }, activityPointActions: { width: 44, gap: 4 }, activityPointAction: { flex: 1, minHeight: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", gap: 1, backgroundColor: "#F2F7FD", borderWidth: 1, borderColor: "#DDE9F8" }, activityPointDelete: { backgroundColor: "#FFF8F7", borderColor: "#F7DFDB" }, activityPointActionText: { color: "#2878D8", fontSize: 7, fontWeight: "900" }, activityPointDeleteText: { color: "#CA554D", fontSize: 7, fontWeight: "900" },
  activityPointIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", alignSelf: "center", backgroundColor: "#1475EE" }, activityPointIconText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" }, activityPointSequence: { color: "#203B62", fontSize: 11, fontWeight: "900" }, activityCoordinateLine: { color: "#60799D", fontSize: 8, fontWeight: "800", lineHeight: 16 }, activityCoordinatePair: { flexDirection: "row", alignItems: "center" }, activityCoordinateItem: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 4 }, activityPointDistanceBottom: { alignSelf: "flex-start", marginTop: 5 },
  expandPointsButton: { minHeight: 52, paddingHorizontal: 10, borderRadius: 14, backgroundColor: "#1475EE", flexDirection: "row", alignItems: "center", gap: 9, shadowColor: "#1475EE", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 }, expandPointsIcon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.24)" }, expandPointsText: { flex: 1, color: "#FFFFFF", fontSize: 12, fontWeight: "900", letterSpacing: 0.2 }, disabled: { opacity: 0.45 },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 9 }, actionButtonHalf: { flex: 1, marginTop: 0 },
  pointsPanel: { position: "absolute", right: 16, bottom: 16, zIndex: 26, borderRadius: 20, overflow: "hidden", backgroundColor: "rgba(250,252,255,0.99)", borderWidth: 1, borderColor: "#D8E5F5", shadowColor: "#10244B", shadowOffset: { width: -7, height: 5 }, shadowOpacity: 0.22, shadowRadius: 22, elevation: 14 }, pointsPanelHeader: { minHeight: 66, paddingHorizontal: 14, paddingVertical: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#E0EAF6", backgroundColor: "#F6FAFF" }, expandedActivityTitle: { flexDirection: "row", alignItems: "center", gap: 9 }, expandedActivityIcon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#1475EE" }, pointsPanelHeaderActions: { flexDirection: "row", alignItems: "center", gap: 7 }, pointsPanelTitle: { color: "#142B54", fontSize: 15, fontWeight: "900" }, pointsPanelSub: { color: "#7084A2", fontSize: 9, fontWeight: "700", marginTop: 3 }, pointsPanelClose: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: "#E8F1FF" }, pointsPanelList: { padding: 9, gap: 7, flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start" }, pointRow: { minHeight: 98, flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 9, borderRadius: 12, borderWidth: 1, borderColor: "#E5EBF2", backgroundColor: "#FFFFFF" }, pointIndex: { width: 29, height: 29, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F6FD", borderWidth: 1, borderColor: "#BFD7F5" }, pointIndexText: { color: "#1475EE", fontSize: 9, fontWeight: "900" }, pointDetails: { flex: 1, minWidth: 0 }, pointTitle: { color: "#203B62", fontSize: 11, fontWeight: "900", marginBottom: 3 }, pointCoordinate: { color: "#60799D", fontSize: 8, fontWeight: "800", lineHeight: 15 }, pointCoordinatePair: { flexDirection: "row", alignItems: "center" }, pointCoordinateItem: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 4 }, pointCoordinateLabel: { color: "#94A2B5", fontSize: 7, fontWeight: "900" }, pointCoordinateValue: { color: "#456184", fontSize: 9, fontWeight: "800", marginTop: 0 }, pointCoordinateDivider: { width: 1, height: 18, marginHorizontal: 6, backgroundColor: "#E1E7EF" }, pointDistance: { alignSelf: "flex-start", minHeight: 20, paddingHorizontal: 6, borderRadius: 7, flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5, backgroundColor: "#F1F5FA" }, pointDistanceText: { color: "#60799D", fontSize: 7, fontWeight: "800", flexShrink: 1 }, pointActions: { width: 48, gap: 5 }, pointAction: { minHeight: 34, borderRadius: 9, alignItems: "center", justifyContent: "center", gap: 1, backgroundColor: "#F2F7FD", borderWidth: 1, borderColor: "#DDE9F8" }, pointActionText: { color: "#2878D8", fontSize: 6, fontWeight: "900" }, pointDeleteAction: { backgroundColor: "#FFF8F7", borderColor: "#F7DFDB" }, pointDeleteText: { color: "#CA554D", fontSize: 6, fontWeight: "900" }, previewAction: { backgroundColor: "#F4F6F9", borderColor: "#E1E6ED" }, previewActionText: { color: "#8EA0B8" },
  pointIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", alignSelf: "center", backgroundColor: "#1475EE" }, pointIconText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" }, pointTopline: { minHeight: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 }, pointSequence: { color: "#203B62", fontSize: 12, fontWeight: "900" }, pointDistanceTop: { marginTop: 0 },
  readableHomePointRow: { minHeight: 62, paddingVertical: 6, alignItems: "center" }, readableHomePointIcon: { width: 32, height: 32, borderRadius: 16 }, readableExpandedPointRow: { minHeight: 96, paddingVertical: 9, alignItems: "center" }, readableExpandedPointIcon: { width: 36, height: 36, borderRadius: 18 }, readablePointNumber: { fontSize: 10 }, readableCoordinateLabel: { fontSize: 7, letterSpacing: 0.45 }, readableCoordinateValue: { fontSize: 9, marginTop: 0 }, readableDistanceText: { fontSize: 8 }, readableActionText: { fontSize: 8 }, pointDataCentered: { justifyContent: "center" },
  activityScreen: { ...StyleSheet.absoluteFillObject, backgroundColor: "transparent", zIndex: 24 },
  deckTopbar: { position: "absolute", top: 18, left: 20, right: 20, height: 64, borderRadius: 8, backgroundColor: "rgba(250,252,255,0.99)", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#D9E3F0", shadowColor: "#10244B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 8, zIndex: 35 },
  topHudLeftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topHudBrandWrap: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 9,
    backgroundColor: "#F4F8FE",
    borderWidth: 1,
    borderColor: "#D3E2FB",
    borderRadius: 6,
  },
  topHudBrandIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#1475EE",
    alignItems: "center",
    justifyContent: "center",
  },
  topHudLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  topHudBrandText: {
    color: "#10244B",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  topHudRtkPill: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#DDE7F3",
  },
  topHudRtkText: {
    fontSize: 11.5,
    fontWeight: "500",
  },
  topHudSensorsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topHudSensorBadge: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE7F3",
    borderRadius: 6,
  },
  topHudBatteryBadge: {},
  topHudDynamicsBadge: {},
  topHudSensorVal: {
    fontSize: 11.5,
    fontWeight: "500",
  },
  topHudBatterySegmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginRight: 2,
  },
  topHudBatterySeg: {
    width: 5,
    height: 12,
    borderRadius: 1.5,
  },
  topHudUnitToggleHint: {
    fontSize: 10,
    color: "#7183A1",
    marginHorizontal: 2,
    fontWeight: "500",
  },
  topHudCenterGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  topHudDistOdometer: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE7F3",
    borderRadius: 6,
    paddingHorizontal: 6,
    gap: 8,
  },
  topHudDistSegment: {
    alignItems: "center",
    paddingHorizontal: 6,
  },
  topHudDistLabel: {
    fontSize: 9,
    color: "#536D97",
    fontWeight: "400",
    letterSpacing: 0.5,
  },
  topHudDistVal: {
    fontSize: 12.5,
    color: "#10244B",
    fontWeight: "500",
  },
  topHudDistSep: {
    width: 1,
    height: 20,
    backgroundColor: "#D8E3EF",
  },
  topHudModeBadgePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#D2E4FB",
  },
  topHudModeBadgeText: {
    fontSize: 9,
    color: "#1475EE",
    fontWeight: "500",
  },
  topHudTargetCapsule: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#D2E4FB",
  },
  topHudTargetText: {
    fontSize: 11.5,
    color: "#1475EE",
    fontWeight: "500",
  },
  deckCloseBtn: {
    width: 40,
    height: 44,
    borderRadius: 6,
    backgroundColor: "#F4F8FE",
    borderWidth: 1,
    borderColor: "#D3E2FB",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
  },

  /* Interactive Top HUD Modal / Popover */
  hudModalOverlay: {
    position: "absolute",
    top: 90,
    left: 20,
    right: 20,
    alignItems: "center",
    zIndex: 50,
  },
  hudModalCard: {
    width: 520,
    maxWidth: "92%",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    padding: 14,
    shadowColor: "#0B1C3B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 12,
  },
  hudModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    marginBottom: 10,
  },
  hudModalHeaderTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  hudModalHeaderTitle: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  hudModalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  hudModalGridItem: {
    width: "48%",
    backgroundColor: "#F8FAFC",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 8,
  },
  hudModalGridLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "400",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  hudModalGridVal: {
    color: "#0F172A",
    fontSize: 11.5,
    fontWeight: "500",
  },

  floatingMapCallout: { position: "absolute", bottom: 236, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.98)", borderWidth: 1, borderColor: "#CBD5E1", shadowColor: "#0B1C3B", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 14, elevation: 8, zIndex: 25 },
  floatingCalloutIcon: { width: 32, height: 32, borderRadius: 6, backgroundColor: "#EAF3FF", alignItems: "center", justifyContent: "center" },
  floatingCalloutTitle: { color: "#0F172A", fontSize: 12, fontWeight: "500" },
  floatingCalloutSub: { color: "#1475EE", fontSize: 11, fontWeight: "500" },
  floatingCalloutBadge: { backgroundColor: "#1475EE", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginLeft: 4 },
  floatingCalloutBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "500" },

  /* Bottom Operations Deck (3-Section Zero-Gap Layout) */
  bottomDeckContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    zIndex: 30,
  },

  colEyebrowMinimal: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "500",
  },

  /* Middle Column: Route Progress & Waypoint Stepper (Height: 216px with 124px tall points cards) */
  deckColMiddleCard: {
    flex: 1,
    height: 216,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE7F3",
    borderRadius: 8,
    padding: 12,
    justifyContent: "space-between",
    shadowColor: "#10244B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 8,
    overflow: "visible",
  },
  progressHeaderRowMinimal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressWpStatusText: {
    color: "#10244B",
    fontSize: 13,
    fontWeight: "500",
  },
  progressPercentBadgeMinimal: {
    backgroundColor: "#EEF5FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D2E4FB",
  },
  progressPercentBadgeTextMinimal: {
    color: "#1475EE",
    fontSize: 12,
    fontWeight: "500",
  },
  progressBarTrackMinimal: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
    marginVertical: 4,
  },
  progressBarFillMinimal: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#1475EE",
  },
  deckStepperScrollMinimal: {
    alignItems: "center",
    gap: 16,
    paddingVertical: 4,
  },

  /* Taller Boxy Waypoint Stepper Cards with Colored Sub-Block (Height: 124px, No Bold) */
  stepCapsuleChip: {
    height: 124,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE7F3",
    borderRadius: 8,
    padding: 7,
    justifyContent: "space-between",
    shadowColor: "#10244B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  stepCapsuleChipDone: {
    height: 124,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE7F3",
    borderRadius: 8,
    padding: 7,
    justifyContent: "space-between",
    shadowColor: "#10244B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  stepCapsuleChipActive: {
    height: 124,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#1475EE",
    borderRadius: 8,
    padding: 7,
    justifyContent: "space-between",
    shadowColor: "#1475EE",
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 4,
  },
  stepCapsuleChipPending: {
    height: 124,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 7,
    justifyContent: "space-between",
    opacity: 0.9,
  },
  stepChipSelected: {
    borderColor: "#1475EE",
    borderWidth: 2,
  },
  stepCardTopMinimal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    marginBottom: 4,
  },
  stepCardWpNum: {
    color: "#10244B",
    fontSize: 12.5,
    fontWeight: "500",
  },
  stepCardDotBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCardDotText: {
    fontSize: 9.5,
    fontWeight: "500",
  },
  stepCardSubBlock: {
    width: "100%",
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  stepCardSubBlockAcc: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: -0.2,
  },
  stepCardSubBlockRemark: {
    color: "#FFFFFF",
    fontSize: 11.5,
    fontWeight: "500",
    opacity: 0.95,
  },
  progressWpCompletedBadge: {
    backgroundColor: "#E8F8F0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#A7E8C4",
  },
  progressWpCompletedText: {
    color: "#148263",
    fontSize: 10.5,
    fontWeight: "500",
  },
  trackWrapper: {
    position: "relative",
    width: "100%",
    marginVertical: 4,
  },
  trackMilestonesRow: {
    position: "absolute",
    top: -6,
    left: 2,
    right: 2,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  milestoneDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  milestoneDotDone: {
    backgroundColor: "#16B980",
    borderColor: "#FFFFFF",
  },
  milestoneDotActive: {
    backgroundColor: "#1475EE",
    borderColor: "#FFFFFF",
    transform: [{ scale: 1.2 }],
    shadowColor: "#1475EE",
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  milestoneDotText: {
    fontSize: 9,
    color: "#536D97",
    fontWeight: "500",
  },
  milestoneDotTextWhite: {
    color: "#FFFFFF",
  },
  cleanModeBtn: {
    width: "100%",
    height: 42,
    borderRadius: 6,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#DDE7F3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  cleanModeBtnText: {
    color: "#536D97",
    fontSize: 11.5,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  stepCapsuleTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  stepCapsuleWpNum: {
    color: "#0F172A",
    fontSize: 12.5,
    fontWeight: "500",
  },
  stepCapsuleCheckText: {
    color: "#10B981",
    fontSize: 11,
    fontWeight: "500",
  },
  stepBoxyCheckBadge: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBoxyCoordsText: {
    color: "#475569",
    fontSize: 9.5,
    fontFamily: "monospace",
    fontWeight: "400",
    paddingHorizontal: 2,
  },
  stepHeroAccRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    paddingVertical: 1,
  },
  stepHeroAccValDone: {
    fontSize: 15,
    fontWeight: "500",
    color: "#148263",
    letterSpacing: -0.2,
  },
  stepHeroAccValActive: {
    fontSize: 15,
    fontWeight: "500",
    color: "#1475EE",
    letterSpacing: -0.2,
  },
  stepHeroAccValPending: {
    fontSize: 15,
    fontWeight: "500",
    color: "#64748B",
    letterSpacing: -0.2,
  },
  stepHeroAccUnit: {
    fontSize: 11,
    fontWeight: "400",
    color: "#536D97",
  },
  stepAccGradeBadge: {
    fontSize: 8.5,
    fontWeight: "500",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: "#E9F9F1",
    color: "#148263",
    marginLeft: "auto",
  },
  stepHeroRemark: {
    fontSize: 12.5,
    fontWeight: "400",
    color: "#10244B",
    paddingHorizontal: 2,
  },
  stepHeroRemarkActive: {
    fontSize: 12.5,
    fontWeight: "400",
    color: "#1475EE",
    paddingHorizontal: 2,
  },
  stepHeroRemarkPending: {
    fontSize: 12.5,
    fontWeight: "400",
    color: "#64748B",
    paddingHorizontal: 2,
  },
  stepCapsuleRemark: {
    color: "#64748B",
    fontSize: 9.5,
    fontWeight: "400",
    fontStyle: "italic",
    paddingHorizontal: 2,
  },
  stepCapsuleBadge: {
    height: 24,
    borderRadius: 6,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  stepCapsuleBadgeText: {
    color: "#FFFFFF",
    fontSize: 9.5,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  stepCapsuleWpNumActive: {
    color: "#0284C7",
    fontSize: 12.5,
    fontWeight: "500",
  },
  stepBoxyActiveDotBadge: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
  },
  stepCapsuleActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0284C7",
  },
  stepCapsuleRemarkActive: {
    color: "#0369A1",
    fontSize: 9.5,
    fontWeight: "400",
    paddingHorizontal: 2,
  },
  stepCapsuleWpNumPending: {
    color: "#64748B",
    fontSize: 12.5,
    fontWeight: "400",
  },
  stepCapsulePendingIndex: {
    color: "#94A3B8",
    fontSize: 9.5,
    fontWeight: "400",
  },
  stepCapsuleRemarkPending: {
    color: "#94A3B8",
    fontSize: 9.5,
    fontWeight: "400",
    paddingHorizontal: 2,
  },
  stepCapsuleBadgeTextPending: {
    color: "#64748B",
    fontSize: 9.5,
    fontWeight: "500",
    letterSpacing: 0.3,
  },

  /* Legacy Chip Fallbacks for safety */
  stepCompletedChip: {
    height: 82,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderRadius: 8,
    padding: 6,
    justifyContent: "space-between",
  },
  stepActiveTargetChip: {
    height: 82,
    backgroundColor: "#F0F9FF",
    borderWidth: 2,
    borderColor: "#0284C7",
    borderRadius: 8,
    padding: 6,
    justifyContent: "space-between",
  },
  stepPendingChip: {
    height: 82,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    padding: 6,
    justifyContent: "space-between",
    opacity: 0.85,
  },

  /* Waypoint Inspection Banner (on tapping a point) */
  pointInspectionBanner: {
    position: "absolute",
    bottom: 216,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    padding: 10,
    shadowColor: "#0B1C3B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 35,
  },
  pointInspectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  pointInspectionTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inspectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pointInspectionTitle: {
    color: "#0F172A",
    fontSize: 10,
    fontWeight: "500",
  },
  inspectionTierBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  inspectionTierText: {
    fontSize: 8,
    fontWeight: "500",
  },
  pointInspectionBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inspectionItem: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "400",
  },
  inspectionDivider: {
    color: "#94A3B8",
    fontSize: 9,
  },

  /* Right Column: Base Card (height: 204) + Upward Zero-Gap Drawer (width: 340) */
  deckColRightWrap: {
    width: 340,
    flexShrink: 0,
    justifyContent: "flex-end",
  },
  controlZeroGapDrawer: {
    backgroundColor: "rgba(255,255,255,0.99)",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "#CBD5E1",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    padding: 12,
    gap: 8,
    shadowColor: "#0B1C3B",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  drawerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  drawerTitle: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  drawerCloseText: {
    color: "#1475EE",
    fontSize: 10,
    fontWeight: "500",
  },
  drawerRectRow: {
    flexDirection: "row",
    gap: 8,
    height: 56,
  },
  actionBtnRectSkip: {
    flex: 1,
    height: 56,
    borderRadius: 8,
    backgroundColor: "#1475EE",
    borderWidth: 1,
    borderColor: "#1162C9",
    borderBottomWidth: 3,
    borderBottomColor: "#0C4EA3",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 8,
    shadowColor: "#1475EE",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  actionBtnRectMode: {
    flex: 1,
    height: 56,
    borderRadius: 8,
    backgroundColor: "#7956D9",
    borderWidth: 1,
    borderColor: "#6544BE",
    borderBottomWidth: 3,
    borderBottomColor: "#51349E",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 8,
    shadowColor: "#7956D9",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  actionBtnRectHome: {
    width: "100%",
    height: 52,
    borderRadius: 8,
    backgroundColor: "#0D8DB5",
    borderWidth: 1,
    borderColor: "#0A7394",
    borderBottomWidth: 3,
    borderBottomColor: "#075973",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
    shadowColor: "#0D8DB5",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  btnRectIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  btnRectTextCol: {
    flex: 1,
    justifyContent: "center",
  },
  btnRectTextColHoriz: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  btnRectMainText: {
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "500",
    letterSpacing: 0.4,
  },
  btnRectSubText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 9,
    fontWeight: "400",
    letterSpacing: 0.3,
  },
  btnRectStopSubText: {
    color: "#FEE2E2",
    fontSize: 10,
    fontWeight: "500",
    backgroundColor: "rgba(0,0,0,0.18)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },

  /* Base Operations Card (Height: 216px with Chunky Rectangular Buttons) */
  deckRightBaseCard: {
    height: 216,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE7F3",
    borderRadius: 8,
    padding: 12,
    justifyContent: "space-between",
    shadowColor: "#10244B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 8,
  },
  deckBaseCardMergedTop: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  baseCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 2,
  },
  baseCardTitle: {
    color: "#536D97",
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.6,
  },
  expandCuePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 4,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#D2E4FB",
  },
  expandCueText: {
    color: "#1475EE",
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  baseStatusPill: {
    height: 24,
    borderRadius: 4,
    backgroundColor: "#F7FAFF",
    borderWidth: 1,
    borderColor: "#D5E3F5",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 6,
  },
  baseStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16B980",
  },
  baseStatusText: {
    color: "#173563",
    fontSize: 9,
    fontWeight: "500",
    letterSpacing: 0.3,
  },

  /* Rectangular Push-Buttons Container */
  rectButtonsContainer: {
    flex: 1,
    gap: 9,
    justifyContent: "center",
  },
  startPauseRectRow: {
    flexDirection: "row",
    gap: 9,
    height: 68,
  },
  actionBtnRectStart: {
    flex: 1,
    height: 68,
    borderRadius: 8,
    backgroundColor: "#16B980",
    borderWidth: 1,
    borderColor: "#148263",
    borderBottomWidth: 3,
    borderBottomColor: "#0D684D",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
    shadowColor: "#16B980",
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
  },
  actionBtnRectPause: {
    flex: 1,
    height: 68,
    borderRadius: 8,
    backgroundColor: "#F08A24",
    borderWidth: 1,
    borderColor: "#C86412",
    borderBottomWidth: 3,
    borderBottomColor: "#9A4C0B",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
    shadowColor: "#F08A24",
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
  },
  actionBtnRectResume: {
    backgroundColor: "#1475EE",
    borderColor: "#1162C9",
    borderBottomColor: "#0C4EA3",
    shadowColor: "#1475EE",
  },
  actionBtnRectStop: {
    width: "100%",
    height: 62,
    borderRadius: 8,
    backgroundColor: "#D94A42",
    borderWidth: 1,
    borderColor: "#C43C34",
    borderBottomWidth: 3,
    borderBottomColor: "#9B2E28",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#D94A42",
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
  },

  /* Layout B: Hero Master Button + Sub Row Styles */
  heroBtnStartMaster: {
    width: "100%",
    height: 66,
    borderRadius: 8,
    backgroundColor: "#16B980",
    borderWidth: 1,
    borderColor: "#148263",
    borderBottomWidth: 3,
    borderBottomColor: "#0D684D",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    shadowColor: "#16B980",
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
  },
  heroBtnStopMaster: {
    width: "100%",
    height: 66,
    borderRadius: 8,
    backgroundColor: "#D94A42",
    borderWidth: 1,
    borderColor: "#C43C34",
    borderBottomWidth: 3,
    borderBottomColor: "#9B2E28",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    shadowColor: "#D94A42",
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
  },
  heroBtnTextRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroBtnMainTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  heroBtnSubBadge: {
    backgroundColor: "rgba(0,0,0,0.18)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  heroBtnSubText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 9.5,
    fontWeight: "400",
    letterSpacing: 0.3,
  },
  subRowContainer: {
    flexDirection: "row",
    gap: 8,
    height: 50,
  },
  subBtnPause: {
    flex: 1,
    height: 50,
    borderRadius: 6,
    backgroundColor: "#F08A24",
    borderWidth: 1,
    borderColor: "#C86412",
    borderBottomWidth: 2.5,
    borderBottomColor: "#9A4C0B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#F08A24",
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 3,
  },
  subBtnResume: {
    backgroundColor: "#1475EE",
    borderColor: "#1162C9",
    borderBottomColor: "#0C4EA3",
    shadowColor: "#1475EE",
  },
  subBtnSkip: {
    flex: 1,
    height: 50,
    borderRadius: 6,
    backgroundColor: "#1475EE",
    borderWidth: 1,
    borderColor: "#1162C9",
    borderBottomWidth: 2.5,
    borderBottomColor: "#0C4EA3",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#1475EE",
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 3,
  },
  subBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.4,
  },
});
