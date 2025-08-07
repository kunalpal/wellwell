#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOME_DIR="$HOME"
DOTFILES_HOME="$REPO_ROOT/home"
BACKUP_DIR="$HOME_DIR/.dotfiles_backup/$(date +%Y%m%d_%H%M%S)"

log() { printf "[dotfiles] %s\n" "$*"; }
err() { printf "[dotfiles][error] %s\n" "$*" >&2; }

ensure_dirs() {
  mkdir -p "$BACKUP_DIR"
  mkdir -p "$HOME_DIR/bin"
  ln -snf "$REPO_ROOT" "$HOME_DIR/.dotfiles"
}

link_file() {
  local source_path="$1" dest_path="$2"
  if [[ -L "$dest_path" && "$(readlink "$dest_path")" == "$source_path" ]]; then
    log "link exists: ${dest_path} -> ${source_path}"
    return
  fi
  if [[ -e "$dest_path" && ! -L "$dest_path" ]]; then
    mkdir -p "$(dirname "$BACKUP_DIR${dest_path}")"
    mv "$dest_path" "$BACKUP_DIR${dest_path}"
    log "backed up: $dest_path -> $BACKUP_DIR${dest_path}"
  fi
  mkdir -p "$(dirname "$dest_path")"
  ln -snf "$source_path" "$dest_path"
  log "linked: $dest_path -> $source_path"
}

link_all() {
  log "linking dotfiles from $DOTFILES_HOME to $HOME_DIR"
  while IFS= read -r -d '' src; do
    rel_path="${src#"$DOTFILES_HOME/"}"
    dst="$HOME_DIR/$rel_path"
    # Ensure parent directory exists; do not symlink directories themselves
    mkdir -p "$(dirname "$dst")"
    link_file "$src" "$dst"
  done < <(find "$DOTFILES_HOME" -type f -o -type l -print0)
}

detect_os() {
  if [[ "$OSTYPE" == darwin* ]]; then
    echo "macos"
    return
  fi
  if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    case "$ID" in
      ubuntu|debian) echo "debian";;
      amzn) echo "amazon";;
      fedora) echo "fedora";;
      *) echo "linux";;
    esac
    return
  fi
  echo "linux"
}

install_packages_macos() {
  if ! command -v brew >/dev/null 2>&1; then
    log "installing Homebrew"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    eval "$($(command -v brew) shellenv)"
  fi
  brew update
  brew bundle --file="$REPO_ROOT/test/Brewfile" || true
}

install_packages_debian() {
  sudo apt-get update -y
  sudo apt-get install -y git zsh tmux curl unzip ripgrep fzf vim neovim build-essential python3 python3-pip
}

install_packages_amazon() {
  sudo yum update -y || sudo dnf -y update || true
  sudo yum install -y git zsh tmux curl unzip ripgrep fzf vim neovim python3 python3-pip || \
  sudo dnf install -y git zsh tmux curl unzip ripgrep fzf vim neovim python3 python3-pip || true
}

install_packages() {
  case "$(detect_os)" in
    macos) install_packages_macos ;;
    debian) install_packages_debian ;;
    amazon) install_packages_amazon ;;
    *) log "Skipping package install for $(detect_os)" ;;
  esac
}

main() {
  ensure_dirs
  if [[ "${1:-}" == "--link-only" ]]; then
    link_all
    exit 0
  fi
  if [[ "${1:-}" == "--packages-only" ]]; then
    install_packages
    exit 0
  fi
  install_packages
  link_all
  log "Done. Start a new shell session to load changes."
}

main "$@"


