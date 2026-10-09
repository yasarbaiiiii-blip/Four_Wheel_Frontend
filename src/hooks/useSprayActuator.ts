import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import {
  cancelSprayTest,
  disableSpray,
  enableSpray,
  getSprayConfig,
  setSprayDuration,
  testSpray,
  SPRAY_DURATION_MAX_SEC,
} from "../services/sprayConfigService";

export const SPRAY_DURATION_MIN_MS = 100;
export const SPRAY_DURATION_MAX_MS = Math.round(SPRAY_DURATION_MAX_SEC * 1000); // 3000 ms
export const SPRAY_DURATION_STEP_MS = 100;

export type SprayTestStatus =
  | "idle"
  | "holding"
  | "pulsing"
  | "success"
  | "error";

export interface UseSprayActuatorOptions {
  connectionState?: string;
  isMissionActive?: boolean;
  isArmed?: boolean;
  groundSpeed?: number; // m/s
  onSuccessMessage?: (msg: string) => void;
}

export function useSprayActuator(options: UseSprayActuatorOptions = {}) {
  const {
    connectionState = "disconnected",
    isMissionActive = false,
    isArmed = false,
    groundSpeed = 0,
    onSuccessMessage,
  } = options;

  // Persisted (saved on rover) state
  const [savedServoEnabled, setSavedServoEnabled] = useState(false);
  const [savedDurationMs, setSavedDurationMs] = useState(500);

  // Local draft state
  const [draftServoEnabled, setDraftServoEnabled] = useState(false);
  const [draftDurationMs, setDraftDurationMs] = useState(500);

  // Hardware telemetry (read-only from rover)
  const [channel, setChannel] = useState(5);
  const [pressPwmUs, setPressPwmUs] = useState(2000);
  const [releasePwmUs, setReleasePwmUs] = useState(1500);
  const [controllerState, setControllerState] = useState<string | null>(null);

  // Loading states
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Test pulse state
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<SprayTestStatus>("idle");
  const [testErrorMessage, setTestErrorMessage] = useState<string | null>(null);

  // In-flight mutex & timer references
  const inFlightRef = useRef(false);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dirty tracking: true if draft differs from saved state
  const isDirty =
    draftServoEnabled !== savedServoEnabled ||
    draftDurationMs !== savedDurationMs;

  // 1. Fetch hardware configuration from rover
  const refreshConfig = useCallback(async () => {
    setIsLoadingConfig(true);
    setConfigError(null);
    try {
      const response = await getSprayConfig();
      if (!response.success || !response.config) {
        throw new Error(response.message || "Failed to load spray configuration");
      }
      const config = response.config;

      // Master enabled state from controller
      const isEnabled =
        config.available === true &&
        config.fault_latched !== true &&
        config.enabled !== false;

      setSavedServoEnabled(isEnabled);
      setDraftServoEnabled(isEnabled);

      setChannel(5); // Contractually AUX5

      if (typeof config.press_pwm_us === "number" && Number.isFinite(config.press_pwm_us)) {
        setPressPwmUs(config.press_pwm_us);
      }
      if (typeof config.release_pwm_us === "number" && Number.isFinite(config.release_pwm_us)) {
        setReleasePwmUs(config.release_pwm_us);
      }
      if (config.controller_state) {
        setControllerState(config.controller_state);
      }

      if (
        typeof config.spray_duration_sec === "number" &&
        Number.isFinite(config.spray_duration_sec) &&
        config.spray_duration_sec > 0
      ) {
        const ms = Math.min(
          SPRAY_DURATION_MAX_MS,
          Math.max(
            SPRAY_DURATION_MIN_MS,
            Math.round(config.spray_duration_sec * 1000),
          ),
        );
        setSavedDurationMs(ms);
        setDraftDurationMs(ms);
      }

      setConfigLoaded(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setConfigError(msg);
      setConfigLoaded(false);
    } finally {
      setIsLoadingConfig(false);
    }
  }, []);

  // Initial load when connected
  useEffect(() => {
    if (connectionState === "connected") {
      void refreshConfig();
    }
  }, [connectionState, refreshConfig]);

  // 2. Stepper math & clamping
  const adjustDuration = useCallback((deltaMs: number) => {
    setDraftDurationMs((prev) => {
      const next = prev + deltaMs;
      return Math.min(
        SPRAY_DURATION_MAX_MS,
        Math.max(SPRAY_DURATION_MIN_MS, next),
      );
    });
  }, []);

  const setDirectDuration = useCallback((ms: number) => {
    if (!Number.isFinite(ms)) return;
    const clamped = Math.min(
      SPRAY_DURATION_MAX_MS,
      Math.max(SPRAY_DURATION_MIN_MS, Math.round(ms)),
    );
    setDraftDurationMs(clamped);
  }, []);

  // 3. Safety interlocks for spray test (Option B Policy)
  // Permitted while DISARMED (bench testing); blocked if armed and moving or mission running.
  const isMoving = groundSpeed >= 0.1;
  const isOnline = connectionState === "connected";

  let disabledTestReason: string | null = null;
  if (!isOnline) {
    disabledTestReason = "Rover not connected";
  } else if (isMissionActive) {
    disabledTestReason = "Cannot test while mission running";
  } else if (isMoving) {
    disabledTestReason = "Rover must be stationary to test";
  } else if (!draftServoEnabled) {
    disabledTestReason = "Enable spray controller switch first";
  } else if (inFlightRef.current || isTesting) {
    disabledTestReason = "Test pulse in progress";
  }

  const canTestSpray = disabledTestReason === null;

  // 4. Guaranteed Hardware Release on cleanup / background
  const emergencyRelease = useCallback(async () => {
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    try {
      await cancelSprayTest();
    } catch {
      // Best-effort release
    } finally {
      inFlightRef.current = false;
      setIsTesting(false);
    }
  }, []);

  useEffect(() => {
    const handleAppStateChange = (state: AppStateStatus) => {
      if (state !== "active" && inFlightRef.current) {
        void emergencyRelease();
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      sub.remove();
      if (inFlightRef.current) {
        void emergencyRelease();
      }
    };
  }, [emergencyRelease]);

  // 5. Test pulse execution
  const executeSprayTest = useCallback(async (): Promise<{ success: boolean; message?: string }> => {
    if (!canTestSpray || inFlightRef.current) {
      return { success: false, message: disabledTestReason ?? "Test unavailable" };
    }

    inFlightRef.current = true;
    setIsTesting(true);
    setTestStatus("pulsing");
    setTestErrorMessage(null);

    const durationSec = draftDurationMs / 1000;

    // Safety timeout release: duration + 300ms buffer
    safetyTimeoutRef.current = setTimeout(() => {
      if (inFlightRef.current) {
        void emergencyRelease();
      }
    }, draftDurationMs + 300);

    try {
      const response = await testSpray(durationSec);
      if (!response.success) {
        throw new Error(response.message || "Rover rejected test spray");
      }

      // Keep pulse indication active for the duration
      await new Promise((resolve) => setTimeout(resolve, draftDurationMs));

      setTestStatus("success");
      setTimeout(() => setTestStatus("idle"), 2000);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Spray test failed";
      setTestStatus("error");
      setTestErrorMessage(msg);
      // Guarantee release on error
      await emergencyRelease();
      return { success: false, message: msg };
    } finally {
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
      inFlightRef.current = false;
      setIsTesting(false);
    }
  }, [canTestSpray, disabledTestReason, draftDurationMs, emergencyRelease]);

  // 6. Commit changes to rover (Option B Save Model + Option A Laser Policy)
  const commitSpraySettings = useCallback(
    async (tool: "SPRAY" | "LASER"): Promise<{ success: boolean; message?: string }> => {
      try {
        if (tool === "LASER") {
          // Option A: Automatically ensure spray controller is OFF when saving LASER
          await disableSpray();
          setSavedServoEnabled(false);
          setDraftServoEnabled(false);
          return { success: true, message: "Laser mode saved (Spray disabled)" };
        }

        // Tool is SPRAY: Commit master switch & duration atomically
        if (draftServoEnabled !== savedServoEnabled) {
          const switchRes = draftServoEnabled ? await enableSpray() : await disableSpray();
          if (!switchRes.success) {
            throw new Error(switchRes.message || "Failed to set spray power");
          }
          setSavedServoEnabled(draftServoEnabled);
        }

        if (draftDurationMs !== savedDurationMs) {
          const durSec = draftDurationMs / 1000;
          const durRes = await setSprayDuration(durSec);
          if (!durRes.success) {
            throw new Error(durRes.message || "Failed to save spray duration");
          }
          const applied = durRes.config?.spray_duration_sec;
          const appliedMs =
            typeof applied === "number" && Number.isFinite(applied)
              ? Math.round(applied * 1000)
              : draftDurationMs;
          setSavedDurationMs(appliedMs);
          setDraftDurationMs(appliedMs);
        }

        if (onSuccessMessage) {
          onSuccessMessage("Spray configuration saved on rover");
        }
        return { success: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to commit spray settings";
        return { success: false, message: msg };
      }
    },
    [draftDurationMs, draftServoEnabled, onSuccessMessage, savedDurationMs, savedServoEnabled],
  );

  // 7. Discard draft changes
  const discardDraft = useCallback(() => {
    setDraftServoEnabled(savedServoEnabled);
    setDraftDurationMs(savedDurationMs);
  }, [savedDurationMs, savedServoEnabled]);

  return {
    // Draft & saved values
    draftServoEnabled,
    setDraftServoEnabled,
    savedServoEnabled,
    draftDurationMs,
    savedDurationMs,
    isDirty,

    // Hardware telemetry
    channel,
    pressPwmUs,
    releasePwmUs,
    controllerState,
    configLoaded,
    isLoadingConfig,
    configError,
    refreshConfig,

    // Stepper actions
    adjustDuration,
    setDirectDuration,

    // Test pulse
    canTestSpray,
    disabledTestReason,
    isTesting,
    testStatus,
    testErrorMessage,
    executeSprayTest,

    // Save & discard actions
    commitSpraySettings,
    discardDraft,
  };
}
