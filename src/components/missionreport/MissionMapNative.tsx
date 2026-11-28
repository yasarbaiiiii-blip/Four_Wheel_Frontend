import React, { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { View, StyleSheet, Text, Animated, TouchableOpacity } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  MarkerView,
  MapView,
  Camera,
} from "@rnmapbox/maps";
import { RoverVehicleIcon } from "../shared/RoverVehicleIcon";
import {
  isErrorWaypointStatus,
  type WaypointUiStatus,
} from "../../types/missionWaypointStatus";
import { NativeExtensionPointLayer, NativeTrajectoryLayer, NativeWaypointLayer } from "../shared/NativeMapLayers";
import { RadialOrbitDial, type OrbitClusterMember } from "../shared/RadialOrbitDial";
import { TrajectoryStatusBanner } from "../shared/TrajectoryStatusBanner";
import { OfflineMapStatusBadge } from "../shared/OfflineMapStatusBadge";
import {
  MAPBOX_FALLBACK_STYLE_JSON,
  mapboxStyleUrlForMode,
} from "../../config/mapboxConfig";
import { MapBottomControlsBar } from "../shared/MapBottomControlsBar";
import type { MapStyleMode } from "../shared/MapBottomControlsBar";
import type { Waypoint } from "./types";
import type { LoadedPathPoint } from "../../services/missionApi";
import type { ExtensionPoint, ExtensionPointFeatureCollection } from "../../utils/missionExtension";
import { useMapboxSurface } from "../../hooks/useMapboxSurface";
import { useBackendTrajectory } from "../../context/BackendTrajectoryContext";
import { useFieldMap } from "../../context/FieldMapContext";
import {
  BACKEND_LINE_RENDER,
  buildBackendTrajectoryCollection,
  canDrawBackendLine,
  limitMapPoints,
} from "../../utils/backendTrajectoryPreview";

interface Props {
  roverLat?: number;
  roverLon?: number;
  waypoints?: Waypoint[];
  trajectoryPoints?: LoadedPathPoint[];
  extensionPreviewPath?: ExtensionPoint[] | null;
  extensionPoints?: ExtensionPointFeatureCollection | null;
  heading?: number | null;
  activeWaypointIndex?: number | null;
  armed?: boolean;
  rtkFixType?: number;
  edgeToEdge?: boolean;
  isVisible?: boolean;
  statusMap?: Record<number, { status?: string } & Record<string, unknown>>;
  onMapPress?: (coord: { latitude: number; longitude: number }) => void;
}

const DEFAULT_ZOOM = 15;
// The backend broadcasts the latest telemetry snapshot at 20 Hz. Keep the
// native marker at the same direct-update cadence without interpolating it.
const ROVER_MARKER_INTERVAL_MS = 50;

