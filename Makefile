SHELL := /bin/bash
.DEFAULT_GOAL := help

PROD_IMAGE := psyb0t/reverse-engineer-anything
TOOLS_IMAGE := psyb0t/reverse-engineer-anything-tools
DEV_IMAGE := psyb0t/reverse-engineer-anything-dev
TEST_IMAGE := reverse-engineer-anything:test
VERSION := $(shell cat VERSION)
TAG := v$(VERSION)
UID := $(shell id -u)
GID := $(shell id -g)

# Every language command runs in a container: the host needs only Docker,
# Make, Git and a shell. HOME=/tmp keeps pnpm's state out of the workspace.
TOOLS_RUN := docker run --rm --init --user $(UID):$(GID) -e HOME=/tmp \
	-v $(CURDIR):/work -w /work $(TOOLS_IMAGE)
DEV_RUN := docker run --rm --init --user $(UID):$(GID) -e HOME=/tmp \
	-v $(CURDIR):/work -w /work $(DEV_IMAGE)

.PHONY: help tools-image dev-image shell pkg-lock pkg-add pkg-update pkg-upgrade pkg-remove audit \
	format lint lint-fix test test-unit test-integration fixtures build build-test run version clean

help: ## List supported operations
	@awk 'BEGIN {FS = ":.*## "}; /^[a-zA-Z0-9_.-]+:.*## / {printf "%-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

tools-image: ## Build the Node + pnpm image used to manage dependencies
	docker build -f Dockerfile.dev --target tools -t $(TOOLS_IMAGE) .

dev-image: ## Build the development image with the locked dependencies
	docker build -f Dockerfile.dev --target dev -t $(DEV_IMAGE) .

shell: dev-image ## Open a shell in the development image
	docker run --rm -it --init --user $(UID):$(GID) -e HOME=/tmp -v $(CURDIR):/work -w /work $(DEV_IMAGE) bash

pkg-lock: tools-image ## Regenerate pnpm-lock.yaml under the existing release-age cutoff
	$(TOOLS_RUN) bash scripts/pkg.sh lock

pkg-add: tools-image ## Add a dependency: make pkg-add PKG=name[@X.Y.Z] (moves the cutoff to 7 days ago)
	$(TOOLS_RUN) bash scripts/pkg.sh add "$(PKG)"

pkg-update: tools-image ## Update one dependency: make pkg-update PKG=name (moves the cutoff)
	$(TOOLS_RUN) bash scripts/pkg.sh update "$(PKG)"

pkg-upgrade: tools-image ## Upgrade every dependency to its newest release at least 7 days old
	$(TOOLS_RUN) bash scripts/pkg.sh upgrade

pkg-remove: tools-image ## Remove a dependency: make pkg-remove PKG=name
	$(TOOLS_RUN) bash scripts/pkg.sh remove "$(PKG)"

audit: tools-image ## Check production dependencies against the advisory database
	$(TOOLS_RUN) bash scripts/pkg.sh audit

format: dev-image ## Format the source
	$(DEV_RUN) pnpm format

lint: dev-image ## Type-check, lint and check formatting, plus shellcheck and hadolint
	$(DEV_RUN) pnpm lint
	docker run --rm -v $(CURDIR):/mnt:ro -w /mnt koalaman/shellcheck:v0.11.0@sha256:61862eba1fcf09a484ebcc6feea46f1782532571a34ed51fedf90dd25f925a8d \
		scripts/pkg.sh scripts/set-version.sh docker/entrypoint.sh docker/apktool tests/integration/run.sh \
		.agents/skills/reverse-engineer-anything/scripts/rea.sh
	docker run --rm -i hadolint/hadolint:v2.14.0@sha256:27086352fd5e1907ea2b934eb1023f217c5ae087992eb59fde121dce9c9ff21e \
		hadolint --ignore DL3008 - < Dockerfile
	docker run --rm -i hadolint/hadolint:v2.14.0@sha256:27086352fd5e1907ea2b934eb1023f217c5ae087992eb59fde121dce9c9ff21e \
		hadolint --ignore DL3008 - < Dockerfile.dev

lint-fix: format ## Apply formatter fixes, then lint
	@$(MAKE) lint

test: test-unit test-integration ## Run the complete test suite

test-unit: dev-image ## Test the bridge against a stand-in MCP server
	$(DEV_RUN) pnpm test:unit

fixtures: dev-image ## Download the pinned test APK into tests/.fixtures
	$(DEV_RUN) node scripts/fetch-fixtures.ts

test-integration: build-test fixtures dev-image ## Test the real image: CLI, stdio MCP, the bridge, APK analysis and REA_INSTALL=ghidra
	TEST_IMAGE=$(TEST_IMAGE) DEV_IMAGE=$(DEV_IMAGE) bash tests/integration/run.sh

build: ## Build the production image
	docker build -t $(PROD_IMAGE):$(TAG) -t $(PROD_IMAGE):latest .

build-test: ## Build the image under test
	docker build -t $(TEST_IMAGE) .

run: build ## Run the bridge on 127.0.0.1:8080 (needs REA_BRIDGE_TOKEN in the environment)
	@test -n "$$REA_BRIDGE_TOKEN" || { echo "set REA_BRIDGE_TOKEN (openssl rand -hex 32)" >&2; exit 2; }
	docker run --rm --init -e REA_BRIDGE_TOKEN -p 127.0.0.1:8080:8080 \
		--read-only --tmpfs /tmp:rw,nosuid,size=4g --tmpfs /home/rea:rw,nosuid,size=256m \
		--cap-drop ALL --security-opt no-new-privileges \
		-v $(CURDIR)/tests/.fixtures:/work:ro $(PROD_IMAGE):latest

version: ## Print the version, or set it everywhere with V=X.Y.Z
ifeq ($(strip $(V)),)
	@echo $(TAG)
else
	@V="$(V)" bash scripts/set-version.sh
endif

clean: ## Remove the test image, the cached test Ghidra volume and downloaded fixtures
	docker image rm $(TEST_IMAGE) 2>/dev/null || true
	docker volume rm rea-integration-tools 2>/dev/null || true
	rm -rf tests/.fixtures
