import React, { memo } from "react";
import { CircleLayer, LineLayer, ShapeSource, SymbolLayer } from "@rnmapbox/maps";

type ShapeSourceProps = React.ComponentProps<typeof ShapeSource>;

interface NativeMapLayerProps {
  sourceId: string;
  layerId: string;
  shape: ShapeSourceProps["shape"];
  variant?: "mission" | "authoring";
  tolerance?: ShapeSourceProps["tolerance"];
  maxZoomLevel?: ShapeSourceProps["maxZoomLevel"];
}

const LINE_FILTER: React.ComponentProps<typeof LineLayer>["filter"] = [
  "==", ["get", "kind"], "line",
];

const MISSION_LINE_STYLE: React.ComponentProps<typeof LineLayer>["style"] = {
  // Consistent high-contrast route treatment used by the field command UI.
  lineColor: "#1475EE",
  lineWidth: ["interpolate", ["linear"], ["zoom"], 15, 2, 19, 3, 22, 4, 24, 5],
  lineOpacity: 0.96,
  lineCap: "round",
  lineJoin: "round",
  lineBlur: 0.15,
};

const AUTHORING_LINE_STYLE: React.ComponentProps<typeof LineLayer>["style"] = {
  ...MISSION_LINE_STYLE,
  lineWidth: 4,
};

const MISSION_POINT_STYLE: React.ComponentProps<typeof CircleLayer>["style"] = {
  circleRadius: ["case", ["==", ["get", "active"], 1], 8, 5],
  circleColor: [
    "case",
    ["==", ["get", "completed"], 1], "#22c55e",
    ["==", ["get", "active"], 1], "#fbbf24",
    "#ef4444",
  ],
  circleStrokeColor: "#ffffff",
  circleStrokeWidth: 2,
};

const AUTHORING_POINT_STYLE: React.ComponentProps<typeof CircleLayer>["style"] = {
  // The number lives in the marker itself, so each point remains readable as
  // part of the path rather than looking like an anonymous dot.
  circleRadius: ["interpolate", ["linear"], ["zoom"], 16, 10, 19, 12, 22, 14],
  circleColor: "#2563eb",
  circleStrokeColor: "#ffffff",
  circleStrokeWidth: 2.25,
};

// Compact plan-order labels make every uploaded point identifiable without
// turning the map into a colored overlay. Keep them visible above satellite
// labels as well: a plan number is operational information, not decoration.
const WAYPOINT_LABEL_STYLE: React.ComponentProps<typeof SymbolLayer>["style"] = {
  // Token syntax is supported by both Mapbox renderers used in our Android
  // builds and avoids expression-serialization differences between versions.
  textField: "{sequence}",
  textSize: ["interpolate", ["linear"], ["zoom"], 16, 9, 19, 11, 22, 12],
  textColor: "#f8fafc",
  textHaloColor: "#0f172a",
  textHaloWidth: 0.75,
  textHaloBlur: 0.2,
  textOffset: [0, 0],
  textAnchor: "center",
  textAllowOverlap: true,
  textIgnorePlacement: true,
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
  return (
    <ShapeSource
      id={sourceId}
      shape={shape}
      tolerance={tolerance}
      maxZoomLevel={maxZoomLevel}
    >
      <LineLayer
        id={layerId}
        filter={LINE_FILTER}
        style={variant === "authoring" ? AUTHORING_LINE_STYLE : MISSION_LINE_STYLE}
      />
    </ShapeSource>
  );
});

export const NativeWaypointLayer = memo(function NativeWaypointLayer({
  sourceId,
  layerId,
  shape,
  variant = "mission",
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
      <CircleLayer
        id={layerId}
        style={variant === "authoring" ? AUTHORING_POINT_STYLE : MISSION_POINT_STYLE}
      />
      <SymbolLayer id={`${layerId}-sequence`} style={WAYPOINT_LABEL_STYLE} />
    </ShapeSource>
  );
});

// Row extension points: navigation-only stops past a row end. Amber with an
// "X" so they never read as numbered marking points.
const EXTENSION_POINT_STYLE: React.ComponentProps<typeof CircleLayer>["style"] = {
  circleRadius: ["interpolate", ["linear"], ["zoom"], 16, 7, 19, 9, 22, 11],
  circleColor: "#f59e0b",
  circleOpacity: 0.9,
  circleStrokeColor: "#0f172a",
  circleStrokeWidth: 2,
};

const EXTENSION_LABEL_STYLE: React.ComponentProps<typeof SymbolLayer>["style"] = {
  textField: "{label}",
  textSize: ["interpolate", ["linear"], ["zoom"], 16, 8, 19, 10, 22, 11],
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
