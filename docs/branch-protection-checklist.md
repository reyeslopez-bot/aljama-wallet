# Branch Protection Checklist

Use this checklist for `main` and `dev` so Dependabot auto-merge cannot bypass CI/security gates.

## Branch Rules

- [ ] Require a pull request before merging.
- [ ] Require approvals: at least 1 (recommended: 2 for `main`).
- [ ] Dismiss stale approvals when new commits are pushed.
- [ ] Require conversation resolution before merging.
- [ ] Require branches to be up to date before merging.
- [ ] Include administrators in these restrictions.
- [ ] Restrict who can push directly to protected branches.
- [ ] Disable force pushes.
- [ ] Disable branch deletion.

## Required Status Checks

Mark these checks as required in branch protection:

- [ ] `Core CI (Node + pnpm)`
- [ ] `Frontend CI (ubuntu-latest · shard 1/2)`
- [ ] `Frontend CI (ubuntu-latest · shard 2/2)`
- [ ] `Frontend CI (macos-latest · shard 1/2)`
- [ ] `Frontend CI (macos-latest · shard 2/2)`
- [ ] `Frontend CI (windows-latest · shard 1/2)`
- [ ] `Frontend CI (windows-latest · shard 2/2)`
- [ ] `Frontend CI (Ubuntu · Multi-browser)`
- [ ] `Frontend CI (Ubuntu · Prod-like backend)`
- [ ] `Frontend CI (macOS · Visual baselines)`
- [ ] `Container CI (Podman + Just)`

Notes:
- Do not mark `XRPL Live Integration (Testnet)` as required because it is secret-gated and may be skipped.
- If you add security scanners (for example CodeQL, secret scanning workflows), add them to this required list.

## Merge Rules

- [ ] Allow auto-merge only when required checks pass.
- [ ] Allow squash merges (recommended for dependency updates).
- [ ] Disable direct merge to protected branches.
- [ ] Optional: enable signed commits requirement for stricter provenance.

## Dependabot Guardrail

This repo also enforces required CI/security checks in `.github/workflows/dependabot.yml` before enabling auto-merge.

