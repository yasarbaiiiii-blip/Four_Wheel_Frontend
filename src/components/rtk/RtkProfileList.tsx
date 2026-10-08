import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { RtkProfile } from "../../types/rtk";
import { colors } from "../../theme/colors";

interface Props {
  profiles: RtkProfile[];
  selectedProfileId: number | null;
  activeProfileId: number | null;
  disabled?: boolean;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onSetDefault?: (id: number) => void;
}

export const RtkProfileList: React.FC<Props> = ({
  profiles,
  selectedProfileId,
  activeProfileId,
  disabled = false,
  onSelect,
  onCreate,
  onSetDefault,
}) => {
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Backend profiles</Text>
        <Pressable
          onPress={onCreate}
          disabled={disabled}
          hitSlop={8}
          style={({ pressed }) => [
            styles.createButton,
            disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.createText}>Create Profile</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {!Array.isArray(profiles) || profiles.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No backend RTK profiles</Text>
            <Text style={styles.emptyBody}>
              Create a profile on the rover. Local tablet profiles are not
              runtime authority.
            </Text>
          </View>
        ) : (
          profiles.map((profile) => {
            const selected = profile.id === selectedProfileId;
            const active = profile.id === activeProfileId;
            return (
              <Pressable
                key={profile.id}
                onPress={() => onSelect(profile.id)}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.row,
                  active && styles.rowActive,
                  selected && styles.rowSelected,
                  pressed && styles.pressed,
                  disabled && styles.disabled,
                ]}
              >
                <View style={styles.rowHeader}>
                  <View style={styles.nameContainer}>
                    <View
                      style={[
                        styles.activeIndicatorIcon,
                        active && styles.activeIndicatorIconActive,
                      ]}
                    >
                      {active ? (
                        <View style={styles.activeIndicatorIconDot} />
                      ) : null}
                    </View>
                    <Text style={styles.name} numberOfLines={1}>
                      {profile.name}
                    </Text>
                  </View>

                  <View style={styles.badgeGroup}>
                    {active ? (
                      <>
                        <View style={styles.activeBadge}>
                          <View style={styles.activeDot} />
                          <Text style={styles.activeBadgeText}>ACTIVE</Text>
                        </View>
                        <View style={styles.defaultBadge}>
                          <Text style={styles.defaultBadgeText}>★ DEFAULT</Text>
                        </View>
                      </>
                    ) : onSetDefault && profile.enabled ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          onSetDefault(profile.id);
                        }}
                        disabled={disabled}
                        hitSlop={6}
                        style={({ pressed }) => [
                          styles.setDefaultButton,
                          disabled && styles.disabled,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={styles.setDefaultText}>Set Default</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <Text style={styles.meta}>
                  {profile.caster_host}:{profile.caster_port}/{profile.mountpoint}
                </Text>
                <View style={styles.badges}>
                  {active ? <Badge label="Active" tone="active" /> : null}
                  {active ? <Badge label="Default (Boot)" tone="accent" /> : null}
                  <Badge
                    label={profile.enabled ? "Enabled" : "Disabled"}
                    tone={profile.enabled ? "success" : "muted"}
                  />
                  <Badge
                    label={`TLS ${profile.tls_mode}`}
                    tone={profile.tls_mode === "REQUIRED" ? "success" : "warning"}
                  />
                  <Badge label={`rev ${profile.revision}`} tone="muted" />
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const Badge: React.FC<{
  label: string;
  tone: "active" | "accent" | "success" | "warning" | "muted";
}> = ({ label, tone }) => (
  <View style={[styles.badge, badgeTone[tone]]}>
    <Text style={[styles.badgeText, badgeTextTone[tone]]}>{label}</Text>
  </View>
);

const badgeTone = StyleSheet.create({
  active: { backgroundColor: "#E6F8F1", borderWidth: 1, borderColor: "#A7F3D0" },
  accent: { backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE" },
  success: { backgroundColor: "#E6F8F1", borderWidth: 1, borderColor: "#A7F3D0" },
  warning: { backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FDE68A" },
  muted: { backgroundColor: "#F1F5F9", borderWidth: 1, borderColor: "#E2E8F0" },
});

const badgeTextTone = StyleSheet.create({
  active: { color: "#059669" },
  accent: { color: "#1D4ED8" },
  success: { color: "#059669" },
  warning: { color: "#B45309" },
  muted: { color: "#64748B" },
});

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 280,
    backgroundColor: "#FFFFFF",
    borderRightWidth: 1,
    borderRightColor: "#DDE8F7",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
    gap: 8,
  },
  title: {
    color: "#10244B",
    fontSize: 16,
    fontWeight: "800",
  },
  createButton: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#1475EE",
    alignItems: "center",
    justifyContent: "center",
  },
  createText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },
  list: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  listContent: {
    padding: 12,
    gap: 10,
    paddingBottom: 24,
  },
  empty: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DDE8F7",
    backgroundColor: "#FFFFFF",
  },
  emptyTitle: {
    color: "#10244B",
    fontWeight: "800",
    marginBottom: 6,
  },
  emptyBody: {
    color: "#526B93",
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    minHeight: 74,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#DDE8F7",
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 4,
    shadowColor: "#173563",
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 4,
    elevation: 1,
  },
  rowActive: {
    borderColor: "#16B980",
    backgroundColor: "#F0FDF4",
  },
  rowSelected: {
    borderColor: "#1475EE",
    backgroundColor: "#EAF3FF",
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  nameContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  activeIndicatorIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  activeIndicatorIconActive: {
    borderColor: "#16B980",
    backgroundColor: "#E6F8F1",
  },
  activeIndicatorIconDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16B980",
  },
  name: {
    color: "#10244B",
    fontSize: 15,
    fontWeight: "800",
    flex: 1,
  },
  badgeGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E6F8F1",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16B980",
  },
  activeBadgeText: {
    color: "#059669",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  defaultBadge: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
  },
  defaultBadgeText: {
    color: "#1D4ED8",
    fontSize: 10,
    fontWeight: "800",
  },
  setDefaultButton: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  setDefaultText: {
    color: "#1E293B",
    fontSize: 11,
    fontWeight: "700",
  },
  meta: {
    color: "#526B93",
    fontSize: 12,
    marginLeft: 26,
  },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
    marginLeft: 26,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.85,
  },
});
