import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import PathPlanScreen from "../screens/PathPlanScreen";
import MissionReportScreen from "../screens/MissionReportScreen";
import { FieldMapHost } from "../components/shared/FieldMapHost";
import { MissionProgressOverlayProvider } from "../context/MissionProgressOverlayContext";
import { BackendTrajectoryProvider } from "../context/BackendTrajectoryContext";
import { FieldMapProvider, useFieldMap } from "../context/FieldMapContext";
import { OfflineMapProvider } from "../context/OfflineMapContext";
import { ErrorBoundary } from "../components/shared/ErrorBoundary";
import { RtkRuntimeNotice } from "../components/rtk/RtkRuntimeNotice";
import { BatteryCriticalNotice } from "../components/battery/BatteryCriticalNotice";
import { MissionRecoveryNotice } from "../components/recovery/MissionRecoveryNotice";
import { SystemEventNotice } from "../components/notifications/SystemEventNotice";
import { Px4LinkNotice } from "../components/px4/Px4LinkNotice";
import { RoverDataStaleNotice } from "../components/notifications/RoverDataStaleNotice";

const MemoPathPlanScreen = React.memo(PathPlanScreen);
const MemoMissionReportScreen = React.memo(MissionReportScreen);

/**
 * One field-operations workspace. The map never unmounts while switching
 * between live progress and route authoring, which keeps the native Mapbox
 * surface stable on Android and removes the old dashboard/tab chrome.
 */
function OperationsWorkspace() {
  const [isPlanningRoute, setIsPlanningRoute] = useState(false);
  const [isDrawingToolsVisible, setIsDrawingToolsVisible] = useState(true);
  const [isMissionOpsVisible, setIsMissionOpsVisible] = useState(true);
  const [isStatisticsVisible, setIsStatisticsVisible] = useState(true);
  const [isBottomTableVisible, setIsBottomTableVisible] = useState(true);
  const { setActiveSurface } = useFieldMap();

  useEffect(() => {
    setActiveSurface(isPlanningRoute ? "marking" : "mission");
  }, [isPlanningRoute, setActiveSurface]);

  return (
    <MissionProgressOverlayProvider>
      <View style={styles.root}>
        <RtkRuntimeNotice />
        <BatteryCriticalNotice />
        <SystemEventNotice />
        <Px4LinkNotice />
        <RoverDataStaleNotice />
        <MissionRecoveryNotice onUploadNewMission={() => setIsPlanningRoute(true)} />

        <View style={styles.body}>
          <View style={styles.mapHost} pointerEvents="auto" collapsable={false}>
            <ErrorBoundary componentName="Field Map">
              <FieldMapHost />
            </ErrorBoundary>
          </View>

          {isPlanningRoute ? (
            <View style={styles.overlayScreen} pointerEvents="box-none" collapsable={false}>
              <ErrorBoundary componentName="Route Planning">
                <MemoPathPlanScreen
                  embedMap={false}
                  isVisible
                  isDrawingToolsVisible={isDrawingToolsVisible}
                  setIsDrawingToolsVisible={setIsDrawingToolsVisible}
                  isMissionOpsVisible={isMissionOpsVisible}
                  setIsMissionOpsVisible={setIsMissionOpsVisible}
                  isStatisticsVisible={isStatisticsVisible}
                  setIsStatisticsVisible={setIsStatisticsVisible}
                  isBottomTableVisible={isBottomTableVisible}
                  setIsBottomTableVisible={setIsBottomTableVisible}
                  onLoadMissionSuccess={() => setIsPlanningRoute(false)}
                />
              </ErrorBoundary>
            </View>
          ) : (
            <View style={styles.overlayScreen} pointerEvents="box-none" collapsable={false}>
              <ErrorBoundary componentName="Mission Progress">
                <MemoMissionReportScreen
                  embedMap={false}
                  isVisible
                  onOpenPlan={() => setIsPlanningRoute(true)}
                />
              </ErrorBoundary>
            </View>
          )}
        </View>
      </View>
    </MissionProgressOverlayProvider>
  );
}

export default function TabNavigator() {
  return (
    <FieldMapProvider>
      <BackendTrajectoryProvider>
        <OfflineMapProvider>
          <OperationsWorkspace />
        </OfflineMapProvider>
      </BackendTrajectoryProvider>
    </FieldMapProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B1220" },
  body: { flex: 1, position: "relative" },
  mapHost: { ...StyleSheet.absoluteFillObject, zIndex: 0 },
  overlayScreen: { ...StyleSheet.absoluteFillObject, zIndex: 1, backgroundColor: "transparent" },
});
