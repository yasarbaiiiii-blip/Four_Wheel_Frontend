# Row-End Extension: Backend Execution and Frontend Integration Plan

**Status:** backend execution plan. The frontend wiring was implemented locally on 2026-11-06, pending verification against the authoritative backend build and tablet.
**Prepared:** 2026-11-06 (IST).
**Input:** `C:\Users\DYX_D\Downloads\row-end-extension-api-wiring-plan.md`, current frontend source, and an available backend source copy at `D:\DYX_4WD_JETSON_DDS`.

## 1. Scope and release boundary

Implement and verify the rover-owned row-end extension contract for a staged, **not yet loaded** mission. The operator can set extension enabled, distance, and trigger; preview is a dry run; apply rebuilds and stages a mission. A changed apply may replace the mission ID. The frontend must then use the new ID for path display and Load.

The input plan names `D:\projects\4WD_Backend` as its uncommitted backend target. That checkout is unavailable in this workspace. `D:\DYX_4WD_JETSON_DDS` contains related source but is not the named Git worktree. **B0 is a release gate:** confirm the exact branch, commit, uncommitted diff, build, and route behavior in the backend worktree that will actually be deployed. Do not treat the source copy or the input plan as a proven deployed contract.

This work covers extension upload compatibility, GET, preview, apply, status, loaded-path, and their frontend consumers. It does not authorize rover motion, spray actuation, E-stop release, or changes to mission Start/Pause/Stop behavior. Keep Stop and E-stop reachable during any long apply operation.

## 2. Contract to freeze jointly before coding

| Operation | Request | Required response and behavior |
|---|---|---|
| Upload `POST /api/mission/upload` | Multipart CSV; legacy `extension_mode`, `dummy_point_distance_m`, `trigger_distance_m`, `extension_distance_source=OPERATOR` when the current tablet uses them | Honor operator-marked values within distance 0.1–20 m and trigger 1–5 m. Keep old-tablet compatibility. Return authoritative staged ID and status. |
| GET `/api/mission/extension` | Authenticated, no body | `available`, `mission_id`, `editable`, `locked_reason`, `message`, `extension`, `limits`, geometry counts and `row_ends`; no full path points. With no mission, return `available:false` and no geometry. |
| Preview `POST /api/mission/extension/preview` | JSON `enabled`, `distance_m` when enabled, optional `trigger_m`, **current `mission_id`** | No mutation or new ID. Return candidate `extension`, `current_extension`, `changes_path`, geometry, and typed path `points`. Reject stale ID with `MISSION_CHANGED`. Preview is a dry run even after Load in the available source; the UI may disable it while locked. |
| Apply `PUT /api/mission/extension` | Same strict JSON fields; send `mission_id` | With a changed setting, discard/rebuild/stage and return `changed:true`, new `mission_id`, `previous_mission_id`, `mission`, `extension`, and geometry. With no change, return `changed:false` and preserve the current ID. Lock after Load. |
| Status and loaded-path GET | Existing authenticated calls | Status carries `mission.extension` and `extension_editable`. Loaded-path carries authoritative `mission_id`, `signature`, `points` with `type: marking | extension | path`; tolerate `snapshot:null` on the frontend. |

**Contract corrections to the input plan:** its sentence “every apply produces a new ID” applies only to `changed:true`. Its no-op example says `mission_id:null`, whereas the available backend `reply_extension` returns `mission.run_id`; freeze one behavior and test it. The source strings in the available copy are `EXTENSION_API`, `UPLOAD_DEFAULT_OFF`, and `UPLOAD_LEGACY_FIELDS`; frontend treats `source` as opaque. The plan's “every extension call is locked after Load” does not match the available read-only GET/preview handlers; only mutation is locked.

The backend must supply operator-readable `detail.message` and stable `detail.code` for refusals. At minimum test `UPLOAD_REQUIRED`, `MISSION_CHANGED`, `EXTENSION_LOCKED_AFTER_LOAD`, `MISSION_OPERATION_IN_PROGRESS`, `CONTROL_LEASE_REQUIRED`, `STOP_LATCHED`, `PX4_ORIGIN_CHANGED`, `INVALID_EXTENSION_DISTANCE`, `INVALID_EXTENSION_TRIGGER`, `EXTENSION_NOT_APPLIED`, `EXTENSION_APPLY_FAILED_UPLOAD_AGAIN`, and `MISSION_MANAGER_UNAVAILABLE`. Authentication errors must not leak mission data.

