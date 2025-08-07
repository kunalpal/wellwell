.PHONY: help init apply test-ubuntu

help:
	@echo "Targets:"
	@echo "  init           chezmoi init & apply from this repo"
	@echo "  apply          chezmoi apply"
	@echo "  test-ubuntu    Apply chezmoi state in Ubuntu container"
	@echo "  test-ubuntu    Apply chezmoi state in Ubuntu container"

init:
	chezmoi init --apply .

apply:
	chezmoi apply

test-ubuntu:
	docker build -f test/ubuntu.Dockerfile -t dotfiles-ubuntu .
	docker run --rm -it dotfiles-ubuntu




