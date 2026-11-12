# Copilot Code Review Demo – Design

Date: 2026-11-12
Repository: `cbs-Group/github-code-review-test` (private)

## Goal

Provide a self-contained example repository that

1. explains the GitHub Copilot code review process on a GitHub Pages site, and
2. lets anyone with access test the flow end to end by generating a demo pull request with planted issues that Copilot reviews.

## Non-goals

- No real product functionality; the sample library exists only as review material.
- No automation of repository/org settings (rulesets, Pages source); these are documented manual steps.
- No bot-authored pull requests (see "Demo flow" for why).

## Repository layout

```
src/                      sample TypeScript library ("order pricing")
  pricing.ts              cart total, discounts, tax (money in integer cents)
  users.ts                user lookup + input validation
  config.ts               env-based config loading
  *.test.ts               Vitest tests
demo/scenarios/<name>/
  scenario.json           { title, body, expected } – PR title/body and what Copilot should find
  files/...               overlay files copied over the repository root
scripts/
  create-demo-branch.mjs  applies a scenario overlay to the working tree (used by workflow and locally)
  check-scenarios.mjs     applies each overlay in a temp copy, runs tsc + vitest
site/                     GitHub Pages content (static HTML + CSS, no build step)
.github/
  copilot-instructions.md
  instructions/tests.instructions.md
  instructions/workflows.instructions.md
  workflows/ci.yml
  workflows/create-demo-branch.yml
  workflows/pages.yml
README.md                 short intro, links to the Pages site
```

Stack: Node.js 24, TypeScript, Vitest. No runtime dependencies.

## Sample library

Small, readable modules with existing tests so planted issues are realistic:

- `pricing.ts` – `calculateSubtotal`, `applyDiscount`, `calculateTax`, `calculateTotal`; money as integer cents.
- `users.ts` – in-memory user store, `findUserByEmail` with email validation, `toPublicUser` that strips sensitive fields.
- `config.ts` – `loadConfig(env)` reading required variables and failing fast when missing.

## Demo scenarios

Each scenario overlay compiles and keeps the existing tests green, so only the review surfaces the issues.

| Scenario      | Planted change                                                                 | Copilot is expected to flag                              |
|---------------|--------------------------------------------------------------------------------|----------------------------------------------------------|
| `logic-bug`   | discount applied twice in `calculateTotal`; tax computed with floats and rounding drift | double discount, float money math                 |
| `security`    | hardcoded API key fallback in config; email lookup without validation; logging full user incl. password hash | secret in code, missing validation, sensitive data in logs |
| `conventions` | new export using `any`, `console.log` in `src/`, no test for the new export   | violations of `.github/copilot-instructions.md`          |
| `clean`       | small, correct addition (currency formatter) with a table-driven test          | little or nothing – shows Copilot does not invent issues |

Overlays replace whole files rather than applying patches, so they never fail on patch conflicts. `check-scenarios` in CI detects when an overlay drifts from `main` and no longer compiles.

## Demo flow

1. Actions → **Create demo branch** → choose scenario → Run.
2. Workflow (`contents: write`) checks out `main`, runs `scripts/create-demo-branch.mjs <scenario>`, commits as `github-actions[bot]`, pushes `demo/<scenario>-<run_number>`.
3. Job summary renders a prefilled compare link: `https://github.com/<repo>/compare/main...<branch>?quick_pull=1&title=…&body=…`.
4. The tester opens the pull request (human author).
5. The repository ruleset **Automatically request Copilot code review** requests Copilot; CI runs on the `pull_request` event.
6. Tester reads comments, applies a suggestion, re-requests review or pushes (with *Review new pushes*), then closes the PR and deletes the branch.

Why a human opens the PR: automatic review usage is attributed to the PR author. Bot-authored PRs are billed directly to the organization (requires AI credits paid usage) and PRs created with `GITHUB_TOKEN` do not trigger other workflows, so CI would not run.

## Custom instructions

- `.github/copilot-instructions.md` – repo-wide: money only as integer cents, no `any`, no `console.*` in `src/`, every new export needs a test, never hardcode or log secrets, review comments in English with a severity prefix (`[blocker]`, `[major]`, `[minor]`, `[nit]`).
- `.github/instructions/tests.instructions.md` (`applyTo: "**/*.test.ts"`) – deterministic tests, no real network, table-driven cases preferred.
- `.github/instructions/workflows.instructions.md` (`applyTo: ".github/workflows/**"`) – pinned action versions, least-privilege `permissions:`.

Copilot reads instructions from the PR head branch, so changes to instructions can be tested inside a demo PR.

## Workflows

- `ci.yml` – on `pull_request` and push to `main`: `npm ci`, `npm run typecheck`, `npm test`, `npm run check:scenarios`. `permissions: contents: read`.
- `create-demo-branch.yml` – `workflow_dispatch` with `scenario` choice input; `permissions: contents: write`; writes job summary with compare link.
- `pages.yml` – on push to `main` affecting `site/**` and `workflow_dispatch`; `actions/configure-pages`, `actions/upload-pages-artifact` (path `site`), `actions/deploy-pages`; `permissions: pages: write, id-token: write, contents: read`; `concurrency: pages`.

## GitHub Pages site

Static HTML, one stylesheet, CSS numbered-card flow diagram, relative links only (works under `/<repo>/` path).

Styling follows the cbs corporate look of `slide-dev-template/styles.css`: cbs color tokens (orange, black, silver), Space Grotesk headings, IBM Plex Sans body, panels/callouts with orange accents, `.flow .step .arrow` chips, cbs logo in the header. Fonts are self-hosted from `@fontsource` (SIL OFL, licenses in `site/fonts/`) instead of the Google Fonts CDN, so the site makes no third-party requests. Light theme only.

- `index.html` – what Copilot code review is, flow diagram, licensing/billing basics (manual vs. automatic vs. bot-authored).
- `setup.html` – one-time setup: ruleset with *Automatically request Copilot code review* (+ *Review new pushes*, *Review draft pull requests*), review effort level, Pages source = *GitHub Actions*, deleting demo branches after closing, private-repo Pages note (private visibility requires GitHub Enterprise Cloud).
- `try-it.html` – step-by-step per scenario, what to expect, applying suggestions, re-requesting review, cleanup.
- `customize.html` – custom instructions, `applyTo` / `excludeAgent`, effort levels (Lite / Balanced / Max), tips and limits (Copilot leaves a *Comment* review, not an approval, unless auto-approval is enabled).

## Testing

- Vitest unit tests for the sample library.
- `check-scenarios` applies each overlay in a temp copy and runs `tsc --noEmit` and `vitest run`.
- Site: serve `site/` locally, check pages and links in a browser.
- After push: run `ci.yml`, `pages.yml`, and `create-demo-branch.yml`; open one demo PR to verify the review end to end. Ruleset and Pages source are configured manually by a repository admin.
