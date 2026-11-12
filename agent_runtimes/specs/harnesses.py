# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Harness Catalog.

An agent program driven over the Agent Client Protocol (SH-01).

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List, Optional

from agent_runtimes.types import (
    HarnessAcpSpec,
    HarnessCapabilitiesSpec,
    HarnessHonoursSpec,
    HarnessRegisterEntry,
    HarnessRequiresSpec,
    HarnessSkillsSpec,
    HarnessSpec,
    HarnessTermsSpec,
)

CLAUDE_CODE_HARNESS_0_0_1 = HarnessSpec(
    id="claude-code",
    version="0.0.1",
    name="Claude Code",
    description="Anthropic's coding agent, driven over ACP through the Agent Client Protocol project's adapter on the Claude Agent SDK. On Datalayer its model calls go through Datalayer's ai-inference, answered from AWS Bedrock on the platform's models and paid in credits, with no key of the account's.",
    enabled=True,
    unavailable_because="",
    tags=["harness"],
    docs="https://github.com/agentclientprotocol/claude-agent-acp",
    acp=HarnessAcpSpec(
        command="npx",
        args=["-y", "@agentclientprotocol/claude-agent-acp@0.91.0"],
        protocol_version=1,
        load_session=True,
        mcp="lend",
        modes=["default", "plan", "acceptEdits", "bypassPermissions"],
        env={},
        native_session="none",
    ),
    requires=HarnessRequiresSpec(
        secrets=["ANTHROPIC_API_KEY"],
        binaries=["node", "git"],
    ),
    terms=HarnessTermsSpec(
        served_to_third_parties="api_key_only",
        licence="Apache-2.0 (adapter); Anthropic Commercial Terms of Service (the agent)",
        tier_restrictions=None,
    ),
    skills=HarnessSkillsSpec(
        format="skill-md",
        dir=".claude/skills",
    ),
    honours=HarnessHonoursSpec(
        model=True,
        subagents=False,
    ),
    capabilities=HarnessCapabilitiesSpec(
        resume="load",
        fork_history="replay",
        interrupt=True,
        steering=False,
        images=True,
        compaction="own",
        modes=["default", "plan", "acceptEdits", "bypassPermissions"],
        auto_run=[
            "^(cal|uptime|cat|head|tail|wc|stat|strings|hexdump|od|nl|id|uname|free|df|du|locale|groups|nproc|basename|dirname|realpath|cut|paste|tr|column|tac|rev|fold|expand|unexpand|fmt|comm|cmp|numfmt|readlink|diff|true|false|sleep|which|type|expr|seq|tsort|pr)(\\s|$)",
            "^(pwd|whoami|alias|history|arch|ifconfig|ip addr)(\\s|$)",
            "^(claude (-h|--help)|node (-v|--version)|python3? --version)$",
            "^(echo|uniq|jq|cd|ls|find)(\\s|$)",
            "^(xargs|file|sed|sort|man|help|netstat|ps|base64|grep|egrep|fgrep|rg|sha256sum|sha1sum|md5sum|tree|date|hostname|lsof|pgrep|tput|ss|fd|fdfind|test)(\\s|$)",
            "^git (diff|log|show|shortlog|reflog|stash (list|show)|ls-remote|status|blame|ls-files|config --get|remote( show)?|merge-base|rev-parse|rev-list|describe|cat-file|for-each-ref|grep|worktree list|tag|branch)(\\s|$)",
            "^gh (pr (view|list|diff|checks|status)|issue (view|list|status)|repo view|run (list|view)|auth status|release (list|view)|workflow (list|view)|label list|search (repos|issues|prs|commits|code))(\\s|$)",
            "^docker (ps|images|logs|inspect)(\\s|$)",
        ],
    ),
    instructions_file="CLAUDE.md",
    registered=HarnessRegisterEntry(
        adapter="@agentclientprotocol/claude-agent-acp",
        version="0.91.0",
        licence_source="https://www.npmjs.com/package/@agentclientprotocol/claude-agent-acp",
        terms_source="https://code.claude.com/docs/en/legal-and-compliance",
        credential="Locally, an Anthropic API key (ANTHROPIC_API_KEY), the person's own; on Datalayer none, its calls answered from AWS Bedrock through ai-inference in credits",
        binaries="Node 22 (engines.node >=22 on npm), git",
        note="Anthropic's legal page (read 2026-10-15): running Claude Code in hosted sandboxes or agent infrastructure requires the Commercial Terms; each end user authenticates with their own API key or subscription; developers may not route requests through Free, Pro or Max plan credentials on behalf of their users, nor collect or intermediate Claude.ai credentials. So only API keys are taken; a subscription login is refused. The npm package moved from @zed-industries (0.23.1, March 2026) to @agentclientprotocol. On a Datalayer runtime the end user holds no key and Anthropic is not reached: the model calls are AWS Bedrock's, on Datalayer's account, metered in credits. The user decided on 30 October 2026 to offer it to customers on Datalayer that way. Counsel has not reviewed this entry's api_key_only reading against that use.",
    ),
)

