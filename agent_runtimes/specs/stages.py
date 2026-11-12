# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Stage Catalog.

Something of the catalogue put on stage, and where it plays: a scene played whole,
an app or a Battle; each member on a runtime at the deployment that answers for it;
whether anyone may watch without an account. Resolved: a Stage wears what it stages.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict

from agent_runtimes.types import StageSpec

# ============================================================================
# Stage Definitions
# ============================================================================

ACCOUNTING_STAGE_0_0_1 = StageSpec.model_validate(
    {
        "id": "accounting",
        "version": "0.0.1",
        "name": "Accounting, on its own",
        "description": "Accounting alone on stage, answering from the demo books at its address: a Stage made from one application.",
        "scene": "",
        "app": "accounting:0.0.2",
        "battle": "",
        "deployments": {"accounting": "demo-accounting"},
        "public": False,
        "enabled": True,
        "tags": ["example", "app"],
        "icon": "book",
        "emoji": "🧾",
    }
)

CODING_AGENT_BEHIND_THE_SHIELD_STAGE_0_0_1 = StageSpec.model_validate(
    {
        "id": "coding-agent-behind-the-shield",
        "version": "0.0.1",
        "name": "A Coding Agent Behind the Shield",
        "description": "A coding agent lent one repository to read explains a file; the edit it is then asked for is refused by the Shield, which says the rule.",
        "scene": "coding-agent-behind-the-shield:0.0.1",
        "app": "",
        "battle": "",
        "deployments": {"code-explainer": "demo-code-explainer"},
        "public": True,
        "enabled": True,
        "tags": ["example", "demo", "scene"],
        "icon": "code",
        "emoji": "🔒",
    }
)

CROP_MONITORING_STAGE_0_0_1 = StageSpec.model_validate(
    {
        "id": "crop-monitoring",
        "version": "0.0.1",
        "name": "Crop Monitoring",
        "description": "One agent follows crop vigour and growth over a season from the satellite imagery NASA Earthdata holds, and flags the fields that need attention.",
        "scene": "crop-monitoring:0.0.1",
        "app": "",
        "battle": "",
        "deployments": {"crop-monitoring": "demo-crop-monitoring"},
        "public": True,
        "enabled": True,
        "tags": ["example", "demo", "scene"],
        "icon": "globe",
        "emoji": "🛰️",
    }
)

DISASTER_ASSESSMENT_STAGE_0_0_1 = StageSpec.model_validate(
    {
        "id": "disaster-assessment",
        "version": "0.0.1",
        "name": "Disaster Assessment",
        "description": "An event desk asks two specialists what a disaster affected and what changed on the ground, each reading NASA Earthdata, and reports.",
        "scene": "disaster-assessment:0.0.1",
        "app": "",
        "battle": "",
        "deployments": {
            "disaster-assessment": "demo-disaster-assessment",
            "change-detection": "demo-change-detection",
        },
        "public": True,
        "enabled": True,
        "tags": ["example", "demo", "scene"],
        "icon": "alert",
        "emoji": "🚨",
    }
)

MONTH_END_CLOSE_STAGE_0_0_1 = StageSpec.model_validate(
    {
        "id": "month-end-close",
        "version": "0.0.1",
        "name": "Month-end Close",
        "description": "One agent drives the close from the Odoo books it only reads: where the close stands, what is to book, what is still open.",
        "scene": "month-end-close:0.0.1",
        "app": "",
        "battle": "",
        "deployments": {"month-end-close": "demo-month-end-close"},
        "public": True,
        "enabled": True,
        "tags": ["example", "demo", "scene"],
        "icon": "calendar",
        "emoji": "📒",
    }
)

PACT_A_PERSONAL_AGENT_AT_A_BUSINESS_STAGE_0_0_1 = StageSpec.model_validate(
    {
        "id": "pact-a-personal-agent-at-a-business",
        "version": "0.0.1",
        "name": "A Personal Agent at a Business",
        "description": "Ada’s Travel Desk asks an airline about her flight, and she allows it to read her bookings, not to change them.",
        "scene": "pact-a-personal-agent-at-a-business:0.0.1",
        "app": "",
        "battle": "",
        "deployments": {},
        "public": True,
        "enabled": True,
        "tags": ["example", "scripted", "pact"],
        "icon": "people",
        "emoji": "✈️",
    }
)

PAP_A_PERSON_AND_A_COMPANY_STAGE_0_0_1 = StageSpec.model_validate(
    {
        "id": "pap-a-person-and-a-company",
        "version": "0.0.1",
        "name": "A Person and a Company",
        "description": "Ada’s agent asks a shop about her order, and she signs in at the shop itself.",
        "scene": "pap-a-person-and-a-company:0.0.1",
        "app": "",
        "battle": "",
        "deployments": {},
        "public": True,
        "enabled": True,
        "tags": ["example", "scripted", "pap", "slice-1"],
        "icon": "people",
        "emoji": "🧥",
    }
)

PAP_APPROVE_ONCE_STAGE_0_0_1 = StageSpec.model_validate(
    {
        "id": "pap-approve-once",
        "version": "0.0.1",
        "name": "A Change, Approved Once",
        "description": "The shop proposes an exchange; Ada approves its exact terms, and it is done once.",
        "scene": "pap-approve-once:0.0.1",
        "app": "",
        "battle": "",
        "deployments": {},
        "public": True,
        "enabled": True,
        "tags": ["example", "scripted", "pap", "slice-2"],
        "icon": "people",
        "emoji": "🔁",
    }
)

