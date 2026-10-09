# AI Agent Operational Rules & Protocol

This document sets the **binding operating rules** for all AI coding assistants, subagents, and contributors operating within the `DYX_GCS_Frontend` repository.

---

## 1. Golden Rules (Non-Negotiable)

### Rule 1.1 — Mandatory Pre-Session Reading
> **Before writing any code, modifying any file, or answering design questions, every agent MUST read:**
> 1. [**`README.md`**](file:///c:/Users/DYX_D/4wdfrt/DYX_GCS_Frontend/README.md) — To understand the rover architecture, PX4 OFFBOARD control, ROS 2, MAVROS, backend migration contracts (`4WD_SERVER`), mission workflows, and essential safety invariants.
> 2. [**`HANDOVER.md`**](file:///c:/Users/DYX_D/4wdfrt/DYX_GCS_Frontend/HANDOVER.md) — To review recent work completed, architectural decisions made with the operator, active branch status, test status, and open handover items.

**Failure to read these two files leads to architectural regressions, violated safety interlocks, and wasted operator time.**

---

### Rule 1.2 — Mandatory Post-Task Handover Logging
> **Upon completing any task, feature, refactoring, or before ending a work session, every agent MUST:**
> Append a new structured handover entry to the bottom of [**`HANDOVER.md`**](file:///c:/Users/DYX_D/4wdfrt/DYX_GCS_Frontend/HANDOVER.md) using the standardized template defined in that file.

Each handover entry **MUST** record:
- **Header:** Entry number, date/time, branch, agent identifier.
- **Objective & Scope:** What was requested and what was solved.
- **Changes Implemented:** Detailed breakdown of files created, modified, or deleted.
- **Key Architecture & Design Decisions:** Explanations and rationale for operator choices.
- **Hardware Safety & Interlocks:** Any solenoid, AUX channel, PX4 arming, or speed gates touched.
- **Verification & Testing Results:** Commands executed, unit test pass counts, type check status, and Metro bundler HTTP status.
- **Current Repository State & Next Steps:** Working tree state, known caveats, and recommended immediate next steps for the successor agent.

---

## 2. Rover & Hardware Safety Principles

1. **Never Fake Hardware State**:
   - Do not display success or armed status until confirmed by the backend telemetry.
   - Separate commanded state from confirmed hardware state.
2. **Emergency Stop & Failsafe Priority**:
   - Emergency Stop must always remain accessible and responsive during rover operations.
   - Any actuator actuation (e.g. chemical spray solenoids on AUX channels) must guarantee a release command in a `finally` block, upon network error, screen unmount, or app backgrounding.
3. **Safety Interlocks Are Mandatory**:
   - Do not permit actuator testing while the rover is in motion ($\text{speed} \ge 0.1\,\text{m/s}$), during an active mission, or when disconnected.
   - All physical trigger actions must include debouncing and in-flight mutex locking to prevent double-trigger race conditions.

---

## 3. UI & Field Usability Standards

1. **Outdoor Sunlight Usability (Field White Theme)**:
   - Use designated Crisp Field White theme tokens (`#FFFFFF`, `#F8FAFC`, `#DDE8F7`, `#10244B`, `#1475EE`, `#16B980`, `#DC2626`).
   - High contrast is required for outdoor Android tablet screens operated in direct sunlight.
2. **Glove Usability**:
   - All interactive touch targets (buttons, toggles, steppers) must have a minimum touch target size of **$\ge 48\,\text{dp}$**.
3. **Accessibility**:
   - Provide explicit `accessibilityRole` and `accessibilityLabel` on all controls (switches, steppers, test buttons).

---

## 4. Code & Architecture Standards

1. **Single Responsibility**:
   - Keep screens lean. Extract self-contained logic into dedicated hooks (`src/hooks/`) and modular components (`src/components/`).
2. **Deterministic State & Math**:
   - Use integer arithmetic for hardware calibration values (e.g. integer milliseconds for pulse durations: `100` to `3000` ms) to prevent floating-point drift.
3. **Audited File Deletions**:
   - Before deleting any component, modal, or service, perform a repository-wide search (`grep` across `src/`, navigation, tests, and root) to verify that zero references remain. Document deletions in `HANDOVER.md`.

---

## 5. Verification Checklist (Before Concluding a Session)

Every agent must run and pass the following verification steps before handing over:
1. **Unit Tests**: Run project unit tests covering touched areas (`npm test -- --testPathPattern="..."`). All tests must pass.
2. **Type Checking**: Run `npx tsc --noEmit` and confirm zero new TypeScript compilation errors.
3. **Metro Bundler Check**: Ensure the React Native Metro bundler compiles the bundle without errors (e.g. `curl.exe http://127.0.0.1:8081/...` returns HTTP 200).
4. **Git Status Review**: Inspect `git status` to ensure only intended changes are present and no unwanted scratch files remain.
5. **Handover Log Updated**: Confirm [**`HANDOVER.md`**](file:///c:/Users/DYX_D/4wdfrt/DYX_GCS_Frontend/HANDOVER.md) has been updated with the complete entry.
