# AnyKnews Working Agreements

## Version Branching

Every AnyKnews version upgrade starts from a dedicated version branch that matches the feature requirements design for that version.

Rules:

- Create a new branch before writing implementation code for a version upgrade.
- Prefer branch names like `v1.1`, `v1.2`, or `v2.0`.
- Create or update a matching design document before implementation planning.
- Keep the design document in `docs/superpowers/specs/` unless a future version explicitly chooses another location.
- Do not merge and deploy until the version scope has passed local verification and user acceptance.
