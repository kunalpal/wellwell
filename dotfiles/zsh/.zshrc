# Managed by wellwell (repo dotfiles)

# Ensure Homebrew on PATH (macOS)
if command -v brew >/dev/null 2>&1; then
  eval "$(brew shellenv)"
fi

# History settings
HISTFILE=$HOME/.zsh_history
HISTSIZE=10000
SAVEHIST=$HISTSIZE
setopt HIST_IGNORE_DUPS
setopt HIST_REDUCE_BLANKS

# Prompt
# If Starship is available, use it; otherwise fallback
if command -v starship >/dev/null 2>&1; then
  eval "$(starship init zsh)"
else
  PROMPT='%F{cyan}%n%f@%F{green}%m%f %F{yellow}%1~%f %# '
fi

# Zinit bootstrap (no Oh My Zsh)
export ZINIT_HOME="${XDG_DATA_HOME:-$HOME/.local/share}/zinit/zinit.git"
if [ ! -s "$ZINIT_HOME/zinit.zsh" ]; then
  mkdir -p "${ZINIT_HOME%/*}"
  git clone https://github.com/zdharma-continuum/zinit.git "$ZINIT_HOME"
fi
source "$ZINIT_HOME/zinit.zsh"

# Plugins
zinit light zsh-users/zsh-autosuggestions
zinit light zsh-users/zsh-completions
# zsh-syntax-highlighting should be last
zinit light zsh-users/zsh-syntax-highlighting

# Ensure completions are initialized
autoload -Uz compinit && compinit -u

# mise (tool versions)
if command -v mise >/dev/null 2>&1; then
  eval "$(mise activate zsh)"
fi

# zoxide (map to `cd`)
if command -v zoxide >/dev/null 2>&1; then
  eval "$(zoxide init --cmd cd zsh)"
fi

# fzf config
if [ -f "$HOME/.config/fzf/.fzf.zsh" ]; then
  source "$HOME/.config/fzf/.fzf.zsh"
fi

# Source aliases if present
if [ -f "$HOME/.zsh/aliases.zsh" ]; then
  source "$HOME/.zsh/aliases.zsh"
fi

# Keybindings
bindkey -e
