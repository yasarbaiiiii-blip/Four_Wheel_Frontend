import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../theme/colors";
import { useRover } from "../context/RoverContext";
import { FailsafeModeSelector } from "../components/pathplan/FailsafeModeSelector";
import { ServoConfigModal } from "../components/settings/ServoConfigModal";
import { ParamBrowserModal } from "../components/settings/ParamBrowserModal";
import { RTKInjectionScreen } from "../components/missionreport/RTKInjectionScreen";
import { getRtkStatus, stopRtk } from "../services/rtkService";
import { toRtkControlView } from "../adapters/rtkControlAdapter";
import { useAuth } from "../hooks/useAuth";
import { getSprayConfig, enableSpray, disableSpray, testSpray, setSprayDuration } from "../services/sprayConfigService";
import { Toast } from "../components/shared/Toast";
import { getObstacleStatus, setObstacleConfig } from "../services/obstacleService";
import {
  getMissionStatus,
  saveMissionDefaults,
  setMissionMarkingTool as sendMissionMarkingTool,
} from "../services/missionApi";
import {
  ObstacleView,
  formatMetres,
  obstacleReadingText,
} from "../utils/obstacleStatus";

function obstacleZoneColor(view: ObstacleView | null): string {
  if (!view || !view.healthy) return colors.textMuted;
  if (view.zone === "danger") return colors.danger;
  if (view.zone === "warning") return colors.warning;
  if (view.zone === "clear") return colors.success;
  return colors.textMuted;
}

interface SettingsScreenProps {
  visible: boolean;
  onClose: () => void;
}

const getRtkFailureMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error) {
    const responseBody =
      "responseBody" in err
        ? String((err as { responseBody?: unknown }).responseBody ?? "")
        : "";
    if (responseBody) {
      try {
        const parsed = JSON.parse(responseBody);
        const detail = parsed?.detail;
        if (typeof detail === "string") {
          return `${err.message}: ${detail}`;
        }
      } catch {
        return `${err.message}: ${responseBody}`;
      }
    }
    return err.message;
  }
  return fallback;
};

