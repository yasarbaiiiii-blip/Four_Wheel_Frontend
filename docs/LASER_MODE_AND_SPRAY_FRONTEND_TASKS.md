# Frontend tasks: LASER marking tool, mission defaults, spray/laser settings

**For:** frontend developer, `DYX_GCS_Frontend`.
**Backend:** `rover_ws` branch `latency-hardening`, commits `5f92816`, `3e87087`,
`b16c158`, `eb0d3b8` and `3a9f23f` (2026-09-28). They are deployed on the rover.
**Backend contract docs** (in `rover_ws`):
- `docs/LASER_MARKING_MODE.md`
- `docs/SPRAY_MANUAL_CONTROL_API.md`

> **Already fixed in this repo, not yet committed (2026-09-29):**
> - Spray Test now sends `{on: true, duration_s}`.
> - The duration is validated to `0 < x ≤ 3.0`.
> - The Save button is wired: `onSave` was missing on `ServoConfigModal`.
> - Backend error messages are shown instead of generic text.
> - The enable switch uses `config.enabled`.
> - `SprayConfig` now carries every field used below.
> - Tests are in `src/services/__tests__/sprayConfigService.test.ts`.
>
> The tasks below are **new features** that still need building.

---

## 0. What changed on the rover (read first)

**Two independent choices per mission:**

| Choice | Values | Factory default |
|---|---|---|
| Execution mode | `MANUAL` (stops at each point, waits for NEXT) / `AUTO` | **MANUAL** (was AUTO) |
| Marking tool | `LASER` (AUX6) / `SPRAY` (AUX5) | **LASER** (new) |

**Rules:**
- Both choices can change only when no mission is active. The backend refuses
  changes while the mission is `RUNNING`, `PAUSED` or `WAITING_FOR_NEXT`.
- **LASER requires MANUAL.** START returns 409 for LASER + AUTO.
- The operator can **save the current pair as the default**. It is restored
  on every rover restart.

**LASER behaviour at each point:**

| Raw-GNSS result at the stop | Laser until NEXT | Point result |
|---|---|---|
| ≤ 30 mm | **steady ON**: mark here | COMPLETED |
| measured > 30 mm | **blinks 0.5 s on/off**: do NOT mark | FAILED |
| not measurable (RTK not FIXED, …) | off | FAILED |

**NEXT in LASER mode:**
- NEXT turns the laser off (PX4-confirmed), then the rover moves.
- If "off" isn't confirmed within 3 s, NEXT fails with a message and the
  rover stays put.
- **The final point also waits for NEXT** (NEXT = finish).

---

## 1. API reference (all require the `X-Rover-Token` login)

### New endpoints

| Method + path | Body | Success | Errors |
|---|---|---|---|
| `POST /api/mission/marking-tool` | `{"marking_tool": "LASER" \| "SPRAY"}` | mission section (like execution-mode) | 422 invalid value; 409 mission active or timeout |
| `POST /api/mission/defaults` | none | mission section | 409 e.g. "LASER requires MANUAL execution; not saved" |
| `POST /api/spray/laser-config` | `{"on_pwm_us": 2000, "off_pwm_us": 1000}` (1000–2000, must differ) | `{success, message, config}` | 422 range; 409 `SPRAY_CONTROLLER_NOT_IDLE` |
| `POST /api/spray/on` | none | `{success, physical_state_confirmed: false, …}` | 409 (mission active, not armed, E-stop…); 504 outcome unknown (`retry_safe: false`) |
| `POST /api/spray/off` | none | `{success, …}` | 504 outcome unknown (`retry_safe: true`) |

### Existing endpoints (unchanged, for reference)

- `POST /api/mission/execution-mode` `{execution_mode}`
- `POST /api/mission/next-point`
- `POST /api/spray/test` `{on, duration_s}`
- `POST /api/spray/duration` `{spray_duration_sec}`
- `POST /api/spray/enable`
- `POST /api/spray/disable`
- `GET /api/spray/config`

### New mission status fields

These arrive in the `mission` section of `/api/mission/status` and the socket
`mission_status`:

