# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

SHELL=/bin/bash

.DEFAULT_GOAL := default

.PHONY: \
	help default clean build test test-js test-py start kill warning \
	publish-npm publish-pypi publish-conda pydoc typedoc docs \
	examples agent agent-notebook agent-lexical jupyter-server agent-serve \
	agents list-specs specs specs-clone specs-generate specs-format

AGENTSPECS_REPO ?= https://github.com/datalayer/agentspecs.git
AGENTSPECS_DIR ?= agentspecs
AGENTSPECS_REF ?= 63ebae65a79600d4c615959d8fb520c0a7e46d06

BEDROCK_ENV = \
	AWS_ACCESS_KEY_ID=${DATALAYER_BEDROCK_AWS_ACCESS_KEY_ID} \
	AWS_SECRET_ACCESS_KEY=${DATALAYER_BEDROCK_AWS_SECRET_ACCESS_KEY} \
	AWS_DEFAULT_REGION=${DATALAYER_BEDROCK_AWS_DEFAULT_REGION}

RUFF_TARGETS = \
	agent_runtimes/specs/agents/ \
	agent_runtimes/specs/teams/ \
	agent_runtimes/specs/skills.py \
	agent_runtimes/specs/envvars.py \
	agent_runtimes/specs/models.py \
	agent_runtimes/specs/memory.py \
	agent_runtimes/specs/guardrails.py \
	agent_runtimes/specs/evals.py \
	agent_runtimes/specs/triggers.py \
	agent_runtimes/specs/outputs.py \
	agent_runtimes/specs/notifications.py \
	agent_runtimes/mcp/catalog_mcp_servers.py \
	agent_runtimes/mcp/__init__.py

help: ## display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

default: help ## default target is help

clean: ## clean
	npm run clean

build: ## build
	npm run build

test: test-js test-py ## run tests

test-js: ## run js tests
	npm test

test-py: ## run python tests
	python -m pytest

start: examples

kill:
	./dev/sh/kill.sh

warning:
	echo "\x1b[34m\x1b[43mEnsure you have run \x1b[1;37m\x1b[41m conda deactivate \x1b[22m\x1b[34m\x1b[43m before invoking this.\x1b[0m"

publish-npm: clean build ## publish-npm
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

examples: # examples
	$(BEDROCK_ENV) npm run examples

agent: # agent - open agent.html with vite dev server
	$(BEDROCK_ENV) npm run start:agent

agent-notebook: # agent-notebook - open agent-notebook.html with vite dev server
	$(BEDROCK_ENV) npm run start:agent-notebook

agent-lexical: # agent-lexical - open agent-lexical.html with vite dev server
	$(BEDROCK_ENV) npm run start:agent-lexical

jupyter-server: # jupyter-server
	npm run jupyter:start

agent-serve: # agent-server
	@$(BEDROCK_ENV) agent-runtimes serve \
	  --agent-id data-acquisition \
	  --agent-name dla-1 \
	  --protocol ag-ui \
	  --mcp-servers tavily \
	  --codemode \
	  --skills github,pdf \
	  --no-config-mcp-servers \
	  --host 0.0.0.0 \
	  --port 8765 \
	  --debug

agents: # agents
	agent-runtimes list-agents \
	  --host 0.0.0.0 \
	  --port 8765

list-specs: # list specs
	agent-runtimes list-specs

specs: specs-clone specs-generate specs-format ## generate Python and TypeScript code from YAML specifications (agents, teams, MCP servers, skills, envvars)

specs-clone: ## clone/update pinned agentspecs repository
	@echo "Cloning agentspecs repository..."
	@if [ ! -d "$(AGENTSPECS_DIR)" ]; then \
		git clone $(AGENTSPECS_REPO) $(AGENTSPECS_DIR); \
	else \
		cd $(AGENTSPECS_DIR) && git fetch origin; \
	fi
	@cd $(AGENTSPECS_DIR) && git checkout $(AGENTSPECS_REF)

specs-generate: ## generate all Python and TypeScript specs from YAML
	@echo "Generating agent specifications..."
	python scripts/codegen/generate_agents.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/agents \
	  --python-output agent_runtimes/specs/agents.py \
	  --typescript-output src/specs/agents.ts \
	  --subfolder-structure
	@echo "Generating team specifications..."
	python scripts/codegen/generate_teams.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/teams \
	  --python-output agent_runtimes/specs/teams.py \
	  --typescript-output src/specs/teams.ts \
	  --subfolder-structure
	@echo "Generating MCP server specifications..."
	python scripts/codegen/generate_mcp_servers.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/mcp-servers \
	  --python-output agent_runtimes/mcp/catalog_mcp_servers.py \
	  --typescript-output src/specs/mcpServers.ts
	@echo "Generating skill specifications..."
	python scripts/codegen/generate_skills.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/skills \
	  --python-output agent_runtimes/specs/skills.py \
	  --typescript-output src/specs/skills.ts
	@echo "Generating environment variable specifications..."
	python scripts/codegen/generate_envvars.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/envvars \
	  --python-output agent_runtimes/specs/envvars.py \
	  --typescript-output src/specs/envvars.ts
	@echo "Generating AI model specifications..."
	python scripts/codegen/generate_models.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/models \
	  --python-output agent_runtimes/specs/models.py \
	  --typescript-output src/specs/models.ts
	@echo "Generating memory specifications..."
	python scripts/codegen/generate_memory.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/memory \
	  --python-output agent_runtimes/specs/memory.py \
	  --typescript-output src/specs/memory.ts
	@echo "Generating guardrail specifications..."
	python scripts/codegen/generate_guardrails.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/guardrails \
	  --python-output agent_runtimes/specs/guardrails.py \
	  --typescript-output src/specs/guardrails.ts
	@echo "Generating eval specifications..."
	python scripts/codegen/generate_evals.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/evals \
	  --python-output agent_runtimes/specs/evals.py \
	  --typescript-output src/specs/evals.ts
	@echo "Generating trigger specifications..."
	python scripts/codegen/generate_triggers.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/triggers \
	  --python-output agent_runtimes/specs/triggers.py \
	  --typescript-output src/specs/triggers.ts
	@echo "Generating output specifications..."
	python scripts/codegen/generate_outputs.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/outputs \
	  --python-output agent_runtimes/specs/outputs.py \
	  --typescript-output src/specs/outputs.ts
	@echo "Generating notification specifications..."
	python scripts/codegen/generate_notifications.py \
	  --specs-dir $(AGENTSPECS_DIR)/agentspecs/notifications \
	  --python-output agent_runtimes/specs/notifications.py \
	  --typescript-output src/specs/notifications.ts
	@echo "✓ All specifications generated successfully"

specs-format: ## format generated specs and refresh MCP catalogs
	@echo "Formatting generated files with ruff..."
	ruff check --select I --fix $(RUFF_TARGETS)
	ruff format $(RUFF_TARGETS)
	@echo "Formatting generated files with prettier..."
	npm run format
	agent-runtimes mcp-servers-catalog
	agent-runtimes mcp-servers-config
