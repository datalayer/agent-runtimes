# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Track Catalog.

What evidence a run keeps, for how long, and who may read it.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict

from agent_runtimes.types import TrackSpec


# ============================================================================
# Track Definitions
# ============================================================================

DRAFTING_TRACK_0_0_1 = TrackSpec.model_validate(
    {'id': 'drafting', 'version': '0.0.1', 'name': 'Drafting Track', 'description': "The record of a low-risk drafting Op: what ran, what the Guards found and the Gates decided, and what was produced. Kept ninety days, readable by the Op's owner only, and not fed back to Organizational Memory.", 'retain_for': '90_days', 'include': ['op', 'cogs_invoked', 'guard_results', 'gate_decisions', 'final_output', 'timestamps', 'user_identity'], 'readers': [], 'redact': ['*Password*', '*Secret*', '*Token*'], 'feeds_memory': False, 'exchangeable': False, 'enabled': True, 'tags': ['drafting', 'low-risk'], 'icon': 'log', 'emoji': '🧾', 'retention_days': 90}
)

FINANCIAL_REPORTING_TRACK_0_0_1 = TrackSpec.model_validate(
    {'id': 'financial-reporting', 'version': '0.0.1', 'name': 'Financial Reporting Track', 'description': 'The complete record of an Op that produces financial reporting: every input and source, every model and setting, every Guard result, Gate decision, approval and edit. Kept seven years, readable by Finance and by audit, and fed back to Organizational Memory.', 'retain_for': '7_years', 'include': ['op', 'frames_used', 'cogs_invoked', 'input_data', 'source_documents', 'model_versions', 'configuration', 'guard_results', 'gate_decisions', 'human_approvals', 'human_edits', 'final_output', 'actions_taken', 'timestamps', 'user_identity', 'permissions', 'environment', 'memory_links'], 'readers': ['finance', 'internal-audit'], 'redact': ['*Password*', '*Secret*', '*Token*', '*IBAN*'], 'feeds_memory': True, 'exchangeable': False, 'enabled': True, 'tags': ['finance', 'audit'], 'icon': 'log', 'emoji': '🧾', 'retention_days': 2555}
)

REGULATED_TRACK_0_0_1 = TrackSpec.model_validate(
    {'id': 'regulated', 'version': '0.0.1', 'name': 'Regulated Track', 'description': 'The complete record of a clinical, legal or public-sector Op: every input and source, every model and setting, every Guard result, Gate decision, approval, edit and action. Kept ten years, readable by Compliance and Legal, produced to a regulator or an external auditor on request, with personal data kept out, and fed back to Organizational Memory.', 'retain_for': '10_years', 'include': ['op', 'frames_used', 'cogs_invoked', 'input_data', 'source_documents', 'model_versions', 'configuration', 'guard_results', 'gate_decisions', 'human_approvals', 'human_edits', 'final_output', 'actions_taken', 'timestamps', 'user_identity', 'permissions', 'environment', 'memory_links'], 'readers': ['compliance', 'legal', 'external-audit'], 'redact': ['*Password*', '*Secret*', '*Token*', '*SSN*', '*PatientId*', '*DateOfBirth*'], 'feeds_memory': True, 'exchangeable': False, 'enabled': True, 'tags': ['regulated', 'compliance', 'audit'], 'icon': 'log', 'emoji': '🧾', 'retention_days': 3650}
)

STANDARD_TRACK_0_0_1 = TrackSpec.model_validate(
    {'id': 'standard', 'version': '0.0.1', 'name': 'Standard Track', 'description': 'The record of an ordinary Op: what ran, under which Frames, what the Guards found and the Gates decided, and what was produced. Kept one year.', 'retain_for': '1_years', 'include': ['op', 'frames_used', 'cogs_invoked', 'model_versions', 'guard_results', 'gate_decisions', 'human_approvals', 'final_output', 'timestamps', 'user_identity'], 'readers': [], 'redact': ['*Password*', '*Secret*', '*Token*'], 'feeds_memory': False, 'exchangeable': False, 'enabled': True, 'tags': ['default'], 'icon': 'log', 'emoji': '🧾', 'retention_days': 365}
)


# ============================================================================
# Track Catalog
# ============================================================================

TRACK_CATALOGUE: Dict[str, TrackSpec] = {
    'drafting': DRAFTING_TRACK_0_0_1,
    'financial-reporting': FINANCIAL_REPORTING_TRACK_0_0_1,
    'regulated': REGULATED_TRACK_0_0_1,
    'standard': STANDARD_TRACK_0_0_1,
}


def get_track(track_id: str) -> TrackSpec | None:
    """A Track, by `id` or `id:version`, or None."""
    found = TRACK_CATALOGUE.get(track_id)
    if found is not None:
        return found
    base, _, version = track_id.rpartition(":")
    return TRACK_CATALOGUE.get(base) if base and "." in version else None


def list_tracks() -> list[TrackSpec]:
    """Every Track of the catalogue, resolved."""
    return list(TRACK_CATALOGUE.values())
