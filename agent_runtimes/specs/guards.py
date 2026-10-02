# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Guard Catalog.

Reusable checks: a Guard extends a guardrail — the policy it verifies.
Every Guard is resolved: it carries that guardrail's policy.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict

from agent_runtimes.types import GuardSpec

# ============================================================================
# Guard Definitions
# ============================================================================

CONFIDENCE_GUARD_0_0_1 = GuardSpec.model_validate(
    {
        "identity_provider": "datalayer",
        "identity_name": "alice@acme.com",
        "permissions": {
            "read_data": True,
            "write_data": False,
            "execute_code": True,
            "access_internet": True,
            "send_email": False,
            "deploy_production": False,
        },
        "token_limits": {"per_run": "50K", "per_day": "500K", "per_month": "5M"},
        "data_scope": {
            "allowed_systems": [],
            "allowed_objects": [],
            "denied_objects": [],
            "denied_fields": [],
        },
        "data_handling": {
            "default_aggregation": False,
            "allow_row_level_output": True,
            "max_rows_in_output": 1000,
            "redact_fields": [],
            "hash_fields": [],
            "pii_detection": False,
            "pii_action": "warn",
        },
        "approval_policy": {
            "require_manual_approval_for": [],
            "auto_approved": ["All read-only queries"],
        },
        "tool_limits": {
            "max_tool_calls": 50,
            "max_query_rows": 100000,
            "max_query_runtime": "60s",
            "max_time_window_days": 90,
        },
        "audit": {
            "log_tool_calls": True,
            "log_query_metadata_only": False,
            "retain_days": 30,
            "require_lineage_in_report": False,
        },
        "content_safety": {
            "treat_crm_text_fields_as_untrusted": False,
            "do_not_follow_instructions_from_data": True,
        },
        "id": "confidence-guard",
        "version": "0.0.1",
        "name": "Confidence Guard",
        "description": "Collects the confidence each Cog reports on its result, and the lowest of them for the run, so that a Gate can route unsure work to a person.",
        "category": "algorithmic",
        "stages": ["in_flight", "post_run"],
        "method": "algorithmic",
        "check": "Each Cog result carries a confidence between 0 and 1; the Guard reports the lowest, and fails when a result carries none.",
        "signals": [
            {
                "name": "confidence",
                "type": "number",
                "description": "The lowest confidence a Cog reported, between 0 and 1.",
            }
        ],
        "required": True,
        "enabled": True,
        "tags": ["confidence"],
        "guardrail": "default-platform-user",
    }
)

CONSENSUS_GUARD_0_0_1 = GuardSpec.model_validate(
    {
        "identity_provider": "datalayer",
        "identity_name": "alice@acme.com",
        "permissions": {
            "read_data": True,
            "write_data": False,
            "execute_code": True,
            "access_internet": True,
            "send_email": False,
            "deploy_production": False,
        },
        "token_limits": {"per_run": "50K", "per_day": "500K", "per_month": "5M"},
        "data_scope": {
            "allowed_systems": [],
            "allowed_objects": [],
            "denied_objects": [],
            "denied_fields": [],
        },
        "data_handling": {
            "default_aggregation": False,
            "allow_row_level_output": True,
            "max_rows_in_output": 1000,
            "redact_fields": [],
            "hash_fields": [],
            "pii_detection": False,
            "pii_action": "warn",
        },
        "approval_policy": {
            "require_manual_approval_for": [],
            "auto_approved": ["All read-only queries"],
        },
        "tool_limits": {
            "max_tool_calls": 50,
            "max_query_rows": 100000,
            "max_query_runtime": "60s",
            "max_time_window_days": 90,
        },
        "audit": {
            "log_tool_calls": True,
            "log_query_metadata_only": False,
            "retain_days": 30,
            "require_lineage_in_report": False,
        },
        "content_safety": {
            "treat_crm_text_fields_as_untrusted": False,
            "do_not_follow_instructions_from_data": True,
        },
        "id": "consensus-guard",
        "version": "0.0.1",
        "name": "Consensus Guard",
        "description": "Recomputes the key figures by an independent path — another Cog, or the same Cog on another model — and measures how far the two disagree.",
        "category": "consensus",
        "stages": ["post_run"],
        "method": "cog",
        "check": "The key figures of the output are recomputed independently; the Guard reports the share of them on which the two paths disagree.",
        "signals": [
            {
                "name": "consensus_disagreement",
                "type": "number",
                "description": "The share of key figures on which independent paths disagree, between 0 and 1.",
            }
        ],
        "required": True,
        "enabled": True,
        "tags": ["consensus", "verification"],
        "guardrail": "default-platform-user",
    }
)