| Field | Type | Meaning |
|---|---|---|
| `marking_tool` | `"LASER" \| "SPRAY"` | current tool |
| `execution_mode` | `"MANUAL" \| "AUTO"` | current mode (existing) |
| `default_execution_mode` | `"MANUAL" \| "AUTO"` | restored on restart |
| `default_marking_tool` | `"LASER" \| "SPRAY"` | restored on restart |
| `defaults_source` | `"launch" \| "saved"` | `saved` = operator saved defaults |
| `laser_hold_point_id` | `string \| null` | point whose laser is held, e.g. `"P0003"` |
| `laser_hold_mode` | `"STEADY" \| "BLINK" \| null` | STEADY = mark here, BLINK = do not mark |
| `laser_on` | `boolean` | laser may be on (true during steady **and** blink) |

### New `GET /api/spray/config` fields

- `enabled`
- `spray_duration_source` (`launch` | `saved`)
- `manual_override_timeout_sec` (3.0)
- `marking_tool`
- `laser_on`, `laser_blinking`, `laser_on_point_id`
- `laser_on_pwm_us`, `laser_off_pwm_us`, `laser_value_source`
- `laser_pwm_min_us` (1000), `laser_pwm_max_us` (2000)
- `manual_active`, `press_may_be_active`, `release_confirmed`

These are already typed in `src/services/sprayConfigService.ts`
(`SprayConfig`).

**Errors:** `ApiError.message` already contains the backend's
`detail.message`. `ApiError.outcome` is `"UNKNOWN"` on 504, and
`ApiError.retry_safe` is also set (`src/services/apiError.ts`). Always show
`error.message`, never a generic string.

---

## 2. Tasks

### T1: Marking tool selector (Mission screen) — required before any LASER field test

- **Where:** `src/components/missionreport/MissionControlCard.tsx`, next to
  the AUTO/MANUAL toggle (`handleModeToggle`, `modeButton` styles).
- **UI:** a two-segment control, **LASER | SPRAY**, styled like AUTO/MANUAL.
- **Data flow:**
  - Read the value from `mission.marking_tool`; the backend is the source of
    truth. Mirror how `execution_mode` is synced in
    `src/screens/MissionReportScreen.tsx` (around line 1619, `setMode`).
  - On tap, call a new `setMissionMarkingTool(tool)` in
    `src/services/missionApi.ts`, next to `setMissionExecutionMode`. Add
    `MARKING_TOOL: "/api/mission/marking-tool"` to `PX4_MISSION` in
    `src/config/px4Endpoints.ts`.
- **Behaviour:**
  - Disable the control while a mission is active (same rule as the mode
    toggle).
  - Show a spinner during the request.
  - On error, keep the old value and show `error.message`.
  - **Never** show the new value until the backend confirms it.
- **Acceptance:**
  - After a rover restart the control shows the default (LASER unless saved
    otherwise).
  - Changing it while RUNNING is impossible.

### T2: LASER forces MANUAL — required

- When `marking_tool === "LASER"`:
  - disable the **AUTO** button, with a hint "Laser needs MANUAL";
  - if the UI mode is AUTO, show a clear prompt to switch to MANUAL. Never
    switch silently.
- **The START flow** (`MissionReportScreen.tsx` around lines 3125–3215) posts
  the UI mode before START. If a LASER + AUTO START still reaches the
  backend, it returns 409 "LASER marking requires MANUAL execution…". Show
  that message.
- **Acceptance:** with LASER selected there is no way to start in AUTO, and
  the refusal message is visible if the backend refuses anyway.

### T3: Save as default — required

- **Where:** the Mission screen near the selectors, or Settings.
- **Button:** "Save as default" calls a new `saveMissionDefaults()` →
  `POST /api/mission/defaults`.
- **Show the current default** as a small caption, e.g.
  `Default: MANUAL · LASER (saved)`, from `default_execution_mode`,
  `default_marking_tool` and `defaults_source`.
- **Confirm before saving:** "Rover will start in MANUAL + LASER after every
  restart."
- **On error** show `error.message`. Example: saving LASER + AUTO is refused.

### T4: Laser banner while waiting for NEXT — required

- **When:** `mission.state === "WAITING_FOR_NEXT"` and
  `mission.laser_hold_mode` is not null.
- **Show a prominent banner** on the mission screen (the existing
  `waitingForManual` state exists already):

  | `laser_hold_mode` | Banner |
  |---|---|
  | `STEADY` | green: **"Laser ON — mark at the dot. Press NEXT to continue."** |
  | `BLINK` | red/amber, pulsing: **"Outside 30 mm — DO NOT MARK. Laser blinking. Press NEXT to skip."** |
  | `null`, point FAILED | "Point failed — laser off. Press NEXT." |

