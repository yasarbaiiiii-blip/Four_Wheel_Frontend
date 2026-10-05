import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { MarkerView, MapView, Camera } from '@rnmapbox/maps';
import { RoverVehicleIcon } from '../shared/RoverVehicleIcon';
import { NativeExtensionPointLayer, NativeTrajectoryLayer, NativeWaypointLayer } from '../shared/NativeMapLayers';
import { TrajectoryStatusBanner } from '../shared/TrajectoryStatusBanner';
import {
  MAPBOX_STYLE_SATELLITE,
  MAPBOX_FALLBACK_STYLE_JSON,
} from '../../config/mapboxConfig';
import { useMapboxSurface } from '../../hooks/useMapboxSurface';
import { useBackendTrajectory } from '../../context/BackendTrajectoryContext';
import {
  BACKEND_LINE_RENDER,
  buildBackendTrajectoryCollection,
  canDrawBackendLine,
  limitMapPoints,
} from '../../utils/backendTrajectoryPreview';

// Render direct backend positions at the same 20 Hz cadence. This is not an
// animation: it limits the native marker to the newest packet when updates
// arrive in a burst.
const ROVER_MARKER_INTERVAL_MS = 50;

function isValidLngLat(lon: unknown, lat: unknown): lon is number {
  return (
    typeof lon === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    !(lat === 0 && lon === 0)
  );
}

export const PathPlanMapNative: React.FC<any> = ({
  waypoints = [],
  roverPosition = null,
  heading = null,
  onMapPress,
  visualization,
  isVisible: _isVisible = true,
  // GeoJSON of the rover's row-extension points (current revision only).
  extensionPoints = null,
}) => {
  const {
    usingFallback,
    mapReady,
    canMount,
    onLayout,
    onMapReady,
    onStyleLoaded,
    onMapError,
  } = useMapboxSurface();
  const { preview } = useBackendTrajectory();
  const [mapRover, setMapRover] = useState<{
    lat: number;
    lon: number;
    heading: number | null;
  } | null>(null);
  const pendingRoverUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRoverUpdateRef = useRef(0);

  useEffect(() => {
    if (!isValidLngLat(roverPosition?.lon, roverPosition?.lat)) {
      if (pendingRoverUpdateRef.current) clearTimeout(pendingRoverUpdateRef.current);
      pendingRoverUpdateRef.current = null;
      setMapRover(null);
      return undefined;
    }

    const next = {
      lat: roverPosition.lat,
      lon: roverPosition.lon,
      heading: typeof heading === 'number' && Number.isFinite(heading) ? heading : null,
    };
    const apply = () => {
      lastRoverUpdateRef.current = Date.now();
      pendingRoverUpdateRef.current = null;
      setMapRover(next);
    };
    const wait = Math.max(
      0,
      ROVER_MARKER_INTERVAL_MS - (Date.now() - lastRoverUpdateRef.current),
    );
    if (wait === 0) apply();
    else pendingRoverUpdateRef.current = setTimeout(apply, wait);

    return () => {
      if (pendingRoverUpdateRef.current) clearTimeout(pendingRoverUpdateRef.current);
      pendingRoverUpdateRef.current = null;
    };
  }, [roverPosition?.lat, roverPosition?.lon, heading]);

  const center = useMemo(() => {
    if (mapRover) {
      return [mapRover.lon, mapRover.lat];
    }
    if (waypoints.length > 0) {
      return [waypoints[0].lon, waypoints[0].lat];
    }
    return [80.2707, 13.0827];
  }, [mapRover, waypoints]);

  const cameraRef = useRef<React.ElementRef<typeof Camera>>(null);

  // Do not auto-follow the rover. Tab switches and live GPS would otherwise
  // yank the camera. Operators re-center with map controls when they want it.

  const showTrajectory = canDrawBackendLine(preview);
  const trajectoryGeoJSON = useMemo(() => {
    if (!showTrajectory) return null;
    return buildBackendTrajectoryCollection(preview.points, BACKEND_LINE_RENDER);
  }, [showTrajectory, preview.points]);

  const waypointGeoJSON = useMemo(() => {
    if (!waypoints || waypoints.length === 0) return null;
    // Preserve the original sequence before limiting points for rendering. A
    // sampled map marker must still show its real plan number, not its index in
    // the sampled array.
    const features = limitMapPoints<{ waypoint: any; sequence: number }>(
      waypoints.map((waypoint: any, sequence: number) => ({
        waypoint,
        sequence,
      })),
    )
      .map(({ waypoint: wp, sequence }: { waypoint: any; sequence: number }) => {
        if (!isValidLngLat(wp.lon, wp.lat)) return null;
        return {
          type: 'Feature',
          id: sequence,
          properties: {
            id: wp.id ?? sequence + 1,
            sequence: sequence + 1,
          },
          geometry: {
            type: 'Point',
            coordinates: [wp.lon, wp.lat],
          },
        };
      })
      .filter(Boolean);
    if (features.length === 0) return null;
    return {
      type: 'FeatureCollection',
      features,
    };
  }, [waypoints]);

  if (MapView == null) {
    return (
      <View style={styles.container}>
        <Text style={styles.fallbackBannerText}>Map module unavailable</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} collapsable={false} onLayout={onLayout}>
      {canMount && (
      <MapView
        style={styles.map}
        {...(usingFallback
          ? { styleJSON: MAPBOX_FALLBACK_STYLE_JSON }
          : { styleURL: MAPBOX_STYLE_SATELLITE })}
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
        onPress={(e: any) => {
           if(onMapPress && e.geometry && e.geometry.coordinates) {
               onMapPress({ longitude: e.geometry.coordinates[0], latitude: e.geometry.coordinates[1] });
           }
        }}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: center, zoomLevel: 18 }}
        />

        {trajectoryGeoJSON && (
          <NativeTrajectoryLayer
            sourceId="path-source"
            layerId="path-layer"
            shape={trajectoryGeoJSON as any}
            variant="authoring"
            tolerance={0.00001}
            maxZoomLevel={22}
          />
        )}

        {extensionPoints && showTrajectory && (
          <NativeExtensionPointLayer
            sourceId="extension-point-source"
            layerId="extension-point-layer"
            shape={extensionPoints as any}
            tolerance={0.00001}
            maxZoomLevel={22}
          />
        )}

        {waypointGeoJSON && visualization?.waypoints !== false && (
          <NativeWaypointLayer
            sourceId="waypoint-source"
            layerId="waypoint-layer"
            shape={waypointGeoJSON as any}
            variant="authoring"
            tolerance={0.00001}
            maxZoomLevel={22}
          />
        )}

        {mapRover &&
          visualization?.roverIcon !== false &&
          isValidLngLat(mapRover.lon, mapRover.lat) && (
          <MarkerView
            coordinate={[mapRover.lon, mapRover.lat]}
            anchor={{ x: 0.5, y: 0.5 }}
            allowOverlap
            style={{ backgroundColor: "transparent" }}
          >
            <RoverVehicleIcon heading={mapRover.heading} status="rtk" />
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
      <TrajectoryStatusBanner
        preview={preview}
        hasAuthoringPoints={waypoints.length >= 2}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  map: { flex: 1 },
  fallbackBanner: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    zIndex: 20,
  },
  fallbackBannerText: {
    color: '#cbd5e1',
    fontSize: 12,
    textAlign: 'center',
  },
});
