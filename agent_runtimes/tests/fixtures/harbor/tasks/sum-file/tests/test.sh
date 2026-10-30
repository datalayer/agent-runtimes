#!/bin/bash
# A structured reward: each dimension stays its own.
correct=0
if [ "$(cat /workspace/answer.txt 2>/dev/null)" = "42" ]; then correct=1; fi
echo "{\"correct\": $correct, \"tidy\": 0.5}" > /logs/verifier/reward.json
