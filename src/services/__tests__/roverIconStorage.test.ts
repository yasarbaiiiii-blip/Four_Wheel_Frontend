import {
  ROVER_ICON_STORAGE_KEY,
  loadRoverIconId,
  saveRoverIconId,
  type KeyValueStorage,
} from "../roverIconStorage";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: async (key) => (key in data ? data[key] : null),
    setItem: async (key, value) => {
      data[key] = value;
    },
  };
}

describe("roverIconStorage", () => {
  it("returns the default when nothing is saved", async () => {
    expect(await loadRoverIconId(memoryStorage())).toBe("amber");
  });

  it("saves a choice and reads it back", async () => {
    const storage = memoryStorage();
    expect(await saveRoverIconId("solar", storage)).toBe(true);
    expect(storage.data[ROVER_ICON_STORAGE_KEY]).toBe("solar");
    expect(await loadRoverIconId(storage)).toBe("solar");
  });

  it("ignores a saved value it does not know", async () => {
    const storage = memoryStorage({ [ROVER_ICON_STORAGE_KEY]: "{\"id\":\"solar\"}" });
    expect(await loadRoverIconId(storage)).toBe("amber");
    storage.data[ROVER_ICON_STORAGE_KEY] = "retired-icon";
    expect(await loadRoverIconId(storage)).toBe("amber");
  });

  it("falls back to the default when storage cannot be read", async () => {
    const broken: KeyValueStorage = {
      getItem: async () => {
        throw new Error("disk error");
      },
      setItem: async () => undefined,
    };
    expect(await loadRoverIconId(broken)).toBe("amber");
  });

  it("reports false instead of throwing when storage cannot be written", async () => {
    const broken: KeyValueStorage = {
      getItem: async () => null,
      setItem: async () => {
        throw new Error("storage full");
      },
    };
    await expect(saveRoverIconId("clean", broken)).resolves.toBe(false);
  });
});
