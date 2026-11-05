#!/usr/bin/env bash
# Exercise the real publisher only in disposable local repositories, never GitHub.
set -euo pipefail
publisher=$(cd "$(dirname "$0")" && pwd)/publish-market-index.sh
fixture=$(mktemp -d)
git init --bare "$fixture/remote.git" >/dev/null
git init -b main "$fixture/source" >/dev/null
cd "$fixture/source"
git config user.name Test
git config user.email test@example.invalid
git config core.autocrlf false
printf '{"version":"0.2.1"}\n' > package.json
printf '<svg>first</svg>\n' > icon.svg
git add .
git commit -qm fixture
git remote add origin "$fixture/remote.git"
git push -q origin main
publish() {
  git -c core.autocrlf=false clone -q --branch main "$fixture/remote.git" "$fixture/run-$1"
  (
    cd "$fixture/run-$1"
    printf '{"format":1}\n' > marketplace.json
    bash "$publisher" > "$fixture/result-$1.log" 2>&1
  )
}
head() { git --git-dir="$fixture/remote.git" rev-parse market-index; }
publish initial
initial=$(head)
publish unchanged
test "$(head)" = "$initial"
grep -q 'index already current' "$fixture/result-unchanged.log"
printf '<svg>second</svg>\n' > icon.svg
git add icon.svg
git commit -qm 'change icon only'
git push -q origin main
publish icon
test "$(head)" != "$initial"
git --git-dir="$fixture/remote.git" show market-index:icon.svg | grep -q second
git --git-dir="$fixture/remote.git" show market-index:README.md | grep -q 'raw.githubusercontent.com/luodaoyi/dsh-cabinet-mode/market-index/marketplace.json'
# Simulate an older generated README while keeping the current JSON and icon.
git -c core.autocrlf=false clone -q --branch market-index "$fixture/remote.git" "$fixture/old-readme"
(
  cd "$fixture/old-readme"
  git config user.name Test
  git config user.email test@example.invalid
  printf 'old instructions\n' > README.md
  git add README.md
  git commit -qm 'old readme'
  git push -q origin market-index
)
old=$(head)
publish readme
test "$(head)" != "$old"
git --git-dir="$fixture/remote.git" show market-index:README.md | grep -q '\$.format must be 1'
echo 'PASS: initial publish, unchanged no-op, icon-only update, README-only update'
