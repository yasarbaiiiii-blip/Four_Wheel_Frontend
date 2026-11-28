import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, Text, View, Animated, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Camera,
  MapView,
  MarkerView,
} from "@rnmapbox/maps";
import { RoverVehicleIcon } from "./RoverVehicleIcon";
import { NativeTrajectoryLayer, NativeWaypointLayer } from "./NativeMapLayers";
import { RadialOrbitDial, type OrbitClusterMember } from "./RadialOrbitDial";
import {
  isErrorWaypointStatus,
  type WaypointUiStatus,
} from "../../types/missionWaypointStatus";
import {
  MAPBOX_FALLBACK_STYLE_JSON,
  mapboxStyleUrlForMode,
} from "../../config/mapboxConfig";
import { useBackendTrajectory } from "../../context/BackendTrajectoryContext";
import { useFieldMap } from "../../context/FieldMapContext";
import MissionContext from "../../context/MissionContext";
import { useMissionProgressOverlayOptional } from "../../context/MissionProgressOverlayContext";
import {
  shallowEqual,
  useLiveTelemetrySelector,
} from "../../context/liveTelemetryStore";
import { useMapboxSurface } from "../../hooks/useMapboxSurface";
import { MapBottomControlsBar } from "./MapBottomControlsBar";
import type { MapStyleMode } from "./MapBottomControlsBar";
import { TrajectoryStatusBanner } from "./TrajectoryStatusBanner";
import { OfflineMapStatusBadge } from "./OfflineMapStatusBadge";
import {
  BACKEND_LINE_RENDER,
  buildBackendTrajectoryCollection,
  canDrawBackendLine,
  limitMapPoints,
  type TrajectoryPreviewPoint,
} from "../../utils/backendTrajectoryPreview";

const DEFAULT_ZOOM = 16;
// Match the backend's 20 Hz telemetry cadence. The trailing timer below keeps
// only the latest coordinate, so a busy native map never has to replay a
// backlog of old rover positions.
const ROVER_THROTTLE_MS = 50;
const CHENNAI: [number, number] = [80.2707, 13.0827];

/**
 * Mapbox is an always-mounted native surface. Subscribe only to the values it
 * actually draws; subscribing through the full telemetry context otherwise
 * reconciles the whole map tree for battery/servo/debug packets as well.
 */
function selectMapTelemetry(snapshot: {
  telemetry: {
    attitude?: { yaw_deg?: number | null };
    state?: { armed?: boolean };
    rtk?: { fix_type?: number };
  };
  roverPosition: { lat: number; lng: number; timestamp: number } | null;
}) {
  return {
    roverPosition: snapshot.roverPosition,
    heading: snapshot.telemetry.attitude?.yaw_deg ?? null,
    armed: snapshot.telemetry.state?.armed ?? false,
    rtk: snapshot.telemetry.rtk?.fix_type ?? 0,
  };
}

