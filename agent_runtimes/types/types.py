# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""Pydantic models for chat functionality and agent specifications."""

from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


class EnvvarSpec(BaseModel):
    """
    Specification for an environment variable.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique environment variable identifier")
    version: str = Field(default="0.0.1", description="Environment variable version")
    name: str = Field(..., description="Display name for the environment variable")
    description: str = Field(default="", description="Environment variable description")
    registration_url: Optional[str] = Field(
        default=None,
        description="URL where users can register to obtain this variable",
        alias="registrationUrl",
    )
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")
    icon: Optional[str] = Field(
        default=None,
        description="Octicon name for UI display",
    )
    emoji: Optional[str] = Field(
        default=None,
        description="Unicode emoji for UI display",
    )


class SkillSpec(BaseModel):
    """
    Specification for a skill.

        Supports three variants:
    - Variant 1 (name-based): Uses ``module`` to discover and load a skill
      from a Python module path (e.g. ``agent_skills.events``).
    - Variant 2 (package-based): Uses ``package`` and ``method`` to reference
      a callable in an installable Python package.  Attributes such as
      ``license``, ``compatibility``, ``allowed_tools``, and ``metadata``
      are discovered at runtime from the ``SKILL.md`` packaged inside the
      Python package — they should NOT be duplicated in the YAML spec.
        - Variant 3 (path-based): Uses ``path`` to load a local skill directory
            containing ``SKILL.md`` (relative to the configured skills folder).
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique skill identifier")
    version: str = Field(default="0.0.1", description="Skill version")
    name: str = Field(..., description="Display name for the skill")
    description: str = Field(default="", description="Skill description")
    enabled: bool = Field(
        default=False, description="Whether the platform offers this skill today"
    )
    # Variant 1: module-based discovery
    module: Optional[str] = Field(
        default=None, description="Python module path for name-based discovery"
    )
    # Variant 2: package + method reference
    package: Optional[str] = Field(
        default=None, description="Python package containing the skill implementation"
    )
    method: Optional[str] = Field(
        default=None, description="Callable/function name in the package"
    )
    # Variant 3: path to a local skill directory (or SKILL.md file)
    path: Optional[str] = Field(
        default=None,
        description="Path to a local skill directory or SKILL.md file",
    )
    # agentskills.io frontmatter attributes
    license: Optional[str] = Field(
        default=None, description="License name or reference (agentskills.io spec)"
    )
    compatibility: Optional[str] = Field(
        default=None, description="Environment requirements (agentskills.io spec)"
    )
    allowed_tools: List[str] = Field(
        default_factory=list,
        alias="allowed-tools",
        description="Pre-approved tools the skill may use (agentskills.io spec)",
    )
    skill_metadata: Optional[Dict[str, str]] = Field(
        default=None,
        alias="skill-metadata",
        description="Arbitrary key-value metadata (agentskills.io spec)",
    )
    # Common fields
    envvars: List[str] = Field(
        default_factory=list,
        description="Environment variable IDs required by this skill",
    )
    dependencies: List[str] = Field(
        default_factory=list, description="Python package dependencies"
    )
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")
    icon: Optional[str] = Field(
        default=None,
        description="Octicon name for UI display",
    )
    emoji: Optional[str] = Field(
        default=None,
        description="Unicode emoji for UI display",
    )


class ToolRuntimeSpec(BaseModel):
    """Runtime binding for resolving a tool implementation."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    language: str = Field(
        ...,
        description="Implementation language ('python' or 'typescript')",
    )
    package: str = Field(
        ...,
        description="Module/package containing the implementation",
    )
    method: str = Field(
        ...,
        description="Callable/function name in the package",
    )


class ToolSpec(BaseModel):
    """
    Specification for a runtime tool.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique tool identifier")
    version: str = Field(default="0.0.1", description="Tool version")
    name: str = Field(..., description="Display name for the tool")
    description: str = Field(default="", description="Tool description")
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")
    enabled: bool = Field(default=True, description="Whether the tool is enabled")
    approval: str = Field(
        default="auto",
        description="Approval policy for the tool ('auto' or 'manual')",
    )
    timeout: Optional[str] = Field(
        default=None,
        description="Approval timeout duration (e.g. 0h5m0s, 2d6h, 1mo2d3h4m5s)",
    )
    runtime: ToolRuntimeSpec = Field(
        ...,
        description="Runtime binding metadata",
    )
    icon: Optional[str] = Field(
        default=None,
        description="Octicon name for UI display",
    )
    emoji: Optional[str] = Field(
        default=None,
        description="Unicode emoji for UI display",
    )


class FrontendToolSpec(BaseModel):
    """
    Specification for a frontend tool set.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique frontend tool identifier")
    version: str = Field(default="0.0.1", description="Frontend tool version")
    name: str = Field(..., description="Display name for the frontend tool")
    description: str = Field(default="", description="Frontend tool description")
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")
    enabled: bool = Field(
        default=True, description="Whether the frontend tool is enabled"
    )
    toolset: Union[str, List[str]] = Field(
        default="all",
        description=(
            "Which tools of the underlying toolset this bundle grants: the "
            "string 'all', or an explicit list of tool names. A list is how a "
            "specialist takes only what it needs — an agent that may read and "
            "edit a notebook but must never delete from it."
        ),
    )
    icon: Optional[str] = Field(
        default=None,
        description="Octicon name for UI display",
    )
    emoji: Optional[str] = Field(
        default=None,
        description="Unicode emoji for UI display",
    )


class FrontendRenderToolSpec(BaseModel):
    """
    Specification binding a backend tool to a frontend renderer.

    Lets an agent declare, in its spec, which backend tool results should be
    rendered inline by the frontend, which renderer to use, and an optional
    CSS file to load. Frontend examples read this instead of hardcoding the
    tool name or CSS filename.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    tool: str = Field(
        ...,
        description="Name of the backend tool whose result is rendered inline",
    )
    renderer: str = Field(
        ...,
        description="Renderer key the frontend maps to a component",
    )
    css: Optional[str] = Field(
        default=None,
        description="Optional CSS filename the frontend loads for this renderer",
    )


class ModelPricing(BaseModel):
    """What the provider lists a model at, per million tokens, in dollars.
    Both are required: a block naming one and not the other would make
    metered usage look free.
    """

    input_usd_per_million: float = Field(
        ..., ge=0, allow_inf_nan=False, description="Dollars per million input tokens"
    )
    output_usd_per_million: float = Field(
        ..., ge=0, allow_inf_nan=False, description="Dollars per million output tokens"
    )


class ComponentBindingsSpec(BaseModel):
    """What a component can be bound to: what it shows, what it sends."""

    shows: List[str] = Field(default_factory=list, description="The data it shows")
    sends: List[str] = Field(default_factory=list, description="What it sends back")


class ComponentSpec(BaseModel):
    """A visual component a UI plugin renders (LOOP C-13), named as a surface
    names it. A standard one's properties are its protocol's own; Datalayer's
    own carry theirs as a JSON Schema, from which its properties form is drawn
    (C-14).
    """

    id: str = Field(..., description="The name a surface gives it (e.g. 'Table')")
    name: str = Field(..., description="Display name")
    description: str = Field(..., description="What it is for, in a sentence")
    category: str = Field(
        ..., description="text, input, action, data, conversation, media, layout"
    )
    emoji: str = Field(..., description="Its face on the palette")
    standard: bool = Field(..., description="Its properties are its protocol's own")
    properties: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Its properties as a JSON Schema, when it is Datalayer's own",
    )
    bindings: Optional[ComponentBindingsSpec] = Field(
        default=None, description="What it can be bound to"
    )
    events: List[str] = Field(default_factory=list, description="What it reports")
    example: Optional[Dict[str, Any]] = Field(
        default=None, description="A valid configuration of it"
    )


class UIPluginSpec(BaseModel):
    """How an agent's answer becomes an interface: a protocol the host
    renders (`agentspecs/ui-plugins`). An agent spec's `ui_plugin` names one.
    """

    id: str = Field(
        ..., description="What an agent spec's `ui_plugin` names (e.g. 'a2ui')"
    )
    version: str = Field(default="0.0.1", description="Specification version")
    name: str = Field(..., description="Display name")
    description: str = Field(
        default="",
        description="What the plugin renders, and how the user's action comes back",
    )
    docs_url: str = Field(default="", description="The protocol's own documentation")
    enabled: bool = Field(
        default=True, description="Whether an agent spec may name it today"
    )
    catalog: str = Field(
        default="", description="The catalog its components are written in"
    )
    components: List[ComponentSpec] = Field(
        default_factory=list, description="The visual components it renders (LOOP C-13)"
    )


class FrameGuardSpec(BaseModel):
    """A check a Frame requires of the output of work done under it."""

    id: str = Field(..., description="Identity within the Frame")
    category: str = Field(
        ...,
        description=(
            "What kind of check it is: algorithmic, source-grounding, consensus, "
            "expert, policy-safety, regression-drift or outcome"
        ),
    )
    description: str = Field(default="", description="What is checked")
    required: bool = Field(
        default=True,
        description="Whether the output counts only once this Guard has passed",
    )


class FramePromptSpec(BaseModel):
    """A reusable prompt fragment a Cog loads into its context."""

    id: str = Field(..., description="Identity within the Frame")
    text: str = Field(default="", description="The fragment")


