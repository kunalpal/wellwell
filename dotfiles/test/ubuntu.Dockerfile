FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update -y && apt-get install -y git curl sudo ca-certificates chezmoi && rm -rf /var/lib/apt/lists/*

# Create user
RUN useradd -ms /bin/bash dev && usermod -aG sudo dev && echo 'dev ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers
USER dev
WORKDIR /home/dev

COPY --chown=dev:dev . /home/dev/dotfiles
WORKDIR /home/dev/dotfiles

RUN chezmoi init --apply .

CMD ["zsh", "-lc", "export PATH=\"$HOME/.local/bin:$PATH\"; eval \"$(mise activate zsh)\"; zsh --version && tmux -V && rg --version && fzf --version && vim --version | head -n1 && nvim --version | head -n1 && mise --version && python --version && node --version && echo 'OK'"]


