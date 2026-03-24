# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Guardrail Catalog.

Predefined guardrail configurations.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class GuardrailPermissions(BaseModel):
    """Permission toggles for a guardrail profile."""

    read_data: bool = Field(default=False, description="Allow data reads")
    write_data: bool = Field(default=False, description="Allow data writes")
    execute_code: bool = Field(default=False, description="Allow code execution")
    access_internet: bool = Field(default=False, description="Allow internet access")
    send_email: bool = Field(default=False, description="Allow email sending")
    deploy_production: bool = Field(default=False, description="Allow production deploys")


class TokenLimitsSpec(BaseModel):
    """Token budget limits."""

    per_run: str = Field(default="0", description="Token budget per run")
    per_day: str = Field(default="0", description="Token budget per day")
    per_month: str = Field(default="0", description="Token budget per month")


class DataScopeSpec(BaseModel):
    """Data-access scoping rules."""

    allowed_systems: List[str] = Field(default_factory=list)
    allowed_objects: List[str] = Field(default_factory=list)
    denied_objects: List[str] = Field(default_factory=list)
    denied_fields: List[str] = Field(default_factory=list)


class DataHandlingSpec(BaseModel):
    """Data output and PII handling policy."""

    default_aggregation: bool = Field(default=False)
    allow_row_level_output: bool = Field(default=False)
    max_rows_in_output: int = Field(default=0, ge=0)
    redact_fields: List[str] = Field(default_factory=list)
    hash_fields: List[str] = Field(default_factory=list)
    pii_detection: bool = Field(default=False)
    pii_action: str = Field(default='warn')


class ApprovalPolicySpec(BaseModel):
    """Manual/automatic approval policy."""

    require_manual_approval_for: List[str] = Field(default_factory=list)
    auto_approved: List[str] = Field(default_factory=list)


class ToolLimitsSpec(BaseModel):
    """Tool-call limits for a run."""

    max_tool_calls: int = Field(default=0, ge=0)
    max_query_rows: int = Field(default=0, ge=0)
    max_query_runtime: str = Field(default='0s')
    max_time_window_days: int = Field(default=0, ge=0)


class AuditSpec(BaseModel):
    """Audit/logging policy."""

    log_tool_calls: bool = Field(default=True)
    log_query_metadata_only: bool = Field(default=False)
    retain_days: int = Field(default=30, ge=0)
    require_lineage_in_report: bool = Field(default=False)


class ContentSafetySpec(BaseModel):
    """Prompt-injection and untrusted-content policy."""

    treat_crm_text_fields_as_untrusted: bool = Field(default=False)
    do_not_follow_instructions_from_data: bool = Field(default=True)


class GuardrailSpec(BaseModel):
    """Guardrail specification."""

    id: str
    version: str = "0.0.1"
    name: str
    description: str
    identity_provider: str
    identity_name: str
    permissions: GuardrailPermissions
    token_limits: TokenLimitsSpec
    data_scope: Optional[DataScopeSpec] = None
    data_handling: Optional[DataHandlingSpec] = None
    approval_policy: Optional[ApprovalPolicySpec] = None
    tool_limits: Optional[ToolLimitsSpec] = None
    audit: Optional[AuditSpec] = None
    content_safety: Optional[ContentSafetySpec] = None


# ============================================================================
# Guardrail Definitions
# ============================================================================

