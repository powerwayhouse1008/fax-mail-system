#!/usr/bin/env bash
set -u

log() { printf '%s\n' "$*"; }
section() { printf '\n=== %s ===\n' "$*"; }

check_cmd() {
  command -v "$1" >/dev/null 2>&1
}

section "System info"
log "Date (UTC): $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
log "Working directory: $(pwd)"

section "Current npm registry"
if check_cmd npm; then
  registry="$(npm config get registry 2>/dev/null || true)"
  log "npm registry: ${registry:-<unknown>}"
else
  log "npm not found in PATH"
  exit 1
fi

section "Proxy configuration"
for key in HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy npm_config_proxy npm_config_http_proxy npm_config_https_proxy; do
  val="${!key-}"
  if [ -n "$val" ]; then
    log "$key=$val"
  fi
done

section "Connectivity checks"
if check_cmd curl; then
  if curl -I -sS --max-time 10 https://registry.npmjs.org >/dev/null; then
    log "OK: Can reach https://registry.npmjs.org"
  else
    log "FAIL: Cannot reach https://registry.npmjs.org"
  fi
else
  log "curl not found; skipping direct connectivity test"
fi

section "Playwright package access test"
access_output="$(npm view playwright version 2>&1)"
access_code=$?
if [ "$access_code" -eq 0 ]; then
  log "OK: Can access playwright metadata. Latest version: $access_output"
else
  log "FAIL: Cannot access playwright metadata"
  log "$access_output"
fi

section "Suggested next steps"
if [ "$access_code" -eq 0 ]; then
  cat <<'SUGGEST'
1) Install package:
   npm install playwright
2) Install Chromium for Playwright:
   npx playwright install chromium
SUGGEST
else
  cat <<'SUGGEST'
Playwright metadata could not be fetched. Try one or more of these fixes:
1) Confirm your organization allows access to package "playwright".
2) If your company uses an internal npm mirror, set it:
   npm config set registry https://<internal-registry>/
3) Verify proxy settings and credentials used by npm.
4) Retry after policy/whitelist updates:
   npm install playwright
   npx playwright install chromium
SUGGEST
fi
