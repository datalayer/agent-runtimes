# Docker Notes

This folder contains Docker assets for Agent Runtimes.

- Dockerfile path: docker/Dockerfile
- Build context: repository root

## Quick Docker release

For a fast build-and-push workflow during development:

```bash
make node-agents-docker-build DOCKER_TAG=dev
make agent-nodes-docker-push DOCKER_TAG=dev
```

make node-agents-docker-build is the primary Docker build target. It first runs
make node-agent-artifact-build (which builds the agent-node frontend artifacts)
and then builds the Docker image from those generated assets.

Compatibility alias:

```bash
make agent-nodes-docker-build DOCKER_TAG=dev
```

To run a local container that exposes the Agent Node UI/server supporting all
modes:

```bash
docker run --rm -p 8765:8765 datalayer/agent-nodes:dev
```

## Docker image build and push

Build the container image:

```bash
make node-agents-docker-build DOCKER_TAG=dev
```

DOCKER_IMAGE defaults to datalayer/agent-nodes and can be overridden:

```bash
make node-agents-docker-build DOCKER_IMAGE=my-registry/agent-nodes DOCKER_TAG=dev
```

Push the image:

```bash
make agent-nodes-docker-push DOCKER_TAG=dev
```

Override image and tag at push time if needed:

```bash
make agent-nodes-docker-push DOCKER_IMAGE=my-registry/agent-nodes DOCKER_TAG=dev
```

Build and push in one step:

```bash
make node-agents-docker-build DOCKER_TAG=dev
make agent-nodes-docker-push DOCKER_TAG=dev
```

Optional multi-arch platform example:

```bash
make node-agents-docker-build DOCKER_PLATFORM=linux/amd64 DOCKER_TAG=dev
```
