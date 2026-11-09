# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Amazon Bedrock AgentCore: a runtime target and an identity provider.

- :mod:`.target` — the ``agentcore`` contribution to ``runtime.target``: an
  agentspec deployed to AgentCore Runtime, its sessions invoked over AG-UI.
- :mod:`.identity` — the ``agentcore`` contribution to ``identity.provider``:
  the workload token, third-party OAuth tokens and API keys from AgentCore
  Identity's token vault.

boto3 is imported when a client is made, never at import: the contributions
exist wherever agent-runtimes is installed, and reach AWS only when called.
"""
