#!/usr/bin/env bash
set -euo pipefail

# Bootstrap script to install Homebrew (macOS), mise, and Node for fresh machines

# Use sudo only if available and not running as root
run_pkg_cmd() {
  if command -v sudo >/dev/null 2>&1 && [ "${EUID:-$(id -u)}" -ne 0 ]; then
    sudo -n "$@"
  else
    "$@"
  fi
}

if [[ "$OSTYPE" == darwin* ]]; then
  if ! command -v brew >/dev/null 2>&1; then
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> "$HOME/.zprofile"
    eval "$([ -f /opt/homebrew/bin/brew ] && /opt/homebrew/bin/brew shellenv)"
  fi
else
  # Linux: attempt to install essential packages using apt/dnf/yum if available (non-interactive)
  if command -v apt-get >/dev/null 2>&1; then
    echo "Detected apt-get; installing essentials (git, curl, unzip)..."
    run_pkg_cmd apt-get update || true
    run_pkg_cmd apt-get install -y git curl unzip || true
  elif command -v dnf >/dev/null 2>&1; then
    echo "Detected dnf; installing essentials (git, curl, unzip)..."
    run_pkg_cmd dnf install -y git curl unzip || true
  elif command -v yum >/dev/null 2>&1; then
    echo "Detected yum; installing essentials (git, curl, unzip)..."
    run_pkg_cmd yum install -y git curl unzip || true
  fi
fi

# Install mise (skip if already installed)
if ! command -v mise >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install mise || true
  else
    curl https://mise.run | sh
  fi
fi

# Activate mise for this shell
export MISE_TRUSTED_CONFIG="1"
if [[ -f "$HOME/.local/bin/mise" ]]; then
  export PATH="$HOME/.local/bin:$PATH"
fi

# Ensure Node is installed to run the repo via mise
if command -v mise >/dev/null 2>&1; then
  mise install node@lts || true
fi

# Ensure npm is available (fallback to Homebrew Node if needed)
if ! command -v npm >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install node || true
  fi
fi

# Ensure git is available
if ! command -v git >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install git || true
  else
    echo "git is required but not found and Homebrew is unavailable. Please install git and re-run." >&2
    exit 1
  fi
fi

# Upstream repository
REPO_URL="https://github.com/kunalpal/wellwell.git"

# Preferred clone target and repo dir
DEFAULT_BASE="$HOME/Projects"
REPO_DIR="$DEFAULT_BASE/wellwell"

# If current directory isn't a git repo, clone a fresh copy into ~/Projects/wellwell
if [[ ! -d "$REPO_DIR/.git" ]]; then
  mkdir -p "$DEFAULT_BASE"
  if [[ ! -d "$REPO_DIR/.git" ]]; then
    echo "Cloning repository from $REPO_URL into $REPO_DIR..."
    git clone "$REPO_URL" "$REPO_DIR"
  else
    echo "Repository already exists at $REPO_DIR. Updating..."
    git -C "$REPO_DIR" fetch --all --prune || true
    git -C "$REPO_DIR" pull --rebase --autostash || true
  fi
else
  # Ensure 'origin' remote is set to the upstream URL and pull latest
  echo "Ensuring remote 'origin' points to $REPO_URL..."
  CURRENT_ORIGIN="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || echo '')"
  if [[ -z "$CURRENT_ORIGIN" ]]; then
    git -C "$REPO_DIR" remote add origin "$REPO_URL" || true
  elif [[ "$CURRENT_ORIGIN" != "$REPO_URL" ]]; then
    git -C "$REPO_DIR" remote set-url origin "$REPO_URL" || true
  fi
  echo "Updating repository at $REPO_DIR..."
  git -C "$REPO_DIR" fetch --all --prune || true
  git -C "$REPO_DIR" pull --rebase --autostash || true
fi

# Install dependencies and build the CLI (prefer running via mise shims)
echo "Installing dependencies and building wellwell..."
(
  cd "$REPO_DIR"
  if command -v mise >/dev/null 2>&1; then
    mise x node@lts -- npm ci
    mise x node@lts -- npm run build
  elif command -v npm >/dev/null 2>&1; then
    npm ci && npm run build
  else
    echo "Neither npm nor mise found on PATH. Ensure Node/npm available and retry." >&2
    exit 1
  fi
)

# Link the CLI into an accessible location
INSTALL_BIN_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_BIN_DIR"
chmod +x "$REPO_DIR/bin/wellwell" || true
ln -sf "$REPO_DIR/bin/wellwell" "$INSTALL_BIN_DIR/wellwell"
echo "Linked: $INSTALL_BIN_DIR/wellwell -> $REPO_DIR/bin/wellwell"

# Note: Optional tools (bat/batcat, starship, zsh, fzf, etc.) are managed by their respective modules.

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
