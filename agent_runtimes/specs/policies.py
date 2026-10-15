# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Policy Catalog.

The Shield's policy documents the platform ships or shows (SHIELD.md SH-50):
each a catalogue entry whose ``policy`` is a document of ``agent_shield.policy``.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Any, Dict, List, Optional

from agent_runtimes.types import PolicySpec

DEFAULT_POLICY_0_0_1 = PolicySpec(
    id="default",
    version="0.0.1",
    name="The default policy",
    description="Decision 5's default, the session document every Shield decides with under the organization's and the application's: read, search, edit and move inside the workspace are done; delete, run a command, reach outside the workspace, a command naming a credential, sudo, a package install from the network or git push are asked first with the command shown; a fetch goes through the allow-list, which is empty; send and buy are asked.",
    enabled=True,
    tags=["policy", "default"],
    policy={
        "scope": "session",
        "version": 1,
        "rules": [
            {
                "name": "read inside the workspace",
                "decision": "allow",
                "classes": ["read"],
                "kinds": [],
                "where": "inside",
                "paths": [],
                "commands": [],
            },
            {
                "name": "edit and move inside the workspace",
                "decision": "allow",
                "classes": ["write"],
                "kinds": [],
                "where": "inside",
                "paths": [],
                "commands": [],
                "reason": "shown as diffs",
            },
            {
                "name": "delete",
                "decision": "ask",
                "classes": ["delete"],
                "kinds": [],
                "where": "any",
                "paths": [],
                "commands": [],
            },
            {
                "name": "a command naming a credential",
                "decision": "ask",
                "classes": ["execute"],
                "kinds": [],
                "where": "any",
                "paths": [],
                "commands": [
                    "(?i)(api[_-]?key|secret|token|password|passwd|credential|\\.env\\b|id_(rsa|ed25519)|\\.ssh/|\\.aws/|\\.netrc|\\.datalayer/|datalayerrc)"
                ],
                "reason": "the command is shown",
            },
            {
                "name": "sudo",
                "decision": "ask",
                "classes": ["execute"],
                "kinds": [],
                "where": "any",
                "paths": [],
                "commands": ["(?:^|[\\s;&|(])(?:sudo|doas|su)\\b"],
                "reason": "the command is shown",
            },
            {
                "name": "a package install from the network",
                "decision": "ask",
                "classes": ["execute"],
                "kinds": [],
                "where": "any",
                "paths": [],
                "commands": [
                    "\\b(?:pip3?|pipx|uv|npm|pnpm|yarn|bun|apt(?:-get)?|brew|cargo|gem|conda|mamba|go)(?:\\s+pip)?\\s+(?:install|add|i|get)\\b"
                ],
                "reason": "the command is shown",
            },
            {
                "name": "git push",
                "decision": "ask",
                "classes": ["execute"],
                "kinds": [],
                "where": "any",
                "paths": [],
                "commands": ["\\bgit\\b[^;&|]*\\bpush\\b"],
                "reason": "the command is shown",
            },
            {
                "name": "run a command",
                "decision": "ask",
                "classes": ["execute"],
                "kinds": [],
                "where": "any",
                "paths": [],
                "commands": [],
            },
            {
                "name": "outside the workspace",
                "decision": "ask",
                "classes": [],
                "kinds": [],
                "where": "outside",
                "paths": [],
                "commands": [],
            },
            {
                "name": "send or buy",
                "decision": "ask",
                "classes": ["send", "buy"],
                "kinds": [],
                "where": "any",
                "paths": [],
                "commands": [],
            },
        ],
        "limits": {
            "tool_calls": {"soft": 100, "hard": 200},
            "terminals_open": {"soft": 4, "hard": 8},
            "bytes_written": {"soft": 5242880, "hard": 20971520},
        },
        "network": {"fetch": []},
        "mcp": {"allow": []},
        "harnesses": {"admit": [], "credentials": "account"},
    },
)

ORGANIZATION_BASELINE_POLICY_0_0_1 = PolicySpec(
    id="organization-baseline",
    version="0.0.1",
    name="An organization's baseline",
    description="An example of the organization scope an administrator writes in IAM (SHIELD.md §6.7): running a command asks, nothing is deleted, nothing outside the workspace; the limits of §6.3 with a model budget of 200 000 then 400 000 tokens and a spend limit of 5 then 10 USD (500 then 1 000 credits); fetches to *.datalayer.io alone; Claude Code and Codex admitted, each on the account's own key; reading, writing, running a command, sending and buying need a permission beside the Rules (§6.11).",
    enabled=True,
    tags=["policy", "organization", "example"],
    policy={
        "scope": "organization",
        "version": 1,
        "authorize": ["read", "write", "execute", "send", "buy"],
        "rules": [
            {
                "name": "running a command asks",
                "decision": "ask",
                "classes": ["execute"],
                "kinds": [],
                "where": "any",
                "paths": [],
                "commands": [],
                "reason": "the organization's rule: every command is shown to a person first",
            },
            {
                "name": "nothing is deleted",
                "decision": "deny",
                "classes": ["delete"],
                "kinds": [],
                "where": "any",
                "paths": [],
                "commands": [],
                "reason": "the organization's rule",
            },
            {
                "name": "outside the workspace: leave it to me",
                "decision": "deny",
                "classes": [],
                "kinds": [],
                "where": "outside",
                "paths": [],
                "commands": [],
            },
        ],
        "limits": {
            "tool_calls": {"soft": 100, "hard": 200},
            "terminals_open": {"soft": 2, "hard": 4},
            "bytes_written": {"soft": 5242880, "hard": 20971520},
            "model_tokens": {"soft": 200000, "hard": 400000},
            "spend": {"soft": 500, "hard": 1000},
        },
        "network": {"fetch": ["*.datalayer.io"]},
        "mcp": {"allow": []},
        "harnesses": {"admit": ["claude-code", "codex"], "credentials": "account"},
    },
)


POLICY_CATALOGUE: Dict[str, PolicySpec] = {
    "default": DEFAULT_POLICY_0_0_1,
    "organization-baseline": ORGANIZATION_BASELINE_POLICY_0_0_1,
}


def get_policy(policy_id: str) -> Optional[PolicySpec]:
    """A policy by id, or None."""
    return POLICY_CATALOGUE.get(policy_id)


def list_policies() -> List[PolicySpec]:
    """Every policy of the catalogue."""
    return list(POLICY_CATALOGUE.values())


def policy_documents() -> Dict[str, Dict[str, Any]]:
    """Each policy's Shield document, by id."""
    return {key: dict(spec.policy) for key, spec in POLICY_CATALOGUE.items()}
