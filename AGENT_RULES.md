# Agent Rules & Instructions

This repository enforces strict operational guidelines for AI agents and human contributors.

The authoritative rules and pre/post-session protocols are maintained in:
👉 [**`AGENTS.md`**](file:///c:/Users/DYX_D/4wdfrt/DYX_GCS_Frontend/AGENTS.md)

### Summary of Mandatory Rules:
1. **Pre-Session Requirement**: Every agent **MUST** read [**`README.md`**](file:///c:/Users/DYX_D/4wdfrt/DYX_GCS_Frontend/README.md) and [**`HANDOVER.md`**](file:///c:/Users/DYX_D/4wdfrt/DYX_GCS_Frontend/HANDOVER.md) before writing code or proposing architectural changes.
2. **Post-Session Requirement**: Every agent **MUST** log a complete handover entry in [**`HANDOVER.md`**](file:///c:/Users/DYX_D/4wdfrt/DYX_GCS_Frontend/HANDOVER.md) upon completing a task.
3. **Safety First**: Never fake hardware state; maintain hardware failsafes (`finally` releases); respect motion/mission interlocks.
4. **Verification**: Run unit tests, type checks, and verify the Metro bundle before declaring completion.

Please refer to [**`AGENTS.md`**](file:///c:/Users/DYX_D/4wdfrt/DYX_GCS_Frontend/AGENTS.md) for full instructions and checklist.
