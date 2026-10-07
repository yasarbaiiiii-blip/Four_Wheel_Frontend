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
  View,
  StyleSheet,
  StatusBar,
  Text,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
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
  releaseEmergencyStop,
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
import { pauseReasonText } from "../utils/pauseReasonPresentation";
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
  type MissionRuntimeState,
  type CanonicalMissionReport,
  type RawGnssSurveySnapshot,
} from "../services/missionApi";
import * as FileSystem from "expo-file-system/legacy";

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

interface MissionReportScreenProps {
  isVisible?: boolean;
  embedMap?: boolean;
  /** Opens the existing route-authoring tools inside the unified workspace. */
  onOpenPlan?: () => void;
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
    refreshNow,
  } = useBackendTrajectory();
  const { services, connectionState } = useConnection();

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
  const backendMissionRef = useRef<MissionRuntimeState | null>(null);
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
    (mission: MissionRuntimeState | null | undefined) => {
      const incoming = mission ?? null;
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
      const current = backendMissionRef.current;
      const incomingId = String(incoming.mission_id ?? "").trim();
      const currentId = String(current?.mission_id ?? "").trim();
      const incomingRun = String(incoming.mission_run_id ?? "").trim();
      const currentRun = String(current?.mission_run_id ?? "").trim();
      if (current && ((currentId && incomingId && currentId !== incomingId) ||
        (currentRun && incomingRun && currentRun !== incomingRun))) return;

      lastSocketMissionStatusAtRef.current = Date.now();
      setBackendMission(incoming);
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

  const effectiveWaitingForManual =
    backendMissionState === "WAITING_FOR_NEXT" ||
    String(screenTelemetry.missionStatus ?? "")
      .trim()
      .toUpperCase() === "WAITING_FOR_NEXT" ||
    waitingForManual ||
    px4WaitingForContinue ||
    (verifiedCtx.isLoaded && verifiedWaiting);

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
      const response = await getMissionStatus();

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

      setBackendMission(mission);

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
        state === "ERROR"
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

      if (!response.success) {
        return {
          success: false,
          message:
            response.mission?.message || "Backend rejected execution mode.",
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

    if (authoringChanged) {
      return {
        success: false,
        message: "Wait for the automatic path update to finish before starting this mission.",
      };
    }

    if (startInFlightRef.current) {
      return {
        success: false,
        message: "Mission start is already in progress.",
      };
    }
    startInFlightRef.current = true;

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

      // Previous Complete/Stop latches the shared STOP contract.
      // That latch is not always visible as emergency_stop=true, so
      // Start must always RELEASE before POST /api/mission/start.
      try {
        await releaseEmergencyStop();
        logMissionStartTiming(attemptId, "estop_release");
      } catch (releaseError) {
        logMissionStartTiming(attemptId, "estop_release", "failed");
        console.log(
          "[MissionReportScreen] Pre-start E-stop release skipped/failed:",
          releaseError,
        );
      }

      logMissionStartTiming(attemptId, "start_post_sent");
      const response = await startMission(latestMission?.mission_id);
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

      clearCurrentMissionData();

      // The backend response is synchronized with Mission Manager's
      // acknowledged START status, so it is authoritative on its own:
      // no follow-up GET and no automatic RESUME. Socket.IO confirms
      // independently.
      const startedMission = response.mission;
      setBackendMission(startedMission);
      const startOutcome = classifyMissionStartOutcome({
        state: startedMission?.state,
        pauseReason: startedMission?.pause_reason,
      });
      logMissionStartTiming(
        attemptId,
        "backend_phase",
        `start_outcome=${startOutcome.kind}`,
      );

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
    }
  };

  const handlePause = async () => {
    try {
      console.log("[MissionReportScreen] Pausing mission...");

      const response = await pauseMission();

      setBackendMission(response.mission);

      if (response.success) {
        // A paused mission is still an active mission.
        setIsMissionActive(true);

        showNotification(
          "success",
          "Mission Paused",
          response.mission.message || "Mission paused successfully.",
        );
      }

      return response;
    } catch (error) {
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

      setBackendMission(response.mission);

      if (response.success) {
        setIsMissionActive(true);

        showNotification(
          "success",
          "Mission Resumed",
          response.mission.message || "Mission resumed successfully.",
        );
      }

      return response;
    } catch (error) {
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
    try {
      console.log("[MissionReportScreen] Stopping mission...");

      const response = await stopMission();

      setBackendMission(response.mission);

      if (response.success) {
        setCurrentIndex(null);
        setIsMissionActive(false);
        setWaitingForManual(false);

        preserveCurrentMission.current();

        showNotification(
          "success",
          "Mission Stopped",
          response.mission.message || "Mission stopped successfully.",
        );
      }

      return response;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to stop mission.";

      console.error("[MissionReportScreen] Stop failed:", error);

      void refreshBackendMission();

      showNotification("error", "Stop Failed", message, 5000);

      return {
        success: false,
        message,
      };
    }
  };

  const handleNext = async () => {
    try {
      console.log("[MissionReportScreen] Moving to next marking point...");

      const response = await nextMissionPoint();

      setBackendMission(response.mission);

      if (response.success) {
        setWaitingForManual(false);

        showNotification(
          "success",
          "Next Marking Point",
          response.mission.message || "Moving to the next marking point.",
        );
      }

      return response;
    } catch (error) {
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
    try {
      console.log("[MissionReportScreen] Skipping current marking point...");

      const response = await skipMissionPoint();

      setBackendMission(response.mission);

      if (response.success) {
        showNotification(
          "success",
          "Marking Point Skipped",
          response.mission.message || "Current marking point was skipped.",
        );
      }

      return response;
    } catch (error) {
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

  const handleClearMission = async () => {
    try {
      console.log("[MissionReportScreen] Clearing mission...");
      await clearMission();
      clearRetainedMission();
      setBackendMission(null);
      verifiedCtx.clearLoadedMission();
      resetVerifiedProgress();
      showNotification("success", "Cleared", "Mission cleared from controller");
    } catch (err) {
      console.error("[MissionReportScreen] Clear mission error:", err);
      showNotification("error", "Clear Failed", String(err));
    }
  };

  const handleExport = () => {
    console.log("[MissionReportScreen] Export report triggered");
  };

  const fetchCanonicalExportData = useCallback(async () => {
    const response = await getMissionReport();
    if (!response?.success || response.available !== true || !response.report) {
      return null;
    }
    return projectCanonicalReportForExport(response.report);
  }, []);

  // Handle export completion - prompt user to clear logs or keep for review
  const handleExportComplete = () => {
    console.log(
      "[MissionReportScreen] 📤 Export completed - showing clear logs prompt",
    );
    // Show dialog asking if user wants to clear mission logs
    setShowClearLogsDialog(true);
  };

  // User confirmed to clear logs after export
  const handleClearLogsAfterExport = async () => {
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
          activeWaypointIndex={effectiveCurrentIndex}
          statusMap={displayData.statusMap}
          edgeToEdge
          isVisible={isVisible}
        />
        )}
      </View>

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

      {useMissionActivityExperience && (
        <MissionActivityExperience
          waypoints={displayData.waypoints}
          statusMap={displayData.statusMap}
          currentIndex={effectiveCurrentIndex}
          markedPoints={missionProgressStats.markedPoints}
          totalPoints={missionProgressStats.totalPoints}
          isMissionActive={effectiveMissionActive}
          isMissionPaused={isBackendMissionPaused}
          canStart={canStartMission}
          isPreparing={isPreparingMission}
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onOpenPlan={onOpenPlan ?? (() => undefined)}
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
      />

      {/* Clear Logs After Export Dialog */}
      <LogClearDialog
        visible={showClearLogsDialog}
        onConfirm={handleClearLogsAfterExport}
        onCancel={handleKeepLogsAfterExport}
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

type CommandWaypointStatus = { status?: string } | undefined;

interface MissionActivityExperienceProps {
  waypoints: Waypoint[];
  statusMap: Record<number, CommandWaypointStatus>;
  currentIndex: number | null;
  markedPoints: number;
  totalPoints: number;
  isMissionActive: boolean;
  isMissionPaused: boolean;
  canStart: boolean;
  isPreparing: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onOpenPlan: () => void;
}

function selectCommandTelemetry(snapshot: LiveTelemetrySnapshot) {
  const telemetry = snapshot.telemetry;
  return {
    connected: snapshot.connectionState === "connected",
    battery: telemetry.battery?.percentage ?? null,
    speed: telemetry.global?.vel ?? telemetry.rpp_actual_speed_mps ?? null,
    heading: telemetry.attitude?.yaw_deg ?? null,
    fixType: telemetry.rtk?.fix_type ?? 0,
    satellites: telemetry.global?.satellites_visible ?? null,
    mode: telemetry.state?.mode ?? "—",
  };
}

function commandRtkLabel(fixType: number): string {
  if (fixType >= 6) return "RTK Fixed";
  if (fixType === 5) return "RTK Float";
  if (fixType >= 3) return "GPS Fix";
  return "GPS acquiring";
}

function commandValue(value: number | null, suffix: string, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(digits)}${suffix}`
    : "—";
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

function commandPointState(status: CommandWaypointStatus, index: number, currentIndex: number | null) {
  const normalized = String(status?.status ?? "").toLowerCase();
  if (["completed", "marked", "reached", "skipped"].includes(normalized)) return "complete";
  return index === currentIndex ? "active" : "pending";
}

function CommandMeta({ icon, text }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; text: string }) {
  return <View style={fieldExperienceStyles.meta}><MaterialCommunityIcons name={icon} size={15} color="#5C78A8" /><Text style={fieldExperienceStyles.metaText}>{text}</Text></View>;
}

function CommandMetric({ value, label }: { value: string; label: string }) {
  return <View style={fieldExperienceStyles.metric}><Text style={fieldExperienceStyles.metricValue}>{value}</Text><Text style={fieldExperienceStyles.metricLabel}>{label}</Text></View>;
}

function CommandTelemetry({ icon, value, label }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"]; value: string; label: string }) {
  return <View style={fieldExperienceStyles.telemetry}><MaterialCommunityIcons name={icon} size={19} color="#1475EE" /><Text style={fieldExperienceStyles.telemetryValue} numberOfLines={1}>{value}</Text><Text style={fieldExperienceStyles.telemetryLabel}>{label}</Text></View>;
}

function MissionActivityExperience({
  waypoints, statusMap, currentIndex, markedPoints, totalPoints, isMissionActive,
  isMissionPaused, canStart, isPreparing, onStart, onPause, onResume, onStop, onOpenPlan,
}: MissionActivityExperienceProps) {
  const telemetry = useLiveTelemetrySelector(selectCommandTelemetry, shallowEqual);
  const [showSettings, setShowSettings] = useState(false);
  const [isLightHeader, setIsLightHeader] = useState(true);
  // Home follows the map-first overview reference. Mission Activity opens the
  // focused detail view and its close control returns the operator here.
  const [activityMounted, setActivityMounted] = useState(false);
  const activityProgress = useRef(new Animated.Value(0)).current;
  const routeKm = useMemo(() => commandRouteKm(waypoints), [waypoints]);
  const safeTotal = Math.max(totalPoints, waypoints.length, 1);
  const safeMarked = Math.min(Math.max(markedPoints, 0), safeTotal);
  const currentPoint = Math.min(safeTotal, Math.max(1, currentIndex == null ? safeMarked + 1 : currentIndex + 1));
  const percentage = Math.round((safeMarked / safeTotal) * 100);
  const nextWaypoint = waypoints[Math.min(Math.max(currentPoint - 1, 0), Math.max(waypoints.length - 1, 0))];

  const openActivity = useCallback(() => {
    setActivityMounted(true);
    activityProgress.setValue(0);
    Animated.spring(activityProgress, {
      toValue: 1,
      tension: 68,
      friction: 9,
      useNativeDriver: true,
    }).start();
  }, [activityProgress]);
  const closeActivity = useCallback(() => {
    Animated.timing(activityProgress, {
      toValue: 0,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setActivityMounted(false);
    });
  }, [activityProgress]);
  useEffect(() => () => activityProgress.stopAnimation(), [activityProgress]);

  const transitionUp = activityProgress.interpolate({ inputRange: [0, 1], outputRange: [42, 0] });
  const homeOpacity = activityProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const homeShift = activityProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 34] });
  const homeScale = activityProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.985] });
  const detailScale = activityProgress.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] });
  return (
    <View style={fieldExperienceStyles.host} pointerEvents="box-none">
      <Animated.View style={[fieldExperienceStyles.homeHeader, !isLightHeader && fieldExperienceStyles.homeHeaderDark, { opacity: homeOpacity, transform: [{ translateX: homeShift }] }]} pointerEvents={activityMounted ? "none" : "auto"}>
        <View style={fieldExperienceStyles.homeBrand}><View style={fieldExperienceStyles.homeBrandIcon}><MaterialCommunityIcons name="map-marker-path" size={22} color="#FFFFFF" /></View><View style={fieldExperienceStyles.homeBrandCopy}><Text style={[fieldExperienceStyles.homeBrandTitle, !isLightHeader && fieldExperienceStyles.homeBrandTitleDark]}>Mission Atlas</Text><Text style={[fieldExperienceStyles.homeBrandKicker, !isLightHeader && fieldExperienceStyles.homeBrandKickerDark]}>FIELD COMMAND CENTER</Text></View><View style={[fieldExperienceStyles.homeBrandDivider, !isLightHeader && fieldExperienceStyles.homeDividerDark]} /><View><Text style={[fieldExperienceStyles.homeBrandSubtitle, !isLightHeader && fieldExperienceStyles.homeBrandSubtitleDark]}>Autonomous Rover Operations</Text><View style={fieldExperienceStyles.homeLiveLabel}><View style={[fieldExperienceStyles.homeLiveDot, { backgroundColor: telemetry.connected ? "#16B980" : "#F97316" }]} /><Text style={[fieldExperienceStyles.homeLiveText, !isLightHeader && fieldExperienceStyles.homeSignalSubDark]}>{telemetry.connected ? "SYSTEM ONLINE" : "SYSTEM OFFLINE"}</Text></View></View></View>
        <View style={[fieldExperienceStyles.homeSignals, !isLightHeader && fieldExperienceStyles.homeSignalsDark]}><View style={[fieldExperienceStyles.homeSignal, !isLightHeader && fieldExperienceStyles.homeSignalDark]}><MaterialCommunityIcons name="wifi" size={19} color={telemetry.connected ? "#16B980" : "#F97316"} /><View><Text style={[fieldExperienceStyles.homeSignalTitle, !isLightHeader && fieldExperienceStyles.homeSignalTitleDark]}>Link</Text><Text style={[fieldExperienceStyles.homeSignalSub, !isLightHeader && fieldExperienceStyles.homeSignalSubDark]}>{telemetry.connected ? "Connected" : "Offline"}</Text></View></View><View style={[fieldExperienceStyles.homeSignal, !isLightHeader && fieldExperienceStyles.homeSignalDark]}><MaterialCommunityIcons name="crosshairs-gps" size={20} color="#1475EE" /><View><Text style={[fieldExperienceStyles.homeSignalTitle, !isLightHeader && fieldExperienceStyles.homeSignalTitleDark]}>RTK</Text><Text style={[fieldExperienceStyles.homeSignalSub, !isLightHeader && fieldExperienceStyles.homeSignalSubDark]}>{commandRtkLabel(telemetry.fixType)}</Text></View></View><View style={[fieldExperienceStyles.homeSignal, !isLightHeader && fieldExperienceStyles.homeSignalDark]}><MaterialCommunityIcons name="battery" size={21} color="#1475EE" /><View><Text style={[fieldExperienceStyles.homeSignalTitle, !isLightHeader && fieldExperienceStyles.homeSignalTitleDark]}>Battery</Text><Text style={[fieldExperienceStyles.homeSignalSub, !isLightHeader && fieldExperienceStyles.homeSignalSubDark]}>{commandValue(telemetry.battery, "%", 0)}</Text></View></View><View style={[fieldExperienceStyles.homeSignal, !isLightHeader && fieldExperienceStyles.homeSignalDark]}><MaterialCommunityIcons name="satellite" size={19} color="#1475EE" /><View><Text style={[fieldExperienceStyles.homeSignalTitle, !isLightHeader && fieldExperienceStyles.homeSignalTitleDark]}>Satellite</Text><Text style={[fieldExperienceStyles.homeSignalSub, !isLightHeader && fieldExperienceStyles.homeSignalSubDark]}>{telemetry.satellites == null ? "—" : `${telemetry.satellites} visible`}</Text></View></View><View style={[fieldExperienceStyles.homeSignal, !isLightHeader && fieldExperienceStyles.homeSignalDark]}><MaterialCommunityIcons name="cog-outline" size={19} color="#1475EE" /><View><Text style={[fieldExperienceStyles.homeSignalTitle, !isLightHeader && fieldExperienceStyles.homeSignalTitleDark]}>Mode</Text><Text style={[fieldExperienceStyles.homeSignalSub, !isLightHeader && fieldExperienceStyles.homeSignalSubDark]} numberOfLines={1}>{String(telemetry.mode)}</Text></View></View></View>
        <View style={[fieldExperienceStyles.homeControls, !isLightHeader && fieldExperienceStyles.homeControlsDark]}><TouchableOpacity style={[fieldExperienceStyles.homeControl, !isLightHeader && fieldExperienceStyles.homeControlDark]} onPress={() => setIsLightHeader((value) => !value)} accessibilityRole="button" accessibilityLabel="Toggle light and dark top bar"><MaterialCommunityIcons name={isLightHeader ? "weather-night" : "white-balance-sunny"} size={20} color={isLightHeader ? "#173563" : "#F8FAFC"} /></TouchableOpacity><TouchableOpacity style={[fieldExperienceStyles.homeControl, !isLightHeader && fieldExperienceStyles.homeControlDark]} onPress={() => setShowSettings(true)} accessibilityRole="button" accessibilityLabel="Open settings"><MaterialCommunityIcons name="cog-outline" size={20} color={isLightHeader ? "#173563" : "#F8FAFC"} /></TouchableOpacity></View>
      </Animated.View>
      <Animated.View style={[fieldExperienceStyles.overview, { opacity: homeOpacity, transform: [{ translateX: homeShift }, { scale: homeScale }] }]} pointerEvents={activityMounted ? "none" : "auto"}>
        <View style={fieldExperienceStyles.railHeader}>
          <View><Text style={fieldExperienceStyles.eyebrow}>MISSION</Text><Text style={fieldExperienceStyles.missionTitle} numberOfLines={1}>Field Survey</Text></View>
          <View style={fieldExperienceStyles.liveBadge}><View style={[fieldExperienceStyles.dot, { backgroundColor: telemetry.connected ? "#16B980" : "#F97316" }]} /><Text style={fieldExperienceStyles.liveText}>{isMissionActive ? "Autonomous" : "Ready"}</Text></View>
        </View>
        <View style={fieldExperienceStyles.routeMeta}>
          <CommandMeta icon="map-marker-radius-outline" text={`${waypoints.length} points`} />
          <CommandMeta icon="source-branch" text={`${routeKm.toFixed(1)} km`} />
          <CommandMeta icon="crosshairs-gps" text={commandRtkLabel(telemetry.fixType)} />
        </View>
        <View style={fieldExperienceStyles.tabs}><View style={[fieldExperienceStyles.tab, fieldExperienceStyles.tabActive]}><Text style={fieldExperienceStyles.tabActiveText}>Overview</Text></View><View style={fieldExperienceStyles.tab}><Text style={fieldExperienceStyles.tabText}>Route</Text></View><TouchableOpacity style={fieldExperienceStyles.tab} onPress={openActivity} accessibilityRole="button" accessibilityLabel="Open mission activity"><Text style={fieldExperienceStyles.tabText}>Activity</Text></TouchableOpacity></View>

        <View style={fieldExperienceStyles.progressCard}>
          <View style={fieldExperienceStyles.ring}><Text style={fieldExperienceStyles.ringValue}>{percentage}%</Text><Text style={fieldExperienceStyles.ringLabel}>complete</Text></View>
          <View style={fieldExperienceStyles.metrics}><CommandMetric value={`${safeMarked} / ${safeTotal}`} label="Points reached" /><CommandMetric value={`${routeKm.toFixed(1)} km`} label="Planned route" /><CommandMetric value={isMissionActive ? "Live" : "Standby"} label="Mission state" /><CommandMetric value={commandRtkLabel(telemetry.fixType).replace("RTK ", "")} label="Positioning" /></View>
        </View>

        <View style={fieldExperienceStyles.card}>
          <View style={fieldExperienceStyles.cardHeading}><MaterialCommunityIcons name="map-marker" size={18} color="#1475EE" /><Text style={fieldExperienceStyles.cardTitle}>Next point</Text><Text style={fieldExperienceStyles.pointNumber}>#{currentPoint} of {safeTotal}</Text></View>
          <View style={fieldExperienceStyles.nextBody}><View style={fieldExperienceStyles.nextIcon}><MaterialCommunityIcons name="flag-checkered" size={22} color="#1475EE" /></View><View style={fieldExperienceStyles.nextCopy}><Text style={fieldExperienceStyles.nextName}>WP-{String(currentPoint).padStart(2, "0")}</Text><Text style={fieldExperienceStyles.nextDescription}>{nextWaypoint ? `${nextWaypoint.lat.toFixed(5)}, ${nextWaypoint.lon.toFixed(5)}` : "Awaiting mission upload"}</Text></View><View style={fieldExperienceStyles.pointPill}><Text style={fieldExperienceStyles.pointPillText}>{currentPoint}</Text></View></View>
        </View>

        <View style={fieldExperienceStyles.card}>
          <View style={fieldExperienceStyles.cardHeading}><Text style={fieldExperienceStyles.cardTitle}>Rover telemetry</Text><Text style={fieldExperienceStyles.liveNow}>LIVE</Text></View>
          <View style={fieldExperienceStyles.telemetryRow}><CommandTelemetry icon="speedometer" value={commandValue(telemetry.speed, " m/s")} label="Speed" /><CommandTelemetry icon="compass-outline" value={commandValue(telemetry.heading, "°", 0)} label="Heading" /><CommandTelemetry icon="signal" value={commandRtkLabel(telemetry.fixType)} label="Position" /><CommandTelemetry icon="battery" value={commandValue(telemetry.battery, "%", 0)} label="Battery" /></View>
        </View>

        <TouchableOpacity style={fieldExperienceStyles.card} onPress={openActivity} activeOpacity={0.86} accessibilityRole="button" accessibilityLabel="Open mission activity">
          <View style={fieldExperienceStyles.cardHeading}><Text style={fieldExperienceStyles.cardTitle}>Mission activity</Text><View style={fieldExperienceStyles.liveInline}><View style={fieldExperienceStyles.dot} /><Text style={fieldExperienceStyles.liveNow}>LIVE</Text></View></View>
          <View style={fieldExperienceStyles.activityPreview}>{["Mission ready", `${safeMarked} points completed`, `Heading to waypoint ${currentPoint}`].map((label, index) => <View style={fieldExperienceStyles.activityLine} key={label}><View style={[fieldExperienceStyles.activityState, index === 2 && fieldExperienceStyles.activityStateCurrent]}><MaterialCommunityIcons name={index === 2 ? "navigation" : "check"} size={10} color="#fff" /></View><Text style={[fieldExperienceStyles.activityText, index === 2 && fieldExperienceStyles.activityTextCurrent]}>{label}</Text></View>)}</View>
          <View style={fieldExperienceStyles.openActivity}><Text style={fieldExperienceStyles.openActivityText}>Open live activity</Text><MaterialCommunityIcons name="arrow-right" size={17} color="#1475EE" /></View>
        </TouchableOpacity>

        <View style={fieldExperienceStyles.actions}><TouchableOpacity style={[fieldExperienceStyles.actionButton, fieldExperienceStyles.startButton, (!canStart || isPreparing) && fieldExperienceStyles.disabled]} onPress={onStart} disabled={!canStart || isPreparing}><MaterialCommunityIcons name="play" size={20} color="#fff" /><Text style={fieldExperienceStyles.startText}>{isPreparing ? "Preparing" : "Start"}</Text></TouchableOpacity><TouchableOpacity style={[fieldExperienceStyles.actionButton, fieldExperienceStyles.pauseButton, !isMissionActive && fieldExperienceStyles.disabled]} onPress={isMissionPaused ? onResume : onPause} disabled={!isMissionActive}><MaterialCommunityIcons name={isMissionPaused ? "play" : "pause"} size={20} color="#12315f" /><Text style={fieldExperienceStyles.pauseText}>{isMissionPaused ? "Resume" : "Pause"}</Text></TouchableOpacity><TouchableOpacity style={fieldExperienceStyles.stopButton} onPress={onStop} accessibilityLabel="Stop mission"><MaterialCommunityIcons name="stop" size={20} color="#D92540" /></TouchableOpacity></View>
      </Animated.View>

      {activityMounted && <Animated.View style={[fieldExperienceStyles.activityScreen, { opacity: activityProgress, transform: [{ translateY: transitionUp }, { scale: detailScale }] }]}>
        <View style={fieldExperienceStyles.activityTopbar}><View style={fieldExperienceStyles.activityTitleGroup}><View style={fieldExperienceStyles.activityIcon}><MaterialCommunityIcons name="map" size={24} color="#fff" /></View><View><Text style={fieldExperienceStyles.activityTitle}>Field Navigator</Text><Text style={fieldExperienceStyles.activitySubtitle}>Mission: Field Survey</Text></View></View><View style={fieldExperienceStyles.topSignals}><View style={fieldExperienceStyles.topSignal}><View style={[fieldExperienceStyles.dot, { backgroundColor: telemetry.connected ? "#16B980" : "#F97316" }]} /><Text style={fieldExperienceStyles.topSignalText}>{telemetry.connected ? "Connected" : "Offline"}</Text></View><View style={fieldExperienceStyles.topSignal}><MaterialCommunityIcons name="crosshairs-gps" size={16} color="#1475EE" /><Text style={fieldExperienceStyles.topSignalText}>{commandRtkLabel(telemetry.fixType)}</Text></View><View style={fieldExperienceStyles.topSignal}><MaterialCommunityIcons name="battery" size={17} color="#1475EE" /><Text style={fieldExperienceStyles.topSignalText}>{commandValue(telemetry.battery, "%", 0)}</Text></View></View><View style={fieldExperienceStyles.topActions}><TouchableOpacity style={fieldExperienceStyles.planButton} onPress={onOpenPlan} accessibilityRole="button" accessibilityLabel="Plan mission route"><MaterialCommunityIcons name="pencil-outline" size={20} color="#1475EE" /></TouchableOpacity><TouchableOpacity style={fieldExperienceStyles.closeActivity} onPress={closeActivity} accessibilityRole="button" accessibilityLabel="Return to mission home"><MaterialCommunityIcons name="close" size={24} color="#13254a" /></TouchableOpacity></View></View>
        <View style={fieldExperienceStyles.mapCallout}><Text style={fieldExperienceStyles.mapCalloutLabel}>NEXT WAYPOINT</Text><Text style={fieldExperienceStyles.mapCalloutValue}>WP-{String(currentPoint).padStart(2, "0")}</Text><Text style={fieldExperienceStyles.mapCalloutSub}>Following planned blue route</Text></View>
        <View style={fieldExperienceStyles.activityFooter}>
          <View style={fieldExperienceStyles.footerMission}><View style={fieldExperienceStyles.footerIcon}><MaterialCommunityIcons name="clipboard-text-outline" size={22} color="#1475EE" /></View><View><Text style={fieldExperienceStyles.footerTitle}>Field Survey</Text><Text style={fieldExperienceStyles.footerSub}>Waypoint {currentPoint} of {safeTotal}</Text></View></View>
          <View style={fieldExperienceStyles.timelineArea}><View style={fieldExperienceStyles.timelineHeading}><Text style={fieldExperienceStyles.timelineTitle}>Route progress</Text><Text style={fieldExperienceStyles.timelinePercent}>{percentage}%</Text></View><View style={fieldExperienceStyles.timelineTrack}><View style={[fieldExperienceStyles.timelineFill, { width: `${percentage}%` }]} /></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={fieldExperienceStyles.stepsScroll} style={fieldExperienceStyles.stepsScroller}>{waypoints.length > 0 ? waypoints.map((waypoint, index) => { const state = commandPointState(statusMap[waypoint.sn], index, currentIndex); return <View key={`${waypoint.sn}-${index}`} style={fieldExperienceStyles.step}><View style={[fieldExperienceStyles.stepDot, state === "complete" && fieldExperienceStyles.stepDone, state === "active" && fieldExperienceStyles.stepActive]}><Text style={[fieldExperienceStyles.stepText, state !== "pending" && fieldExperienceStyles.stepTextBright]}>{state === "complete" ? "✓" : index + 1}</Text></View><Text style={[fieldExperienceStyles.stepLabel, state === "active" && fieldExperienceStyles.stepLabelActive]}>WP {index + 1}</Text></View>; }) : <Text style={fieldExperienceStyles.emptyRoute}>Upload a plan to see live route points.</Text>}</ScrollView>{waypoints.length > 5 && <Text style={fieldExperienceStyles.swipeHint}>Swipe to view all {waypoints.length} points →</Text>}</View>
          <View style={fieldExperienceStyles.footerActions}><TouchableOpacity style={[fieldExperienceStyles.largeStart, (!canStart || isPreparing) && fieldExperienceStyles.disabled]} onPress={onStart} disabled={!canStart || isPreparing}><MaterialCommunityIcons name="play" size={23} color="#fff" /><Text style={fieldExperienceStyles.largeStartText}>{isPreparing ? "Preparing" : "Start"}</Text></TouchableOpacity><TouchableOpacity style={[fieldExperienceStyles.largePause, !isMissionActive && fieldExperienceStyles.disabled]} onPress={isMissionPaused ? onResume : onPause} disabled={!isMissionActive}><MaterialCommunityIcons name={isMissionPaused ? "play" : "pause"} size={23} color="#fff" /><Text style={fieldExperienceStyles.largePauseText}>{isMissionPaused ? "Resume" : "Pause"}</Text></TouchableOpacity><TouchableOpacity style={fieldExperienceStyles.largeStop} onPress={onStop}><MaterialCommunityIcons name="stop" size={22} color="#fff" /></TouchableOpacity></View>
        </View>
      </Animated.View>}
      <SettingsScreen visible={showSettings} onClose={() => setShowSettings(false)} />
    </View>
  );
}

const fieldExperienceStyles = StyleSheet.create({
  host: { ...StyleSheet.absoluteFillObject, zIndex: 21 },
  homeHeader: { position: "absolute", top: 0, left: 0, right: 0, height: 70, backgroundColor: "rgba(250,252,255,0.99)", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: "#D9E3F0", zIndex: 23, shadowColor: "#10244B", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 6 }, homeHeaderDark: { backgroundColor: "#10244B", borderBottomColor: "#29446F" }, homeBrand: { flexDirection: "row", alignItems: "center", gap: 11, minWidth: 346 }, homeBrandIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#1475EE", shadowColor: "#1475EE", shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 }, homeBrandCopy: { justifyContent: "center" }, homeBrandTitle: { color: "#10244B", fontSize: 19, fontWeight: "900", letterSpacing: -0.35 }, homeBrandTitleDark: { color: "#F8FAFC" }, homeBrandKicker: { color: "#7183A1", fontSize: 8, fontWeight: "900", letterSpacing: 1.1, marginTop: 2 }, homeBrandKickerDark: { color: "#8DA5C8" }, homeBrandDivider: { width: 1, height: 34, backgroundColor: "#C6D2E2", marginHorizontal: 3 }, homeBrandSubtitle: { color: "#536D97", fontSize: 12, fontWeight: "800", maxWidth: 180 }, homeBrandSubtitleDark: { color: "#C7D7EC" }, homeLiveLabel: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 }, homeLiveDot: { width: 6, height: 6, borderRadius: 3 }, homeLiveText: { color: "#6681AD", fontSize: 8, fontWeight: "900", letterSpacing: 0.85 }, homeSignals: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: "auto", padding: 4, borderRadius: 15, backgroundColor: "#EDF3FB", borderWidth: 1, borderColor: "#E1EAF5" }, homeSignalsDark: { backgroundColor: "#0C1C3B", borderColor: "#29446F" }, homeSignal: { minWidth: 76, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E1EAF5" }, homeSignalDark: { backgroundColor: "#173563", borderColor: "#29446F" }, homeSignalTitle: { color: "#486384", fontSize: 9, fontWeight: "900", letterSpacing: 0.35, textTransform: "uppercase" }, homeSignalTitleDark: { color: "#D8E6FA" }, homeSignalSub: { color: "#122750", fontSize: 10, fontWeight: "800", marginTop: 2, maxWidth: 64 }, homeSignalSubDark: { color: "#B6C6DF" }, homeDivider: { display: "none" }, homeDividerDark: { backgroundColor: "#36537B" }, homeControls: { flexDirection: "row", alignItems: "center", gap: 7, marginLeft: 10, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: "#D9E3F0" }, homeControlsDark: { borderLeftColor: "#29446F" }, homeControl: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF2FF", borderWidth: 1, borderColor: "#D3E2FB" }, homeControlDark: { backgroundColor: "#173563", borderColor: "#29446F" },
  overview: { position: "absolute", top: 70, right: 0, bottom: 0, width: 382, backgroundColor: "rgba(250,252,255,0.98)", borderLeftWidth: 1, borderLeftColor: "#D9E3F0", padding: 18, zIndex: 22 },
  railHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, eyebrow: { color: "#6681AD", fontSize: 10, letterSpacing: 1.2, fontWeight: "800" }, missionTitle: { color: "#10244B", fontSize: 30, lineHeight: 36, fontWeight: "800", marginTop: 2, maxWidth: 215 }, liveBadge: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#E6F8F1", paddingHorizontal: 11, paddingVertical: 8, borderRadius: 20 }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#16B980" }, liveText: { color: "#1B5360", fontSize: 11, fontWeight: "800" },
  routeMeta: { flexDirection: "row", gap: 13, marginTop: 10, paddingBottom: 16 }, meta: { flexDirection: "row", alignItems: "center", gap: 4 }, metaText: { color: "#526B93", fontSize: 11, fontWeight: "700" }, tabs: { height: 42, backgroundColor: "#EAF0F8", borderRadius: 11, padding: 3, flexDirection: "row", marginBottom: 12 }, tab: { flex: 1, justifyContent: "center", alignItems: "center", borderRadius: 8 }, tabActive: { backgroundColor: "#1475EE" }, tabText: { color: "#426189", fontSize: 12, fontWeight: "800" }, tabActiveText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  progressCard: { borderWidth: 1, borderColor: "#DDE7F3", borderRadius: 15, padding: 14, flexDirection: "row", gap: 13 }, ring: { width: 96, height: 96, borderRadius: 48, borderWidth: 9, borderColor: "#13B885", alignItems: "center", justifyContent: "center" }, ringValue: { color: "#122750", fontWeight: "800", fontSize: 25 }, ringLabel: { color: "#657A9D", fontWeight: "700", fontSize: 9, textTransform: "uppercase" }, metrics: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignContent: "center" }, metric: { width: "50%", paddingLeft: 10, marginVertical: 5, borderLeftWidth: 1, borderLeftColor: "#E0E7F0" }, metricValue: { color: "#10244B", fontSize: 14, fontWeight: "800" }, metricLabel: { color: "#7183A1", fontSize: 9, fontWeight: "600", marginTop: 2 },
  card: { borderWidth: 1, borderColor: "#DDE7F3", borderRadius: 15, padding: 13, marginTop: 10 }, cardHeading: { flexDirection: "row", alignItems: "center", gap: 7 }, cardTitle: { color: "#152A50", fontWeight: "800", fontSize: 14, flex: 1 }, pointNumber: { color: "#6B7E9D", fontSize: 10, fontWeight: "700" }, nextBody: { flexDirection: "row", alignItems: "center", marginTop: 10 }, nextIcon: { width: 45, height: 45, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#E7F1FF" }, nextCopy: { flex: 1, marginLeft: 10 }, nextName: { color: "#172C51", fontWeight: "800", fontSize: 16 }, nextDescription: { color: "#7385A1", fontWeight: "600", fontSize: 10, marginTop: 2 }, pointPill: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#1475EE", alignItems: "center", justifyContent: "center" }, pointPillText: { color: "#fff", fontWeight: "800", fontSize: 17 },
  liveNow: { color: "#13A978", fontSize: 10, fontWeight: "900", letterSpacing: 0.6 }, telemetryRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 }, telemetry: { width: "24%", alignItems: "center" }, telemetryValue: { color: "#1A3159", fontWeight: "800", fontSize: 11, marginTop: 5, maxWidth: 78 }, telemetryLabel: { color: "#7183A1", fontSize: 9, marginTop: 2 },
  liveInline: { flexDirection: "row", gap: 5, alignItems: "center" }, activityPreview: { marginTop: 10, borderLeftWidth: 1, borderLeftColor: "#DCE5F1", gap: 8, paddingLeft: 12 }, activityLine: { flexDirection: "row", alignItems: "center", gap: 8 }, activityState: { width: 16, height: 16, marginLeft: -21, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#15B981" }, activityStateCurrent: { backgroundColor: "#1475EE" }, activityText: { color: "#6A7E9D", fontSize: 11, fontWeight: "600" }, activityTextCurrent: { color: "#1475EE", fontWeight: "800" }, openActivity: { borderTopWidth: 1, borderTopColor: "#E3EAF4", marginTop: 11, paddingTop: 9, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, openActivityText: { color: "#1475EE", fontSize: 11, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 9, marginTop: "auto" }, actionButton: { flex: 1, height: 47, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 }, startButton: { backgroundColor: "#10B981" }, pauseButton: { backgroundColor: "#E7F1FF" }, startText: { color: "#fff", fontWeight: "800", fontSize: 14 }, pauseText: { color: "#12315F", fontWeight: "800", fontSize: 14 }, stopButton: { width: 47, height: 47, borderRadius: 12, backgroundColor: "#FFF0F2", alignItems: "center", justifyContent: "center" }, disabled: { opacity: 0.45 },
  activityScreen: { ...StyleSheet.absoluteFillObject, backgroundColor: "transparent", zIndex: 24 }, activityTopbar: { position: "absolute", top: 22, left: 22, right: 22, height: 66, borderRadius: 18, backgroundColor: "rgba(250,252,255,0.97)", paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between", shadowColor: "#0B1C3B", shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 10 }, activityTitleGroup: { flexDirection: "row", alignItems: "center", gap: 11 }, activityIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#123267" }, activityTitle: { color: "#122750", fontSize: 17, fontWeight: "800" }, activitySubtitle: { color: "#6A7D9C", fontSize: 11, fontWeight: "600", marginTop: 2 }, topSignals: { flex: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 18, marginHorizontal: 18 }, topSignal: { flexDirection: "row", alignItems: "center", gap: 6 }, topSignalText: { color: "#1C3156", fontSize: 11, fontWeight: "800" }, topActions: { flexDirection: "row", alignItems: "center", gap: 8 }, planButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#E7F1FF", alignItems: "center", justifyContent: "center" }, closeActivity: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#E7EEF8", alignItems: "center", justifyContent: "center" }, mapCallout: { position: "absolute", top: 122, left: "47%", backgroundColor: "rgba(255,255,255,0.96)", borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, borderLeftWidth: 4, borderLeftColor: "#1475EE", shadowColor: "#10244B", shadowOpacity: 0.18, shadowRadius: 10, elevation: 8 }, mapCalloutLabel: { color: "#1475EE", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 }, mapCalloutValue: { color: "#132850", fontSize: 17, fontWeight: "900", marginTop: 1 }, mapCalloutSub: { color: "#6C7E9C", fontSize: 10, fontWeight: "600", marginTop: 2 },
  activityFooter: { position: "absolute", left: 22, right: 22, bottom: 22, minHeight: 118, borderRadius: 20, padding: 15, backgroundColor: "rgba(250,252,255,0.98)", flexDirection: "row", alignItems: "center", gap: 16, shadowColor: "#0B1C3B", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 13 }, footerMission: { width: 172, flexDirection: "row", alignItems: "center", gap: 9 }, footerIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: "#E8F1FF", alignItems: "center", justifyContent: "center" }, footerTitle: { color: "#142850", fontSize: 15, fontWeight: "800" }, footerSub: { color: "#7182A0", fontSize: 10, fontWeight: "700", marginTop: 3 }, timelineArea: { flex: 1, minWidth: 250 }, timelineHeading: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }, timelineTitle: { color: "#536D97", fontSize: 10, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 }, timelinePercent: { color: "#1475EE", fontSize: 12, fontWeight: "900" }, timelineTrack: { height: 4, borderRadius: 3, backgroundColor: "#DCE5F1", overflow: "hidden" }, timelineFill: { height: "100%", borderRadius: 3, backgroundColor: "#1475EE" }, stepsScroller: { maxHeight: 49 }, stepsScroll: { alignItems: "flex-start", gap: 7, paddingVertical: 8 }, step: { width: 66, alignItems: "center" }, stepDot: { width: 27, height: 27, borderRadius: 14, backgroundColor: "#E8EDF4", borderWidth: 2, borderColor: "#CCD7E5", alignItems: "center", justifyContent: "center" }, stepDone: { borderColor: "#12B981", backgroundColor: "#12B981" }, stepActive: { borderColor: "#1475EE", backgroundColor: "#1475EE", shadowColor: "#1475EE", shadowOpacity: 0.55, shadowRadius: 7, elevation: 5 }, stepText: { color: "#7182A0", fontSize: 11, fontWeight: "900" }, stepTextBright: { color: "#fff" }, stepLabel: { color: "#788AA5", fontSize: 8, fontWeight: "700", marginTop: 3 }, stepLabelActive: { color: "#1475EE" }, emptyRoute: { color: "#7182A0", fontWeight: "600", fontSize: 11 }, swipeHint: { color: "#6E85A6", fontSize: 9, fontWeight: "700", textAlign: "right", marginTop: -3 }, footerActions: { flexDirection: "row", alignItems: "center", gap: 9 }, largeStart: { height: 57, paddingHorizontal: 18, borderRadius: 14, backgroundColor: "#10B981", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }, largeStartText: { color: "#fff", fontSize: 15, fontWeight: "800" }, largePause: { height: 57, paddingHorizontal: 16, borderRadius: 14, backgroundColor: "#152A50", flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }, largePauseText: { color: "#fff", fontSize: 15, fontWeight: "800" }, largeStop: { width: 57, height: 57, borderRadius: 29, backgroundColor: "#DD2443", alignItems: "center", justifyContent: "center" },
});
