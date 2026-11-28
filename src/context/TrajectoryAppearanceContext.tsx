import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DEFAULT_TRAJECTORY_APPEARANCE,
  type TrajectoryAppearanceSettings,
} from "../constants/trajectoryAppearance";
import {
  loadTrajectoryAppearance,
  saveTrajectoryAppearance,
  type KeyValueStorage,
} from "../services/trajectoryAppearanceStorage";

export interface TrajectoryAppearanceContextValue {
  settings: TrajectoryAppearanceSettings;
  isReady: boolean;
  saveFailed: boolean;
  updateSettings: (partial: Partial<TrajectoryAppearanceSettings>) => void;
  resetSettings: () => void;
  applyPreset: (presetId: "style8" | "style7" | "classicGreen") => void;
}

const NOOP_VALUE: TrajectoryAppearanceContextValue = {
  settings: DEFAULT_TRAJECTORY_APPEARANCE,
  isReady: true,
  saveFailed: false,
  updateSettings: () => undefined,
  resetSettings: () => undefined,
  applyPreset: () => undefined,
};

const TrajectoryAppearanceContext =
  createContext<TrajectoryAppearanceContextValue>(NOOP_VALUE);

export function TrajectoryAppearanceProvider({
  children,
  storage,
}: {
  children: React.ReactNode;
  storage?: KeyValueStorage;
}): React.ReactElement {
  const [settings, setSettingsState] =
    useState<TrajectoryAppearanceSettings>(DEFAULT_TRAJECTORY_APPEARANCE);
  const [isReady, setIsReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const mountedRef = useRef(true);
  const pickedRef = useRef(false);
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    mountedRef.current = true;
    void loadTrajectoryAppearance(storage).then((saved) => {
      if (!mountedRef.current) return;
      if (!pickedRef.current) setSettingsState(saved);
      setIsReady(true);
    });
    return () => {
      mountedRef.current = false;
    };
  }, [storage]);

  const updateSettings = useCallback(
    (partial: Partial<TrajectoryAppearanceSettings>) => {
      pickedRef.current = true;
      setSettingsState((prev) => {
        const next = { ...prev, ...partial };
        writeChainRef.current = writeChainRef.current
          .then(() => saveTrajectoryAppearance(next, storage))
          .then((saved) => {
            if (mountedRef.current) setSaveFailed(!saved);
          });
        return next;
      });
    },
    [storage],
  );

  const resetSettings = useCallback(() => {
    updateSettings(DEFAULT_TRAJECTORY_APPEARANCE);
  }, [updateSettings]);

  const applyPreset = useCallback(
    (presetId: "style8" | "style7" | "classicGreen") => {
      if (presetId === "style8") {
        updateSettings({
          finishedLine: "dotted-blueprint",
          unfinishedType: "dashed",
          unfinishedColor: "cyan",
          unfinishedPoints: "grey",
          finishedPoints: "blue",
          rtkRibbon: "off",
          targetCircle: "pulse-ring",
        });
      } else if (presetId === "style7") {
        updateSettings({
          finishedLine: "solid-blue",
          unfinishedType: "dashed",
          unfinishedColor: "cyan",
          unfinishedPoints: "grey",
          finishedPoints: "blue",
          rtkRibbon: "off",
          targetCircle: "pulse-ring",
        });
      } else if (presetId === "classicGreen") {
        updateSettings({
          finishedLine: "solid-green",
          unfinishedType: "dashed",
          unfinishedColor: "cyan",
          unfinishedPoints: "blue",
          finishedPoints: "green",
          rtkRibbon: "off",
          targetCircle: "pulse-ring",
        });
      }
    },
    [updateSettings],
  );

  const value = useMemo<TrajectoryAppearanceContextValue>(
    () => ({
      settings,
      isReady,
      saveFailed,
      updateSettings,
      resetSettings,
      applyPreset,
    }),
    [settings, isReady, saveFailed, updateSettings, resetSettings, applyPreset],
  );

  return (
    <TrajectoryAppearanceContext.Provider value={value}>
      {children}
    </TrajectoryAppearanceContext.Provider>
  );
}

export function useTrajectoryAppearance(): TrajectoryAppearanceContextValue {
  return useContext(TrajectoryAppearanceContext);
}
