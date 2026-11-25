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
  isOperatorStop?: boolean;
  planName?: string | null;
  extensionLabel?: string | null;
}

export function MissionToolsActionTrio({
  hasMissionLoaded,
  onUpload,
  onOpenExtension,
  onOpenExport,
  isOperatorStop = false,
  planName,
  extensionLabel,
}: MissionToolsActionTrioProps) {
  return (
    <View style={styles.container}>
      {/* ROW 1: Upload (Full Width Hero Banner) */}
      <TouchableOpacity
        style={styles.uploadBanner}
        onPress={onUpload}
        activeOpacity={0.84}
        accessibilityRole="button"
        accessibilityLabel="Upload mission plan"
      >
        <View style={styles.uploadLeft}>
          <View style={styles.uploadIconWrap}>
            <MaterialCommunityIcons
              name="file-upload-outline"
              size={24}
              color="#FFFFFF"
            />
          </View>
          <View style={styles.uploadCopy}>
            <View style={styles.uploadHeaderRow}>
              <Text style={styles.uploadTitle}>Upload mission</Text>
              {planName ? (
                <View style={styles.planBadge}>
                  <Text style={styles.planBadgeText} numberOfLines={1}>
                    {planName}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.uploadSub}>
              Select a CSV route or replace current plan
            </Text>
          </View>
        </View>

        <View style={styles.chooseFilePill}>
          <Text style={styles.chooseFileText}>Choose CSV</Text>
          <MaterialCommunityIcons
            name="arrow-top-right"
            size={16}
            color="#1475EE"
          />
        </View>
      </TouchableOpacity>

      {/* ROW 2: Extension & Export (Twin Side-by-Side Cards) */}
      <View style={styles.secondaryRow}>
        {/* Extension Card */}
        <TouchableOpacity
          style={[
            styles.twinCard,
            !hasMissionLoaded && styles.twinCardDisabled,
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
              styles.twinIconWrap,
              !hasMissionLoaded && styles.twinIconWrapDisabled,
            ]}
          >
            <MaterialCommunityIcons
              name="vector-polyline-plus"
              size={20}
              color={hasMissionLoaded ? "#1475EE" : "#9BAABD"}
            />
          </View>
          <View style={styles.twinCopy}>
            <View style={styles.twinTitleRow}>
              <Text
                style={[
                  styles.twinTitle,
                  !hasMissionLoaded && styles.twinTextDisabled,
                ]}
              >
                Extension
              </Text>
              {hasMissionLoaded && (
                <View style={styles.extActiveBadge}>
                  <Text style={styles.extActiveBadgeText}>
                    {extensionLabel || "Ready"}
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={[
                styles.twinSub,
                !hasMissionLoaded && styles.twinTextDisabled,
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

        {/* Export Card */}
        <TouchableOpacity
          style={[
            styles.twinCard,
            isOperatorStop && styles.twinCardAlert,
          ]}
          onPress={onOpenExport}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Open export and logs menu"
        >
          <View
            style={[
              styles.twinIconWrap,
              isOperatorStop && styles.twinIconWrapAlert,
            ]}
          >
            <MaterialCommunityIcons
              name="file-export-outline"
              size={20}
              color={isOperatorStop ? "#D97706" : "#1475EE"}
            />
          </View>
          <View style={styles.twinCopy}>
            <View style={styles.twinTitleRow}>
              <Text style={styles.twinTitle}>Export</Text>
              {isOperatorStop && (
                <View style={styles.stopReportBadge}>
                  <Text style={styles.stopReportBadgeText}>STOP REPORT</Text>
                </View>
              )}
            </View>
            <Text style={styles.twinSub}>
              {isOperatorStop ? "Statement ready" : "Files & logs"}
            </Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={18}
            color={isOperatorStop ? "#D97706" : "#7890B0"}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    marginTop: 14,
  },
  uploadBanner: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    backgroundColor: "#1475EE",
    borderWidth: 1,
    borderColor: "#1475EE",
    shadowColor: "#1475EE",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  uploadLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginRight: 10,
  },
  uploadIconWrap: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  uploadCopy: {
    flex: 1,
  },
  uploadHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  uploadTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  planBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.22)",
    maxWidth: 140,
  },
  planBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  uploadSub: {
    marginTop: 3,
    color: "#DCEBFF",
    fontSize: 11,
    fontWeight: "600",
    lineHeight: 14,
  },
  chooseFilePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    shadowColor: "#093670",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  chooseFileText: {
    color: "#1475EE",
    fontSize: 11,
    fontWeight: "800",
  },
  secondaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  twinCard: {
    flex: 1,
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "#F7FAFF",
    borderWidth: 1,
    borderColor: "#D5E3F5",
    shadowColor: "#315987",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  twinCardDisabled: {
    backgroundColor: "#F3F6FA",
    borderColor: "#E0E7F0",
    shadowOpacity: 0,
    elevation: 0,
  },
  twinCardAlert: {
    borderColor: "#FCD34D",
    backgroundColor: "#FFFBEB",
  },
  twinIconWrap: {
    width: 38,
    height: 38,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#EAF3FF",
  },
  twinIconWrapDisabled: {
    backgroundColor: "#E9EEF5",
  },
  twinIconWrapAlert: {
    backgroundColor: "#FEF3C7",
  },
  twinCopy: {
    flex: 1,
    minWidth: 0,
  },
  twinTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  twinTitle: {
    color: "#315987",
    fontSize: 13,
    fontWeight: "900",
  },
  extActiveBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    backgroundColor: "#DCFCE7",
  },
  extActiveBadgeText: {
    color: "#15803D",
    fontSize: 9,
    fontWeight: "800",
  },
  stopReportBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  stopReportBadgeText: {
    color: "#B45309",
    fontSize: 8,
    fontWeight: "900",
  },
  twinSub: {
    marginTop: 2,
    color: "#7A8DA8",
    fontSize: 10,
    fontWeight: "600",
  },
  twinTextDisabled: {
    color: "#9BAABD",
  },
});