CODEX_HARNESS_0_0_1 = HarnessSpec(
    id="codex",
    version="0.0.1",
    name="Codex",
    description="OpenAI's coding agent, driven over ACP through the Agent Client Protocol project's adapter, which ships the Codex binary it drives. On Datalayer its model calls go through Datalayer's ai-inference, answered from AWS Bedrock on the platform's models and paid in credits, with no key of the account's.",
    enabled=True,
    unavailable_because="",
    tags=["harness"],
    docs="https://github.com/agentclientprotocol/codex-acp",
    acp=HarnessAcpSpec(
        command="npx",
        args=["-y", "@agentclientprotocol/codex-acp@2.2.2"],
        protocol_version=1,
        load_session=True,
        mcp="lend",
        modes=["read-only", "workspace-write", "agent", "agent-full-access"],
        env={"NO_BROWSER": "1"},
        native_session="none",
    ),
    requires=HarnessRequiresSpec(
        secrets=["OPENAI_API_KEY"],
        binaries=["node", "git"],
    ),
    terms=HarnessTermsSpec(
        served_to_third_parties="api_key_only",
        licence="Apache-2.0 (adapter); OpenAI Terms of Use (the agent)",
        tier_restrictions=None,
    ),
    skills=HarnessSkillsSpec(
        format="skill-md",
        dir=".agents/skills",
    ),
    honours=HarnessHonoursSpec(
        model=True,
        subagents=False,
    ),
    capabilities=HarnessCapabilitiesSpec(
        resume="load",
        fork_history="replay",
        interrupt=True,
        steering=False,
        images=True,
        compaction="own",
        modes=["read-only", "workspace-write", "agent", "agent-full-access"],
        auto_run=[],
    ),
    instructions_file="AGENTS.md",
    registered=HarnessRegisterEntry(
        adapter="@agentclientprotocol/codex-acp",
        version="2.2.2",
        licence_source="https://www.npmjs.com/package/@agentclientprotocol/codex-acp",
        terms_source="https://learn.chatgpt.com/docs/auth",
        credential="Locally, an OpenAI API key (OPENAI_API_KEY or CODEX_API_KEY), the person's own; on Datalayer none, its calls answered from AWS Bedrock through ai-inference in credits",
        binaries="Node 22 (as the Agent Client Protocol project's adapters; unstated on npm), git",
        note="Codex's authentication page (read 2026-10-15) recommends API keys for automation and device-code login for headless machines; a ChatGPT login needs a browser and is hidden with NO_BROWSER=1 in the adapter. Only API keys are taken; a ChatGPT login is refused. The Zed-scoped package was archived on 22 July 2026 and names this one. On a Datalayer runtime the end user holds no key and OpenAI is not reached: the model calls are AWS Bedrock's, on Datalayer's account, metered in credits. The user decided on 30 October 2026 to offer it that way. Counsel has not reviewed this entry's api_key_only reading against that use, nor whether running Codex on another vendor's model fits OpenAI's terms.",
    ),
)

