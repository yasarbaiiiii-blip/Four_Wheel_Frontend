/**
 * Runs responses captured from the C++ backend's mission routes through the app's
 * own path preview logic. The values are real responses from an end-to-end run
 * against rover_backend and the native mission code.
 */
import {
  EMPTY_TRAJECTORY_PREVIEW,
  canDrawBackendLine,
  canLoadBackendPreview,
  filterLoadedPathPoints,
  reduceTrajectoryPreview,
  type TrajectoryPreviewState,
} from "../backendTrajectoryPreview";

const MISSION_ID = "app_3848470CCBC949108E227429B2272EAA";

const EMPTY_STATUS = {
  state: "EMPTY",
  loaded: false,
  ready: false,
  trajectory_ready: false,
  accepted_for_start: false,
  message: "",
  error: null,
  navigation_point_count: 0,
};

const READY_STATUS = {
  state: "READY",
  loaded: true,
  ready: false,
  trajectory_ready: true,
  accepted_for_start: false,
  message: "Path ready. Load the mission to continue.",
  error: null,
  mission_id: MISSION_ID,
  mission_run_id: MISSION_ID,
  navigation_point_count: 1292,
};

const LOADED_STATUS = {
  ...READY_STATUS,
  accepted_for_start: true,
  message: "Mission loaded. Start is not available in this rover build.",
};

const PATH_POINTS = [
  { latitude: 12.9716, longitude: 77.5946, x: 0.0, y: 0.0 },
  { latitude: 12.971780000118747, longitude: 77.5946, x: 0.0, y: 20.0151 },
  { latitude: 12.971780000117985, longitude: 77.59461999957279, x: 2.1671, y: 20.0151 },
  { latitude: 12.971599999999238, longitude: 77.5946199995583, x: 2.1671, y: 0.0 },
  { latitude: 12.971599999996949, longitude: 77.59464000003949, x: 4.3343, y: 0.0 },
  { latitude: 12.971780000115693, longitude: 77.59464000006842, x: 4.3343, y: 20.0151 },
];

function statusEvent(mission: object, epoch: number) {
  return { type: "STATUS" as const, epoch, mission };
}

function previewEvent(epoch: number) {
  return {
    type: "PREVIEW" as const,
    epoch,
    missionId: MISSION_ID,
    navigationPointCount: 1292,
    previewTruncated: false,
    points: PATH_POINTS,
    snapshot: null,
  };
}

function uploadedState(): TrajectoryPreviewState {
  let state = reduceTrajectoryPreview(EMPTY_TRAJECTORY_PREVIEW, {
    type: "UPLOAD_STARTED",
    epoch: 1,
  });
  state = reduceTrajectoryPreview(state, statusEvent(READY_STATUS, 1));
  return reduceTrajectoryPreview(state, previewEvent(1));
}

describe("path preview with C++ backend responses", () => {
  it("keeps every drawn point", () => {
    expect(filterLoadedPathPoints(PATH_POINTS)).toHaveLength(6);
  });

  it("offers nothing before an upload", () => {
    const state = reduceTrajectoryPreview(
      EMPTY_TRAJECTORY_PREVIEW,
      statusEvent(EMPTY_STATUS, 0),
    );
    expect(canDrawBackendLine(state)).toBe(false);
    expect(canLoadBackendPreview(state)).toBe(false);
  });

  it("does not enable Load until the path has arrived", () => {
    const beforePath = reduceTrajectoryPreview(
      reduceTrajectoryPreview(EMPTY_TRAJECTORY_PREVIEW, {
        type: "UPLOAD_STARTED",
        epoch: 1,
      }),
      statusEvent(READY_STATUS, 1),
    );
    expect(canLoadBackendPreview(beforePath)).toBe(false);
  });

  it("draws the line and enables Load after upload", () => {
    const state = uploadedState();
    expect(state.phase).toBe("ready");
    expect(state.missionId).toBe(MISSION_ID);
    expect(state.navigationPointCount).toBe(1292);
    expect(state.previewTruncated).toBe(false);
    expect(canDrawBackendLine(state)).toBe(true);
    expect(canLoadBackendPreview(state)).toBe(true);
    expect(state.acceptedForStart).toBe(false);
  });

  it("confirms the load only when the rover reports it", () => {
    const state = reduceTrajectoryPreview(uploadedState(), statusEvent(LOADED_STATUS, 1));
    expect(state.acceptedForStart).toBe(true);
    expect(canDrawBackendLine(state)).toBe(true);
  });

  it("does not offer Load once the rover no longer holds the mission", () => {
    const state = reduceTrajectoryPreview(uploadedState(), statusEvent(EMPTY_STATUS, 1));
    expect(canLoadBackendPreview(state)).toBe(false);
  });

  it("shows a mismatch reported by the backend as a failure", () => {
    const state = reduceTrajectoryPreview(
      uploadedState(),
      statusEvent(
        {
          ...EMPTY_STATUS,
          state: "ERROR",
          error: "The rover's path does not match the path prepared for the map.",
        },
        1,
      ),
    );
    expect(state.phase).toBe("failed");
    expect(canLoadBackendPreview(state)).toBe(false);
  });
});
