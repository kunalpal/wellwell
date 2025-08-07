## Dotfiles (chezmoi-managed)

Portable dotfiles managed by chezmoi for macOS and Ubuntu.

### Features
- Shell: zsh with fzf integration and sensible defaults
- Editors: vim/neovim baseline config
- tmux: sane defaults, mouse mode, vi keybindings
- git: opinionated defaults, local overlay support
- chezmoi: declarative, templated dotfiles with run-once scripts for package install
- Testing: Docker-based test target for Ubuntu applying chezmoi state

### Quick start (local)
```sh
brew install chezmoi # macOS
# or: sudo apt-get install -y chezmoi  # Ubuntu

chezmoi init --apply .
```

### Dry run
```sh
make dry-run          # prints linking plan without changing your $HOME
```

### Test in containers (isolated)
Requires Docker.
```sh
make test-ubuntu
```

### Structure
- `dot_*` files — mapped into `$HOME` (e.g. `dot_zshrc` -> `~/.zshrc`)
- `dot_config/**` — mapped into `~/.config/**`
- `executable_*` — scripts run by chezmoi (e.g. `run_once_install-packages.sh.tmpl`)
- `test/` — container test assets

### Local git identity
This repo ships a generic `~/.gitconfig`. To set your identity without committing it, create `~/.gitconfig.local`:
```ini
[user]
  name = Your Name
  email = your.email@example.com
```

### Apply and update
- Re-apply latest changes: `chezmoi apply`
- Edit and apply a single file: `chezmoi edit ~/.zshrc && chezmoi apply`

### Notes
- macOS uses Homebrew; Linux uses apt (Ubuntu)
- Neovim config delegates to `~/.vimrc` to avoid duplication


