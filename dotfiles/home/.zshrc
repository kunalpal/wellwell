# Shell options
set -o noclobber
bindkey -v
autoload -Uz compinit && compinit -d ~/.zcompdump
setopt prompt_subst

# Paths
export DOTFILES="$HOME/.dotfiles"
export PATH="$HOME/.local/bin:$HOME/bin:$PATH"
# Homebrew shellenv (macOS)
if [[ "$OSTYPE" == darwin* ]]; then
  if [[ -d /opt/homebrew ]]; then
    eval "$($(command -v brew 2>/dev/null || echo /opt/homebrew/bin/brew) shellenv)"
  elif [[ -d /usr/local/Homebrew ]]; then
    eval "$($(command -v brew 2>/dev/null || echo /usr/local/bin/brew) shellenv)"
  fi
fi

# fzf defaults
export FZF_DEFAULT_COMMAND='rg --files --hidden --follow --glob "!.git"'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"

# Aliases
alias ll='ls -lah'
alias gs='git status'
alias gl='git log --oneline --graph --decorate --all'
alias ..='cd ..'

# ripgrep defaults
export RIPGREP_CONFIG_PATH="$HOME/.ripgreprc"

# fzf keybindings if available
for p in \
  /opt/homebrew/opt/fzf/shell/key-bindings.zsh \
  /usr/local/opt/fzf/shell/key-bindings.zsh \
  "$(command -v fzf-share >/dev/null 2>&1 && fzf-share)/key-bindings.zsh" \
; do
  [[ -f "$p" ]] && source "$p" && break
done

# mise runtime manager
if command -v mise >/dev/null 2>&1; then
  eval "$(mise activate zsh)"
fi

# Load ~/.zshrc.local if present
if [[ -f "$HOME/.zshrc.local" ]]; then
  source "$HOME/.zshrc.local"
fi

# Prompt
PROMPT='%F{cyan}%n@%m%f %F{yellow}%1~%f $(git rev-parse --is-inside-work-tree >/dev/null 2>&1 && echo "%F{green}$(git rev-parse --abbrev-ref HEAD)%f ")❯ '


