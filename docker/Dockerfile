# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates build-essential git \
    && rm -rf /var/lib/apt/lists/*

COPY package.json pyproject.toml setup.py README.md hatch_build.py ./
COPY jupyter-config ./jupyter-config
COPY agent_runtimes ./agent_runtimes
COPY dist ./dist

RUN pip install -e .

EXPOSE 8765

CMD ["python", "-m", "agent_runtimes", "serve", "--node", "--host", "0.0.0.0", "--port", "8765"]
