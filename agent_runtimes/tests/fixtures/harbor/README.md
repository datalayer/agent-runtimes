# The Harbor compatibility fixture

Two tasks, a structured reward and two attempts each. The `oracle` agent runs each
task's solution: `sum-file` is right and `greet`'s solution is deliberately wrong, so
one task passes and one fails.

These tasks name no image, so the runtime's own image runs them. A local run in Docker
adds a Dockerfile:

    printf 'FROM python:3.12-slim\n' > tasks/sum-file/environment/Dockerfile
    harbor run -p tasks --agent oracle --env docker --n-attempts 2
