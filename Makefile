# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

SHELL=/bin/bash

.DEFAULT_GOAL := default


.PHONY: \
	help default clean build test test-js test-py kill warning \
	publish-npm publish-pypi publish-conda pydoc typedoc docs \
	examples examples\:prod examples\:proxy examples-proxy agent agent-nodes agent-nodes\:proxy agent-nodes-proxy agent-notebook agent-lexical jupyter-server agent-serve \
	docker-build docker-push docker-release node-agent-artifact-build node-agents-docker-build agent-nodes-docker-build agent-nodes-docker-push agent-nodes-docker-run agent-nodes-docker-stop \
	agents list-specs specs specs-clone specs-generate specs-format \
	ag-chat ag-chat-simple ag-chat-data-acquisition ag-chat-financial ag-chat-demo ag-chat-demo-nocodemode

AGENTSPECS_REPO ?= https://github.com/datalayer/agentspecs.git
AGENTSPECS_DIR ?= agentspecs
AGENTSPECS_BRANCH ?= "feat/new"

AGENT_SERVE_ID ?= data-acquisition
AGENT_SERVE_NAME ?= dla-1
AGENT_SERVE_PROTOCOL ?= vercel-ai

DOCKER_IMAGE ?= datalayer/agent-nodes
DOCKER_TAG ?= latest
DOCKER_PLATFORM ?=

# ─── Examples URL configuration ───────────────────────────────────────────
# These variables mirror the env vars consumed by `datalayer-core`
# (see `datalayer_core/utils/urls.py`), so the Python agent-runtimes server
# and any code that uses `DatalayerURLs.from_environment(...)` pick them up
# automatically.
#
# `make examples`        → local-first dev mode (local agent-runtimes + local
#                          jupyter-server). No remote URLs are injected.
# `make examples:prod`   → explicit remote mode using DATALAYER_* defaults.
# `make examples:proxy`  → local Plane stack started via `plane local`. Ports
#                          match `services/plane/datalayer_plane/sbin/local.sh`.
#                          Override any individual URL on the command line.

# Production defaults (see DEFAULT_DATALAYER_* in datalayer_core/utils/urls.py).
DATALAYER_RUN_URL          ?= https://prod1.datalayer.run
DATALAYER_IAM_URL          ?= $(DATALAYER_RUN_URL)
DATALAYER_RUNTIMES_URL     ?= https://r1.datalayer.run
DATALAYER_AGENT_RUNTIMES_URL ?= $(DATALAYER_RUNTIMES_URL)
DATALAYER_SPACER_URL       ?= $(DATALAYER_RUN_URL)
DATALAYER_LIBRARY_URL      ?= $(DATALAYER_RUN_URL)
DATALAYER_MANAGER_URL      ?= $(DATALAYER_RUN_URL)
DATALAYER_AI_AGENTS_URL    ?= $(DATALAYER_RUN_URL)
DATALAYER_AI_INFERENCE_URL ?= $(DATALAYER_RUN_URL)
DATALAYER_MCP_SERVERS_URL  ?= $(DATALAYER_RUN_URL)
DATALAYER_OTEL_URL         ?= $(DATALAYER_RUN_URL)
DATALAYER_OTLP_URL         ?= $(DATALAYER_OTEL_URL)/api/otel/v1/otlp
DATALAYER_GROWTH_URL       ?= $(DATALAYER_RUN_URL)
DATALAYER_SUCCESS_URL      ?= $(DATALAYER_RUN_URL)
DATALAYER_STATUS_URL       ?= $(DATALAYER_RUN_URL)
DATALAYER_SUPPORT_URL      ?= $(DATALAYER_RUN_URL)

