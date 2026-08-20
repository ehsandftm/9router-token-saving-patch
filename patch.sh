#!/usr/bin/env bash
set -e

command -v node >/dev/null 2>&1 || { echo >&2 "❌ Error: 'node' is required but not found in PATH."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo >&2 "❌ Error: 'curl' is required but not found in PATH."; exit 1; }

echo "⚡ Fetching and executing 9Router Token Saving Patch..."
TEMP_FILE=$(mktemp /tmp/9router-patch-XXXXXX.js 2>/dev/null || mktemp -t 9router-patch.js)

trap 'rm -f "$TEMP_FILE"' EXIT

curl -fsSL https://raw.githubusercontent.com/ehsandftm/9router-token-saving-patch/main/patch.js -o "$TEMP_FILE"
node "$TEMP_FILE" "$@"
