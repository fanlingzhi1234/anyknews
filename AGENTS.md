# AnyKnews Codex Release Rules

## Branch Discipline

- Develop version-sized work on version branches such as `v1.1`.
- Develop narrow tasks on `codex/<short-task>` or `fix/<short-task>`.
- Production deploys only from `main` or an immutable release tag.
- Do not deploy a version branch directly to Tencent Cloud production.
- If production is found on a version branch, merge that branch into `main`, push `main`, and redeploy from `main`.

## Required Verification

Run these before merging or deploying:

```bash
npx tsx scripts/verify-source-catalog.ts
npx tsx scripts/verify-refresh-policy.ts
npx tsx scripts/verify-source-cache-store.ts
npx tsc --noEmit
npm run lint
npm run build
```

## Production Deployment

Tencent Cloud production is `/opt/anyknews`.

Use the guarded deployment entrypoint:

```bash
cd /opt/anyknews
scripts/deploy-production.sh
```

The deploy script refuses to run unless the server worktree is on clean `main` and matches `origin/main`.

Before deploying, inspect running services and only restart `anyknews-app`.

## Documentation

For every version release:

- Update `README.md`.
- Update the matching design spec under `docs/superpowers/specs/`.
- Update `docs/tencent-cloud-deploy.md` if the deploy shape changes.
- Add or update the release summary under `docs/releases/`.
- Keep `docs/codex-workspace-cicd-standard.md` as the shared release-policy reference.
