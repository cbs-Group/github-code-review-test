---
applyTo: "**/*.test.ts"
---

# Test review rules

- Tests must be deterministic: no real network, no real clock, no unseeded randomness.
- Prefer table-driven cases with `it.each` for input/output checks.
- Each test checks one behavior, and its name states the expected behavior.
- Flag tests that only restate the implementation or assert on constants.