DATA_SOURCE_AUTHORIZATION_GUARD_0_0_1 = GuardSpec.model_validate(
    {
        "identity_provider": "datalayer",
        "identity_name": "dave@acme.com",
        "permissions": {
            "read_data": True,
            "write_data": True,
            "execute_code": True,
            "access_internet": True,
            "send_email": True,
            "deploy_production": True,
        },
        "token_limits": {"per_run": "200K", "per_day": "5M", "per_month": "50M"},
        "data_scope": {
            "allowed_systems": ["postgresql", "mongodb", "s3", "kafka"],
            "allowed_objects": [],
            "denied_objects": [],
            "denied_fields": ["*SSN*", "*Bank*", "*IBAN*"],
        },
        "data_handling": {
            "default_aggregation": False,
            "allow_row_level_output": True,
            "max_rows_in_output": 100000,
            "redact_fields": [],
            "hash_fields": [],
            "pii_detection": True,
            "pii_action": "redact",
        },
        "approval_policy": {
            "require_manual_approval_for": [
                "Schema changes",
                "Drop or truncate operations",
                "Production data modifications",
            ],
            "auto_approved": [
                "Read queries",
                "Data transformations",
                "Pipeline orchestration",
            ],
        },
        "tool_limits": {
            "max_tool_calls": 500,
            "max_query_rows": 1000000,
            "max_query_runtime": "300s",
            "max_time_window_days": 365,
        },
        "audit": {
            "log_tool_calls": True,
            "log_query_metadata_only": False,
            "retain_days": 90,
            "require_lineage_in_report": True,
        },
        "content_safety": {
            "treat_crm_text_fields_as_untrusted": True,
            "do_not_follow_instructions_from_data": True,
        },
        "id": "data-source-authorization-guard",
        "version": "0.0.1",
        "name": "Data Source Authorization Guard",
        "description": "Checks that each system, object and field the Op is about to read is inside the data scope of the guardrail, and that no denied field is requested.",
        "category": "policy-safety",
        "stages": ["preflight"],
        "method": "algorithmic",
        "check": "Every data source named by the run is among the guardrail's allowed systems and objects; none is a denied object or matches a denied field.",
        "signals": [
            {
                "name": "unauthorized_source",
                "type": "boolean",
                "description": "A data source outside the allowed scope is requested.",
            }
        ],
        "required": True,
        "enabled": True,
        "tags": ["data", "authorization"],
        "guardrail": "data-engineering-power-user",
    }
)

