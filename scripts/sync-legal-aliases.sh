#!/usr/bin/env bash
# Regenerates the alias URLs for the legal pages.
#
# vercel.json's `rewrites` are not applied by this deployment — /csae,
# /csae-policy and /delete-account all 404ed in production while the rules for
# them sat in the config doing nothing. What does work is a real file plus
# `cleanUrls`, which is how /privacy, /paid and /join resolve.
#
# So each alias is a copy of its canonical page rather than a rewrite. Copies
# drift: public/child-safety/index.html had gone stale against
# child-safety.html and was serving an older, unstyled version of the policy at
# the URL people actually visit. This script is the fix for that — run it after
# editing any legal page, rather than updating the copies by hand.
#
# Usage:  bash scripts/sync-legal-aliases.sh
set -euo pipefail
cd "$(dirname "$0")/../public"

# canonical:alias1,alias2,...
MAP=(
  "child-safety.html:csae,csae-policy"
  "delete.html:delete-account"
)

for entry in "${MAP[@]}"; do
  src="${entry%%:*}"
  aliases="${entry#*:}"
  [ -f "$src" ] || { echo "missing canonical page: $src" >&2; exit 1; }

  IFS=',' read -ra names <<< "$aliases"
  for name in "${names[@]}"; do
    cp "$src" "$name.html"
    echo "  $name.html  <- $src"
  done
done

# The two directory-style aliases that already existed. Kept in that shape so
# URLs already published against them keep working, but refreshed from the
# canonical file so they stop serving older content than their .html twin.
for pair in "child-safety:child-safety.html" "delete:delete.html"; do
  dir="${pair%%:*}"; src="${pair#*:}"
  mkdir -p "$dir"
  cp "$src" "$dir/index.html"
  echo "  $dir/index.html  <- $src"
done
