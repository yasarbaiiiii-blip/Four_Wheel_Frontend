import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Pressable,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export interface OrbitClusterMember {
  sn: number;
  sequence: number;
  status: string;
  active?: boolean;
  lat?: number;
  lon?: number;
}

export interface RadialOrbitDialProps {
  visible: boolean;
  members: OrbitClusterMember[];
  onSelectMember?: (member: OrbitClusterMember) => void;
  onClose: () => void;
}

const getStatusColor = (status: string, active?: boolean): string => {
  if (active) return "#2563EB";
  const s = (status || "").toLowerCase();
  if (s === "completed") return "#10B981";
  if (s === "failed" || s === "error") return "#EF4444";
  if (s === "skipped") return "#F59E0B";
  return "#475569";
};

const getStatusLabel = (status: string, active?: boolean): string => {
  if (active) return "ACTIVE";
  const s = (status || "").toLowerCase();
  if (s === "completed") return "DONE";
  if (s === "failed" || s === "error") return "FAIL";
  if (s === "skipped") return "SKIP";
  return "PEND";
};

const DIAL_RADIUS = 70;
const SATELLITE_SIZE = 42;
const CENTER_SIZE = 52;
const CONTAINER_SIZE = (DIAL_RADIUS + SATELLITE_SIZE) * 2 + 16; // ~240px

