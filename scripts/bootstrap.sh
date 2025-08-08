#!/usr/bin/env bash
set -euo pipefail

# Bootstrap script to install Homebrew (macOS), mise, and Node for fresh machines

if [[ "$OSTYPE" == darwin* ]]; then
  if ! command -v brew >/dev/null 2>&1; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
    eval "$([ -f /opt/homebrew/bin/brew ] && /opt/homebrew/bin/brew shellenv)"
  fi
fi

# Install mise
if command -v brew >/dev/null 2>&1; then
  brew install mise || true
else
  curl https://mise.run | sh
fi

# Activate mise for this shell
export MISE_TRUSTED_CONFIG="1"
if [[ -f "$HOME/.local/bin/mise" ]]; then
  export PATH="$HOME/.local/bin:$PATH"
fi

# Ensure Node is installed to run the repo
mise install node@lts || true

# Ensure npm is available (fallback to Homebrew Node if needed)
if ! command -v npm >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install node || true
  fi
fi

# Project root (repo) relative to this script
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Update the repository (pull latest) if it's a git repo
if [[ -d "$REPO_DIR/.git" ]]; then
  echo "Updating repository at $REPO_DIR..."
  git -C "$REPO_DIR" fetch --all --prune || true
  git -C "$REPO_DIR" pull --rebase --autostash || true
fi

# Install dependencies and build the CLI
echo "Installing dependencies and building wellwell..."
(cd "$REPO_DIR" && npm ci && npm run build)

# Link the CLI into an accessible location
INSTALL_BIN_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_BIN_DIR"
chmod +x "$REPO_DIR/bin/wellwell" || true
ln -sf "$REPO_DIR/bin/wellwell" "$INSTALL_BIN_DIR/wellwell"
echo "Linked: $INSTALL_BIN_DIR/wellwell -> $REPO_DIR/bin/wellwell"

# Ensure ~/.local/bin is on PATH for future shells
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_BIN_DIR"; then
  export PATH="$INSTALL_BIN_DIR:$PATH"
fi
ZPROFILE="$HOME/.zprofile"
if [[ -f "$ZPROFILE" ]]; then
  if ! grep -qs "\$HOME/.local/bin" "$ZPROFILE"; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$ZPROFILE"
  fi
else
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$ZPROFILE"
fi

cat <<'EOF'
Bootstrap complete.
- Add to your shell: eval "$(mise activate zsh)"
- Then run: wellwell to manage modules
EOF
