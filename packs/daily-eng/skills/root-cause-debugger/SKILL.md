---
name: root-cause-debugger
description: Reproduce, isolate, and minimally fix bugs with regression tests.
triggers: ["bug", "fix", "debug", "crash", "error", "trace"]
default_persona: paranoid-reviewer
verify_required: true
---

# Root Cause Debugger

1. Reproduce or reason about the failure from logs and code.
2. Isolate the smallest failing unit.
3. Fix the root cause, not the symptom.
4. Add a regression test when feasible.
5. Verify the original failure is gone and related tests pass.
