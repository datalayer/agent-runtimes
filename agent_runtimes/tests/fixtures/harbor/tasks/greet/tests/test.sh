#!/bin/bash
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

correct=0
if [ "$(cat /workspace/greeting.txt 2>/dev/null)" = "hello" ]; then correct=1; fi
echo "{\"correct\": $correct, \"tidy\": 1}" > /logs/verifier/reward.json
