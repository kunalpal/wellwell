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
PROMPT='%F{cyan}%n%f@%F{green}%m%f %F{yellow}%1~%f %# '

# Plugin loader (no Oh My Zsh)
export ZSH_PLUGIN_DIR="$HOME/.zsh/plugins"

# zsh-autosuggestions
if [ -f "$ZSH_PLUGIN_DIR/zsh-autosuggestions/zsh-autosuggestions.zsh" ]; then
  source "$ZSH_PLUGIN_DIR/zsh-autosuggestions/zsh-autosuggestions.zsh"
fi

# zsh-syntax-highlighting must be loaded last
if [ -f "$ZSH_PLUGIN_DIR/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" ]; then
  source "$ZSH_PLUGIN_DIR/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
fi

# Keybindings
bindkey -e