function isValidLngLat(lon: unknown, lat: unknown): lon is number {
  return (
    typeof lon === "number" &&
    typeof lat === "number" &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

const FieldMapHostBase: React.FC = () => {
  const {
    activeSurface,
    marking,
    mission,
    markingPressRef,
    missionPressRef,
    sharedCamera,
    setSharedCamera,
  } = useFieldMap();
  const overlayCtx = useMissionProgressOverlayOptional();
  const isActivityScreenOpen = overlayCtx?.isActivityScreenOpen ?? false;
  const { preview, authoringChanged } = useBackendTrajectory();
  const mapTelemetry = useLiveTelemetrySelector(
    selectMapTelemetry,
    shallowEqual,
  );
  const cameraRef = useRef<React.ElementRef<typeof Camera>>(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const initialCenterRef = useRef<[number, number] | null>(null);
  const didFitRef = useRef(false);
  const lastRoverTs = useRef(0);
  const [mapStyle, setMapStyle] = useState<MapStyleMode>("satellite");
  const [rover, setRover] = useState({
    lat: 0,
    lon: 0,
    heading: null as number | null,
    armed: false,
    rtk: 0,
  });

  const {
    usingFallback,
    mapReady,
    canMount,
    mapKey,
    onLayout,
    onMapReady,
    onStyleLoaded,
    onMapError,
  } = useMapboxSurface();

  useEffect(() => {
    const next = {
      lat: mapTelemetry.roverPosition?.lat ?? 0,
      lon: mapTelemetry.roverPosition?.lng ?? 0,
      heading:
        typeof mapTelemetry.heading === "number" &&
        Number.isFinite(mapTelemetry.heading)
          ? mapTelemetry.heading
          : null,
      armed: mapTelemetry.armed,
      rtk: mapTelemetry.rtk,
    };
    const now = Date.now();
    const wait = ROVER_THROTTLE_MS - (now - lastRoverTs.current);
    if (wait <= 0) {
      lastRoverTs.current = now;
      setRover(next);
      return undefined;
    }
    const id = setTimeout(() => {
      lastRoverTs.current = Date.now();
      setRover(next);
    }, wait);
    return () => clearTimeout(id);
  }, [
    mapTelemetry.roverPosition,
    mapTelemetry.heading,
    mapTelemetry.armed,
    mapTelemetry.rtk,
  ]);

  const snapshot = activeSurface === "marking" ? marking : mission;
  const fallbackSnapshot =
    snapshot.waypoints.length > 0
      ? snapshot
      : marking.waypoints.length > 0
        ? marking
        : mission;

  const hasRoverPosition = isValidLngLat(rover.lon, rover.lat);
  const roverStatus = rover.armed
    ? "armed"
    : rover.rtk >= 5
      ? "rtk"
      : "disarmed";

  const [activeClusterInfo, setActiveClusterInfo] = useState<{
    clusterSize: number;
    sequences: string;
    sn: number;
  } | null>(null);

  const [activeOrbitMembers, setActiveOrbitMembers] = useState<OrbitClusterMember[]>([]);
  const [isOrbitOpen, setIsOrbitOpen] = useState(false);

  const clusterBarAnim = useRef(
    typeof Animated !== "undefined" && Animated?.Value
      ? new Animated.Value(0)
      : null,
  ).current;

  useEffect(() => {
    if (activeClusterInfo && clusterBarAnim && Animated?.spring) {
      Animated.spring(clusterBarAnim, {
        toValue: 1,
        tension: 110,
        friction: 8,
        useNativeDriver: true,
      }).start();

      const timer = setTimeout(() => {
        if (Animated?.timing) {
          Animated.timing(clusterBarAnim, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }).start(() => setActiveClusterInfo(null));
        } else {
          setActiveClusterInfo(null);
        }
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [activeClusterInfo, clusterBarAnim]);

  const handleWaypointPress = useCallback((event: any) => {
    const feature = event?.features?.[0];
    if (!feature || !feature.properties) return;
    const { clusterSize, clusterPoints, clusterMembers, sequence, sn } = feature.properties;
    const count = Number(clusterSize) || 1;
    const seqStr = String(clusterPoints || sequence || "");

    let members: OrbitClusterMember[] = [];
    if (clusterMembers) {
      try {
        members = JSON.parse(clusterMembers);
      } catch {}
    }
    if (members.length === 0) {
      members = [
        {
          sn: Number(sn) || 0,
          sequence: Number(sequence) || 1,
          status: "pending",
          lat: feature.geometry?.coordinates?.[1],
          lon: feature.geometry?.coordinates?.[0],
        },
      ];
    }

    if (count > 1) {
      setActiveOrbitMembers(members);
      setIsOrbitOpen(true);
      const coords = feature.geometry?.coordinates;
      if (coords && coords.length >= 2 && isValidLngLat(coords[0], coords[1])) {
        cameraRef.current?.flyTo([coords[0], coords[1]], 350);
      }
    } else {
      setActiveClusterInfo({
        clusterSize: 1,
        sequences: seqStr,
        sn: Number(sn) || 0,
      });
    }
  }, []);

  const missionCtx = useContext(MissionContext);
  const missionWaypoints = missionCtx?.missionWaypoints ?? [];

  const effectiveWaypoints = useMemo(() => {
    if (fallbackSnapshot.waypoints && fallbackSnapshot.waypoints.length > 0) {
      return fallbackSnapshot.waypoints;
    }
    if (missionWaypoints && missionWaypoints.length > 0) {
      return missionWaypoints;
    }
    // Fallback: extract marking points from backend trajectory preview if fallbackSnapshot is empty
    const markingPts = (preview.points ?? []).filter(
      (p) => p.type === "marking" || (typeof p.marking_index === "number" && p.marking_index >= 0)
    );
    if (markingPts.length > 0) {
      return markingPts.map((p, i) => ({
        lat: p.latitude,
        lon: p.longitude,
        sn: typeof p.marking_index === "number" ? p.marking_index + 1 : i + 1,
      }));
    }
    if (preview.points && preview.points.length > 0 && preview.points.length <= 200) {
      return preview.points.map((p, i) => ({
        lat: p.latitude,
        lon: p.longitude,
        sn: i + 1,
      }));
    }
    return [];
  }, [fallbackSnapshot.waypoints, missionWaypoints, preview.points]);

  const defaultCenter = useMemo<[number, number]>(() => {
    if (hasRoverPosition) return [rover.lon, rover.lat];
    const first = effectiveWaypoints.find((wp: any) =>
      isValidLngLat(wp.lon ?? wp.lng ?? wp.longitude, wp.lat ?? wp.latitude),
    );
    if (first) {
      const firstLon = Number(first.lon ?? (first as any).lng ?? (first as any).longitude);
      const firstLat = Number(first.lat ?? (first as any).latitude);
      if (isValidLngLat(firstLon, firstLat)) return [firstLon, firstLat];
    }
    return CHENNAI;
  }, [hasRoverPosition, rover.lat, rover.lon, effectiveWaypoints]);

  if (
    initialCenterRef.current == null &&
    (hasRoverPosition || effectiveWaypoints.length > 0)
  ) {
    initialCenterRef.current = defaultCenter;
  }

  const waypointCollection = useMemo(() => {
    const rawWaypoints = effectiveWaypoints
      .map((waypoint: any, sequence) => {
        const lat = Number(waypoint.lat ?? waypoint.latitude);
        const lon = Number(waypoint.lon ?? waypoint.lng ?? waypoint.longitude);
        const sn = typeof waypoint.sn === "number" ? waypoint.sn : sequence + 1;
        return {
          lat,
          lon,
          sn,
          sequence,
          original: waypoint,
        };
      })
      .filter((wp) => isValidLngLat(wp.lon, wp.lat));

    const limited = limitMapPoints(rawWaypoints);

    // Detect clusters within 2.5 meters so overlapping points can be dispersed sideways
    const visited = new Set<number>();
    const clusters: Array<typeof limited> = [];

    for (let i = 0; i < limited.length; i++) {
      if (visited.has(i)) continue;
      const current = limited[i];
      visited.add(i);
      const group = [current];

      for (let j = i + 1; j < limited.length; j++) {
        if (visited.has(j)) continue;
        const other = limited[j];
        const dLat = (other.lat - current.lat) * 111139;
        const dLon =
          (other.lon - current.lon) *
          111139 *
          Math.cos((current.lat * Math.PI) / 180);
        const dist = Math.sqrt(dLat * dLat + dLon * dLon);
        if (dist <= 2.5) {
          visited.add(j);
          group.push(other);
        }
      }
      clusters.push(group);
    }

    // Build features, keeping original coordinates [item.lon, item.lat] while tracking cluster membership
    const features = clusters.flatMap((group) => {
      const N = group.length;
      const clusterPointsStr = group.map((p) => p.sequence + 1).join(", ");
      const clusterMembersJson = JSON.stringify(
        group.map((m) => {
          const mStatus = fallbackSnapshot.statusMap?.[m.sn]?.status;
          return {
            sn: m.sn,
            sequence: m.sequence + 1,
            status: mStatus || "pending",
            active: m.sequence === fallbackSnapshot.activeWaypointIndex,
            lat: m.lat,
            lon: m.lon,
          };
        })
      );

      return group.map((item) => {
        const sn = item.sn;
        const sequence = item.sequence;
        const status = fallbackSnapshot.statusMap?.[sn]?.status;
        const completed = status === "completed" || status === "skipped";
        const skipped = status === "skipped";
        const failed = isErrorWaypointStatus(status as WaypointUiStatus | undefined);

        return {
          type: "Feature" as const,
          id: sequence,
          properties: {
            sn,
            sequence: sequence + 1,
            active: sequence === fallbackSnapshot.activeWaypointIndex ? 1 : 0,
            completed: completed ? 1 : 0,
            skipped: skipped ? 1 : 0,
            failed: failed ? 1 : 0,
            clusterSize: N,
            clusterPoints: clusterPointsStr,
            clusterMembers: clusterMembersJson,
          },
          geometry: {
            type: "Point" as const,
            coordinates: [item.lon, item.lat],
          },
        };
      });
    });

    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [
    effectiveWaypoints,
    fallbackSnapshot.statusMap,
    fallbackSnapshot.activeWaypointIndex,
  ]);

  const isDraftTrajectory = Boolean(
    fallbackSnapshot.isDraft &&
      (fallbackSnapshot.trajectoryPoints?.length ??
        fallbackSnapshot.waypoints.length) >= 2,
  );
  const showTrajectory =
    isDraftTrajectory || (!authoringChanged && canDrawBackendLine(preview));
  const trajectoryCollection = useMemo(() => {
    if (isDraftTrajectory) {
      const draftPoints: TrajectoryPreviewPoint[] =
        fallbackSnapshot.trajectoryPoints &&
        fallbackSnapshot.trajectoryPoints.length >= 2
          ? fallbackSnapshot.trajectoryPoints
          : fallbackSnapshot.waypoints.map((wp) => ({
              latitude: wp.lat,
              longitude: wp.lon,
            }));
      return buildBackendTrajectoryCollection(
        draftPoints,
        BACKEND_LINE_RENDER,
      );
    }
    if (!showTrajectory) return null;
    return buildBackendTrajectoryCollection(preview.points, BACKEND_LINE_RENDER);
  }, [
    isDraftTrajectory,
    fallbackSnapshot.trajectoryPoints,
    fallbackSnapshot.waypoints,
    showTrajectory,
    preview.points,
  ]);

  // When drafting/authoring, the real-time draft trajectory connects the draft
  // points immediately. Once committed, the confirmed backend trajectory replaces it.
  const visibleRouteCollection = trajectoryCollection;

  const handleToggleMapStyle = useCallback(() => {
    if (usingFallback) return;
    const order: MapStyleMode[] = ["satellite", "streets", "dark"];
    setMapStyle(order[(order.indexOf(mapStyle) + 1) % order.length]);
  }, [mapStyle, usingFallback]);

  const handleFitMission = useCallback(() => {
    const pts = fallbackSnapshot.waypoints.filter((wp) =>
      isValidLngLat(wp.lon, wp.lat),
    );
    const traj = canDrawBackendLine(preview) ? preview.points : [];
    if (pts.length === 0 && traj.length === 0) return;
    const seedLon = pts[0]?.lon ?? traj[0].longitude;
    const seedLat = pts[0]?.lat ?? traj[0].latitude;
    let minLon = seedLon;
    let minLat = seedLat;
    let maxLon = seedLon;
    let maxLat = seedLat;
    for (const wp of pts) {
      minLon = Math.min(minLon, wp.lon);
      minLat = Math.min(minLat, wp.lat);
      maxLon = Math.max(maxLon, wp.lon);
      maxLat = Math.max(maxLat, wp.lat);
    }
    for (const pt of traj) {
      minLon = Math.min(minLon, pt.longitude);
      minLat = Math.min(minLat, pt.latitude);
      maxLon = Math.max(maxLon, pt.longitude);
      maxLat = Math.max(maxLat, pt.latitude);
    }
    if (hasRoverPosition) {
      minLon = Math.min(minLon, rover.lon);
      minLat = Math.min(minLat, rover.lat);
      maxLon = Math.max(maxLon, rover.lon);
      maxLat = Math.max(maxLat, rover.lat);
    }
    cameraRef.current?.fitBounds([maxLon, maxLat], [minLon, minLat], 50, 400);
  }, [
    fallbackSnapshot.waypoints,
    hasRoverPosition,
    preview,
    rover.lat,
    rover.lon,
  ]);

  useEffect(() => {
    if (didFitRef.current || !mapReady) return;
    if (fallbackSnapshot.waypoints.length === 0) return;
    didFitRef.current = true;
    const pts = fallbackSnapshot.waypoints.filter((wp) =>
      isValidLngLat(wp.lon, wp.lat),
    );
    if (pts.length === 0) return;
    let minLon = pts[0].lon;
    let minLat = pts[0].lat;
    let maxLon = pts[0].lon;
    let maxLat = pts[0].lat;
    for (const wp of pts) {
      minLon = Math.min(minLon, wp.lon);
      minLat = Math.min(minLat, wp.lat);
      maxLon = Math.max(maxLon, wp.lon);
      maxLat = Math.max(maxLat, wp.lat);
    }
    if (hasRoverPosition) {
      minLon = Math.min(minLon, rover.lon);
      minLat = Math.min(minLat, rover.lat);
      maxLon = Math.max(maxLon, rover.lon);
      maxLat = Math.max(maxLat, rover.lat);
    }
    cameraRef.current?.fitBounds([maxLon, maxLat], [minLon, minLat], 50, 0);
  }, [
    fallbackSnapshot.waypoints,
    mapReady,
    hasRoverPosition,
    rover.lat,
    rover.lon,
  ]);

  const handleCenterRover = useCallback(() => {
    if (!hasRoverPosition) return;
    zoomRef.current = 22;
    cameraRef.current?.flyTo([rover.lon, rover.lat], 500);
    cameraRef.current?.zoomTo(22, 500);
  }, [hasRoverPosition, rover.lat, rover.lon]);

  const handleZoomIn = useCallback(() => {
    zoomRef.current = Math.min(zoomRef.current + 1, 22);
    cameraRef.current?.zoomTo(zoomRef.current, 200);
  }, []);

  const handleZoomOut = useCallback(() => {
    zoomRef.current = Math.max(zoomRef.current - 1, 2);
    cameraRef.current?.zoomTo(zoomRef.current, 200);
  }, []);

  const handlePress = useCallback(
    (event: any) => {
      const coords = event?.geometry?.coordinates;
      if (!coords || coords.length < 2) return;
      const lon = coords[0];
      const lat = coords[1];
      if (!isValidLngLat(lon, lat)) return;
      const coord = { longitude: lon, latitude: lat };
      if (activeSurface === "marking") {
        markingPressRef.current?.(coord);
      } else if (activeSurface === "mission") {
        missionPressRef.current?.(coord);
      }
    },
    [activeSurface, markingPressRef, missionPressRef],
  );

  const handleCameraChanged = useCallback(
    (event: any) => {
      const payload =
        typeof event?.payload === "string"
          ? (() => {
              try {
                return JSON.parse(event.payload);
              } catch {
                return null;
              }
            })()
          : event?.payload ?? event;
      const center = payload?.properties?.center;
      const zoom = payload?.properties?.zoom;
      if (!Array.isArray(center) || !isValidLngLat(center[0], center[1])) return;
      if (typeof zoom !== "number" || !Number.isFinite(zoom)) return;
      zoomRef.current = zoom;
      setSharedCamera(
        { centerCoordinate: [center[0], center[1]], zoomLevel: zoom },
        "marking",
      );
    },
    [setSharedCamera],
  );

  const mapStyleProps = usingFallback
    ? { styleJSON: MAPBOX_FALLBACK_STYLE_JSON }
    : { styleURL: mapboxStyleUrlForMode(mapStyle) };

  const cameraCenter = initialCenterRef.current ?? defaultCenter;

  const initialZoom = useMemo(() => {
    const pts = fallbackSnapshot.waypoints.filter((wp) =>
      isValidLngLat(wp.lon, wp.lat),
    );
    if (pts.length < 2) return DEFAULT_ZOOM;
    let minLon = pts[0].lon;
    let minLat = pts[0].lat;
    let maxLon = pts[0].lon;
    let maxLat = pts[0].lat;
    for (const wp of pts) {
      minLon = Math.min(minLon, wp.lon);
      minLat = Math.min(minLat, wp.lat);
      maxLon = Math.max(maxLon, wp.lon);
      maxLat = Math.max(maxLat, wp.lat);
    }
    const span = Math.max(maxLon - minLon, maxLat - minLat);
    if (span > 0.05) return 13;
    if (span > 0.02) return 14;
    if (span > 0.008) return 15;
    if (span > 0.003) return 16;
    return 17;
  }, [fallbackSnapshot.waypoints]);

  useEffect(() => {
    if (!mapReady || !sharedCamera || sharedCamera.source === "marking") return;
    zoomRef.current = sharedCamera.zoomLevel;
    cameraRef.current?.setCamera({
      centerCoordinate: sharedCamera.centerCoordinate,
      zoomLevel: sharedCamera.zoomLevel,
      animationDuration: 0,
      animationMode: "none",
    });
  }, [mapReady, sharedCamera]);

  if (MapView == null) {
    return (
      <View style={styles.root}>
        <Text style={styles.fallbackBannerText}>Map module unavailable</Text>
      </View>
    );
  }

  return (
    <View style={styles.root} collapsable={false} onLayout={onLayout}>
      {canMount ? (
        <MapView
          key={mapKey}
          style={styles.map}
          {...mapStyleProps}
          compassEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
          scaleBarEnabled={false}
          surfaceView={true}
          pitchEnabled={false}
          rotateEnabled={false}
          onDidFinishLoadingStyle={onStyleLoaded}
          onDidFinishLoadingMap={onMapReady}
          onDidFinishRenderingMap={onMapReady}
          onMapLoadingError={onMapError}
          onDidFailLoadingMap={onMapError}
          onPress={handlePress}
          onMapIdle={handleCameraChanged}
        >
          <Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: cameraCenter,
              zoomLevel: initialZoom,
            }}
          />

          {visibleRouteCollection && (
            <NativeTrajectoryLayer
              sourceId="field-trajectory"
              layerId="field-trajectory-layer"
              shape={visibleRouteCollection as any}
            />
          )}

          {waypointCollection.features.length > 0 && (
            <NativeWaypointLayer
              sourceId="field-points"
              layerId="field-points-layer"
              shape={waypointCollection as any}
              aboveLayerID={visibleRouteCollection ? "field-trajectory-layer-centre" : undefined}
              variant={activeSurface === "marking" ? "authoring" : "mission"}
              onPress={handleWaypointPress}
            />
          )}

          {hasRoverPosition && (
            <MarkerView
              coordinate={[rover.lon, rover.lat]}
              anchor={{ x: 0.5, y: 0.5 }}
              allowOverlap
              style={{ backgroundColor: "transparent" }}
            >
              <RoverVehicleIcon heading={rover.heading} status={roverStatus} />
            </MarkerView>
          )}
        </MapView>
      ) : (
        <View style={styles.map} />
      )}

      {usingFallback && !mapReady && (
        <View style={styles.fallbackBanner} pointerEvents="none">
          <Text style={styles.fallbackBannerText}>
            Map tiles unavailable — showing rover & path only
          </Text>
        </View>
      )}

      {activeClusterInfo && (
        <Animated.View
          style={[
            styles.clusterBar,
            clusterBarAnim?.interpolate
              ? {
                  opacity: clusterBarAnim,
                  transform: [
                    {
                      translateY: clusterBarAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-16, 0],
                      }),
                    },
                  ],
                }
              : {},
          ]}
        >
          <View style={styles.clusterBadge}>
            <MaterialCommunityIcons name="layers-outline" size={15} color="#FFFFFF" />
            <Text style={styles.clusterBadgeText}>
              {activeClusterInfo.clusterSize > 1
                ? `${activeClusterInfo.clusterSize} Points Clustered`
                : `Point #${activeClusterInfo.sequences}`}
            </Text>
          </View>
          {activeClusterInfo.clusterSize > 1 && (
            <Text style={styles.clusterSequencesText}>
              Waypoints: #{activeClusterInfo.sequences}
            </Text>
          )}
          <TouchableOpacity
            style={styles.clusterCloseBtn}
            onPress={() => setActiveClusterInfo(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Close cluster info"
          >
            <MaterialCommunityIcons name="close" size={16} color="#94A3B8" />
          </TouchableOpacity>
        </Animated.View>
      )}

      <RadialOrbitDial
        visible={isOrbitOpen}
        members={activeOrbitMembers}
        onClose={() => setIsOrbitOpen(false)}
      />

      <OfflineMapStatusBadge />

      {!isActivityScreenOpen && (
        <TrajectoryStatusBanner
          preview={preview}
          hasAuthoringPoints={fallbackSnapshot.waypoints.length >= 2}
        />
      )}

      {!isActivityScreenOpen && (
        <MapBottomControlsBar
          mapStyle={mapStyle}
          disabled={!mapReady}
          onToggleMapStyle={handleToggleMapStyle}
          onFitMission={handleFitMission}
          onCenterRover={handleCenterRover}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0f172a",
  },
  map: {
    flex: 1,
  },
  fallbackBanner: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    zIndex: 20,
  },
  fallbackBannerText: {
    color: "#cbd5e1",
    fontSize: 12,
    textAlign: "center",
  },
  clusterBar: {
    position: "absolute",
    top: 14,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(15, 23, 42, 0.92)",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(56, 189, 248, 0.35)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 30,
  },
  clusterBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#1475EE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  clusterBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  clusterSequencesText: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "600",
  },
  clusterCloseBtn: {
    marginLeft: 4,
    padding: 2,
  },
});

export const FieldMapHost = React.memo(FieldMapHostBase);
export default FieldMapHost;
