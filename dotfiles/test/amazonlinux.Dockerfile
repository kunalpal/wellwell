FROM amazonlinux:2023

RUN dnf -y update && dnf -y install git curl sudo shadow-utils ca-certificates && dnf clean all

# Create user
RUN useradd -ms /bin/bash dev && usermod -aG wheel dev && echo 'dev ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers
USER dev
WORKDIR /home/dev

# Copy repo
COPY --chown=dev:dev . /home/dev/dotfiles
WORKDIR /home/dev/dotfiles

RUN scripts/bootstrap.sh --packages-only && scripts/bootstrap.sh --link-only

CMD ["zsh", "-lc", "zsh --version && tmux -V && rg --version && fzf --version && vim --version | head -n1 && nvim --version | head -n1 && echo 'OK'"]