# Local Plane ports (see services/plane/datalayer_plane/sbin/local.sh).
PLANE_LOCAL_IAM_URL          ?= http://localhost:9700
PLANE_LOCAL_RUNTIMES_URL     ?= http://localhost:9500
# Agent APIs (/api/v1/agents) are served by the local agent-runtimes dev
# server started by `npm run examples`, not by Plane runtimes (9500).
PLANE_LOCAL_AGENT_RUNTIMES_URL ?= http://localhost:8765
PLANE_LOCAL_SPACER_URL       ?= http://localhost:9900
PLANE_LOCAL_LIBRARY_URL      ?= http://localhost:9800
PLANE_LOCAL_MANAGER_URL      ?= http://localhost:2100
PLANE_LOCAL_AI_AGENTS_URL    ?= http://localhost:4400
PLANE_LOCAL_AI_INFERENCE_URL ?= http://localhost:4450
PLANE_LOCAL_MCP_SERVERS_URL  ?= http://localhost:4111
PLANE_LOCAL_GROWTH_URL       ?= http://localhost:6660
PLANE_LOCAL_SUCCESS_URL      ?= http://localhost:3300
PLANE_LOCAL_STATUS_URL       ?= http://localhost:4785
PLANE_LOCAL_SUPPORT_URL      ?= http://localhost:2200
# Plane local has no single umbrella URL; we point RUN_URL at IAM by convention.
PLANE_LOCAL_RUN_URL          ?= $(PLANE_LOCAL_IAM_URL)
PLANE_LOCAL_OTEL_URL         ?= http://localhost:7800
# Local OTLP collector ingress exposed by `plane pf-local`.
PLANE_LOCAL_OTLP_URL         ?= http://localhost:4318
PLANE_LOCAL_JUPYTER_SERVER_URL ?= http://localhost:8686/api/jupyter-server

# Env var block exported to both Python (agent-runtimes server) and Vite UI.
EXAMPLES_PROD_ENV = \
	DATALAYER_RUN_URL=$(DATALAYER_RUN_URL) \
	DATALAYER_IAM_URL=$(DATALAYER_IAM_URL) \
	DATALAYER_RUNTIMES_URL=$(DATALAYER_RUNTIMES_URL) \
	DATALAYER_AGENT_RUNTIMES_URL=$(DATALAYER_AGENT_RUNTIMES_URL) \
	DATALAYER_SPACER_URL=$(DATALAYER_SPACER_URL) \
	DATALAYER_LIBRARY_URL=$(DATALAYER_LIBRARY_URL) \
	DATALAYER_MANAGER_URL=$(DATALAYER_MANAGER_URL) \
	DATALAYER_AI_AGENTS_URL=$(DATALAYER_AI_AGENTS_URL) \
	DATALAYER_AI_INFERENCE_URL=$(DATALAYER_AI_INFERENCE_URL) \
	DATALAYER_MCP_SERVERS_URL=$(DATALAYER_MCP_SERVERS_URL) \
	DATALAYER_OTEL_URL=$(DATALAYER_OTEL_URL) \
	DATALAYER_OTLP_URL=$(DATALAYER_OTLP_URL) \
	OTEL_EXPORTER_OTLP_ENDPOINT=$(DATALAYER_OTLP_URL) \
	DATALAYER_GROWTH_URL=$(DATALAYER_GROWTH_URL) \
	DATALAYER_SUCCESS_URL=$(DATALAYER_SUCCESS_URL) \
	DATALAYER_STATUS_URL=$(DATALAYER_STATUS_URL) \
	DATALAYER_SUPPORT_URL=$(DATALAYER_SUPPORT_URL) \
	VITE_DATALAYER_RUN_URL=$(DATALAYER_IAM_URL) \
	VITE_DATALAYER_RUNTIMES_URL=$(DATALAYER_RUNTIMES_URL) \
	VITE_DATALAYER_AI_INFERENCE_URL=$(DATALAYER_AI_INFERENCE_URL) \
	VITE_DATALAYER_AGENT_RUNTIMES_URL=$(DATALAYER_AGENT_RUNTIMES_URL) \
	VITE_BASE_URL=$(DATALAYER_AGENT_RUNTIMES_URL) \
	VITE_OTEL_BASE_URL=$(DATALAYER_OTEL_URL)

