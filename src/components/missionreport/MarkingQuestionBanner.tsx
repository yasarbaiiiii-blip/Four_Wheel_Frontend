import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export interface MarkingQuestionBannerProps {
  visible: boolean;
  pointId?: string | null;
  radialMm?: number | null;
  onAnswer: (mark: boolean) => Promise<unknown> | void;
  isSubmitting?: boolean;
}

/**
 * 31-35mm "Mark or Skip" decision prompt for the operator when the rover
 * settles just outside the 30mm physical marking limit.
 *
 * Rover waits in place until answered.
 * - Mark: commands the spray tool and proceeds.
 * - Skip: records point as failed with OPERATOR_DECLINED and proceeds.
 */
export const MarkingQuestionBanner: React.FC<MarkingQuestionBannerProps> = ({
  visible,
  pointId,
  radialMm,
  onAnswer,
  isSubmitting = false,
}) => {
  const [answeringAction, setAnsweringAction] = useState<"mark" | "skip" | null>(null);

  if (!visible) return null;

  const displayPoint = pointId || "Point";
  const displayDist = radialMm != null ? Math.round(radialMm) : 33;

  const handleAction = async (mark: boolean) => {
    if (isSubmitting || answeringAction !== null) return;
    setAnsweringAction(mark ? "mark" : "skip");
    try {
      await onAnswer(mark);
    } finally {
      setAnsweringAction(null);
    }
  };

  const busy = isSubmitting || answeringAction !== null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View
        style={styles.card}
        accessibilityRole="alert"
        accessibilityLabel={`Marking decision required for ${displayPoint}`}
      >
        <View style={styles.headerRow}>
          <View style={styles.badgeGroup}>
            <View style={styles.warningDot} />
            <Text style={styles.badgeText}>31–35 MM TOLERANCE DECISION</Text>
          </View>
          <View style={styles.limitTag}>
            <Text style={styles.limitTagText}>LIMIT 30 mm</Text>
          </View>
        </View>

        <View style={styles.contentRow}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons
              name="crosshairs-question"
              size={28}
              color="#D97706"
            />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.questionText}>
              <Text style={styles.highlightText}>{displayPoint}</Text> stopped{" "}
              <Text style={styles.highlightDist}>{`${displayDist} mm`}</Text> from target.
              {"\n"}Mark it anyway?
            </Text>
            <Text style={styles.subtext}>
              Rover is holding position. Choosing Skip records reason as operator declined.
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.button, styles.skipButton, busy && styles.buttonDisabled]}
            onPress={() => handleAction(false)}
            disabled={busy}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Skip Point"
          >
            {answeringAction === "skip" ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <>
                <MaterialCommunityIcons name="close-circle-outline" size={18} color="#DC2626" />
                <Text style={styles.skipButtonText}>Skip Point</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.markButton, busy && styles.buttonDisabled]}
            onPress={() => handleAction(true)}
            disabled={busy}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Mark Anyway"
          >
            {answeringAction === "mark" ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="check-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.markButtonText}>Mark Anyway</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 72,
    left: 20,
    right: 20,
    zIndex: 9999,
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 580,
    backgroundColor: "#FFFBEB",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#F59E0B",
    padding: 16,
    shadowColor: "#78350F",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 8,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  badgeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  warningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D97706",
  },
  badgeText: {
    color: "#B45309",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  limitTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(217, 119, 6, 0.12)",
  },
  limitTagText: {
    color: "#B45309",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
  },
  questionText: {
    color: "#78350F",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
  },
  highlightText: {
    color: "#92400E",
    fontWeight: "900",
  },
  highlightDist: {
    color: "#D97706",
    fontWeight: "900",
  },
  subtext: {
    color: "#92400E",
    fontSize: 11,
    fontWeight: "500",
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  skipButton: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1.5,
    borderColor: "#FCA5A5",
  },
  skipButtonText: {
    color: "#DC2626",
    fontSize: 13,
    fontWeight: "800",
  },
  markButton: {
    backgroundColor: "#D97706",
    shadowColor: "#D97706",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  markButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
