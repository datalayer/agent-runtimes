# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) Datalayer, Inc. https://datalayer.io
# Distributed under the terms of the MIT License.

SHELL=/bin/bash

.DEFAULT_GOAL := default

.PHONY: docs

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

pydoc:
	rm -fr docs/docs/python_api
	python -m pydoc_markdown.main
	echo -e "label: Python API\nposition: 4" > docs/docs/python_api/_category_.yml

typedoc:
	npm run typedoc
	echo -e "label: TypeScript API\nposition: 5" > docs/docs/typescript_api/_category_.yml

docs: pydoc typedoc ## build the api docs and serve the docs
	cd docs && npm run start