EXPERT_SAMPLING_GUARD_0_0_1 = GuardSpec.model_validate(
    {
        "identity_provider": "datalayer",
        "identity_name": "alice@acme.com",
        "permissions": {
            "read_data": True,
            "write_data": False,
            "execute_code": True,
            "access_internet": True,
            "send_email": False,
            "deploy_production": False,
        },
        "token_limits": {"per_run": "50K", "per_day": "500K", "per_month": "5M"},
        "data_scope": {
            "allowed_systems": [],
            "allowed_objects": [],
            "denied_objects": [],
            "denied_fields": [],
        },
        "data_handling": {
            "default_aggregation": False,
            "allow_row_level_output": True,
            "max_rows_in_output": 1000,
            "redact_fields": [],
            "hash_fields": [],
            "pii_detection": False,
            "pii_action": "warn",
        },
        "approval_policy": {
            "require_manual_approval_for": [],
            "auto_approved": ["All read-only queries"],
        },
        "tool_limits": {
            "max_tool_calls": 50,
            "max_query_rows": 100000,
            "max_query_runtime": "60s",
            "max_time_window_days": 90,
        },
        "audit": {
            "log_tool_calls": True,
            "log_query_metadata_only": False,
            "retain_days": 30,
            "require_lineage_in_report": False,
        },
        "content_safety": {
            "treat_crm_text_fields_as_untrusted": False,
            "do_not_follow_instructions_from_data": True,
        },
        "id": "expert-sampling-guard",
        "version": "0.0.1",
        "name": "Expert Sampling Guard",
        "description": "Routes the output — every one of a high-risk Op, a sample of the others — to a named expert, and records what they decided.",
        "category": "expert",
        "stages": ["post_run"],
        "method": "human",
        "check": "An expert in the subject reads the output and its evidence, and approves it, edits it or sends it back.",
        "signals": [
            {
                "name": "expert_approved",
                "type": "boolean",
                "description": "The expert approved the output.",
            },
            {
                "name": "high_risk",
                "type": "boolean",
                "description": "The output is of a kind every instance of which is reviewed.",
            },
        ],
        "required": True,
        "enabled": True,
        "tags": ["expert", "review"],
        "guardrail": "default-platform-user",
    }
)

OUTCOME_GUARD_0_0_1 = GuardSpec.model_validate(
    {
        "identity_provider": "datalayer",
        "identity_name": "alice@acme.com",
        "permissions": {
            "read_data": True,
            "write_data": False,
            "execute_code": True,
            "access_internet": True,
            "send_email": False,
            "deploy_production": False,
        },
        "token_limits": {"per_run": "50K", "per_day": "500K", "per_month": "5M"},
        "data_scope": {
            "allowed_systems": [],
            "allowed_objects": [],
            "denied_objects": [],
            "denied_fields": [],
        },
        "data_handling": {
            "default_aggregation": False,
            "allow_row_level_output": True,
            "max_rows_in_output": 1000,
            "redact_fields": [],
            "hash_fields": [],
            "pii_detection": False,
            "pii_action": "warn",
        },
        "approval_policy": {
            "require_manual_approval_for": [],
            "auto_approved": ["All read-only queries"],
        },
        "tool_limits": {
            "max_tool_calls": 50,
            "max_query_rows": 100000,
            "max_query_runtime": "60s",
            "max_time_window_days": 90,
        },
        "audit": {
            "log_tool_calls": True,
            "log_query_metadata_only": False,
            "retain_days": 30,
            "require_lineage_in_report": False,
        },
        "content_safety": {
            "treat_crm_text_fields_as_untrusted": False,
            "do_not_follow_instructions_from_data": True,
        },
        "id": "outcome-guard",
        "version": "0.0.1",
        "name": "Outcome Guard",
        "description": "Measures, over time, whether the Op's outputs are used as intended: accepted without rework, on time, with the decision they were made for taken.",
        "category": "outcome",
        "stages": ["continuous"],
        "method": "human",
        "check": "Over the review period, the share of outputs accepted without rework by the people they were produced for meets the Op's goal.",
        "signals": [
            {
                "name": "outcome_met",
                "type": "boolean",
                "description": "The Op met its outcome goal over the review period.",
            }
        ],
        "required": False,
        "enabled": True,
        "tags": ["outcome", "value"],
        "guardrail": "default-platform-user",
    }
)