CUSTOM_HARNESS_0_0_1 = HarnessSpec(
    id="custom",
    version="0.0.1",
    name="Custom harness",
    description="An organization's own ACP agent, its command named by the organization's own harness spec and never typed into a form.",
    enabled=False,
    unavailable_because="",
    tags=["harness"],
    docs="",
    acp=None,
    requires=HarnessRequiresSpec(
        secrets=[],
        binaries=[],
    ),
    terms=HarnessTermsSpec(
        served_to_third_parties="organizations_own",
        licence="The organization's own",
        tier_restrictions=None,
    ),
    skills=HarnessSkillsSpec(
        format="none",
        dir="",
    ),
    honours=HarnessHonoursSpec(
        model=False,
        subagents=False,
    ),
    capabilities=HarnessCapabilitiesSpec(
        resume="none",
        fork_history="none",
        interrupt=True,
        steering=False,
        images=False,
        compaction="own",
        modes=[],
        auto_run=[],
    ),
    instructions_file="",
    registered=HarnessRegisterEntry(
        adapter="The organization's own",
        version="0",
        licence_source="https://agentspecs.datalayer.tech/harnesses",
        terms_source="https://agentspecs.datalayer.tech/harnesses",
        credential="The organization's own",
        binaries="",
        note="Not launchable from the shared catalogue; an organization's own harness spec names the command and answers for its terms.",
    ),
)

FAST_AGENT_HARNESS_0_0_1 = HarnessSpec(
    id="fast-agent",
    version="0.0.1",
    name="fast-agent",
    description="llmindset's agent framework served over ACP; each agent it defines is a session mode, with any model provider it is configured with.",
    enabled=False,
    unavailable_because="the catalogue offers four harnesses today — Claude Code, Codex, OpenCode and pi (28 October 2026); fast-agent is a framework served over ACP, not a coding agent, its adapter is a Python tool the runtime image does not carry, and it has not been drilled on Datalayer.",
    tags=["harness", "framework"],
    docs="https://github.com/evalstate/fast-agent/blob/main/docs/docs/acp/index.md",
    acp=HarnessAcpSpec(
        command="uvx",
        args=["fast-agent-acp==0.10.45"],
        protocol_version=1,
        load_session=True,
        mcp="lend",
        modes=[],
        env={},
        native_session="none",
    ),
    requires=HarnessRequiresSpec(
        secrets=["ANTHROPIC_API_KEY"],
        binaries=["uvx"],
    ),
    terms=HarnessTermsSpec(
        served_to_third_parties="permitted",
        licence="Apache-2.0",
        tier_restrictions=None,
    ),
    skills=HarnessSkillsSpec(
        format="skill-md",
        dir=".agents/skills",
    ),
    honours=HarnessHonoursSpec(
        model=True,
        subagents=False,
    ),
    capabilities=HarnessCapabilitiesSpec(
        resume="load",
        fork_history="replay",
        interrupt=True,
        steering=False,
        images=False,
        compaction="own",
        modes=[],
        auto_run=[],
    ),
    instructions_file="AGENTS.md",
    registered=HarnessRegisterEntry(
        adapter="fast-agent-acp",
        version="0.10.45",
        licence_source="https://pypi.org/project/fast-agent-acp/",
        terms_source="https://github.com/evalstate/fast-agent/blob/main/LICENSE",
        credential="The provider's key fast-agent is given (ANTHROPIC_API_KEY, OPENAI_API_KEY or HF_TOKEN); ANTHROPIC_API_KEY declared",
        binaries="uv (uvx), Python 3.12 to 3.15 (requires_python on PyPI)",
        note="A framework, not a coding agent: each agent it defines is an ACP mode; the client's MCP servers are attached; sessions are listed. Launched with uvx fast-agent-acp (docs/docs/acp/index.md); reads skills from .fast-agent/skills, .agents/skills and .claude/skills; its default prompt reads AGENTS.md.",
    ),
)

