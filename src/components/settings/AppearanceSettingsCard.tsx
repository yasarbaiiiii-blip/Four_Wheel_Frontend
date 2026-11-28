import React, { useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";

import {
  DEFAULT_ROVER_ICON_ID,
  ROVER_ICON_OPTIONS,
  type RoverIconId,
} from "../../constants/roverIcons";
import {
  DEFAULT_TRAJECTORY_APPEARANCE,
  type FinishedLineStyle,
  type FinishedPointsColor,
  type RtkRibbonMode,
  type TargetCircleStyle,
  type UnfinishedLineColor,
  type UnfinishedLineType,
  type UnfinishedPointsColor,
} from "../../constants/trajectoryAppearance";
import { useRoverIcon } from "../../context/RoverIconContext";
import { useTrajectoryAppearance } from "../../context/TrajectoryAppearanceContext";
import { AppIcon } from "../shared/AppIcon";
import { RoverIconArt } from "../shared/RoverIconArt";

const PREVIEW_ICON_SIZE = 64;
const MAP_ROVER_SIZE = 34;

interface MiniWaypoint {
  x: number;
  y: number;
  sn: number;
}

const SAMPLE_PATH_POINTS: MiniWaypoint[] = [
  { x: 30, y: 70, sn: 1 },
  { x: 90, y: 70, sn: 2 },
  { x: 150, y: 70, sn: 3 },
  { x: 210, y: 70, sn: 4 },
  { x: 270, y: 70, sn: 5 },
  { x: 330, y: 70, sn: 6 },
  { x: 390, y: 70, sn: 7 },
  { x: 420, y: 110, sn: 8 },
  { x: 390, y: 150, sn: 9 },
  { x: 330, y: 150, sn: 10 },
  { x: 270, y: 150, sn: 11 },
  { x: 210, y: 150, sn: 12 },
  { x: 150, y: 150, sn: 13 },
  { x: 90, y: 150, sn: 14 },
];

/** Live panoramic preview stage showing rover, trajectory, and reaching target. */
function PanoramicTrajectoryPreview(): React.ReactElement {
  const { iconId } = useRoverIcon();
  const { settings } = useTrajectoryAppearance();

  // Rover situated mid-trajectory (between point 6 and 7)
  const p6 = SAMPLE_PATH_POINTS[5];
  const p7 = SAMPLE_PATH_POINTS[6];
  const roverX = 360;
  const roverY = 70;

  // Path from start to rover
  const finishedPathD = useMemo(() => {
    let d = `M ${SAMPLE_PATH_POINTS[0].x} ${SAMPLE_PATH_POINTS[0].y}`;
    for (let i = 1; i <= 5; i++) {
      d += ` L ${SAMPLE_PATH_POINTS[i].x} ${SAMPLE_PATH_POINTS[i].y}`;
    }
    d += ` L ${roverX} ${roverY}`;
    return d;
  }, [roverX, roverY]);

  // Path from rover forward
  const unfinishedPathD = useMemo(() => {
    let d = `M ${roverX} ${roverY}`;
    for (let i = 6; i < SAMPLE_PATH_POINTS.length; i++) {
      d += ` L ${SAMPLE_PATH_POINTS[i].x} ${SAMPLE_PATH_POINTS[i].y}`;
    }
    return d;
  }, [roverX, roverY]);

  // Finished line styling
  const finDash =
    settings.finishedLine === "dotted-blueprint" ? "3, 6" : undefined;
  const finColor =
    settings.finishedLine === "solid-green"
      ? "#16B980"
      : settings.finishedLine === "faded-grey"
        ? "#64748B"
        : "#1475EE";
  const finOpacity = settings.finishedLine === "faded-grey" ? 0.45 : 1.0;
  const finWidth = settings.finishedLine === "dotted-blueprint" ? 3 : 4;

  // Unfinished line styling
  const unfinColor =
    settings.unfinishedColor === "grey"
      ? "#94A3B8"
      : settings.unfinishedColor === "indigo"
        ? "#6366F1"
        : "#38BDF8";
  const unfinDash =
    settings.unfinishedType === "dashed"
      ? "7, 4"
      : settings.unfinishedType === "dots"
        ? "3, 6"
        : undefined;

  return (
    <View style={styles.previewContainer}>
      <Svg
        width="100%"
        height={130}
        viewBox="0 0 450 190"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background Grid */}
        <Line x1={0} y1={70} x2={450} y2={70} stroke="#1E293B" strokeWidth={0.5} strokeDasharray="4, 4" />
        <Line x1={0} y1={150} x2={450} y2={150} stroke="#1E293B" strokeWidth={0.5} strokeDasharray="4, 4" />

        {/* RTK Ribbon */}
        {settings.rtkRibbon === "on" ? (
          <>
            <Path
              d={finishedPathD}
              fill="none"
              stroke="#10B981"
              strokeWidth={18}
              strokeOpacity={0.22}
              strokeLinecap="round"
            />
            <Path
              d={unfinishedPathD}
              fill="none"
              stroke="#94A3B8"
              strokeWidth={18}
              strokeOpacity={0.12}
              strokeLinecap="round"
              strokeDasharray="3, 3"
            />
          </>
        ) : null}

        {/* Finished Trajectory Line */}
        <Path
          d={finishedPathD}
          fill="none"
          stroke={finColor}
          strokeWidth={finWidth}
          strokeOpacity={finOpacity}
          strokeDasharray={finDash}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Unfinished Trajectory Line */}
        <Path
          d={unfinishedPathD}
          fill="none"
          stroke={unfinColor}
          strokeWidth={2.8}
          strokeDasharray={unfinDash}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Waypoints */}
        {SAMPLE_PATH_POINTS.map((pt, i) => {
          const isDone = i < 6;
          const isActive = i === 6; // Approaching waypoint 7

          const stroke = isDone
            ? settings.finishedPoints === "blue"
              ? "#1475EE"
              : "#16B980"
            : isActive
              ? "#1475EE"
              : settings.unfinishedPoints === "blue"
                ? "#38BDF8"
                : "#64748B";

          const fill = isDone
            ? settings.finishedPoints === "blue"
              ? "#1475EE"
              : "#16B980"
            : isActive
              ? "#0E2442"
              : "#0D192E";

          const textCol = isDone
            ? "#FFFFFF"
            : isActive
              ? "#38BDF8"
              : settings.unfinishedPoints === "blue"
                ? "#38BDF8"
                : "#94A3B8";

          return (
            <G key={pt.sn} transform={`translate(${pt.x}, ${pt.y})`}>
              {/* Target Circle around the reaching waypoint */}
              {isActive && settings.targetCircle !== "off" ? (
                <>
                  {settings.targetCircle === "pulse-ring" ? (
                    <>
                      <Circle r={20} fill="none" stroke="#1475EE" strokeWidth={1.8} />
                      <Circle r={15} fill="rgba(20, 117, 238, 0.15)" stroke="#38BDF8" strokeWidth={1.2} strokeDasharray="3, 3" />
                      <Line x1={0} y1={-24} x2={0} y2={-18} stroke="#1475EE" strokeWidth={1.5} />
                      <Line x1={0} y1={18} x2={0} y2={24} stroke="#1475EE" strokeWidth={1.5} />
                      <Line x1={-24} y1={0} x2={-18} y2={0} stroke="#1475EE" strokeWidth={1.5} />
                      <Line x1={18} y1={0} x2={24} y2={0} stroke="#1475EE" strokeWidth={1.5} />
                    </>
                  ) : null}

                  {settings.targetCircle === "precision-circle" ? (
                    <>
                      <Circle r={22} fill="rgba(20, 117, 238, 0.08)" stroke="#1475EE" strokeWidth={1.6} strokeDasharray="3, 4" />
                      <Circle r={15} fill="none" stroke="#38BDF8" strokeWidth={1.2} />
                      <Line x1={-24} y1={0} x2={24} y2={0} stroke="#1475EE" strokeWidth={0.8} strokeDasharray="2, 3" strokeOpacity={0.6} />
                      <Line x1={0} y1={-24} x2={0} y2={24} stroke="#1475EE" strokeWidth={0.8} strokeDasharray="2, 3" strokeOpacity={0.6} />
                    </>
                  ) : null}

                  {settings.targetCircle === "glow-halo" ? (
                    <>
                      <Circle r={24} fill="rgba(20, 117, 238, 0.22)" stroke="#1475EE" strokeWidth={1.5} />
                      <Circle r={16} fill="rgba(56, 189, 248, 0.15)" stroke="#38BDF8" strokeWidth={1.2} />
                    </>
                  ) : null}
                </>
              ) : null}

              {/* Waypoint point circle */}
              <Circle r={isDone ? 9 : isActive ? 10 : 7.5} fill={fill} stroke={stroke} strokeWidth={isActive ? 2.4 : 1.8} />
              <SvgText
                y={3}
                textAnchor="middle"
                fontSize={isDone ? 7 : isActive ? 8 : 6.5}
                fontWeight="500"
                fill={textCol}
              >
                {pt.sn}
              </SvgText>
            </G>
          );
        })}

        {/* Rover Vehicle Position */}
        <G transform={`translate(${roverX}, ${roverY})`}>
          <Circle r={14} fill="rgba(20, 117, 238, 0.15)" stroke="#1475EE" strokeWidth={1} />
        </G>
      </Svg>

      {/* Rover Native Icon overlay positioned exactly on the rover location */}
      <View style={[styles.roverOverlay, { left: "80%", top: 53 }]}>
        <View style={{ transform: [{ rotate: "90deg" }] }}>
          <RoverIconArt id={iconId} size={MAP_ROVER_SIZE} />
        </View>
      </View>

      {/* Status Bar */}
      <View style={styles.statusBar}>
        <Text style={styles.statusPillText}>
          Finished: <Text style={styles.statusPillBold}>{settings.finishedLine}</Text>
        </Text>
        <Text style={styles.statusPillText}>
          Unfinished: <Text style={styles.statusPillBold}>{settings.unfinishedType} ({settings.unfinishedColor})</Text>
        </Text>
        <Text style={styles.statusPillText}>
          Target: <Text style={styles.statusPillBold}>{settings.targetCircle}</Text>
        </Text>
      </View>
    </View>
  );
}

