import { useCallback, useState } from "react";

const MAX_HISTORY = 50;

interface DraftState<T> {
  /** null while not editing. */
  draft: T | null;
  past: T[];
  future: T[];
}

export interface DraftHistory<T> {
  draft: T | null;
  isEditing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Start editing from `initial`. Clears any previous history. */
  begin: (initial: T) => void;
  /** Replace the draft; the previous draft becomes undoable. */
  apply: (next: T) => void;
  undo: () => void;
  redo: () => void;
  /** Stop editing and drop the draft and its history. */
  end: () => void;
}

/**
 * Undo/redo for a draft value. The whole state lives in one useState object so
 * rapid taps (undo, undo, redo) never read a stale closure.
 */
export function useDraftHistory<T>(): DraftHistory<T> {
  const [state, setState] = useState<DraftState<T>>({
    draft: null,
    past: [],
    future: [],
  });

  const begin = useCallback((initial: T) => {
    setState({ draft: initial, past: [], future: [] });
  }, []);

  const apply = useCallback((next: T) => {
    setState((current) => {
      if (current.draft === null) return current;
      const past = [...current.past, current.draft].slice(-MAX_HISTORY);
      return { draft: next, past, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setState((current) => {
      if (current.draft === null || current.past.length === 0) return current;
      const previous = current.past[current.past.length - 1];
      return {
        draft: previous,
        past: current.past.slice(0, -1),
        future: [current.draft, ...current.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((current) => {
      if (current.draft === null || current.future.length === 0) return current;
      const [next, ...rest] = current.future;
      return {
        draft: next,
        past: [...current.past, current.draft].slice(-MAX_HISTORY),
        future: rest,
      };
    });
  }, []);

  const end = useCallback(() => {
    setState({ draft: null, past: [], future: [] });
  }, []);

  return {
    draft: state.draft,
    isEditing: state.draft !== null,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    begin,
    apply,
    undo,
    redo,
    end,
  };
}
