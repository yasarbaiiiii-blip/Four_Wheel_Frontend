import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
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
import {
  describeDecision,
  validateChoice,
  type ExtensionBounds,
  type ExtensionChoice,
  type ExtensionDecision,
  type ExtensionSettings,
} from "../../utils/missionExtension";

interface MissionExtensionDistanceDialogProps {
  visible: boolean;
  /** Values the dialog opens with (the rover's settings, or the held choice). */
  initialChoice: ExtensionChoice;
  /** The rover's limits; the fallback copy until the rover has answered. */
  bounds: ExtensionBounds;
  /** Rover settings the decisions were computed from (for the reasons text). */
  settings: ExtensionSettings | null;
  decisions: ExtensionDecision[];
  decisionsCurrent: boolean;
  applying: boolean;
  onCancel: () => void;
  onApply: (choice: ExtensionChoice) => void;
}

export const MissionExtensionDistanceDialog: React.FC<
  MissionExtensionDistanceDialogProps
> = ({
  visible,
  initialChoice,
  bounds,
  settings,
  decisions,
  decisionsCurrent,
  applying,
  onCancel,
  onApply,
}) => {
  const [enabled, setEnabled] = useState(initialChoice.enabled);
  const [distanceText, setDistanceText] = useState(
    initialChoice.distanceM.toString(),
  );
  const [triggerText, setTriggerText] = useState(
    initialChoice.triggerDistanceM.toString(),
  );
  const [touched, setTouched] = useState(false);

  // Take the starting values only when the dialog opens: the rover's settings
  // can be re-read while it is open, and that must not overwrite typing.
  const initialChoiceRef = useRef(initialChoice);
  initialChoiceRef.current = initialChoice;
  useEffect(() => {
    if (!visible) return;
    const start = initialChoiceRef.current;
    setEnabled(start.enabled);
    setDistanceText(start.distanceM.toString());
    setTriggerText(start.triggerDistanceM.toString());
    setTouched(false);
  }, [visible]);

  const choice: ExtensionChoice = {
    enabled,
    distanceM: Number(distanceText.trim()),
    triggerDistanceM: Number(triggerText.trim()),
  };
  const validation = validateChoice(choice, bounds);
  const invalid = Boolean(validation.distanceError || validation.triggerError);

  const reasons = useMemo(
    () =>
      decisionsCurrent
        ? decisions.map((decision) => ({
            key: `${decision.from_point}-${decision.to_point}`,
            added: decision.decision === "ADDED",
            text: describeDecision(decision, settings),
          }))
        : [],
    [decisions, decisionsCurrent, settings],
  );
  const addedCount = reasons.filter((reason) => reason.added).length;

  const handleApply = () => {
    setTouched(true);
    if (invalid || applying) return;
    onApply(choice);
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

          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={styles.label}>Extend past row ends</Text>
              <Text style={styles.rangeText}>
                The rover drives past a row end, stops, then turns into the
                next row. Nothing is marked there.
              </Text>
            </View>
            <Switch value={enabled} onValueChange={setEnabled} />
          </View>

          {enabled && (
            <View style={styles.inputSection}>
              <Text style={styles.label}>Extension distance</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={distanceText}
                  onChangeText={setDistanceText}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  placeholder={bounds.distance_m.default.toFixed(1)}
                  placeholderTextColor={PATH_PLAN_GLASS.muted}
                />
                <Text style={styles.unit}>m</Text>
              </View>
              <Text style={styles.rangeText}>
                How far past the row end. {bounds.distance_m.min.toFixed(1)} to{" "}
                {bounds.distance_m.max.toFixed(1)} m.
              </Text>
              {touched && validation.distanceError && (
                <Text style={styles.errorText}>{validation.distanceError}</Text>
              )}
              {validation.distanceWarning && (
                <Text style={styles.warningText}>{validation.distanceWarning}</Text>
              )}

              <Text style={[styles.label, styles.secondLabel]}>Trigger distance</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={triggerText}
                  onChangeText={setTriggerText}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  placeholder={bounds.trigger_distance_m.default.toFixed(1)}
                  placeholderTextColor={PATH_PLAN_GLASS.muted}
                />
                <Text style={styles.unit}>m</Text>
              </View>
              <Text style={styles.rangeText}>
                Only row ends whose next row starts closer than this get an
                extension. {bounds.trigger_distance_m.min.toFixed(1)} to{" "}
                {bounds.trigger_distance_m.max.toFixed(1)} m.
              </Text>
              {touched && validation.triggerError && (
                <Text style={styles.errorText}>{validation.triggerError}</Text>
              )}
            </View>
          )}

          {reasons.length > 0 && (
            <View style={styles.reasonBox}>
              <Text style={styles.label}>
                Current mission: {addedCount} extension point
                {addedCount === 1 ? "" : "s"}
              </Text>
              <ScrollView style={styles.reasonList} nestedScrollEnabled>
                {reasons.map((reason) => (
                  <Text
                    key={reason.key}
                    style={[styles.reasonText, reason.added && styles.reasonAdded]}
                  >
                    {reason.text}
                  </Text>
                ))}
              </ScrollView>
            </View>
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
              style={[styles.okBtn, (applying || (touched && invalid)) && styles.okBtnDisabled]}
              onPress={handleApply}
              disabled={applying}
              activeOpacity={0.7}
            >
              <Text style={styles.okText}>{applying ? "Applying…" : "Apply"}</Text>
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
    width: 400,
    maxWidth: "90%",
    maxHeight: "92%",
    borderRadius: PATH_PLAN_GLASS.borderRadius,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.border,
    backgroundColor: PATH_PLAN_GLASS.panelBg,
    padding: 16,
    gap: 12,
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
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  switchText: {
    flex: 1,
    gap: 4,
  },
  inputSection: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PATH_PLAN_GLASS.borderSubtle,
    backgroundColor: PATH_PLAN_GLASS.innerBg,
    padding: 12,
    gap: 6,
  },
  label: {
    color: PATH_PLAN_GLASS.label,
    fontSize: 11,
    fontWeight: "700",
  },
  secondLabel: {
    marginTop: 8,
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
    lineHeight: 14,
  },
  errorText: {
    color: "#F87171",
    fontSize: 10,
    fontWeight: "700",
  },
  warningText: {
    color: "#FBBF24",
    fontSize: 10,
    fontWeight: "700",
  },
  reasonBox: {
    borderRadius: 8,
    backgroundColor: PATH_PLAN_GLASS.iconWrapBg,
    padding: 10,
    gap: 6,
  },
  reasonList: {
    maxHeight: 120,
  },
  reasonText: {
    color: PATH_PLAN_GLASS.muted,
    fontSize: 10,
    lineHeight: 15,
  },
  reasonAdded: {
    color: "#FBBF24",
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
  okBtnDisabled: {
    opacity: 0.5,
  },
  okText: {
    color: "#052E2B",
    fontSize: 11,
    fontWeight: "800",
  },
});
