/**
 * missionCsv — the one place that turns mission waypoints into the CSV the
 * rover accepts at POST /api/mission/upload.
 *
 * Shared by the Path Plan uploader, the Mission Activity edit commit, and the
 * home-screen Export action so all three always produce identical files.
 */

export interface MissionCsvWaypoint {
  lat: number;
  lon: number;
  alt?: number;
  block?: string;
  row?: string;
  pile?: string;
}

export const MISSION_CSV_HEADER = [
  "latitude",
  "longitude",
  "altitude",
  "block",
  "row",
  "pile",
] as const;

export const escapeMissionCsvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? "" : String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

/**
 * Build the mission CSV. Throws on any point whose coordinates are not finite
 * or are out of range, so an invalid file is never written or uploaded.
 */
export const buildMissionCsvFromWaypoints = (
  waypoints: ReadonlyArray<MissionCsvWaypoint>,
): string => {
  const rows = waypoints.map((waypoint, index) => {
    if (!Number.isFinite(waypoint.lat) || !Number.isFinite(waypoint.lon)) {
      throw new Error(`Point ${index + 1} has invalid coordinates.`);
    }

    if (waypoint.lat < -90 || waypoint.lat > 90) {
      throw new Error(`Point ${index + 1} has an invalid latitude.`);
    }

    if (waypoint.lon < -180 || waypoint.lon > 180) {
      throw new Error(`Point ${index + 1} has an invalid longitude.`);
    }

    return [
      waypoint.lat.toFixed(9),
      waypoint.lon.toFixed(9),
      typeof waypoint.alt === "number" && Number.isFinite(waypoint.alt)
        ? waypoint.alt
        : 0,
      waypoint.block ?? "",
      waypoint.row ?? "",
      waypoint.pile ?? String(index + 1),
    ]
      .map(escapeMissionCsvCell)
      .join(",");
  });

  return [MISSION_CSV_HEADER.join(","), ...rows].join("\n") + "\n";
};
