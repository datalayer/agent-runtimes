#!/bin/bash
# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# A structured reward: each dimension stays its own. `image` is 1 only in the
# image this task's Dockerfile built.
correct=0
if [ "$(cat /workspace/answer.txt 2>/dev/null)" = "hello" ]; then correct=1; fi
image=0
if [ "$(cat /etc/task-image 2>/dev/null)" = "greet" ]; then image=1; fi
echo "{\"correct\": $correct, \"image\": $image}" > /logs/verifier/reward.json
