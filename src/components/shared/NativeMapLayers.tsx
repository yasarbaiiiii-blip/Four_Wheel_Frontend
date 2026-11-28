import React, { memo } from "react";
import { CircleLayer, LineLayer, ShapeSource, SymbolLayer } from "@rnmapbox/maps";

import { useTrajectoryAppearance } from "../../context/TrajectoryAppearanceContext";

type ShapeSourceProps = React.ComponentProps<typeof ShapeSource>;

interface NativeMapLayerProps {
  sourceId: string;
  layerId: string;
  shape: ShapeSourceProps["shape"];
  variant?: "mission" | "authoring";
  /** Native map layer that this layer group must render above. */
  aboveLayerID?: string;
  tolerance?: ShapeSourceProps["tolerance"];
  maxZoomLevel?: ShapeSourceProps["maxZoomLevel"];
  onPress?: (event: any) => void;
}

const LINE_FILTER: React.ComponentProps<typeof LineLayer>["filter"] = [
  "==", ["get", "kind"], "line",
];

const FINISHED_LINE_FILTER: React.ComponentProps<typeof LineLayer>["filter"] = [
  "all",
  ["==", ["get", "kind"], "line"],
  ["==", ["get", "lineStatus"], "finished"],
];

const UNFINISHED_LINE_FILTER: React.ComponentProps<typeof LineLayer>["filter"] = [
  "all",
  ["==", ["get", "kind"], "line"],
  ["!=", ["get", "lineStatus"], "finished"],
];

const ACTIVE_POINT_FILTER: React.ComponentProps<typeof CircleLayer>["filter"] = [
  "==", ["coalesce", ["get", "active"], 0], 1,
];

// Neon Blue route width interpolation
const zoomWidth = (z15: number, z19: number, z22: number, z24: number): any =>
  ["interpolate", ["linear"], ["zoom"], 15, z15, 19, z19, 22, z22, 24, z24];

const ROUTE_GLOW_STYLE: React.ComponentProps<typeof LineLayer>["style"] = {
  lineColor: "#38BDF8",
  lineWidth: zoomWidth(8, 13, 18, 21),
  lineOpacity: 0.45,
  lineBlur: 5,
  lineCap: "round",
  lineJoin: "round",
};

const ROUTE_EDGE_STYLE: React.ComponentProps<typeof LineLayer>["style"] = {
  lineColor: "#38BDF8",
  lineWidth: zoomWidth(5, 8, 11, 13),
  lineCap: "round",
  lineJoin: "round",
};

const ROUTE_BODY_STYLE: React.ComponentProps<typeof LineLayer>["style"] = {
  lineColor: "#1E88FF",
  lineWidth: zoomWidth(3, 5, 7, 8),
  lineCap: "round",
  lineJoin: "round",
};

const ROUTE_CENTRE_STYLE: React.ComponentProps<typeof LineLayer>["style"] = {
  lineColor: "#FFFFFF",
  lineWidth: zoomWidth(1, 1.6, 2.2, 2.6),
  lineOpacity: 0.95,
  lineCap: "round",
  lineJoin: "round",
};

// Point colours. Neon blue is a planned or pending point; green, grey and red
// show a finished, skipped or failed point so progress is never hidden by the
// new look. The mission map sets `failed`, `skipped` and `completed` (1 = yes).
const POINT_NEON = "#1475EE";
const POINT_GLOW_NEON = "#38BDF8";
const POINT_DONE = "#16B980";
const POINT_SKIPPED = "#8FA1BC";
const POINT_FAILED = "#D94A42";

// Mapbox GL Native strictly requires zoom-based interpolate expressions to be pure
// camera expressions (literal numeric stops). Feature property expressions like "case"
// or "get" inside zoom stops cause Mapbox Native C++ to discard the layer.
const zoomRadius = (z12: number, z16: number, z19: number, z22: number): any => [
  "interpolate", ["linear"], ["zoom"],
  12, z12,
  16, z16,
  19, z19,
  22, z22,
];

const MISSION_POINT_GLOW_STYLE: React.ComponentProps<typeof CircleLayer>["style"] = {
  circleRadius: zoomRadius(17, 21, 25, 29),
  circleColor: "#38BDF8",
  circleOpacity: 0.35,
  circleBlur: 0.8,
};

