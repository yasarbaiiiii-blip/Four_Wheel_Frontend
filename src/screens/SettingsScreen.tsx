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
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../theme/colors";
import { useRover } from "../context/RoverContext";
// import { FailsafeModeSelector } from "../components/pathplan/FailsafeModeSelector";
import { ServoConfigModal } from "../components/settings/ServoConfigModal";
import { ParamBrowserModal } from "../components/settings/ParamBrowserModal";
import { RTKInjectionScreen } from "../components/missionreport/RTKInjectionScreen";
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

export type SettingsCategory =
  | "rtk"
  | "spray"
  | "mission"
  | "obstacle"
  | "voice"
  | "led"
  | "mavlink";

interface SettingsCategoryItem {
  id: SettingsCategory;
  title: string;
  subtitle: string;
  icon: string;
}

const SETTINGS_CATEGORIES: SettingsCategoryItem[] = [
  { id: "rtk", title: "GNSS & RTK", subtitle: "Differential fix & NTRIP", icon: "📡" },
  { id: "spray", title: "Spray Actuator", subtitle: "AUX5 servo & duration", icon: "⚡" },
  { id: "mission", title: "Mission Defaults", subtitle: "Marking tool & defaults", icon: "🎯" },
  { id: "obstacle", title: "Obstacle Safety", subtitle: "Front LiDAR & auto-stop", icon: "🚫" },
  { id: "voice", title: "Voice Feedback", subtitle: "Language & audio updates", icon: "🔊" },
  { id: "led", title: "LED Controller", subtitle: "Chassis indicator lights", icon: "💡" },
  { id: "mavlink", title: "MAVLink Params", subtitle: "ArduRover autopilot", icon: "⚙️" },
];

