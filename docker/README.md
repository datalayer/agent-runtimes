<!--
  ~ Copyright (c) 2025-2026 Datalayer, Inc.
  ~
  ~ BSD 3-Clause License
-->

[![Datalayer](https://images.datalayer.io/legacy/datalayer-25.svg)](https://datalayer.ai)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# Docker for Agent Runtimes

This folder contains Docker assets for Agent Runtimes. Five images are produced:

| Dockerfile                 | Image (default)           | Purpose                                                                        |
| -------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| `Dockerfile.agent-runtime` | `datalayer/agent-runtime` | Headless agent runtime server hosting AI agents over the supported protocols.  |
| `Dockerfile.agent-node`    | `datalayer/agent-nodes`   | Local Agent Node that syncs with the Datalayer platform and serves its web UI. |
| `Dockerfile.agentcore`     | `datalayer/agent-runtimes-agentcore` (Amazon ECR) | agent-runtimes from PyPI answering the Amazon Bedrock AgentCore Runtime contract, for linux/arm64 and linux/amd64; built and pushed by `.github/workflows/agentcore-image.yml` (see `aws/README.md`). |
| `Dockerfile.kagent`        | `datalayer/agent-runtimes-kagent` | agent-runtimes from PyPI as a [kagent](https://kagent.dev) 1.0 BYO Harness: the kagent bridge (A2A v1 gRPC on 80, `/readyz` on 8081, kagent's task store) in its own environment, forwarding to `agent-runtimes serve --target kagent`. Build with `--build-arg AGENT_RUNTIMES_VERSION=<a release with the kagent target>`; see `deploy/kagent/README.md`. |
| `Dockerfile.ate`           | `datalayer/agent-runtimes-ate` | agent-runtimes from PyPI as an [Agent Substrate](https://ate.dev) actor (`serve --target ate`, port 80), lean (no Node.js, no Chromium) so a suspended actor restores fast. `--build-arg AGENT_RUNTIMES_VERSION` defaults to 1.6.36; templates take it by digest. See the Agent Substrate docs page. |

- Build context for both images: repository root (`..`).
- The Agent Node image bundles the frontend `dist`, so it must be built first
  (this is done automatically by the Makefile via `node-agent-artifact-build`).
  The Agent Runtime image is headless and does not need the frontend.

## Using the docker/Makefile

A `Makefile` in this folder wraps the common build/push flows. Run targets from
this `docker/` directory:

```bash
# Show available targets
make help

# Build both images
make build DOCKER_TAG=dev

# Build a single image
make build-agent-runtime DOCKER_TAG=dev
make build-agent-node DOCKER_TAG=dev

# Push
make push DOCKER_TAG=dev
make push-agent-runtime DOCKER_TAG=dev
make push-agent-node DOCKER_TAG=dev

# Build and push in one step
make release DOCKER_TAG=dev
make release-agent-runtime DOCKER_TAG=dev
make release-agent-node DOCKER_TAG=dev
```

Override image names, tag, or platform on the command line:

```bash
make build-agent-node AGENT_NODE_IMAGE=my-registry/agent-nodes DOCKER_TAG=dev
make build-agent-runtime AGENT_RUNTIME_IMAGE=my-registry/agent-runtime DOCKER_TAG=dev
make build DOCKER_PLATFORM=linux/amd64 DOCKER_TAG=dev
```

## Using the root Makefile

The repository root `Makefile` also exposes Docker targets:

```bash
# Agent Node (builds frontend artifacts first)
make node-agents-docker-build DOCKER_TAG=dev   # alias: make agent-nodes-docker-build
make agent-nodes-docker-push DOCKER_TAG=dev

# Agent Runtime (headless)
make agent-runtime-docker-build DOCKER_TAG=dev
make agent-runtime-docker-push DOCKER_TAG=dev
make agent-runtime-docker-release DOCKER_TAG=dev
```

`DOCKER_IMAGE` defaults to `datalayer/agent-nodes` and `AGENT_RUNTIME_IMAGE`
defaults to `datalayer/agent-runtime`; both can be overridden.

## Running containers locally

Agent Node (exposes the UI/server supporting all modes):

```bash
docker run --rm -p 8765:8765 -e AGENT_RUNTIMES_NODE=true datalayer/agent-nodes:dev
```

Agent Runtime (headless server):

```bash
docker run --rm -p 8765:8765 datalayer/agent-runtime:dev
```