GEMINI_CLI_HARNESS_0_0_1 = HarnessSpec(
    id="gemini-cli",
    version="0.0.1",
    name="Gemini CLI",
    description="Google's coding agent, which speaks ACP itself when started with --experimental-acp.",
    enabled=False,
    unavailable_because="the catalogue offers four harnesses today — Claude Code, Codex, OpenCode and pi (28 October 2026); Gemini CLI's API host (generativelanguage.googleapis.com) is outside a Datalayer runtime's egress boundary and is not routed through ai-inference, so it is not offered there.",
    tags=["harness"],
    docs="https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md",
    acp=HarnessAcpSpec(
        command="npx",
        args=["-y", "@google/gemini-cli@0.64.0", "--experimental-acp"],
        protocol_version=1,
        load_session=False,
        mcp="lend",
        modes=["default", "auto_edit", "yolo", "plan"],
        env={},
        native_session="none",
    ),
    requires=HarnessRequiresSpec(
        secrets=["GEMINI_API_KEY"],
        binaries=["node", "git"],
    ),
    terms=HarnessTermsSpec(
        served_to_third_parties="api_key_only",
        licence="Apache-2.0 (the agent); Gemini API or Gemini Code Assist terms (the model)",
        tier_restrictions="Gemini Code Assist Standard or Enterprise for a Google login (the individuals tier stopped being served on 18 June 2026); a Gemini API key otherwise",
    ),
    skills=HarnessSkillsSpec(
        format="skill-md",
        dir=".gemini/skills",
    ),
    honours=HarnessHonoursSpec(
        model=True,
        subagents=False,
    ),
    capabilities=HarnessCapabilitiesSpec(
        resume="none",
        fork_history="replay",
        interrupt=True,
        steering=False,
        images=True,
        compaction="own",
        modes=["default", "auto_edit", "yolo", "plan"],
        auto_run=[],
    ),
    instructions_file="GEMINI.md",
    registered=HarnessRegisterEntry(
        adapter="@google/gemini-cli",
        version="0.64.0",
        licence_source="https://www.npmjs.com/package/@google/gemini-cli",
        terms_source="https://developers.google.com/gemini-code-assist/resources/privacy-notice-gemini-code-assist-individuals",
        credential="A Gemini API key (GEMINI_API_KEY), the person's own; or a Google login on a Code Assist Standard or Enterprise subscription",
        binaries="Node 20 or later (engines.node >=20 on npm), git",
        note='Google\'s notice (read 2026-10-15): "Starting June 18, 2026, Gemini Code Assist IDE extensions stopped serving requests for the Gemini Code Assist for individuals"; Standard and Enterprise follow a separate schedule. The ACP flag is --experimental-acp in the CLI reference (docs/cli/cli-reference.md).',
    ),
)

GOOSE_HARNESS_0_0_1 = HarnessSpec(
    id="goose",
    version="0.0.1",
    name="goose",
    description="Block's open agent (now the Agentic AI Foundation's), which speaks ACP itself with goose acp; any model provider it is configured with.",
    enabled=False,
    unavailable_because="the catalogue offers four harnesses today — Claude Code, Codex, OpenCode and pi (28 October 2026); goose is a binary of its own release, not an npm adapter, the runtime image does not carry it, and it has not been drilled on Datalayer.",
    tags=["harness"],
    docs="https://block.github.io/goose/docs/gdk/acp/",
    acp=HarnessAcpSpec(
        command="goose",
        args=["acp"],
        protocol_version=1,
        load_session=False,
        mcp="lend",
        modes=[],
        env={"GOOSE_PROVIDER": "anthropic"},
        native_session="none",
    ),
    requires=HarnessRequiresSpec(
        secrets=["ANTHROPIC_API_KEY"],
        binaries=["goose@1.54.0", "git"],
    ),
    terms=HarnessTermsSpec(
        served_to_third_parties="permitted",
        licence="Apache-2.0",
        tier_restrictions=None,
    ),
    skills=HarnessSkillsSpec(
        format="skill-md",
        dir=".agents/skills",
    ),
    honours=HarnessHonoursSpec(
        model=True,
        subagents=False,
    ),
    capabilities=HarnessCapabilitiesSpec(
        resume="none",
        fork_history="replay",
        interrupt=True,
        steering=False,
        images=False,
        compaction="own",
        modes=[],
        auto_run=[],
    ),
    instructions_file=".goosehints",
    registered=HarnessRegisterEntry(
        adapter="goose",
        version="1.54.0",
        licence_source="https://github.com/aaif-goose/goose",
        terms_source="https://github.com/aaif-goose/goose/blob/main/LICENSE",
        credential="The provider's key goose is configured with (GOOSE_PROVIDER); ANTHROPIC_API_KEY declared",
        binaries="The goose CLI (release v1.54.0 of 8 October 2026), git",
        note="Open source under Apache-2.0, no vendor terms of its own; the model provider's terms apply to the key. Launched as goose acp (documentation/docs/gdk/acp/index.md).",
    ),
)

