# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Makefile for building the Agent Runtimes Docker images.
#
# Two images are produced from this folder:
#   - Dockerfile.agent-runtime -> headless agent runtime server (no web UI)
#   - Dockerfile.agent-node     -> local Agent Node with bundled web UI
#
# The build context for both images is the repository root (`..`).

SHELL = /bin/bash

.DEFAULT_GOAL := help

.PHONY: help \
	build build-agent-runtime build-agent-node \
	push push-agent-runtime push-agent-node \
	release release-agent-runtime release-agent-node

# ─── Image configuration ──────────────────────────────────────────────────
AGENT_RUNTIME_IMAGE ?= datalayer/agent-runtime
AGENT_NODE_IMAGE    ?= datalayer/agent-nodes
DOCKER_TAG          ?= latest
DOCKER_PLATFORM     ?=

# Build context is the repository root (one level up from this folder).
CONTEXT   := ..
PLATFORM_FLAG = $(if $(DOCKER_PLATFORM),--platform $(DOCKER_PLATFORM),)

help: ## show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-28s\033[0m %s\n", $$1, $$2}'

# ─── Build ────────────────────────────────────────────────────────────────
build: build-agent-runtime build-agent-node ## build both Docker images

build-agent-runtime: ## build the headless Agent Runtime image
	docker build $(PLATFORM_FLAG) -t $(AGENT_RUNTIME_IMAGE):$(DOCKER_TAG) -f Dockerfile.agent-runtime $(CONTEXT)

build-agent-node: ## build the Agent Node image (requires frontend `dist`)
	$(MAKE) -C .. node-agent-artifact-build
	docker build $(PLATFORM_FLAG) -t $(AGENT_NODE_IMAGE):$(DOCKER_TAG) -f Dockerfile.agent-node $(CONTEXT)

# ─── Push ─────────────────────────────────────────────────────────────────
push: push-agent-runtime push-agent-node ## push both Docker images

push-agent-runtime: ## push the Agent Runtime image
	docker push $(AGENT_RUNTIME_IMAGE):$(DOCKER_TAG)

push-agent-node: ## push the Agent Node image
	docker push $(AGENT_NODE_IMAGE):$(DOCKER_TAG)

# ─── Release (build + push) ───────────────────────────────────────────────
release: release-agent-runtime release-agent-node ## build and push both images

release-agent-runtime: build-agent-runtime push-agent-runtime ## build and push the Agent Runtime image

release-agent-node: build-agent-node push-agent-node ## build and push the Agent Node image
