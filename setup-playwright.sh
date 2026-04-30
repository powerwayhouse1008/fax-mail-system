#!/usr/bin/env bash
set -u

log() { printf '%s\n' "$*"; }
section() { printf '\n=== %s ===\n' "$*"; }
check_cmd() { command -v "$1" >/dev/null 2>&1; }

RUN_INSTALL=0
if [ "${1-}" = "--install" ]; then
  RUN_INSTALL=1
fi

section "AtHome extraction prerequisite"
log "AtHome抽出には Playwright が必要です。"
log "Required commands: npm install playwright && npx playwright install chromium"

if ! check_cmd npm; then
  log "ERROR: npm not found in PATH"
  exit 1
fi

section "Environment"
log "Date (UTC): $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
log "Working directory: $(pwd)"
log "npm registry: $(npm config get registry 2>/dev/null || echo '<unknown>')"

section "Proxy configuration"
for key in HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy npm_config_proxy npm_config_http_proxy npm_config_https_proxy; do
  val="${!key-}"
  if [ -n "$val" ]; then
    log "$key=$val"
  fi
done

section "Playwright metadata access"
meta_output="$(npm view playwright version 2>&1)"
meta_code=$?
if [ "$meta_code" -eq 0 ]; then
  log "OK: playwright metadata available (latest: $meta_output)"
else
  log "FAIL: cannot access playwright metadata"
  log "$meta_output"
fi

if [ "$RUN_INSTALL" -eq 1 ]; then
  section "Install Playwright package"
  npm install playwright
  install_code=$?
  if [ "$install_code" -ne 0 ]; then
    log "FAIL: npm install playwright"
    log "Hint: likely blocked by proxy/security policy or missing internal registry access."
    exit "$install_code"
  fi

  section "Install Chromium for Playwright"
  npx playwright install chromium
  browser_code=$?
  if [ "$browser_code" -ne 0 ]; then
    log "FAIL: npx playwright install chromium"
    log "Hint: browser download host may be blocked by firewall/proxy policy."
    exit "$browser_code"
  fi

  log "SUCCESS: Playwright + Chromium installed."
else
  section "Next step"
  log "Run the installer mode:"
  log "  ./setup-playwright.sh --install"
fi

if [ "$meta_code" -ne 0 ]; then
  section "Troubleshooting"
  cat <<'SUGGEST'
1) Confirm your organization allows npm package "playwright".
2) If using an internal npm mirror:
   npm config set registry https://<internal-registry>/
3) Verify proxy credentials/settings used by npm.
4) Retry:
   npm install playwright
   npx playwright install chromium
SUGGEST
fi