OPENCODE_HARNESS_0_0_1 = HarnessSpec(
    id="opencode",
    version="0.0.1",
    name="OpenCode",
    description="Anomaly's open coding agent, which speaks ACP itself with opencode acp; any model provider it is configured with. On Datalayer its model calls go through Datalayer's ai-inference, on the platform's models and paid in credits, with no key of the account's.",
    enabled=True,
    unavailable_because="",
    tags=["harness"],
    docs="https://opencode.ai/docs/acp/",
    acp=HarnessAcpSpec(
        command="npx",
        args=["-y", "opencode-ai@1.19.0", "acp"],
        protocol_version=1,
        load_session=False,
        mcp="lend",
        modes=[],
        env={},
        native_session="none",
    ),
    requires=HarnessRequiresSpec(
        secrets=["ANTHROPIC_API_KEY"],
        binaries=["node", "git"],
    ),
    terms=HarnessTermsSpec(
        served_to_third_parties="permitted",
        licence="MIT",
        tier_restrictions=None,
    ),
    skills=HarnessSkillsSpec(
        format="skill-md",
        dir=".opencode/skills",
    ),
    honours=HarnessHonoursSpec(
        model=True,
        subagents=False,
    ),
    capabilities=HarnessCapabilitiesSpec(
        resume="none",
        fork_history="replay",
        interrupt=True,
        steering=False,
        images=False,
        compaction="own",
        modes=[],
        auto_run=[],
    ),
    instructions_file="AGENTS.md",
    registered=HarnessRegisterEntry(
        adapter="opencode-ai",
        version="1.19.0",
        licence_source="https://www.npmjs.com/package/opencode-ai",
        terms_source="https://github.com/anomalyco/opencode/blob/dev/LICENSE",
        credential="Locally, the provider's key OpenCode is configured with, ANTHROPIC_API_KEY declared; on Datalayer none, its calls go through ai-inference in credits",
        binaries="Node (the opencode-ai package), git",
        note="Open source under MIT, no vendor terms of its own; the model provider's terms apply to the key. Launched as opencode acp (opencode.ai/docs/acp); reads skills from .opencode/skills, .claude/skills and .agents/skills.",
    ),
)

OPENHANDS_HARNESS_0_0_1 = HarnessSpec(
    id="openhands",
    version="0.0.1",
    name="OpenHands",
    description="The OpenHands CLI, which speaks ACP itself with openhands acp; any model provider it is configured with.",
    enabled=False,
    unavailable_because="the catalogue offers four harnesses today — Claude Code, Codex, OpenCode and pi (28 October 2026); OpenHands' adapter is a Python tool the runtime image does not carry, and it has not been drilled on Datalayer.",
    tags=["harness"],
    docs="https://docs.openhands.dev/openhands/usage/run-openhands/acp",
    acp=HarnessAcpSpec(
        command="uvx",
        args=[
            "--from",
            "openhands==1.16.0",
            "openhands",
            "acp",
            "--override-with-envs",
        ],
        protocol_version=1,
        load_session=True,
        mcp="lend",
        modes=["always-ask", "always-approve", "llm-approve"],
        env={},
        native_session="none",
    ),
    requires=HarnessRequiresSpec(
        secrets=["LLM_API_KEY"],
        binaries=["uvx", "git"],
    ),
    terms=HarnessTermsSpec(
        served_to_third_parties="permitted",
        licence="MIT",
        tier_restrictions=None,
    ),
    skills=HarnessSkillsSpec(
        format="skill-md",
        dir=".agents/skills",
    ),
    honours=HarnessHonoursSpec(
        model=True,
        subagents=False,
    ),
    capabilities=HarnessCapabilitiesSpec(
        resume="load",
        fork_history="replay",
        interrupt=True,
        steering=False,
        images=False,
        compaction="own",
        modes=["always-ask", "always-approve", "llm-approve"],
        auto_run=[],
    ),
    instructions_file="AGENTS.md",
    registered=HarnessRegisterEntry(
        adapter="openhands",
        version="1.16.0",
        licence_source="https://pypi.org/project/openhands/",
        terms_source="https://github.com/OpenHands/OpenHands-CLI/blob/main/LICENSE",
        credential="The provider's key OpenHands reads as LLM_API_KEY, with LLM_MODEL, under --override-with-envs",
        binaries="uv (uvx), Python 3.12 or later, git",
        note="Open source under MIT, no vendor terms of its own; the model provider's terms apply to the key. Launched as openhands acp (OpenHands-CLI README; docs.openhands.dev's ACP page); resumes with --resume; reads skills from .agents/skills (.openhands/skills is legacy).",
    ),
)

