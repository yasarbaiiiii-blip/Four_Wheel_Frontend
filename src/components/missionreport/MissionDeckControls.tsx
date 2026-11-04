import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { DeckControlState } from "../../utils/missionDeckControls";
import type { PauseNotice } from "../../utils/pauseReasonPresentation";

export type DeckPendingAction =
  | "start"
  | "stop"
  | "pause"
  | "resume"
  | "skip"
  | "next"
  | "mode"
  | null;

interface MissionDeckControlsProps {
  controls: DeckControlState;
  mode: "auto" | "manual";
  isPreparing: boolean;
  /** The request currently in flight, used only to label the button. */
  pending: DeckPendingAction;
  /** Why the rover is paused (from the rover), or null when there is nothing to say. */
  notice?: PauseNotice | null;
  onPrimary: () => void;
  onSecondary: () => void;
  onSkip: () => void;
  onNext: () => void;
  onSetMode: (mode: "auto" | "manual") => void;
}

function primaryLabel(
  controls: DeckControlState,
  isPreparing: boolean,
  pending: DeckPendingAction,
): string {
  if (controls.primary === "stop") {
    return pending === "stop" ? "STOPPING…" : "STOP MISSION";
  }
  if (isPreparing) return "PREPARING…";
  return pending === "start" ? "STARTING…" : "START MISSION";
}

/**
 * Mission control buttons for the progress deck. The buttons change with the
 * confirmed rover state (idle / running / paused / waiting for NEXT) and are
 * locked while a request is in flight, except STOP, which stays available.
 */