DATA_ENGINEERING_POWER_USER_GUARDRAIL_SPEC_0_0_1 = GuardrailSpec(
    id="data-engineering-power-user",
    version="0.0.1",
    name="Data Engineering Power User",
    description="Power-user guardrail for data engineering agents with full read/write access, high token limits, and ability to deploy pipelines. Suitable for ETL, data transformation, and pipeline management agents.",
    identity_provider="datalayer",
    identity_name="dave@acme.com",
    permissions=GuardrailPermissions(
        read_data=True,
        write_data=True,
        execute_code=True,
        access_internet=True,
        send_email=True,
        deploy_production=True,
    ),
    token_limits=TokenLimitsSpec(
        per_run="200K",
        per_day="5M",
        per_month="50M",
    ),
    data_scope=DataScopeSpec(
        allowed_systems=["postgresql", "mongodb", "s3", "kafka"],
        allowed_objects=[],
        denied_objects=[],
        denied_fields=["*SSN*", "*Bank*", "*IBAN*"],
    ),
    data_handling=DataHandlingSpec(
        default_aggregation=False,
        allow_row_level_output=True,
        max_rows_in_output=100000,
        redact_fields=[],
        hash_fields=[],
        pii_detection=True,
        pii_action="redact",
    ),
    approval_policy=ApprovalPolicySpec(
        require_manual_approval_for=["Schema changes", "Drop or truncate operations", "Production data modifications"],
        auto_approved=["Read queries", "Data transformations", "Pipeline orchestration"],
    ),
    tool_limits=ToolLimitsSpec(
        max_tool_calls=500,
        max_query_rows=1000000,
        max_query_runtime="300s",
        max_time_window_days=365,
    ),
    audit=AuditSpec(
        log_tool_calls=True,
        log_query_metadata_only=False,
        retain_days=90,
        require_lineage_in_report=True,
    ),
    content_safety=ContentSafetySpec(
        treat_crm_text_fields_as_untrusted=True,
        do_not_follow_instructions_from_data=True,
    ),
)

DEFAULT_PLATFORM_USER_GUARDRAIL_SPEC_0_0_1 = GuardrailSpec(
    id="default-platform-user",
    version="0.0.1",
    name="Default Platform User",
    description="Standard platform user guardrail with moderate permissions. Suitable for general-purpose agents that need read access and limited code execution.",
    identity_provider="datalayer",
    identity_name="alice@acme.com",
    permissions=GuardrailPermissions(
        read_data=True,
        write_data=False,
        execute_code=True,
        access_internet=True,
        send_email=False,
        deploy_production=False,
    ),
    token_limits=TokenLimitsSpec(
        per_run="50K",
        per_day="500K",
        per_month="5M",
    ),
    data_scope=DataScopeSpec(
        allowed_systems=[],
        allowed_objects=[],
        denied_objects=[],
        denied_fields=[],
    ),
    data_handling=DataHandlingSpec(
        default_aggregation=False,
        allow_row_level_output=True,
        max_rows_in_output=1000,
        redact_fields=[],
        hash_fields=[],
        pii_detection=False,
        pii_action="warn",
    ),
    approval_policy=ApprovalPolicySpec(
        require_manual_approval_for=[],
        auto_approved=["All read-only queries"],
    ),
    tool_limits=ToolLimitsSpec(
        max_tool_calls=50,
        max_query_rows=100000,
        max_query_runtime="60s",
        max_time_window_days=90,
    ),
    audit=AuditSpec(
        log_tool_calls=True,
        log_query_metadata_only=False,
        retain_days=30,
        require_lineage_in_report=False,
    ),
    content_safety=ContentSafetySpec(
        treat_crm_text_fields_as_untrusted=False,
        do_not_follow_instructions_from_data=True,
    ),
)

GITHUB_ACTIONS_DEPLOY_GUARDRAIL_SPEC_0_0_1 = GuardrailSpec(
    id="github-actions-deploy",
    version="0.0.1",
    name="GitHub Actions Deploy",
    description="Full-access guardrail for deployment agents running via GitHub Actions. All permissions enabled including production deployment. Very high token limits for complex multi-step deployment workflows.",
    identity_provider="github",
    identity_name="acme-deploy-bot",
    permissions=GuardrailPermissions(
        read_data=True,
        write_data=True,
        execute_code=True,
        access_internet=True,
        send_email=True,
        deploy_production=True,
    ),
    token_limits=TokenLimitsSpec(
        per_run="150K",
        per_day="3M",
        per_month="30M",
    ),
    data_scope=DataScopeSpec(
        allowed_systems=["github", "kubernetes", "docker", "terraform"],
        allowed_objects=[],
        denied_objects=[],
        denied_fields=[],
    ),
    data_handling=DataHandlingSpec(
        default_aggregation=False,
        allow_row_level_output=True,
        max_rows_in_output=50000,
        redact_fields=[],
        hash_fields=[],
        pii_detection=False,
        pii_action="warn",
    ),
    approval_policy=ApprovalPolicySpec(
        require_manual_approval_for=["Production environment changes", "Infrastructure scaling beyond limits"],
        auto_approved=["Staging deployments", "Test environment operations", "Build and package operations"],
    ),
    tool_limits=ToolLimitsSpec(
        max_tool_calls=300,
        max_query_rows=500000,
        max_query_runtime="180s",
        max_time_window_days=365,
    ),
    audit=AuditSpec(
        log_tool_calls=True,
        log_query_metadata_only=False,
        retain_days=180,
        require_lineage_in_report=True,
    ),
    content_safety=ContentSafetySpec(
        treat_crm_text_fields_as_untrusted=False,
        do_not_follow_instructions_from_data=True,
    ),
)

