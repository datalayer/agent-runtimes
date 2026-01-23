SHELL=/bin/bash

.DEFAULT_GOAL := help

.PHONY: help agent agent-codemode clean-codemode

help:
	@echo "Targets:"
	@echo "  agent           Start the MCP agent CLI (stdio server)"
	@echo "  agent-codemode  Start the Agent Codemode agent CLI (stdio server)"
	@echo "  clean-codemode  Remove generated folder (two levels up)"

agent: # Usage: make agent [MODEL=<model>]
	python agent_cli.py $(if $(MODEL),--model $(MODEL),)

agent-codemode: # Usage: make agent-codemode [MODEL=<model>]
	python agent_cli.py --codemode $(if $(MODEL),--model $(MODEL),)

clean-codemode:
	rm -rf ../../generated