PERMISSION_GUARD_0_0_1 = GuardSpec.model_validate(
    {
        "identity_provider": "datalayer",
        "identity_name": "alice@acme.com",
        "permissions": {
            "read_data": True,
            "write_data": False,
            "execute_code": True,
            "access_internet": True,
            "send_email": False,
            "deploy_production": False,
        },
        "token_limits": {"per_run": "50K", "per_day": "500K", "per_month": "5M"},
        "data_scope": {
            "allowed_systems": [],
            "allowed_objects": [],
            "denied_objects": [],
            "denied_fields": [],
        },
        "data_handling": {
            "default_aggregation": False,
            "allow_row_level_output": True,
            "max_rows_in_output": 1000,
            "redact_fields": [],
            "hash_fields": [],
            "pii_detection": False,
            "pii_action": "warn",
        },
        "approval_policy": {
            "require_manual_approval_for": [],
            "auto_approved": ["All read-only queries"],
        },
        "tool_limits": {
            "max_tool_calls": 50,
            "max_query_rows": 100000,
            "max_query_runtime": "60s",
            "max_time_window_days": 90,
        },
        "audit": {
            "log_tool_calls": True,
            "log_query_metadata_only": False,
            "retain_days": 30,
            "require_lineage_in_report": False,
        },
        "content_safety": {
            "treat_crm_text_fields_as_untrusted": False,
            "do_not_follow_instructions_from_data": True,
        },
        "id": "permission-guard",
        "version": "0.0.1",
        "name": "Permission Guard",
        "description": "Checks that the person or the system launching the Op holds every permission the Op's Cogs need, as the guardrail states them.",
        "category": "policy-safety",
        "stages": ["preflight"],
        "method": "algorithmic",
        "check": "Each permission the Op's Cogs use is granted to the launching identity by the guardrail; nothing the guardrail denies is requested.",
        "signals": [
            {
                "name": "permission_denied",
                "type": "boolean",
                "description": "A permission the Op needs is not granted.",
            }
        ],
        "required": True,
        "enabled": True,
        "tags": ["permissions", "identity"],
        "guardrail": "default-platform-user",
    }
)

REGRESSION_GUARD_0_0_1 = GuardSpec.model_validate(
    {
        "identity_provider": "datalayer",
        "identity_name": "dave@acme.com",
        "permissions": {
            "read_data": True,
            "write_data": True,
            "execute_code": True,
            "access_internet": True,
            "send_email": True,
            "deploy_production": True,
        },
        "token_limits": {"per_run": "200K", "per_day": "5M", "per_month": "50M"},
        "data_scope": {
            "allowed_systems": ["postgresql", "mongodb", "s3", "kafka"],
            "allowed_objects": [],
            "denied_objects": [],
            "denied_fields": ["*SSN*", "*Bank*", "*IBAN*"],
        },
        "data_handling": {
            "default_aggregation": False,
            "allow_row_level_output": True,
            "max_rows_in_output": 100000,
            "redact_fields": [],
            "hash_fields": [],
            "pii_detection": True,
            "pii_action": "redact",
        },
        "approval_policy": {
            "require_manual_approval_for": [
                "Schema changes",
                "Drop or truncate operations",
                "Production data modifications",
            ],
            "auto_approved": [
                "Read queries",
                "Data transformations",
                "Pipeline orchestration",
            ],
        },
        "tool_limits": {
            "max_tool_calls": 500,
            "max_query_rows": 1000000,
            "max_query_runtime": "300s",
            "max_time_window_days": 365,
        },
        "audit": {
            "log_tool_calls": True,
            "log_query_metadata_only": False,
            "retain_days": 90,
            "require_lineage_in_report": True,
        },
        "content_safety": {
            "treat_crm_text_fields_as_untrusted": True,
            "do_not_follow_instructions_from_data": True,
        },
        "id": "regression-guard",
        "version": "0.0.1",
        "name": "Regression Guard",
        "description": "Replays a golden set of past runs after a model, a Frame, a Cog or the Op itself changes, and compares the results with the validated ones.",
        "category": "regression-drift",
        "stages": ["continuous"],
        "method": "algorithmic",
        "check": "On the golden set, the share of runs whose output departs from the validated one stays under the threshold the Op's owner set.",
        "signals": [
            {
                "name": "regression_rate",
                "type": "number",
                "description": "The share of golden runs whose output changed, between 0 and 1.",
            }
        ],
        "required": False,
        "enabled": True,
        "tags": ["regression", "drift"],
        "guardrail": "data-engineering-power-user",
    }
)

