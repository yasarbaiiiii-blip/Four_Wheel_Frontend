import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const mockTelemetryContext = React.createContext({
  telemetry: { attitude: { yaw_deg: 0 }, state: { armed: false }, rtk: { fix_type: 5 } },
  roverPosition: { lat: 13.1, lng: 80.2 },
});

let mockActiveSurface: "marking" | "mission" = "mission";
let mockMarkingSnapshot: any = { waypoints: [] };
let mockMissionSnapshot: any = { waypoints: [] };
const mockMarkingPressRef: { current: ((coord: { longitude: number; latitude: number }) => void) | null } = {
  current: null,
};
const mockMissionPressRef: { current: ((coord: { longitude: number; latitude: number }) => void) | null } = {
  current: null,
};

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  StyleSheet: { create: (styles: unknown) => styles, absoluteFillObject: {} },
}));

let capturedMapViewProps: any = null;
jest.mock("@rnmapbox/maps", () => ({
  MapView: (props: any) => {
    capturedMapViewProps = props;
    return React.createElement("MapView", props, props.children);
  },
  Camera: "Camera",
  MarkerView: "MarkerView",
  LineLayer: "LineLayer",
  CircleLayer: "CircleLayer",
  SymbolLayer: "SymbolLayer",
  ShapeSource: "ShapeSource",
}));

jest.mock("../../../context/BackendTrajectoryContext", () => ({
  useBackendTrajectory: () => ({ preview: { points: [], missionId: null, timestamp: 0 } }),
}));
jest.mock("../../../context/liveTelemetryStore", () => ({
  shallowEqual: (left: unknown, right: unknown) => left === right,
  useLiveTelemetrySelector: (selector: (snapshot: unknown) => unknown) =>
    selector(React.useContext(mockTelemetryContext)),
}));
jest.mock("../../../context/FieldMapContext", () => ({
  useFieldMap: () => ({
    activeSurface: mockActiveSurface,
    marking: mockMarkingSnapshot,
    mission: mockMissionSnapshot,
    markingPressRef: mockMarkingPressRef,
    missionPressRef: mockMissionPressRef,
    sharedCamera: null,
    setSharedCamera: jest.fn(),
  }),
}));
jest.mock("../../../hooks/useMapboxSurface", () => ({
  useMapboxSurface: () => ({ canMount: true, mapReady: true, usingFallback: false }),
}));
jest.mock("../../../config/mapboxConfig", () => ({
  MAPBOX_FALLBACK_STYLE_JSON: "{}",
  mapboxStyleUrlForMode: (mode: string) => mode,
}));
jest.mock("../RoverVehicleIcon", () => ({ RoverVehicleIcon: () => null }));
jest.mock("../MapBottomControlsBar", () => ({ MapBottomControlsBar: () => null }));
jest.mock("../TrajectoryStatusBanner", () => ({ TrajectoryStatusBanner: () => null }));
jest.mock("../OfflineMapStatusBadge", () => ({ OfflineMapStatusBadge: () => null }));