/**
 * Settings > Appearance & Trajectory Visibility Screen.
 * Provides unified, comprehensive user customization for:
 * 1. Rover Vehicle Icon
 * 2. Trajectory Visibility (Finished Line, Unfinished Line, Points, RTK Ribbon, Reaching Target Ring)
 */
export function AppearanceSettingsCard(): React.ReactElement {
  const { iconId, saveFailed: roverSaveFailed, setIconId, resetIconId: resetRoverIcon } =
    useRoverIcon();
  const {
    settings,
    saveFailed: appearanceSaveFailed,
    updateSettings,
    resetSettings: resetTrajectoryAppearance,
    applyPreset,
  } = useTrajectoryAppearance();

  const isDefaultRover = iconId === DEFAULT_ROVER_ICON_ID;
  const isDefaultTrajectory =
    JSON.stringify(settings) === JSON.stringify(DEFAULT_TRAJECTORY_APPEARANCE);

  const handleResetAll = () => {
    resetRoverIcon();
    resetTrajectoryAppearance();
  };

  return (
    <ScrollView style={styles.card} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.badge}>
          <AppIcon name="categoryAppearance" size="lg" color="#1475EE" />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>APPEARANCE</Text>
          <Text style={styles.title}>Rover Icon & Trajectory Visibility</Text>
        </View>
      </View>

      <Text style={styles.description}>
        Customize the rover vehicle icon and trajectory line styling on live maps.
        Settings are saved on this tablet and update immediately.
      </Text>

      {/* Real-Time Live Preview Stage */}
      <Text style={styles.sectionLabel}>LIVE PREVIEW ON MAP</Text>
      <PanoramicTrajectoryPreview />

      {/* Preset Chips */}
      <Text style={styles.sectionLabel}>QUICK PRESETS</Text>
      <View style={styles.presetRow}>
        <TouchableOpacity
          style={[
            styles.presetChip,
            settings.finishedLine === "dotted-blueprint" &&
              settings.finishedPoints === "blue" &&
              styles.presetChipActive,
          ]}
          onPress={() => applyPreset("style8")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.presetChipText,
              settings.finishedLine === "dotted-blueprint" &&
                settings.finishedPoints === "blue" &&
                styles.presetChipTextActive,
            ]}
          >
            Style 8: Dotted Blueprint
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.presetChip,
            settings.finishedLine === "solid-blue" && styles.presetChipActive,
          ]}
          onPress={() => applyPreset("style7")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.presetChipText,
              settings.finishedLine === "solid-blue" &&
                styles.presetChipTextActive,
            ]}
          >
            Style 7: Solid Blue Line
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.presetChip,
            settings.finishedLine === "solid-green" && styles.presetChipActive,
          ]}
          onPress={() => applyPreset("classicGreen")}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.presetChipText,
              settings.finishedLine === "solid-green" &&
                styles.presetChipTextActive,
            ]}
          >
            Classic Green Status
          </Text>
        </TouchableOpacity>
      </View>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* SECTION 1: ROVER VEHICLE ICON                               */}
      {/* ──────────────────────────────────────────────────────────── */}
      <View style={styles.divider} />
      <View style={styles.subHeader}>
        <Text style={styles.subTitle}>Section 1: Rover Vehicle Icon</Text>
        <Text style={styles.subHint}>Choose how the rover appears on the maps and in the top bar.</Text>
      </View>

      <View
        style={styles.grid}
        accessibilityRole="radiogroup"
        accessibilityLabel="Rover icon choices"
      >
        {ROVER_ICON_OPTIONS.map((option) => {
          const selected = option.id === iconId;
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => setIconId(option.id)}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityLabel={`${option.name} rover icon. ${option.description}`}
              accessibilityState={{ selected, checked: selected }}
              testID={`rover-icon-${option.id}`}
            >
              <View style={styles.optionArt}>
                <RoverIconArt id={option.id} size={PREVIEW_ICON_SIZE} />
              </View>
              <Text
                style={[
                  styles.optionName,
                  selected && styles.optionNameSelected,
                ]}
              >
                {option.name}
              </Text>
              <Text style={styles.optionDescription} numberOfLines={2}>
                {option.description}
              </Text>
              <View style={[styles.check, !selected && styles.checkHidden]}>
                <AppIcon name="check" size="sm" color="#FFFFFF" />
                <Text style={styles.checkText}>In use</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* SECTION 2: TRAJECTORY VISIBILITY & STYLING                  */}
      {/* ──────────────────────────────────────────────────────────── */}
      <View style={styles.divider} />
      <View style={styles.subHeader}>
        <Text style={styles.subTitle}>Section 2: Trajectory Visibility & Styling</Text>
        <Text style={styles.subHint}>
          Customize finished line, unfinished line, waypoints, RTK corridor, and target circles.
        </Text>
      </View>

      {/* Control 1: Finished Line Style */}
      <View style={styles.controlGroup}>
        <View style={styles.controlMeta}>
          <Text style={styles.controlLabel}>Finished Line Style</Text>
          <Text style={styles.controlHint}>Path already marked by the rover</Text>
        </View>
        <View style={styles.segmentRow}>
          {[
            { id: "dotted-blueprint" as FinishedLineStyle, label: "Dotted Blueprint" },
            { id: "solid-blue" as FinishedLineStyle, label: "Solid Blue (#1475EE)" },
            { id: "solid-green" as FinishedLineStyle, label: "Solid Green (#16B980)" },
            { id: "faded-grey" as FinishedLineStyle, label: "Faded Grey" },
          ].map((item) => {
            const active = settings.finishedLine === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => updateSettings({ finishedLine: item.id })}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Control 2: Unfinished Line Type */}
      <View style={styles.controlGroup}>
        <View style={styles.controlMeta}>
          <Text style={styles.controlLabel}>Unfinished Line Type</Text>
          <Text style={styles.controlHint}>Texture of planned upcoming path</Text>
        </View>
        <View style={styles.segmentRow}>
          {[
            { id: "dashed" as UnfinishedLineType, label: "Marching Dashes" },
            { id: "solid" as UnfinishedLineType, label: "Straight Solid" },
            { id: "dots" as UnfinishedLineType, label: "Dotted Blueprint" },
          ].map((item) => {
            const active = settings.unfinishedType === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => updateSettings({ unfinishedType: item.id })}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Control 3: Unfinished Line Color */}
      <View style={styles.controlGroup}>
        <View style={styles.controlMeta}>
          <Text style={styles.controlLabel}>Unfinished Line Color</Text>
          <Text style={styles.controlHint}>Color tone of upcoming route</Text>
        </View>
        <View style={styles.segmentRow}>
          {[
            { id: "cyan" as UnfinishedLineColor, label: "Sky Cyan (#38BDF8)" },
            { id: "grey" as UnfinishedLineColor, label: "Subtle Slate (#94A3B8)" },
            { id: "indigo" as UnfinishedLineColor, label: "Deep Indigo (#6366F1)" },
          ].map((item) => {
            const active = settings.unfinishedColor === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => updateSettings({ unfinishedColor: item.id })}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Control 4 & 5: Points Customizer */}
      <View style={styles.twoColRow}>
        <View style={[styles.controlGroup, { flex: 1 }]}>
          <Text style={styles.controlLabel}>Finished Points</Text>
          <View style={styles.segmentRow}>
            {[
              { id: "blue" as FinishedPointsColor, label: "Blue" },
              { id: "green" as FinishedPointsColor, label: "Green" },
            ].map((item) => {
              const active = settings.finishedPoints === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  onPress={() => updateSettings({ finishedPoints: item.id })}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[styles.controlGroup, { flex: 1 }]}>
          <Text style={styles.controlLabel}>Unfinished Points</Text>
          <View style={styles.segmentRow}>
            {[
              { id: "grey" as UnfinishedPointsColor, label: "Slate Grey" },
              { id: "blue" as UnfinishedPointsColor, label: "Sky Blue" },
            ].map((item) => {
              const active = settings.unfinishedPoints === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  onPress={() => updateSettings({ unfinishedPoints: item.id })}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* Control 6: RTK ±30mm Quality Corridor Ribbon */}
      <View style={styles.controlGroup}>
        <View style={styles.controlMeta}>
          <Text style={styles.controlLabel}>RTK ±30mm Quality Corridor Ribbon</Text>
          <Text style={styles.controlHint}>Precision tolerance boundary overlay</Text>
        </View>
        <View style={styles.segmentRow}>
          {[
            { id: "on" as RtkRibbonMode, label: "Enabled (Show ±30mm Ribbon)" },
            { id: "off" as RtkRibbonMode, label: "Disabled (Centerline Only)" },
          ].map((item) => {
            const active = settings.rtkRibbon === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => updateSettings({ rtkRibbon: item.id })}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Control 7: Reaching Target Waypoint Circle */}
      <View style={styles.controlGroup}>
        <View style={styles.controlMeta}>
          <Text style={styles.controlLabel}>Reaching Waypoint Target Circle</Text>
          <Text style={styles.controlHint}>
            Visual circle indicator around the waypoint the rover is currently approaching
          </Text>
        </View>
        <View style={styles.segmentRow}>
          {[
            { id: "pulse-ring" as TargetCircleStyle, label: "Pulsing Target Ring" },
            { id: "precision-circle" as TargetCircleStyle, label: "Blueprint Target Circle" },
            { id: "glow-halo" as TargetCircleStyle, label: "Glowing Radar Halo" },
            { id: "off" as TargetCircleStyle, label: "Off (Standard Dot)" },
          ].map((item) => {
            const active = settings.targetCircle === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => updateSettings({ targetCircle: item.id })}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Warnings & Reset */}
      {roverSaveFailed || appearanceSaveFailed ? (
        <View style={styles.warning} accessibilityRole="alert">
          <AppIcon name="warning" size="sm" color="#B45309" />
          <Text style={styles.warningText}>
            Some choices could not be saved to device storage. They will be used until the app is closed.
          </Text>
        </View>
      ) : null}

      {!isDefaultRover || !isDefaultTrajectory ? (
        <TouchableOpacity
          style={styles.reset}
          onPress={handleResetAll}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Reset all appearance settings to default"
        >
          <AppIcon name="reset" size="sm" color="#1475EE" />
          <Text style={styles.resetText}>Reset All to Defaults</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE8F7",
    marginBottom: 16,
  },
  content: {
    padding: 20,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#EAF3FF",
    borderWidth: 1,
    borderColor: "#D6E6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: "800", color: "#6681AD", letterSpacing: 0.8 },
  title: { fontSize: 17, fontWeight: "800", color: "#10244B", marginTop: 2 },
  description: { fontSize: 13, color: "#526B93", lineHeight: 19, marginBottom: 14 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6681AD",
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 8,
  },
  previewContainer: {
    height: 160,
    borderRadius: 12,
    backgroundColor: "#08111F",
    borderWidth: 1,
    borderColor: "#1E293B",
    overflow: "hidden",
    position: "relative",
  },
  roverOverlay: {
    position: "absolute",
    marginLeft: -MAP_ROVER_SIZE / 2,
    marginTop: -MAP_ROVER_SIZE / 2,
  },
  statusBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 28,
    backgroundColor: "rgba(10, 22, 40, 0.9)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
  },
  statusPillText: {
    color: "#94A3B8",
    fontSize: 9.5,
  },
  statusPillBold: {
    color: "#38BDF8",
    fontWeight: "600",
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  presetChipActive: {
    backgroundColor: "#EAF3FF",
    borderColor: "#1475EE",
  },
  presetChipText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
  },
  presetChipTextActive: {
    color: "#1475EE",
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#E2E8F0",
    marginVertical: 18,
  },
  subHeader: {
    marginBottom: 12,
  },
  subTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#10244B",
  },
  subHint: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  option: {
    flexGrow: 1,
    flexBasis: 140,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#DDE8F7",
    backgroundColor: "#F8FAFC",
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    gap: 4,
  },
  optionSelected: { borderColor: "#1475EE", backgroundColor: "#EAF3FF" },
  optionArt: {
    width: PREVIEW_ICON_SIZE + 10,
    height: PREVIEW_ICON_SIZE + 10,
    borderRadius: 12,
    backgroundColor: "#DDE8F7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  optionName: { fontSize: 13, fontWeight: "800", color: "#10244B" },
  optionNameSelected: { color: "#1475EE" },
  optionDescription: { fontSize: 11, color: "#526B93", textAlign: "center", lineHeight: 15 },
  check: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#1475EE",
    marginTop: 4,
  },
  checkHidden: { opacity: 0 },
  checkText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  controlGroup: {
    marginBottom: 14,
  },
  controlMeta: {
    marginBottom: 6,
  },
  controlLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E293B",
  },
  controlHint: {
    fontSize: 11.5,
    color: "#64748B",
    marginTop: 1,
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  segmentBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
  },
  segmentBtnActive: {
    backgroundColor: "#EAF3FF",
    borderColor: "#1475EE",
  },
  segmentText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "500",
  },
  segmentTextActive: {
    color: "#1475EE",
    fontWeight: "600",
  },
  twoColRow: {
    flexDirection: "row",
    gap: 12,
  },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#FFF7E6",
    borderWidth: 1,
    borderColor: "#F2C063",
  },
  warningText: { flex: 1, fontSize: 12, color: "#7A4A06", lineHeight: 17 },
  reset: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFD8FA",
    backgroundColor: "#F4F8FE",
  },
  resetText: { color: "#1475EE", fontSize: 14, fontWeight: "800" },
});
