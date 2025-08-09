# Managed by wellwell (repo aliases)

# Navigation
alias ..='cd ..'
alias ...='cd ../..'

# Listings
alias ll='eza -lah --icons=always'
alias la='eza -a --icons=always'
# From backup
alias ls='eza --icons=always'

# Editors
alias vim='nvim'
alias v='nvim'

# Convenience
alias c='clear'
alias date='gdate'

# Cross-platform tool shims
# bat vs batcat (Ubuntu/Debian packages install batcat)
if command -v batcat >/dev/null 2>&1; then
  alias bat='batcat'
fi

# Git
alias gs='git status'
alias gl='git log --oneline --graph --decorate'
