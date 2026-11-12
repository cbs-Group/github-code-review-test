# Copilot code review demo

Example repository showing how GitHub Copilot code review works on pull requests.

📖 **Documentation site:** deployed from [`site/`](site/) via GitHub Pages – see *Settings → Pages* for the URL.

## Quick start

1. A repository admin completes the one-time setup ([`site/setup.html`](site/setup.html)): ruleset with *Automatically request Copilot code review*, Pages source *GitHub Actions*.
2. Run **Actions → Create demo branch** and pick a scenario (`logic-bug`, `security`, `conventions`, `clean`).
3. Open the pull request from the link in the job summary. Copilot reviews it; compare with the expected findings.

## Local development

```bash
npm ci
npm run typecheck
npm test
npm run check:scenarios           # every scenario compiles and keeps tests green
npm run demo -- list              # list scenarios
npm run demo -- apply logic-bug   # apply a scenario to the working tree
```

## Layout

| Path | Purpose |
|------|---------|
| `src/` | TypeScript library under review |
| `demo/scenarios/` | Scenario overlays with planted issues |
| `scripts/` | Scenario tooling |
| `.github/copilot-instructions.md`, `.github/instructions/` | Custom review instructions |
| `.github/workflows/` | CI, demo branch creation, Pages deployment |
| `site/` | Documentation site |
