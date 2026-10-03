import {
  reconcileMissionReportRow,
  type MissionReportRowStatus,
} from "../backendMissionReportAdapter";

describe(
  "canonical Mission Report terminal reconciliation",
  () => {
    const pendingReportRow:
      MissionReportRowStatus = {
        reached: false,
        marked: false,
        status: "pending",
        timestamp:
          "2026-08-21T10:00:00.000Z",
        remark:
          "Along — | Cross — | Overall —",
      };

    test(
      "promotes runtime COMPLETED when canonical report still says PENDING",
      () => {
        const result =
          reconcileMissionReportRow(
            pendingReportRow,
            {
              reached: true,
              marked: true,
              status: "completed",
              timestamp:
                "2026-08-21T10:00:01.000Z",
            },
          );

        expect(result).toEqual({
          reached: true,
          marked: true,
          status: "completed",
          timestamp:
            "2026-08-21T10:00:01.000Z",
          remark:
            "Along — | Cross — | Overall —",
        });
      },
    );

    test(
      "synthesizes missing final FAILED row from terminal runtime snapshot",
      () => {
        const result =
          reconcileMissionReportRow(
            undefined,
            {
              status: "failed",
              timestamp:
                "2026-08-21T10:00:02.000Z",
            },
          );

        expect(result).toEqual({
          reached: true,
          marked: false,
          status: "failed",
          timestamp:
            "2026-08-21T10:00:02.000Z",
          remark:
            "Along — | Cross — | Overall —",
        });
      },
    );

    test(
      "never allows runtime state to overwrite canonical terminal report status",
      () => {
        const canonical:
          MissionReportRowStatus = {
            reached: true,
            marked: true,
            status: "completed",
            timestamp:
              "2026-08-21T10:00:03.000Z",
            remark:
              "Along +3.0 mm | Cross -2.0 mm | Overall 3.6 mm",
          };

        const result =
          reconcileMissionReportRow(
            canonical,
            {
              reached: false,
              marked: false,
              status: "failed",
              timestamp:
                "2026-08-21T10:00:04.000Z",
            },
          );

        expect(result).toBe(
          canonical,
        );
      },
    );

    test(
      "canonical RPP accuracy remark survives temporary terminal fallback",
      () => {
        const report:
          MissionReportRowStatus = {
            reached: false,
            marked: false,
            status: "pending",
            timestamp:
              "2026-08-21T10:00:00.000Z",
            remark:
              "Along +4.0 mm | Cross +3.0 mm | Overall 5.0 mm",
          };

        const result =
          reconcileMissionReportRow(
            report,
            {
              reached: true,
              marked: true,
              status: "completed",
              timestamp:
                "2026-08-21T10:00:05.000Z",
            },
          );

        expect(
          result?.status,
        ).toBe(
          "completed",
        );

        expect(
          result?.remark,
        ).toBe(
          "Along +4.0 mm | Cross +3.0 mm | Overall 5.0 mm",
        );
      },
    );

    test(
      "does not promote a non-terminal runtime state over canonical PENDING",
      () => {
        const result =
          reconcileMissionReportRow(
            pendingReportRow,
            {
              reached: true,
              status: "reached",
              timestamp:
                "2026-08-21T10:00:06.000Z",
            },
          );

        expect(result).toBe(
          pendingReportRow,
        );
      },
    );

    test(
      "repairs DASH mission_end without importing legacy remark",
      () => {
        const result =
          reconcileMissionReportRow(
            pendingReportRow,
            {
              reached: true,
              marked: true,
              status: "mission_end",
              timestamp:
                "2026-08-21T10:00:07.000Z",
            },
          );

        expect(
          result?.status,
        ).toBe(
          "mission_end",
        );

        expect(
          result?.remark,
        ).toBe(
          "Along — | Cross — | Overall —",
        );
      },
    );
  },
);
describe("projectCanonicalReportForExport RAW GNSS survey", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { projectCanonicalReportForExport } = require("../backendMissionReportAdapter");

  const rppAccuracy = {
    measurement_source: "RPP_TERMINAL_RESULT",
    available: true,
    along_track_error_mm: 4.0,
    cross_track_error_mm: -1.0,
    overall_accuracy_mm: 4.1,
    tolerance_mm: 20,
    captured_at: "2026-10-03T10:00:00Z",
  };

  test("carries accuracy.survey (raw GNSS) through to the export row", () => {
    const map = projectCanonicalReportForExport({
      points: [
        {
          sequence: 1,
          status: "COMPLETED",
          updated_at: "2026-10-03T10:00:01Z",
          accuracy: {
            ...rppAccuracy,
            survey: {
              measurement_source: "RAW_GNSS_SURVEY",
              available: true,
              along_track_error_mm: 12.5,
              cross_track_error_mm: -7.25,
              radial_error_mm: 14.4,
            },
          },
        },
      ],
    });

    expect(map[1].survey).toMatchObject({
      available: true,
      along_track_error_mm: 12.5,
      cross_track_error_mm: -7.25,
      radial_error_mm: 14.4,
    });
  });

  test("no survey -> null, RPP numbers are not copied into survey", () => {
    const map = projectCanonicalReportForExport({
      points: [
        { sequence: 1, status: "COMPLETED", updated_at: null, accuracy: rppAccuracy },
      ],
    });

    expect(map[1].survey).toBeNull();
  });
});
