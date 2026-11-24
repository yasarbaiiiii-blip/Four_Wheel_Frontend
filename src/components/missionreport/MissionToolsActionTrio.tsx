import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface MissionToolsActionTrioProps {
  hasMissionLoaded: boolean;
  onUpload: () => void;
  onOpenExtension: () => void;
  onOpenExport: () => void;
}

export function MissionToolsActionTrio({
  hasMissionLoaded,
  onUpload,
  onOpenExtension,
  onOpenExport,
}: MissionToolsActionTrioProps) {
  return (
    <View style={styles.actionTrio}>
      <TouchableOpacity
        style={styles.heroAction}
        onPress={onUpload}
        activeOpacity={0.84}
        accessibilityRole="button"
        accessibilityLabel="Upload mission plan"
      >
        <View style={styles.heroTopline}>
          <Text style={styles.heroKicker}>PRIMARY ACTION</Text>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons
              name="file-upload-outline"
              size={23}
              color="#FFFFFF"
            />
          </View>
        </View>

        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Upload mission</Text>
          <Text style={styles.heroDetail}>
            Add a new route or replace the current plan
          </Text>
        </View>

        <View style={styles.heroFooter}>
          <Text style={styles.heroFooterLabel}>Choose CSV file</Text>
          <View style={styles.heroArrow}>
            <MaterialCommunityIcons
              name="arrow-top-right"
              size={17}
              color="#1475EE"
            />
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.sideActions}>
        <TouchableOpacity
          style={[
            styles.sideAction,
            !hasMissionLoaded && styles.sideActionDisabled,
          ]}
          onPress={onOpenExtension}
          disabled={!hasMissionLoaded}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Open mission extension tools"
          accessibilityState={{ disabled: !hasMissionLoaded }}
        >
          <View
            style={[
              styles.sideIcon,
              !hasMissionLoaded && styles.sideIconDisabled,
            ]}
          >
            <MaterialCommunityIcons
              name="vector-polyline-plus"
              size={20}
              color={hasMissionLoaded ? "#1475EE" : "#9BAABD"}
            />
          </View>
          <View style={styles.sideCopy}>
            <Text
              style={[
                styles.sideTitle,
                !hasMissionLoaded && styles.sideTextDisabled,
              ]}
            >
              Extension
            </Text>
            <Text
              style={[
                styles.sideDetail,
                !hasMissionLoaded && styles.sideTextDisabled,
              ]}
            >
              Row-end tools
            </Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={18}
            color={hasMissionLoaded ? "#7890B0" : "#B7C2D0"}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sideAction}
          onPress={onOpenExport}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Open export and logs menu"
        >
          <View style={styles.sideIcon}>
            <MaterialCommunityIcons
              name="file-export-outline"
              size={20}
              color="#1475EE"
            />
          </View>
          <View style={styles.sideCopy}>
            <Text style={styles.sideTitle}>Export</Text>
            <Text style={styles.sideDetail}>Files &amp; logs</Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={18}
            color="#7890B0"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionTrio: {
    flexDirection: "row",
    gap: 10,
    minHeight: 150,
    marginTop: 14,
  },
  heroAction: {
    flex: 1.12,
    minHeight: 150,
    justifyContent: "space-between",
    padding: 15,
    borderRadius: 18,
    backgroundColor: "#1475EE",
    borderWidth: 1,
    borderColor: "#1475EE",
    shadowColor: "#1475EE",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  heroTopline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroKicker: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.75,
  },
  heroIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  heroCopy: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 8,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  heroDetail: {
    maxWidth: 155,
    marginTop: 4,
    color: "#DCEBFF",
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
  },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroFooterLabel: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 10,
    fontWeight: "800",
  },
  heroArrow: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    shadowColor: "#093670",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  sideActions: {
    flex: 0.88,
    gap: 10,
  },
  sideAction: {
    flex: 1,
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 15,
    backgroundColor: "#F7FAFF",
    borderWidth: 1,
    borderColor: "#D5E3F5",
    shadowColor: "#315987",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  sideActionDisabled: {
    backgroundColor: "#F3F6FA",
    borderColor: "#E0E7F0",
    shadowOpacity: 0,
    elevation: 0,
  },
  sideIcon: {
    width: 38,
    height: 38,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#EAF3FF",
  },
  sideIconDisabled: {
    backgroundColor: "#E9EEF5",
  },
  sideCopy: {
    flex: 1,
    minWidth: 0,
  },
  sideTitle: {
    color: "#315987",
    fontSize: 12,
    fontWeight: "900",
  },
  sideDetail: {
    marginTop: 2,
    color: "#7A8DA8",
    fontSize: 9,
    fontWeight: "700",
  },
  sideTextDisabled: {
    color: "#9BAABD",
  },
});