REQUIRED_FRAME_GUARD_0_0_1 = GuardSpec.model_validate(
    {
        "identity_provider": "datalayer",
        "identity_name": "alice@acme.com",
        "permissions": {
            "read_data": True,
            "write_data": False,
            "execute_code": True,
            "access_internet": True,
            "send_email": False,
            "deploy_production": False,
        },
        "token_limits": {"per_run": "50K", "per_day": "500K", "per_month": "5M"},
        "data_scope": {
            "allowed_systems": [],
            "allowed_objects": [],
            "denied_objects": [],
            "denied_fields": [],
        },
        "data_handling": {
            "default_aggregation": False,
            "allow_row_level_output": True,
            "max_rows_in_output": 1000,
            "redact_fields": [],
            "hash_fields": [],
            "pii_detection": False,
            "pii_action": "warn",
        },
        "approval_policy": {
            "require_manual_approval_for": [],
            "auto_approved": ["All read-only queries"],
        },
        "tool_limits": {
            "max_tool_calls": 50,
            "max_query_rows": 100000,
            "max_query_runtime": "60s",
            "max_time_window_days": 90,
        },
        "audit": {
            "log_tool_calls": True,
            "log_query_metadata_only": False,
            "retain_days": 30,
            "require_lineage_in_report": False,
        },
        "content_safety": {
            "treat_crm_text_fields_as_untrusted": False,
            "do_not_follow_instructions_from_data": True,
        },
        "id": "required-frame-guard",
        "version": "0.0.1",
        "name": "Required Frame Guard",
        "description": "Checks, before any work starts, that every Frame the Op and its Cogs declare exists, is enabled and has been applied to the Cogs' context.",
        "category": "policy-safety",
        "stages": ["preflight"],
        "method": "algorithmic",
        "check": "Every Frame named by the Op and by its Cogs resolves, is enabled, and appears in the context each Cog was given.",
        "signals": [
            {
                "name": "frames_missing",
                "type": "boolean",
                "description": "A declared Frame is absent, disabled or was not applied.",
            }
        ],
        "required": True,
        "enabled": True,
        "tags": ["frames", "configuration"],
        "guardrail": "default-platform-user",
    }
)

SCHEMA_GUARD_0_0_1 = GuardSpec.model_validate(
    {
        "identity_provider": "datalayer",
        "identity_name": "alice@acme.com",
        "permissions": {
            "read_data": True,
            "write_data": False,
            "execute_code": True,
            "access_internet": True,
            "send_email": False,
            "deploy_production": False,
        },
        "token_limits": {"per_run": "50K", "per_day": "500K", "per_month": "5M"},
        "data_scope": {
            "allowed_systems": [],
            "allowed_objects": [],
            "denied_objects": [],
            "denied_fields": [],
        },
        "data_handling": {
            "default_aggregation": False,
            "allow_row_level_output": True,
            "max_rows_in_output": 1000,
            "redact_fields": [],
            "hash_fields": [],
            "pii_detection": False,
            "pii_action": "warn",
        },
        "approval_policy": {
            "require_manual_approval_for": [],
            "auto_approved": ["All read-only queries"],
        },
        "tool_limits": {
            "max_tool_calls": 50,
            "max_query_rows": 100000,
            "max_query_runtime": "60s",
            "max_time_window_days": 90,
        },
        "audit": {
            "log_tool_calls": True,
            "log_query_metadata_only": False,
            "retain_days": 30,
            "require_lineage_in_report": False,
        },
        "content_safety": {
            "treat_crm_text_fields_as_untrusted": False,
            "do_not_follow_instructions_from_data": True,
        },
        "id": "schema-guard",
        "version": "0.0.1",
        "name": "Schema Guard",
        "description": "Validates the structure of the output against the schema the Op's output declares: required sections, fields, types.",
        "category": "algorithmic",
        "stages": ["post_run"],
        "method": "algorithmic",
        "check": "The output validates against its declared schema: every required section and field is present and of the declared type.",
        "signals": [
            {
                "name": "schema_valid",
                "type": "boolean",
                "description": "The output conforms to its schema.",
            }
        ],
        "required": True,
        "enabled": True,
        "tags": ["schema", "structure"],
        "guardrail": "default-platform-user",
    }
)

