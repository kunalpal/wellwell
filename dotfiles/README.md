## Dotfiles

Portable dotfiles to bootstrap a consistent terminal-centric development environment on macOS and Linux (Ubuntu, Amazon Linux/EC2).

### Features
- Shell: zsh with fzf integration and sensible defaults
- Editors: vim/neovim baseline config
- tmux: sane defaults, mouse mode, vi keybindings
- git: opinionated defaults, local overlay support
- Bootstrap: cross-platform package install and safe symlink linking with backups
- Testing: Docker-based test targets for Ubuntu and Amazon Linux

### Quick start (local)
```sh
make bootstrap        # installs packages and links dotfiles
# or
make link             # only link dotfiles
make packages         # only install packages
```

### Dry run
```sh
make dry-run          # prints linking plan without changing your $HOME
```

### Test in containers (isolated)
Requires Docker.
```sh
make test-ubuntu
make test-amazonlinux
make test-all
```

### Structure
- `home/` — files and directories to be mirrored into `$HOME/`
- `scripts/` — bootstrap and helper scripts
- `bin/` — user utilities added to `PATH`
- `test/` — container test assets

### Local git identity
This repo ships a generic `~/.gitconfig`. To set your identity without committing it, create `~/.gitconfig.local`:
```ini
[user]
  name = Your Name
  email = your.email@example.com
```

### Uninstall / revert symlinks
Backups are made automatically on first link under `~/.dotfiles_backup/<timestamp>/`. To revert, move files back from a backup snapshot and remove symlinks as needed.

### Notes
- macOS uses Homebrew; Linux uses apt/dnf/yum as detected
- Neovim config delegates to `~/.vimrc` to avoid duplication


