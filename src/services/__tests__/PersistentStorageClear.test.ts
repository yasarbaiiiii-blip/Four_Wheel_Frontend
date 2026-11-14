const saved = new Map<string, string>();
let failRemoval = false;

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (key: string) => saved.get(key) ?? null),
    removeItem: jest.fn(async (key: string) => {
      if (failRemoval) throw new Error('storage unavailable');
      saved.delete(key);
    }),
    multiRemove: jest.fn(async (keys: string[]) => {
      if (failRemoval) throw new Error('storage unavailable');
      keys.forEach((key) => saved.delete(key));
    }),
  },
}));

import PersistentStorage from '../PersistentStorage';

beforeEach(() => {
  saved.clear();
  failRemoval = false;
  saved.set('@mission/waypoints', '[{"id":1}]');
  saved.set('@mission/mode', 'AUTO');
  saved.set('@mission/metadata', '{"name":"field-a.csv"}');
  saved.set('@mission/status_map', '{"1":"completed"}');
  saved.set('@mission/start_time', 'start');
  saved.set('@mission/end_time', 'end');
  saved.set('@mission/is_active', 'true');
  saved.set('@mission/verified_id', 'old-run');
  saved.set('@mission/verified_name', 'field-a.csv');
});

it('clears runtime identity while keeping the imported file, waypoints and logs', async () => {
  expect(await PersistentStorage.clearActiveMissionRuntime()).toBe(true);
  expect(saved.has('@mission/is_active')).toBe(false);
  expect(saved.has('@mission/verified_id')).toBe(false);
  expect(saved.get('@mission/waypoints')).toBe('[{"id":1}]');
  expect(saved.get('@mission/metadata')).toBe('{"name":"field-a.csv"}');
  expect(saved.get('@mission/status_map')).toBe('{"1":"completed"}');
});

it('clears logs while keeping the uploaded plan and its runtime identity', async () => {
  expect(await PersistentStorage.clearMissionLogs()).toBe(true);
  expect(saved.has('@mission/status_map')).toBe(false);
  expect(saved.has('@mission/start_time')).toBe(false);
  expect(saved.has('@mission/end_time')).toBe(false);
  expect(saved.get('@mission/waypoints')).toBe('[{"id":1}]');
  expect(saved.get('@mission/verified_id')).toBe('old-run');
  expect(saved.get('@mission/mode')).toBe('AUTO');
});

it('reports a storage failure without claiming success', async () => {
  failRemoval = true;
  expect(await PersistentStorage.clearMissionLogs()).toBe(false);
  expect(saved.get('@mission/status_map')).toBe('{"1":"completed"}');
});