SENSITIVE_DATA_GUARD_0_0_1 = GuardSpec.model_validate(
    {
        "identity_provider": "azure-ad",
        "identity_name": "viewer-group@acme.onmicrosoft.com",
        "permissions": {
            "read_data": True,
            "write_data": False,
            "execute_code": False,
            "access_internet": False,
            "send_email": False,
            "deploy_production": False,
        },
        "token_limits": {"per_run": "10K", "per_day": "50K", "per_month": "500K"},
        "data_scope": {
            "allowed_systems": [],
            "allowed_objects": [],
            "denied_objects": [],
            "denied_fields": ["*SSN*", "*Bank*", "*IBAN*", "*Password*", "*Secret*"],
        },
        "data_handling": {
            "default_aggregation": True,
            "allow_row_level_output": False,
            "max_rows_in_output": 0,
            "redact_fields": [],
            "hash_fields": [],
            "pii_detection": True,
            "pii_action": "redact",
        },
        "approval_policy": {
            "require_manual_approval_for": ["Any operation beyond read"],
            "auto_approved": ["Aggregated read-only queries"],
        },
        "tool_limits": {
            "max_tool_calls": 10,
            "max_query_rows": 10000,
            "max_query_runtime": "15s",
            "max_time_window_days": 30,
        },
        "audit": {
            "log_tool_calls": True,
            "log_query_metadata_only": True,
            "retain_days": 90,
            "require_lineage_in_report": False,
        },
        "content_safety": {
            "treat_crm_text_fields_as_untrusted": True,
            "do_not_follow_instructions_from_data": True,
        },
        "id": "sensitive-data-guard",
        "version": "0.0.1",
        "name": "Sensitive Data Guard",
        "description": "Detects personal data, credentials and the guardrail's denied fields in what a Cog is about to send out, and in the final output.",
        "category": "policy-safety",
        "stages": ["in_flight", "post_run"],
        "method": "algorithmic",
        "check": "No output, tool argument or outbound message contains a credential, a field matching the guardrail's denied fields, or personal data the guardrail's handling rules require to be redacted.",
        "signals": [
            {
                "name": "sensitive_data_detected",
                "type": "boolean",
                "description": "Sensitive data was found where it must not be.",
            }
        ],
        "required": True,
        "enabled": True,
        "tags": ["privacy", "pii", "secrets"],
        "guardrail": "restricted-viewer",
    }
)

SOURCE_GROUNDING_GUARD_0_0_1 = GuardSpec.model_validate(
    {
        "identity_provider": "datalayer",
        "identity_name": "alice@acme.com",
        "permissions": {
            "read_data": True,
            "write_data": False,
            "execute_code": True,
            "access_internet": True,
            "send_email": False,
            "deploy_production": False,
        },
        "token_limits": {"per_run": "50K", "per_day": "500K", "per_month": "5M"},
        "data_scope": {
            "allowed_systems": [],
            "allowed_objects": [],
            "denied_objects": [],
            "denied_fields": [],
        },
        "data_handling": {
            "default_aggregation": False,
            "allow_row_level_output": True,
            "max_rows_in_output": 1000,
            "redact_fields": [],
            "hash_fields": [],
            "pii_detection": False,
            "pii_action": "warn",
        },
        "approval_policy": {
            "require_manual_approval_for": [],
            "auto_approved": ["All read-only queries"],
        },
        "tool_limits": {
            "max_tool_calls": 50,
            "max_query_rows": 100000,
            "max_query_runtime": "60s",
            "max_time_window_days": 90,
        },
        "audit": {
            "log_tool_calls": True,
            "log_query_metadata_only": False,
            "retain_days": 30,
            "require_lineage_in_report": False,
        },
        "content_safety": {
            "treat_crm_text_fields_as_untrusted": False,
            "do_not_follow_instructions_from_data": True,
        },
        "id": "source-grounding-guard",
        "version": "0.0.1",
        "name": "Source Grounding Guard",
        "description": "Checks each claim and each figure of the output against the sources and the computations the run used: a figure traces to the code that produced it.",
        "category": "source-grounding",
        "stages": ["post_run"],
        "method": "cog",
        "check": "Every factual claim cites a source that supports it, and every figure equals the value computed in the sandbox from the authorized data.",
        "signals": [
            {
                "name": "unsupported_claims",
                "type": "number",
                "description": "How many claims or figures have no supporting source or computation.",
            }
        ],
        "required": True,
        "enabled": True,
        "tags": ["sources", "evidence"],
        "guardrail": "default-platform-user",
    }
)