export const RadialOrbitDial: React.FC<RadialOrbitDialProps> = ({
  visible,
  members,
  onSelectMember,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Animations
  const animScale = useRef(new Animated.Value(0)).current;
  const animOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || members.length === 0) return;

    // Find active index default
    const activeIdx = members.findIndex((m) => m.active);
    setSelectedIndex(activeIdx >= 0 ? activeIdx : 0);

    const anims = [
      Animated?.spring?.(animScale, {
        toValue: 1,
        tension: 130,
        friction: 9,
        useNativeDriver: true,
      }),
      Animated?.timing?.(animOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ].filter(Boolean);

    if (typeof Animated?.parallel === "function") {
      Animated.parallel(anims).start();
    } else {
      anims.forEach((a: any) => a?.start && a.start());
    }
  }, [visible, members, animScale, animOpacity]);

  const selectedMember = members[selectedIndex] || members[0];
  const count = members.length;
  const centerCoord = CONTAINER_SIZE / 2;

  // Compute radial coordinates for each satellite node
  const satellitePositions = useMemo(() => {
    if (count === 0) return [];
    return members.map((_, i) => {
      const angle = (i * 2 * Math.PI) / count - Math.PI / 2;
      const x = DIAL_RADIUS * Math.cos(angle);
      const y = DIAL_RADIUS * Math.sin(angle);
      return {
        left: centerCoord + x - SATELLITE_SIZE / 2,
        top: centerCoord + y - SATELLITE_SIZE / 2,
      };
    });
  }, [count, centerCoord]);

  if (!visible || members.length === 0) return null;

  return (
    <View style={styles.overlayContainer} pointerEvents="box-none">
      {/* Dimmed backdrop pressable to close */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View
        style={[
          styles.dialWrapper,
          {
            opacity: animOpacity,
            transform: [{ scale: animScale }],
          },
        ]}
      >
        {/* Radial Orbit Stage */}
        <View style={styles.stage}>
          {/* Orbital Circular Track Ring */}
          <View
            style={[
              styles.orbitRing,
              {
                width: DIAL_RADIUS * 2,
                height: DIAL_RADIUS * 2,
                borderRadius: DIAL_RADIUS,
                left: centerCoord - DIAL_RADIUS,
                top: centerCoord - DIAL_RADIUS,
              },
            ]}
          />

          {/* Central Target Hub */}
          <View
            style={[
              styles.centerHub,
              {
                width: CENTER_SIZE,
                height: CENTER_SIZE,
                borderRadius: CENTER_SIZE / 2,
                left: centerCoord - CENTER_SIZE / 2,
                top: centerCoord - CENTER_SIZE / 2,
              },
            ]}
          >
            <MaterialCommunityIcons name="layers-triple" size={20} color="#38BDF8" />
            <Text style={styles.centerCountText}>{`${count}×`}</Text>
          </View>

          {/* Satellite Orbit Nodes */}
          {members.map((member, i) => {
            const isSelected = i === selectedIndex;
            const pos = satellitePositions[i];
            const color = getStatusColor(member.status, member.active);
            const label = getStatusLabel(member.status, member.active);

            return (
              <TouchableOpacity
                key={`${member.sn}-${member.sequence}`}
                activeOpacity={0.8}
                style={[
                  styles.satelliteNode,
                  {
                    left: pos.left,
                    top: pos.top,
                    backgroundColor: color,
                    borderColor: isSelected ? "#FFFFFF" : "rgba(255,255,255,0.7)",
                    borderWidth: isSelected ? 3 : 2,
                    transform: [{ scale: isSelected ? 1.15 : 1.0 }],
                  },
                ]}
                onPress={() => {
                  setSelectedIndex(i);
                  onSelectMember?.(member);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Waypoint ${member.sequence}`}
              >
                <Text style={styles.satelliteSeqText}>{`#${member.sequence}`}</Text>
                <View style={styles.microBadge}>
                  <Text style={styles.microBadgeText}>{label}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Selected Member Detail Card */}
        {selectedMember && (
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <View style={styles.detailTitleGroup}>
                <View
                  style={[
                    styles.statusIndicatorDot,
                    {
                      backgroundColor: getStatusColor(
                        selectedMember.status,
                        selectedMember.active
                      ),
                    },
                  ]}
                />
                <Text style={styles.detailTitleText}>
                  Point #{selectedMember.sequence}
                </Text>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: `${getStatusColor(
                        selectedMember.status,
                        selectedMember.active
                      )}22`,
                      borderColor: getStatusColor(
                        selectedMember.status,
                        selectedMember.active
                      ),
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      {
                        color: getStatusColor(
                          selectedMember.status,
                          selectedMember.active
                        ),
                      },
                    ]}
                  >
                    {getStatusLabel(selectedMember.status, selectedMember.active)}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close dial"
              >
                <MaterialCommunityIcons name="close" size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            {/* Coordinates / Specs Row */}
            <View style={styles.specRow}>
              <Text style={styles.specText}>
                Tolerance: <Text style={styles.specHighlight}>±30mm</Text>
              </Text>
              <Text style={styles.specDivider}>•</Text>
              <Text style={styles.specText}>
                Spray Hold: <Text style={styles.specHighlight}>3.0s</Text>
              </Text>
              {typeof selectedMember.lat === "number" && (
                <>
                  <Text style={styles.specDivider}>•</Text>
                  <Text style={styles.specText}>
                    {selectedMember.lat.toFixed(5)}°, {selectedMember.lon?.toFixed(5)}°
                  </Text>
                </>
              )}
            </View>

            {/* Tap instruction */}
            <Text style={styles.hintText}>
              Tap any satellite button in the orbit to switch points.
            </Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 99,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(8, 12, 22, 0.45)",
  },
  dialWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  stage: {
    width: CONTAINER_SIZE,
    height: CONTAINER_SIZE,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  orbitRing: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(56, 189, 248, 0.4)",
    borderStyle: "dashed",
    backgroundColor: "rgba(56, 189, 248, 0.04)",
  },
  centerHub: {
    position: "absolute",
    backgroundColor: "#0F172A",
    borderWidth: 2,
    borderColor: "#38BDF8",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#38BDF8",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },
  centerCountText: {
    color: "#38BDF8",
    fontSize: 10,
    fontWeight: "900",
    marginTop: -2,
  },
  satelliteNode: {
    position: "absolute",
    width: SATELLITE_SIZE,
    height: SATELLITE_SIZE,
    borderRadius: SATELLITE_SIZE / 2,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  satelliteSeqText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  microBadge: {
    position: "absolute",
    bottom: -8,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 0.8,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  microBadgeText: {
    color: "#E2E8F0",
    fontSize: 8,
    fontWeight: "800",
  },
  detailCard: {
    marginTop: 10,
    backgroundColor: "rgba(15, 23, 42, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.35)",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: 280,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  detailTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusIndicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  detailTitleText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: "800",
  },
  closeBtn: {
    padding: 2,
  },
  specRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    flexWrap: "wrap",
    gap: 4,
  },
  specText: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "500",
  },
  specHighlight: {
    color: "#E2E8F0",
    fontWeight: "700",
  },
  specDivider: {
    color: "#475569",
    fontSize: 10,
  },
  hintText: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 6,
    textAlign: "center",
  },
});

export default RadialOrbitDial;