import { FieldMapHost } from "../FieldMapHost";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("FieldMapHost onPress dispatching", () => {
  beforeEach(() => {
    capturedMapViewProps = null;
    mockActiveSurface = "mission";
    mockMarkingPressRef.current = null;
    mockMissionPressRef.current = null;
    mockMarkingSnapshot = { waypoints: [] };
    mockMissionSnapshot = { waypoints: [] };
  });

  it("dispatches map click to missionPressRef when activeSurface is mission", () => {
    const onMissionPress = jest.fn();
    mockMissionPressRef.current = onMissionPress;
    mockActiveSurface = "mission";

    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<FieldMapHost />);
    });

    expect(capturedMapViewProps).toBeTruthy();
    act(() => {
      capturedMapViewProps.onPress({
        geometry: { coordinates: [80.25, 13.05] },
      });
    });

    expect(onMissionPress).toHaveBeenCalledTimes(1);
    expect(onMissionPress).toHaveBeenCalledWith({
      longitude: 80.25,
      latitude: 13.05,
    });
  });

  it("dispatches map click to markingPressRef when activeSurface is marking", () => {
    const onMarkingPress = jest.fn();
    mockMarkingPressRef.current = onMarkingPress;
    mockActiveSurface = "marking";

    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<FieldMapHost />);
    });

    expect(capturedMapViewProps).toBeTruthy();
    act(() => {
      capturedMapViewProps.onPress({
        geometry: { coordinates: [80.28, 13.08] },
      });
    });

    expect(onMarkingPress).toHaveBeenCalledTimes(1);
    expect(onMarkingPress).toHaveBeenCalledWith({
      longitude: 80.28,
      latitude: 13.08,
    });
  });

  it("ignores clicks with invalid coordinates or (0,0)", () => {
    const onMissionPress = jest.fn();
    mockMissionPressRef.current = onMissionPress;
    mockActiveSurface = "mission";

    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<FieldMapHost />);
    });

    // 0,0 coordinates
    act(() => {
      capturedMapViewProps.onPress({
        geometry: { coordinates: [0, 0] },
      });
    });
    expect(onMissionPress).not.toHaveBeenCalled();

    // Out of bounds latitude
    act(() => {
      capturedMapViewProps.onPress({
        geometry: { coordinates: [80.0, 95.0] },
      });
    });
    expect(onMissionPress).not.toHaveBeenCalled();
  });

  it("handles null press handlers gracefully without throwing", () => {
    mockMissionPressRef.current = null;
    mockActiveSurface = "mission";

    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<FieldMapHost />);
    });

    expect(() => {
      act(() => {
        capturedMapViewProps.onPress({
          geometry: { coordinates: [80.25, 13.05] },
        });
      });
    }).not.toThrow();
  });

  it("renders draft trajectory in real time when snapshot has isDraft and at least 2 waypoints", () => {
    mockActiveSurface = "mission";
    mockMissionSnapshot = {
      isDraft: true,
      waypoints: [
        { lat: 13.01, lon: 80.21, sn: 1 },
        { lat: 13.02, lon: 80.22, sn: 2 },
      ],
      trajectoryPoints: [
        { latitude: 13.01, longitude: 80.21 },
        { latitude: 13.02, longitude: 80.22 },
      ],
    };

    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<FieldMapHost />);
    });

    const shapeSources = renderer.root.findAllByType("ShapeSource");
    const trajectorySource = shapeSources.find(
      (s: any) => s.props.id === "field-trajectory",
    );
    expect(trajectorySource).toBeTruthy();
    const lineFeature = trajectorySource.props.shape.features.find(
      (f: any) => f.geometry.type === "LineString",
    );
    expect(lineFeature).toBeTruthy();
    expect(lineFeature.geometry.coordinates).toEqual([
      [80.21, 13.01],
      [80.22, 13.02],
    ]);
  });

  it("updates draft trajectory when a 3rd point is added to the draft in real time", () => {
    mockActiveSurface = "mission";
    mockMissionSnapshot = {
      isDraft: true,
      waypoints: [
        { lat: 13.01, lon: 80.21, sn: 1 },
        { lat: 13.02, lon: 80.22, sn: 2 },
        { lat: 13.03, lon: 80.23, sn: 3 },
      ],
      trajectoryPoints: [
        { latitude: 13.01, longitude: 80.21 },
        { latitude: 13.02, longitude: 80.22 },
        { latitude: 13.03, longitude: 80.23 },
      ],
    };

    let renderer: any;
    act(() => {
      renderer = TestRenderer.create(<FieldMapHost />);
    });

    const shapeSources = renderer.root.findAllByType("ShapeSource");
    const trajectorySource = shapeSources.find(
      (s: any) => s.props.id === "field-trajectory",
    );
    expect(trajectorySource).toBeTruthy();
    const lineFeature = trajectorySource.props.shape.features.find(
      (f: any) => f.geometry.type === "LineString",
    );
    expect(lineFeature).toBeTruthy();
    expect(lineFeature.geometry.coordinates).toEqual([
      [80.21, 13.01],
      [80.22, 13.02],
      [80.23, 13.03],
    ]);
  });
});
