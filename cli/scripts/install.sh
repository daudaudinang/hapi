#!/usr/bin/env sh
set -eu

# HAPI bootstrap installer
# Downloads platform binary, verifies SHA-256, installs, prints next steps.

REPO="tiann/hapi"
DEFAULT_VERSION="latest"
BIN_NAME="hapi"
TMPDIR="${TMPDIR:-/tmp}"

# --- helpers ---
info()  { printf '\033[1;34m>\033[0m %s\n' "$*"; }
err()   { printf '\033[1;31m>\033[0m %s\n' "$*" >&2; exit 1; }
warn()  { printf '\033[1;33m>\033[0m %s\n' "$*"; }

detect_os() {
    case "$(uname -s)" in
        Linux)  echo "linux" ;;
        Darwin) echo "darwin" ;;
        *)      err "Unsupported OS: $(uname -s). Only Linux and macOS are supported." ;;
    esac
}

detect_arch() {
    case "$(uname -m)" in
        x86_64|amd64) echo "x64" ;;
        aarch64|arm64) echo "arm64" ;;
        *)             err "Unsupported architecture: $(uname -m). Only x64 and arm64 are supported." ;;
    esac
}

OS=$(detect_os)
ARCH=$(detect_arch)
VERSION="${1:-$DEFAULT_VERSION}"

# --- map to artifact name (linux x64 uses x64-baseline) ---
case "${OS}-${ARCH}" in
    linux-x64)  ARTIFACT="hapi-linux-x64-baseline.tar.gz" ;;
    *)          ARTIFACT="hapi-${OS}-${ARCH}.tar.gz" ;;
esac

# --- determine install prefix ---
if [ "$(id -u)" -eq 0 ] || [ -w /usr/local/bin ]; then
    PREFIX="/usr/local/bin"
else
    PREFIX="${HOME}/.local/bin"
    mkdir -p "$PREFIX"
fi
INSTALL_PATH="${PREFIX}/${BIN_NAME}"

# --- download ---
WORKDIR="${TMPDIR}/hapi-install-$$"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

info "Platform: ${OS}-${ARCH}"
info "Installing to: ${INSTALL_PATH}"

if [ "$VERSION" = "latest" ]; then
    BINARY_URL="https://github.com/${REPO}/releases/latest/download/${ARTIFACT}"
    CHECKSUM_URL="https://github.com/${REPO}/releases/latest/download/checksums.txt"
else
    BINARY_URL="https://github.com/${REPO}/releases/download/${VERSION}/${ARTIFACT}"
    CHECKSUM_URL="https://github.com/${REPO}/releases/download/${VERSION}/checksums.txt"
fi

info "Downloading ${ARTIFACT}..."
if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "${ARTIFACT}" "$BINARY_URL" || err "Download failed: ${BINARY_URL}"
    curl -fsSL -o checksums.txt "$CHECKSUM_URL" || err "Failed to download checksums"
elif command -v wget >/dev/null 2>&1; then
    wget -q -O "${ARTIFACT}" "$BINARY_URL" || err "Download failed: ${BINARY_URL}"
    wget -q -O checksums.txt "$CHECKSUM_URL" || err "Failed to download checksums"
else
    err "Neither curl nor wget found. Install one and retry."
fi

# --- verify checksum ---
info "Verifying SHA-256 checksum..."
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c --ignore-missing checksums.txt 2>/dev/null || err "Checksum verification failed"
elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c checksums.txt 2>/dev/null || err "Checksum verification failed"
else
    warn "No sha256sum/shasum found — skipping checksum verification"
fi

# --- extract ---
info "Extracting..."
tar -xzf "${ARTIFACT}"
if [ ! -f "${BIN_NAME}" ]; then
    err "Binary '${BIN_NAME}' not found in archive"
fi

# --- install ---
if [ -f "$INSTALL_PATH" ]; then
    info "Replacing existing ${INSTALL_PATH}"
fi
mv -f "${BIN_NAME}" "$INSTALL_PATH"
chmod +x "$INSTALL_PATH"

# --- cleanup ---
cd /
rm -rf "$WORKDIR"

info "HAPI installed to ${INSTALL_PATH}"

# --- PATH check ---
case ":$PATH:" in
    *":${PREFIX}:"*) ;;
    *)
        warn "$PREFIX is not in your PATH."
        echo "  Add this to your shell profile (~/.bashrc, ~/.zshrc):"
        echo "    export PATH=\"${PREFIX}:\$PATH\""
        ;;
esac

# --- next steps ---
info "Next steps:"
echo ""
echo "  1. Enroll your runner:"
echo "     hapi runner enroll --hub <hub-url> --code <enrollment-code> --profile my-runner"
echo ""
echo "  2. Install as OS service:"
echo "     hapi runner install --profile my-runner"
echo ""
echo "  3. Check status:"
echo "     hapi runner status --profile my-runner"
echo ""
info "For help: hapi runner"