class FrameSpec(BaseModel):
    """The context work happens in, written down (`agentspecs/frames`).

    Owned, scoped, versioned and inherited. A Frame in the generated catalogue
    is resolved: what it inherits through `extends` is already in it, and
    `lineage` says from which Frames, nearest parent first.
    """

    id: str = Field(..., description="Unique Frame identifier")
    version: str = Field(default="0.0.1", description="Specification version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="What context it carries")
    scope: str = Field(
        ...,
        description=(
            "What it applies to: organization, department, team, project, role "
            "or relationship"
        ),
    )
    owner: str = Field(..., description="Who manages the Frame and answers for it")
    extends: Optional[str] = Field(
        default=None, description="The parent Frame, as the spec names it"
    )
    lineage: List[str] = Field(
        default_factory=list,
        description="The Frames it inherits from, nearest parent first",
    )
    tags: List[str] = Field(default_factory=list)
    enabled: bool = Field(default=True, description="Whether a Cog may name it today")
    icon: Optional[str] = Field(default=None, description="Icon identifier")
    emoji: Optional[str] = Field(default=None, description="Emoji representation")
    rules: List[str] = Field(default_factory=list)
    terminology: Dict[str, str] = Field(default_factory=dict)
    goals: List[str] = Field(default_factory=list)
    style: List[str] = Field(default_factory=list)
    norms: List[str] = Field(default_factory=list)
    process: List[str] = Field(default_factory=list)
    architecture: str = Field(default="")
    prompts: List[FramePromptSpec] = Field(default_factory=list)
    skills: List[str] = Field(default_factory=list)
    tools: List[str] = Field(default_factory=list)
    mcp_servers: List[str] = Field(default_factory=list)
    guards: List[FrameGuardSpec] = Field(default_factory=list)


class ModelProvider(BaseModel):
    """Who serves a model: the vendor's own API, a cloud that hosts it, or
    the user's machine — with what a person choosing it has to be able to
    read (`agentspecs/model-providers`).
    """

    id: str = Field(
        ..., description="What a model spec's `provider` names (e.g. 'anthropic')"
    )
    version: str = Field(default="0.0.1", description="Specification version")
    name: str = Field(..., description="Display name")
    description: str = Field(
        default="",
        description="What the provider is, and what is worth knowing before choosing it",
    )
    website: str = Field(default="", description="The provider's product page")
    docs_url: str = Field(default="", description="The provider's documentation")
    terms_url: str = Field(
        default="", description="The terms of service a call is made under"
    )
    privacy_url: str = Field(default="", description="The provider's privacy policy")
    data_usage_url: Optional[str] = Field(
        default=None,
        description="What the provider says about the data a request carries, when it has a page for it",
    )
    hosting: str = Field(
        default="cloud",
        description="Where the model runs: 'cloud' (the provider's) or 'local' (the user's machine)",
    )


class AIModel(BaseModel):
    """Specification for an AI model."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique model identifier")
    version: str = Field(default="0.0.1", description="Model spec version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Model description")
    provider: str = Field(..., description="Provider name")
    provider_url: Optional[str] = Field(
        default=None,
        description="The page on the provider's website that describes this model.",
    )
    default: bool = Field(
        default=False, description="Whether this is the default model"
    )
    available: bool = Field(
        default=False,
        description=(
            "Whether this model is offered to a person choosing one. The "
            "catalogue is what the platform knows how to talk to; this is "
            "what is worth offering today."
        ),
    )
    required_env_vars: List[str] = Field(
        default_factory=list,
        description="Required environment variable names",
    )
    tokens_limit: Optional[int] = Field(
        default=None,
        description=(
            "Maximum output tokens the model can generate in a single run "
            "(maps to pydantic-ai output_tokens_limit)."
        ),
    )
    local: bool = Field(
        default=False,
        description=(
            "Whether the model runs on the user's own machine (Ollama, LM "
            "Studio, vLLM, llama.cpp). A local model needs no API key, and "
            "choosing one moves execution to a local sandbox so the code stays "
            "where the tokens do."
        ),
    )
    base_url: Optional[str] = Field(
        default=None,
        description=(
            "OpenAI-compatible base URL to reach the model. Set for local "
            "models and for self-hosted endpoints; falls back to the provider's "
            "default when omitted."
        ),
    )
    api_key_env: Optional[str] = Field(
        default=None,
        description=(
            "Environment variable holding an API key, for endpoints that want "
            "one without requiring it (a vLLM server behind a gateway)."
        ),
    )
    capabilities: List[str] = Field(
        default_factory=list,
        description=(
            "What the model can be trusted with: 'chat', 'tools', 'codemode', "
            "'vision', 'thinking', 'judgments' (a typed-judgment model), "
            "'judge' (a chat model that may be asked those questions). "
            "Empty means unstated rather than incapable. "
            "A small local model that lists no 'tools' is warned about at "
            "selection instead of failing mysteriously mid-run."
        ),
    )
    billing: Optional[str] = Field(
        default=None,
        description=(
            "How the provider bills the model, when it is worth telling a "
            "person choosing one: 'standard' (the provider's own billing) or "
            "'credits' (prepaid credits, which is what makes Cloudflare's "
            "frontier models available on a free plan). None means the "
            "provider's usual."
        ),
    )
    route: Optional[str] = Field(
        default=None,
        description=(
            "How a Cloudflare model is reached: 'workers-ai' (a model "
            "Cloudflare hosts, ids 'cloudflare:wrk/…') or 'ai-gateway' (a "
            "third-party model its gateway fronts, ids 'cloudflare:gtw/…'). "
            "Other providers leave it unset."
        ),
    )
    context_window: Optional[int] = Field(
        default=None,
        description="The tokens a request may carry, input and output together.",
    )
    zero_data_retention: Optional[bool] = Field(
        default=None,
        description="Whether the provider keeps nothing of a request once it is answered.",
    )
    pricing: Optional["ModelPricing"] = Field(
        default=None,
        description=(
            "The provider's list price per million tokens, when a service meters by it."
        ),
    )
    request_logging: Optional[str] = Field(
        default=None,
        description=(
            "Where the route keeps a log of the requests it carries, apart "
            "from what the provider retains: 'none', or 'gateway' (AI "
            "Gateway's request logs). Read beside zero_data_retention."
        ),
    )
    aliases: List[str] = Field(
        default_factory=list,
        description=(
            "Older ids this spec answers to, kept when an id had to move so "
            "what a consumer named still resolves."
        ),
    )


class AIModels(str, Enum):
    """Enumeration of all available AI model IDs.

    Note: Enum members are generated by ``make specs``.
    This base class is kept here as the canonical type; the generated
    ``agent_runtimes.specs.models`` module re-populates members at import time.
    """

    pass


class BenchmarkSpec(BaseModel):
    """Evaluation benchmark specification."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique benchmark identifier")
    version: str = Field(default="0.0.1", description="Benchmark version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Benchmark description")
    category: Literal["Coding", "Knowledge", "Reasoning", "Agentic", "Safety"] = Field(
        ..., description="Benchmark category"
    )
    task_count: int = Field(..., ge=0, description="Number of benchmark tasks")
    metric: str = Field(..., description="Primary evaluation metric")
    source: str = Field(default="", description="Source URL or dataset reference")
    difficulty: Literal["easy", "medium", "hard", "expert"] = Field(
        default="medium", description="Benchmark difficulty"
    )
    languages: List[str] = Field(default_factory=list, description="Target languages")
    dataset_source: Literal["hosted", "local", "hybrid"] = Field(
        default="local", description="Dataset source mode"
    )
    supports_live_monitoring: bool = Field(
        default=False, description="Whether benchmark supports live monitoring"
    )
    supports_experiment_comparison: bool = Field(
        default=True,
        description="Whether benchmark supports side-by-side experiment comparisons",
    )
    evaluator_shapes: List[
        Literal["pass_rate", "numeric", "categorical", "error_only"]
    ] = Field(default_factory=list, description="Evaluator output shape(s)")
    evaluators: List[str] = Field(
        ...,
        description="Evaluator IDs or id:version references used by this benchmark",
    )
    recommended_windows: List[str] = Field(
        default_factory=lambda: ["1h", "6h", "24h", "7d", "30d"],
        description="Suggested monitoring windows",
    )
    trace_integration: bool = Field(
        default=True,
        description="Whether runs can link to traces",
    )
    dataset_editability: Literal["read-only", "editable"] = Field(
        default="read-only", description="Whether cases are editable in UI"
    )
    sdk_support: Literal["none", "experimental", "stable"] = Field(
        default="experimental", description="SDK support level"
    )


class EvalSpec(BaseModel):
    """Built-in evaluator specification."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique eval identifier")
    version: str = Field(default="0.0.1", description="Eval version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Evaluator description")
    category: Literal[
        "Comparison",
        "Type Validation",
        "Performance",
        "LLM-as-a-Judge",
        "Span-Based",
        "Report",
    ] = Field(..., description="Evaluator family")
    evaluator_type: Literal["case", "report"] = Field(
        ..., description="Case-level or report-level evaluator"
    )
    pydantic_class: str = Field(..., description="Pydantic evaluator class name")
    executable: bool = Field(
        default=False,
        description=(
            "Whether the platform can run this evaluator today. A catalogue "
            "entry that is not executable is shown, never offered."
        ),
    )
    output_kind: Literal[
        "boolean",
        "boolean_with_reason",
        "score",
        "score_and_assertion",
        "report_table",
        "report_curve",
    ] = Field(..., description="Primary output shape")
    cost_tier: Literal["free", "llm"] = Field(
        default="free", description="Cost tier for this evaluator"
    )
    latency: Literal["instant", "fast", "slow"] = Field(
        default="instant", description="Expected latency profile"
    )
    requires: List[str] = Field(
        default_factory=list,
        description="Runtime requirements (e.g. expected_output, model, logfire)",
    )
    source: str = Field(default="", description="Source documentation URL")
    default_config: Dict[str, Any] = Field(
        default_factory=dict,
        description="Suggested baseline evaluator configuration",
    )


class GuardrailPermissions(BaseModel):
    """Permission toggles for a guardrail profile."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    read_data: bool = Field(default=False, description="Allow data reads")
    write_data: bool = Field(default=False, description="Allow data writes")
    execute_code: bool = Field(default=False, description="Allow code execution")
    access_internet: bool = Field(default=False, description="Allow internet access")
    send_email: bool = Field(default=False, description="Allow email sending")
    deploy_production: bool = Field(
        default=False, description="Allow production deploys"
    )


class TokenLimitsSpec(BaseModel):
    """Token budget limits."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    per_run: str = Field(default="0", description="Token budget per run")
    per_day: str = Field(default="0", description="Token budget per day")
    per_month: str = Field(default="0", description="Token budget per month")


class DataScopeSpec(BaseModel):
    """Data-access scoping rules."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    allowed_systems: List[str] = Field(default_factory=list)
    allowed_objects: List[str] = Field(default_factory=list)
    denied_objects: List[str] = Field(default_factory=list)
    denied_fields: List[str] = Field(default_factory=list)


class DataHandlingSpec(BaseModel):
    """Data output and PII handling policy."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    default_aggregation: bool = Field(default=False)
    allow_row_level_output: bool = Field(default=False)
    max_rows_in_output: int = Field(default=0, ge=0)
    redact_fields: List[str] = Field(default_factory=list)
    hash_fields: List[str] = Field(default_factory=list)
    pii_detection: bool = Field(default=False)
    pii_action: str = Field(default="warn")


class ApprovalPolicySpec(BaseModel):
    """Manual/automatic approval policy."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    require_manual_approval_for: List[str] = Field(default_factory=list)
    auto_approved: List[str] = Field(default_factory=list)


