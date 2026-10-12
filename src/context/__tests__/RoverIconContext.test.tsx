import React from "react";
import TestRenderer, { act } from "react-test-renderer";

import {
  RoverIconProvider,
  useRoverIcon,
  type RoverIconContextValue,
} from "../RoverIconContext";
import {
  ROVER_ICON_STORAGE_KEY,
  type KeyValueStorage,
} from "../../services/roverIconStorage";

const environment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

beforeAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
});

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

function fakeStorage(options: {
  initial?: string | null;
  failRead?: boolean;
  failWrite?: boolean;
  readDelay?: Promise<void>;
} = {}) {
  const writes: string[] = [];
  const storage: KeyValueStorage = {
    getItem: async (key) => {
      expect(key).toBe(ROVER_ICON_STORAGE_KEY);
      if (options.readDelay) await options.readDelay;
      if (options.failRead) throw new Error("read failed");
      return options.initial ?? null;
    },
    setItem: async (_key, value) => {
      if (options.failWrite) throw new Error("write failed");
      writes.push(value);
    },
  };
  return { storage, writes };
}

function mount(storage: KeyValueStorage) {
  let latest: RoverIconContextValue | undefined;
  const Probe = () => {
    latest = useRoverIcon();
    return null;
  };
  let renderer: ReturnType<typeof TestRenderer.create>;
  act(() => {
    renderer = TestRenderer.create(
      <RoverIconProvider storage={storage}>
        <Probe />
      </RoverIconProvider>,
    );
  });
  return {
    get value() {
      return latest!;
    },
    unmount: () => act(() => renderer.unmount()),
  };
}

describe("RoverIconProvider", () => {
  it("shows the default icon first, then the saved one", async () => {
    const { storage } = fakeStorage({ initial: "clean" });
    const view = mount(storage);
    expect(view.value.iconId).toBe("amber");
    expect(view.value.isReady).toBe(false);
    await flush();
    expect(view.value.iconId).toBe("clean");
    expect(view.value.isReady).toBe(true);
  });

  it("uses the default when the saved value is unknown or unreadable", async () => {
    const unknown = mount(fakeStorage({ initial: "retired" }).storage);
    await flush();
    expect(unknown.value.iconId).toBe("amber");
    expect(unknown.value.isReady).toBe(true);

    const unreadable = mount(fakeStorage({ failRead: true }).storage);
    await flush();
    expect(unreadable.value.iconId).toBe("amber");
    expect(unreadable.value.isReady).toBe(true);
  });

  it("applies a pick at once and saves it", async () => {
    const { storage, writes } = fakeStorage();
    const view = mount(storage);
    await flush();
    act(() => view.value.setIconId("solar"));
    expect(view.value.iconId).toBe("solar");
    await flush();
    expect(writes).toEqual(["solar"]);
    expect(view.value.saveFailed).toBe(false);
  });

  it("saves rapid taps in order so the last tap is the one kept", async () => {
    const { storage, writes } = fakeStorage();
    const view = mount(storage);
    await flush();
    act(() => {
      view.value.setIconId("solar");
      view.value.setIconId("clean");
      view.value.setIconId("classic");
    });
    await flush();
    await flush();
    expect(view.value.iconId).toBe("classic");
    expect(writes).toEqual(["solar", "clean", "classic"]);
  });

  it("keeps the operator's pick when the saved value arrives late", async () => {
    let release!: () => void;
    const readDelay = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { storage } = fakeStorage({ initial: "clean", readDelay });
    const view = mount(storage);
    act(() => view.value.setIconId("solar"));
    release();
    await flush();
    expect(view.value.iconId).toBe("solar");
    expect(view.value.isReady).toBe(true);
  });

  it("flags a failed save but keeps using the choice this session", async () => {
    const { storage } = fakeStorage({ failWrite: true });
    const view = mount(storage);
    await flush();
    act(() => view.value.setIconId("solar"));
    await flush();
    expect(view.value.iconId).toBe("solar");
    expect(view.value.saveFailed).toBe(true);
  });

  it("ignores an id it does not know", async () => {
    const { storage, writes } = fakeStorage();
    const view = mount(storage);
    await flush();
    act(() => view.value.setIconId("nope" as never));
    await flush();
    expect(view.value.iconId).toBe("amber");
    expect(writes).toEqual([]);
  });

  it("resets to the default and saves it", async () => {
    const { storage, writes } = fakeStorage({ initial: "clean" });
    const view = mount(storage);
    await flush();
    act(() => view.value.resetIconId());
    await flush();
    expect(view.value.iconId).toBe("amber");
    expect(writes).toEqual(["amber"]);
  });

  it("does not update state after it is removed", async () => {
    const { storage } = fakeStorage({ initial: "clean" });
    const view = mount(storage);
    view.unmount();
    await expect(flush()).resolves.toBeUndefined();
  });
});

describe("useRoverIcon without a provider", () => {
  it("falls back to the default icon and does nothing on a pick", () => {
    let latest: RoverIconContextValue | undefined;
    const Probe = () => {
      latest = useRoverIcon();
      return null;
    };
    act(() => {
      TestRenderer.create(<Probe />);
    });
    expect(latest!.iconId).toBe("amber");
    expect(() => latest!.setIconId("solar")).not.toThrow();
    expect(latest!.iconId).toBe("amber");
  });
});
