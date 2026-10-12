import React from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export interface MissionExportSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Save the (edited) mission plan as a CSV file. */
  onExportFile: () => void;
  /** Open the Excel / PDF mission report exporter. */
  onExportReport: () => void;
  /** Ask to clear the mission logs. */
  onClearLogs: () => void;
  fileDisabled: boolean;
  reportDisabled: boolean;
  /** Why clearing is blocked (mission running, ...), or null when allowed. */
  clearBlockedReason: string | null;
}

interface RowProps {
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  accessibilityLabel: string;
}

function SheetRow({
  icon,
  title,
  subtitle,
  onPress,
  disabled = false,
  danger = false,
  accessibilityLabel,
}: RowProps): React.ReactElement {
  const accent = danger ? "#DC2626" : "#1475EE";
  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
    >
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <MaterialCommunityIcons name={icon} size={24} color={disabled ? "#9BAABD" : accent} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, disabled && styles.rowTextDisabled, danger && !disabled && styles.rowTitleDanger]}>
          {title}
        </Text>
        <Text style={[styles.rowSubtitle, disabled && styles.rowTextDisabled]} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={disabled ? "#C5D0DE" : "#7183A1"} />
    </TouchableOpacity>
  );
}

/**
 * Export & logs sheet opened by the Export tile in Mission tools.
 * Replaces the export / clear-logs toolbar of the old bottom table.
 */
export function MissionExportSheet({
  visible,
  onClose,
  onExportFile,
  onExportReport,
  onClearLogs,
  fileDisabled,
  reportDisabled,
  clearBlockedReason,
}: MissionExportSheetProps): React.ReactElement {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={styles.overlay}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close export menu"
      >
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.header}>
            <Text style={styles.title}>Export & logs</Text>
            <TouchableOpacity
              style={styles.close}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close export menu"
            >
              <MaterialCommunityIcons name="close" size={24} color="#10244B" />
            </TouchableOpacity>
          </View>

          <SheetRow
            icon="file-delimited-outline"
            title="Mission file (CSV)"
            subtitle="Save the current mission points, including your edits."
            onPress={onExportFile}
            disabled={fileDisabled}
            accessibilityLabel="Export mission file"
          />
          <SheetRow
            icon="file-chart-outline"
            title="Mission report (Excel / PDF)"
            subtitle="Per-point status, timing and GNSS accuracy from the rover."
            onPress={onExportReport}
            disabled={reportDisabled}
            accessibilityLabel="Export mission report"
          />
          <SheetRow
            icon="delete-sweep-outline"
            title="Clear mission logs"
            subtitle={clearBlockedReason ?? "Remove saved point status and timing. The mission plan stays."}
            onPress={onClearLogs}
            disabled={clearBlockedReason != null}
            danger
            accessibilityLabel="Clear mission logs"
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(16,36,75,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  sheet: {
    width: "100%",
    maxWidth: 460,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE8F7",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#10244B", fontSize: 17, fontWeight: "900" },
  close: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#DDE8F7",
  },
  rowDisabled: { backgroundColor: "#F3F6FA", borderColor: "#E0E7F0" },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF3FF",
  },
  rowIconDanger: { backgroundColor: "#FEF2F2" },
  rowCopy: { flex: 1 },
  rowTitle: { color: "#10244B", fontSize: 14, fontWeight: "900" },
  rowTitleDanger: { color: "#DC2626" },
  rowSubtitle: { color: "#536D97", fontSize: 11, fontWeight: "600", marginTop: 2 },
  rowTextDisabled: { color: "#9BAABD" },
});
