import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface MissionEditToolbarProps {
  pointCount: number;
  canReverse: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** The draft differs from what is on the rover. */
  isDirty: boolean;
  isApplying: boolean;
  onReverse: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCancel: () => void;
  onApply: () => void;
}

interface ToolButtonProps {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  disabled: boolean;
  onPress: () => void;
}

function ToolButton({ icon, label, disabled, onPress }: ToolButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.tool, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <MaterialCommunityIcons
        name={icon}
        size={20}
        color={disabled ? "#9BAABD" : "#1475EE"}
      />
      <Text style={[styles.toolText, disabled && styles.toolTextDisabled]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * Reverse / Undo / Redo plus Cancel / Apply for the Mission Activity edit mode.
 * Changes stay a local draft until Apply succeeds on the rover.
 */
export function MissionEditToolbar({
  pointCount,
  canReverse,
  canUndo,
  canRedo,
  isDirty,
  isApplying,
  onReverse,
  onUndo,
  onRedo,
  onCancel,
  onApply,
}: MissionEditToolbarProps): React.ReactElement {
  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <Text style={styles.count}>{pointCount} points</Text>
        {isDirty && (
          <View style={styles.unsaved}>
            <Text style={styles.unsavedText}>UNSAVED CHANGES</Text>
          </View>
        )}
      </View>

      <View style={styles.row}>
        <ToolButton
          icon="swap-vertical"
          label="Reverse"
          disabled={!canReverse || isApplying}
          onPress={onReverse}
        />
        <ToolButton
          icon="undo-variant"
          label="Undo"
          disabled={!canUndo || isApplying}
          onPress={onUndo}
        />
        <ToolButton
          icon="redo-variant"
          label="Redo"
          disabled={!canRedo || isApplying}
          onPress={onRedo}
        />
      </View>

      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.action, styles.cancel, isApplying && styles.disabled]}
          onPress={onCancel}
          disabled={isApplying}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={isDirty ? "Discard changes" : "Close editing"}
          accessibilityState={{ disabled: isApplying }}
        >
          <Text style={styles.cancelText}>{isDirty ? "Discard" : "Close"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.action,
            styles.apply,
            (!isDirty || isApplying) && styles.disabled,
          ]}
          onPress={onApply}
          disabled={!isDirty || isApplying}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Apply changes to the rover"
          accessibilityState={{ disabled: !isDirty || isApplying }}
        >
          {isApplying ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <MaterialCommunityIcons name="check" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.applyText}>
            {isApplying ? "Applying…" : "Apply"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#DDE8F7",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  count: { color: "#10244B", fontSize: 12, fontWeight: "700" },
  unsaved: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#FFF1DF",
    borderWidth: 1,
    borderColor: "#FFD5A3",
  },
  unsavedText: {
    color: "#C86412",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  row: { flexDirection: "row", gap: 8 },
  tool: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE8F7",
  },
  toolText: { color: "#1475EE", fontSize: 13, fontWeight: "700" },
  toolTextDisabled: { color: "#9BAABD" },
  disabled: { opacity: 0.5 },
  action: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  cancel: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE8F7",
  },
  cancelText: { color: "#10244B", fontSize: 13, fontWeight: "700" },
  apply: { backgroundColor: "#16B980" },
  applyText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
});
