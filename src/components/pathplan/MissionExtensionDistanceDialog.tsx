import React, { useEffect, useRef, useState } from "react";
import { Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  describeDecision,
  validateChoice,
  type ExtensionChoice,
  type ExtensionLimits,
  type ExtensionPreviewResponse,
  type ExtensionRowEnd,
  type ExtensionSettings,
} from "../../utils/missionExtension";

interface Props {
  visible: boolean;
  initialChoice: ExtensionChoice;
  bounds: ExtensionLimits;
  settings: ExtensionSettings | null;
  rowEnds: ExtensionRowEnd[];
  editable: boolean;
  lockedReason: string | null;
  lockMessage: string | null;
  blockedReason?: string | null;
  previewState: ExtensionPreviewResponse | null;
  previewError: string | null;
  previewPending: boolean;
  applying: boolean;
  onPreview: (choice: ExtensionChoice) => void;
  onClearPreview: () => void;
  onCancel: () => void;
  onApply: (choice: ExtensionChoice) => void;
}

export const MissionExtensionDistanceDialog: React.FC<Props> = ({
  visible, initialChoice, bounds, settings, rowEnds, editable, lockedReason,
  lockMessage, blockedReason, previewState, previewError, previewPending, applying,
  onPreview, onClearPreview, onCancel, onApply,
}) => {
  const [enabled, setEnabled] = useState(initialChoice.enabled);
  const [distanceText, setDistanceText] = useState(String(initialChoice.distanceM));
  const [triggerText, setTriggerText] = useState(String(initialChoice.triggerDistanceM));
  const [touched, setTouched] = useState(false);
  const initialRef = useRef(initialChoice);
  initialRef.current = initialChoice;
  const previewCallRef = useRef(onPreview);
  previewCallRef.current = onPreview;
  const clearRef = useRef(onClearPreview);
  clearRef.current = onClearPreview;

  useEffect(() => {
    if (!visible) { clearRef.current(); return; }
    const start = initialRef.current;
    setEnabled(start.enabled);
    setDistanceText(String(start.distanceM));
    setTriggerText(String(start.triggerDistanceM));
    setTouched(false);
  }, [visible]);

  const choice: ExtensionChoice = {
    enabled,
    distanceM: distanceText.trim() ? Number(distanceText) : Number.NaN,
    triggerDistanceM: triggerText.trim() ? Number(triggerText) : Number.NaN,
  };
  const validation = validateChoice(choice, bounds);
  const invalid = Boolean(validation.distanceError || validation.triggerError);
  const locked = blockedReason != null || (settings != null && !editable);

  // The hook debounces and ignores stale replies. Keep committed geometry until
  // a valid preview arrives; a draft never changes the Load target.
  useEffect(() => {
    if (!visible || locked || settings == null || invalid) return;
    previewCallRef.current(choice);
  }, [visible, locked, settings, enabled, distanceText, triggerText, invalid]);

  const shownRows = previewState?.row_ends ?? rowEnds;
  const shownSettings = previewState?.extension ?? settings;
  const added = previewState?.dummy_point_count ?? shownRows.filter((row) => row.result === "ADDED").length;
  const skipped = previewState?.row_ends_skipped_gap ?? shownRows.filter((row) => row.result === "SKIPPED_GAP").length;
  const extra = previewState?.extra_length_m;
  const adjust = (value: number, step: number, min: number, max: number, set: (text: string) => void) => {
    const next = Math.min(max, Math.max(min, Math.round((value + step) * 10) / 10));
    set(String(next));
  };
  const close = () => { onClearPreview(); onCancel(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <Text style={styles.title}>Row Extension</Text>
            <TouchableOpacity style={styles.touch} onPress={close} accessibilityRole="button" accessibilityLabel="Close row extension settings">
              <MaterialCommunityIcons name="close" size={24} color="#10244B" />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <Text style={styles.label}>Extend past row ends</Text>
                <Text style={styles.help}>The rover drives past a row end before turning into the next row.</Text>
              </View>
              <Switch value={enabled} onValueChange={setEnabled} disabled={locked || applying} accessibilityRole="switch" accessibilityLabel="Extend past row ends" />
            </View>

            {locked && <Text style={styles.warning}>{blockedReason ?? lockMessage ?? lockedReason ?? "This mission cannot be changed now."}</Text>}
            {enabled && <>
              <Text style={styles.label}>Extension distance ({bounds.min_distance_m}–{bounds.max_distance_m} m)</Text>
              <View style={styles.inputRow}>
                <TouchableOpacity style={styles.touch} onPress={() => adjust(choice.distanceM || bounds.default_distance_m, -0.1, bounds.min_distance_m, bounds.max_distance_m, setDistanceText)} disabled={locked || applying} accessibilityRole="button" accessibilityLabel="Decrease extension distance"><Text style={styles.step}>−</Text></TouchableOpacity>
                <TextInput style={styles.input} value={distanceText} onChangeText={setDistanceText} keyboardType="decimal-pad" selectTextOnFocus editable={!locked && !applying} accessibilityLabel="Extension distance in metres" />
                <TouchableOpacity style={styles.touch} onPress={() => adjust(choice.distanceM || bounds.default_distance_m, 0.1, bounds.min_distance_m, bounds.max_distance_m, setDistanceText)} disabled={locked || applying} accessibilityRole="button" accessibilityLabel="Increase extension distance"><Text style={styles.step}>+</Text></TouchableOpacity>
              </View>
              {touched && validation.distanceError && <Text style={styles.error}>{validation.distanceError}</Text>}
              {validation.distanceWarning && <Text style={styles.warning}>{validation.distanceWarning}</Text>}

              <Text style={styles.label}>Trigger distance ({bounds.min_trigger_m}–{bounds.max_trigger_m} m)</Text>
              <View style={styles.inputRow}>
                <TouchableOpacity style={styles.touch} onPress={() => adjust(choice.triggerDistanceM || bounds.default_trigger_m, -0.1, bounds.min_trigger_m, bounds.max_trigger_m, setTriggerText)} disabled={locked || applying} accessibilityRole="button" accessibilityLabel="Decrease trigger distance"><Text style={styles.step}>−</Text></TouchableOpacity>
                <TextInput style={styles.input} value={triggerText} onChangeText={setTriggerText} keyboardType="decimal-pad" selectTextOnFocus editable={!locked && !applying} accessibilityLabel="Trigger distance in metres" />
                <TouchableOpacity style={styles.touch} onPress={() => adjust(choice.triggerDistanceM || bounds.default_trigger_m, 0.1, bounds.min_trigger_m, bounds.max_trigger_m, setTriggerText)} disabled={locked || applying} accessibilityRole="button" accessibilityLabel="Increase trigger distance"><Text style={styles.step}>+</Text></TouchableOpacity>
              </View>
              <Text style={styles.help}>{bounds.trigger_rule}</Text>
              {touched && validation.triggerError && <Text style={styles.error}>{validation.triggerError}</Text>}
            </>}

            {settings && <View style={styles.results}>
              <Text style={styles.label}>{previewPending ? "Updating preview…" : previewState ? "Preview" : "Current mission"}</Text>
              <Text style={styles.help}>{added} X points · {skipped} skipped by gap{extra != null ? ` · ${extra.toFixed(1)} m extra path` : ""}</Text>
              {shownRows.map((row) => <Text key={`${row.from_marking_index}-${row.to_marking_index}`} style={styles.row}>{describeDecision(row, shownSettings)}</Text>)}
            </View>}
            {previewError && <Text style={styles.error}>{previewError}</Text>}
          </ScrollView>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.action} onPress={close} accessibilityRole="button" accessibilityLabel="Cancel row extension"><Text style={styles.actionText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.action, styles.apply, (locked || applying || invalid || previewPending || Boolean(previewError)) && styles.disabled]} onPress={() => { setTouched(true); if (!invalid && !locked && !applying && !previewPending && !previewError) onApply(choice); }} disabled={locked || applying || previewPending || Boolean(previewError)} accessibilityRole="button" accessibilityLabel="Apply row extension"><Text style={styles.applyText}>{applying ? "Applying…" : "Apply"}</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(16,36,75,0.55)" },
  dialog: { width: 460, maxWidth: "94%", maxHeight: "94%", borderRadius: 14, backgroundColor: "#FFFFFF", padding: 16, gap: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#10244B", fontSize: 20, fontWeight: "800" },
  touch: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: "#F8FAFC" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  flex: { flex: 1 },
  label: { color: "#10244B", fontSize: 15, fontWeight: "700", marginTop: 8 },
  help: { color: "#10244B", fontSize: 13, lineHeight: 19, marginTop: 4 },
  warning: { color: "#DC2626", fontSize: 13, marginTop: 6 },
  error: { color: "#DC2626", fontSize: 13, fontWeight: "700", marginTop: 6 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  input: { flex: 1, minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: "#DDE8F7", color: "#10244B", textAlign: "center", fontSize: 18, fontWeight: "700" },
  step: { color: "#1475EE", fontSize: 24, fontWeight: "700" },
  results: { backgroundColor: "#F8FAFC", borderRadius: 8, padding: 10, marginTop: 12, gap: 4 },
  row: { color: "#10244B", fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1, minHeight: 48, justifyContent: "center", alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: "#DDE8F7" },
  apply: { backgroundColor: "#1475EE", borderColor: "#1475EE" },
  disabled: { opacity: 0.45 },
  actionText: { color: "#10244B", fontSize: 15, fontWeight: "700" },
  applyText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
