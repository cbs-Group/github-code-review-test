# Copilot instructions

This repository demonstrates GitHub Copilot code review. `src/` contains a small TypeScript "order pricing" library.

## Review priorities

1. Correctness bugs, especially in money calculations.
2. Security: hardcoded secrets, missing input validation, sensitive data in logs or return values.
3. The project conventions below.

Skip purely stylistic remarks that a formatter would fix.

## Project conventions

- Money is always an integer number of cents. Flag floating-point money math and any result that can contain fractional cents.
- Never use `any`. Use precise types, or `unknown` with narrowing.
- No `console.*` calls in `src/`. Library code returns values or throws errors.
- Every new exported function needs a unit test in a sibling `*.test.ts` file.
- Never hardcode secrets, API keys or fallback credentials. Required configuration must fail fast when missing.
- Never log or return `passwordHash`; use `toPublicUser` for user data that leaves the module.
- Validate external input (emails, environment variables) at the module boundary.

## Comment format

- Write review comments in English.
- Start each comment with a severity tag: `[blocker]`, `[major]`, `[minor]` or `[nit]`.
- State the impact in one sentence and propose a concrete fix, preferably as a suggestion block.
