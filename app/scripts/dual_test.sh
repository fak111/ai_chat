#!/bin/bash
# dual_test.sh - Open two Chrome windows for dual-account chat testing
#
# Usage:
#   ./scripts/dual_test.sh          # Launch both windows
#   ./scripts/dual_test.sh --clean  # Clear cached tokens first
#
# Prerequisites:
#   - Flutter web app running at localhost:9191 (use `fweb`)
#   - Both test accounts registered and email-verified

set -e

APP_URL="http://localhost:9191"
ACCOUNT_A_EMAIL="test@example.com"
ACCOUNT_A_PASS="Test12345"
ACCOUNT_B_EMAIL="test2@example.com"
ACCOUNT_B_PASS="Test12345"

PROFILE_DIR_A="/tmp/abao-chrome-profile-A"
PROFILE_DIR_B="/tmp/abao-chrome-profile-B"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -f "$CHROME" ]; then
    echo "Error: Chrome not found at $CHROME"
    exit 1
fi

open_chrome() {
    local profile_dir=$1
    local email=$2
    local password=$3
    local label=$4
    local window_position=$5

    local url="${APP_URL}/?auto_login=${email}:${password}"

    echo "Opening $label ($email) ..."
    "$CHROME" \
        --user-data-dir="$profile_dir" \
        --no-first-run \
        --no-default-browser-check \
        --no-proxy-server \
        --disable-extensions \
        $window_position \
        --window-size=480,900 \
        "$url" &
}

echo "=== A宝 Dual Account Test ==="
echo ""

if [ "$1" = "--clean" ]; then
    echo "Cleaning Chrome profiles..."
    rm -rf "$PROFILE_DIR_A" "$PROFILE_DIR_B"
    echo "Done."
    echo ""
fi

open_chrome "$PROFILE_DIR_A" "$ACCOUNT_A_EMAIL" "$ACCOUNT_A_PASS" "Account A" "--window-position=100,50"
sleep 1
open_chrome "$PROFILE_DIR_B" "$ACCOUNT_B_EMAIL" "$ACCOUNT_B_PASS" "Account B" "--window-position=600,50"

echo ""
echo "Account A: $ACCOUNT_A_EMAIL (left)"
echo "Account B: $ACCOUNT_B_EMAIL (right)"
echo ""
echo "Tips:"
echo "  - First run auto-logs in; subsequent runs use cached tokens"
echo "  - Use --clean to force re-login"
echo "  - Make sure fweb is running"
