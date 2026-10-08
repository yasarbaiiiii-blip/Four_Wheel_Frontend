import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { RtkControlViewModel } from "../../adapters/rtkControlAdapter";
import { colors } from "../../theme/colors";

interface Props {
  view: RtkControlViewModel;
}

function toneColor(tone: RtkControlViewModel["tone"]): string {
  switch (tone) {
    case "healthy":
      return "#16B980";
    case "transitional":
    case "degraded":
      return "#F59E0B";
    case "terminal":
      return "#EF4444";
    default:
      return "#64748B";
  }
}

function formatAge(age: number | null): string {
  if (age == null || !Number.isFinite(age)) {
    return "—";
  }
  return `${age.toFixed(1)} s`;
}

function asText(value: unknown): string {
  if (value == null) {
    return "—";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "—";
}

function lastPathPart(path: string | null | undefined): string {
  if (!path) {
    return "no port";
  }
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

function sourceText(view: RtkControlViewModel): string {
  if (view.correctionSource === "LORA") {
    const lora = view.sourceSettings;
    return `LoRa · ${lastPathPart(lora?.lora_serial_device)} @ ${
      lora?.lora_serial_baud ?? "—"
    }`;
  }
  if (view.correctionSource === "NTRIP") {
    return `NTRIP · ${view.activeProfile?.mountpoint ?? "no active profile"}`;
  }
  return "—";
}

export const RtkStatusStrip: React.FC<Props> = ({ view }) => {
  const color = toneColor(view.tone);

  return (
    <View style={styles.wrap}>
      <View style={[styles.headline, { borderColor: color }]}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.headlineText, { color }]}>{asText(view.headlineLabel)}</Text>
        <Text style={styles.desired}>
          Desired {asText(view.desiredState)} · Manager {asText(view.managerState)}
        </Text>
      </View>

      <View style={styles.grid}>
        <Metric label="Source" value={sourceText(view)} />
        <Metric label="Corrections" value={asText(view.correctionState)} />
        <Metric label="Correction age" value={formatAge(view.correctionAgeSec)} />
        <Metric
          label="Published frames"
          value={view.publishedFrames == null ? "—" : String(view.publishedFrames)}
        />
        <Metric
          label="Socket bytes"
          value={
            view.socketBytesReceived == null
              ? "—"
              : String(view.socketBytesReceived)
          }
        />
        <Metric
          label="GNSS fix"
          value={
            typeof view.gnssFixName === "string"
              ? `${view.gnssFixName.replace(/_/g, " ")} (${view.gnssFixType ?? "—"})`
              : "—"
          }
        />
        <Metric
          label="RTK solution"
          value={view.rtkFixed ? "RTK Fixed" : view.rtkFloat ? "RTK Float" : "No RTK"}
        />
        {view.ggaEnabled ? (
          <Metric label="GGA" value={asText(view.ggaState)} />
        ) : null}
      </View>
    </View>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#DDE8F7",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  headline: {
    minHeight: 46,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  headlineText: {
    fontSize: 15,
    fontWeight: "800",
  },
  desired: {
    marginLeft: "auto",
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  metric: {
    width: "33.33%",
    paddingVertical: 6,
    paddingRight: 8,
  },
  metricLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: {
    color: "#10244B",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 2,
  },
});