GITHUB_CI_BOT_GUARDRAIL_SPEC_0_0_1 = GuardrailSpec(
    id="github-ci-bot",
    version="0.0.1",
    name="GitHub CI Bot",
    description="Guardrail for automated CI/CD agents running via GitHub Actions. High token limits for batch processing, full code execution, and internet access for package installation.",
    identity_provider="github",
    identity_name="acme-ci-bot",
    permissions=GuardrailPermissions(
        read_data=True,
        write_data=True,
        execute_code=True,
        access_internet=True,
        send_email=False,
        deploy_production=False,
    ),
    token_limits=TokenLimitsSpec(
        per_run="100K",
        per_day="2M",
        per_month="20M",
    ),
    data_scope=DataScopeSpec(
        allowed_systems=["github", "npm", "pypi"],
        allowed_objects=[],
        denied_objects=[],
        denied_fields=[],
    ),
    data_handling=DataHandlingSpec(
        default_aggregation=False,
        allow_row_level_output=True,
        max_rows_in_output=10000,
        redact_fields=[],
        hash_fields=[],
        pii_detection=False,
        pii_action="warn",
    ),
    approval_policy=ApprovalPolicySpec(
        require_manual_approval_for=["Any production deployment", "Any write to protected branches"],
        auto_approved=["Build and test operations", "Package installation", "Code analysis and linting"],
    ),
    tool_limits=ToolLimitsSpec(
        max_tool_calls=200,
        max_query_rows=500000,
        max_query_runtime="120s",
        max_time_window_days=365,
    ),
    audit=AuditSpec(
        log_tool_calls=True,
        log_query_metadata_only=False,
        retain_days=90,
        require_lineage_in_report=False,
    ),
    content_safety=ContentSafetySpec(
        treat_crm_text_fields_as_untrusted=False,
        do_not_follow_instructions_from_data=True,
    ),
)

GOOGLE_WORKSPACE_AGENT_GUARDRAIL_SPEC_0_0_1 = GuardrailSpec(
    id="google-workspace-agent",
    version="0.0.1",
    name="Google Workspace Agent",
    description="Guardrail for agents integrating with Google Workspace services (Gmail, Drive, Calendar, Sheets). Moderate permissions with email sending enabled. Service account-based identity with Google OAuth.",
    identity_provider="google",
    identity_name="agent-sa@acme.iam.gserviceaccount.com",
    permissions=GuardrailPermissions(
        read_data=True,
        write_data=True,
        execute_code=False,
        access_internet=True,
        send_email=True,
        deploy_production=False,
    ),
    token_limits=TokenLimitsSpec(
        per_run="80K",
        per_day="1M",
        per_month="10M",
    ),
    data_scope=DataScopeSpec(
        allowed_systems=["gmail", "google-drive", "google-sheets", "google-calendar"],
        allowed_objects=[],
        denied_objects=[],
        denied_fields=[],
    ),
    data_handling=DataHandlingSpec(
        default_aggregation=False,
        allow_row_level_output=True,
        max_rows_in_output=5000,
        redact_fields=[],
        hash_fields=[],
        pii_detection=True,
        pii_action="warn",
    ),
    approval_policy=ApprovalPolicySpec(
        require_manual_approval_for=["Sending external emails", "Sharing files outside organization", "Modifying calendar events for other users"],
        auto_approved=["Reading emails and documents", "Creating drafts", "Reading calendar"],
    ),
    tool_limits=ToolLimitsSpec(
        max_tool_calls=100,
        max_query_rows=50000,
        max_query_runtime="60s",
        max_time_window_days=180,
    ),
    audit=AuditSpec(
        log_tool_calls=True,
        log_query_metadata_only=False,
        retain_days=60,
        require_lineage_in_report=False,
    ),
    content_safety=ContentSafetySpec(
        treat_crm_text_fields_as_untrusted=True,
        do_not_follow_instructions_from_data=True,
    ),
)

