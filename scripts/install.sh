#!/usr/bin/env bash
set -euo pipefail

REPO="c1adumi/dadumi"
INSTALL_DIR_MAC="/Applications"
INSTALL_DIR_LINUX="$HOME/.local/bin"

# ── helpers ──────────────────────────────────────────────────────────────────
info()  { printf '\033[1;34m==> %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m✓  %s\033[0m\n' "$*"; }
die()   { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

need() { command -v "$1" &>/dev/null || die "'$1' is required but not found. Please install it first."; }

# ── fetch latest release ──────────────────────────────────────────────────────
info "Fetching latest release from GitHub..."
need curl
need jq

RELEASE=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest")
VERSION=$(echo "$RELEASE" | jq -r '.tag_name')
info "Latest version: $VERSION"

# ── OS detection ──────────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)  PATTERN="*_aarch64.dmg" ;;
      x86_64) PATTERN="*_x64.dmg" ;;
      *)      die "Unsupported macOS architecture: $ARCH" ;;
    esac

    URL=$(echo "$RELEASE" | jq -r --arg p "${PATTERN/\*/}" \
      '.assets[] | select(.name | endswith($p)) | .browser_download_url' | head -1)
    [[ -z "$URL" ]] && die "No .dmg asset found for $ARCH in release $VERSION"

    TMPFILE=$(mktemp /tmp/dadumi_XXXXXX.dmg)
    info "Downloading $URL..."
    curl -fL "$URL" -o "$TMPFILE"

    info "Mounting disk image..."
    HDIUTIL_OUT=$(hdiutil attach "$TMPFILE" -nobrowse)
    MOUNTPOINT=$(echo "$HDIUTIL_OUT" | grep -o '/Volumes/[^\t]*' | head -1 | sed 's/[[:space:]]*$//')
    [[ -z "$MOUNTPOINT" ]] && die "Failed to mount disk image. hdiutil output: $HDIUTIL_OUT"

    info "Installing to $INSTALL_DIR_MAC..."
    APP_IN_DMG=$(find "$MOUNTPOINT" -maxdepth 1 -name "*.app" | head -1)
    [[ -z "$APP_IN_DMG" ]] && die "No .app found in $MOUNTPOINT"
    cp -R "$APP_IN_DMG" "$INSTALL_DIR_MAC/"

    hdiutil detach "$MOUNTPOINT" -quiet
    rm -f "$TMPFILE"

    ok "Dadumi $VERSION installed to $INSTALL_DIR_MAC/Dadumi.app"

    info "Removing quarantine attribute..."
    xattr -dr com.apple.quarantine "$INSTALL_DIR_MAC/Dadumi.app" 2>/dev/null || true

    info "Launching Dadumi..."
    open "$INSTALL_DIR_MAC/Dadumi.app"
    ;;

  Linux)
    # prefer .deb on Debian/Ubuntu, fall back to .AppImage
    if command -v dpkg &>/dev/null; then
      PATTERN="_amd64.deb"
      URL=$(echo "$RELEASE" | jq -r --arg p "$PATTERN" \
        '.assets[] | select(.name | endswith($p)) | .browser_download_url' | head -1)
      if [[ -n "$URL" ]]; then
        TMPFILE=$(mktemp /tmp/dadumi_XXXXXX.deb)
        info "Downloading $URL..."
        curl -fL "$URL" -o "$TMPFILE"
        info "Installing .deb package..."
        sudo dpkg -i "$TMPFILE"
        rm -f "$TMPFILE"
        ok "Dadumi $VERSION installed via dpkg"
        dadumi &
        exit 0
      fi
    fi

    # .AppImage fallback
    PATTERN=".AppImage"
    URL=$(echo "$RELEASE" | jq -r --arg p "$PATTERN" \
      '.assets[] | select(.name | endswith($p)) | .browser_download_url' | head -1)
    [[ -z "$URL" ]] && die "No suitable Linux asset found in release $VERSION"

    mkdir -p "$INSTALL_DIR_LINUX"
    DEST="$INSTALL_DIR_LINUX/dadumi"
    info "Downloading $URL..."
    curl -fL "$URL" -o "$DEST"
    chmod +x "$DEST"

    ok "Dadumi $VERSION installed to $DEST"
    "$DEST" &
    ;;

  *)
    die "Unsupported OS: $OS. Use install.ps1 for Windows."
    ;;
esac
