## wellwell

Dotfiles and automation, with a TUI to manage modules across macOS, Ubuntu, and Amazon Linux.

### One‑line install

Run this to bootstrap the project, build the CLI, and link the `wellwell` binary:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/kunalpal/wellwell/main/scripts/bootstrap.sh)"
```

After it finishes, start a new shell (or `source ~/.zprofile`) and run:

```bash
wellwell
```

### Quick Docker check (macOS/Linux)

Build and drop into a shell on Ubuntu 24.04 (uses your local repo, not remote):

```bash
npm run docker:ubuntu:build && npm run docker:ubuntu:shell
```

Amazon Linux Docker support is temporarily disabled.

### What the installer does

- Installs essentials only (git, curl, unzip where possible)
- Installs `mise` and ensures Node (via `mise`)
- Clones/pulls `kunalpal/wellwell`, builds, and symlinks `~/.local/bin/wellwell`

Optional tools (e.g., zsh, starship, fzf, bat/batcat) are installed by their respective modules, not by the bootstrapper.

### Usage

- Start the TUI:

```bash
wellwell
```

- Run a specific module:

```bash
wellwell zsh
wellwell theme list
wellwell theme vscode
wellwell brew diff
wellwell brew install
```

### Modules

- zsh: links managed `~/.zshrc`, installs zinit and common plugins
- theme: manages color palettes and (re)builds theme assets
- starship: installs and links `~/.config/starship.toml`
- fzf: links `~/.config/fzf/.fzf.zsh`
- bat: installs/links config and custom theme, rebuilds cache
- brew (macOS): inspects and applies `dotfiles/brew/Brewfile`

### Platforms

Supported on macOS and Ubuntu. Amazon Linux support is temporarily disabled.

### Repository


