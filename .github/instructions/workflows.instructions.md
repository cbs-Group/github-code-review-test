---
applyTo: ".github/workflows/**"
---

# GitHub Actions review rules

- Pin every action to a release tag (for example `@v5`) or a full commit SHA, never to a branch such as `@main`.
- Declare least-privilege `permissions:` at workflow or job level; flag `write-all` or a missing `permissions:` block.
- Never interpolate `${{ github.event.* }}` or `${{ inputs.* }}` directly into `run:` scripts; pass values through `env:`.
- Never print secrets or write them to the job summary.