TOOL_USE_POLICY_GUARD_0_0_1 = GuardSpec.model_validate(
    {
        "identity_provider": "datalayer",
        "identity_name": "alice@acme.com",
        "permissions": {
            "read_data": True,
            "write_data": False,
            "execute_code": True,
            "access_internet": True,
            "send_email": False,
            "deploy_production": False,
        },
        "token_limits": {"per_run": "50K", "per_day": "500K", "per_month": "5M"},
        "data_scope": {
            "allowed_systems": [],
            "allowed_objects": [],
            "denied_objects": [],
            "denied_fields": [],
        },
        "data_handling": {
            "default_aggregation": False,
            "allow_row_level_output": True,
            "max_rows_in_output": 1000,
            "redact_fields": [],
            "hash_fields": [],
            "pii_detection": False,
            "pii_action": "warn",
        },
        "approval_policy": {
            "require_manual_approval_for": [],
            "auto_approved": ["All read-only queries"],
        },
        "tool_limits": {
            "max_tool_calls": 50,
            "max_query_rows": 100000,
            "max_query_runtime": "60s",
            "max_time_window_days": 90,
        },
        "audit": {
            "log_tool_calls": True,
            "log_query_metadata_only": False,
            "retain_days": 30,
            "require_lineage_in_report": False,
        },
        "content_safety": {
            "treat_crm_text_fields_as_untrusted": False,
            "do_not_follow_instructions_from_data": True,
        },
        "id": "tool-use-policy-guard",
        "version": "0.0.1",
        "name": "Tool Use Policy Guard",
        "description": "Watches each tool call a Cog makes: the tool is one the Cog declares, and the calls stay within the guardrail's tool limits.",
        "category": "policy-safety",
        "stages": ["in_flight"],
        "method": "algorithmic",
        "check": "Every tool called is declared by the calling Cog; the number of calls, the rows queried and the query runtime stay within the guardrail's limits.",
        "signals": [
            {
                "name": "tool_violation",
                "type": "boolean",
                "description": "An undeclared tool was called, or a tool limit was exceeded.",
            }
        ],
        "required": True,
        "enabled": True,
        "tags": ["tools", "limits"],
        "guardrail": "default-platform-user",
    }
)


# ============================================================================
# Guard Catalog
# ============================================================================

GUARD_CATALOGUE: Dict[str, GuardSpec] = {
    "confidence-guard": CONFIDENCE_GUARD_0_0_1,
    "consensus-guard": CONSENSUS_GUARD_0_0_1,
    "data-source-authorization-guard": DATA_SOURCE_AUTHORIZATION_GUARD_0_0_1,
    "expert-sampling-guard": EXPERT_SAMPLING_GUARD_0_0_1,
    "outcome-guard": OUTCOME_GUARD_0_0_1,
    "permission-guard": PERMISSION_GUARD_0_0_1,
    "regression-guard": REGRESSION_GUARD_0_0_1,
    "required-frame-guard": REQUIRED_FRAME_GUARD_0_0_1,
    "schema-guard": SCHEMA_GUARD_0_0_1,
    "sensitive-data-guard": SENSITIVE_DATA_GUARD_0_0_1,
    "source-grounding-guard": SOURCE_GROUNDING_GUARD_0_0_1,
    "tool-use-policy-guard": TOOL_USE_POLICY_GUARD_0_0_1,
}


def get_guard(guard_id: str) -> GuardSpec | None:
    """A Guard, by `id` or `id:version`, or None."""
    found = GUARD_CATALOGUE.get(guard_id)
    if found is not None:
        return found
    base, _, version = guard_id.rpartition(":")
    return GUARD_CATALOGUE.get(base) if base and "." in version else None


def list_guards() -> list[GuardSpec]:
    """Every Guard of the catalogue, resolved."""
    return list(GUARD_CATALOGUE.values())