const AUTHORING_POINT_STYLE: React.ComponentProps<typeof CircleLayer>["style"] = {
  circleRadius: zoomRadius(12, 14, 17, 20),
  circleColor: "#FFFFFF",
  circleStrokeColor: POINT_NEON,
  circleStrokeWidth: 2.5,
};

const AUTHORING_POINT_GLOW_STYLE: React.ComponentProps<typeof CircleLayer>["style"] = {
  circleRadius: zoomRadius(17, 21, 25, 29),
  circleColor: POINT_GLOW_NEON,
  circleOpacity: 0.55,
  circleBlur: 0.9,
};

// ShapeSource serializes its entire GeoJSON whenever it renders. Keep the
// source and its children behind a memo boundary so rover/camera updates do
// not serialize unchanged mission geometry or rebuild native layer styles.
export const NativeTrajectoryLayer = memo(function NativeTrajectoryLayer({
  sourceId,
  layerId,
  shape,
  variant = "mission",
  tolerance,
  maxZoomLevel,
}: NativeMapLayerProps) {
  const { settings } = useTrajectoryAppearance();

  if (variant === "authoring") {
    return (
      <ShapeSource
        id={sourceId}
        shape={shape}
        tolerance={tolerance}
        maxZoomLevel={maxZoomLevel}
      >
        <LineLayer id={`${layerId}-glow`} filter={LINE_FILTER} style={ROUTE_GLOW_STYLE} />
        <LineLayer id={`${layerId}-edge`} filter={LINE_FILTER} style={ROUTE_EDGE_STYLE} />
        <LineLayer id={layerId} filter={LINE_FILTER} style={ROUTE_BODY_STYLE} />
        <LineLayer id={`${layerId}-centre`} filter={LINE_FILTER} style={ROUTE_CENTRE_STYLE} />
      </ShapeSource>
    );
  }

  const showRibbon = settings.rtkRibbon === "on";

  // Finished line styling flags
  const isFinishedDotted = settings.finishedLine === "dotted-blueprint";
  const isFinishedBlue = settings.finishedLine === "solid-blue";
  const isFinishedGreen = settings.finishedLine === "solid-green";
  const isFinishedGrey = settings.finishedLine === "faded-grey";

  // Unfinished line styling parameters
  const unfinColor =
    settings.unfinishedColor === "grey"
      ? "#94A3B8"
      : settings.unfinishedColor === "indigo"
        ? "#6366F1"
        : "#38BDF8";
  const unfinDash =
    settings.unfinishedType === "dashed"
      ? [3, 2]
      : settings.unfinishedType === "dots"
        ? [1, 2]
        : undefined;

  const layers: React.ReactElement[] = [];

  if (showRibbon) {
    layers.push(
      <LineLayer
        key={`${layerId}-ribbon`}
        id={`${layerId}-ribbon`}
        filter={LINE_FILTER}
        style={{
          lineColor: "#10B981",
          lineWidth: zoomWidth(18, 28, 38, 48),
          lineOpacity: 0.16,
          lineCap: "round",
          lineJoin: "round",
        }}
      />,
    );
  }

  layers.push(
    <LineLayer
      key={`${layerId}-unfin-glow`}
      id={`${layerId}-unfin-glow`}
      filter={UNFINISHED_LINE_FILTER}
      style={{
        lineColor: unfinColor,
        lineWidth: zoomWidth(7, 12, 16, 20),
        lineOpacity: 0.32,
        lineBlur: 4,
        lineCap: "round",
        lineJoin: "round",
      }}
    />,
    <LineLayer
      key={`${layerId}-unfin-body`}
      id={`${layerId}-unfin-body`}
      filter={UNFINISHED_LINE_FILTER}
      style={{
        lineColor: unfinColor,
        lineWidth: zoomWidth(3, 4.5, 6, 7.5),
        lineDasharray: unfinDash,
        lineCap: "round",
        lineJoin: "round",
      }}
    />,
  );

  if (isFinishedDotted) {
    layers.push(
      <LineLayer
        key={`${layerId}-fin-dotted`}
        id={`${layerId}-fin-dotted`}
        filter={FINISHED_LINE_FILTER}
        style={{
          lineColor: "#1475EE",
          lineWidth: zoomWidth(2.5, 4, 6, 7.5),
          lineDasharray: [1, 2],
          lineCap: "round",
          lineJoin: "round",
        }}
      />,
    );
  } else if (isFinishedBlue) {
    layers.push(
      <LineLayer
        key={`${layerId}-fin-edge`}
        id={`${layerId}-fin-edge`}
        filter={FINISHED_LINE_FILTER}
        style={{
          lineColor: "#0C4EA3",
          lineWidth: zoomWidth(5, 8, 11, 13),
          lineCap: "round",
          lineJoin: "round",
        }}
      />,
      <LineLayer
        key={`${layerId}-fin-body`}
        id={`${layerId}-fin-body`}
        filter={FINISHED_LINE_FILTER}
        style={{
          lineColor: "#1475EE",
          lineWidth: zoomWidth(3.5, 5.5, 7.5, 9),
          lineCap: "round",
          lineJoin: "round",
        }}
      />,
      <LineLayer
        key={`${layerId}-fin-centre`}
        id={`${layerId}-fin-centre`}
        filter={FINISHED_LINE_FILTER}
        style={{
          lineColor: "#93C5FD",
          lineWidth: zoomWidth(1, 1.6, 2.2, 2.6),
          lineOpacity: 0.95,
          lineCap: "round",
          lineJoin: "round",
        }}
      />,
    );
  } else if (isFinishedGreen) {
    layers.push(
      <LineLayer
        key={`${layerId}-fin-edge`}
        id={`${layerId}-fin-edge`}
        filter={FINISHED_LINE_FILTER}
        style={{
          lineColor: "#064E3B",
          lineWidth: zoomWidth(5, 8, 11, 13),
          lineCap: "round",
          lineJoin: "round",
        }}
      />,
      <LineLayer
        key={`${layerId}-fin-body`}
        id={`${layerId}-fin-body`}
        filter={FINISHED_LINE_FILTER}
        style={{
          lineColor: "#16B980",
          lineWidth: zoomWidth(3.5, 5.5, 7.5, 9),
          lineCap: "round",
          lineJoin: "round",
        }}
      />,
      <LineLayer
        key={`${layerId}-fin-centre`}
        id={`${layerId}-fin-centre`}
        filter={FINISHED_LINE_FILTER}
        style={{
          lineColor: "#A7F3D0",
          lineWidth: zoomWidth(1, 1.6, 2.2, 2.6),
          lineOpacity: 0.95,
          lineCap: "round",
          lineJoin: "round",
        }}
      />,
    );
  } else if (isFinishedGrey) {
    layers.push(
      <LineLayer
        key={`${layerId}-fin-grey`}
        id={`${layerId}-fin-grey`}
        filter={FINISHED_LINE_FILTER}
        style={{
          lineColor: "#64748B",
          lineWidth: zoomWidth(2.5, 4, 5.5, 6.5),
          lineOpacity: 0.45,
          lineCap: "round",
          lineJoin: "round",
        }}
      />,
    );
  }

  return (
    <ShapeSource
      id={sourceId}
      shape={shape}
      tolerance={tolerance}
      maxZoomLevel={maxZoomLevel}
    >
      {layers}
    </ShapeSource>
  );
});

