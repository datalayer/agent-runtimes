#!/bin/bash
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# A structured reward: each dimension stays its own.
correct=0
if [ "$(cat /workspace/answer.txt 2>/dev/null)" = "42" ]; then correct=1; fi
echo "{\"correct\": $correct, \"tidy\": 0.5}" > /logs/verifier/reward.json