export function MissionDeckControls({
  controls,
  mode,
  isPreparing,
  pending,
  notice = null,
  onPrimary,
  onSecondary,
  onSkip,
  onNext,
  onSetMode,
}: MissionDeckControlsProps): React.ReactElement {
  const isStop = controls.primary === "stop";
  const isResume = controls.secondary === "resume";
  const waiting = controls.phase === "waiting";

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.hero,
          isStop ? styles.heroStop : styles.heroStart,
          !controls.primaryEnabled && styles.disabled,
        ]}
        onPress={onPrimary}
        disabled={!controls.primaryEnabled}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={isStop ? "Stop mission" : "Start mission"}
        accessibilityState={{ disabled: !controls.primaryEnabled }}
      >
        <MaterialCommunityIcons
          name={isStop ? "stop" : "play"}
          size={24}
          color="#FFFFFF"
        />
        <Text style={styles.heroText}>
          {primaryLabel(controls, isPreparing, pending)}
        </Text>
      </TouchableOpacity>

      {notice && (
        <View
          style={[styles.notice, notice.blocking ? styles.noticeBlocking : styles.noticeClear]}
          accessibilityRole="alert"
          accessibilityLabel={`${notice.title}. ${notice.detail}`}
        >
          <MaterialCommunityIcons
            name={notice.blocking ? "alert-circle-outline" : "check-circle-outline"}
            size={20}
            color={notice.blocking ? "#DC2626" : "#16B980"}
          />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle} numberOfLines={1}>{notice.title}</Text>
            <Text style={styles.noticeDetail} numberOfLines={2}>{notice.detail}</Text>
          </View>
        </View>
      )}

      <View style={styles.subRow}>
        <TouchableOpacity
          style={[
            styles.sub,
            isResume ? styles.subBlue : styles.subOrange,
            !controls.secondaryEnabled && styles.disabled,
          ]}
          onPress={onSecondary}
          disabled={!controls.secondaryEnabled}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={isResume ? "Resume mission" : "Pause mission"}
          accessibilityState={{ disabled: !controls.secondaryEnabled }}
        >
          <MaterialCommunityIcons
            name={isResume ? "play" : "pause"}
            size={20}
            color="#FFFFFF"
          />
          <Text style={styles.subText}>{isResume ? "RESUME" : "PAUSE"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.sub,
            styles.subBlue,
            !controls.skipEnabled && styles.disabled,
          ]}
          onPress={onSkip}
          disabled={!controls.skipEnabled}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Skip current goal"
          accessibilityState={{ disabled: !controls.skipEnabled }}
        >
          <MaterialCommunityIcons name="debug-step-over" size={20} color="#FFFFFF" />
          <Text style={styles.subText}>SKIP GOAL</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.sub,
            waiting ? styles.subGreen : styles.subBlue,
            !controls.nextEnabled && styles.disabled,
          ]}
          onPress={onNext}
          disabled={!controls.nextEnabled}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Continue to next waypoint"
          accessibilityState={{ disabled: !controls.nextEnabled }}
        >
          <MaterialCommunityIcons name="skip-next" size={20} color="#FFFFFF" />
          <Text style={styles.subText}>NEXT</Text>
        </TouchableOpacity>
      </View>

      <View
        style={[styles.modeRow, !controls.modeEnabled && styles.disabled]}
        accessibilityRole="radiogroup"
        accessibilityLabel="Drive mode"
      >
        {(["auto", "manual"] as const).map((option) => {
          const selected = mode === option;
          return (
            <TouchableOpacity
              key={option}
              style={[styles.modeOption, selected && styles.modeOptionSelected]}
              onPress={() => {
                if (!selected) onSetMode(option);
              }}
              disabled={!controls.modeEnabled}
              activeOpacity={0.82}
              accessibilityRole="radio"
              accessibilityLabel={option === "auto" ? "Auto mode" : "Manual mode"}
              accessibilityState={{
                selected,
                disabled: !controls.modeEnabled,
              }}
            >
              <MaterialCommunityIcons
                name={option === "auto" ? "robot-outline" : "hand-pointing-right"}
                size={18}
                color={selected ? "#FFFFFF" : "#536D97"}
              />
              <Text
                style={[styles.modeText, selected && styles.modeTextSelected]}
              >
                {option === "auto" ? "AUTO" : "MANUAL"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 9, justifyContent: "center" },
  disabled: { opacity: 0.45 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  noticeBlocking: { backgroundColor: "#FEF2F2", borderColor: "#DC2626" },
  noticeClear: { backgroundColor: "#ECFDF5", borderColor: "#16B980" },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: "#10244B", fontSize: 12, fontWeight: "900" },
  noticeDetail: { color: "#10244B", fontSize: 11, fontWeight: "600", marginTop: 1 },
  hero: {
    width: "100%",
    minHeight: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderBottomWidth: 3,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    elevation: 4,
  },
  heroStart: {
    backgroundColor: "#16B980",
    borderColor: "#148263",
    borderBottomColor: "#0D684D",
  },
  heroStop: {
    backgroundColor: "#DC2626",
    borderColor: "#C43C34",
    borderBottomColor: "#9B2E28",
  },
  heroText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  subRow: { flexDirection: "row", gap: 8 },
  sub: {
    flex: 1,
    minHeight: 48,
    borderRadius: 6,
    borderWidth: 1,
    borderBottomWidth: 2.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    elevation: 3,
  },
  subOrange: {
    backgroundColor: "#F08A24",
    borderColor: "#C86412",
    borderBottomColor: "#9A4C0B",
  },
  subBlue: {
    backgroundColor: "#1475EE",
    borderColor: "#1162C9",
    borderBottomColor: "#0C4EA3",
  },
  subGreen: {
    backgroundColor: "#16B980",
    borderColor: "#148263",
    borderBottomColor: "#0D684D",
  },
  subText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  modeRow: {
    flexDirection: "row",
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DDE8F7",
    backgroundColor: "#F8FAFC",
    padding: 3,
    gap: 3,
  },
  modeOption: {
    flex: 1,
    minHeight: 42,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  modeOptionSelected: { backgroundColor: "#1475EE" },
  modeText: {
    color: "#536D97",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  modeTextSelected: { color: "#FFFFFF" },
});
