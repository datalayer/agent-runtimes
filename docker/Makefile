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
	release release-agent-runtime release-agent-node \
	start start-local stop logs

# ─── Image configuration ──────────────────────────────────────────────────
AGENT_RUNTIME_IMAGE ?= datalayer/agent-runtime
AGENT_NODE_IMAGE    ?= datalayer/agent-node
DOCKER_TAG          ?= latest
DOCKER_PLATFORM     ?=
CONTAINER_NAME      ?= agent-node-example

# Build context is the repository root (one level up from this folder).
CONTEXT   := ..
PLATFORM_FLAG = $(if $(DOCKER_PLATFORM),--platform $(DOCKER_PLATFORM),)

# Host-local services mapping used by `start-local`.
HOST_GATEWAY_NAME   ?= host.docker.internal
HOST_GATEWAY_FLAG   ?= --add-host $(HOST_GATEWAY_NAME):host-gateway
LOCAL_IAM_URL       ?= http://$(HOST_GATEWAY_NAME):9700
LOCAL_RUNTIMES_URL  ?= http://$(HOST_GATEWAY_NAME):9500
LOCAL_SPACER_URL    ?= http://$(HOST_GATEWAY_NAME):9900
LOCAL_INFERENCE_URL ?= http://$(HOST_GATEWAY_NAME):4450

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

# ─── Run ──────────────────────────────────────────────────────────────────
start: ## start Agent Node container detached (default settings)
	@docker rm -f $(CONTAINER_NAME) >/dev/null 2>&1 || true
	docker run -d --name $(CONTAINER_NAME) -p 8765:8765 \
		-e AGENT_RUNTIMES_NODE=true \
		-e AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE=datalayer \
		$(AGENT_NODE_IMAGE):$(DOCKER_TAG)
	@echo ""
	@echo "Agent Node started. Connect at: http://localhost:8765"
	@echo "Stop with: make stop"
	@echo "Logs with: make logs"

start-local: ## start Agent Node wired to services running on local host
	@docker rm -f $(CONTAINER_NAME) >/dev/null 2>&1 || true
	docker run -d --name $(CONTAINER_NAME) -p 8765:8765 $(HOST_GATEWAY_FLAG) \
		-e AGENT_RUNTIMES_NODE=true \
		-e AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE=datalayer \
		-e DATALAYER_IAM_URL=$(LOCAL_IAM_URL) \
		-e DATALAYER_IAM_URL=$(LOCAL_IAM_URL) \
		-e DATALAYER_RUNTIMES_URL=$(LOCAL_RUNTIMES_URL) \
		-e DATALAYER_AGENT_RUNTIMES_URL=http://localhost:8765 \
		-e DATALAYER_SPACER_URL=$(LOCAL_SPACER_URL) \
		-e DATALAYER_AI_INFERENCE_URL=$(LOCAL_INFERENCE_URL) \
		$(AGENT_NODE_IMAGE):$(DOCKER_TAG)
	@echo ""
	@echo "Agent Node started with local-host services. Connect at: http://localhost:8765"
	@echo "Host services resolved as: $(HOST_GATEWAY_NAME)"
	@echo "Stop with: make stop"
	@echo "Logs with: make logs"

stop: ## stop and remove Agent Node container
	docker rm -f $(CONTAINER_NAME)

logs: ## tail Agent Node container logs
	docker logs -f $(CONTAINER_NAME)