EXAMPLES_PROXY_ENV = \
	DATALAYER_RUN_URL=$(PLANE_LOCAL_RUN_URL) \
	DATALAYER_IAM_URL=$(PLANE_LOCAL_IAM_URL) \
	DATALAYER_RUNTIMES_URL=$(PLANE_LOCAL_RUNTIMES_URL) \
	DATALAYER_AGENT_RUNTIMES_URL=$(PLANE_LOCAL_AGENT_RUNTIMES_URL) \
	DATALAYER_SPACER_URL=$(PLANE_LOCAL_SPACER_URL) \
	DATALAYER_LIBRARY_URL=$(PLANE_LOCAL_LIBRARY_URL) \
	DATALAYER_MANAGER_URL=$(PLANE_LOCAL_MANAGER_URL) \
	DATALAYER_AI_AGENTS_URL=$(PLANE_LOCAL_AI_AGENTS_URL) \
	DATALAYER_AI_INFERENCE_URL=$(PLANE_LOCAL_AI_INFERENCE_URL) \
	DATALAYER_MCP_SERVERS_URL=$(PLANE_LOCAL_MCP_SERVERS_URL) \
	DATALAYER_OTEL_URL=$(PLANE_LOCAL_OTEL_URL) \
	DATALAYER_OTLP_URL=$(PLANE_LOCAL_OTLP_URL) \
	OTEL_EXPORTER_OTLP_ENDPOINT=$(PLANE_LOCAL_OTLP_URL) \
	DATALAYER_GROWTH_URL=$(PLANE_LOCAL_GROWTH_URL) \
	DATALAYER_SUCCESS_URL=$(PLANE_LOCAL_SUCCESS_URL) \
	DATALAYER_STATUS_URL=$(PLANE_LOCAL_STATUS_URL) \
	DATALAYER_SUPPORT_URL=$(PLANE_LOCAL_SUPPORT_URL) \
	VITE_DATALAYER_RUN_URL=$(PLANE_LOCAL_IAM_URL) \
	VITE_DATALAYER_RUNTIMES_URL=$(PLANE_LOCAL_RUNTIMES_URL) \
	VITE_DATALAYER_AI_INFERENCE_URL=$(PLANE_LOCAL_AI_INFERENCE_URL) \
	VITE_DATALAYER_AGENT_RUNTIMES_URL=$(PLANE_LOCAL_AGENT_RUNTIMES_URL) \
	VITE_JUPYTER_SERVER_URL=$(PLANE_LOCAL_JUPYTER_SERVER_URL) \
	VITE_BASE_URL=$(PLANE_LOCAL_AGENT_RUNTIMES_URL) \
	VITE_OTEL_BASE_URL=$(PLANE_LOCAL_OTEL_URL)

# Local-first defaults used by `make examples`.
# Keep agent routes pointed to the locally launched agent-runtimes server,
# regardless of any DATALAYER_* environment variables exported in the shell.
EXAMPLES_LOCAL_ENV = \
	VITE_DATALAYER_RUN_URL=https://prod1.datalayer.run \
	VITE_DATALAYER_RUNTIMES_URL=https://prod1.datalayer.run \
	DATALAYER_AGENT_RUNTIMES_URL=http://localhost:8765 \
	VITE_DATALAYER_AGENT_RUNTIMES_URL=http://localhost:8765 \
	VITE_BASE_URL=http://localhost:8765 \
	VITE_BASE_URL_NO_CODEMODE=http://localhost:8765 \
	VITE_BASE_URL_CODEMODE=http://localhost:8766

BEDROCK_ENV = \
	AWS_ACCESS_KEY_ID=${DATALAYER_BEDROCK_AWS_ACCESS_KEY_ID} \
	AWS_SECRET_ACCESS_KEY=${DATALAYER_BEDROCK_AWS_SECRET_ACCESS_KEY} \
	AWS_DEFAULT_REGION=${DATALAYER_BEDROCK_AWS_DEFAULT_REGION}