function isValidLngLat(lon: unknown, lat: unknown): lon is number {
  return (
    typeof lon === "number" &&
    typeof lat === "number" &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

const MissionMapNativeBase: React.FC<Props> = ({
  roverLat = 0,
  roverLon = 0,
  waypoints = [],
  heading = null,
  activeWaypointIndex = null,
  armed = false,
  rtkFixType = 0,
  edgeToEdge = false,
  isVisible = true,
  statusMap,
  extensionPreviewPath = null,
  extensionPoints = null,
  onMapPress,
}) => {
  const cameraRef = useRef<React.ElementRef<typeof Camera>>(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const [mapStyle, setMapStyle] = useState<MapStyleMode>("satellite");
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
  const { preview, authoringChanged } = useBackendTrajectory();
  const { sharedCamera, setSharedCamera } = useFieldMap();

  const rawHasRoverPosition =
    isValidLngLat(roverLon, roverLat) && !(roverLat === 0 && roverLon === 0);
  const [mapRover, setMapRover] = useState<{
    lat: number;
    lon: number;
    heading: number | null;
    armed: boolean;
    rtkFixType: number;
  } | null>(null);
  const roverUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRoverUpdateRef = useRef(0);

  // Mapbox MarkerView is a native view. Apply at most one latest position per
  // backend telemetry interval. Cleanup cancels a pending update when newer
  // data arrives, which drops delayed positions instead of replaying history.
  useEffect(() => {
    if (!isVisible || !rawHasRoverPosition) {
      if (roverUpdateRef.current) clearTimeout(roverUpdateRef.current);
      roverUpdateRef.current = null;
      setMapRover(null);
      return undefined;
    }
    const next = { lat: roverLat, lon: roverLon, heading, armed, rtkFixType };
    const apply = () => {
      lastRoverUpdateRef.current = Date.now();
      roverUpdateRef.current = null;
      setMapRover(next);
    };
    const wait = Math.max(
      0,
      ROVER_MARKER_INTERVAL_MS - (Date.now() - lastRoverUpdateRef.current),
    );
    if (wait === 0) apply();
    else roverUpdateRef.current = setTimeout(apply, wait);
    return () => {
      if (roverUpdateRef.current) clearTimeout(roverUpdateRef.current);
      roverUpdateRef.current = null;
    };
  }, [isVisible, rawHasRoverPosition, roverLat, roverLon, heading, armed, rtkFixType]);

  const roverStatus = mapRover?.armed ? "armed" : (mapRover?.rtkFixType ?? 0) >= 5 ? "rtk" : "disarmed";

  const center = useMemo<[number, number]>(() => {
    if (mapRover) return [mapRover.lon, mapRover.lat];
    const firstValid = waypoints.find((wp) => isValidLngLat(wp.lon, wp.lat));
    if (firstValid) return [firstValid.lon, firstValid.lat];
    return [80.2707, 13.0827];
  }, [mapRover, waypoints]);

  const [activeClusterInfo, setActiveClusterInfo] = useState<{
    clusterSize: number;
    sequences: string;
    sn: number;
  } | null>(null);

  const [activeOrbitMembers, setActiveOrbitMembers] = useState<OrbitClusterMember[]>([]);
  const [isOrbitOpen, setIsOrbitOpen] = useState(false);

  const clusterBarAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (activeClusterInfo) {
      Animated.spring(clusterBarAnim, {
        toValue: 1,
        tension: 110,
        friction: 8,
        useNativeDriver: true,
      }).start();

      const timer = setTimeout(() => {
        Animated.timing(clusterBarAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start(() => setActiveClusterInfo(null));
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

  const waypointCollection = useMemo(() => {
    const rawWaypoints = waypoints
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
          const mStatus = statusMap?.[m.sn]?.status;
          return {
            sn: m.sn,
            sequence: m.sequence + 1,
            status: mStatus || "pending",
            active: m.sequence === activeWaypointIndex,
            lat: m.lat,
            lon: m.lon,
          };
        })
      );

      return group.map((item) => {
        const sn = item.sn;
        const sequence = item.sequence;
        const status = statusMap?.[sn]?.status;
        const completed = status === "completed" || status === "skipped";
        const skipped = status === "skipped";
        const failed = isErrorWaypointStatus(status as WaypointUiStatus | undefined);

        return {
          type: "Feature" as const,
          id: sequence,
          properties: {
            sn,
            sequence: sequence + 1,
            active: sequence === activeWaypointIndex ? 1 : 0,
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
  }, [waypoints, statusMap, activeWaypointIndex]);

  const showTrajectory = !authoringChanged && canDrawBackendLine(preview);
  const trajectoryCollection = useMemo(() => {
    if (extensionPreviewPath && extensionPreviewPath.length >= 2) return buildBackendTrajectoryCollection(extensionPreviewPath, BACKEND_LINE_RENDER);
    if (!showTrajectory) return null;
    return buildBackendTrajectoryCollection(preview.points, BACKEND_LINE_RENDER);
  }, [extensionPreviewPath, showTrajectory, preview.points]);

  const handleToggleMapStyle = useCallback(() => {
    if (usingFallback) return;
    const order: MapStyleMode[] = ["satellite", "streets", "dark"];
    setMapStyle(order[(order.indexOf(mapStyle) + 1) % order.length]);
  }, [mapStyle, usingFallback]);

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
      const cameraCenter = payload?.properties?.center;
      const zoom = payload?.properties?.zoom;
      if (!Array.isArray(cameraCenter) || !isValidLngLat(cameraCenter[0], cameraCenter[1])) return;
      if (typeof zoom !== "number" || !Number.isFinite(zoom)) return;
      zoomRef.current = zoom;
      setSharedCamera(
        { centerCoordinate: [cameraCenter[0], cameraCenter[1]], zoomLevel: zoom },
        "mission",
      );
    },
    [setSharedCamera],
  );

  useEffect(() => {
    if (!mapReady || !sharedCamera || sharedCamera.source === "mission") return;
    zoomRef.current = sharedCamera.zoomLevel;
    cameraRef.current?.setCamera({
      centerCoordinate: sharedCamera.centerCoordinate,
      zoomLevel: sharedCamera.zoomLevel,
      animationDuration: 0,
      animationMode: "none",
    });
  }, [mapReady, sharedCamera]);

  const handleFitMission = useCallback(() => {
    const pts = waypoints.filter((wp) => isValidLngLat(wp.lon, wp.lat));
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
    if (mapRover) {
      minLon = Math.min(minLon, mapRover.lon);
      minLat = Math.min(minLat, mapRover.lat);
      maxLon = Math.max(maxLon, mapRover.lon);
      maxLat = Math.max(maxLat, mapRover.lat);
    }
    cameraRef.current?.fitBounds([maxLon, maxLat], [minLon, minLat], 50, 400);
  }, [waypoints, mapRover]);

  const handleCenterRover = useCallback(() => {
    if (!mapRover) return;
    zoomRef.current = 22;
    cameraRef.current?.flyTo([mapRover.lon, mapRover.lat], 500);
    cameraRef.current?.zoomTo(22, 500);
  }, [mapRover]);

  const handleZoomIn = useCallback(() => {
    zoomRef.current = Math.min(zoomRef.current + 1, 22);
    cameraRef.current?.zoomTo(zoomRef.current, 200);
  }, []);

  const handleZoomOut = useCallback(() => {
    zoomRef.current = Math.max(zoomRef.current - 1, 2);
    cameraRef.current?.zoomTo(zoomRef.current, 200);
  }, []);

  const mapStyleProps = usingFallback
    ? { styleJSON: MAPBOX_FALLBACK_STYLE_JSON }
    : { styleURL: mapboxStyleUrlForMode(mapStyle) };

  if (MapView == null) {
    return (
      <View style={[styles.mapContainer, edgeToEdge && styles.edgeToEdge]}>
        <Text style={styles.fallbackBannerText}>Map module unavailable</Text>
      </View>
    );
  }

  if (!isVisible) {
    // Cached tab: unmount the expensive native surface while it is hidden.
    // This prevents concurrent Mapbox surfaces and stale telemetry work.
    return <View style={[styles.mapContainer, edgeToEdge && styles.edgeToEdge]} />;
  }

  return (
    <View
      style={[styles.mapContainer, edgeToEdge && styles.edgeToEdge]}
      collapsable={false}
      onLayout={onLayout}
    >
      {canMount && (
      <MapView
        key={mapKey}
        style={styles.map}
        {...mapStyleProps}
        compassEnabled={false}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        // TextureView survives tab overlays/remounts more reliably than a
        // SurfaceView on the tablet during a live mission. The marker itself
        // is rate-limited above, so this safety choice does not cause churn.
        surfaceView={false}
        pitchEnabled={false}
        rotateEnabled={false}
        onDidFinishLoadingStyle={onStyleLoaded}
        onDidFinishLoadingMap={onMapReady}
        onDidFinishRenderingMap={onMapReady}
        onMapLoadingError={onMapError}
        onDidFailLoadingMap={onMapError}
        onMapIdle={handleCameraChanged}
        onPress={(e: any) => {
          if (onMapPress && e.geometry && e.geometry.coordinates) {
            onMapPress({
              longitude: e.geometry.coordinates[0],
              latitude: e.geometry.coordinates[1],
            });
          }
        }}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: center, zoomLevel: DEFAULT_ZOOM }}
        />

        {trajectoryCollection && (
          <NativeTrajectoryLayer
            sourceId="generated-trajectory"
            layerId="generated-trajectory-line"
            shape={trajectoryCollection as any}
          />
        )}

        {extensionPoints && trajectoryCollection && (
          <NativeExtensionPointLayer
            sourceId="mission-extension-points"
            layerId="mission-extension-points-layer"
            shape={extensionPoints as any}
          />
        )}

        {waypointCollection.features.length > 0 && (
          <NativeWaypointLayer
            sourceId="mission-points"
            layerId="mission-points-layer"
            shape={waypointCollection as any}
            aboveLayerID={trajectoryCollection ? "generated-trajectory-line-centre" : undefined}
            onPress={handleWaypointPress}
          />
        )}

        {mapRover && (
          <MarkerView
            coordinate={[mapRover.lon, mapRover.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap
            style={{ backgroundColor: "transparent" }}
          >
            <RoverVehicleIcon heading={mapRover.heading} status={roverStatus} />
          </MarkerView>
        )}
      </MapView>
      )}

      {usingFallback && (
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
            {
              opacity: clusterBarAnim,
              transform: [
                {
                  translateY: clusterBarAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-16, 0],
                  }),
                },
              ],
            },
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

      <TrajectoryStatusBanner
        preview={preview}
        hasAuthoringPoints={waypoints.length >= 2}
      />

      <MapBottomControlsBar
        mapStyle={mapStyle}
        disabled={!mapReady}
        onToggleMapStyle={handleToggleMapStyle}
        onFitMission={handleFitMission}
        onCenterRover={handleCenterRover}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  mapContainer: {
    flex: 1,
    backgroundColor: "#1e293b",
  },
  edgeToEdge: {
    borderRadius: 0,
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

export const MissionMapNative = React.memo(MissionMapNativeBase);