class ToolLimitsSpec(BaseModel):
    """Tool-call limits for a run."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    max_tool_calls: int = Field(default=0, ge=0)
    max_query_rows: int = Field(default=0, ge=0)
    max_query_runtime: str = Field(default="0s")
    max_time_window_days: int = Field(default=0, ge=0)


class AuditSpec(BaseModel):
    """Audit/logging policy."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    log_tool_calls: bool = Field(default=True)
    log_query_metadata_only: bool = Field(default=False)
    retain_days: int = Field(default=30, ge=0)
    require_lineage_in_report: bool = Field(default=False)


class ContentSafetySpec(BaseModel):
    """Prompt-injection and untrusted-content policy."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    treat_crm_text_fields_as_untrusted: bool = Field(default=False)
    do_not_follow_instructions_from_data: bool = Field(default=True)


class GuardrailSpec(BaseModel):
    """Guardrail specification."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique guardrail identifier")
    version: str = Field(default="0.0.1", description="Guardrail version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Guardrail description")
    identity_provider: str = Field(..., description="Identity provider")
    identity_name: str = Field(..., description="Identity name")
    permissions: GuardrailPermissions = Field(
        default_factory=GuardrailPermissions, description="Permission toggles"
    )
    token_limits: TokenLimitsSpec = Field(
        default_factory=TokenLimitsSpec, description="Token budget limits"
    )
    data_scope: Optional[DataScopeSpec] = Field(
        default=None, description="Data-access scope"
    )
    data_handling: Optional[DataHandlingSpec] = Field(
        default=None, description="Data handling policy"
    )
    approval_policy: Optional[ApprovalPolicySpec] = Field(
        default=None, description="Approval policy"
    )
    tool_limits: Optional[ToolLimitsSpec] = Field(
        default=None, description="Tool invocation limits"
    )
    audit: Optional[AuditSpec] = Field(
        default=None, description="Audit trail configuration"
    )
    content_safety: Optional[ContentSafetySpec] = Field(
        default=None, description="Content safety settings"
    )


class MemorySpec(BaseModel):
    """Specification for a memory backend."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique memory identifier")
    version: str = Field(default="0.0.1", description="Memory spec version")
    name: str = Field(..., description="Display name for the memory backend")
    description: str = Field(default="", description="Memory backend description")
    persistence: str = Field(
        default="none",
        description="Persistence level: none, session, cross-session, permanent",
    )
    scope: str = Field(
        default="agent",
        description="Memory scope: agent, team, repository, user, global",
    )
    backend: str = Field(default="in-memory", description="Storage backend identifier")
    enabled: bool = Field(
        default=False, description="Whether an agent spec is offered this memory"
    )
    icon: str = Field(default="database", description="Icon identifier")
    emoji: str = Field(default="\U0001f9e0", description="Emoji representation")


class Memories(str, Enum):
    """Enumeration of available memory backends.

    Note: Enum members are generated by ``make specs``.
    This base class is kept here as the canonical type; the generated
    ``agent_runtimes.specs.memory`` module re-populates members at import time.
    """

    pass


class LoopHuman(BaseModel):
    """How the human participates in (or around) an agent execution loop."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    mode: str = Field(
        default="initiate",
        description="Human interaction pattern: none, initiate, approve, feedback, or tool",
    )
    approval_required: bool = Field(
        default=False,
        description="Whether the loop pauses for human approval before sensitive actions",
    )
    approval_for: List[str] = Field(
        default_factory=list,
        description="Actions that require explicit human approval",
    )
    description: str = Field(
        default="", description="Description of the human-in-the-loop behaviour"
    )


class LoopTermination(BaseModel):
    """When and how an agent execution loop stops iterating."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    max_iterations: int = Field(
        default=10, ge=1, description="Maximum iterations before the loop is stopped"
    )
    success_criteria: List[str] = Field(
        default_factory=list, description="Conditions that mark the goal as reached"
    )
    failure_criteria: List[str] = Field(
        default_factory=list, description="Conditions that mark the loop as failed"
    )
    on_blocked: str = Field(
        default="ask-human",
        description="What to do when blocked: ask-human, retry, or abort",
    )


class LoopSpec(BaseModel):
    """Specification for an agent execution loop.

    A framework-agnostic description of how an agent progresses from one
    decision to the next: the control cycle (observe/think/act/evaluate), the
    objective, constraints, where state lives, human participation, and the
    termination policy.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique loop identifier")
    version: str = Field(default="0.0.1", description="Loop spec version")
    name: str = Field(..., description="Display name for the loop")
    description: str = Field(default="", description="Loop description")
    objective: str = Field(
        default="", description="Default goal/objective the loop works toward"
    )
    strategy: str = Field(
        default="observe-think-act-evaluate",
        description="Loop strategy family (observe-think-act-evaluate, plan-execute-critic, ooda, react)",
    )
    phases: List[str] = Field(
        default_factory=lambda: ["observe", "think", "act", "evaluate"],
        description="Ordered phase names that make up one iteration",
    )
    constraints: List[str] = Field(
        default_factory=list, description="Boundaries the agent must respect"
    )
    termination: Optional[LoopTermination] = Field(
        default=None, description="Termination policy"
    )
    human: Optional[LoopHuman] = Field(
        default=None, description="Human-in-the-loop participation settings"
    )
    state_backends: List[str] = Field(
        default_factory=list,
        description="Where loop state lives between iterations",
    )
    tags: List[str] = Field(default_factory=list, description="Categorization tags")
    icon: str = Field(default="sync", description="Icon identifier")
    emoji: str = Field(default="\U0001f504", description="Emoji representation")


class Loops(str, Enum):
    """Enumeration of available agent execution loops.

    Note: Enum members are generated by ``make specs``.
    This base class is kept here as the canonical type; the generated
    ``agent_runtimes.specs.loops`` module re-populates members at import time.
    """

    pass


class PersonaSpec(BaseModel):
    """Specification for a Persona.

    A Persona is a lightweight identity built on top of an agent spec —
    it bundles a name, a description and a set of tags that describe the
    role and tone of the underlying agent.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique persona identifier")
    version: str = Field(default="0.0.1", description="Persona spec version")
    name: str = Field(..., description="Display name of the persona")
    description: str = Field(default="", description="Short persona description")
    tags: List[str] = Field(default_factory=list, description="Categorization tags")
    icon: Optional[str] = Field(default=None, description="Icon identifier")
    emoji: Optional[str] = Field(default=None, description="Emoji representation")
    agent: Optional[str] = Field(
        default=None,
        description="Optional reference to the underlying agent spec id",
    )


class Personas(str, Enum):
    """Enumeration of available personas.

    Note: Enum members are generated by ``make specs``.
    This base class is kept here as the canonical type; the generated
    ``agent_runtimes.specs.personas`` module re-populates members at import time.
    """

    pass


class NotificationField(BaseModel):
    """Dynamic field definition for a notification channel."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    name: str = Field(..., description="Field key")
    label: str = Field(..., description="Display label")
    type: Literal["string", "boolean", "number"] = Field(..., description="Input type")
    required: bool = Field(default=False, description="Whether this field is required")
    placeholder: Optional[str] = Field(default=None, description="UI placeholder")
    default: Optional[Any] = Field(default=None, description="Default value")


class NotificationChannelSpec(BaseModel):
    """Notification channel specification."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique channel identifier")
    version: str = Field(default="0.0.1", description="Channel version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Channel description")
    icon: str = Field(default="bell", description="Icon identifier")
    available: bool = Field(
        default=True, description="Whether channel is currently available"
    )
    coming_soon: bool = Field(
        default=False, description="Whether channel is planned but not available yet"
    )
    fields: List[NotificationField] = Field(
        default_factory=list, description="Channel configuration fields"
    )


class OutputSpec(BaseModel):
    """Output format specification."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique output identifier")
    version: str = Field(default="0.0.1", description="Output version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Output description")
    icon: str = Field(default="", description="Icon identifier")
    enabled: bool = Field(
        default=False, description="Whether the platform offers this output today"
    )
    supports_template: bool = Field(
        default=False, description="Whether this output supports templating"
    )
    supports_storage: bool = Field(
        default=False, description="Whether this output can be persisted"
    )
    mime_types: List[str] = Field(
        default_factory=list, description="Supported MIME types"
    )


class EventField(BaseModel):
    """Dynamic field definition for an event type specification."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    name: str = Field(..., description="Field key")
    label: str = Field(..., description="Display label")
    type: Literal["string", "boolean", "number"] = Field(..., description="Value type")
    required: bool = Field(default=False, description="Whether field is required")
    description: Optional[str] = Field(default=None, description="Field description")
    placeholder: Optional[str] = Field(default=None, description="UI placeholder")


class EventSpec(BaseModel):
    """Event type specification for agent lifecycle and guardrail events."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique event type identifier")
    version: str = Field(default="0.0.1", description="Event spec version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Event type description")
    kind: str = Field(..., description="Event kind constant")
    fields: List[EventField] = Field(
        default_factory=list, description="Event payload fields"
    )