RUFF_TARGETS = \
	agent_runtimes/specs/agents/ \
	agent_runtimes/specs/teams/ \
	agent_runtimes/specs/skills.py \
	agent_runtimes/specs/tools.py \
	agent_runtimes/specs/frontend_tools.py \
	agent_runtimes/specs/envvars.py \
	agent_runtimes/specs/models.py \
	agent_runtimes/specs/memory.py \
	agent_runtimes/specs/guardrails.py \
	agent_runtimes/specs/benchmarks.py \
	agent_runtimes/specs/evals.py \
	agent_runtimes/specs/triggers.py \
	agent_runtimes/specs/outputs.py \
	agent_runtimes/specs/notifications.py \
	agent_runtimes/mcp/catalog_mcp_servers.py \
	agent_runtimes/mcp/__init__.py

# ─── Colored step banners ─────────────────────────────────────────────────
# Used by `make specs` (and related targets) to make each generation step
# visible in long logs.
CYAN   := \033[1;36m
GREEN  := \033[1;32m
YELLOW := \033[1;33m
BOLD   := \033[1m
RESET  := \033[0m

# Usage: $(call step,Title)
define step
	@printf '\n$(CYAN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)\n'
	@printf '$(CYAN)▶ $(BOLD)%s$(RESET)\n' "$(1)"
	@printf '$(CYAN)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$(RESET)\n'
endef

help: ## display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

default: help ## default target is help

clean: ## clean
	npm run clean

build: ## build
	npm run build

build-lib: ## build-lib
	npm run build:lib

test: test-js test-py ## run tests

test-js: ## run js tests
	npm test

test-py: ## run python tests
	python -m pytest

kill:
	npm run kill

warning:
	echo "\x1b[34m\x1b[43mEnsure you have run \x1b[1;37m\x1b[41m conda deactivate \x1b[22m\x1b[34m\x1b[43m before invoking this.\x1b[0m"

publish-npm: clean build-lib ## publish-npm
	npm publish
	echo open https://www.npmjs.com/package/@datalayer/agent-runtimes

publish-pypi: clean build # publish the pypi package
	git clean -fdx -e dist -e agent_runtimes/static/dist && \
		python -m build --outdir python-dist
	@exec echo
	@exec echo twine upload ./python-dist/*-py3-none-any.whl
	@exec echo
	@exec echo https://pypi.org/project/agent-runtimes/#history

publish-conda: # publish the conda package
	@exec echo
	cd ./conda-recipe; ./publish-conda.sh
	@exec echo
	@exec echo https://anaconda.org/datalayer/agent-runtimes
	@exec echo conda install datalayer::agent-runtimes

pydoc: # pydoc
	rm -fr docs/docs/python_api
	python -m pydoc_markdown.main
	echo -e "label: Python API\nposition: 4" > docs/docs/python_api/_category_.yml

typedoc: # typedoc
	npm run typedoc
	echo -e "label: TypeScript API\nposition: 5" > docs/docs/typescript_api/_category_.yml

docs: pydoc typedoc ## build the api docs and serve the docs
	cd docs && npm run start

examples: ## examples – local-first (local agent-runtimes + local jupyter-server)
	$(BEDROCK_ENV) \
	$(EXAMPLES_LOCAL_ENV) \
		npm run examples

examples\:prod: ## examples – dev server pointed at prod1.datalayer.run (and r1 for datalayer-runtimes)
	$(BEDROCK_ENV) \
	$(EXAMPLES_PROD_ENV) \
		npm run examples

examples\:proxy: ## examples – dev server pointed at a local `plane local` stack (override per-service URLs via PLANE_LOCAL_*_URL)
	$(BEDROCK_ENV) \
	$(EXAMPLES_PROXY_ENV) \
		npm run examples:codemode

examples-proxy: examples\:proxy ## alias for examples:proxy

agent: # agent - open agent.html with vite dev server
	$(BEDROCK_ENV) npm run start:agent

agent-nodes: ## agent-nodes – develop Agent Node UI + local server
	$(BEDROCK_ENV) \
	DATALAYER_AI_INFERENCE_URL=$(PLANE_LOCAL_AI_INFERENCE_URL) \
	VITE_DATALAYER_AI_INFERENCE_URL=$(PLANE_LOCAL_AI_INFERENCE_URL) \
	AGENT_RUNTIMES_NODE=true \
	AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE=$${AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE:-datalayer} \
		npm run start:agent-node

agent-nodes\:proxy: ## agent-nodes:proxy – Agent Node dev against local `plane local` services (PLANE_LOCAL_*_URL defaults)
	$(BEDROCK_ENV) \
	$(EXAMPLES_PROXY_ENV) \
	AGENT_RUNTIMES_NODE=true \
	AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE=$${AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE:-datalayer} \
		npm run start:agent-node

agent-nodes-proxy: agent-nodes\:proxy ## alias for agent-nodes:proxy

agent-notebook: # agent-notebook - open agent-notebook.html with vite dev server
	$(BEDROCK_ENV) npm run start:agent-notebook

agent-lexical: # agent-lexical - open agent-lexical.html with vite dev server
	$(BEDROCK_ENV) npm run start:agent-lexical

jupyter-server: # jupyter-server
	npm run jupyter:start

agent-serve: # agent-server
	@$(BEDROCK_ENV) agent-runtimes serve \
	  --agent-id $(AGENT_SERVE_ID) \
	  --agent-name $(AGENT_SERVE_NAME) \
	  --protocol $(AGENT_SERVE_PROTOCOL) \
	  --mcp-servers tavily \
	  --codemode \
	  --skills github,pdf \
	  --no-config-mcp-servers \
	  --host 0.0.0.0 \
	  --port 8765 \
	  --debug

docker-build: ## build Docker image (override DOCKER_IMAGE/DOCKER_TAG/DOCKER_PLATFORM)
	docker build $(if $(DOCKER_PLATFORM),--platform $(DOCKER_PLATFORM),) -t $(DOCKER_IMAGE):$(DOCKER_TAG) -f docker/Dockerfile .

docker-push: ## push Docker image
	docker push $(DOCKER_IMAGE):$(DOCKER_TAG)

docker-release: docker-build docker-push ## build and push Docker image

node-agent-artifact-build: ## build frontend artifacts for agent-node Docker image
	VITE_APP_TARGET=agent-node $(MAKE) build

node-agents-docker-build: node-agent-artifact-build docker-build ## build node-agents Docker image from prebuilt artifacts

agent-nodes-docker-build: node-agents-docker-build ## alias for node-agents-docker-build

agent-nodes-docker-push: docker-push ## push Agent Nodes Docker image (defaults: DOCKER_IMAGE=datalayer/agent-nodes, DOCKER_TAG=latest)

agent-nodes-docker-run: ## run Agent Node Docker container detached (auto-removed on stop); name=agent-nodes-example
	@docker rm -f agent-nodes-example >/dev/null 2>&1 || true
	docker run -d --rm --name agent-nodes-example -p 8765:8765 -e AGENT_RUNTIMES_NODE=true $(DOCKER_IMAGE):$(DOCKER_TAG)
	@echo ""
	@echo "Agent Node started. Connect at: http://localhost:8765"
	@echo "Stop with: make agent-nodes-docker-stop"

agent-nodes-docker-stop: ## stop and delete the agent-nodes-example Docker container
	docker rm -f agent-nodes-example

agents: # agents
	agent-runtimes list-agents \
	  --host 0.0.0.0 \
	  --port 8765

ag-chat: # ag-chat
	@$(BEDROCK_ENV) \
		ag chat --eggs

ag-chat-simple: # ag-chat-simple
	@$(BEDROCK_ENV) \
		ag chat --eggs --agentspec-id demo-simple

ag-chat-data-acquisition: # ag-chat-data-acquisition KAGGLE_TOKEN and TAVILY_API_KEY must be set in env
	@$(BEDROCK_ENV) \
		ag chat --eggs --agentspec-id data-acquisition

ag-chat-financial: # ag-chat-financial ALPHA_VANTAGE_API_KEY must be set in env
	@$(BEDROCK_ENV) \
		ag chat --eggs --agentspec-id financial

ag-chat-demo: # ag-chat-demo
	@$(BEDROCK_ENV) \
	GOOGLE_OAUTH_CLIENT_ID=${OPENTEAMS_DEMO_GOOGLE_CLIENT_ID} \
	GOOGLE_OAUTH_CLIENT_SECRET=${OPENTEAMS_DEMO_GOOGLE_CLIENT_SECRET} \
		ag chat \
		  --eggs \
		  --suggestions "List files located in the sales-data folder of my Google Drive account (eric@datalayer.io),Aggregate all CSV files located in the sales-data folder of my Google Drive account (eric@datalayer.io) into a single file named sales_21-25.csv and save this aggregated file in the sales-data directory of the echarles/openteams-codemode-demo repository." \
		  --agentspec-id information-routing

ag-chat-demo-nocodemode: # ag-chat-demo-nocodemode
	@$(BEDROCK_ENV) \
	GOOGLE_OAUTH_CLIENT_ID=${OPENTEAMS_DEMO_GOOGLE_CLIENT_ID} \
	GOOGLE_OAUTH_CLIENT_SECRET=${OPENTEAMS_DEMO_GOOGLE_CLIENT_SECRET} \
		ag chat \
		--eggs \
		--agentspec-id information-routing \
		--suggestions "List files located in the sales-data folder of my Google Drive account (eric@datalayer.io),Aggregate all CSV files located in the sales-data folder of my Google Drive account (eric@datalayer.io) into a single file named sales_21-25.csv and save this aggregated file in the sales-data directory of the echarles/openteams-codemode-demo repository." \
		--no-codemode

list-specs: # list specs
	agent-runtimes list-specs

specs: specs-clone specs-generate specs-format ## generate Python and TypeScript code from YAML specifications (agents, teams, MCP servers, skills, envvars)

specs-clone: ## clone/update agentspecs repository
	$(call step,Cloning agentspecs repository ($(AGENTSPECS_BRANCH)))
	@if [ ! -d "$(AGENTSPECS_DIR)" ]; then \
		git clone $(AGENTSPECS_REPO) $(AGENTSPECS_DIR); \
	else \
		cd $(AGENTSPECS_DIR) && git fetch origin; \
	fi
	@cd $(AGENTSPECS_DIR) && git checkout $(AGENTSPECS_BRANCH)

specs-generate: ## generate all Python and TypeScript specs from YAML
	$(call step,Generating agent specifications)
	python scripts/codegen/generate_agents.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/agents \
	  --python-output agent_runtimes/specs/agents.py \
	  --typescript-output src/specs/agents.ts \
	  --subfolder-structure
	$(call step,Generating team specifications)
	python scripts/codegen/generate_teams.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/teams \
	  --python-output agent_runtimes/specs/teams.py \
	  --typescript-output src/specs/teams.ts \
	  --subfolder-structure
	$(call step,Generating MCP server specifications)
	python scripts/codegen/generate_mcp_servers.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/mcp-servers \
	  --python-output agent_runtimes/mcp/catalog_mcp_servers.py \
	  --typescript-output src/specs/mcpServers.ts
	$(call step,Generating skill specifications)
	python scripts/codegen/generate_skills.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/skills \
	  --python-output agent_runtimes/specs/skills.py \
	  --typescript-output src/specs/skills.ts
	$(call step,Generating tool specifications)
	python scripts/codegen/generate_tools.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/tools \
	  --python-output agent_runtimes/specs/tools.py \
	  --typescript-output src/specs/tools.ts
	$(call step,Generating frontend tool specifications)
	python scripts/codegen/generate_frontend_tools.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/frontend-tools \
	  --python-output agent_runtimes/specs/frontend_tools.py \
	  --typescript-output src/specs/frontendTools.ts
	$(call step,Generating environment variable specifications)
	python scripts/codegen/generate_envvars.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/envvars \
	  --python-output agent_runtimes/specs/envvars.py \
	  --typescript-output src/specs/envvars.ts
	$(call step,Generating AI model specifications)
	python scripts/codegen/generate_models.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/models \
	  --python-output agent_runtimes/specs/models.py \
	  --typescript-output src/specs/models.ts
	$(call step,Generating memory specifications)
	python scripts/codegen/generate_memory.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/memory \
	  --python-output agent_runtimes/specs/memory.py \
	  --typescript-output src/specs/memory.ts
	$(call step,Generating guardrail specifications)
	python scripts/codegen/generate_guardrails.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/guardrails \
	  --python-output agent_runtimes/specs/guardrails.py \
	  --typescript-output src/specs/guardrails.ts
	$(call step,Generating eval specifications)
	python scripts/codegen/generate_evals.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/evals \
	  --python-output agent_runtimes/specs/evals.py \
	  --typescript-output src/specs/evals.ts
	$(call step,Generating benchmark specifications)
	python scripts/codegen/generate_benchmarks.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/benchmarks \
	  --eval-specs-dir $(AGENTSPECS_DIR)/agentspecs/evals \
	  --python-output agent_runtimes/specs/benchmarks.py \
	  --typescript-output src/specs/benchmarks.ts
	$(call step,Generating event specifications)
	python scripts/codegen/generate_events.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/events \
	  --python-output agent_runtimes/specs/events.py \
	  --typescript-output src/specs/events.ts
	$(call step,Generating trigger specifications)
	python scripts/codegen/generate_triggers.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/triggers \
	  --python-output agent_runtimes/specs/triggers.py \
	  --typescript-output src/specs/triggers.ts
	$(call step,Generating output specifications)
	python scripts/codegen/generate_outputs.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/outputs \
	  --python-output agent_runtimes/specs/outputs.py \
	  --typescript-output src/specs/outputs.ts
	$(call step,Generating notification specifications)
	python scripts/codegen/generate_notifications.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/notifications \
	  --python-output agent_runtimes/specs/notifications.py \
	  --typescript-output src/specs/notifications.ts
	$(call step,Generating persona specifications)
	@if [ -d "$(AGENTSPECS_DIR)/agentspecs/personas" ]; then \
	  python scripts/codegen/generate_personas.py \
	    --specs-dir $(AGENTSPECS_DIR)/agentspecs/personas \
	    --python-output agent_runtimes/specs/personas.py \
	    --typescript-output src/specs/personas.ts; \
	else \
	  echo "Skipping persona specifications: $(AGENTSPECS_DIR)/agentspecs/personas not found"; \
	fi
	$(call step,Post-processing generated Python with ruff)
	ruff check --select I --fix $(RUFF_TARGETS)
	ruff format $(RUFF_TARGETS)
	$(call step,Validating generated Python syntax)
	python -m compileall -q agent_runtimes/specs agent_runtimes/mcp
	@printf '\n$(GREEN)✓ All specifications generated successfully$(RESET)\n'

specs-format: ## format generated specs and refresh MCP catalogs
	$(call step,Formatting generated Python with ruff)
	ruff check --select I --fix $(RUFF_TARGETS)
	ruff format $(RUFF_TARGETS)
	$(call step,Formatting generated TypeScript with prettier)
	npm run format
	$(call step,Refreshing MCP catalog)
	agent-runtimes mcp-servers-catalog
	$(call step,Refreshing MCP config servers)
	agent-runtimes mcp-servers-config
