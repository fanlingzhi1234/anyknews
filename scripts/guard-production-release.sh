#!/usr/bin/env bash
set -euo pipefail

PRODUCTION_BRANCH="${PRODUCTION_BRANCH:-main}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
ALLOW_TAG_RELEASE="${ALLOW_TAG_RELEASE:-false}"

fail() {
  printf 'Production release guard failed: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '[release-guard] %s\n' "$*"
}

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "not inside a Git worktree"

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

current_branch="$(git symbolic-ref --quiet --short HEAD || true)"
current_commit="$(git rev-parse HEAD)"
short_commit="$(git rev-parse --short HEAD)"

if [[ -n "$(git status --porcelain)" ]]; then
  git status --short >&2
  fail "working tree is not clean"
fi

if [[ "$ALLOW_TAG_RELEASE" == "true" && -z "$current_branch" ]]; then
  exact_tag="$(git describe --exact-match --tags HEAD 2>/dev/null || true)"
  [[ -n "$exact_tag" ]] || fail "detached HEAD releases must point at an exact tag"
  info "detached tag release allowed: ${exact_tag} (${short_commit})"
  exit 0
fi

[[ "$current_branch" == "$PRODUCTION_BRANCH" ]] || fail "current branch is '${current_branch:-detached}', expected '${PRODUCTION_BRANCH}'"

git fetch "$REMOTE_NAME" "$PRODUCTION_BRANCH" --tags >/dev/null

remote_ref="$REMOTE_NAME/$PRODUCTION_BRANCH"
remote_commit="$(git rev-parse "$remote_ref")"

[[ "$current_commit" == "$remote_commit" ]] || fail "local ${PRODUCTION_BRANCH} (${short_commit}) does not match ${remote_ref} ($(git rev-parse --short "$remote_ref"))"

if git log --oneline "$current_commit".."$remote_ref" | grep -q .; then
  fail "local branch is behind ${remote_ref}"
fi

info "production source verified: ${PRODUCTION_BRANCH} ${short_commit}"
