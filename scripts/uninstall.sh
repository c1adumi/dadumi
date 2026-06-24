#!/usr/bin/env bash
set -uo pipefail

ok()   { printf '\033[1;32m✓  %s\033[0m\n' "$*"; }
info() { printf '\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠  %s\033[0m\n' "$*"; }

BUNDLE_ID="com.gayeonlee.dadumi"
APP_NAME="Dadumi"

info "Uninstalling ${APP_NAME}..."

OS="$(uname -s)"

remove() {
    local path="$1"
    if [ -e "$path" ] || [ -L "$path" ]; then
        rm -rf "$path" && ok "Removed: $path" || warn "Failed to remove: $path"
    fi
}

kill_app() {
    local name="$1"
    if pgrep -x "$name" &>/dev/null; then
        info "Stopping ${name}..."
        pkill -SIGTERM -x "$name" 2>/dev/null || true
        sleep 1
        pgrep -x "$name" &>/dev/null && pkill -SIGKILL -x "$name" 2>/dev/null || true
        sleep 0.5
    fi
}

case "$OS" in
  Darwin)
    kill_app "$APP_NAME"

    remove "/Applications/${APP_NAME}.app"
    remove "$HOME/Library/Application Support/${BUNDLE_ID}"
    remove "$HOME/Library/Caches/${BUNDLE_ID}"
    remove "$HOME/Library/Logs/${BUNDLE_ID}"
    remove "$HOME/Library/WebKit/${BUNDLE_ID}"
    remove "$HOME/Library/Saved Application State/${BUNDLE_ID}.savedState"
    remove "$HOME/Library/Preferences/${BUNDLE_ID}.plist"
    remove "$HOME/Library/HTTPStorages/${BUNDLE_ID}"
    remove "$HOME/Library/Cookies/${BUNDLE_ID}"

    find "$HOME/Library/Application Support/CrashReporter" -name "${APP_NAME}*" -delete 2>/dev/null || true

    if command -v defaults &>/dev/null; then
      defaults delete com.apple.dock persistent-apps 2>/dev/null || true
      /usr/bin/python3 -c "
import subprocess, plistlib, os
dock_plist = os.path.expanduser('~/Library/Preferences/com.apple.dock.plist')
try:
    with open(dock_plist, 'rb') as f:
        data = plistlib.load(f)
    key = 'persistent-apps'
    if key in data:
        before = len(data[key])
        data[key] = [
            item for item in data[key]
            if '${APP_NAME}.app' not in str(item.get('tile-data', {}).get('file-data', {}).get('_CFURLString', ''))
        ]
        if len(data[key]) < before:
            with open(dock_plist, 'wb') as f:
                plistlib.dump(data, f)
            subprocess.run(['killall', 'Dock'], check=False)
            print('Removed ${APP_NAME} from Dock')
except Exception as e:
    print(f'Dock cleanup skipped: {e}')
" 2>/dev/null || true
    fi

    ok "${APP_NAME} fully removed from macOS"
    ;;

  Linux)
    kill_app "${APP_NAME,,}"

    if command -v dpkg &>/dev/null && dpkg -l dadumi &>/dev/null 2>&1; then
      info "Removing via dpkg..."
      sudo dpkg -r dadumi || warn "dpkg removal failed"
    fi

    remove "$HOME/.local/bin/dadumi"
    remove "$HOME/.local/share/${BUNDLE_ID}"
    remove "$HOME/.config/${BUNDLE_ID}"
    remove "$HOME/.cache/${BUNDLE_ID}"

    ok "${APP_NAME} fully removed from Linux"
    ;;

  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac
