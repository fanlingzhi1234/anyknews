# AnyKnews Working Agreements

## Version Branching

Every AnyKnews version upgrade starts from a dedicated version branch that matches the feature requirements design for that version.

Rules:

- Create a new branch before writing implementation code for a version upgrade.
- Prefer branch names like `v1.1`, `v1.2`, or `v2.0`.
- Create or update a matching design document before implementation planning.
- Keep the design document in `docs/superpowers/specs/` unless a future version explicitly chooses another location.
- Do not merge and deploy until the version scope has passed local verification and user acceptance.

## Release And Production Branching

AnyKnews follows the shared Codex workspace release standard in `docs/codex-workspace-cicd-standard.md`.

Rules:

- Version branches such as `v1.1` are for development and acceptance only.
- Production deploys only from `main` or an immutable release tag.
- After user acceptance, merge the version branch into `main`, push `main`, then deploy Tencent Cloud from `main`.
- If production is found checked out on a version branch, correct it by merging that branch into `main` and redeploying from `main`.
- Every production release must record the deployed branch, commit hash, server path, service name and health-check result.
