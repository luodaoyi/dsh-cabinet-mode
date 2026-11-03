#!/usr/bin/env bash
# Publish the generated marketplace.json to the dedicated `market-index` branch.
#
# Users read the index from
#   https://raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market-index/marketplace.json
# so the index is kept off `main`: `main` is the source branch that CI and the
# release workflow verify, while this branch holds a single generated commit that
# is force-pushed on every refresh.
#
# Used by .github/workflows/release.yml (after a tagged publish) and by
# .github/workflows/market-index.yml (manual or scheduled refresh). This bash
# script is the only publisher implementation; `npm run market:publish` calls it.
# bash is available on Windows through Git for Windows
# (for example C:\Program Files\Git\bin\bash.exe).
# Expects marketplace.json to be generated already by scripts/market-index.mjs.
#
# Run this only in a disposable clone with no uncommitted work: it checks out an
# orphan branch and rewrites the working tree. The script refuses to start when a
# tracked file is modified or staged, but untracked files are not protected.

set -euo pipefail

test -s marketplace.json || { echo "marketplace.json is missing or empty; run scripts/market-index.mjs first" >&2; exit 1; }
test -s icon.svg || { echo "icon.svg is missing; the index references it" >&2; exit 1; }
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "refusing to publish from a working tree with modified or staged tracked files; use a disposable clone" >&2
  exit 1
fi

version=$(node -p "require('./package.json').version")
staging=$(mktemp -d)
cp marketplace.json icon.svg "$staging/"

git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

# Skip the push when the published copy already matches the regenerated one.
if git fetch --no-tags origin market-index 2>/dev/null \
  && git show origin/market-index:marketplace.json 2>/dev/null | cmp -s - marketplace.json; then
  echo "index already current for ${version}"
  exit 0
fi

git checkout --orphan market-index-publish
git rm -rf .
cp "$staging/marketplace.json" "$staging/icon.svg" .
cat > README.md <<'EOF'
# Plugin market index

Generated from the npm registry by `scripts/market-index.mjs` for `dsh-cabinet-mode`.
Do not edit this branch by hand: the release workflow force-pushes it after every
tagged publish, and maintainers can refresh it with the `Market index` workflow.
EOF
git add marketplace.json icon.svg README.md
git commit -m "chore: refresh plugin market index for ${version}"

for attempt in 1 2 3; do
  if git push --force origin HEAD:refs/heads/market-index; then
    exit 0
  fi
  sleep 5
done
exit 1
