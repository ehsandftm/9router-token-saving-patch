#!/usr/bin/env bash
set -e

echo "⚡ Fetching and executing 9Router Token Saving Patch..."
TEMP_FILE=$(mktemp /tmp/9router-patch-XXXXXX.js 2>/dev/null || mktemp -t 9router-patch.js)

trap 'rm -f "$TEMP_FILE"' EXIT

curl -fsSL https://raw.githubusercontent.com/ehsandftm/9router-token-saving-patch/main/patch.js -o "$TEMP_FILE"
node "$TEMP_FILE" "$@"
