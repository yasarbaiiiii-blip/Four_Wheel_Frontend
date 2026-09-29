import { getBatteryDisplayBand } from '../batteryDisplay';

describe('battery display thresholds', () => {
  test.each([
    [100, 'GREEN'],
    [80, 'GREEN'],
    [60, 'GREEN'],
    [59, 'GREEN'],
    [45, 'GREEN'],
    [30, 'GREEN'],
    [29.9, 'YELLOW'],
    [29, 'YELLOW'],
    [20, 'YELLOW'],
    [11, 'YELLOW'],
    [10.1, 'YELLOW'],
    [10, 'RED'],
    [5, 'RED'],
    [0, 'RED'],
  ] as const)('%s%% -> %s', (percentage, expected) => {
    expect(getBatteryDisplayBand(percentage)).toBe(expected);
  });

  test('missing battery percentage is unknown', () => {
    expect(getBatteryDisplayBand(null)).toBe('UNKNOWN');
    expect(getBatteryDisplayBand(undefined)).toBe('UNKNOWN');
    expect(getBatteryDisplayBand(Number.NaN)).toBe('UNKNOWN');
  });
});