PAP_TWO_COMPANIES_STAGE_0_0_1 = StageSpec.model_validate(
    {
        "id": "pap-two-companies",
        "version": "0.0.1",
        "name": "Two Companies Together",
        "description": "An accounting firm pays a bill at Ada’s bank, and every payment is Ada’s approval.",
        "scene": "pap-two-companies:0.0.1",
        "app": "",
        "battle": "",
        "deployments": {},
        "public": True,
        "enabled": True,
        "tags": ["example", "scripted", "pap", "slice-4"],
        "icon": "people",
        "emoji": "🏦",
    }
)

PAP_YOUR_APPLICATION_A_COMPANY_STAGE_0_0_1 = StageSpec.model_validate(
    {
        "id": "pap-your-application-a-company",
        "version": "0.0.1",
        "name": "Your Application, a Company",
        "description": "An application built in the Studio answers people’s own agents as a company does.",
        "scene": "pap-your-application-a-company:0.0.1",
        "app": "",
        "battle": "",
        "deployments": {},
        "public": True,
        "enabled": True,
        "tags": ["example", "scripted", "pap", "slice-3"],
        "icon": "people",
        "emoji": "🏪",
    }
)

PONG_STAGE_0_0_1 = StageSpec.model_validate(
    {
        "id": "pong",
        "version": "0.0.1",
        "name": "Pong",
        "description": "Two players at the Pong arena, each with a paddle: Blue, a Player with the arena's tools; Red, played by Jev, a decision model choosing its moves. The arena keeps the score; the first to eleven wins.",
        "scene": "",
        "app": "",
        "battle": "pong:0.0.1",
        "deployments": {},
        "public": False,
        "enabled": True,
        "tags": ["example", "battle"],
        "icon": "play",
        "emoji": "🏓",
    }
)

SALES_AND_ACCOUNTING_STAGE_0_0_1 = StageSpec.model_validate(
    {
        "id": "sales-and-accounting",
        "version": "0.0.1",
        "name": "Sales & Accounting",
        "description": "A sales desk asks Accounting for the figures and hands them over; Accounting reads the Odoo books and answers, and changes nothing.",
        "scene": "sales-and-accounting:0.0.1",
        "app": "",
        "battle": "",
        "deployments": {"accounting": "demo-accounting"},
        "public": True,
        "enabled": True,
        "tags": ["example", "demo", "scene"],
        "icon": "people",
        "emoji": "🤝",
    }
)

UCP_A_PURCHASE_APPROVED_STAGE_0_0_1 = StageSpec.model_validate(
    {
        "id": "ucp-a-purchase-approved",
        "version": "0.0.1",
        "name": "A Purchase, Approved",
        "description": "Ada’s Shopping Desk fills a basket at a test shop, and buys only once she approves the exact purchase.",
        "scene": "ucp-a-purchase-approved:0.0.1",
        "app": "",
        "battle": "",
        "deployments": {},
        "public": True,
        "enabled": True,
        "tags": ["example", "scripted", "ucp"],
        "icon": "people",
        "emoji": "🛍️",
    }
)


# ============================================================================
# Stage Catalog
# ============================================================================

STAGE_CATALOGUE: Dict[str, StageSpec] = {
    "accounting": ACCOUNTING_STAGE_0_0_1,
    "coding-agent-behind-the-shield": CODING_AGENT_BEHIND_THE_SHIELD_STAGE_0_0_1,
    "crop-monitoring": CROP_MONITORING_STAGE_0_0_1,
    "disaster-assessment": DISASTER_ASSESSMENT_STAGE_0_0_1,
    "month-end-close": MONTH_END_CLOSE_STAGE_0_0_1,
    "pact-a-personal-agent-at-a-business": PACT_A_PERSONAL_AGENT_AT_A_BUSINESS_STAGE_0_0_1,
    "pap-a-person-and-a-company": PAP_A_PERSON_AND_A_COMPANY_STAGE_0_0_1,
    "pap-approve-once": PAP_APPROVE_ONCE_STAGE_0_0_1,
    "pap-two-companies": PAP_TWO_COMPANIES_STAGE_0_0_1,
    "pap-your-application-a-company": PAP_YOUR_APPLICATION_A_COMPANY_STAGE_0_0_1,
    "pong": PONG_STAGE_0_0_1,
    "sales-and-accounting": SALES_AND_ACCOUNTING_STAGE_0_0_1,
    "ucp-a-purchase-approved": UCP_A_PURCHASE_APPROVED_STAGE_0_0_1,
}


def get_stage(stage_id: str) -> StageSpec | None:
    """A Stage, by `id` or `id:version`, or None."""
    found = STAGE_CATALOGUE.get(stage_id)
    if found is not None:
        return found
    base, _, version = stage_id.rpartition(":")
    return STAGE_CATALOGUE.get(base) if base and "." in version else None


def list_stages() -> list[StageSpec]:
    """Every Stage of the catalogue, resolved."""
    return list(STAGE_CATALOGUE.values())