## 3. Backend work packages, in order

### B0 — Establish the release baseline and build gate

1. Locate the authoritative backend checkout and record branch, commit, uncommitted changes, and installed rover version. Compare it with the available copy and the input plan's §9 file list.
2. Build the exact candidate before feature testing. The available copy's `src/rover_backend/include/rover_backend/mission_compat_service.hpp` has a missing semicolon after `resolved_choice(request, *mission)` around line 393. Verify whether this exists in the release checkout and fix it there if so.
3. Confirm routes are registered for GET/PUT `/api/mission/extension`, POST `/api/mission/extension/preview`, mission status, loaded-path, upload, and Load. Check authentication and control lease behavior with real HTTP requests or the existing off-rover harness.
4. Record exact JSON fixtures and error shapes from the built candidate. If they differ from §2, update the contract and frontend plan together before proceeding.

**Exit:** release candidate builds; source, route list, and response fixtures are identified. No rover deployment yet.

### B1 — Make extension choice and geometry deterministic

Inspect `mission_compat.hpp`, `native_mission_preview.hpp`, `backend_mission_upload.hpp`, and `trajectory_builder.hpp` in the release checkout. Use the same limits across multipart upload, JSON preview/apply, and native manager: distance 0.1–20 m, trigger 1–5 m, defaults 4 m and 3 m. The row-end rule is strict `gap < trigger_m`; boundary gap equals trigger means `SKIPPED_GAP`. Confirm row-end counts and `type:"extension"` points come from the built trajectory, not frontend math.

Resolve optional fields once with `resolved_choice(request, mission)` before both no-op comparison and rebuilding. The available source copy compares `request.choice.same_as(mission->extension)` around line 394, which can misclassify a distance-only request that omits `trigger_m`: the request's default trigger is 3 m even when the current trigger is different. Compare the **resolved** choice and cover this case with a test. Specify behavior when extension is disabled: either omit `trigger_m` from the client or validate it if present; never accept an out-of-range value silently.

**Exit:** the same marks and settings produce the same signature, counts, typed points, and row-end results through upload, preview, and apply.

### B2 — Preserve mission identity and safety across apply

In `mission_compat_service.hpp`, confirm these paths against the native manager rather than only local state:

1. Check supplied mission ID against the current staged mission before preview/apply. Do not mutate on a mismatch.
2. Refuse apply when Load is installed, a mission operation is in progress, a Stop latch is active, the control lease is absent, or the PX4 local origin changed. Keep authenticated Stop/E-stop paths responsive while apply is in progress.
3. On changed apply, serialize discard and stage, return the new ID only after staging is confirmed, and return the same ID in subsequent status and loaded-path calls. On no-op, perform no discard or upload and return the current ID.
4. If staging fails after discard, restore the prior geometry under a **new** ID and return `EXTENSION_NOT_APPLIED` with `detail.mission_id`, `restored:true`, and the restored mission. If restore fails, clear the mission and return `EXTENSION_APPLY_FAILED_UPLOAD_AGAIN` with `mission_cleared:true`. Do not report success for either failure.
5. Ensure GET `editable` and status `extension_editable` agree with Load and lease state; make lock reasons actionable.

**Exit:** no response can leave the tablet believing an old ID is current, and no failed apply is reported as a successful change.

### B3 — Backend test matrix

Extend the release checkout's `compat_test.cpp`, `e2e_mission.py`, and native preview/trajectory tests. Run them against a fresh database and the compiled HTTP server.

