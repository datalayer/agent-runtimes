<!--
  ~ Copyright (c) 2025-2026 Datalayer, Inc.
  ~
  ~ BSD 3-Clause License
-->

# agent-runtimes on kagent

Manifests to run an agent-runtimes agentspec as a [kagent](https://kagent.dev)
1.0 agent (`api.kagent.dev/v1alpha3`): a BYO `Harness` running
`docker/Dockerfile.kagent`, an `AgentTemplate`, an `Agent`, and two
`ModelConfig` examples (Datalayer's AI inference, billed in credits; your own
OpenAI-compatible provider). No key is in them: each `ModelConfig` names a
Secret you create.

Before applying: set the image digest and `AGENT_SPEC_ID` in `harness.yaml`,
the `baseUrl` in `modelconfig-datalayer.yaml`, and create the Secret.

```bash
kubectl apply -k deploy/kagent
kubectl get agents.api.kagent.dev -n kagent
```

`deploy/kagent-datalayer` is the overlay of the bridge's Datalayer mode: the
Agent served by a Datalayer runtime (launched through the platform's Runtimes
API for the Agent, kept across the session's tasks, ended with the actor),
the Datalayer API key put in each request by kagent's egress gateway through
an `EgressPolicy`:

```bash
kubectl apply -k deploy/kagent-datalayer
```

See the kagent page of the documentation (`docs/docs/integrations/kagent.mdx`).
