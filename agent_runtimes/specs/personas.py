# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Persona Catalog.

Predefined Persona configurations built on top of agent specs.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from enum import Enum
from typing import Optional

from agent_runtimes.types import PersonaSpec

# ============================================================================
# Personas Enum
# ============================================================================


class Personas(str, Enum):
    """Enumeration of available personas."""

    CODE = "code"
    FORECASTER = "forecaster"
    INTRUSION = "intrusion"
    JOVYAN = "jovyan"
    MARKETING = "marketing"
    PENTEST = "pentest"
    PHARMA = "pharma"
    POIROT = "poirot"
    SENTINEL = "sentinel"
    TRADER = "trader"
    TUTOR = "tutor"
    TWIN = "twin"


# ============================================================================
# Persona Definitions
# ============================================================================

CODE_PERSONA_0_0_1 = PersonaSpec(
    id="code",
    version="0.0.1",
    name="Code",
    description="A pragmatic coding companion focused on writing, reviewing and refactoring software. Pairs well with editors, terminals and code execution sandboxes.",
    tags=["coding", "development", "engineering", "assistant"],
    icon="code",
    emoji="🧑‍💻",
)

FORECASTER_PERSONA_0_0_1 = PersonaSpec(
    id="forecaster",
    version="0.0.1",
    name="Forecaster",
    description="A predictive-analytics persona that builds and explains time-series forecasts — sales pipelines, demand planning, revenue projection and scenario analysis.",
    tags=["forecasting", "analytics", "sales", "time-series"],
    icon="graph",
    emoji="📈",
)

INTRUSION_PERSONA_0_0_1 = PersonaSpec(
    id="intrusion",
    version="0.0.1",
    name="Intrusion",
    description="A defensive security persona focused on intrusion detection, log analysis, threat hunting and incident response across networks, endpoints and cloud workloads.",
    tags=["security", "intrusion-detection", "threat-hunting", "blue-team"],
    icon="shield-lock",
    emoji="🛡️",
)

JOVYAN_PERSONA_0_0_1 = PersonaSpec(
    id="jovyan",
    version="0.0.1",
    name="Jovyan",
    description="A Jupyter-native companion that lives in notebooks and lexical documents, runs cells, inspects kernels and helps you explore data, narratives and computations.",
    tags=["jupyter", "notebook", "data-science", "kernels"],
    icon="zap",
    emoji="🪐",
)

MARKETING_PERSONA_0_0_1 = PersonaSpec(
    id="marketing",
    version="0.0.1",
    name="Marketing",
    description="A creative marketing persona that drafts campaigns, social posts, newsletters and product copy — adapting tone, channel and audience to maximize engagement.",
    tags=["marketing", "content", "social-media", "copywriting"],
    icon="megaphone",
    emoji="📣",
)

PENTEST_PERSONA_0_0_1 = PersonaSpec(
    id="pentest",
    version="0.0.1",
    name="Pentest",
    description="An offensive security persona that helps with authorized penetration testing — reconnaissance, vulnerability assessment, exploit reasoning and reporting.",
    tags=["security", "penetration-testing", "red-team", "vulnerability"],
    icon="bug",
    emoji="🕷️",
)

PHARMA_PERSONA_0_0_1 = PersonaSpec(
    id="pharma",
    version="0.0.1",
    name="Pharma",
    description="A life-sciences persona for pharmaceutical and clinical workflows — literature review, trial data exploration, regulatory reporting and drug-safety signal triage.",
    tags=["pharma", "life-sciences", "clinical", "regulatory"],
    icon="beaker",
    emoji="💊",
)

POIROT_PERSONA_0_0_1 = PersonaSpec(
    id="poirot",
    version="0.0.1",
    name="Poirot",
    description="A meticulous detective persona for investigative workflows — root cause analysis, evidence correlation, timeline reconstruction and hypothesis testing across heterogeneous data.",
    tags=["investigation", "root-cause", "forensics", "reasoning"],
    icon="search",
    emoji="🕵️",
)

SENTINEL_PERSONA_0_0_1 = PersonaSpec(
    id="sentinel",
    version="0.0.1",
    name="Sentinel",
    description="A vigilant monitoring persona for real-time signal detection, anomaly spotting and early-warning alerts — including use cases such as seismic activity, infrastructure health and live event streams.",
    tags=["monitoring", "detection", "alerting", "real-time", "earthquake"],
    icon="shield",
    emoji="🛰️",
)

TRADER_PERSONA_0_0_1 = PersonaSpec(
    id="trader",
    version="0.0.1",
    name="Trader",
    description="A markets persona for stock and portfolio analysis — quote retrieval, technical indicators, portfolio tracking and trading research workflows.",
    tags=["finance", "stocks", "markets", "portfolio"],
    icon="pulse",
    emoji="💹",
)

TUTOR_PERSONA_0_0_1 = PersonaSpec(
    id="tutor",
    version="0.0.1",
    name="Tutor",
    description="A patient teaching companion that explains concepts, walks through examples step by step, asks questions and adapts its style to the learner's level.",
    tags=["education", "learning", "teaching", "mentorship"],
    icon="book",
    emoji="🎓",
)

TWIN_PERSONA_0_0_1 = PersonaSpec(
    id="twin",
    version="0.0.1",
    name="Twin",
    description="A digital twin of you — mirrors your context, preferences and history to assist with personal productivity, decision making and continuity across tools and sessions.",
    tags=["personal", "productivity", "context", "assistant"],
    icon="person",
    emoji="👤",
)


# ============================================================================
# Persona Catalog
# ============================================================================

PERSONA_CATALOGUE: dict[str, PersonaSpec] = {
    "code": CODE_PERSONA_0_0_1,
    "forecaster": FORECASTER_PERSONA_0_0_1,
    "intrusion": INTRUSION_PERSONA_0_0_1,
    "jovyan": JOVYAN_PERSONA_0_0_1,
    "marketing": MARKETING_PERSONA_0_0_1,
    "pentest": PENTEST_PERSONA_0_0_1,
    "pharma": PHARMA_PERSONA_0_0_1,
    "poirot": POIROT_PERSONA_0_0_1,
    "sentinel": SENTINEL_PERSONA_0_0_1,
    "trader": TRADER_PERSONA_0_0_1,
    "tutor": TUTOR_PERSONA_0_0_1,
    "twin": TWIN_PERSONA_0_0_1,
}


def get_persona(persona_id: str) -> Optional[PersonaSpec]:
    """Get a persona specification by ID (accepts bare or versioned refs)."""
    persona = PERSONA_CATALOGUE.get(persona_id)
    if persona is not None:
        return persona
    base, _, ver = persona_id.rpartition(":")
    if base and "." in ver:
        return PERSONA_CATALOGUE.get(base)
    return None


def list_personas() -> list[PersonaSpec]:
    """List all available personas."""
    return list(PERSONA_CATALOGUE.values())