const SettingsScreenComponent: React.FC<SettingsScreenProps> = ({
  visible,
  onClose,
}) => {
  const { logout, session } = useAuth();

  const {
    gpsFailsafeMode,
    setGpsFailsafeMode,
    telemetry,
    services,
    connectionState,
    onMissionEvent,
  } = useRover();
  const [showFailsafeSelector, setShowFailsafeSelector] = useState(false);

  // TTS State
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [ttsLanguage, setTtsLanguage] = useState<"en" | "ta" | "hi">("en");
  const [ttsGender, setTtsGender] = useState<"male" | "female">("male");
  const [isLoadingTTS, setIsLoadingTTS] = useState(false);

  // Obstacle Detection State: always what the rover reports, never a
  // locally remembered value (GET /api/obstacle/status, 1 Hz while open).
  const [obstacleStatus, setObstacleStatus] = useState<ObstacleView | null>(null);
  const [obstacleStatusError, setObstacleStatusError] = useState<string | null>(null);
  const [isLoadingObstacle, setIsLoadingObstacle] = useState(false);

  // Servo Configuration State
  const [servoEnabled, setServoEnabled] = useState(false);
  // PX4 contract is permanently AUX5.
  const [servoChannel, setServoChannel] = useState(5);

  // Dynamic backend-controlled servo positions.
  const [servoPwmOn, setServoPwmOn] = useState(2000);
  const [servoPwmOff, setServoPwmOff] = useState(1500);

  // Current production spray logic.
  const [servoDelayBefore, setServoDelayBefore] = useState(0.0);
  const [servoSprayDuration, setServoSprayDuration] = useState(0.5);
  const [servoDelayAfter, setServoDelayAfter] = useState(0.0);
  const [manualOverrideTimeoutSec, setManualOverrideTimeoutSec] = useState(3);
  const [isLoadingServo, setIsLoadingServo] = useState(false);
  const [servoConfigLoaded, setServoConfigLoaded] = useState(false);
  const [showServoConfigModal, setShowServoConfigModal] = useState(false);
  const [isLoadingServoModal, setIsLoadingServoModal] = useState(false);

  // LED Controller State
  const [ledEnabled, setLedEnabled] = useState(false);
  const [isLoadingLed, setIsLoadingLed] = useState(false);
  const [lastLedUpdate, setLastLedUpdate] = useState<string>("");

  // RTK Injection State — backend-owned profiles; no local runtime authority.
  const [showRTKModal, setShowRTKModal] = useState(false);
  const [rtkHeadline, setRtkHeadline] = useState("Off");
  const [rtkStatusMessage, setRtkStatusMessage] = useState("Idle");
  const [isRTKSubmitting, setIsRTKSubmitting] = useState(false);
  const [canStopRtk, setCanStopRtk] = useState(false);

  // Mission mode defaults are rover-owned. Settings is the single place to
  // choose the marking actuator and persist it for the next mission.
  const [missionMarkingTool, setMissionMarkingTool] =
    useState<"LASER" | "SPRAY">("SPRAY");
  const [missionDefaultSummary, setMissionDefaultSummary] = useState("");
  const [isSavingMissionMode, setIsSavingMissionMode] = useState(false);

  // MAVLink Param Browser State
  const [showParamBrowser, setShowParamBrowser] = useState(false);

  // Toast/Success Message State
  const [successMessage, setSuccessMessage] = useState<string>("");

  const refreshSettingsRtkStatus = useCallback(async () => {
    if (connectionState !== "connected") {
      const offlineView = toRtkControlView(null, { connected: false });
      setRtkHeadline(offlineView.headlineLabel);
      setCanStopRtk(offlineView.canStop);
      setRtkStatusMessage("Rover not connected");
      return;
    }

    try {
      const rtkStatus = await getRtkStatus();
      const view = toRtkControlView(rtkStatus, {
        connected: true,
      });
      setRtkHeadline(view.headlineLabel);
      setCanStopRtk(view.canStop);
      setRtkStatusMessage(
        `${view.desiredState ?? "—"} · ${view.managerState ?? "—"} · ${
          view.correctionState ?? "no stream"
        }`,
      );
    } catch {
      setRtkHeadline("Rover Offline");
      setCanStopRtk(false);
      setRtkStatusMessage("Unable to read backend RTK status");
    }
  }, [connectionState]);

  useEffect(() => {
    if (!visible || showRTKModal) {
      return undefined;
    }
    void refreshSettingsRtkStatus();

    if (connectionState !== "connected") {
      return undefined;
    }

    const timer = setInterval(() => {
      void refreshSettingsRtkStatus();
    }, 3000);

    return () => clearInterval(timer);
  }, [
    visible,
    showRTKModal,
    connectionState,
    refreshSettingsRtkStatus,
  ]);

  const handleOpenRTKModal = () => {
    setShowRTKModal(true);
  };

  const handleStopRTKStream = async () => {
    setIsRTKSubmitting(true);
    try {
      await stopRtk();
      await refreshSettingsRtkStatus();
    } catch (err) {
      Alert.alert(
        "RTK Stop Failed",
        getRtkFailureMessage(err, "Failed to stop RTK."),
      );
    } finally {
      setIsRTKSubmitting(false);
    }
  };

  // GPS failsafe mode is now persisted by backend, no need for AsyncStorage

  // Load all settings on mount
  React.useEffect(() => {
    if (visible) {
      loadAllSettings();
    }
  }, [visible]);

  const loadMissionMode = async () => {
    try {
      const response = await getMissionStatus();
      if (!response.success) return;
      const mission = response.mission;
      const tool = mission.marking_tool;
      if (tool === "LASER" || tool === "SPRAY") {
        setMissionMarkingTool(tool);
      }
      const savedMode = mission.default_execution_mode;
      const savedTool = mission.default_marking_tool;
      setMissionDefaultSummary(
        savedMode && savedTool
          ? `Saved default: ${savedMode} · ${savedTool}`
          : "Choose a tool, then save it as the rover default.",
      );
    } catch {
      setMissionDefaultSummary("Connect to the rover to load mission mode defaults.");
    }
  };

  const loadAllSettings = async () => {
    console.log("═══════════════════════════════════════");
    console.log("⚙️ LOADING SETTINGS FROM BACKEND/STORAGE");
    console.log("═══════════════════════════════════════");

    // Load TTS settings from backend
    await loadTTSStatus();

    // Load Servo Configuration from backend
    await loadServoConfig();

    // Load LED controller status from backend and AsyncStorage
    await loadLedStatus();

    await loadMissionMode();

    // GPS Failsafe mode is loaded from backend via RoverContext
    console.log(
      "✅ GPS Failsafe Mode (from backend via context):",
      gpsFailsafeMode.toUpperCase(),
    );

    console.log("═══════════════════════════════════════");
    console.log("✅ ALL SETTINGS LOADED");
    console.log("═══════════════════════════════════════");
  };

  const handleSaveMissionMode = async () => {
    if (isMissionActive || isSavingMissionMode) return;
    setIsSavingMissionMode(true);
    try {
      const toolResponse = await sendMissionMarkingTool(missionMarkingTool);
      if (!toolResponse.success) {
        throw new Error(toolResponse.message || "The rover rejected the mission tool.");
      }
      const defaultsResponse = await saveMissionDefaults();
      if (!defaultsResponse.success) {
        throw new Error(defaultsResponse.message || "The rover rejected the mission default.");
      }
      const mission = defaultsResponse.mission;
      setMissionDefaultSummary(
        `Saved default: ${mission.default_execution_mode ?? "—"} · ${mission.default_marking_tool ?? missionMarkingTool}`,
      );
      setSuccessMessage("Mission mode default saved on the rover");
    } catch (error) {
      Alert.alert(
        "Mission Mode Not Saved",
        error instanceof Error ? error.message : "Could not save mission mode defaults.",
      );
    } finally {
      setIsSavingMissionMode(false);
    }
  };

  const loadServoConfig = async () => {
    try {
      console.log("[Settings] Loading spray configuration...");

      const response = await getSprayConfig();

      if (!response.success) {
        console.warn("[Settings] Spray config request rejected");
        return;
      }

      const config = response.config;

      // `enabled` is the controller's runtime master gate (POST /enable,
      // /disable). Older backends omit it, so only an explicit false disables.
      setServoEnabled(
        config.available === true &&
          config.fault_latched !== true &&
          config.enabled !== false,
      );

      // Hardware mapping is fixed to AUX5.
      setServoChannel(5);

      if (
        typeof config.press_pwm_us === "number" &&
        Number.isFinite(config.press_pwm_us)
      ) {
        setServoPwmOn(config.press_pwm_us);
      }

      if (
        typeof config.release_pwm_us === "number" &&
        Number.isFinite(config.release_pwm_us)
      ) {
        setServoPwmOff(config.release_pwm_us);
      }

      setServoDelayBefore(0.0);
      setServoDelayAfter(0.0);

      if (
        typeof config.spray_duration_sec === "number" &&
        Number.isFinite(config.spray_duration_sec)
      ) {
        setServoSprayDuration(config.spray_duration_sec);
      }

      if (typeof config.manual_override_timeout_sec === "number" &&
          Number.isFinite(config.manual_override_timeout_sec) &&
          config.manual_override_timeout_sec > 0) {
        setManualOverrideTimeoutSec(config.manual_override_timeout_sec);
      }

      setServoConfigLoaded(true);

      console.log("[Settings] Spray config loaded:", {
        available: config.available,

        controllerState: config.controller_state,

        pressPwm: config.press_pwm_us,

        releasePwm: config.release_pwm_us,

        duration: config.spray_duration_sec,

        fault: config.fault_reason,
      });
    } catch (error) {
      console.error("[Settings] Failed to load spray config:", error);

      setServoConfigLoaded(false);
    }
  };

  const loadLedStatus = async () => {
    // Load from AsyncStorage first (for persistence)
    try {
      const savedLedState = await AsyncStorage.getItem("led_enabled");
      if (savedLedState !== null) {
        const isEnabled = savedLedState === "true";
        setLedEnabled(isEnabled);
        console.log(
          "[Settings] ✅ LED status (from storage):",
          isEnabled ? "ENABLED" : "DISABLED",
        );
      } else {
        console.log(
          "[Settings] ⚠️  No saved LED state found, defaulting to DISABLED",
        );
      }
    } catch (error) {
      console.error(
        "[Settings] ❌ Failed to load LED state from storage:",
        error,
      );
    }

    // Load from backend (if endpoint exists) - gracefully skip if not available yet
    try {
      const response = await services.getLEDControllerStatus();
      if (response?.success && response.enabled !== undefined) {
        setLedEnabled(response.enabled);
        console.log(
          "[Settings] ✅ LED status (from backend):",
          response.enabled ? "ENABLED" : "DISABLED",
        );
      }
    } catch {
      // Backend LED endpoint not yet deployed — fallback to storage value
    }
  };

  // Obstacle sensor status from the rover, polled while Settings is open.
  const refreshObstacleStatus = useCallback(async () => {
    try {
      const status = await getObstacleStatus();
      setObstacleStatus(status);
      setObstacleStatusError(null);
    } catch (error) {
      setObstacleStatusError(
        error instanceof Error ? error.message : "Obstacle status unavailable",
      );
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    void refreshObstacleStatus();
    const timer = setInterval(() => void refreshObstacleStatus(), 1000);
    return () => clearInterval(timer);
  }, [visible, refreshObstacleStatus]);

  // Listen for LED controller status changes from backend
  React.useEffect(() => {
    if (!visible) return;

    const unsubscribe = onMissionEvent((event: any) => {
      if (
        event.type === "led_controller_changed" &&
        event.data?.enabled !== undefined
      ) {
        const timestamp = new Date().toLocaleTimeString();
        const status = event.data.enabled ? "ENABLED ✅" : "DISABLED ⛔";

        console.log("═══════════════════════════════════════");
        console.log("🔔 BACKEND CONFIRMATION RECEIVED");
        console.log("═══════════════════════════════════════");
        console.log("Event Type:", event.type);
        console.log("LED Controller Status:", status);
        console.log("Backend Timestamp:", event.data.timestamp || "N/A");
        console.log("Frontend Received:", timestamp);
        console.log("Full Event Data:", event.data);
        console.log("═══════════════════════════════════════");

        // Update state
        setLedEnabled(event.data.enabled);
        setLastLedUpdate(timestamp);
        setIsLoadingLed(false);

        // Persist to AsyncStorage
        AsyncStorage.setItem("led_enabled", String(event.data.enabled))
          .then(() =>
            console.log(
              "[Settings] LED controller state saved to storage:",
              event.data.enabled,
            ),
          )
          .catch((err) =>
            console.error("[Settings] Failed to save LED state:", err),
          );

        // Show success message
        setSuccessMessage(
          `LED controller ${event.data.enabled ? "enabled" : "disabled"} successfully`,
        );
        setTimeout(() => setSuccessMessage(""), 3000);
      } else if (event.type === "led_error") {
        console.error("═══════════════════════════════════════");
        console.error("❌ LED CONTROLLER ERROR");
        console.error("═══════════════════════════════════════");
        console.error("Error Message:", event.message || "Unknown error");
        console.error("Error Data:", event.data);
        console.error("═══════════════════════════════════════");

        setIsLoadingLed(false);
        Alert.alert(
          "Error",
          `Failed to toggle LED controller: ${event.message || "Unknown error"}`,
        );
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const loadTTSStatus = async () => {
    try {
      const response = await services.getTTSStatus();
      if (response.success) {
        setTtsEnabled(response.enabled || false);
        const lang = response.language || "en";
        setTtsLanguage(
          ["en", "ta", "hi"].includes(lang)
            ? (lang as "en" | "ta" | "hi")
            : "en",
        );
      }
    } catch (error) {
      console.error("[Settings] Failed to load TTS status:", error);
    }

    // Load gender (new endpoint — gracefully skip if not yet deployed)
    try {
      const gRes = await services.getTTSGender();
      if (
        gRes?.success &&
        (gRes.gender === "male" || gRes.gender === "female")
      ) {
        setTtsGender(gRes.gender);
      }
    } catch {
      // Backend gender endpoint not yet deployed — default stays 'male'
    }
  };

  const handleTTSToggle = async (enabled: boolean) => {
    setIsLoadingTTS(true);
    try {
      const response = await services.controlTTS(enabled);
      if (response.success) {
        setTtsEnabled(enabled);
        console.log("[Settings] TTS", enabled ? "enabled" : "disabled");
      } else {
        Alert.alert("Error", "Failed to toggle voice settings");
      }
    } catch (error) {
      console.error("[Settings] TTS toggle error:", error);
      Alert.alert("Error", "Failed to update voice settings");
    } finally {
      setIsLoadingTTS(false);
    }
  };

  const handleLanguageChange = async (lang: "en" | "ta" | "hi") => {
    setIsLoadingTTS(true);
    try {
      const response = await services.setTTSLanguage(lang);
      if (response.success) {
        setTtsLanguage(lang);
        console.log("[Settings] TTS language changed to:", lang);
      } else {
        Alert.alert("Error", "Failed to change language");
      }
    } catch (error) {
      console.error("[Settings] Language change error:", error);
      Alert.alert("Error", "Failed to change language");
    } finally {
      setIsLoadingTTS(false);
    }
  };

  const handleGenderChange = async (gender: "male" | "female") => {
    setIsLoadingTTS(true);
    try {
      const response = await services.setTTSGender(gender);
      if (response.success) {
        setTtsGender(gender);
        console.log("[Settings] TTS gender changed to:", gender);
      } else {
        Alert.alert("Error", "Failed to change voice gender");
      }
    } catch (error) {
      console.error("[Settings] Gender change error:", error);
      Alert.alert(
        "Error",
        "Voice gender endpoint not yet available on backend",
      );
    } finally {
      setIsLoadingTTS(false);
    }
  };

  const handleTestTTS = async () => {
    setIsLoadingTTS(true);
    try {
      const messages = {
        en: "Voice test successful",
        ta: "குரல் சோதனை வெற்றிகரமாக உள்ளது",
        hi: "आवाज परीक्षण सफल",
      };
      await services.testTTS(messages[ttsLanguage]);
    } catch (error) {
      console.error("[Settings] TTS test error:", error);
      Alert.alert("Error", "Voice test failed");
    } finally {
      setIsLoadingTTS(false);
    }
  };

  // Servo Configuration Handlers
  const handleServoEnabledToggle = async (enabled: boolean) => {
    setIsLoadingServo(true);
    try {
      const response = enabled ? await enableSpray() : await disableSpray();
      if (response.success) {
        setServoEnabled(enabled);
        console.log("[Settings] Servo", enabled ? "enabled" : "disabled");
        setSuccessMessage(
          `Servo ${enabled ? "enabled" : "disabled"} successfully`,
        );
        setTimeout(() => setSuccessMessage(""), 3000);
      } else {
        Alert.alert("Error", response.message || "Failed to toggle servo");
      }
    } catch (error) {
      console.error("[Settings] Servo toggle error:", error);
      // ApiError.message carries the backend's detail.message.
      Alert.alert(
        "Error",
        error instanceof Error && error.message
          ? error.message
          : "Failed to update servo settings",
      );
    } finally {
      setIsLoadingServo(false);
    }
  };

  // Spray Duration Save Handler
  const handleSaveDuration = async (duration: number) => {
    try {
      console.log("[Settings] Saving spray duration:", duration);
      const response = await setSprayDuration(duration);
      if (response.success) {
        // Prefer the value the controller reports it applied.
        const applied = response.config?.spray_duration_sec;
        setServoSprayDuration(
          typeof applied === "number" && Number.isFinite(applied)
            ? applied
            : duration,
        );
        setSuccessMessage("Spray duration saved successfully");
        setTimeout(() => setSuccessMessage(""), 3000);
      } else {
        Alert.alert("Save Error", response.message || "Failed to save spray duration");
      }
      return response;
    } catch (error) {
      console.error("[Settings] Spray save error:", error);
      // e.g. "Spray configuration rejected: SPRAY_CONTROLLER_NOT_IDLE".
      return {
        success: false,
        message:
          error instanceof Error && error.message
            ? error.message
            : "Failed to save spray duration",
      };
    }
  };

  // Servo Test Handler
  const handleServoTest = async (duration: number) => {
    try {
      console.log("[Settings] Testing spray config duration:", duration);
      const response = await testSpray(duration);
      console.log("[Settings] Test response:", response);
      return response;
    } catch (error) {
      console.error("[Settings] Spray test error:", error);
      // e.g. "PX4_STATE_UNSAFE" (not armed) or the active-mission refusal.
      return {
        success: false,
        message:
          error instanceof Error && error.message
            ? error.message
            : "Failed to test spray",
      };
    }
  };

  // Open Servo Config Modal: always re-fetch fresh config before showing
  const handleOpenServoConfigModal = async () => {
    setIsLoadingServoModal(true);
    try {
      await loadServoConfig();
    } finally {
      setIsLoadingServoModal(false);
      setShowServoConfigModal(true);
    }
  };

  const handleObstacleDetectionToggle = async (enabled: boolean) => {
    setIsLoadingObstacle(true);
    try {
      // The switch shows the state the rover returns, not the one requested.
      const result = await setObstacleConfig({ enabled });
      if (result.status) setObstacleStatus(result.status);
      setSuccessMessage(
        `Obstacle detection ${result.status?.enabled ? "enabled" : "disabled"} on the rover`,
      );
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      Alert.alert(
        "Obstacle detection not changed",
        error instanceof Error ? error.message : "The rover did not accept the change.",
      );
    } finally {
      setIsLoadingObstacle(false);
      void refreshObstacleStatus();
    }
  };

  const handleLedToggle = async (enabled: boolean) => {
    setIsLoadingLed(true);
    const sendTime = new Date().toLocaleTimeString();

    console.log("═══════════════════════════════════════");
    console.log("📤 SENDING TO BACKEND");
    console.log("═══════════════════════════════════════");
    console.log("Action: Set LED Controller");
    console.log("Requested State:", enabled ? "ENABLE" : "DISABLE");
    console.log("Time Sent:", sendTime);
    console.log("═══════════════════════════════════════");

    try {
      const response = await services.setLEDController(enabled);

      console.log("📥 Initial Response:", response);

      if (response.success) {
        // Treat the REST acknowledgement as the command result. Socket
        // confirmations are optional and must not leave the control blocked.
        setLedEnabled(enabled);
        setIsLoadingLed(false);
        // Persist to AsyncStorage immediately
        AsyncStorage.setItem("led_enabled", String(enabled))
          .then(() =>
            console.log("[Settings] LED state saved to storage:", enabled),
          )
          .catch((err) =>
            console.error("[Settings] Failed to save LED state:", err),
          );
        console.log(
          "✅ Command sent successfully. Waiting for backend confirmation...",
        );
      } else {
        setIsLoadingLed(false);
        console.error("❌ Command failed:", response.message);
        Alert.alert(
          "Error",
          response.message || "Failed to toggle LED controller",
        );
      }
    } catch (error) {
      console.error("═══════════════════════════════════════");
      console.error("💥 EXCEPTION OCCURRED");
      console.error("═══════════════════════════════════════");
      console.error("Error:", error);
      console.error("═══════════════════════════════════════");
      setIsLoadingLed(false);
      Alert.alert("Error", "Failed to update LED controller");
    }
  };

  const getLanguageLabel = (lang: string) => {
    switch (lang) {
      case "en":
        return "English";
      case "ta":
        return "Tamil (தமிழ்)";
      case "hi":
        return "Hindi (हिंदी)";
      default:
        return lang;
    }
  };

  const handleLogout = useCallback(() => {
    Alert.alert(
      "Logout",
      `Logout ${session?.username ?? "admin"} from the DYX Rover application?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            onClose();
            await logout();
          },
        },
      ],
    );
  }, [logout, onClose, session?.username]);

  // Check if mission is active (memoized to prevent recalculating on every render)
  const isMissionActive = React.useMemo(() => {
    const missionStatus = (telemetry.mission.status || "IDLE").toUpperCase();
    const isMissionCompleted =
      telemetry.mission.total_wp > 0 &&
      telemetry.mission.current_wp >= telemetry.mission.total_wp &&
      telemetry.mission.progress_pct >= 100;
    return (
      !["IDLE", "STANDBY", ""].includes(missionStatus) && !isMissionCompleted
    );
  }, [
    telemetry.mission.status,
    telemetry.mission.total_wp,
    telemetry.mission.current_wp,
    telemetry.mission.progress_pct,
  ]);

  // Memoize servo config to prevent unnecessary re-renders and useEffect triggers
  const servoConfig = React.useMemo(
    () => ({
      servo_channel: servoChannel,
      servo_pwm_on: servoPwmOn,
      servo_pwm_off: servoPwmOff,
      servo_delay_before: servoDelayBefore,
      servo_spray_duration: servoSprayDuration,
      servo_delay_after: servoDelayAfter,
      servo_enabled: servoEnabled,
    }),
    [
      servoChannel,
      servoPwmOn,
      servoPwmOff,
      servoDelayBefore,
      servoSprayDuration,
      servoDelayAfter,
      servoEnabled,
    ],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Success Toast */}
        <Toast
          visible={Boolean(successMessage)}
          type="success"
          message={successMessage ? `✅ ${successMessage}` : undefined}
          position="bottom"
          style={styles.successToast}
          onDismiss={() => setSuccessMessage("")}
        />

        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>⚙️ Settings</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 1. RTK Injection Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>📡</Text>
                <Text style={styles.sectionTitle}>RTK Injection</Text>
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>{rtkHeadline}</Text>
                  <Text style={styles.settingDescription}>
                    {rtkStatusMessage}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    canStopRtk ? styles.statusBadgeOn : styles.statusBadgeOff,
                  ]}
                >
                  <Text style={styles.statusBadgeText}>
                    {rtkHeadline.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Configure RTK Button */}
              <TouchableOpacity
                style={[
                  styles.configureButton,
                  isRTKSubmitting && { opacity: 0.6 },
                ]}
                onPress={handleOpenRTKModal}
                disabled={isRTKSubmitting}
              >
                <Text style={styles.configureButtonIcon}>
                  {isRTKSubmitting ? "⏳" : "⚙️"}
                </Text>
                <View style={styles.configureButtonContent}>
                  <Text style={styles.configureButtonTitle}>
                    Configure RTK Injection
                  </Text>
                  <Text style={styles.configureButtonDescription}>
                    Backend RTK profiles, activate, start, and stop
                  </Text>
                </View>
                <Text style={styles.configureButtonArrow}>›</Text>
              </TouchableOpacity>

              {canStopRtk && (
                <TouchableOpacity
                  style={[
                    styles.configureButton,
                    { backgroundColor: "#dc2626", marginTop: 12 },
                  ]}
                  onPress={handleStopRTKStream}
                  disabled={isRTKSubmitting}
                >
                  <Text style={styles.configureButtonIcon}>⏹️</Text>
                  <View style={styles.configureButtonContent}>
                    <Text
                      style={[styles.configureButtonTitle, { color: "#fff" }]}
                    >
                      Stop RTK
                    </Text>
                    <Text
                      style={[
                        styles.configureButtonDescription,
                        { color: "#fca5a5" },
                      ]}
                    >
                      Persist STOPPED on the rover
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* 2. GPS Failsafe Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>🛡️</Text>
                <Text style={styles.sectionTitle}>GPS Mode Config</Text>
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Current Mode</Text>
                  <Text style={styles.settingDescription}>
                    {gpsFailsafeMode === "disable"
                      ? "Disabled - No GPS accuracy checks"
                      : gpsFailsafeMode === "strict"
                        ? "Strict - Pause on low accuracy"
                        : "Relax - Warning only"}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.changeButton}
                  onPress={() => setShowFailsafeSelector(true)}
                  disabled={isMissionActive}
                >
                  <Text style={styles.changeButtonText}>
                    {gpsFailsafeMode.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              </View>

              {isMissionActive && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    ⚠️ Cannot change failsafe mode during active mission
                  </Text>
                </View>
              )}
            </View>

            {/* 3. Mission Mode Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>🎯</Text>
                <Text style={styles.sectionTitle}>Mission Mode</Text>
              </View>

              <Text style={styles.settingDescription}>
                Select the marking tool for the next mission and save it as the rover default. AUTO / MANUAL remains a mission-control choice.
              </Text>

              <View style={styles.languageButtons}>
                {(["LASER", "SPRAY"] as const).map((tool) => (
                  <TouchableOpacity
                    key={tool}
                    style={[
                      styles.languageButton,
                      missionMarkingTool === tool && styles.languageButtonActive,
                      (isMissionActive || isSavingMissionMode) && styles.disabledControl,
                    ]}
                    onPress={() => setMissionMarkingTool(tool)}
                    disabled={isMissionActive || isSavingMissionMode}
                  >
                    <Text style={[
                      styles.languageButtonText,
                      missionMarkingTool === tool && styles.languageButtonTextActive,
                    ]}>
                      {tool}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.settingDescription}>{missionDefaultSummary}</Text>

              <TouchableOpacity
                style={[styles.configureButton, (isMissionActive || isSavingMissionMode) && styles.disabledControl]}
                onPress={() => void handleSaveMissionMode()}
                disabled={isMissionActive || isSavingMissionMode}
              >
                <Text style={styles.configureButtonIcon}>{isSavingMissionMode ? "⏳" : "💾"}</Text>
                <View style={styles.configureButtonContent}>
                  <Text style={styles.configureButtonTitle}>
                    {isSavingMissionMode ? "Saving Mission Mode..." : "Save as Default"}
                  </Text>
                  <Text style={styles.configureButtonDescription}>
                    Applies to future missions; an active mission is never changed.
                  </Text>
                </View>
              </TouchableOpacity>

              {isMissionActive && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>⚠️ Stop the mission before changing its default mode</Text>
                </View>
              )}
            </View>

            {/* 4. Servo Configuration Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>⚡</Text>
                <Text style={styles.sectionTitle}>Spray Configuration</Text>
              </View>

              {/* Read-only status toggle */}
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Spray Controller</Text>

                  <Text style={styles.settingDescription}>
                    AUX5 production spray controller
                  </Text>
                </View>
                <Switch
                  value={servoEnabled}
                  onValueChange={handleServoEnabledToggle}
                  disabled={isLoadingServo}
                  trackColor={{ false: "#4a5568", true: "#10b981" }}
                  thumbColor={servoEnabled ? "#ffffff" : "#d1d5db"}
                />
              </View>

              <View style={styles.divider} />

              {/* Configure Servo Button */}
              <TouchableOpacity
                style={[
                  styles.configureButton,
                  isLoadingServoModal && { opacity: 0.6 },
                ]}
                onPress={handleOpenServoConfigModal}
                disabled={isLoadingServoModal}
              >
                <Text style={styles.configureButtonIcon}>
                  {isLoadingServoModal ? "⏳" : "⚙️"}
                </Text>
                <View style={styles.configureButtonContent}>
                  <Text style={styles.configureButtonTitle}>
                    Configure Spray Settings
                  </Text>
                  <Text style={styles.configureButtonDescription}>
                    {isLoadingServoModal
                      ? "Loading config..."
                      : "Configure AUX5 press and release PWM"}
                  </Text>
                </View>
                <Text style={styles.configureButtonArrow}>›</Text>
              </TouchableOpacity>

              {servoConfigLoaded && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    AUX5 | PRESS: {servoPwmOn} µs | RELEASE: {servoPwmOff} µs
                    {" | "}
                    Spray: {servoSprayDuration.toFixed(2)} s
                  </Text>
                </View>
              )}
            </View>

            {/* 4. MAVLink Parameters Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>⚙️</Text>
                <Text style={styles.sectionTitle}>MAVLink Parameters</Text>
              </View>

              <TouchableOpacity
                style={styles.configureButton}
                onPress={() => setShowParamBrowser(true)}
                disabled={connectionState !== "connected"}
              >
                <Text style={styles.configureButtonIcon}>📋</Text>
                <View style={styles.configureButtonContent}>
                  <Text style={styles.configureButtonTitle}>
                    Browse & Edit Parameters
                  </Text>
                  <Text style={styles.configureButtonDescription}>
                    {connectionState !== "connected"
                      ? "Connect to rover to access parameters"
                      : "View and modify ArduRover parameters by group"}
                  </Text>
                </View>
                <Text style={styles.configureButtonArrow}>›</Text>
              </TouchableOpacity>

              {connectionState === "connected" && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    💡 Tip: Use group filters to find params faster (NAVL1,
                    ATC_STR, WP, etc.)
                  </Text>
                </View>
              )}
            </View>

            {/* 5. Voice Settings Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>🔊</Text>
                <Text style={styles.sectionTitle}>Voice Settings</Text>
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Enable Voice Feedback</Text>
                  <Text style={styles.settingDescription}>
                    Hear mission updates and status announcements
                  </Text>
                </View>
                <Switch
                  value={ttsEnabled}
                  onValueChange={handleTTSToggle}
                  disabled={isLoadingTTS}
                  trackColor={{ false: "#4a5568", true: "#10b981" }}
                  thumbColor={ttsEnabled ? "#ffffff" : "#d1d5db"}
                />
              </View>

              {ttsEnabled && (
                <>
                  <View style={styles.divider} />

                  {/* Gender Selection */}
                  <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Voice Gender</Text>
                  </View>
                  <View style={styles.languageButtons}>
                    {(["male", "female"] as const).map((g) => (
                      <TouchableOpacity
                        key={g}
                        style={[
                          styles.languageButton,
                          ttsGender === g && styles.languageButtonActive,
                        ]}
                        onPress={() => handleGenderChange(g)}
                        disabled={isLoadingTTS}
                      >
                        <Text
                          style={[
                            styles.languageButtonText,
                            ttsGender === g && styles.languageButtonTextActive,
                          ]}
                        >
                          {g === "male" ? "👨 Male" : "👩 Female"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.divider} />

                  {/* Language Selection */}
                  <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Language</Text>
                  </View>
                  <View style={styles.languageButtons}>
                    {(["en", "ta", "hi"] as const).map((lang) => (
                      <TouchableOpacity
                        key={lang}
                        style={[
                          styles.languageButton,
                          ttsLanguage === lang && styles.languageButtonActive,
                        ]}
                        onPress={() => handleLanguageChange(lang)}
                        disabled={isLoadingTTS}
                      >
                        <Text
                          style={[
                            styles.languageButtonText,
                            ttsLanguage === lang &&
                              styles.languageButtonTextActive,
                          ]}
                        >
                          {getLanguageLabel(lang)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={styles.testButton}
                    onPress={handleTestTTS}
                    disabled={isLoadingTTS}
                  >
                    <Text style={styles.testButtonText}>🎵 Test Voice</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* 5. LED Controller Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>💡</Text>
                <Text style={styles.sectionTitle}>LED Controller</Text>
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Enable LED Controller</Text>
                  <Text style={styles.settingDescription}>
                    Control LED indicator lights for system status
                  </Text>
                </View>
                <Switch
                  value={ledEnabled}
                  onValueChange={handleLedToggle}
                  disabled={isLoadingLed}
                  trackColor={{ false: "#4a5568", true: "#fbbf24" }}
                  thumbColor={ledEnabled ? "#ffffff" : "#d1d5db"}
                />
              </View>

              {lastLedUpdate && (
                <Text style={styles.timestampText}>
                  Last updated: {lastLedUpdate}
                </Text>
              )}
            </View>

            {/* 6. Obstacle Detection Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>🚫</Text>
                <Text style={styles.sectionTitle}>Obstacle Detection</Text>
              </View>

              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Stop for obstacles ahead</Text>
                  <Text style={styles.settingDescription}>
                    {obstacleStatus && obstacleStatus.danger_mm !== null && obstacleStatus.warning_mm !== null
                      ? `Pauses the mission at ≤ ${formatMetres(obstacleStatus.danger_mm)} · announces at ≤ ${formatMetres(obstacleStatus.warning_mm)}`
                      : "Pauses the mission when something is close ahead"}
                  </Text>
                </View>
                {isLoadingObstacle ? (
                  <ActivityIndicator color={colors.textSecondary} />
                ) : (
                  <Switch
                    value={obstacleStatus?.enabled ?? false}
                    onValueChange={handleObstacleDetectionToggle}
                    disabled={!obstacleStatus}
                    trackColor={{ false: "#4a5568", true: "#10b981" }}
                    thumbColor={obstacleStatus?.enabled ? "#ffffff" : "#d1d5db"}
                  />
                )}
              </View>

              <View style={styles.obstacleReadingRow}>
                <View
                  style={[
                    styles.obstacleDot,
                    { backgroundColor: obstacleZoneColor(obstacleStatus) },
                  ]}
                />
                <Text style={styles.obstacleReadingText}>
                  {obstacleStatusError && !obstacleStatus
                    ? `Sensor status unavailable: ${obstacleStatusError}`
                    : obstacleReadingText(obstacleStatus)}
                </Text>
              </View>

              {obstacleStatus && !obstacleStatus.healthy && (
                <Text style={styles.obstacleWarningText}>
                  ⚠ Sensor not reporting
                  {obstacleStatus.serial_error ? `: ${obstacleStatus.serial_error}` : ""}.
                  {obstacleStatus.enabled
                    ? " Missions continue WITHOUT obstacle protection."
                    : ""}
                </Text>
              )}

              {obstacleStatus?.enabled && obstacleStatus.zone === "danger" && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    START, RESUME and NEXT are blocked while something is inside
                    the stop distance. Clear the path first.
                  </Text>
                </View>
              )}
            </View>

            {/* 7. Sprayer Configuration Section */}
            <View style={[styles.section, styles.sectionDisabled]}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionIcon}>💧</Text>
                <Text style={styles.sectionTitle}>Sprayer Configuration</Text>
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonText}>Coming Soon</Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              accessibilityRole="button"
              accessibilityLabel="Logout from rover"
            >
              <Text style={styles.logoutButtonText}>Logout</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.doneButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close settings"
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Failsafe Mode Selector Modal */}

        {/* Failsafe Mode Selector Modal */}
        <FailsafeModeSelector
          visible={showFailsafeSelector}
          currentMode={gpsFailsafeMode}
          onModeChange={setGpsFailsafeMode}
          onClose={() => setShowFailsafeSelector(false)}
          disabled={isMissionActive}
        />

        {/* Servo Configuration Modal */}
        <ServoConfigModal
          visible={showServoConfigModal}
          currentConfig={servoConfig}
          onClose={() => setShowServoConfigModal(false)}
          onSave={handleSaveDuration}
          onTest={handleServoTest}
          maxDurationSec={manualOverrideTimeoutSec}
        />

        {/* MAVLink Param Browser Modal */}
        <ParamBrowserModal
          visible={showParamBrowser}
          onClose={() => setShowParamBrowser(false)}
        />

        <RTKInjectionScreen
          visible={showRTKModal}
          asModal={false}
          onClose={() => {
            setShowRTKModal(false);
            void refreshSettingsRtkStatus();
          }}
          services={services}
          isConnected={connectionState === "connected"}
        />
      </View>
    </Modal>
  );
};

// Wrap with React.memo to prevent unnecessary re-renders
// Only re-render when visible or onClose changes
export const SettingsScreen = React.memo(
  SettingsScreenComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.visible === nextProps.visible &&
      prevProps.onClose === nextProps.onClose
    );
  },
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "95%",
    maxWidth: 800,
    height: "95%",
    backgroundColor: "#1a1a1a",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(103, 232, 249, 0.3)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: "#002244",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(103, 232, 249, 0.3)",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 20,
    color: colors.text,
    fontWeight: "bold",
  },
  content: {
    flex: 1,
    flexGrow: 1,
    minHeight: 400,
  },
  scrollContent: {
    padding: 24,
    flexGrow: 1,
  },
  section: {
    backgroundColor: "#2a2a2a",
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(103, 232, 249, 0.2)",
  },
  sectionDisabled: {
    opacity: 0.5,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  sectionIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.text,
    flex: 1,
  },
  comingSoonBadge: {
    backgroundColor: "rgba(251, 191, 36, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#fbbf24",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  settingInfo: {
    flex: 1,
    marginRight: 2,
  },
  settingLabel: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 15,
    color: "#94a3b8",
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(103, 232, 249, 0.2)",
    marginVertical: 12,
  },
  languageButtons: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  languageButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#1a1a1a",
    borderWidth: 2,
    borderColor: "#4a5568",
    alignItems: "center",
  },
  languageButtonActive: {
    backgroundColor: "#06b6d4",
    borderColor: "#06b6d4",
  },
  languageButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94a3b8",
  },
  languageButtonTextActive: {
    color: colors.text,
  },
  disabledControl: {
    opacity: 0.5,
  },
  testButton: {
    backgroundColor: "#7c3aed",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 4,
  },
  testButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  changeButton: {
    backgroundColor: "#1a75d2",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#059669",
  },
  changeButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  warningBox: {
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    borderWidth: 1,
    borderColor: "#fbbf24",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  warningText: {
    fontSize: 13,
    color: "#fbbf24",
    textAlign: "center",
  },
  infoBox: {
    backgroundColor: "rgba(6, 182, 212, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(103, 232, 249, 0.3)",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  infoText: {
    fontSize: 13,
    color: "#67e8f9",
    lineHeight: 18,
  },
  timestampText: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 8,
    fontStyle: "italic",
  },
  obstacleReadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  obstacleDot: { width: 10, height: 10, borderRadius: 5 },
  obstacleReadingText: { color: colors.textSecondary, fontWeight: "600" },
  obstacleWarningText: { color: colors.warning, marginTop: 6 },
  successToast: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: "#10b981",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 9999,
  },
  successToastText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  successIcon: {
    fontSize: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#002244",
    borderTopWidth: 1,
    borderTopColor: "rgba(103, 232, 249, 0.3)",
    flexDirection: "row",
    gap: 12,
  },

  logoutButton: {
    flex: 1,
    backgroundColor: "#7F1D1D",
    borderWidth: 1,
    borderColor: "#EF4444",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },

  logoutButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FEE2E2",
  },

  doneButton: {
    flex: 1,
    backgroundColor: "#10b981",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },

  doneButtonText: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.text,
  },
  // Servo Configuration Styles
  channelButtons: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  channelButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#1a1a1a",
    borderWidth: 2,
    borderColor: "#4a5568",
    alignItems: "center",
  },
  channelButtonActive: {
    backgroundColor: "#f59e0b",
    borderColor: "#f59e0b",
  },
  channelButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94a3b8",
  },
  channelButtonTextActive: {
    color: "#1a1a1a",
  },
  pwmContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  pwmInput: {
    flex: 1,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
  },
  pwmLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
    marginBottom: 8,
    textAlign: "center",
  },
  pwmValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pwmButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  pwmButtonText: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.text,
  },
  pwmValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#f59e0b",
    minWidth: 60,
    textAlign: "center",
  },
  timingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    padding: 12,
  },
  timingInfo: {
    flex: 1,
  },
  timingLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 2,
  },
  timingDescription: {
    fontSize: 12,
    color: "#94a3b8",
  },
  timingControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  timingButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: "#374151",
    justifyContent: "center",
    alignItems: "center",
  },
  timingButtonText: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.text,
  },
  timingValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#10b981",
    minWidth: 50,
    textAlign: "center",
    marginHorizontal: 8,
  },
  // New Servo UI Styles
  statusBadge: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  statusBadgeOn: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    borderColor: "#10b981",
  },
  statusBadgeOff: {
    backgroundColor: "rgba(107, 114, 128, 0.2)",
    borderColor: "#6b7280",
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: "bold",
    color: colors.text,
  },
  configureButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a75d2",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#059669",
  },
  configureButtonIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  configureButtonContent: {
    flex: 1,
  },
  configureButtonTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.text,
    marginBottom: 4,
  },
  configureButtonDescription: {
    fontSize: 13,
    color: "#94a3b8",
  },
  configureButtonArrow: {
    fontSize: 32,
    color: colors.text,
    fontWeight: "bold",
  },
});
