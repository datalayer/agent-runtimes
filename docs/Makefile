# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Copyright (c) Datalayer, Inc. https://datalayer.io
# Distributed under the terms of the MIT License.

SHELL=/bin/bash

.DEFAULT_GOAL := default

.SILENT: init install

.PHONY: build publish

help: ## display this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

default: help ## default target is help

clean: ## clear
	npm run clear

install: ## install
	npm install

start: ## start
	npm start

build: ## build
	npm run build

deploy: build ## deploy
	aws s3 rm \
		s3://datalayer-agent-runtimes/ \
		--recursive && \
	  aws s3 cp \
		./build \
		s3://datalayer-agent-runtimes/ \
		--recursive && \
	  aws cloudfront create-invalidation \
		--distribution-id E1QMGQ241PAS26 \
		--paths "/*"
	echo open ✨  https://agent-runtimes.datalayer.tech
