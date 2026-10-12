import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Line } from "react-native-svg";

import {
  DEFAULT_ROVER_ICON_ID,
  ROVER_ICON_OPTIONS,
  type RoverIconId,
} from "../../constants/roverIcons";
import { useRoverIcon } from "../../context/RoverIconContext";
import { AppIcon } from "../shared/AppIcon";
import { RoverIconArt } from "../shared/RoverIconArt";

const PREVIEW_ICON_SIZE = 76;
const MAP_ICON_SIZE = 40;

/** The chosen icon on a short neon route, turned to a sample heading. */
function MapPreview({ iconId }: { iconId: RoverIconId }): React.ReactElement {
  return (
    <View
      style={styles.mapPreview}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Preview of the rover icon on the map"
    >
      <Svg width="100%" height={86} viewBox="0 0 320 86" preserveAspectRatio="none">
        <Line x1={0} y1={43} x2={320} y2={43} stroke="#38BDF8" strokeOpacity={0.45} strokeWidth={12} />
        <Line x1={0} y1={43} x2={320} y2={43} stroke="#38BDF8" strokeWidth={7} />
        <Line x1={0} y1={43} x2={320} y2={43} stroke="#1E88FF" strokeWidth={4.5} />
        <Line x1={0} y1={43} x2={320} y2={43} stroke="#FFFFFF" strokeWidth={1.4} />
      </Svg>
      <View style={styles.mapPreviewRover} pointerEvents="none">
        <View style={{ transform: [{ rotate: "90deg" }] }}>
          <RoverIconArt id={iconId} size={MAP_ICON_SIZE} />
        </View>
      </View>
    </View>
  );
}

/**
 * Settings > Rover Icon. Picking an icon applies it at once on every map and in
 * the header, and it is remembered on this device. There is nothing to save, so
 * there is no draft state to lose.
 */
export function RoverIconPicker(): React.ReactElement {
  const { iconId, saveFailed, setIconId, resetIconId } = useRoverIcon();
  const isDefault = iconId === DEFAULT_ROVER_ICON_ID;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <AppIcon name="categoryAppearance" size="lg" color="#1475EE" />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>APPEARANCE</Text>
          <Text style={styles.title}>Rover Icon</Text>
        </View>
      </View>

      <Text style={styles.description}>
        Choose how the rover looks on the maps and in the top bar. The change
        applies right away and is kept on this device.
      </Text>

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
              <Text style={[styles.optionName, selected && styles.optionNameSelected]}>
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

      <Text style={styles.sectionLabel}>ON THE MAP</Text>
      <MapPreview iconId={iconId} />

      {saveFailed ? (
        <View style={styles.warning} accessibilityRole="alert">
          <AppIcon name="warning" size="sm" color="#B45309" />
          <Text style={styles.warningText}>
            This choice could not be saved. It will be used until the app is
            closed.
          </Text>
        </View>
      ) : null}

      {!isDefault ? (
        <TouchableOpacity
          style={styles.reset}
          onPress={resetIconId}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Reset the rover icon to the default"
        >
          <AppIcon name="reset" size="sm" color="#1475EE" />
          <Text style={styles.resetText}>Reset to default</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DDE8F7",
    padding: 20,
    marginBottom: 16,
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  option: {
    flexGrow: 1,
    flexBasis: 150,
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
    width: PREVIEW_ICON_SIZE + 12,
    height: PREVIEW_ICON_SIZE + 12,
    borderRadius: 12,
    backgroundColor: "#DDE8F7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  optionName: { fontSize: 14, fontWeight: "800", color: "#10244B" },
  optionNameSelected: { color: "#1475EE" },
  optionDescription: { fontSize: 12, color: "#526B93", textAlign: "center", lineHeight: 16 },
  check: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#1475EE",
    marginTop: 4,
  },
  checkHidden: { opacity: 0 },
  checkText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: "#6681AD",
    letterSpacing: 0.8,
    marginTop: 18,
    marginBottom: 8,
  },
  mapPreview: {
    height: 86,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#2C4A2A",
    justifyContent: "center",
  },
  mapPreviewRover: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
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
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFD8FA",
    backgroundColor: "#F4F8FE",
  },
  resetText: { color: "#1475EE", fontSize: 14, fontWeight: "800" },
});
