import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { RtkCorrectionSourceName } from "../../types/rtk";
import { colors } from "../../theme/colors";

interface Props {
  /** Which settings panel is shown. Viewing never changes the backend. */
  viewing: RtkCorrectionSourceName;
  /** Source the backend has saved (starts at boot); null while unknown. */
  savedSource: RtkCorrectionSourceName | null;
  disabled?: boolean;
  onView: (source: RtkCorrectionSourceName) => void;
}

const OPTIONS: { value: RtkCorrectionSourceName; label: string; hint: string }[] = [
  { value: "NTRIP", label: "NTRIP", hint: "Caster profile / mountpoint" },
  { value: "LORA", label: "LoRa", hint: "Radio on a rover serial port" },
];

export const RtkSourceSelector: React.FC<Props> = ({
  viewing,
  savedSource,
  disabled = false,
  onView,
}) => (
  <View style={styles.wrap}>
    <Text style={styles.caption}>Correction source</Text>
    <View style={styles.row}>
      {OPTIONS.map((option) => {
        const selected = option.value === viewing;
        const saved = option.value === savedSource;
        return (
          <Pressable
            key={option.value}
            onPress={() => onView(option.value)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            style={[
              styles.option,
              selected && styles.optionSelected,
              disabled && styles.disabled,
            ]}
          >
            <View style={styles.optionHead}>
              <Text style={[styles.label, selected && styles.labelSelected]}>
                {option.label}
              </Text>
              {saved ? (
                <View style={styles.activeTag}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>IN USE</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.hint}>{option.hint}</Text>
          </Pressable>
        );
      })}
    </View>
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#DDE8F7",
  },
  caption: {
    color: "#526B93",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  option: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#DDE8F7",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: "center",
  },
  optionSelected: {
    borderColor: "#1475EE",
    backgroundColor: "#EAF3FF",
  },
  optionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  label: {
    color: "#526B93",
    fontSize: 15,
    fontWeight: "700",
  },
  labelSelected: {
    color: "#10244B",
    fontWeight: "800",
  },
  hint: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 2,
  },
  activeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: "auto",
    backgroundColor: "#E6F8F1",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16B980",
  },
  activeText: {
    color: "#059669",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  disabled: {
    opacity: 0.45,
  },
});
