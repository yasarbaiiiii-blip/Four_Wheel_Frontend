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
import { AppIcon } from "../shared/AppIcon";

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
  draftPressPwmUs?: number;
  draftReleasePwmUs?: number;
  onChangePressPwm?: (us: number) => void;
  onChangeReleasePwm?: (us: number) => void;
  pwmError?: string | null;
  sprayValueSource?: string | null;
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
  draftPressPwmUs = pressPwmUs,
  draftReleasePwmUs = releasePwmUs,
  onChangePressPwm = () => {},
  onChangeReleasePwm = () => {},
  pwmError = null,
  sprayValueSource = null,
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
  // Tap-to-type direct entry state for Duration
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

  const isMinDuration = draftDurationMs <= SPRAY_DURATION_MIN_MS;
  const isMaxDuration = draftDurationMs >= SPRAY_DURATION_MAX_MS;

  // Calculate percentage deflection (1200 µs = 0%, 2000 µs = 100%)
  const calcDeflectionPct = (us: number) => {
    const clamped = Math.min(2000, Math.max(1200, us));
    return Math.round(((clamped - 1200) / 800) * 100);
  };

  return (
    <View style={styles.cardContainer}>
      
      {/* 1. Header with Master Power Switch */}
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBadge}>
            <AppIcon name="actuatorSpray" size="sm" color="#38BDF8" />
          </View>
          <View>
            <View style={styles.eyebrowRow}>
              <Text style={styles.eyebrow}>ACTUATOR HARDWARE</Text>
              {isDirty && (
                <View style={styles.dirtyPill}>
                  <AppIcon name="circle" size={6} color="#F59E0B" />
                  <Text style={styles.dirtyPillText}>Unsaved Changes</Text>
                </View>
              )}
            </View>
            <Text style={styles.cardTitle}>Spray Actuator</Text>
          </View>
        </View>

        <View style={styles.switchRightContainer}>
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
          <Switch
            value={draftServoEnabled}
            onValueChange={onToggleEnabled}
            trackColor={{ false: "#334155", true: "#2563EB" }}
            thumbColor="#FFFFFF"
            accessibilityRole="switch"
            accessibilityLabel="Spray controller power switch"
          />
        </View>
      </View>

      {/* Validation Warning Banner: SPRAY with Controller OFF */}
      {!draftServoEnabled && (
        <View style={styles.warningBanner}>
          <AppIcon name="warning" size="sm" color="#F59E0B" />
          <View style={styles.warningBannerContent}>
            <Text style={styles.warningBannerTitle}>Spray Controller Power is OFF</Text>
            <Text style={styles.warningBannerText}>
              Missions will execute without active spray dispensing
            </Text>
          </View>
        </View>
      )}

      {/* Offline Alert */}
      {!isOnline && (
        <View style={styles.offlineBox}>
          <AppIcon name="warning" size="xs" color="#EF4444" />
          <Text style={styles.offlineText}>Telemetry offline — Rover disconnected</Text>
        </View>
      )}

      {/* 2. Modern Dual PWM Actuator Gauges */}
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>SERVO PWM CALIBRATION (1200 – 2000 µs)</Text>
          <Text style={styles.auxChannelBadge}>{`AUX${channel} CHANNEL`}</Text>
        </View>

        <View style={styles.pwmGrid}>
          {/* PRESS PWM Card */}
          <ModernPwmField
            label="PRESS (SPRAY)"
            value={draftPressPwmUs}
            inUse={pressPwmUs}
            pct={calcDeflectionPct(draftPressPwmUs)}
            barColor="#38BDF8"
            onCommit={onChangePressPwm}
          />

          {/* RELEASE PWM Card */}
          <ModernPwmField
            label="RELEASE (REST)"
            value={draftReleasePwmUs}
            inUse={releasePwmUs}
            pct={calcDeflectionPct(draftReleasePwmUs)}
            barColor="#94A3B8"
            onCommit={onChangeReleasePwm}
          />
        </View>
      </View>

      {/* 3. Status & Safety Feedback Notice */}
      {isOnline && !isLoadingConfig && (
        <View style={styles.statusBox}>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusIndicatorDot,
                sprayValueSource === "saved"
                  ? styles.dotSaved
                  : sprayValueSource === "unsaved"
                  ? styles.dotUnsaved
                  : styles.dotDefault,
              ]}
            />
            <Text style={styles.statusTitle}>
              {sprayValueSource === "saved"
                ? "Spray PWM: Saved on rover (used on boot)"
                : sprayValueSource === "unsaved"
                ? "Spray PWM: Testing on rover (press Save to keep)"
                : "Spray PWM: Rover default"}
            </Text>
          </View>

          {pwmError ? (
            <Text style={styles.errorText}>{pwmError}</Text>
          ) : (
            <Text style={styles.hintText}>
              Note: RELEASE PWM must match PX4 parameters PWM_AUX_DIS1 & PWM_AUX_FAIL1 to avoid arm/disarm servo jumps.
            </Text>
          )}
        </View>
      )}

      {/* 4. Pulse Hold Duration Stepper */}
      <View style={styles.durationCard}>
        <View style={styles.durationHeader}>
          <View>
            <Text style={styles.durationEyebrow}>TIMING CALIBRATION</Text>
            <Text style={styles.durationTitle}>Spray Pulse Duration</Text>
          </View>

          {/* Quick preset chips */}
          <View style={styles.presetChipsRow}>
            {[250, 500, 1000].map((ms) => {
              const active = draftDurationMs === ms;
              return (
                <TouchableOpacity
                  key={ms}
                  style={[styles.presetChip, active && styles.presetChipActive]}
                  onPress={() => onSetDirectDuration(ms)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.presetChipText, active && styles.presetChipTextActive]}>
                    {`${(ms / 1000).toFixed(2)}s`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={[styles.stepperBtn, isMinDuration && styles.stepperBtnDisabled]}
            onPressIn={() => startAutoRepeat(-SPRAY_DURATION_STEP_MS)}
            onPressOut={stopAutoRepeat}
            disabled={isMinDuration}
            accessibilityRole="button"
            accessibilityLabel="Decrease spray pulse duration by 100 milliseconds"
          >
            <AppIcon name="stepperMinus" size="sm" color={isMinDuration ? "#64748B" : "#F8FAFC"} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.durationDisplayBox}
            onPress={() => setIsEditingDuration(true)}
            activeOpacity={0.8}
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
              <View style={styles.durationDisplayContent}>
                <Text style={styles.durationValText}>{(draftDurationMs / 1000).toFixed(2)}</Text>
                <Text style={styles.durationUnitText}>sec</Text>
                <Text style={styles.durationSubMsText}>{`(${draftDurationMs} ms)`}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.stepperBtn, isMaxDuration && styles.stepperBtnDisabled]}
            onPressIn={() => startAutoRepeat(SPRAY_DURATION_STEP_MS)}
            onPressOut={stopAutoRepeat}
            disabled={isMaxDuration}
            accessibilityRole="button"
            accessibilityLabel="Increase spray pulse duration by 100 milliseconds"
          >
            <AppIcon name="stepperPlus" size="sm" color={isMaxDuration ? "#64748B" : "#F8FAFC"} />
          </TouchableOpacity>
        </View>
      </View>

      {/* 5. Safety Test Spray Button */}
      <View style={styles.testActionContainer}>
        <TouchableOpacity
          style={[
            styles.testButton,
            !canTestSpray && styles.testButtonDisabled,
            isTesting && styles.testButtonTesting,
          ]}
          onPress={handleTapTest}
          disabled={!canTestSpray || isTesting}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Test spray pulse on AUX${channel}`}
        >
          <View style={styles.testBtnInner}>
            {testStatus === "success" && (
              <AppIcon name="testSuccess" size="xs" color="#10B981" />
            )}
            {testStatus === "error" && (
              <AppIcon name="testError" size="xs" color="#EF4444" />
            )}
            {isTesting ? (
              <ActivityIndicator color="#0B0F19" size="small" />
            ) : (
              <AppIcon name="testPulse" size="sm" color={!canTestSpray ? "#64748B" : "#0B0F19"} />
            )}
            <Text style={[styles.testBtnText, !canTestSpray && styles.testBtnTextDisabled]}>
              {isTesting
                ? `FIRING AUX${channel} (${(draftDurationMs / 1000).toFixed(2)}s)...`
                : `TEST SPRAY PULSE (AUX${channel})`}
            </Text>
          </View>
        </TouchableOpacity>

        {testErrorMessage ? (
          <Text style={styles.testErrorMsg}>{testErrorMessage}</Text>
        ) : !canTestSpray && disabledTestReason ? (
          <Text style={styles.testHintMsg}>{disabledTestReason}</Text>
        ) : null}
      </View>

    </View>
  );
};

// Modern Dual PWM Input with live Deflection Bar & Nudge Buttons
const ModernPwmField: React.FC<{
  label: string;
  value: number;
  inUse: number;
  pct: number;
  barColor: string;
  onCommit: (us: number) => void;
}> = ({ label, value, inUse, pct, barColor, onCommit }) => {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  const finish = () => {
    setEditing(false);
    const parsed = Number.parseInt(text, 10);
    if (Number.isFinite(parsed)) onCommit(parsed);
    else setText(String(value));
  };

  const nudge = (delta: number) => {
    const next = Math.min(2000, Math.max(1200, value + delta));
    onCommit(next);
  };

  return (
    <View style={styles.pwmCard}>
      <View style={styles.pwmCardHeader}>
        <Text style={styles.pwmCardLabel}>{label}</Text>
        {inUse !== value ? (
          <Text style={styles.inUsePill}>{`In use: ${inUse} µs`}</Text>
        ) : (
          <Text style={styles.syncedPill}>{`${value} µs`}</Text>
        )}
      </View>

      <View style={styles.pwmInputRow}>
        <TextInput
          style={styles.pwmInputText}
          value={text}
          onFocus={() => setEditing(true)}
          onChangeText={setText}
          onBlur={finish}
          onSubmitEditing={finish}
          keyboardType="number-pad"
          maxLength={4}
          selectTextOnFocus
        />
        <Text style={styles.pwmMicroSecLabel}>µs</Text>

        <View style={styles.nudgeButtons}>
          <TouchableOpacity style={styles.nudgeBtn} onPress={() => nudge(-25)}>
            <Text style={styles.nudgeBtnText}>-</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nudgeBtn} onPress={() => nudge(25)}>
            <Text style={styles.nudgeBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Visual Deflection Progress Bar */}
      <View style={styles.barContainer}>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: barColor }]} />
        </View>
        <View style={styles.barLabels}>
          <Text style={styles.barLabelText}>REST (1200)</Text>
          <Text style={[styles.barLabelText, { color: barColor }]}>{`${pct}% DEFLECTION`}</Text>
          <Text style={styles.barLabelText}>FULL (2000)</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: "#0B0F19",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 16,
    marginTop: 10,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "800",
    color: "#38BDF8",
    letterSpacing: 0.8,
  },
  dirtyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  dirtyPillText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#F59E0B",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#F8FAFC",
    marginTop: 1,
  },
  switchRightContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPillActive: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  statusPillInactive: {
    backgroundColor: "#1E293B",
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: "800",
  },
  statusPillTextActive: {
    color: "#10B981",
  },
  statusPillTextInactive: {
    color: "#64748B",
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  warningBannerContent: {
    flex: 1,
  },
  warningBannerTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#F59E0B",
  },
  warningBannerText: {
    fontSize: 9,
    color: "#CBD5E1",
    marginTop: 1,
  },
  offlineBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  offlineText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#EF4444",
  },
  sectionBlock: {
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.6,
  },
  auxChannelBadge: {
    fontSize: 9,
    fontWeight: "700",
    fontFamily: "monospace",
    color: "#94A3B8",
    backgroundColor: "#1E293B",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pwmGrid: {
    flexDirection: "row",
    gap: 10,
  },
  pwmCard: {
    flex: 1,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    padding: 12,
  },
  pwmCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  pwmCardLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#CBD5E1",
    letterSpacing: 0.5,
  },
  inUsePill: {
    fontSize: 8,
    fontWeight: "700",
    fontFamily: "monospace",
    color: "#F59E0B",
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  syncedPill: {
    fontSize: 8,
    fontWeight: "700",
    fontFamily: "monospace",
    color: "#64748B",
  },
  pwmInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  pwmInputText: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    fontFamily: "monospace",
    color: "#F8FAFC",
    paddingVertical: 2,
    paddingHorizontal: 4,
    backgroundColor: "transparent",
  },
  pwmMicroSecLabel: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: "monospace",
    color: "#64748B",
    marginRight: 4,
  },
  nudgeButtons: {
    flexDirection: "row",
    gap: 4,
  },
  nudgeBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  nudgeBtnText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },
  barContainer: {
    marginTop: 2,
  },
  barTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "#1E293B",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  barLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 3,
  },
  barLabelText: {
    fontSize: 7,
    fontFamily: "monospace",
    fontWeight: "700",
    color: "#64748B",
  },
  statusBox: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  statusIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotSaved: { backgroundColor: "#10B981" },
  dotUnsaved: { backgroundColor: "#F59E0B" },
  dotDefault: { backgroundColor: "#64748B" },
  statusTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#E2E8F0",
  },
  errorText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#EF4444",
    marginTop: 2,
  },
  hintText: {
    fontSize: 9,
    color: "#94A3B8",
    lineHeight: 13,
  },
  durationCard: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  durationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  durationEyebrow: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.6,
  },
  durationTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#F8FAFC",
  },
  presetChipsRow: {
    flexDirection: "row",
    gap: 6,
  },
  presetChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#1E293B",
  },
  presetChipActive: {
    backgroundColor: "rgba(37, 99, 235, 0.3)",
    borderWidth: 1,
    borderColor: "#3B82F6",
  },
  presetChipText: {
    fontSize: 9,
    fontFamily: "monospace",
    fontWeight: "600",
    color: "#94A3B8",
  },
  presetChipTextActive: {
    color: "#60A5FA",
    fontWeight: "800",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepperBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnDisabled: {
    opacity: 0.4,
  },
  durationDisplayBox: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#0B0F19",
    borderWidth: 1,
    borderColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  durationDisplayContent: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  durationValText: {
    fontSize: 16,
    fontWeight: "800",
    fontFamily: "monospace",
    color: "#38BDF8",
  },
  durationUnitText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
  },
  durationSubMsText: {
    fontSize: 9,
    fontFamily: "monospace",
    color: "#64748B",
  },
  durationInput: {
    fontSize: 16,
    fontWeight: "800",
    fontFamily: "monospace",
    color: "#38BDF8",
    textAlign: "center",
    width: "100%",
  },
  testActionContainer: {
    marginTop: 4,
  },
  testButton: {
    backgroundColor: "#F59E0B",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  testButtonDisabled: {
    backgroundColor: "#1E293B",
  },
  testButtonTesting: {
    backgroundColor: "#D97706",
  },
  testBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  testBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0B0F19",
    letterSpacing: 0.5,
  },
  testBtnTextDisabled: {
    color: "#64748B",
  },
  testErrorMsg: {
    fontSize: 10,
    fontWeight: "700",
    color: "#EF4444",
    textAlign: "center",
    marginTop: 6,
  },
  testHintMsg: {
    fontSize: 9,
    color: "#64748B",
    textAlign: "center",
    marginTop: 6,
  },
});
