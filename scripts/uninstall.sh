#!/usr/bin/env bash
set -euo pipefail

ok()  { printf '\033[1;32m✓  %s\033[0m\n' "$*"; }
info(){ printf '\033[1;34m==> %s\033[0m\n' "$*"; }

info "Uninstalling Dadumi..."

OS="$(uname -s)"

case "$OS" in
  Darwin)
    if pgrep -x "Dadumi" &>/dev/null; then
      info "Stopping Dadumi..."
      pkill -x "Dadumi" || true
      sleep 1
    fi

    rm -rf /Applications/Dadumi.app
    rm -rf "$HOME/Library/Application Support/com.gayeonlee.dadumi"
    rm -rf "$HOME/Library/Logs/com.gayeonlee.dadumi"
    rm -rf "$HOME/Library/WebKit/com.gayeonlee.dadumi"
    rm -rf "$HOME/Library/Caches/com.gayeonlee.dadumi"
    rm -rf "$HOME/Library/Saved Application State/com.gayeonlee.dadumi.savedState"
    ok "Dadumi removed from macOS"
    ;;
  Linux)
    if pgrep -x "dadumi" &>/dev/null; then
      info "Stopping Dadumi..."
      pkill -x "dadumi" || true
      sleep 1
    fi

    if command -v dpkg &>/dev/null && dpkg -l dadumi &>/dev/null 2>&1; then
      sudo dpkg -r dadumi
    fi
    rm -f "$HOME/.local/bin/dadumi"
    rm -rf "$HOME/.local/share/com.gayeonlee.dadumi"
    rm -rf "$HOME/.config/com.gayeonlee.dadumi"
    rm -rf "$HOME/.cache/com.gayeonlee.dadumi"
    ok "Dadumi removed from Linux"
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac
