import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { useDraftHistory, type DraftHistory } from "../useDraftHistory";

const environment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
});

function renderHistory() {
  const ref: { current: DraftHistory<string[]> } = {
    current: undefined as unknown as DraftHistory<string[]>,
  };
  function Wrapper() {
    ref.current = useDraftHistory<string[]>();
    return null;
  }
  act(() => {
    TestRenderer.create(React.createElement(Wrapper));
  });
  return ref;
}

describe("useDraftHistory", () => {
  it("is not editing until begin() and ignores edits before that", () => {
    const h = renderHistory();
    expect(h.current.isEditing).toBe(false);
    act(() => h.current.apply(["x"]));
    expect(h.current.draft).toBeNull();
  });

  it("begin starts a draft with no history", () => {
    const h = renderHistory();
    act(() => h.current.begin(["a", "b"]));
    expect(h.current.draft).toEqual(["a", "b"]);
    expect(h.current.isEditing).toBe(true);
    expect(h.current.canUndo).toBe(false);
    expect(h.current.canRedo).toBe(false);
  });

  it("undo and redo step through applied changes", () => {
    const h = renderHistory();
    act(() => h.current.begin(["a", "b"]));
    act(() => h.current.apply(["b", "a"]));
    act(() => h.current.apply(["b"]));
    expect(h.current.draft).toEqual(["b"]);

    act(() => h.current.undo());
    expect(h.current.draft).toEqual(["b", "a"]);
    act(() => h.current.undo());
    expect(h.current.draft).toEqual(["a", "b"]);
    expect(h.current.canUndo).toBe(false);
    expect(h.current.canRedo).toBe(true);

    act(() => h.current.redo());
    expect(h.current.draft).toEqual(["b", "a"]);
    act(() => h.current.redo());
    expect(h.current.draft).toEqual(["b"]);
    expect(h.current.canRedo).toBe(false);
  });

  it("a new change clears the redo chain", () => {
    const h = renderHistory();
    act(() => h.current.begin(["a"]));
    act(() => h.current.apply(["b"]));
    act(() => h.current.undo());
    expect(h.current.canRedo).toBe(true);
    act(() => h.current.apply(["c"]));
    expect(h.current.canRedo).toBe(false);
    expect(h.current.draft).toEqual(["c"]);
  });

  it("handles rapid taps in one batch without reading stale state", () => {
    const h = renderHistory();
    act(() => h.current.begin(["1"]));
    act(() => {
      h.current.apply(["2"]);
      h.current.apply(["3"]);
      h.current.undo();
      h.current.undo();
      h.current.redo();
    });
    expect(h.current.draft).toEqual(["2"]);
    expect(h.current.canUndo).toBe(true);
    expect(h.current.canRedo).toBe(true);
  });

  it("undo/redo with nothing to do change nothing", () => {
    const h = renderHistory();
    act(() => h.current.begin(["a"]));
    act(() => h.current.undo());
    act(() => h.current.redo());
    expect(h.current.draft).toEqual(["a"]);
  });

  it("end() drops the draft and its history", () => {
    const h = renderHistory();
    act(() => h.current.begin(["a"]));
    act(() => h.current.apply(["b"]));
    act(() => h.current.end());
    expect(h.current.isEditing).toBe(false);
    expect(h.current.draft).toBeNull();
    expect(h.current.canUndo).toBe(false);
  });

  it("caps history at 50 steps", () => {
    const h = renderHistory();
    act(() => h.current.begin(["0"]));
    act(() => {
      for (let i = 1; i <= 60; i += 1) h.current.apply([String(i)]);
    });
    let undos = 0;
    while (h.current.canUndo && undos < 100) {
      act(() => h.current.undo());
      undos += 1;
    }
    expect(undos).toBe(50);
  });
});
