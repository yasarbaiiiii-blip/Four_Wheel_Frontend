import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SPRAY_DURATION_MAX_MS,
  SPRAY_DURATION_MIN_MS,
  SPRAY_DURATION_STEP_MS,
  SprayTestStatus,
} from "../../hooks/useSprayActuator";

export interface SprayActuatorCardProps {
  draftServoEnabled: boolean;
  onToggleEnabled: (value: boolean) => void;
  draftDurationMs: number;
  onAdjustDuration: (deltaMs: number) => void;
  onSetDirectDuration: (ms: number) => void;
  isDirty: boolean;
  channel: number;
  pressPwmUs: number;
  releasePwmUs: number;
  configLoaded: boolean;
  isLoadingConfig: boolean;
  isOnline: boolean;
  canTestSpray: boolean;
  disabledTestReason: string | null;
  isTesting: boolean;
  testStatus: SprayTestStatus;
  testErrorMessage: string | null;
  onExecuteTest: () => Promise<{ success: boolean; message?: string }>;
}

export const SprayActuatorCard: React.FC<SprayActuatorCardProps> = ({
  draftServoEnabled,
  onToggleEnabled,
  draftDurationMs,
  onAdjustDuration,
  onSetDirectDuration,
  isDirty,
  channel,
  pressPwmUs,
  releasePwmUs,
  configLoaded,
  isLoadingConfig,
  isOnline,
  canTestSpray,
  disabledTestReason,
  isTesting,
  testStatus,
  testErrorMessage,
  onExecuteTest,
}) => {
  // Tap-to-type direct entry state
  const [isEditingDuration, setIsEditingDuration] = useState(false);
  const [durationInputText, setDurationInputText] = useState(
    (draftDurationMs / 1000).toFixed(2),
  );

  useEffect(() => {
    if (!isEditingDuration) {
      setDurationInputText((draftDurationMs / 1000).toFixed(2));
    }
  }, [draftDurationMs, isEditingDuration]);

  const handleFinishEditing = () => {
    setIsEditingDuration(false);
    const parsedSec = Number.parseFloat(durationInputText);
    if (Number.isFinite(parsedSec)) {
      onSetDirectDuration(parsedSec * 1000);
    } else {
      setDurationInputText((draftDurationMs / 1000).toFixed(2));
    }
  };

  // Auto-repeat for stepper [-] and [+]
  const repeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const repeatInitialDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startAutoRepeat = (deltaMs: number) => {
    onAdjustDuration(deltaMs);
    repeatInitialDelayRef.current = setTimeout(() => {
      repeatTimerRef.current = setInterval(() => {
        onAdjustDuration(deltaMs);
      }, 70);
    }, 350);
  };

  const stopAutoRepeat = () => {
    if (repeatInitialDelayRef.current) {
      clearTimeout(repeatInitialDelayRef.current);
      repeatInitialDelayRef.current = null;
    }
    if (repeatTimerRef.current) {
      clearInterval(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
  };

  // Tap handler for Spray Test
  const handleTapTest = async () => {
    if (!canTestSpray || isTesting) return;
    await onExecuteTest();
  };

  // Stepper boundary checks
  const isMinDuration = draftDurationMs <= SPRAY_DURATION_MIN_MS;
  const isMaxDuration = draftDurationMs >= SPRAY_DURATION_MAX_MS;

  return (
    <View style={styles.cardContainer}>
      {/* 1. Header with Master Power Switch */}
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBadge}>
            <Text style={styles.iconText}>⚡</Text>
          </View>
          <View>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow}>ACTUATOR HARDWARE</Text>
              {isDirty && (
                <View style={styles.dirtyPill}>
                  <Text style={styles.dirtyPillDot}>●</Text>
                  <Text style={styles.dirtyPillText}>Unsaved Changes</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardTitle}>Spray Actuator</Text>
          </View>
        </View>

        <View style={styles.switchContainer}>
          <Switch
            value={draftServoEnabled}
            onValueChange={onToggleEnabled}
            trackColor={{ false: "#CBD5E1", true: "#1475EE" }}
            thumbColor="#FFFFFF"
            accessibilityRole="switch"
            accessibilityLabel="Spray controller master power switch"
            accessibilityValue={{ text: draftServoEnabled ? "Enabled" : "Disabled" }}
          />
        </View>
      </View>

      {/* Controller Master Switch Description & Live Pill */}
      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={styles.switchLabel}>Spray Controller Power</Text>
          <Text style={styles.switchDescription}>
            Master power gate for AUX5 precision chemical solenoid valve
          </Text>
        </View>
        <View
          style={[
            styles.statusPill,
            draftServoEnabled ? styles.statusPillActive : styles.statusPillInactive,
          ]}
        >
          <Text
            style={[
              styles.statusPillText,
              draftServoEnabled ? styles.statusPillTextActive : styles.statusPillTextInactive,
            ]}
          >
            {draftServoEnabled ? "ENABLED" : "DISABLED"}
          </Text>
        </View>
      </View>

      {/* Validation Warning Banner: SPRAY with Controller OFF */}
      {!draftServoEnabled && (
        <View style={styles.warningBanner}>
          <Text style={styles.warningBannerIcon}>⚠️</Text>
          <View style={styles.warningBannerContent}>
            <Text style={styles.warningBannerTitle}>Spray Controller Power is OFF</Text>
            <Text style={styles.warningBannerText}>
              SPRAY is selected as mission default, but master power is OFF. Missions will execute without active spray dispensing.
            </Text>
          </View>
        </View>
      )}

      {/* 2. Hardware Mapping Telemetry (Read-Only) */}
      <View style={styles.telemetryWell}>
        <View style={styles.telemetryHeader}>
          <Text style={styles.telemetryEyebrow}>READ-ONLY HARDWARE TELEMETRY</Text>
          <View style={styles.channelBadge}>
            <Text style={styles.channelBadgeText}>{`AUX${channel} CHANNEL`}</Text>
          </View>
        </View>

        <View style={styles.telemetryDivider} />

        {isLoadingConfig ? (
          <View style={styles.telemetryLoadingRow}>
            <ActivityIndicator size="small" color="#1475EE" />
            <Text style={styles.telemetryLoadingText}>Inspecting rover parameters...</Text>
          </View>
        ) : !isOnline ? (
          <View style={styles.telemetryOfflineRow}>
            <Text style={styles.telemetryOfflineText}>
              ⚠️ Telemetry offline — Rover disconnected
            </Text>
          </View>
        ) : (
          <View style={styles.telemetryGrid}>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryItemLabel}>PRESS PWM</Text>
              <Text style={styles.telemetryItemValue}>{`${pressPwmUs} µs`}</Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryItemLabel}>RELEASE PWM</Text>
              <Text style={styles.telemetryItemValue}>{`${releasePwmUs} µs`}</Text>
            </View>
            <View style={styles.telemetryItem}>
              <Text style={styles.telemetryItemLabel}>CURRENT PULSE</Text>
              <Text style={[styles.telemetryItemValue, { color: "#1475EE" }]}>
                {`${(draftDurationMs / 1000).toFixed(2)} s`}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* 3. Duration Stepper Controls */}
      <View style={styles.stepperContainer}>
        <View style={styles.stepperHeader}>
          <View>
            <Text style={styles.stepperEyebrow}>SPRAY CALIBRATION</Text>
            <Text style={styles.stepperTitle}>Spray Duration Pulse</Text>
          </View>
          <Text style={styles.stepperLimit}>
            0.10 s – 3.00 s (100 ms step)
          </Text>
        </View>

        <View style={styles.stepperControlsRow}>
          {/* Decrement Button */}
          <TouchableOpacity
            style={[styles.stepperButton, isMinDuration && styles.stepperButtonDisabled]}
            onPressIn={() => startAutoRepeat(-SPRAY_DURATION_STEP_MS)}
            onPressOut={stopAutoRepeat}
            disabled={isMinDuration}
            accessibilityRole="button"
            accessibilityLabel="Decrease spray pulse duration by 100 milliseconds"
          >
            <Text style={[styles.stepperButtonText, isMinDuration && styles.disabledText]}>
              −
            </Text>
          </TouchableOpacity>

          {/* Direct Tap-to-Type Display Box */}
          <TouchableOpacity
            style={styles.durationDisplayBox}
            onPress={() => setIsEditingDuration(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Tap to enter spray duration manually"
            accessibilityValue={{ text: `${(draftDurationMs / 1000).toFixed(2)} seconds` }}
          >
            {isEditingDuration ? (
              <TextInput
                style={styles.durationInput}
                value={durationInputText}
                onChangeText={setDurationInputText}
                onBlur={handleFinishEditing}
                onSubmitEditing={handleFinishEditing}
                keyboardType="decimal-pad"
                autoFocus
                maxLength={4}
                selectTextOnFocus
              />
            ) : (
              <View style={styles.durationTextRow}>
                <Text style={styles.durationValueText}>
                  {(draftDurationMs / 1000).toFixed(2)}
                </Text>
                <Text style={styles.durationUnitText}>seconds</Text>
                <Text style={styles.durationMsText}>({draftDurationMs} ms)</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Increment Button */}
          <TouchableOpacity
            style={[styles.stepperButton, isMaxDuration && styles.stepperButtonDisabled]}
            onPressIn={() => startAutoRepeat(SPRAY_DURATION_STEP_MS)}
            onPressOut={stopAutoRepeat}
            disabled={isMaxDuration}
            accessibilityRole="button"
            accessibilityLabel="Increase spray pulse duration by 100 milliseconds"
          >
            <Text style={[styles.stepperButtonText, isMaxDuration && styles.disabledText]}>
              +
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 4. Safety Hardware Test Pulse Button */}
      <View style={styles.testPulseContainer}>
        <View style={styles.testPulseHeader}>
          <Text style={styles.testPulseEyebrow}>SAFETY HARDWARE TEST</Text>
          <Text
            style={[
              styles.testStatusText,
              testStatus === "success" && styles.textSuccess,
              testStatus === "error" && styles.textError,
              testStatus === "pulsing" && styles.textPulsing,
            ]}
          >
            {testStatus === "pulsing"
              ? "Firing AUX5 Pulse..."
              : testStatus === "success"
              ? "✓ Pulse Completed"
              : testStatus === "error"
              ? "⚠️ Test Failed"
              : canTestSpray
              ? "Ready to test"
              : disabledTestReason ?? "Unavailable"}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.testButton,
            !canTestSpray && styles.testButtonDisabled,
            testStatus === "success" && styles.testButtonSuccess,
            isTesting && styles.testButtonTesting,
          ]}
          onPress={handleTapTest}
          disabled={!canTestSpray || isTesting}
          accessibilityRole="button"
          accessibilityLabel={`Test spray pulse on AUX${channel}`}
        >
          <View style={styles.testButtonContent}>
            {isTesting ? (
              <ActivityIndicator color="#1475EE" size="small" />
            ) : (
              <Text style={styles.testButtonIcon}>💧</Text>
            )}
            <Text
              style={[
                styles.testButtonLabel,
                !canTestSpray && styles.testButtonLabelDisabled,
              ]}
            >
              {isTesting
                ? `FIRING AUX${channel} PULSE (${(draftDurationMs / 1000).toFixed(2)}s)...`
                : `TEST SPRAY PULSE (AUX${channel})`}
            </Text>
          </View>
        </TouchableOpacity>

        {testErrorMessage && (
          <Text style={styles.testErrorMessage}>{testErrorMessage}</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#DDE8F7",
    padding: 16,
    marginTop: 12,
    marginBottom: 8,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#EAF3FF",
    borderWidth: 1,
    borderColor: "#D6E6FF",
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 18,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    color: "#526B93",
    letterSpacing: 0.5,
  },
  dirtyPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    gap: 4,
  },
  dirtyPillDot: {
    fontSize: 8,
    color: "#D97706",
  },
  dirtyPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#B45309",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#10244B",
    marginTop: 2,
  },
  switchContainer: {
    minHeight: 48,
    minWidth: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
  },
  switchInfo: {
    flex: 1,
    marginRight: 12,
  },
  switchLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#10244B",
  },
  switchDescription: {
    fontSize: 11,
    color: "#64748B",
    marginTop: 2,
    lineHeight: 15,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusPillActive: {
    backgroundColor: "#E6F8F1",
    borderColor: "#A7F3D0",
  },
  statusPillInactive: {
    backgroundColor: "#F1F5F9",
    borderColor: "#CBD5E1",
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "900",
  },
  statusPillTextActive: {
    color: "#059669",
  },
  statusPillTextInactive: {
    color: "#64748B",
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFBEB",
    borderWidth: 1.5,
    borderColor: "#FDE68A",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    gap: 8,
  },
  warningBannerIcon: {
    fontSize: 16,
    marginTop: 1,
  },
  warningBannerContent: {
    flex: 1,
  },
  warningBannerTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#B45309",
  },
  warningBannerText: {
    fontSize: 11,
    color: "#92400E",
    marginTop: 2,
    lineHeight: 15,
  },
  telemetryWell: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#DDE8F7",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  telemetryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  telemetryEyebrow: {
    fontSize: 10,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  channelBadge: {
    backgroundColor: "#EAF3FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  channelBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#1475EE",
  },
  telemetryDivider: {
    height: 1,
    backgroundColor: "#EDF2F7",
    marginVertical: 8,
  },
  telemetryGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  telemetryItem: {
    flex: 1,
  },
  telemetryItemLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
    marginBottom: 2,
  },
  telemetryItemValue: {
    fontSize: 13,
    fontWeight: "900",
    color: "#10244B",
    fontFamily: "monospace",
  },
  telemetryLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  telemetryLoadingText: {
    fontSize: 11,
    color: "#64748B",
    fontStyle: "italic",
  },
  telemetryOfflineRow: {
    paddingVertical: 4,
  },
  telemetryOfflineText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#DC2626",
  },
  stepperContainer: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE8F7",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  stepperHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  stepperEyebrow: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  stepperTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#10244B",
    marginTop: 1,
  },
  stepperLimit: {
    fontSize: 10,
    fontWeight: "700",
    color: "#64748B",
  },
  stepperControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepperButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonDisabled: {
    opacity: 0.35,
  },
  stepperButtonText: {
    fontSize: 22,
    fontWeight: "900",
    color: "#10244B",
    lineHeight: 24,
  },
  disabledText: {
    color: "#94A3B8",
  },
  durationDisplayBox: {
    flex: 1,
    height: 48,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  durationTextRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  durationValueText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1475EE",
  },
  durationUnitText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  durationMsText: {
    fontSize: 11,
    color: "#94A3B8",
    fontFamily: "monospace",
  },
  durationInput: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1475EE",
    textAlign: "center",
    width: "100%",
  },
  testPulseContainer: {
    marginTop: 12,
  },
  testPulseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  testPulseEyebrow: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  testStatusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },
  textSuccess: {
    color: "#059669",
    fontWeight: "800",
  },
  textError: {
    color: "#DC2626",
    fontWeight: "800",
  },
  textPulsing: {
    color: "#1475EE",
    fontWeight: "900",
  },
  testButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: "#EAF3FF",
    borderWidth: 2,
    borderColor: "#1475EE",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  testButtonDisabled: {
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    opacity: 0.6,
  },
  testButtonSuccess: {
    borderColor: "#10B981",
    backgroundColor: "#ECFDF5",
  },
  testButtonTesting: {
    borderColor: "#3B82F6",
    backgroundColor: "#EFF6FF",
  },
  testButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 1,
  },
  testButtonIcon: {
    fontSize: 16,
  },
  testButtonLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1475EE",
    letterSpacing: 0.3,
  },
  testButtonLabelDisabled: {
    color: "#94A3B8",
  },
  testErrorMessage: {
    fontSize: 11,
    color: "#DC2626",
    marginTop: 4,
    marginLeft: 2,
  },
});