PI_HARNESS_0_0_1 = HarnessSpec(
    id="pi",
    version="0.0.1",
    name="pi",
    description="Earendil's pi coding agent, driven over ACP through the pi-acp adapter, which spawns the published pi executable; any model provider pi is configured with. On Datalayer its model calls go through Datalayer's ai-inference, answered from AWS Bedrock on the platform's models and paid in credits, with no key of the account's.",
    enabled=True,
    unavailable_because="",
    tags=["harness"],
    docs="https://github.com/svkozak/pi-acp",
    acp=HarnessAcpSpec(
        command="npx",
        args=["-y", "pi-acp@0.0.34"],
        protocol_version=1,
        load_session=True,
        mcp="lend",
        modes=[],
        env={},
        native_session="none",
    ),
    requires=HarnessRequiresSpec(
        secrets=["ANTHROPIC_API_KEY"],
        binaries=["node", "git"],
    ),
    terms=HarnessTermsSpec(
        served_to_third_parties="permitted",
        licence="MIT (adapter); MIT (the agent, @earendil-works/pi-coding-agent 1.4.0)",
        tier_restrictions=None,
    ),
    skills=HarnessSkillsSpec(
        format="skill-md",
        dir=".pi/skills",
    ),
    honours=HarnessHonoursSpec(
        model=True,
        subagents=False,
    ),
    capabilities=HarnessCapabilitiesSpec(
        resume="load",
        fork_history="replay",
        interrupt=True,
        steering=False,
        images=False,
        compaction="own",
        modes=[],
        auto_run=[],
    ),
    instructions_file="AGENTS.md",
    registered=HarnessRegisterEntry(
        adapter="pi-acp",
        version="0.0.34",
        licence_source="https://www.npmjs.com/package/pi-acp",
        terms_source="https://github.com/earendil-works/pi/blob/main/LICENSE",
        credential="Locally, the provider's key pi is configured with, ANTHROPIC_API_KEY declared, the person's own; on Datalayer none, its calls answered from AWS Bedrock through ai-inference in credits",
        binaries="Node 22 (pi-coding-agent engines.node >=22.19.0; pi-acp >=20), the pi executable 1.4.0 on the PATH (@earendil-works/pi-coding-agent), git",
        note="Read 2026-10-28. pi speaks no ACP itself; pi-acp 0.0.34 (MIT, an individual's, github.com/svkozak/pi-acp) speaks ACP JSON-RPC over stdio and spawns the published `pi` executable with `pi --mode rpc`, so pi 1.4.0 runs as published — chosen over @automatalabs/pi-acp 0.9.4 (Apache-2.0, in-process, which embeds pi 0.87.1 through its SDK on a fork's package). Open source under MIT on both sides, no vendor terms of their own; the model provider's terms apply to the key. Session persistence through pi's own session files (session/load).",
    ),
)


HARNESS_CATALOGUE: Dict[str, HarnessSpec] = {
    "claude-code": CLAUDE_CODE_HARNESS_0_0_1,
    "codex": CODEX_HARNESS_0_0_1,
    "custom": CUSTOM_HARNESS_0_0_1,
    "fast-agent": FAST_AGENT_HARNESS_0_0_1,
    "gemini-cli": GEMINI_CLI_HARNESS_0_0_1,
    "goose": GOOSE_HARNESS_0_0_1,
    "opencode": OPENCODE_HARNESS_0_0_1,
    "openhands": OPENHANDS_HARNESS_0_0_1,
    "pi": PI_HARNESS_0_0_1,
}


def get_harness(harness_id: str) -> Optional[HarnessSpec]:
    """A harness by id, or None."""
    return HARNESS_CATALOGUE.get(harness_id)


def list_harnesses() -> List[HarnessSpec]:
    """Every harness of the catalogue."""
    return list(HARNESS_CATALOGUE.values())