class TriggerField(BaseModel):
    """Dynamic field definition for a trigger type."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    name: str = Field(..., description="Field key")
    label: str = Field(..., description="Display label")
    type: Literal["string", "boolean", "number"] = Field(..., description="Input type")
    required: bool = Field(default=False, description="Whether field is required")
    placeholder: Optional[str] = Field(default=None, description="UI placeholder")
    help: Optional[str] = Field(default=None, description="Help text")
    font: Optional[str] = Field(default=None, description="Suggested font style")


class TriggerSpec(BaseModel):
    """Trigger type specification."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique trigger identifier")
    version: str = Field(default="0.0.1", description="Trigger version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="Trigger description")
    type: Literal["once", "schedule", "event"] = Field(
        ..., description="Trigger execution mode"
    )
    fields: List[TriggerField] = Field(
        default_factory=list, description="Trigger configuration fields"
    )


class AgentSkillSpec(BaseModel):
    """
    Specification for an agent skill.

    Simplified version of the full Skill type from agent-skills,
    containing only the fields needed for agent specification.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique skill identifier")
    name: str = Field(..., description="Display name for the skill")
    description: str = Field(default="", description="Skill description")
    version: str = Field(default="1.0.0", description="Skill version")
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")
    enabled: bool = Field(default=True, description="Whether the skill is enabled")


class AgentStatus(str, Enum):
    """
    Status of an agent runtime.
    """

    STARTING = "starting"
    RUNNING = "running"
    PAUSED = "paused"
    TERMINATED = "terminated"
    ARCHIVED = "archived"


class ChatRequest(BaseModel):
    """
    Chat request from frontend.
    """

    model: Optional[str] = Field(None, description="Model to use for this request")
    builtin_tools: List[str] = Field(
        default_factory=list, description="Enabled builtin tools"
    )
    messages: List[Dict[str, Any]] = Field(
        default_factory=list, description="Conversation messages"
    )


class AIModelRuntime(BaseModel):
    """
    Runtime configuration for an AI model.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(
        ...,
        description="Model identifier (e.g., 'anthropic:claude-3-5-haiku-20241022')",
    )
    name: str = Field(..., description="Display name for the model")
    builtin_tools: List[str] = Field(
        default_factory=list,
        description="List of builtin tool IDs",
        alias="builtinTools",
    )
    required_env_vars: List[str] = Field(
        default_factory=list,
        description="Required environment variables for this model",
        alias="requiredEnvVars",
    )
    is_available: bool = Field(
        default=True,
        description=(
            "Whether this model can be picked: both entitled by the registry "
            "and ready in this environment"
        ),
        alias="isAvailable",
    )
    unavailable_reason: Optional[str] = Field(
        default=None,
        description=(
            "Why the model cannot be picked, when it cannot. Carried because "
            "the two reasons are not interchangeable: a missing API key is "
            "something the reader can go and fix, and a model this deployment "
            "is not entitled to is not."
        ),
        alias="unavailableReason",
    )


class BuiltinTool(BaseModel):
    """
    Configuration for a builtin tool.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., description="Tool identifier")
    name: str = Field(..., description="Display name for the tool")


class MCPServerTool(BaseModel):
    """
    A tool provided by an MCP server.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    name: str = Field(..., description="Tool name/identifier")
    description: str = Field(default="", description="Tool description")
    enabled: bool = Field(default=True, description="Whether the tool is enabled")
    input_schema: Optional[Dict[str, Any]] = Field(
        default=None,
        description="JSON schema for tool input parameters",
        alias="inputSchema",
    )


class AgentSuggestion(BaseModel):
    """An opener offered to somebody arriving at an empty chat.

    Text and, optionally, a mark to show beside it. It was a bare string, which
    is enough for a chip in an empty state and not enough for anywhere else a
    suggestion is offered — a menu, a launcher, a list of what an agent is for
    — where an unmarked row of sentences is hard to scan. Both marks are
    optional and independent: an octicon suits chrome already drawn in line
    art, an emoji suits a place that has colour, and a spec is free to give
    one, both or neither.
    """

    text: str = Field(
        ...,
        description="What is sent when the suggestion is taken",
    )
    summary: Optional[str] = Field(
        default=None,
        description=(
            "A few words shown as the label where the text is too long for "
            "one — a chip, a menu row; the text itself is then the tooltip"
        ),
    )
    icon: Optional[str] = Field(
        default=None,
        description="Octicon name to show beside it",
    )
    emoji: Optional[str] = Field(
        default=None,
        description="Unicode emoji to show beside it",
    )


class MCPServer(BaseModel):
    """
    Configuration for an MCP server.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique server identifier")
    version: str = Field(default="0.0.1", description="MCP server version")
    name: str = Field(..., description="Display name for the server")
    description: str = Field(
        default="", description="Description of the server capabilities"
    )
    icon: Optional[str] = Field(
        default=None,
        description="Octicon name for UI display",
    )
    emoji: Optional[str] = Field(
        default=None,
        description="Unicode emoji for UI display",
    )
    url: str = Field(default="", description="Server URL (for HTTP-based servers)")
    enabled: bool = Field(default=True, description="Whether the server is enabled")
    tools: List[MCPServerTool] = Field(
        default_factory=list, description="List of available tools"
    )
    # Fields for stdio-based MCP servers
    command: Optional[str] = Field(
        default=None,
        description="Command to run the MCP server (e.g., 'npx', 'uvx')",
    )
    args: List[str] = Field(
        default_factory=list,
        description="Command arguments for the MCP server",
    )
    env: Optional[Dict[str, str]] = Field(
        default=None,
        description="Environment variables for the MCP server process",
    )
    required_env_vars: List[str] = Field(
        default_factory=list,
        description="Environment variables required for this server to work",
        alias="requiredEnvVars",
    )
    is_available: bool = Field(
        default=False,
        description="Whether the server is available (based on env var presence)",
        alias="isAvailable",
    )
    transport: str = Field(
        default="stdio",
        description="Transport type: 'stdio' or 'http'",
    )
    is_config: bool = Field(
        default=False,
        description="Whether this server is from mcp.json config (vs catalog)",
        alias="isConfig",
    )
    is_running: bool = Field(
        default=False,
        description="Whether this server is currently running",
        alias="isRunning",
    )


class FrontendConfig(BaseModel):
    """
    Configuration returned to frontend.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    models: List[AIModelRuntime] = Field(
        default_factory=list,
        description=(
            "The models on offer — for an agent, its model and its "
            "model_additionals — each saying whether it can be used"
        ),
    )
    models_source: Literal["ai-inference", "local"] = Field(
        default="local",
        description=(
            "Who decided which models can be used: ai-inference's own list, "
            "or this runtime's configuration when it did not route through "
            "ai-inference or ai-inference did not answer"
        ),
        alias="modelsSource",
    )
    models_note: Optional[str] = Field(
        default=None,
        description="That decision in a sentence",
        alias="modelsNote",
    )
    judgment_models: List[AIModelRuntime] = Field(
        default_factory=list,
        description=(
            "The typed-judgment models ai-inference serves (Jev), apart from "
            "the models on offer: a decision asks them, no agent runs on them"
        ),
        alias="judgmentModels",
    )
    judgments_note: Optional[str] = Field(
        default=None,
        description="What a typed-judgment model is for, in a sentence",
        alias="judgmentsNote",
    )
    default_model: Optional[str] = Field(
        default=None,
        description="Default model ID to select",
        alias="defaultModel",
    )
    builtin_tools: List[BuiltinTool] = Field(
        default_factory=list,
        description="Available builtin tools",
        alias="builtinTools",
    )
    mcp_servers: List[MCPServer] = Field(
        default_factory=list,
        description="Configured MCP servers",
        alias="mcpServers",
    )
    disable_tool_approvals: bool = Field(
        default=False,
        description="Whether tool approvals are disabled for new agent launches",
        alias="disableToolApprovals",
    )
    suggestions: List[AgentSuggestion] = Field(
        default_factory=list,
        description="Chat suggestions to show users what this agent can do",
    )
    welcome_message: Optional[str] = Field(
        default=None,
        description="Welcome message shown when the chat is empty",
        alias="welcomeMessage",
    )
    prompt_history: List[str] = Field(
        default_factory=list,
        description=(
            "What has been sent to this agent, oldest first, for the composer's "
            "arrow keys to walk back through"
        ),
        alias="promptHistory",
    )


class A2ASubagentConfig(BaseModel):
    """Where a subagent reached over A2A lives, or how to launch it.

    Either ``url`` names an agent already running, or the subagent's ``ref``
    names the agentspec to launch one from — on the local agent-runtimes server
    when the parent runs locally and on a Datalayer runtime when it runs in the
    cloud (``launch: auto``, the default), or on one of those explicitly.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    url: Optional[str] = Field(
        default=None,
        description="JSON-RPC endpoint of an A2A agent already running",
    )
    launch: Literal["local", "cloud", "auto"] = Field(
        default="auto",
        description=(
            "Where to launch the agent named by `ref`: the local server, a "
            "Datalayer runtime, or whichever the parent runs on"
        ),
    )
    environment: Optional[str] = Field(
        default=None,
        description="Runtime environment for a cloud launch",
    )


class SubAgentspecConfig(BaseModel):
    """Configuration for a subagent within an agent specification.

    Maps to ``agent_runtimes.subagents.SubagentDefinition`` at runtime.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    name: str = Field(..., description="Unique identifier for the subagent")
    description: str = Field(
        ..., description="Brief description shown to the parent agent"
    )
    instructions: str = Field(
        default="",
        description=(
            "System prompt for the subagent. Optional when `ref` names an "
            "agentspec to take it from."
        ),
    )
    ref: Optional[str] = Field(
        default=None,
        description=(
            "An agentspec this subagent *is*, as `<id>:<version>`. A specialist "
            "defined once and referenced by many parents, rather than its "
            "instructions copy-pasted into each — which is how they drift."
        ),
    )
    a2a: Optional[A2ASubagentConfig] = Field(
        default=None,
        description=(
            "Reach this subagent over A2A, as a separate agent, instead of "
            "running it inside the parent's process"
        ),
    )
    model: Optional[str] = Field(
        default=None,
        description="LLM model to use (defaults to parent agent's model)",
    )
    can_ask_questions: Optional[bool] = Field(
        default=None,
        description="Whether the subagent can ask the parent for clarification",
        alias="canAskQuestions",
    )
    max_questions: Optional[int] = Field(
        default=None,
        description="Maximum questions the subagent may ask per task",
        alias="maxQuestions",
    )
    preferred_mode: Optional[Literal["sync", "async", "auto"]] = Field(
        default=None,
        description="Default execution mode preference: sync, async, or auto",
        alias="preferredMode",
    )
    typical_complexity: Optional[Literal["simple", "moderate", "complex"]] = Field(
        default=None,
        description="Typical task complexity hint for auto-mode selection",
        alias="typicalComplexity",
    )
    typically_needs_context: Optional[bool] = Field(
        default=None,
        description="Whether this subagent typically needs user context",
        alias="typicallyNeedsContext",
    )


class SubAgentsConfig(BaseModel):
    """Top-level subagents configuration for an agent specification."""

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    subagents: List[SubAgentspecConfig] = Field(
        default_factory=list,
        description="List of subagent configurations",
    )
    default_model: Optional[str] = Field(
        default=None,
        description="Default model for subagents that don't specify one",
        alias="defaultModel",
    )
    include_general_purpose: bool = Field(
        default=True,
        description="Include a general-purpose fallback subagent",
        alias="includeGeneralPurpose",
    )
    max_nesting_depth: int = Field(
        default=0,
        description="Maximum depth for nested subagent delegation (0 = no nesting)",
        alias="maxNestingDepth",
    )


#: The closed vocabulary of delegable work (ORCHESTRATOR.md, O2-07).
#:
#: `agents.discover --capability notebook.validate` has to match something,
#: and free text does not match: two specs saying "analysis" and "analyse"
#: describe the same work and find each other never. A closed list is also
#: what makes the answer to "what can this platform be asked to do" finite.
#:
#: The axis is **what work is delegated**, not who it is for. `domain` is the
#: vertical (accounting, insurance) and `tags` are categorisation; neither
#: says what an orchestrator may hand over, which is why this is its own field
#: rather than a reading of those.
#:
#: A `<subject>.<verb>` shape, so the subject is the thing the work is about
#: and the verb is what is done to it. Adding one is a deliberate act: it is
#: the vocabulary a third-party worker advertises against.
AGENT_CAPABILITIES: Dict[str, str] = {
    "notebook.run": "Execute a notebook and return it with its outputs.",
    "notebook.validate": "Check that a notebook runs clean, and say where it does not.",
    "notebook.author": "Write or edit a notebook to meet a stated objective.",
    "data.extract": "Pull structured records out of unstructured sources.",
    "data.transform": "Reshape, clean or join data that is already structured.",
    "data.acquire": "Fetch data from an external source into the platform.",
    "data.analyse": "Answer a question from data, with the working shown.",
    "data.visualise": "Produce charts or figures from data.",
    "document.summarise": "Reduce a document or a set of them to its substance.",
    "document.extract": "Pull named fields out of documents.",
    "document.author": "Write a document to a brief.",
    "report.author": "Produce a report from evidence that already exists.",
    "code.execute": "Run code in a sandbox and return what it produced.",
    "code.review": "Read code and report on it without changing it.",
    "research.gather": "Find and cite sources answering a question.",
    "workflow.orchestrate": "Break work down and delegate it to other agents.",
    "support.respond": "Answer a request on behalf of a team.",
}


class AgentCapability(BaseModel):
    """One kind of work an agent can be delegated, and what it takes and returns.

    This is the unit `agents.discover` matches on, and it maps onto an A2A
    agent card's `skills` entry — `id`, `name`, `description`, `tags` — so a
    Datalayer agentspec and a third-party A2A worker are discoverable through
    the same query rather than through two.

    `inputs` and `outputs` are the *contract* half, and the reason this is not
    simply a tag: an orchestrator choosing between two workers that both claim
    `data.analyse` needs to know which of them accepts a notebook reference
    and which returns one. They name context-reference kinds and artifact
    types, the vocabularies of sections 5.3 and 5.4.
    """

    id: str = Field(
        ...,
        description=(
            "One of AGENT_CAPABILITIES. Validated, because a capability "
            "nothing else uses the same spelling for is a capability nobody "
            "discovers."
        ),
    )
    name: str = Field(
        default="",
        description="Display label; the vocabulary's own description when empty.",
    )
    description: str = Field(
        default="",
        description="What this agent in particular does under that capability.",
    )
    inputs: List[str] = Field(
        default_factory=list,
        description=(
            "Context reference kinds it accepts — notebook, document, dataset, "
            "file, sandbox (section 5.3). Empty means it was not stated, which "
            "is not the same as accepting nothing."
        ),
    )
    outputs: List[str] = Field(
        default_factory=list,
        description=(
            "Artifact types it produces — notebook, report, dataset, file, "
            "cell_output, structured (section 5.4)."
        ),
    )
    tags: List[str] = Field(
        default_factory=list,
        description="Free text, for humans reading a catalogue; never matched on.",
    )

    @field_validator("id")
    @classmethod
    def _known(cls, value: str) -> str:
        """
        Refuse a capability the vocabulary does not have.

        Parameters
        ----------
        value : str
            The proposed capability id.

        Returns
        -------
        str
            The id, when it is in AGENT_CAPABILITIES.

        Raises
        ------
        ValueError
            When it is not. Adding one is an edit to AGENT_CAPABILITIES, on
            purpose: the vocabulary is a contract with everything that
            discovers against it.
        """
        if value not in AGENT_CAPABILITIES:
            known = ", ".join(sorted(AGENT_CAPABILITIES))
            raise ValueError(
                f"'{value}' is not a known capability. The vocabulary is a "
                f"closed list so that discovery matches: {known}. Add it to "
                "AGENT_CAPABILITIES if this is genuinely new work."
            )
        return value


class Agentspec(BaseModel):
    """
    Specification for an AI agent.

    Defines the configuration for a reusable agent template that can be
    instantiated as an agent runtime.
    """

    model_config = ConfigDict(populate_by_name=True, by_alias=True)

    id: str = Field(..., description="Unique agent identifier")
    version: str = Field(default="0.0.1", description="Agent version")
    name: str = Field(..., description="Display name for the agent")
    description: str = Field(default="", description="Agent description")
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")
    domain: Optional[str] = Field(
        default=None,
        description="Domain used to group agents in the gallery (e.g. 'earth-observation')",
        validation_alias=AliasChoices("domain", "vertical"),
    )
    enabled: bool = Field(default=True, description="Whether the agent is enabled")
    model: Optional[str] = Field(
        default=None,
        description="AI model identifier to use for this agent (e.g., 'bedrock:us.anthropic.claude-sonnet-4-5-20250929-v1:0')",
    )
    model_additionals: List[str] = Field(
        default_factory=list,
        description=(
            "Other models of the catalogue this agent may be switched to, "
            "beside its `model`. The runtime offers those of them its "
            "inference serves."
        ),
        alias="modelAdditionals",
    )
    inference_provider: Literal["local", "datalayer"] = Field(
        default="local",
        description=(
            "Inference provider routing strategy. "
            "Use 'local' for direct model provider calls (default) or "
            "'datalayer' to route through datalayer-ai-inference."
        ),
        alias="inferenceProvider",
    )

    @field_validator("model_additionals")
    @classmethod
    def _model_additionals_in_catalogue(cls, value: List[str]) -> List[str]:
        """An additional model the catalogue does not know is refused."""
        from agent_runtimes.specs.models import get_model

        unknown = [model_id for model_id in value if get_model(model_id) is None]
        if unknown:
            raise ValueError(
                f"model_additionals names models the catalogue does not know: "
                f"{', '.join(unknown)}."
            )
        return value

    @field_validator("inference_provider", mode="before")
    @classmethod
    def _normalize_inference_provider(cls, value: Any) -> str:
        # Keep backward compatibility with previously generated specs that used None.
        if value is None or value == "":
            return "local"
        return value

    mcp_servers: List[MCPServer] = Field(
        default_factory=list,
        description="MCP servers used by this agent",
        alias="mcpServers",
    )
    skills: List[str] = Field(
        default_factory=list,
        description="Skill IDs available to this agent",
    )
    tools: List[str] = Field(
        default_factory=list,
        description="Tool IDs available to this agent",
    )
    disable_tool_approvals: bool = Field(
        default=False,
        description=(
            "Disable tool approvals for this agent spec. "
            "When omitted, approvals are required by default."
        ),
        alias="disableToolApprovals",
    )
    frontend_tools: List[str] = Field(
        default_factory=list,
        description="Frontend tool IDs available to this agent",
        alias="frontendTools",
    )
    frontend_render_tools: List[FrontendRenderToolSpec] = Field(
        default_factory=list,
        description=(
            "Bindings of backend tools to frontend renderers so examples "
            "read the tool name and CSS filename from the spec instead of "
            "hardcoding them."
        ),
        alias="frontendRenderTools",
    )
    environment_name: str = Field(
        default="ai-agents-env",
        description="Runtime environment name for this agent",
        alias="environmentName",
    )
    icon: Optional[str] = Field(
        default=None,
        description="Octicon name for UI display",
    )
    emoji: Optional[str] = Field(
        default=None,
        description="Unicode emoji for UI display",
    )
    color: Optional[str] = Field(
        default=None,
        description="Theme color for the agent (hex code)",
    )
    suggestions: List[AgentSuggestion] = Field(
        default_factory=list,
        description="Chat suggestions to show users what this agent can do",
    )
    welcome_message: Optional[str] = Field(
        default=None,
        description="Welcome message shown when agent starts",
        alias="welcomeMessage",
    )
    welcome_notebook: Optional[str] = Field(
        default=None,
        description="Path to Jupyter notebook to show on agent creation",
        alias="welcomeNotebook",
    )
    welcome_document: Optional[str] = Field(
        default=None,
        description="Path to Lexical document to show on agent creation",
        alias="welcomeDocument",
    )
    harness: str = Field(
        default="pydantic-ai",
        description=(
            "Which agent framework runs this agent's loop. "
            "'pydantic-ai' (default) runs it server-side in the agent runtime; "
            "'vercel-ai' runs it in the browser with the Vercel AI SDK, for an "
            "agent that has to work with no server behind it. "
            "Distinct from `protocol`, which says how a client and an agent "
            "talk to each other rather than what runs the loop — the two can "
            "name the same word and mean different things."
        ),
        alias="harness",
    )

    sandbox_variant: Optional[str] = Field(
        default=None,
        description=(
            "Sandbox variant to use for this agent. "
            "Accepted values: 'eval' (default), 'jupyter-server' (Jupyter "
            "server), or a provider reached with its own credentials — "
            "'docker', 'datalayer', 'google-colab', 'kaggle', 'monty', "
            "'modal', 'daytona', 'cloudflare', 'coreweave', 'e2b'."
        ),
        alias="sandboxVariant",
    )
    system_prompt: Optional[str] = Field(
        default=None,
        description="System prompt for the agent",
        alias="systemPrompt",
    )
    system_prompt_codemode_addons: Optional[str] = Field(
        default=None,
        description="Additional system prompt instructions when codemode is enabled",
        alias="systemPromptCodemodeAddons",
    )
    goal: Optional[str] = Field(
        default=None,
        description="User-facing objective for the agent",
    )
    delegable: List[AgentCapability] = Field(
        default_factory=list,
        description=(
            "What work this agent can be delegated (ORCHESTRATOR.md, O2-07). "
            "`protocol` below says how it is reached; this says what it is "
            "worth reaching it for. Empty means the spec has not said, and "
            "discovery reports that rather than guessing from tags. "
            "Deliberately not called `capabilities`: that field already exists "
            "on this model and means pydantic-ai capability configurations — "
            "guardrails, budgets, memory — which are runtime behaviours "
            "attached to an agent rather than work an orchestrator may hand it."
        ),
    )
    protocol: Optional[str] = Field(
        default=None,
        description="Communication protocol (e.g., 'ag-ui', 'acp', 'a2a', 'vercel-ai')",
    )
    ui_plugin: Optional[str] = Field(
        default=None,
        description="UI plugin (e.g., 'a2ui', 'mcp-apps'), one of `agentspecs/ui-plugins`.",
        validation_alias=AliasChoices("uiPlugin", "ui_plugin"),
        serialization_alias="uiPlugin",
    )
    trigger: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Trigger configuration (type, cron, description)",
    )
    model_configuration: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Model configuration (temperature, max_tokens)",
        alias="modelConfig",
    )
    mcp_server_tools: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="MCP server tool configurations with approval settings",
        alias="mcpServerTools",
    )
    guardrails: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Guardrail configurations",
    )
    capabilities: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Optional pydantic-ai capability configurations",
    )
    evals: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Evaluation configurations",
    )
    codemode: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Codemode configuration (enabled, token_reduction, speedup)",
    )
    output: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Output configuration (type/formats, template)",
    )
    advanced: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Advanced settings (cost_limit, time_limit, max_iterations, validation)",
    )
    checkpoints: Optional[Dict[str, Any]] = Field(
        default=None,
        description=(
            "Conversation checkpoint configuration: enabled, frequency "
            "(every_turn, every_tool, manual_only), max_checkpoints, store "
            "(in_memory, file)."
        ),
    )
    authorization_policy: Optional[str] = Field(
        default=None,
        description="Authorization policy",
        alias="authorizationPolicy",
    )
    notifications: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Notification configuration (email, slack)",
    )
    memory: Optional[str] = Field(
        default=None,
        description="Memory backend identifier (e.g., 'ephemeral', 'mem0', 'memu', 'simplemem')",
    )
    memory_config: Optional[Dict[str, Any]] = Field(
        default=None,
        alias="memoryConfig",
        description="Optional backend-specific memory configuration (for example Mem0 faiss/pgvector settings).",
    )
    pre_hooks: Optional[Dict[str, Any]] = Field(
        default=None,
        description=(
            "Pre-launch hooks. Supported keys: 'packages' (pip packages) and "
            "'sandbox' (Python code string or list of strings)."
        ),
        alias="preHooks",
    )
    post_hooks: Optional[Dict[str, Any]] = Field(
        default=None,
        description=(
            "Post-stop hooks. Supported keys: 'sandbox' (Python code string or "
            "list of strings)."
        ),
        alias="postHooks",
    )
    tool_hooks: Optional[Dict[str, Any]] = Field(
        default=None,
        description=(
            "Per-tool-call hooks. Supported keys: 'before_tool_execute', "
            "'after_tool_execute', 'on_tool_execute_error', and "
            "'deferred_tool_calls'. Hook steps can be plain Python (python) or "
            "module function references (function)."
        ),
        alias="toolHooks",
    )
    parameters: Optional[Dict[str, Any]] = Field(
        default=None,
        description="JSON schema describing agent launch parameters.",
    )
    subagents: Optional[SubAgentsConfig] = Field(
        default=None,
        description=(
            "Subagent delegation configuration. When set, the agent can "
            "delegate tasks to specialised child agents via the in-repo "
            "SubagentsCapability."
        ),
    )


