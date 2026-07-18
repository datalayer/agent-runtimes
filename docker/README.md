<!--
  ~ Copyright (c) 2025-2026 Datalayer, Inc.
  ~
  ~ BSD 3-Clause License
-->

[![Datalayer](https://assets.datalayer.tech/datalayer-25.svg)](https://datalayer.io)

[![Become a Sponsor](https://img.shields.io/static/v1?label=Become%20a%20Sponsor&message=%E2%9D%A4&logo=GitHub&style=flat&color=1ABC9C)](https://github.com/sponsors/datalayer)

# Docker for Agent Runtimes

This folder contains Docker assets for Agent Runtimes. Two images are produced:

| Dockerfile                 | Image (default)           | Purpose                                                                        |
| -------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| `Dockerfile.agent-runtime` | `datalayer/agent-runtime` | Headless agent runtime server hosting AI agents over the supported protocols.  |
| `Dockerfile.agent-node`    | `datalayer/agent-nodes`   | Local Agent Node that syncs with the Datalayer platform and serves its web UI. |

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
