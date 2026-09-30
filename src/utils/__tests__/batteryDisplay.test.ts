import {
  getBatteryDisplayBand,
  getWholeBatteryPercentage,
} from '../batteryDisplay';

describe('battery display thresholds', () => {
  test.each([
    [100, 'GREEN'],
    [80, 'GREEN'],
    [60, 'GREEN'],
    [45, 'GREEN'],
    [30, 'GREEN'],
    [29, 'YELLOW'],
    [20, 'YELLOW'],
    [11, 'YELLOW'],
    [10, 'RED'],
  ] as const)('%s%% -> %s', (percentage, expected) => {
    expect(getBatteryDisplayBand(percentage)).toBe(expected);
  });

  test('display and color use the same whole percentage', () => {
    expect(getWholeBatteryPercentage(29.6)).toBe(30);
    expect(getBatteryDisplayBand(29.6)).toBe('GREEN');

    expect(getWholeBatteryPercentage(10.6)).toBe(11);
    expect(getBatteryDisplayBand(10.6)).toBe('YELLOW');

    expect(getWholeBatteryPercentage(10.4)).toBe(10);
    expect(getBatteryDisplayBand(10.4)).toBe('RED');
  });

  test('missing battery percentage is unknown', () => {
    expect(getWholeBatteryPercentage(null)).toBeNull();
    expect(getBatteryDisplayBand(null)).toBe('UNKNOWN');
    expect(getBatteryDisplayBand(undefined)).toBe('UNKNOWN');
    expect(getBatteryDisplayBand(Number.NaN)).toBe('UNKNOWN');
  });
});
