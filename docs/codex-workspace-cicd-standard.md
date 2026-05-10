# Codex Workspace CI/CD Standard

This is the default release standard for Codex-managed projects that follow the local development -> GitHub repository -> Tencent Cloud production path.

It applies across projects unless a project has a stricter written release rule.

## Baseline Principles

1. Production must deploy from `main` or an immutable release tag.
2. Feature, fix, experiment and version branches must never be the long-running production source.
3. GitHub is the system of record for code history, review history, release commits and tags.
4. Tencent Cloud servers are runtime targets only. They pull released code; they are not development workspaces.
5. Local verification and CI verification are both required before production deployment.
6. Deployment commands must be project-scoped and must not restart unrelated services on the server.
7. Every release needs a clear rollback point.

## Reference Model

The standard follows the public GitHub Flow model: create a branch, commit changes, open review, merge to the protected main branch, then deploy from the protected release source.

For Codex-assisted work, the branch and review steps can be supported by Codex or Codex GitHub Action, but the release boundary remains the same: production deploys only from `main` or a tag.

Recommended references:

- OpenAI Codex docs: https://platform.openai.com/docs/codex
- OpenAI Codex GitHub Action: https://developers.openai.com/codex/github-action
- GitHub Flow: https://docs.github.com/en/get-started/quickstart/github-flow
- GitHub Actions environments: https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment

## Branch Policy

Use these branch roles:

| Branch Type | Example | Purpose | Production Deploy Allowed |
| --- | --- | --- | --- |
| Production | `main` | Current production-ready state | Yes |
| Release tag | `v1.1.0` | Immutable rollback and audit point | Yes |
| Version branch | `v1.1`, `v1.2` | Version-sized feature development and acceptance | No |
| Feature branch | `codex/source-manager-redesign` | Narrow feature or fix | No |
| Hotfix branch | `hotfix/v1.1.1-healthcheck` | Emergency patch before merging back to `main` | No |

Rules:

- Start meaningful version work from a version branch.
- Start narrow work from `codex/<short-task>` or `fix/<short-task>`.
- Merge accepted feature branches into the version branch.
- Merge the accepted version branch into `main`.
- Tag releases from `main`.
- Never leave the production server checked out on a feature or version branch after release.

## Required Local Checks

Each project should define its own exact command list. The default order is:

```bash
git status --short --branch
npm ci
npm run lint
npx tsc --noEmit
npm run build
```

Project-specific verification scripts must run before `lint` or `build` when they check generated manifests, data contracts or connector behavior.

For Docker services:

```bash
docker compose config
docker compose build <service>
```

Do not deploy if any required local check fails.

## GitHub CI Gate

Every repository should have a CI workflow that runs on:

- Pull requests into `main`
- Pushes to `main`
- Pushes to version branches such as `v1.1`

Minimum jobs:

- Install dependencies from the lockfile
- Run project verification scripts
- Run type checks
- Run lint
- Run production build

The CI result must be green before merging a version branch to `main`.

## Release Flow

1. Work locally on a feature or version branch.
2. Update the version design, release notes and deployment notes in the repo.
3. Run all local checks.
4. Push the branch to GitHub.
5. Open or update a pull request into `main`.
6. Wait for CI to pass.
7. Merge into `main`.
8. Pull the merged `main` locally and create a release tag:

```bash
git checkout main
git pull --ff-only origin main
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin main --tags
```

9. Deploy Tencent Cloud from `main` or the release tag only.
10. Run server-side health checks and record the result in the release summary.

## Tencent Cloud Deployment Rule

Production servers must use a project directory such as `/opt/<project>`.

Each project should provide a guarded deploy script, for example:

```bash
cd /opt/<project>
scripts/deploy-production.sh
```

The deploy script must refuse to proceed unless all of these are true:

- The worktree is clean.
- The current release source is `main`, or an explicitly allowed immutable tag.
- The local `main` commit exactly matches `origin/main`.
- The compose config is valid.
- The health endpoint passes after restart.

If deploying from a tag instead of `main`:

```bash
git checkout --detach vX.Y.Z
```

Use tags for rollback or frozen releases. Use `main` for normal continuous production.

## Service Isolation

Before deploying, inspect runtime scope:

```bash
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
docker compose ps
```

Only restart the target project's compose service. Do not run broad host-level restart commands.

For a shared server, never run:

- `docker system prune`
- host-level package upgrades
- broad `pkill`
- broad service restarts

unless the user explicitly approves the blast radius.

## Rollback

Each release must have a tag or previous `main` commit hash.

Rollback shape:

```bash
cd /opt/<project>
git fetch origin --tags
git checkout --detach <previous-tag-or-commit>
docker compose up -d --build <service>
curl -fsS http://127.0.0.1:<port>/api/health
```

After emergency rollback, create a follow-up hotfix branch and merge the final correction back to `main`.

## Codex Operating Rules

When Codex is acting as the release operator:

- State the current branch and intended release source before deployment.
- Refuse to deploy a feature or version branch directly to production unless the user explicitly asks for a temporary preview deployment.
- Use the project guarded deploy script rather than hand-running raw deploy steps when one exists.
- If a server is found on a non-production branch, correct it back to `main` after the branch is merged.
- Update release docs before merge.
- Run verification before claiming completion.
- Include commit hash, branch, tag, server path, service name and health-check result in the final release report.

## Project Adoption Checklist

Each repo should contain:

- `README.md` release section
- Project-specific deploy runbook under `docs/`
- Project-specific CI workflow under `.github/workflows/`
- Release summary under `docs/releases/`
- Optional `AGENTS.md` with Codex-specific branch, verification and deployment rules

This document is the workspace-level default. Project docs may add stricter rules but should not loosen production branch control.
