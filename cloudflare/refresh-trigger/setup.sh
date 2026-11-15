#!/usr/bin/env bash
# Deploys the refresh trigger to Cloudflare and gives it its GitHub token.
# Safe to run again: it replaces the Worker and the secret.
#
#   CLOUDFLARE_API_TOKEN   Cloudflare token with "Workers Scripts: Edit"
#                          (only needed for this script, not afterwards)
#   GITHUB_DISPATCH_TOKEN  fine-grained GitHub token for the repository with
#                          "Actions: read and write" (stored on the Worker)
#
# Both are read from the environment and never printed.
set -euo pipefail
cd "$(dirname "$0")"

: "${CLOUDFLARE_API_TOKEN:?set CLOUDFLARE_API_TOKEN}"
: "${GITHUB_DISPATCH_TOKEN:?set GITHUB_DISPATCH_TOKEN}"

value() { sed -n "s/^$1 = \"\(.*\)\"/\1/p" wrangler.toml; }
repo=$(value GITHUB_REPO)
workflow=$(value GITHUB_WORKFLOW)
ref=$(value GITHUB_REF)
api="https://api.github.com/repos/$repo/actions/workflows/$workflow"
out=$(mktemp)
trap 'rm -f "$out"' EXIT
github() {
  curl -sS -o "$out" -w '%{http_code}' "$@" \
    -H "Authorization: Bearer $GITHUB_DISPATCH_TOKEN" \
    -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' \
    -H 'User-Agent: newsdash-refresh-trigger'
}

echo "1/4  Checking the Cloudflare token"
code=$(curl -sS -o "$out" -w '%{http_code}' \
  https://api.cloudflare.com/client/v4/accounts -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")
if [ "$code" != 200 ]; then
  echo "     Cloudflare answered $code: $(head -c 300 "$out")"
  exit 1
fi
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  ids=$(grep -o '"id":"[0-9a-f]\{32\}"' "$out" | cut -d'"' -f4 | sort -u)
  if [ "$(printf '%s\n' "$ids" | grep -c .)" != 1 ]; then
    echo "     The token can see $(printf '%s\n' "$ids" | grep -c .) Cloudflare accounts; set CLOUDFLARE_ACCOUNT_ID to the one to use."
    exit 1
  fi
  export CLOUDFLARE_ACCOUNT_ID=$ids
fi

echo "2/4  Checking the GitHub token against $repo"
code=$(github "$api")
if [ "$code" != 200 ]; then
  echo "     GitHub answered $code: $(head -c 300 "$out")"
  exit 1
fi
if ! grep -q '"state": *"active"' "$out"; then
  echo "     The workflow $workflow is not active on GitHub (re-enable it under Actions)."
  exit 1
fi

# A public repository can be read with any valid token, so the only proof
# that this one may start workflows is to start one. It costs one deploy.
echo "3/4  Starting one deploy now, exactly as the Worker will"
code=$(github -X POST "$api/dispatches" -H 'Content-Type: application/json' -d "{\"ref\":\"$ref\"}")
if [ "${code:0:1}" != 2 ]; then
  echo "     GitHub answered $code: $(head -c 300 "$out")"
  echo "     The token needs the \"Actions: read and write\" permission on $repo."
  exit 1
fi

echo "4/4  Deploying the Worker and storing the GitHub token on it"
export WRANGLER_SEND_METRICS=false
wrangler="npx --yes wrangler@4"
$wrangler deploy
printf '%s' "$GITHUB_DISPATCH_TOKEN" | $wrangler secret put GITHUB_TOKEN

echo "Done. The Worker starts a deploy at minutes 7, 22, 37 and 52 of every hour (UTC)."
