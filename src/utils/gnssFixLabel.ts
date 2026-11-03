/**
 * Operator label for a PX4 GPS fix type. Null means no reading from the rover,
 * which is different from the rover reporting that it has no fix.
 */
export function gnssFixLabel(fixType: number | null | undefined): string {
  if (fixType === null || fixType === undefined) return "—";
  switch (fixType) {
    case 6:
      return "RTK Fixed";
    case 5:
      return "RTK Float";
    case 4:
      return "DGPS";
    case 3:
      return "3D Fix";
    case 2:
      return "2D Fix";
    default:
      return "No Fix";
  }
}