export const NativeWaypointLayer = memo(function NativeWaypointLayer({
  sourceId,
  layerId,
  shape,
  variant = "mission",
  aboveLayerID,
  tolerance,
  maxZoomLevel,
  onPress,
}: NativeMapLayerProps) {
  const { settings } = useTrajectoryAppearance();
  const authoring = variant === "authoring";

  const doneColor =
    settings.finishedPoints === "blue" ? "#1475EE" : "#16B980";
  const pendingColor =
    settings.unfinishedPoints === "blue" ? "#38BDF8" : "#64748B";

  const dynamicPointColor: any = [
    "case",
    ["==", ["coalesce", ["get", "failed"], 0], 1], POINT_FAILED,
    ["==", ["coalesce", ["get", "skipped"], 0], 1], POINT_SKIPPED,
    ["==", ["coalesce", ["get", "completed"], 0], 1], doneColor,
    ["==", ["coalesce", ["get", "active"], 0], 1], "#1475EE",
    pendingColor,
  ];

  const missionPointStyle: React.ComponentProps<typeof CircleLayer>["style"] = {
    circleRadius: zoomRadius(12, 14, 17, 20),
    circleColor: "#FFFFFF",
    circleStrokeColor: dynamicPointColor,
    circleStrokeWidth: 2.5,
  };

  const waypointLabelStyle: React.ComponentProps<typeof SymbolLayer>["style"] = {
    textField: "{sequence}",
    textSize: ["interpolate", ["linear"], ["zoom"], 12, 10.5, 16, 12, 19, 14.5, 22, 17],
    textColor: dynamicPointColor,
    textHaloColor: "#FFFFFF",
    textHaloWidth: 1.2,
    textHaloBlur: 0.1,
    textOffset: [0, 0],
    textAnchor: "center",
    textAllowOverlap: true,
    textIgnorePlacement: true,
  };

  const showTargetCircle = !authoring && settings.targetCircle !== "off";

  const layers: React.ReactElement[] = [];

  layers.push(
    <CircleLayer
      key={`${layerId}-glow`}
      id={`${layerId}-glow`}
      {...(aboveLayerID ? { aboveLayerID } : {})}
      style={authoring ? AUTHORING_POINT_GLOW_STYLE : MISSION_POINT_GLOW_STYLE}
    />,
  );

  if (showTargetCircle) {
    layers.push(
      <CircleLayer
        key={`${layerId}-target-outer`}
        id={`${layerId}-target-outer`}
        aboveLayerID={`${layerId}-glow`}
        filter={ACTIVE_POINT_FILTER}
        style={{
          circleRadius: zoomRadius(20, 24, 29, 35),
          circleColor: "transparent",
          circleStrokeColor: "#1475EE",
          circleStrokeWidth: 2.2,
          circleOpacity: 0.85,
        }}
      />,
      <CircleLayer
        key={`${layerId}-target-inner`}
        id={`${layerId}-target-inner`}
        aboveLayerID={`${layerId}-target-outer`}
        filter={ACTIVE_POINT_FILTER}
        style={{
          circleRadius: zoomRadius(15, 18, 22, 27),
          circleColor: "rgba(20, 117, 238, 0.14)",
          circleStrokeColor: "#38BDF8",
          circleStrokeWidth: 1.4,
        }}
      />,
    );
  }

  layers.push(
    <CircleLayer
      key={layerId}
      id={layerId}
      aboveLayerID={`${layerId}-glow`}
      style={authoring ? AUTHORING_POINT_STYLE : missionPointStyle}
    />,
    <SymbolLayer
      key={`${layerId}-sequence`}
      id={`${layerId}-sequence`}
      aboveLayerID={layerId}
      style={waypointLabelStyle}
    />,
  );

  return (
    <ShapeSource
      key={aboveLayerID ?? "no-route-anchor"}
      id={sourceId}
      shape={shape}
      tolerance={tolerance}
      maxZoomLevel={maxZoomLevel}
      onPress={onPress}
    >
      {layers}
    </ShapeSource>
  );
});

