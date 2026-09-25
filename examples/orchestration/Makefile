# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

SHELL=/bin/bash

.DEFAULT_GOAL := help

.PHONY: help run runtime

help:
	@echo "Targets:"
	@echo "  run       Delegate to an A2A worker and an ACP worker started here"
	@echo "  runtime   The same, against DATALAYER_A2A_ENDPOINT and DATALAYER_ACP_ENDPOINT"

run:
	python orchestrate.py

runtime:
	@if [[ -z "$$DATALAYER_A2A_ENDPOINT" || -z "$$DATALAYER_ACP_ENDPOINT" ]]; then \
		echo "Export DATALAYER_A2A_ENDPOINT and DATALAYER_ACP_ENDPOINT first."; \
		echo "See the 'Against a Datalayer runtime' section of README.md."; \
		exit 1; \
	fi
	python orchestrate.py \
		--a2a-endpoint "$$DATALAYER_A2A_ENDPOINT" \
		--acp-endpoint "$$DATALAYER_ACP_ENDPOINT"