class CogSpec(BaseModel):
    """An AI worker you can hold to account (`agentspecs/cogs`).

    A Cog extends an agent spec and is equipped with Frames. In the generated
    catalogue it is resolved: `spec` is the agent it extends with the Cog's
    changes, the Frames' skills, tools and MCP servers added, and their
    context rendered onto the system prompt.
    """

    id: str = Field(..., description="Unique Cog identifier")
    version: str = Field(default="0.0.1", description="Specification version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="What the Cog does")
    agent: str = Field(..., description="The id of the agent spec it extends")
    frames: List[str] = Field(
        default_factory=list, description="The Frames it works under, in order"
    )
    lineage: List[str] = Field(
        default_factory=list,
        description=(
            "Every Frame that contributed: the named ones and those they inherit from"
        ),
    )
    kind: str = Field(
        default="context",
        description="What the Cog packages: context, model or combined",
    )
    enabled: bool = Field(default=False, description="Whether it is offered today")
    guards: List[FrameGuardSpec] = Field(
        default_factory=list,
        description="The Guards its Frames declare: what its output answers to",
    )
    spec: Agentspec = Field(
        ..., description="The Cog as an agent spec, resolved and ready to launch"
    )


class GuardSignalSpec(BaseModel):
    """Something a Guard reports, which a Gate's condition reads."""

    name: str = Field(..., description="The name a Gate's `when` uses")
    type: str = Field(default="boolean", description="boolean, number or string")
    description: str = Field(default="", description="What it measures")


class GuardSpec(GuardrailSpec):
    """A reusable check (`agentspecs/guards`): a Guard extends a guardrail.

    The guardrail is the policy; the Guard verifies that the work stayed
    within it. In the generated catalogue a Guard is resolved: it carries the
    guardrail's permissions, data scope and handling, and limits, under its
    own identity, and `guardrail` names the guardrail it extends.
    """

    guardrail: str = Field(..., description="The id of the guardrail it extends")
    category: str = Field(
        ...,
        description=(
            "algorithmic, source-grounding, consensus, expert, policy-safety, "
            "regression-drift or outcome"
        ),
    )
    stages: List[str] = Field(
        default_factory=list,
        description="preflight, in_flight, post_run, continuous: where it may run",
    )
    method: str = Field(default="algorithmic", description="algorithmic, cog or human")
    check: str = Field(default="", description="What is verified")
    signals: List[GuardSignalSpec] = Field(
        default_factory=list, description="What it reports for a Gate to decide on"
    )
    required: bool = Field(
        default=True, description="Whether the work counts only once it has passed"
    )
    enabled: bool = Field(default=True, description="Whether an Op may name it")
    tags: List[str] = Field(default_factory=list)
    icon: Optional[str] = Field(default=None, description="Icon identifier")
    emoji: Optional[str] = Field(default=None, description="Emoji representation")


class GateSpec(BaseModel):
    """A decision point of an Op (`agentspecs/gates`): Guards check, Gates decide."""

    id: str = Field(..., description="Unique Gate identifier")
    version: str = Field(default="0.0.1", description="Specification version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="What decision it makes")
    stage: str = Field(default="post_run", description="The stage it decides at")
    guards: List[str] = Field(
        default_factory=list, description="The Guards whose results it reads"
    )
    when: str = Field(
        ..., description="The condition on its Guards' signals, or `always`"
    )
    then: str = Field(..., description="What happens when the condition holds")
    otherwise: str = Field(
        default="proceed", description="What happens when it does not"
    )
    signals: List[str] = Field(
        default_factory=list, description="The signals the condition reads"
    )
    reviewers: List[str] = Field(
        default_factory=list, description="The roles a decision is handed to"
    )
    max_retries: int = Field(default=0, description="How often `retry` may be decided")
    enabled: bool = Field(default=True, description="Whether an Op may name it")
    tags: List[str] = Field(default_factory=list)
    icon: Optional[str] = Field(default=None, description="Icon identifier")
    emoji: Optional[str] = Field(default=None, description="Emoji representation")


class TrackSpec(BaseModel):
    """What evidence a run keeps, and for how long (`agentspecs/tracks`)."""

    id: str = Field(..., description="Unique Track identifier")
    version: str = Field(default="0.0.1", description="Specification version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="What the record is for")
    retain_for: str = Field(..., description="The retention, e.g. `7_years`")
    retention_days: int = Field(default=0, description="The retention, as days")
    include: List[str] = Field(
        default_factory=list, description="What a record has to include"
    )
    readers: List[str] = Field(
        default_factory=list, description="The roles that may read a record"
    )
    redact: List[str] = Field(
        default_factory=list, description="Field patterns kept out of the record"
    )
    feeds_memory: bool = Field(
        default=False,
        description="Whether corrections and overrides feed Organizational Memory",
    )
    exchangeable: bool = Field(
        default=False, description="Whether a record may leave the Hub: it may not"
    )
    enabled: bool = Field(default=True, description="Whether an Op may name it")
    tags: List[str] = Field(default_factory=list)
    icon: Optional[str] = Field(default=None, description="Icon identifier")
    emoji: Optional[str] = Field(default=None, description="Emoji representation")


class OpCogSpec(BaseModel):
    """A Cog as an Op names it."""

    id: str = Field(..., description="The Cog, in the Cog catalogue")
    agent: str = Field(..., description="The agent spec the Cog extends")
    frames: List[str] = Field(default_factory=list, description="The Cog's Frames")
    kind: str = Field(default="context", description="What the Cog packages")


class OpSupervisorSpec(BaseModel):
    """What coordinates the Cogs of an Op."""

    model: str = Field(..., description="The model that supervises")
    instructions: str = Field(default="", description="How the Cogs are sequenced")


class OpGuardsSpec(BaseModel):
    """The Guards of an Op, by the stage they run at, each resolved."""

    preflight: List[GuardSpec] = Field(default_factory=list)
    in_flight: List[GuardSpec] = Field(default_factory=list)
    post_run: List[GuardSpec] = Field(default_factory=list)
    continuous: List[GuardSpec] = Field(default_factory=list)


class OpSpec(BaseModel):
    """An orchestrated, supervised workflow (`agentspecs/ops`).

    Cogs do the work; a validation strategy says how it is verified: Guards
    by stage, the Gates that decide, and the Track kept as evidence. In the
    generated catalogue an Op is resolved: everything it names is in it.
    """

    id: str = Field(..., description="Unique Op identifier")
    version: str = Field(default="0.0.1", description="Specification version")
    name: str = Field(..., description="Display name")
    description: str = Field(default="", description="The outcome it produces")
    owner: str = Field(..., description="Who is accountable for the outcome")
    goal: str = Field(default="", description="What a run is asked to achieve")
    cogs: List[OpCogSpec] = Field(
        default_factory=list, description="The Cogs that do the work"
    )
    frames: List[str] = Field(
        default_factory=list, description="Frames applied at the workflow level"
    )
    lineage: List[str] = Field(
        default_factory=list,
        description="Every Frame that orients the Op, its Cogs' included",
    )
    supervisor: OpSupervisorSpec = Field(..., description="What coordinates the Cogs")
    guards: OpGuardsSpec = Field(
        default_factory=OpGuardsSpec, description="The Guards, by stage"
    )
    frame_guards: List[FrameGuardSpec] = Field(
        default_factory=list, description="The checks its Frames declare"
    )
    gates: List[GateSpec] = Field(
        default_factory=list, description="The Gates, in the order they are met"
    )
    track: TrackSpec = Field(..., description="The Track kept as evidence")
    triggers: List[str] = Field(
        default_factory=list, description="launcher, command, button, schedule"
    )
    enabled: bool = Field(default=False, description="Whether it is offered today")
    tags: List[str] = Field(default_factory=list)
    icon: Optional[str] = Field(default=None, description="Icon identifier")
    emoji: Optional[str] = Field(default=None, description="Emoji representation")
    color: Optional[str] = Field(default=None, description="Accent colour")


class ActionConditionSpec(BaseModel):
    """An argument that makes a tool do something more than its own class."""

    argument: str = Field(..., description="The argument of the call")
    equals: List[Union[bool, int, float, str]] = Field(
        default_factory=list, description="Holds when the argument is any of these"
    )
    includes: List[Union[bool, int, float, str]] = Field(
        default_factory=list,
        description="Holds when the argument's values include any of these",
    )
    classes: List[str] = Field(
        default_factory=list, description="What the tool is then, besides its own"
    )


class ServerActionsSpec(BaseModel):
    """What the tools of an MCP server do to the world (`agentspecs.actions`)."""

    checked: Optional[str] = Field(
        default=None,
        description="The day the tool names were read off the running server; None when nobody looked",
    )
    default: List[str] = Field(
        default_factory=list,
        description="The classes of a tool nothing else names; empty means unknown",
    )
    tools: Dict[str, List[str]] = Field(
        default_factory=dict,
        description="What each tool does of its own, by name or pattern",
    )
    conditions: Dict[str, List[ActionConditionSpec]] = Field(
        default_factory=dict,
        description="What an argument makes a tool do besides, by tool",
    )


class AppConnectionSpec(BaseModel):
    """Something an application reaches."""

    model_config = ConfigDict(populate_by_name=True)

    server: str = Field(..., description="An MCP server, `id` or `id:version`")
    access: str = Field(default="read", description="`read` or `write`")
    acts_as: str = Field(
        default="owner",
        alias="as",
        description="In whose name: `owner` or `user`",
    )
    only: List[str] = Field(
        default_factory=list,
        description="The tools it may use, by name or pattern; all when empty",
    )


class AppRuleSpec(BaseModel):
    """When an application acts alone, and when it asks."""

    action: str = Field(..., description="The action, in the words a person reads")
    applies_to: List[str] = Field(
        default_factory=list,
        description="Classes of action, or tools (`server.tool`), the rule applies to",
    )
    behaviour: str = Field(
        ..., description="`do_it`, `if_asked`, `ask_first` or `leave_to_me`"
    )


class AppSpaceGrantSpec(BaseModel):
    """A Space an application may reach."""

    space: str
    access: str = Field(default="read", description="`read` or `write`")


class AppComputerSpec(BaseModel):
    """What an application may do on its own computer; each off until turned on."""

    browse: bool = False
    files: bool = False
    shell: bool = False


class AppPermissionsSpec(BaseModel):
    """What an application may reach beside its connections. Nothing, unless said."""

    spaces: List[AppSpaceGrantSpec] = Field(default_factory=list)
    computer: AppComputerSpec = Field(default_factory=AppComputerSpec)


class AppStarterSpec(BaseModel):
    """A first message offered to the user."""

    label: str
    message: str


class AppSettingSpec(BaseModel):
    """Something the user may set for their session."""

    id: str
    type: str = Field(..., description="`select`, `text`, `toggle`, `slider`, `number`")
    label: str
    options: List[str] = Field(default_factory=list)
    default: Optional[Union[str, bool, float]] = None
    min: Optional[float] = None
    max: Optional[float] = None


class AppSurfaceSpec(BaseModel):
    """The component tree a user meets, over the approved catalog (A2UI)."""

    protocol: str = Field(default="a2ui/v0.9")
    components: List[Dict[str, Any]] = Field(default_factory=list)
    composed_by: str = Field(default="")
    composed_at: str = Field(default="")


class AppInterfaceSpec(BaseModel):
    """What the user of an application sees."""

    layout: str = Field(default="chat", description="`chat`, `page` or `split`")
    accent: str = Field(default="green", description="The application's one colour")
    welcome: str = Field(default="")
    starters: List[AppStarterSpec] = Field(default_factory=list)
    settings: List[AppSettingSpec] = Field(default_factory=list)
    components: List[str] = Field(
        default_factory=list,
        description="The components of the catalog the surface may use",
    )
    surface: Optional[AppSurfaceSpec] = None
    assistant: Optional[str] = Field(
        default=None,
        description=(
            "The character its floating assistant shows: `paperclip`, `wizard`, "
            "`cat` or `eyes`; the paper clip when unsaid"
        ),
    )


class AppTestCaseSpec(BaseModel):
    """An example of what an application should do, in plain words."""

    ask: str
    expect: str


class AppTestsSpec(BaseModel):
    """How an application is verified."""

    ready_at: float = Field(
        default=0.8, description="The share of tests that has to pass"
    )
    evalset: str = Field(default="")
    cases: List[AppTestCaseSpec] = Field(default_factory=list)


class AppRecordSpec(BaseModel):
    """What is kept of what an application did, and for how long."""

    keep_for: str = Field(default="1_years")
    retention_days: int = Field(default=365, description="The retention, as days")
    include: List[str] = Field(default_factory=list)


class AppChecksSpec(BaseModel):
    """Optional checks from the catalogue."""

    guards: List[str] = Field(default_factory=list)
    gates: List[str] = Field(default_factory=list)
    track: str = Field(default="")


class AppHostedSpec(BaseModel):
    """An application at an address of its own."""

    visibility: str = Field(default="private")
    slug: str = Field(default="")


class AppEmbeddedSpec(BaseModel):
    """An application inside another product's page."""

    mode: str = Field(
        default="inline", description="`inline`, `bubble`, `panel` or `assistant`"
    )
    origins: List[str] = Field(default_factory=list)


class AppDeploymentSpec(BaseModel):
    """Where an application goes."""

    hosted: Optional[AppHostedSpec] = None
    embedded: Optional[AppEmbeddedSpec] = None


class AppTriggerSpec(BaseModel):
    """What starts a worker's work."""

    type: str = Field(..., description="`schedule`, `event` or `once`")
    cron: str = Field(default="")
    event: str = Field(default="")
    at: str = Field(default="")
    description: str = Field(default="")
    prompt: str = Field(default="")


class AppCriterionSpec(BaseModel):
    """What an alternative is judged on."""

    name: str
    kind: str = Field(default="metric")
    weight: float = Field(default=1)
    instructions: str = Field(default="")
    options: List[str] = Field(default_factory=list)
    direction: str = Field(default="higher")
    measure: str = Field(default="")


class AppScenarioSpec(BaseModel):
    """A named set of weights."""

    name: str
    weights: Dict[str, float] = Field(default_factory=dict)


class AppDecisionSpec(BaseModel):
    """What a decision application decides."""

    question: str
    alternatives: List[str] = Field(default_factory=list)
    criteria: List[AppCriterionSpec] = Field(default_factory=list)
    min_confidence: float = Field(default=0)
    scenarios: List[AppScenarioSpec] = Field(default_factory=list)
    judgment_model: str = Field(default="")


class AppSpec(BaseModel):
    """An application (`agentspecs/apps`): the Appspec.

    An agent with an interface, rules, tests and a place to run: a chat, a
    widget, a decision or a worker. It stands alone — Guards, Gates and a
    Track are optional, under `checks`. In the generated catalogue it carries
    its layout, and what it names that is not enabled (`setup`).
    """

    model_config = ConfigDict(populate_by_name=True)

    schema_: str = Field(
        default="loop.app/v1", alias="schema", description="The version of the spec"
    )
    id: str = Field(..., description="Unique application identifier")
    version: str = Field(default="0.0.1", description="Application version")
    name: str = Field(..., description="Display name")
    kind: str = Field(..., description="`chat`, `widget`, `decision` or `worker`")
    description: str = Field(default="", description="What it does")
    owner: str = Field(default="", description="Who answers for it")
    agent: str = Field(default="", description="The agent or Cog that does the work")
    team: str = Field(default="", description="Or a team of them")
    instructions: str = Field(default="")
    model: str = Field(default="")
    skills: List[str] = Field(default_factory=list)
    tools: List[str] = Field(default_factory=list)
    context: List[str] = Field(
        default_factory=list, description="The Frames it works under"
    )
    contents: List[str] = Field(
        default_factory=list, description="The documents it answers from"
    )
    connections: List[AppConnectionSpec] = Field(default_factory=list)
    rules: List[AppRuleSpec] = Field(default_factory=list)
    permissions: AppPermissionsSpec = Field(default_factory=AppPermissionsSpec)
    interface: AppInterfaceSpec = Field(default_factory=AppInterfaceSpec)
    tests: AppTestsSpec = Field(default_factory=AppTestsSpec)
    record: AppRecordSpec = Field(default_factory=AppRecordSpec)
    checks: AppChecksSpec = Field(default_factory=AppChecksSpec)
    deployment: AppDeploymentSpec = Field(default_factory=AppDeploymentSpec)
    goal: str = Field(default="", description="For a worker: what it works toward")
    triggers: List[AppTriggerSpec] = Field(default_factory=list)
    memory: str = Field(default="")
    notifications: List[str] = Field(default_factory=list)
    decision: Optional[AppDecisionSpec] = None
    setup: List[str] = Field(
        default_factory=list,
        description="What it names that is not enabled today, in sentences",
    )
    enabled: bool = Field(default=True, description="Whether it is offered today")
    tags: List[str] = Field(default_factory=list)
    icon: Optional[str] = Field(default=None, description="Icon identifier")
    emoji: str = Field(
        default="\U0001f440",
        description="Its face: one emoji, shown wherever the application appears",
    )
    avatar: str = Field(
        default="",
        description="Its avatar, by name, from the drawings people choose theirs from; its emoji when unsaid",
    )
    banner: str = Field(
        default="",
        description="Its banner, by name, from the set people choose theirs from; the one its id seeds when unsaid",
    )


class TeamSubagentspec(BaseModel):
    """A specialist a team member may hand work to.

    The same shape as a subagent on an agent spec: delegation is one idea, and
    it should be written the same way wherever it appears.
    """

    name: str = Field(..., description="How the member addresses it, e.g. `@CellFixer`")
    ref: str = Field(
        default="", description="Agent catalogue reference, `id` or `id:version`"
    )
    description: str = Field(
        default="", description="What it is for, and when to reach for it"
    )
    instructions: str = Field(
        default="", description="System prompt, for a subagent defined only here"
    )

    model_config = {"populate_by_name": True}


class TeamAgentspec(BaseModel):
    """Specification for an agent within a team."""

    id: str = Field(..., description="Agent identifier within the team")
    name: str = Field(default="", description="Display name for the team agent")
    ref: str = Field(
        default="",
        description=(
            "Agent catalogue reference, `id` or `id:version`. A member that "
            "names one inherits its model, tools, prompt and subagents; the "
            "fields below then say what is different about it in this team."
        ),
    )
    role: str = Field(
        default="contributor",
        description="Structural role: coordinator, initiator, contributor, reviewer or finalizer",
    )
    goal: str = Field(default="", description="Goal or objective for this agent")
    depends_on: list[str] = Field(
        default_factory=list,
        description=(
            "Member ids that must finish first. What makes the running order "
            "computable — it replaced a prose `trigger` that read well and "
            "could not be executed."
        ),
        alias="dependsOn",
    )
    subagents: list[TeamSubagentspec] = Field(
        default_factory=list, description="Specialists this member may delegate to"
    )
    model: str = Field(default="", description="AI model identifier")
    mcp_server: str = Field(
        default="", description="MCP server used by this agent", alias="mcpServer"
    )
    tools: list[str] = Field(
        default_factory=list, description="Tools available to this agent"
    )
    trigger: str = Field(
        default="",
        description=(
            "What starts this member from outside the team — an event, a "
            "schedule. Distinct from `depends_on`, which is what it waits for "
            "inside."
        ),
    )
    approval: str = Field(
        default="auto", description="Approval policy: 'auto' or 'manual'"
    )

    model_config = {"populate_by_name": True}


class TeamDelegationSpec(BaseModel):
    """How far members may hand work to each other, and to subagents."""

    max_depth: int = Field(
        default=2,
        description="Levels of delegation allowed; 0 forbids it",
        alias="maxDepth",
    )
    allow_peer_delegation: bool = Field(
        default=False,
        description="Whether a member may hand work to another member",
        alias="allowPeerDelegation",
    )
    include_general_purpose: bool = Field(
        default=False,
        description="Whether members also get the general-purpose subagent",
        alias="includeGeneralPurpose",
    )

    model_config = {"populate_by_name": True}


class TeamContextSpec(BaseModel):
    """What each member of a team is told about the conversation so far.

    The two things every multi-agent framework does, named rather than assumed:

    - ``shared`` — one thread, and every member is sent all of it. What a
      supervisor team wants: routing only makes sense if the member receiving
      the work can see what was already said. AutoGen group chats, LangGraph
      supervisors and OpenAI handoffs all work this way.
    - ``isolated`` — a thread per member, swapped when the person switches.
      What a delegation model wants: the child runs blind and returns a result,
      as Claude Code subagents and CrewAI tasks do. Choose it when members
      would mislead each other more than they would help.
    - ``own-turns`` — one thread on screen, but each member is sent only the
      turns it took part in. For a team whose members share a person but not a
      subject; deliberately makes what the reader sees differ from what the
      model sees, which is a cost worth naming.

    It is a team's property rather than a runtime's setting because it follows
    from what the team *is*: the jupyter team routes between an analyst, a
    tutor, a compactor and the rest, and a compactor that cannot see what the
    learner was just told would undo the explanation.
    """

    sharing: str = Field(
        default="shared",
        description=(
            "How much of the conversation each member is given: 'shared' "
            "(all of it), 'isolated' (its own thread), or 'own-turns' (one "
            "thread, but only its own turns are sent)"
        ),
    )

    model_config = {"populate_by_name": True}


class TeamSupervisorSpec(BaseModel):
    """The agent that routes work within a team.

    Required on a team. A team is not a list of agents — it is a list of agents
    plus someone deciding what happens next, and a spec that leaves that out
    describes a set, not a team.
    """

    name: str = Field(..., description="Display name for the supervisor")
    ref: str = Field(
        default="",
        description="Agent catalogue reference, `id` or `id:version`",
    )
    model: str = Field(
        default="", description="Model id, overriding the referenced agent's"
    )
    goal: str = Field(
        default="",
        description="What the supervisor is accountable for across the whole run",
    )
    instructions: str = Field(
        default="",
        description="Supervision prompt, for a supervisor defined only here",
    )
    approval: str = Field(
        default="auto",
        description="Whether a person signs off the routing decisions",
    )
    can_terminate: bool = Field(
        default=True,
        description=(
            "Whether the supervisor may end the run before every member has "
            "gone. False makes it a router only."
        ),
        alias="canTerminate",
    )

    model_config = {"populate_by_name": True}


class TeamValidationSpec(BaseModel):
    """Validation settings for a team."""

    timeout: Optional[str] = Field(
        default=None, description="Maximum execution time (e.g., '300s')"
    )
    retry_on_failure: bool = Field(
        default=False, description="Whether to retry on failure", alias="retryOnFailure"
    )
    max_retries: int = Field(
        default=0, description="Maximum number of retries", alias="maxRetries"
    )

    model_config = {"populate_by_name": True}


class TeamReactionRule(BaseModel):
    """A reaction rule for automated team responses."""

    id: str = Field(..., description="Unique reaction rule identifier")
    trigger: str = Field(..., description="Event or condition that triggers this rule")
    action: str = Field(..., description="Action to take when triggered")
    auto: bool = Field(
        default=True, description="Whether the rule executes automatically"
    )
    max_retries: int = Field(
        default=1, description="Maximum retry attempts", alias="maxRetries"
    )
    escalate_after_retries: int = Field(
        default=1,
        description="Escalate after this many retries",
        alias="escalateAfterRetries",
    )
    priority: str = Field(
        default="medium",
        description="Priority level: 'low', 'medium', 'high', 'critical'",
    )

    model_config = {"populate_by_name": True}


class TeamHealthMonitoring(BaseModel):
    """Health monitoring configuration for a team."""

    heartbeat_interval: str = Field(
        default="30s",
        description="Interval between heartbeat checks",
        alias="heartbeatInterval",
    )
    stale_threshold: str = Field(
        default="120s",
        description="Time before an agent is considered stale",
        alias="staleThreshold",
    )
    unresponsive_threshold: str = Field(
        default="300s",
        description="Time before an agent is considered unresponsive",
        alias="unresponsiveThreshold",
    )
    stuck_threshold: str = Field(
        default="600s",
        description="Time before an agent is considered stuck",
        alias="stuckThreshold",
    )
    max_restart_attempts: int = Field(
        default=3,
        description="Maximum restart attempts for unhealthy agents",
        alias="maxRestartAttempts",
    )

    model_config = {"populate_by_name": True}


class TeamOutputSpec(BaseModel):
    """Output configuration for a team."""

    formats: list[str] = Field(
        default_factory=list, description="Output formats (e.g., 'pdf', 'csv', 'json')"
    )
    template: str = Field(default="", description="Report template name")
    storage: str = Field(default="", description="Storage location (e.g., S3 path)")


class TeamSuggestionSpec(BaseModel):
    """An opener offered at a team's front door.

    The same shape as an agent's — see `AgentSuggestion`. Two classes rather
    than one because the runtime's team types are generated from a catalogue
    that the agent types are not, and a shared base would tie the two
    generators together for the sake of three fields.
    """

    text: str = Field(..., description="What is sent when the suggestion is taken")
    summary: Optional[str] = Field(
        default=None,
        description="A few words shown as the label; the text is then the tooltip",
    )
    icon: Optional[str] = Field(
        default=None, description="Octicon name to show beside it"
    )
    emoji: Optional[str] = Field(
        default=None, description="Unicode emoji to show beside it"
    )


class TeamSpec(BaseModel):
    """Specification for a multi-agent team."""

    id: str = Field(..., description="Unique team identifier")
    version: str = Field(default="0.0.1", description="Team spec version")
    name: str = Field(..., description="Display name for the team")
    description: str = Field(default="", description="Team description")
    tags: list[str] = Field(default_factory=list, description="Classification tags")
    enabled: bool = Field(default=False, description="Whether the team is enabled")
    icon: str = Field(default="people", description="Icon identifier")
    emoji: str = Field(default="👥", description="Emoji representation")
    color: str = Field(default="#8250df", description="Theme color (hex)")
    agent_spec_id: str = Field(
        ...,
        description="ID of the associated agent spec",
        alias="agentSpecId",
    )
    #: How the team is meant to be coordinated once teams execute.
    #:
    #: Every value here names a protocol for which no adapter is registered
    #: yet: `datalayer` is the durable control plane of
    #: PLAN_ORCHESTRATOR.md O1-01, `a2a` and `acp` its two adapters (O0-06,
    #: O0-07). The field is an intention until one of them lands, and the
    #: literal type is what keeps it from naming a protocol nobody is
    #: building — it used to be a free string defaulting to `datalayer`,
    #: which read as a protocol that exists (O0-15).
    orchestration_protocol: Literal["datalayer", "a2a", "acp"] = Field(
        default="datalayer",
        description=(
            "Orchestration protocol a team is meant to be coordinated by. "
            "No adapter is registered for any of these yet, so a team is a "
            "definition and this is an intention."
        ),
        alias="orchestrationProtocol",
    )
    execution_mode: str = Field(
        default="sequential",
        description="Execution mode: 'sequential' or 'parallel'",
        alias="executionMode",
    )
    supervisor: Optional[TeamSupervisorSpec] = Field(
        default=None,
        description="Supervisor agent configuration",
    )
    routing_instructions: str = Field(
        default="",
        description="Instructions for routing tasks between agents",
        alias="routingInstructions",
    )
    suggestions: list[TeamSuggestionSpec] = Field(
        default_factory=list,
        description=(
            "Openers shown in an empty chat, so a person arriving at a team "
            "sees what it can be asked rather than an empty box. At the team "
            "level because they describe the team's front door: the "
            "supervisor answers first, and what it is worth asking is a "
            "property of the whole team rather than of any one member."
        ),
    )
    validation: Optional[TeamValidationSpec] = Field(
        default=None,
        description="Validation settings for the team",
    )
    delegation: TeamDelegationSpec = Field(
        default_factory=TeamDelegationSpec,
        description="How far members may hand work to each other, and to subagents",
    )
    context: TeamContextSpec = Field(
        default_factory=TeamContextSpec,
        description="What each member is told about the conversation so far",
    )
    agents: list[TeamAgentspec] = Field(
        default_factory=list,
        description="List of agents in the team",
    )
    reaction_rules: list[TeamReactionRule] = Field(
        default_factory=list,
        description="Automated reaction rules",
        alias="reactionRules",
    )
    health_monitoring: Optional[TeamHealthMonitoring] = Field(
        default=None,
        description="Health monitoring configuration",
        alias="healthMonitoring",
    )
    output: Optional[TeamOutputSpec] = Field(
        default=None,
        description="Output configuration",
    )

    model_config = {"populate_by_name": True}
