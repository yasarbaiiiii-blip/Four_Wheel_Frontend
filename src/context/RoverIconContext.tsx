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
  DEFAULT_ROVER_ICON_ID,
  isRoverIconId,
  type RoverIconId,
} from "../constants/roverIcons";
import {
  loadRoverIconId,
  saveRoverIconId,
  type KeyValueStorage,
} from "../services/roverIconStorage";

export interface RoverIconContextValue {
  /** The icon every map and the header show right now. */
  iconId: RoverIconId;
  /** False until the saved choice has been read (the default shows meanwhile). */
  isReady: boolean;
  /** True when the last choice could not be saved: it only lasts this session. */
  saveFailed: boolean;
  setIconId: (id: RoverIconId) => void;
  resetIconId: () => void;
}

const NOOP_VALUE: RoverIconContextValue = {
  iconId: DEFAULT_ROVER_ICON_ID,
  isReady: true,
  saveFailed: false,
  setIconId: () => undefined,
  resetIconId: () => undefined,
};

// Without a provider (tests, isolated screens) the default icon is used.
const RoverIconContext = createContext<RoverIconContextValue>(NOOP_VALUE);

export function RoverIconProvider({
  children,
  storage,
}: {
  children: React.ReactNode;
  /** Replaced in tests; the device storage is used otherwise. */
  storage?: KeyValueStorage;
}): React.ReactElement {
  const [iconId, setIconIdState] = useState<RoverIconId>(DEFAULT_ROVER_ICON_ID);
  const [isReady, setIsReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const mountedRef = useRef(true);
  // The operator picked something before the saved value finished loading:
  // their pick wins, the late read must not overwrite it.
  const pickedRef = useRef(false);
  // Writes run one after another so the last tap is the one that ends up saved.
  const writeChainRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    mountedRef.current = true;
    void loadRoverIconId(storage).then((saved) => {
      if (!mountedRef.current) return;
      if (!pickedRef.current) setIconIdState(saved);
      setIsReady(true);
    });
    return () => {
      mountedRef.current = false;
    };
  }, [storage]);

  const setIconId = useCallback(
    (id: RoverIconId) => {
      if (!isRoverIconId(id)) return;
      pickedRef.current = true;
      setIconIdState(id);
      writeChainRef.current = writeChainRef.current
        .then(() => saveRoverIconId(id, storage))
        .then((saved) => {
          if (mountedRef.current) setSaveFailed(!saved);
        });
    },
    [storage],
  );

  const resetIconId = useCallback(
    () => setIconId(DEFAULT_ROVER_ICON_ID),
    [setIconId],
  );

  const value = useMemo<RoverIconContextValue>(
    () => ({ iconId, isReady, saveFailed, setIconId, resetIconId }),
    [iconId, isReady, saveFailed, setIconId, resetIconId],
  );

  return (
    <RoverIconContext.Provider value={value}>
      {children}
    </RoverIconContext.Provider>
  );
}

export function useRoverIcon(): RoverIconContextValue {
  return useContext(RoverIconContext);
}

export function useRoverIconId(): RoverIconId {
  return useContext(RoverIconContext).iconId;
}