const SettingsScreenComponent: React.FC<SettingsScreenProps> = ({
  visible,
  onClose,
}) => {
  const { logout, session } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<SettingsCategory>("rtk");

  const {
    gpsFailsafeMode,
    setGpsFailsafeMode,
    telemetry,
    services,
    connectionState,
    onMissionEvent,
  } = useRover();
  // const [showFailsafeSelector, setShowFailsafeSelector] = useState(false);

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
      transparent={false}
      onRequestClose={onClose}
      supportedOrientations={[
        "portrait",
        "portrait-upside-down",
        "landscape",
        "landscape-left",
        "landscape-right",
      ]}
    >
      <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        {/* Success Toast */}
        <Toast
          visible={Boolean(successMessage)}
          type="success"
          message={successMessage ? `✅ ${successMessage}` : undefined}
          position="bottom"
          style={styles.successToast}
          onDismiss={() => setSuccessMessage("")}
        />

        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconBadge}>
              <Text style={styles.headerIconText}>⚙️</Text>
            </View>
            <View>
              <View style={styles.headerTitleRow}>
                <Text style={styles.headerTitle}>System Settings</Text>
                <View style={styles.onlineBadge}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.onlineBadgeText}>
                    {connectionState === "connected" ? "ROVER ONLINE" : "OFFLINE"}
                  </Text>
                </View>
              </View>
              <Text style={styles.headerSubtitle}>
                Rover configuration, precision actuators, and safety telemetry
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close settings"
          >
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Master-Detail Split Body */}
        <View style={styles.bodySplit}>
          {/* Left Navigation Sidebar */}
          <View style={styles.sidebar}>
            <Text style={styles.sidebarHeading}>CATEGORIES</Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sidebarList}
            >
              {SETTINGS_CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}
                    onPress={() => setSelectedCategory(cat.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.sidebarItemIconWrap, isActive && styles.sidebarItemIconWrapActive]}>
                      <Text style={styles.sidebarItemIcon}>{cat.icon}</Text>
                    </View>
                    <View style={styles.sidebarItemTextContainer}>
                      <Text style={[styles.sidebarItemTitle, isActive && styles.sidebarItemTitleActive]}>
                        {cat.title}
                      </Text>
                      <Text
                        style={[styles.sidebarItemSubtitle, isActive && styles.sidebarItemSubtitleActive]}
                        numberOfLines={1}
                      >
                        {cat.subtitle}
                      </Text>
                    </View>
                    {isActive && <Text style={styles.sidebarActiveArrow}>›</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Right Detail Panel */}
          <View style={styles.detailContainer}>
            {selectedCategory === "rtk" ? (
              <View style={styles.rtkDetailContainer}>
                <RTKInjectionScreen
                  visible={visible && selectedCategory === "rtk"}
                  embedded={true}
                  onClose={() => {}}
                  isConnected={connectionState === "connected"}
                  services={services}
                />
              </View>
            ) : (
              <ScrollView
                style={styles.detailScroll}
                contentContainerStyle={styles.detailScrollContent}
                showsVerticalScrollIndicator={false}
              >

              {/* 2. Spray Actuator Category */}
              {selectedCategory === "spray" && (
                <View style={styles.detailCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={styles.cardHeaderIconBadge}>
                        <Text style={styles.cardHeaderIcon}>⚡</Text>
                      </View>
                      <View>
                        <Text style={styles.cardEyebrow}>ACTUATOR HARDWARE</Text>
                        <Text style={styles.cardTitle}>Spray Configuration</Text>
                      </View>
                    </View>
                    <Switch
                      value={servoEnabled}
                      onValueChange={handleServoEnabledToggle}
                      disabled={isLoadingServo}
                      trackColor={{ false: "#CBD5E1", true: "#1475EE" }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingLabel}>Spray Controller</Text>
                      <Text style={styles.settingDescription}>
                        AUX5 production spray controller master switch
                      </Text>
                    </View>
                  </View>

                  {servoConfigLoaded && (
                    <View style={styles.telemetryWell}>
                      <View style={styles.telemetryWellRow}>
                        <Text style={styles.telemetryWellLabel}>Hardware Mapping:</Text>
                        <Text style={styles.telemetryWellBadge}>AUX5 CHANNEL</Text>
                      </View>
                      <View style={styles.telemetryWellDivider} />
                      <View style={styles.telemetryWellGrid}>
                        <View style={styles.telemetryWellItem}>
                          <Text style={styles.telemetryWellItemLabel}>PRESS PWM</Text>
                          <Text style={styles.telemetryWellItemValue}>{servoPwmOn} µs</Text>
                        </View>
                        <View style={styles.telemetryWellItem}>
                          <Text style={styles.telemetryWellItemLabel}>RELEASE PWM</Text>
                          <Text style={styles.telemetryWellItemValue}>{servoPwmOff} µs</Text>
                        </View>
                        <View style={styles.telemetryWellItem}>
                          <Text style={styles.telemetryWellItemLabel}>SPRAY DURATION</Text>
                          <Text style={[styles.telemetryWellItemValue, { color: "#1475EE" }]}>
                            {servoSprayDuration.toFixed(2)} s
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  <View style={styles.divider} />

                  <TouchableOpacity
                    style={[
                      styles.configureTile,
                      isLoadingServoModal && { opacity: 0.6 },
                    ]}
                    onPress={handleOpenServoConfigModal}
                    disabled={isLoadingServoModal}
                  >
                    <View style={styles.configureTileIconWrap}>
                      <Text style={styles.configureTileIcon}>
                        {isLoadingServoModal ? "⏳" : "⚙️"}
                      </Text>
                    </View>
                    <View style={styles.configureTileContent}>
                      <Text style={styles.configureTileTitle}>
                        Configure Spray Settings
                      </Text>
                      <Text style={styles.configureTileDescription}>
                        {isLoadingServoModal
                          ? "Loading config..."
                          : "Configure AUX5 press and release PWM thresholds"}
                      </Text>
                    </View>
                    <View style={styles.chevronCircle}>
                      <Text style={styles.chevronText}>›</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}

              {/* 3. Mission Mode Defaults Category */}
              {selectedCategory === "mission" && (
                <View style={styles.detailCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={styles.cardHeaderIconBadge}>
                        <Text style={styles.cardHeaderIcon}>🎯</Text>
                      </View>
                      <View>
                        <Text style={styles.cardEyebrow}>AUTONOMOUS MARKING</Text>
                        <Text style={styles.cardTitle}>Mission Mode Defaults</Text>
                      </View>
                    </View>
                  </View>

                  <Text style={styles.cardDescription}>
                    Select the marking tool for the next mission and save it as the rover default. AUTO / MANUAL remains a mission-control choice.
                  </Text>

                  <View style={styles.segmentedContainer}>
                    {(["LASER", "SPRAY"] as const).map((tool) => {
                      const isSelected = missionMarkingTool === tool;
                      return (
                        <TouchableOpacity
                          key={tool}
                          style={[
                            styles.segmentedButton,
                            isSelected && styles.segmentedButtonActive,
                            (isMissionActive || isSavingMissionMode) && styles.disabledControl,
                          ]}
                          onPress={() => setMissionMarkingTool(tool)}
                          disabled={isMissionActive || isSavingMissionMode}
                        >
                          <Text style={styles.segmentedButtonIcon}>
                            {tool === "SPRAY" ? "💧" : "🎯"}
                          </Text>
                          <Text
                            style={[
                              styles.segmentedButtonText,
                              isSelected && styles.segmentedButtonTextActive,
                            ]}
                          >
                            {tool}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.infoWell}>
                    <Text style={styles.infoWellText}>{missionDefaultSummary}</Text>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.primaryActionButton,
                      (isMissionActive || isSavingMissionMode) && styles.disabledControl,
                    ]}
                    onPress={() => void handleSaveMissionMode()}
                    disabled={isMissionActive || isSavingMissionMode}
                  >
                    <Text style={styles.primaryActionIcon}>
                      {isSavingMissionMode ? "⏳" : "💾"}
                    </Text>
                    <Text style={styles.primaryActionText}>
                      {isSavingMissionMode ? "Saving Mission Mode..." : "Save as Default"}
                    </Text>
                  </TouchableOpacity>

                  {isMissionActive && (
                    <View style={styles.warningBox}>
                      <Text style={styles.warningText}>
                        ⚠️ Stop the mission before changing its default mode
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* 4. Obstacle Safety Category */}
              {selectedCategory === "obstacle" && (
                <View style={styles.detailCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={styles.cardHeaderIconBadge}>
                        <Text style={styles.cardHeaderIcon}>🚫</Text>
                      </View>
                      <View>
                        <Text style={styles.cardEyebrow}>COLLISION AVOIDANCE</Text>
                        <Text style={styles.cardTitle}>Obstacle Detection</Text>
                      </View>
                    </View>
                    {isLoadingObstacle ? (
                      <ActivityIndicator color="#1475EE" />
                    ) : (
                      <Switch
                        value={obstacleStatus?.enabled ?? false}
                        onValueChange={handleObstacleDetectionToggle}
                        disabled={!obstacleStatus}
                        trackColor={{ false: "#CBD5E1", true: "#1475EE" }}
                        thumbColor="#FFFFFF"
                      />
                    )}
                  </View>

                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingLabel}>Stop for obstacles ahead</Text>
                      <Text style={styles.settingDescription}>
                        {obstacleStatus && obstacleStatus.danger_mm !== null && obstacleStatus.warning_mm !== null
                          ? `Pauses the mission at ≤ ${formatMetres(obstacleStatus.danger_mm)} · announces at ≤ ${formatMetres(obstacleStatus.warning_mm)}`
                          : "Pauses the mission when something is close ahead in the forward corridor"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.obstacleReadingCard}>
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
                    <View style={styles.warningBox}>
                      <Text style={styles.warningText}>
                        ⚠ Sensor not reporting
                        {obstacleStatus.serial_error ? `: ${obstacleStatus.serial_error}` : ""}.
                        {obstacleStatus.enabled
                          ? " Missions continue WITHOUT obstacle protection."
                          : ""}
                      </Text>
                    </View>
                  )}

                  {obstacleStatus?.enabled && obstacleStatus.zone === "danger" && (
                    <View style={styles.dangerBox}>
                      <Text style={styles.dangerText}>
                        🚫 START, RESUME and NEXT are blocked while something is inside
                        the stop distance. Clear the path first.
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* 5. Voice Feedback Category */}
              {selectedCategory === "voice" && (
                <View style={styles.detailCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={styles.cardHeaderIconBadge}>
                        <Text style={styles.cardHeaderIcon}>🔊</Text>
                      </View>
                      <View>
                        <Text style={styles.cardEyebrow}>AUDITORY TELEMETRY</Text>
                        <Text style={styles.cardTitle}>Voice Settings</Text>
                      </View>
                    </View>
                    <Switch
                      value={ttsEnabled}
                      onValueChange={handleTTSToggle}
                      disabled={isLoadingTTS}
                      trackColor={{ false: "#CBD5E1", true: "#1475EE" }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingLabel}>Enable Voice Feedback</Text>
                      <Text style={styles.settingDescription}>
                        Hear spoken mission updates, status announcements, and warnings
                      </Text>
                    </View>
                  </View>

                  {ttsEnabled && (
                    <>
                      <View style={styles.divider} />

                      <Text style={styles.subLabel}>Voice Gender</Text>
                      <View style={styles.segmentedContainer}>
                        {(["male", "female"] as const).map((g) => {
                          const isSelected = ttsGender === g;
                          return (
                            <TouchableOpacity
                              key={g}
                              style={[
                                styles.segmentedButton,
                                isSelected && styles.segmentedButtonActive,
                              ]}
                              onPress={() => handleGenderChange(g)}
                              disabled={isLoadingTTS}
                            >
                              <Text style={styles.segmentedButtonIcon}>
                                {g === "male" ? "👨" : "👩"}
                              </Text>
                              <Text
                                style={[
                                  styles.segmentedButtonText,
                                  isSelected && styles.segmentedButtonTextActive,
                                ]}
                              >
                                {g === "male" ? "Male Voice" : "Female Voice"}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <Text style={[styles.subLabel, { marginTop: 14 }]}>Language</Text>
                      <View style={styles.segmentedContainer}>
                        {(["en", "ta", "hi"] as const).map((lang) => {
                          const isSelected = ttsLanguage === lang;
                          return (
                            <TouchableOpacity
                              key={lang}
                              style={[
                                styles.segmentedButton,
                                isSelected && styles.segmentedButtonActive,
                              ]}
                              onPress={() => handleLanguageChange(lang)}
                              disabled={isLoadingTTS}
                            >
                              <Text
                                style={[
                                  styles.segmentedButtonText,
                                  isSelected && styles.segmentedButtonTextActive,
                                ]}
                              >
                                {getLanguageLabel(lang)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <TouchableOpacity
                        style={styles.testVoiceButton}
                        onPress={handleTestTTS}
                        disabled={isLoadingTTS}
                      >
                        <Text style={styles.testVoiceButtonIcon}>🎵</Text>
                        <Text style={styles.testVoiceButtonText}>Test Voice Output</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}

              {/* 6. LED Controller Category */}
              {selectedCategory === "led" && (
                <View style={styles.detailCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={styles.cardHeaderIconBadge}>
                        <Text style={styles.cardHeaderIcon}>💡</Text>
                      </View>
                      <View>
                        <Text style={styles.cardEyebrow}>CHASSIS LIGHTING</Text>
                        <Text style={styles.cardTitle}>LED Controller</Text>
                      </View>
                    </View>
                    <Switch
                      value={ledEnabled}
                      onValueChange={handleLedToggle}
                      disabled={isLoadingLed}
                      trackColor={{ false: "#CBD5E1", true: "#F59E0B" }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <Text style={styles.settingLabel}>Enable LED Indicator Lights</Text>
                      <Text style={styles.settingDescription}>
                        Control high-visibility status LED indicators mounted on the rover body
                      </Text>
                    </View>
                  </View>

                  {lastLedUpdate ? (
                    <View style={styles.infoWell}>
                      <Text style={styles.infoWellText}>
                        Last confirmed by rover: {lastLedUpdate}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}

              {/* 7. MAVLink Parameters Category */}
              {selectedCategory === "mavlink" && (
                <View style={styles.detailCard}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardHeaderLeft}>
                      <View style={styles.cardHeaderIconBadge}>
                        <Text style={styles.cardHeaderIcon}>⚙️</Text>
                      </View>
                      <View>
                        <Text style={styles.cardEyebrow}>AUTOPILOT CONFIGURATION</Text>
                        <Text style={styles.cardTitle}>MAVLink Parameters</Text>
                      </View>
                    </View>
                  </View>

                  <Text style={styles.cardDescription}>
                    Inspect and configure low-level ArduRover autopilot parameters grouped by subsystems (NAVL1, ATC_STR, WP, GPS).
                  </Text>

                  <TouchableOpacity
                    style={styles.configureTile}
                    onPress={() => setShowParamBrowser(true)}
                    disabled={connectionState !== "connected"}
                  >
                    <View style={styles.configureTileIconWrap}>
                      <Text style={styles.configureTileIcon}>📋</Text>
                    </View>
                    <View style={styles.configureTileContent}>
                      <Text style={styles.configureTileTitle}>
                        Browse & Edit Parameters
                      </Text>
                      <Text style={styles.configureTileDescription}>
                        {connectionState !== "connected"
                          ? "Connect to rover to access parameters"
                          : "View and modify ArduRover parameters by group"}
                      </Text>
                    </View>
                    <View style={styles.chevronCircle}>
                      <Text style={styles.chevronText}>›</Text>
                    </View>
                  </TouchableOpacity>

                  {connectionState === "connected" && (
                    <View style={[styles.infoWell, { marginTop: 14 }]}>
                      <Text style={styles.infoWellText}>
                        💡 Tip: Use group filters inside the browser to find params faster (NAVL1, ATC_STR, WP, etc.)
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </View>

      {/* Bottom Footer */}
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
    </SafeAreaView>
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
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#F1F5F9",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#D8E0EA",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EAF3FF",
    borderWidth: 1,
    borderColor: "#D6E6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  headerIconText: {
    fontSize: 20,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#10244B",
    letterSpacing: -0.2,
  },
  onlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E6F8F1",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 5,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16B980",
  },
  onlineBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#059669",
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: "#526B93",
    fontSize: 12,
    fontWeight: "500",
    marginTop: 2,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#D8E0EA",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 16,
    color: "#526B93",
    fontWeight: "700",
    lineHeight: 18,
  },
  bodySplit: {
    flex: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  sidebar: {
    width: 250,
    backgroundColor: "#FFFFFF",
    borderRightWidth: 1,
    borderRightColor: "#D8E0EA",
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  sidebarHeading: {
    fontSize: 11,
    fontWeight: "800",
    color: "#6681AD",
    letterSpacing: 0.8,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  sidebarList: {
    paddingBottom: 20,
    gap: 4,
  },
  sidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  sidebarItemActive: {
    backgroundColor: "#EAF3FF",
    borderColor: "#D6E6FF",
  },
  sidebarItemIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  sidebarItemIconWrapActive: {
    backgroundColor: "#D6E6FF",
  },
  sidebarItemIcon: {
    fontSize: 17,
  },
  sidebarItemTextContainer: {
    flex: 1,
  },
  sidebarItemTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#315987",
  },
  sidebarItemTitleActive: {
    color: "#1475EE",
    fontWeight: "800",
  },
  sidebarItemSubtitle: {
    fontSize: 11,
    color: "#889BB7",
    fontWeight: "500",
    marginTop: 1,
  },
  sidebarItemSubtitleActive: {
    color: "#3B82F6",
  },
  sidebarActiveArrow: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1475EE",
    marginLeft: 4,
  },
  detailContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  rtkDetailContainer: {
    flex: 1,
    padding: 16,
  },
  detailScroll: {
    flex: 1,
  },
  detailScrollContent: {
    padding: 24,
    maxWidth: 820,
    width: "100%",
  },
  detailCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE8F7",
    padding: 20,
    shadowColor: "#173563",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  cardHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardHeaderIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#EAF3FF",
    borderWidth: 1,
    borderColor: "#D6E6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  cardHeaderIcon: {
    fontSize: 20,
  },
  cardEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6681AD",
    letterSpacing: 0.8,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#10244B",
    marginTop: 2,
  },
  cardDescription: {
    fontSize: 13,
    color: "#526B93",
    lineHeight: 19,
    marginBottom: 14,
  },
  statusBadge: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeOn: {
    backgroundColor: "#E6F8F1",
    borderColor: "#A7F3D0",
  },
  statusBadgeOff: {
    backgroundColor: "#F1F5F9",
    borderColor: "#CBD5E1",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#10244B",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 4,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#10244B",
    marginBottom: 3,
  },
  settingDescription: {
    fontSize: 13,
    color: "#526B93",
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 14,
  },
  configureTile: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F7FAFF",
    borderWidth: 1,
    borderColor: "#D0E1FD",
    borderRadius: 12,
    padding: 14,
  },
  configureTileIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#EAF3FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  configureTileIcon: {
    fontSize: 18,
  },
  configureTileContent: {
    flex: 1,
  },
  configureTileTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1475EE",
  },
  configureTileDescription: {
    fontSize: 12,
    color: "#526B93",
    marginTop: 2,
  },
  chevronCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#EAF3FF",
    justifyContent: "center",
    alignItems: "center",
  },
  chevronText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1475EE",
  },
  stopRtkButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF5F5",
    borderWidth: 1,
    borderColor: "#FED7D7",
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  stopRtkButtonIcon: {
    fontSize: 20,
  },
  stopRtkButtonTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#E53E3E",
  },
  stopRtkButtonDescription: {
    fontSize: 12,
    color: "#9B2C2C",
    marginTop: 2,
  },
  telemetryWell: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 14,
    marginVertical: 12,
  },
  telemetryWellRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  telemetryWellLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  telemetryWellBadge: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1475EE",
    backgroundColor: "#EAF3FF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },
  telemetryWellDivider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 10,
  },
  telemetryWellGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  telemetryWellItem: {
    flex: 1,
    alignItems: "center",
  },
  telemetryWellItemLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  telemetryWellItemValue: {
    fontSize: 14,
    fontWeight: "800",
    color: "#10244B",
  },
  segmentedContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    padding: 4,
    gap: 6,
    marginVertical: 8,
  },
  segmentedButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  segmentedButtonActive: {
    backgroundColor: "#1475EE",
    shadowColor: "#1475EE",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentedButtonIcon: {
    fontSize: 14,
  },
  segmentedButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  segmentedButtonTextActive: {
    color: "#FFFFFF",
  },
  subLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#315987",
    marginBottom: 6,
    marginTop: 10,
  },
  infoWell: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
  },
  infoWellText: {
    fontSize: 12,
    color: "#166534",
    lineHeight: 17,
    fontWeight: "500",
  },
  primaryActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1475EE",
    borderRadius: 12,
    paddingVertical: 13,
    marginVertical: 10,
    shadowColor: "#1475EE",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  primaryActionIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  warningBox: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
  },
  warningText: {
    fontSize: 12,
    color: "#B45309",
    lineHeight: 17,
    fontWeight: "500",
  },
  dangerBox: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
  },
  dangerText: {
    fontSize: 12,
    color: "#B91C1C",
    lineHeight: 17,
    fontWeight: "500",
  },
  obstacleReadingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 12,
    gap: 10,
    marginVertical: 8,
  },
  obstacleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  obstacleReadingText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
  },
  testVoiceButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 12,
  },
  testVoiceButtonIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  testVoiceButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
  },
  disabledControl: {
    opacity: 0.5,
  },
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
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#D8E0EA",
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 14,
  },
  logoutButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#FFF5F3",
    borderWidth: 1,
    borderColor: "#FFD9D2",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#D94A42",
  },
  doneButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#1475EE",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1475EE",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  doneButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
