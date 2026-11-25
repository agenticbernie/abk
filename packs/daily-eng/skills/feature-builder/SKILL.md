---
name: feature-builder
description: Build a focused feature with tests and verification.
triggers: ["feature", "implement", "add", "build"]
default_persona: builder
verify_required: true
---

# Feature Builder

1. Restate the requested behavior as acceptance criteria.
2. Inspect the smallest set of relevant files.
3. Implement the minimal coherent change.
4. Add or update tests when the project has a test framework.
5. Run verify commands and fix failures.
6. Summarize changed files and residual risks.
