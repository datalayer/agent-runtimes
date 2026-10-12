#!/usr/bin/env bash
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
#
# The Agentic Commerce Protocol's checkout models, generated from the
# specification's JSON Schema (AGENT_PROTOCOLS PR-41), in both languages:
#   agent_runtimes/protocols/agentic_commerce/models.py   (datamodel-code-generator 0.34.0)
#   src/protocols/agentic-commerce/models.ts              (json-schema-to-typescript 15.0.4)
#
# Usage: scripts/codegen/generate_agentic_commerce.sh [VERSION]   (default 2026-04-17)
# Runs in a throwaway directory under ~/.cache; nothing is installed here.
set -euo pipefail
VERSION="${1:-2026-04-17}"
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${HOME}/.cache/agent-runtimes-codegen/agentic-commerce"
mkdir -p "$WORK"
if [ ! -d "$WORK/spec" ]; then
  git clone -q --depth 1 https://github.com/agentic-commerce-protocol/agentic-commerce-protocol.git "$WORK/spec"
fi
SCHEMA="$WORK/spec/spec/$VERSION/json-schema/schema.agentic_checkout.json"
[ -f "$SCHEMA" ] || { echo "no schema for $VERSION" >&2; exit 1; }
[ -d "$WORK/venv" ] || python3 -m venv "$WORK/venv"
"$WORK/venv/bin/pip" install -q "datamodel-code-generator==0.34.0"
"$WORK/venv/bin/datamodel-codegen" --input "$SCHEMA" --input-file-type jsonschema \
  --output-model-type pydantic_v2.BaseModel --target-python-version 3.11 \
  --use-standard-collections --use-union-operator --disable-timestamp \
  --output "$WORK/models.py"
{
  cat <<HEADER
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
#
# GENERATED — do not edit. The Agentic Commerce Protocol $VERSION, its
# checkout models: datamodel-code-generator 0.34.0 over
# agentic-commerce-protocol/agentic-commerce-protocol spec/$VERSION/
# json-schema/schema.agentic_checkout.json (Apache 2.0), with
#   --output-model-type pydantic_v2.BaseModel --target-python-version 3.11
#   --use-standard-collections --use-union-operator --disable-timestamp
# Regenerate with scripts/codegen/generate_agentic_commerce.sh.
# ruff: noqa

HEADER
  sed '1,/^from __future__/{/^from __future__/!d}' "$WORK/models.py"
} > "$HERE/agent_runtimes/protocols/agentic_commerce/models.py"
( cd "$WORK" && [ -d node_modules/json-schema-to-typescript ] || npm i -s --no-audit --no-fund json-schema-to-typescript@15.0.4 )
cat > "$WORK/gen.mjs" <<'JS'
import { compile } from 'json-schema-to-typescript';
import { readFileSync, writeFileSync } from 'fs';
const schema = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const root = { ...schema, type: 'object', properties: Object.fromEntries(Object.keys(schema.$defs).map(k => [k, { $ref: `#/$defs/${k}` }])), additionalProperties: false };
const ts = await compile(root, 'AgenticCheckout', { bannerComment: '', unreachableDefinitions: true, additionalProperties: false, strictIndexSignatures: true });
writeFileSync(process.argv[3], ts);
JS
( cd "$WORK" && node gen.mjs "$SCHEMA" "$WORK/models.ts" )
{
  cat <<HEADER
/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/* eslint-disable */
// GENERATED — do not edit. The Agentic Commerce Protocol $VERSION, its checkout
// types: json-schema-to-typescript 15.0.4 over
// agentic-commerce-protocol/agentic-commerce-protocol spec/$VERSION/json-schema/
// schema.agentic_checkout.json (Apache 2.0). Regenerate with
// scripts/codegen/generate_agentic_commerce.sh.

export const AGENTIC_COMMERCE_VERSION = '$VERSION';

HEADER
  cat "$WORK/models.ts"
} > "$HERE/src/protocols/agentic-commerce/models.ts"
echo "generated $VERSION"
