.PHONY: help bootstrap link packages dry-run test-ubuntu

help:
	@echo "Targets:"
	@echo "  bootstrap      Install packages and link dotfiles"
	@echo "  link           Link dotfiles only"
	@echo "  packages       Install packages only"
	@echo "  dry-run        Show linking plan"
	@echo "  test-ubuntu    Run bootstrap in Ubuntu container"
	@echo "  test-ubuntu    Run bootstrap in Ubuntu container"

bootstrap:
	./scripts/bootstrap.sh

link:
	./scripts/bootstrap.sh --link-only

packages:
	./scripts/bootstrap.sh --packages-only

dry-run:
	@echo "Plan to link files from home/ to $$HOME:" && \
	cd home && find . -type f -o -type l -o -type d | sed 's#^.#$(HOME)#'

test-ubuntu:
	docker build -f test/ubuntu.Dockerfile -t dotfiles-ubuntu .
	docker run --rm -it dotfiles-ubuntu




