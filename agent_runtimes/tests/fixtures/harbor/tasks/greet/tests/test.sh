#!/bin/bash
correct=0
if [ "$(cat /workspace/greeting.txt 2>/dev/null)" = "hello" ]; then correct=1; fi
echo "{\"correct\": $correct, \"tidy\": 1}" > /logs/verifier/reward.json