- Upload legacy multipart fields with and without `OPERATOR`; test disabled, valid bounds, decimals, string-vs-number JSON, missing/unknown keys, and out-of-range trigger.
- Preview 1 m and 5 m trigger around a row-end gap boundary; assert `row_ends`, X count, typed points, signature, **no new mission ID**, and no staged-state mutation.
- Apply a changed setting; assert new ID, old ID rejected on a later apply and Load, status and loaded-path agree, and current ID loads successfully.
- Apply unchanged and distance-only with an omitted trigger when the current trigger is not 3 m; assert no rebuild and trigger preservation.
- Load then attempt apply; assert 409 lock and no discard. Check read-only GET/preview behavior matches the frozen contract.
- Inject failed stage and failed restore; assert the two distinct failure payloads and subsequent status/loaded-path truth.
- Exercise concurrent upload/load/apply, bad/missing auth, lost lease, Stop latch, origin change, manager unavailable, and Stop/E-stop latency during apply.

**Exit:** build and all focused and existing backend suites pass; response fixtures match §2. Record counts, commands, and any stand-ins used. Then run a real ROS/Jetson build before rover acceptance.

## 4. Frontend work required for this backend release

The frontend originally sent revision, skip-row, and defaults fields through `src/services/missionApi.ts` and `src/hooks/pathplan/useMissionExtension.ts`; the strict new PUT rejects them. The local implementation now uses the contract below. Ship it with the backend API release after joint verification. See the input frontend plan for UI detail, with these corrections:

1. **Types and API:** replace old `revision`, `skip_row_ends`, `trigger_distance_m` JSON PUT, and defaults endpoint with GET/preview/PUT types using `trigger_m`, `limits`, `row_ends`, `points`, and response `mission_id`. Keep the legacy multipart upload fields until the old-tablet transition is complete.
2. **Preview transport:** `src/services/apiClient.ts` creates a private AbortController and exposes no caller signal. Add optional caller cancellation while retaining timeout, or use a request generation token and silently discard older results. Debounce slider calls and key each result to mission ID and input values.
3. **State and Load:** keep the planner's pre-upload held choice separate from rover GET state. Keep preview overlay separate from committed trajectory. After changed apply or restored failure, propagate the authoritative ID into `BackendTrajectoryContext` and refresh status/loaded-path. Both `PathPlanScreen.tsx` and `MissionReportScreen.tsx` currently call Load with `preview.missionId`; block Load until it matches the new staged path. Preserve the ID on `changed:false`.
4. **Dialog:** show server limits, rule, row-end counts and results; remove per-row skip and saved-default controls. Disable edits when `editable:false` or status says `extension_editable:false`. Validate any trigger sent even while extension is off, or omit it. Use at least 48 dp targets and accessible labels.
5. **Map and status:** derive X markers from `type:"extension"` in the matching preview or loaded-path points. Never merge a stale preview into the committed path. Map status trigger from `mission.extension.trigger_m`, not the old `row_transition_threshold_m`.
6. **Error recovery:** branch on `detail.code`, show `detail.message`. On `MISSION_CHANGED`, refresh GET/status and re-prefill. On `EXTENSION_NOT_APPLIED`, use `detail.mission_id` for the restored path. On `mission_cleared:true`, clear cached trajectory and guide re-upload. Do not show applied success until the backend confirms it.

Frontend acceptance: focused Jest suites, `npx tsc --noEmit`, Android Metro bundle HTTP 200 in an environment with loopback access, and tablet checks for upload → preview → changed apply → new-ID Load → locked dialog. Test no-op and both restore outcomes. Preserve the existing E-stop access and backend-confirmed mission state throughout.

## 5. Rollout and handoff

1. Freeze response fixtures and error codes from the **actual** backend release checkout; update this plan and the frontend wiring plan if needed.
2. Finish B0–B3 and the frontend work in §4. Keep backend and frontend changes reviewable together; do not deploy a strict PUT without a compatible app path for post-upload edits.
3. Run off-rover integration with a real compiled backend and the app API tests; then build on Jetson. Verify the installed version and routes before a tablet field session.
4. Bench-test with the rover safely stationary and without spray or motion commands: upload, preview, apply, no-op, Load, lock, stale ID, and recovery. Record HTTP responses and mission IDs. Any actual motion/spray testing needs its own approved safety procedure.
5. Update each repository's handover with branch/commit, changed files, exact commands and results, remaining limitations, and rollback version. Roll back backend and app as a compatible pair if contract or mission identity fails.

**Release blocker:** absence of the authoritative backend checkout, a failed candidate build, mismatched response fixtures, stale-ID Load, or an untruthful restore/clear outcome blocks rollout.
