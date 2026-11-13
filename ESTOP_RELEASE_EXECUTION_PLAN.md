# Revised Plan: Double-Tap E-Stop Release with Confirmation

## Objective

Use the active rover controls for immediate E-Stop assertion and deliberate release. A release requires two taps while the backend reports a current latch, followed by an explicit confirmation popup. Release must leave PX4 disarmed, motion and spray disabled, and the stopped mission invalidated. The UI must show completion only after the backend confirms recovery and fresh status reflects it.

This plan covers the frontend and the available C++ backend checkout at `D:\DYX_4WD_JETSON_DDS`. Confirm that checkout is the actual deployment source before applying backend changes.

## Current source facts

- The active control is `src/components/shared/EstopControls.tsx`, used by Path Plan, Mission Report, and Quick NTRIP. `src/components/common/HeaderBar.tsx` has no app call sites.
- `POST /api/estop/release` currently returns authenticated HTTP 423 `STOP_RECOVERY_NOT_COMMISSIONED` from `mission_compat_service.hpp`.
- Native Stop latches the command mailbox, upload ingress, and command audit. The lower-level safety arbiter has a release helper, but no native HTTP release transaction calls it.
- Backend mission status currently maps a shared Stop latch to `emergency_stop`; a distinct E-Stop source and freshness contract are needed before the UI can safely choose release semantics.
- `MissionRecoveryNotice.tsx` attempts release before Resume and must be changed to use the deliberate recovery flow. `vehicleControlService.ts` already injects the token and sends no release generation in its request body.

## Operator interaction

| Backend state | First tap on control | Second tap within 450 ms | Confirmation popup |
| --- | --- | --- | --- |
| Current, confirmed E-Stop latch is false | Send E-Stop immediately | Another E-Stop assertion is allowed | None |
| Current, confirmed E-Stop latch is true | Show “Tap again to release E-Stop”; send no release | Open popup; send no release yet | “Release E-Stop? The rover must be disarmed. This will clear the stop latch, but will not arm or resume the mission.” Buttons: **Keep Stopped**, **STOP NOW**, **Confirm Release**. Only Confirm Release sends the request. STOP NOW reasserts E-Stop. |
| State unknown, stale, or disconnected | Keep STOP available and attempt assertion | Do not offer release | None |

- Expire the first tap after 450 ms. Clear the timer on unmount, app background, disconnect, state change, and request completion.
- Use a synchronous in-flight guard for release and ignore repeated confirmation presses. STOP assertion remains callable even during release. A concurrent STOP wins: it invalidates the release attempt, and the backend retains a latched state.
- Keep the button and popup at least 48 dp per touch target, use high-contrast field-white tokens, and set explicit accessibility roles and labels. Prefer a static latched presentation over flashing as the sole state cue.
- A successful HTTP answer means only that the backend accepted and completed the recovery transaction it describes. Show “Released” only after a fresh status read confirms the latch cleared and PX4 disarmed. On timeout, stale status, or disagreement, show “Release status unknown” and keep recovery controls guarded.

## Backend recovery contract

1. Define distinct authoritative fields for **E-Stop latch**, **ordinary mission Stop latch**, **physical E-Stop input**, **PX4 armed/disarmed evidence**, and their freshness. Do not infer E-Stop from a string containing `STOP`.
2. Keep `POST /api/estop` high priority and available through all recovery phases. `POST /api/estop/release` requires an authenticated operator session. Return `409 ESTOP_NOT_ACTIVE` when the authoritative E-Stop latch is clear; return a specific refusal when evidence is missing or stale, PX4 is armed, the physical E-Stop remains engaged, or recovery is busy.
3. Add a native recovery operation owned by the mission manager. Serialize it with Stop and positive commands. At the recovery boundary, cancel queued positives, invalidate the old mission/load and operator lease, advance a server-owned recovery epoch or equivalent stale-request fence, and clear all related native stop gates together only after every precondition passes. A new Stop during recovery aborts recovery and remains latched. Do not let an older release response clear a newer Stop.
4. Connect the public route to the native operation. The route must relay the native decision and must not manufacture `success:true` from a queued request or a local boolean change. Preserve actionable error codes. The frontend sends no client-supplied generation; keep server-side sequence and epoch guards that protect against stale work.
5. On success, report what was actually confirmed: E-Stop latch clear, PX4 disarmed, mission disabled/invalidated, and motor/spray authority disabled. Leave Start/Resume unavailable until a separately authorized fresh load and the still-uncommissioned motion safety gates permit it. Do not change existing false commissioning flags to make release pass.
6. Retain HTTP 423 `STOP_RECOVERY_NOT_COMMISSIONED` until the native transaction and its evidence adapters are implemented and verified. Do not expose a partial release route as success.

## Frontend work

1. Update `EstopControls.tsx` and its tests for the three-state interaction, popup, timer cancellation, pending-request guard, Stop priority, status refresh, and accessible labels. Apply the same semantics across its mission, vertical, and header variants. Keep STOP visible and immediate where the authoritative release state is unknown.
2. Adjust `estopControlsView.ts` to take the authoritative, freshness-aware recovery state. Do not derive release eligibility from `RoverTelemetry.state` or mission-status string matching.
3. Keep `vehicleControlService.ts` as the authenticated transport. Add typed release response and error-code handling only as required by the agreed backend response contract.
4. Remove the silent pre-Resume release from `MissionRecoveryNotice.tsx`. A blocked Resume should direct the operator to the deliberate E-Stop recovery control; Resume must never trigger release itself.
5. Audit all app call sites before deleting redundant `HeaderBar` or release UI. Document any deletion and the zero-reference search in `HANDOVER.md`.

## Verification and rollout gates

- **Native tests:** unauthenticated release; inactive latch; armed or stale PX4 state; physical E-Stop engaged; stale/disconnected evidence; native-service failure; repeated release; concurrent Stop vs release; new Stop after successful release; no queued positive command, old mission, or old lease surviving recovery; no motion or spray authority gained.
- **Frontend tests:** one tap stops immediately when unlatched; one latched tap never releases; timeout and cancellation; second tap only opens popup; Keep Stopped sends nothing; Confirm Release sends once; STOP NOW reasserts; stale/offline state cannot release; HTTP failure and telemetry disagreement never show success; screen unmount/background cancels the gesture.
- **Build checks:** focused and full frontend Jest, `npx tsc --noEmit`, Android Metro bundle and HTTP 200 from a running Metro server, backend build and native/compatibility tests, `git diff --check`, and clean intended-file review.
- **Off-rover integration:** exercise public route through the actual native manager with simulated authenticated, PX4, and physical-input evidence. Confirm response codes and fresh status across restart and lost-response cases.
- **Jetson/tablet acceptance:** verify the deployed source and installed APK match the tested artifacts; measure actual disarm and wheel-motion evidence, spray off, physical E-Stop behavior, and all popup paths with gloves. Do not claim zero wheel speed from an HTTP acknowledgement. Do not commission positive motion as part of this change.

## Completion condition

The UI offers release only for a fresh confirmed latch, the double tap opens the confirmation popup, Confirm Release executes a fully guarded native recovery, and fresh backend status confirms a disarmed, nonmoving, mission-disabled state. STOP remains immediately available throughout. Record test results and any remaining hardware limits in `HANDOVER.md`.
