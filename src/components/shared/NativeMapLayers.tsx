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

// Neon Blue route, drawn as four line layers over one source (the geometry is
// serialized once): a soft glow, a light-blue edge, the blue body and a thin
// white centre line. Widths grow with zoom so the white line stays visible.
// Mapbox expressions are plain nested arrays; the library types them loosely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pointColor = (neon: string): any => [
  "case",
  ["==", ["get", "failed"], 1], POINT_FAILED,
  ["==", ["get", "skipped"], 1], POINT_SKIPPED,
  ["==", ["get", "completed"], 1], POINT_DONE,
  neon,
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const activeRadius = (normal: number, active: number): any =>
  ["case", ["==", ["get", "active"], 1], active, normal];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const zoomRadius = (z16: number, z19: number, z22: number, activeBoost = 0): any => [
  "interpolate", ["linear"], ["zoom"],
  16, activeRadius(z16, z16 + activeBoost),
  19, activeRadius(z19, z19 + activeBoost),
  22, activeRadius(z22, z22 + activeBoost),
];

const MISSION_POINT_STYLE: React.ComponentProps<typeof CircleLayer>["style"] = {
  circleRadius: zoomRadius(9, 11, 13, 3),
  circleColor: pointColor(POINT_NEON),
  circleStrokeColor: "#FFFFFF",
  circleStrokeWidth: 2.5,
};

const MISSION_POINT_GLOW_STYLE: React.ComponentProps<typeof CircleLayer>["style"] = {
  circleRadius: zoomRadius(16, 19, 22, 4),
  circleColor: pointColor(POINT_GLOW_NEON),
  circleOpacity: 0.55,
  circleBlur: 0.9,
};

const AUTHORING_POINT_STYLE: React.ComponentProps<typeof CircleLayer>["style"] = {
  // The number lives in the marker itself, so each point remains readable as
  // part of the path rather than looking like an anonymous dot.
  circleRadius: ["interpolate", ["linear"], ["zoom"], 16, 10, 19, 12, 22, 14],
  circleColor: POINT_NEON,
  circleStrokeColor: "#FFFFFF",
  circleStrokeWidth: 2.5,
};

const AUTHORING_POINT_GLOW_STYLE: React.ComponentProps<typeof CircleLayer>["style"] = {
  circleRadius: ["interpolate", ["linear"], ["zoom"], 16, 17, 19, 19, 22, 21],
  circleColor: POINT_GLOW_NEON,
  circleOpacity: 0.55,
  circleBlur: 0.9,
};

// Compact plan-order labels make every uploaded point identifiable without
// turning the map into a colored overlay. Keep them visible above satellite
// labels as well: a plan number is operational information, not decoration.
const WAYPOINT_LABEL_STYLE: React.ComponentProps<typeof SymbolLayer>["style"] = {
  // Token syntax is supported by both Mapbox renderers used in our Android
  // builds and avoids expression-serialization differences between versions.
  textField: "{sequence}",
  textSize: ["interpolate", ["linear"], ["zoom"], 16, 9, 19, 11, 22, 12],
  textColor: "#FFFFFF",
  textHaloColor: "#10244B",
  textHaloWidth: 0.6,
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
      <LineLayer id={`${layerId}-glow`} filter={LINE_FILTER} style={ROUTE_GLOW_STYLE} />
      <LineLayer id={`${layerId}-edge`} filter={LINE_FILTER} style={ROUTE_EDGE_STYLE} />
      <LineLayer id={layerId} filter={LINE_FILTER} style={ROUTE_BODY_STYLE} />
      <LineLayer id={`${layerId}-centre`} filter={LINE_FILTER} style={ROUTE_CENTRE_STYLE} />
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
  const authoring = variant === "authoring";
  return (
    <ShapeSource
      id={sourceId}
      shape={shape}
      tolerance={tolerance}
      maxZoomLevel={maxZoomLevel}
    >
      <CircleLayer
        id={`${layerId}-glow`}
        style={authoring ? AUTHORING_POINT_GLOW_STYLE : MISSION_POINT_GLOW_STYLE}
      />
      <CircleLayer
        id={layerId}
        style={authoring ? AUTHORING_POINT_STYLE : MISSION_POINT_STYLE}
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
