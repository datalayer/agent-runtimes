# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

SHELL=/bin/bash

.DEFAULT_GOAL := default

.PHONY: docs examples specs

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

start:
	./dev/sh/start-jupyter-server.sh

kill:
	./dev/sh/kill.sh

warning:
	echo "\x1b[34m\x1b[43mEnsure you have run \x1b[1;37m\x1b[41m conda deactivate \x1b[22m\x1b[34m\x1b[43m before invoking this.\x1b[0m"

publish-npm: clean build ## publish-npm
	npm publish
	echo open https://www.npmjs.com/package/@datalayer/agent-runtimes

publish-pypi: # publish the pypi package
	git clean -fdx && \
		python -m build
	@exec echo
	@exec echo twine upload ./dist/*-py3-none-any.whl
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
	AWS_ACCESS_KEY_ID=${DATALAYER_BEDROCK_AWS_ACCESS_KEY_ID} \
	AWS_SECRET_ACCESS_KEY=${DATALAYER_BEDROCK_AWS_SECRET_ACCESS_KEY} \
	AWS_DEFAULT_REGION=${DATALAYER_BEDROCK_AWS_DEFAULT_REGION} \
	  npm run examples

jupyter-server: # jupyter-server
	npm run jupyter:start

agent-serve: # agent-server
	@AWS_ACCESS_KEY_ID=${DATALAYER_BEDROCK_AWS_ACCESS_KEY_ID} \
	AWS_SECRET_ACCESS_KEY=${DATALAYER_BEDROCK_AWS_SECRET_ACCESS_KEY} \
	AWS_DEFAULT_REGION=${DATALAYER_BEDROCK_AWS_DEFAULT_REGION} \
	agent-runtimes serve \
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

specs: ## generate Python and TypeScript code from YAML specifications (agents, MCP servers, skills, envvars)
	@echo "Cloning agentspecs repository..."
	@if [ ! -d "agentspecs" ]; then \
		git clone https://github.com/datalayer/agentspecs.git agentspecs; \
	else \
		cd agentspecs && git pull origin main; \
	fi
	@echo "Generating agent specifications..."
	python scripts/codegen/generate_agents.py \
	  --specs-dir agentspecs/agentspecs/agents \
	  --python-output agent_runtimes/config/agents.py \
	  --typescript-output src/config/agents.ts \
	  --subfolder-structure
	@echo "Generating MCP server specifications..."
	python scripts/codegen/generate_mcp_servers.py \
	  --specs-dir agentspecs/agentspecs/mcp-servers \
	  --python-output agent_runtimes/mcp/catalog_mcp_servers.py \
	  --typescript-output src/config/mcpServers.ts
	@echo "Generating skill specifications..."
	python scripts/codegen/generate_skills.py \
	  --specs-dir agentspecs/agentspecs/skills \
	  --python-output agent_runtimes/config/skills.py \
	  --typescript-output src/config/skills.ts
	@echo "Generating environment variable specifications..."
	python scripts/codegen/generate_envvars.py \
	  --specs-dir agentspecs/agentspecs/envvars \
	  --python-output agent_runtimes/config/envvars.py \
	  --typescript-output src/config/envvars.ts
	@echo "✓ All specifications generated successfully"
	@echo "Formatting generated files with ruff..."
	ruff check --select I --fix agent_runtimes/config/agents/ agent_runtimes/config/skills.py agent_runtimes/config/envvars.py agent_runtimes/config/__init__.py agent_runtimes/mcp/catalog_mcp_servers.py agent_runtimes/mcp/__init__.py
	ruff format agent_runtimes/config/agents/ agent_runtimes/config/skills.py agent_runtimes/config/envvars.py agent_runtimes/config/__init__.py agent_runtimes/mcp/catalog_mcp_servers.py agent_runtimes/mcp/__init__.py
	@echo "Formatting generated files with prettier..."
	npm run format
	agent-runtimes mcp-servers-catalog
	agent-runtimes mcp-servers-config

# Legacy alias for backwards compatibility
agentspecs-generate: specs