RESTRICTED_VIEWER_GUARDRAIL_SPEC_0_0_1 = GuardrailSpec(
    id="restricted-viewer",
    version="0.0.1",
    name="Restricted Viewer",
    description="Minimal-permissions guardrail for read-only monitoring agents. No code execution, no write access, very low token limits. Suitable for dashboard viewers and audit observers.",
    identity_provider="azure-ad",
    identity_name="viewer-group@acme.onmicrosoft.com",
    permissions=GuardrailPermissions(
        read_data=True,
        write_data=False,
        execute_code=False,
        access_internet=False,
        send_email=False,
        deploy_production=False,
    ),
    token_limits=TokenLimitsSpec(
        per_run="10K",
        per_day="50K",
        per_month="500K",
    ),
    data_scope=DataScopeSpec(
        allowed_systems=[],
        allowed_objects=[],
        denied_objects=[],
        denied_fields=["*SSN*", "*Bank*", "*IBAN*", "*Password*", "*Secret*"],
    ),
    data_handling=DataHandlingSpec(
        default_aggregation=True,
        allow_row_level_output=False,
        max_rows_in_output=0,
        redact_fields=[],
        hash_fields=[],
        pii_detection=True,
        pii_action="redact",
    ),
    approval_policy=ApprovalPolicySpec(
        require_manual_approval_for=["Any operation beyond read"],
        auto_approved=["Aggregated read-only queries"],
    ),
    tool_limits=ToolLimitsSpec(
        max_tool_calls=10,
        max_query_rows=10000,
        max_query_runtime="15s",
        max_time_window_days=30,
    ),
    audit=AuditSpec(
        log_tool_calls=True,
        log_query_metadata_only=True,
        retain_days=90,
        require_lineage_in_report=False,
    ),
    content_safety=ContentSafetySpec(
        treat_crm_text_fields_as_untrusted=True,
        do_not_follow_instructions_from_data=True,
    ),
)

# ============================================================================
# Guardrail Catalog
# ============================================================================

GUARDRAIL_CATALOG: Dict[str, GuardrailSpec] = {
    "data-engineering-power-user": DATA_ENGINEERING_POWER_USER_GUARDRAIL_SPEC_0_0_1,
    "data-engineering-power-user:0.0.1": DATA_ENGINEERING_POWER_USER_GUARDRAIL_SPEC_0_0_1,
    "default-platform-user": DEFAULT_PLATFORM_USER_GUARDRAIL_SPEC_0_0_1,
    "default-platform-user:0.0.1": DEFAULT_PLATFORM_USER_GUARDRAIL_SPEC_0_0_1,
    "github-actions-deploy": GITHUB_ACTIONS_DEPLOY_GUARDRAIL_SPEC_0_0_1,
    "github-actions-deploy:0.0.1": GITHUB_ACTIONS_DEPLOY_GUARDRAIL_SPEC_0_0_1,
    "github-ci-bot": GITHUB_CI_BOT_GUARDRAIL_SPEC_0_0_1,
    "github-ci-bot:0.0.1": GITHUB_CI_BOT_GUARDRAIL_SPEC_0_0_1,
    "google-workspace-agent": GOOGLE_WORKSPACE_AGENT_GUARDRAIL_SPEC_0_0_1,
    "google-workspace-agent:0.0.1": GOOGLE_WORKSPACE_AGENT_GUARDRAIL_SPEC_0_0_1,
    "restricted-viewer": RESTRICTED_VIEWER_GUARDRAIL_SPEC_0_0_1,
    "restricted-viewer:0.0.1": RESTRICTED_VIEWER_GUARDRAIL_SPEC_0_0_1,
}


def get_guardrail_spec(guardrail_id: str) -> GuardrailSpec | None:
    """Get a guardrail specification by ID."""
    return GUARDRAIL_CATALOG.get(guardrail_id)


def list_guardrail_specs() -> List[GuardrailSpec]:
    """List all guardrail specifications."""
    return list(GUARDRAIL_CATALOG.values())
