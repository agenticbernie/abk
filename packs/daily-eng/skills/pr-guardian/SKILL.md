---
name: pr-guardian
description: Guard pull requests for scope, tests, and release safety.
triggers: ["pr", "pull request", "guard", "release"]
default_persona: paranoid-reviewer
verify_required: true
---

# PR Guardian

1. Check that the diff matches the stated goal.
2. Verify tests and build commands.
3. Look for accidental file changes and debug leftovers.
4. Confirm documentation or config updates are intentional.
5. Block merge on concrete, fixable issues.
