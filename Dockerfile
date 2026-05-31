# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates build-essential nodejs npm \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY scripts ./scripts
COPY patches ./patches
RUN npm install

COPY . .

RUN npm run build
RUN pip install -e .

EXPOSE 8765

CMD ["python", "-m", "agent_runtimes", "serve", "--host", "0.0.0.0", "--port", "8765"]
