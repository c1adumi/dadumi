#!/usr/bin/env bash
set -euo pipefail

REPO="c1adumi/dadumi"
INSTALL_DIR_MAC="/Applications"
INSTALL_DIR_LINUX="$HOME/.local/bin"
TMPFILE=""

info() { printf '\033[1;34m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓  %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

need() { command -v "$1" &>/dev/null || die "'$1' is required but not found."; }

cleanup() {
    [[ -n "$TMPFILE" && -f "$TMPFILE" ]] && rm -f "$TMPFILE"
}
trap cleanup EXIT

info "Fetching latest release from GitHub..."
need curl
need jq

RELEASE=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest")
VERSION=$(echo "$RELEASE" | jq -r '.tag_name')
[[ -z "$VERSION" || "$VERSION" == "null" ]] && die "No release found. Check https://github.com/${REPO}/releases"
info "Latest version: $VERSION"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64)  SUFFIX="_aarch64.dmg" ;;
      x86_64) SUFFIX="_x64.dmg" ;;
      *)      die "Unsupported architecture: $ARCH" ;;
    esac

    URL=$(echo "$RELEASE" | jq -r --arg s "$SUFFIX" \
      '.assets[] | select(.name | endswith($s)) | .browser_download_url' | head -1)
    [[ -z "$URL" ]] && die "No .dmg asset found for $ARCH in $VERSION"

    TMPFILE=$(mktemp /tmp/dadumi-XXXXXX)
    mv "$TMPFILE" "${TMPFILE}.dmg"
    TMPFILE="${TMPFILE}.dmg"

    info "Downloading..."
    curl -fL --progress-bar "$URL" -o "$TMPFILE"

    info "Mounting disk image..."
    HDIUTIL_OUT=$(hdiutil attach "$TMPFILE" -nobrowse)
    MOUNTPOINT=$(echo "$HDIUTIL_OUT" | awk '/\/Volumes\//{print $NF}' | head -1)
    [[ -z "$MOUNTPOINT" ]] && die "Failed to mount .dmg"

    APP_SRC=$(find "$MOUNTPOINT" -maxdepth 1 -name "*.app" | head -1)
    [[ -z "$APP_SRC" ]] && { hdiutil detach "$MOUNTPOINT" -quiet; die "No .app found in disk image"; }
    APP_NAME=$(basename "$APP_SRC")

    info "Installing $APP_NAME..."
    rm -rf "${INSTALL_DIR_MAC}/${APP_NAME}"
    cp -R "$APP_SRC" "$INSTALL_DIR_MAC/"

    hdiutil detach "$MOUNTPOINT" -quiet
    rm -f "$TMPFILE"; TMPFILE=""

    info "Removing quarantine..."
    xattr -dr com.apple.quarantine "${INSTALL_DIR_MAC}/${APP_NAME}" 2>/dev/null || true

    ok "$APP_NAME $VERSION installed"
    info "Launching..."
    open "${INSTALL_DIR_MAC}/${APP_NAME}"
    ;;

  Linux)
    if command -v dpkg &>/dev/null; then
      URL=$(echo "$RELEASE" | jq -r \
        '.assets[] | select(.name | endswith("_amd64.deb")) | .browser_download_url' | head -1)
      if [[ -n "$URL" ]]; then
        TMPFILE=$(mktemp /tmp/dadumi-XXXXXX)
        mv "$TMPFILE" "${TMPFILE}.deb"
        TMPFILE="${TMPFILE}.deb"
        info "Downloading..."
        curl -fL --progress-bar "$URL" -o "$TMPFILE"
        info "Installing .deb..."
        sudo dpkg -i "$TMPFILE"
        rm -f "$TMPFILE"; TMPFILE=""
        ok "Dadumi $VERSION installed"
        nohup dadumi >/dev/null 2>&1 &
        exit 0
      fi
    fi

    URL=$(echo "$RELEASE" | jq -r \
      '.assets[] | select(.name | endswith(".AppImage")) | .browser_download_url' | head -1)
    [[ -z "$URL" ]] && die "No suitable Linux asset found in $VERSION"

    mkdir -p "$INSTALL_DIR_LINUX"
    DEST="$INSTALL_DIR_LINUX/dadumi"
    info "Downloading..."
    curl -fL --progress-bar "$URL" -o "$DEST"
    chmod +x "$DEST"
    ok "Dadumi $VERSION installed to $DEST"
    nohup "$DEST" >/dev/null 2>&1 &
    ;;

  *)
    die "Unsupported OS: $OS. Use install.ps1 for Windows."
    ;;
esac