- **Put the point id in the banner** (`laser_hold_point_id`).
- The pulse animation must be UI-only (Reanimated). Don't poll faster for it.

### T5: NEXT button behaviour in LASER mode — required

- **Label:**
  - "NEXT (laser off)" in LASER mode;
  - **"FINISH (laser off)"** when no points remain. The final LASER point
    stays in `WAITING_FOR_NEXT`, so the UI must **not** show the mission as
    completed yet.
- **While NEXT is pending,** show "Turning laser off…". It can take up to
  about 3 s.
- **On failure** (message contains "laser OFF not confirmed"):
  - keep the mission in WAITING_FOR_NEXT;
  - show the message;
  - allow NEXT again.
- Never mark the point or mission as advanced until status confirms it.

### T6: Laser PWM settings (Settings screen) — optional

- **Where:** a new section or modal next to the Spray Servo config in
  `src/screens/SettingsScreen.tsx`.
- **Fields:**
  - Laser ON PWM and OFF PWM (µs, 1000–2000, must differ);
  - defaults 2000 / 1000;
  - show `laser_value_source` (saved / launch).
- **Save:** a new `setLaserConfig(on, off)` →
  `POST /api/spray/laser-config`. Reload `GET /api/spray/config` after
  saving.
- It is refused while a mission is enabled or the laser is on. Show the
  message (`SPRAY_CONTROLLER_NOT_IDLE`).

### T7: Spray hold-time polish (Settings) — optional

- In `ServoConfigModal`:
  - show `spray_duration_source` ("saved on rover" / "launch default");
  - use `manual_override_timeout_sec` (3.0) as the displayed maximum.
- After a successful **Test**, say "Test sent" and not "Sprayed":
  `physical_state_confirmed` is false. Optionally poll `GET /api/spray/config`
  for `spraying` / `release_confirmed`.
- Optional **Stop** button during a test: `cancelSprayTest()` (already in the
  service).

### T8: Manual spray ON / OFF buttons — optional

- `POST /api/spray/on` and `/api/spray/off` (add `ON` / `OFF` to the service;
  the endpoints are already in `PX4_SPRAY`).
- **ON:**
  - is refused during a mission and needs PX4 armed;
  - the backend cuts it after 3 s;
  - ask for confirmation before sending.
- **OFF:**
  - is always enabled, never hidden behind loading;
  - is safe to retry (`retry_safe: true` on 504).

### T9: Mission report shows the tool — optional

- Point results / point events carry `spray.tool` (`"LASER"` | `"SPRAY"`).
- Show "Laser" or "Spray" in the report and the per-point rows.
- A BLINK point appears as FAILED with reason `RAW_GNSS_RADIAL_EXCEEDS_TOLERANCE…`.

### T10: Field ops notes (docs / onboarding screen) — optional

- **Rover network:**
  - the rover is now its own Wi-Fi hotspot, **`DYX-4WD`**;
  - backend `192.168.3.101:5001` is unchanged;
  - Android may say "no internet": choose "stay connected".
- **Internet for tablets is capped (~200 KB/s):**
  - download the site's **Mapbox offline pack** (`offlineMapService.ts`)
    before the field day.

---

## 3. Safety rules (from the app's rules, applied here)

- **Never show a tool, mode, default, laser or spray state the backend has not
  confirmed.** On error, revert and show `error.message`.
- **E-stop stays always accessible.** The laser banner must not cover it.
- **OFF actions** (spray off, disable, NEXT) are never hidden behind a spinner
  for other operations.
- **Don't add polling faster than the existing status cadence.** Blink and
  pulse animations are purely visual.

## 4. Suggested order

1. **T1, T2, T4, T5** — required for the first LASER field test. The laser
   hardware is still pending, so this is not urgent today.
2. **T3.**
3. **T6–T10** — any time.

## 5. Test checklist

**With the backend connected:**
- The tool shows LASER after a rover restart.
- Switching to SPRAY works when idle and is refused while RUNNING.
- LASER + AUTO can't start.
- Save default, then restart the rover stack: the saved pair comes back.
- During a LASER mission:
  - a good point shows the green banner;
  - a bad point shows the blinking banner;
  - NEXT shows "Turning laser off…" and then advances;
  - the last point shows FINISH.
- Settings: Test spray (rover armed, no mission) succeeds, and an out-of-range
  value is rejected locally.

**Without the backend:**
- Every control shows a clear error and no false success.
