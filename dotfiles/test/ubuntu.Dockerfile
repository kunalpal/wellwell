FROM ubuntu:22.04

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update -y && apt-get install -y git curl sudo ca-certificates && rm -rf /var/lib/apt/lists/*

# Create user
RUN useradd -ms /bin/bash dev && usermod -aG sudo dev && echo 'dev ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers
USER dev
WORKDIR /home/dev

# Copy repo
COPY --chown=dev:dev . /home/dev/dotfiles
WORKDIR /home/dev/dotfiles

RUN scripts/bootstrap.sh --packages-only && scripts/bootstrap.sh --link-only

CMD ["zsh", "-lc", "zsh --version && tmux -V && rg --version && fzf --version && vim --version | head -n1 && nvim --version | head -n1 && echo 'OK'"]