// Row extension points: navigation-only stops past a row end. Amber with an
// "X" so they never read as numbered marking points.
const EXTENSION_POINT_STYLE: React.ComponentProps<typeof CircleLayer>["style"] = {
  circleRadius: ["interpolate", ["linear"], ["zoom"], 12, 7.5, 16, 9.5, 19, 11.5, 22, 13.5],
  circleColor: "#f59e0b",
  circleOpacity: 0.9,
  circleStrokeColor: "#0f172a",
  circleStrokeWidth: 2,
};

const EXTENSION_LABEL_STYLE: React.ComponentProps<typeof SymbolLayer>["style"] = {
  textField: "{label}",
  textSize: ["interpolate", ["linear"], ["zoom"], 12, 7.5, 16, 9.5, 19, 11.5, 22, 13],
  textColor: "#0f172a",
  textAnchor: "center",
  textAllowOverlap: true,
  textIgnorePlacement: true,
};

export const NativeExtensionPointLayer = memo(function NativeExtensionPointLayer({
  sourceId,
  layerId,
  shape,
  tolerance,
  maxZoomLevel,
}: NativeMapLayerProps) {
  return (
    <ShapeSource
      id={sourceId}
      shape={shape}
      tolerance={tolerance}
      maxZoomLevel={maxZoomLevel}
    >
      <CircleLayer id={layerId} style={EXTENSION_POINT_STYLE} />
      <SymbolLayer id={`${layerId}-label`} style={EXTENSION_LABEL_STYLE} />
    </ShapeSource>
  );
});
