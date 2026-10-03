import React, { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  PATH_PLAN_GLASS,
  PATH_PLAN_HEADER,
} from "../../constants/pathPlanGlass";

interface MissionExtensionDistanceDialogProps {
  visible: boolean;
  initialDistanceM: number;
  onCancel: () => void;
  onConfirm: (distanceM: number) => void;
}

const MIN_EXTENSION_M = 0.1;
const MAX_EXTENSION_M = 20.0;

export const MissionExtensionDistanceDialog: React.FC<
  MissionExtensionDistanceDialogProps
> = ({
  visible,
  initialDistanceM,
  onCancel,
  onConfirm,
}) => {
  const [distanceText, setDistanceText] = useState(
    initialDistanceM.toString(),
  );
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDistanceText(initialDistanceM.toString());
    setErrorText(null);
  }, [visible, initialDistanceM]);

  const handleConfirm = () => {
    const distanceM = Number(distanceText.trim());

    if (!Number.isFinite(distanceM)) {
      setErrorText("Enter a valid extension distance.");
      return;
    }

    if (
      distanceM < MIN_EXTENSION_M ||
      distanceM > MAX_EXTENSION_M
    ) {
      setErrorText(
        `Extension distance must be between ${MIN_EXTENSION_M.toFixed(1)} and ${MAX_EXTENSION_M.toFixed(1)} m.`,
      );
      return;
    }

    onConfirm(distanceM);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <MaterialCommunityIcons
                  name="arrow-expand-horizontal"
                  size={15}
                  color={PATH_PLAN_GLASS.cyan}
                />
              </View>
              <Text style={styles.title}>ROW EXTENSION</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name="close"
                size={14}
                color={PATH_PLAN_GLASS.muted}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            Enter the distance the rover should travel past the row end before
            turning into the next row.
          </Text>

          <View style={styles.inputSection}>
            <Text style={styles.label}>Extension distance</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={distanceText}
                onChangeText={(value) => {
                  setDistanceText(value);
                  setErrorText(null);
                }}
                keyboardType="decimal-pad"
                autoFocus
                selectTextOnFocus
                placeholder="4.0"
                placeholderTextColor={PATH_PLAN_GLASS.muted}
                returnKeyType="done"
                onSubmitEditing={handleConfirm}
              />
              <Text style={styles.unit}>m</Text>
            </View>
            <Text style={styles.rangeText}>
              Allowed range: 0.1 m to 20.0 m
            </Text>
          </View>

          <View style={styles.infoBox}>
            <MaterialCommunityIcons
              name="information-outline"
              size={15}
              color={PATH_PLAN_GLASS.cyan}
            />
            <Text style={styles.infoText}>
              The short-row detection threshold remains 3.0 m. This value only
              changes how far the extension point is placed.
            </Text>
          </View>

          {errorText && (
            <Text style={styles.errorText}>{errorText}</Text>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.okBtn}
              onPress={handleConfirm}
              activeOpacity={0.7}
            >
              <Text style={styles.okText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  dialog: {
    width: 360,
    maxWidth: "88%",
    borderRadius: PATH_PLAN_GLASS.borderRadius,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    padding: 16,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: PATH_PLAN_GLASS.borderSubtle,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconWrap: PATH_PLAN_HEADER.iconWrap,
  closeBtn: PATH_PLAN_HEADER.closeBtn,
  title: {
    ...PATH_PLAN_HEADER.title,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  description: {
    color: PATH_PLAN_GLASS.label,
    fontSize: 12,
    lineHeight: 18,
  },
  inputSection: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.borderSubtle,
    backgroundColor: PATH_PLAN_GLASS.innerBg,
    padding: 12,
    gap: 8,
  },
  label: {
    color: PATH_PLAN_GLASS.label,
    fontSize: 11,
    fontWeight: "700",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    backgroundColor: "rgba(255,255,255,0.03)",
    color: PATH_PLAN_GLASS.title,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "right",
  },
  unit: {
    color: PATH_PLAN_GLASS.title,
    fontSize: 13,
    fontWeight: "800",
  },
  rangeText: {
    color: PATH_PLAN_GLASS.muted,
    fontSize: 10,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 8,
    backgroundColor: PATH_PLAN_GLASS.iconWrapBg,
    padding: 10,
  },
  infoText: {
    flex: 1,
    color: PATH_PLAN_GLASS.label,
    fontSize: 10,
    lineHeight: 15,
  },
  errorText: {
    color: "#F87171",
    fontSize: 10,
    fontWeight: "700",
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 4,
  },
  cancelBtn: {
    flex: 1,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    backgroundColor: PATH_PLAN_GLASS.innerBg,
  },
  cancelText: {
    color: PATH_PLAN_GLASS.label,
    fontSize: 11,
    fontWeight: "700",
  },
  okBtn: {
    flex: 1,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: PATH_PLAN_GLASS.cyan,
  },
  okText: {
    color: "#052E2B",
    fontSize: 11,
    fontWeight: "800",
  },
});
