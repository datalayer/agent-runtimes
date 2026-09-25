# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""One-off generator for the worker-* agent specs (9 verticals).

Creates one YAML spec per worker example from the Agent Workers portfolio.
Skips the three flagship workers that already exist as hand-authored specs.
"""

from pathlib import Path

AGENTS_DIR = (
    Path(__file__).resolve().parent.parent / "agentspecs" / "agentspecs" / "agents"
)

# Per-vertical defaults: label, emoji, icon, color, mcp servers, skills, envvars.
VERTICALS = {
    "earth-observation": {
        "emoji": "🛰️",
        "icon": "globe",
        "color": "#10B981",
        "mcp": ["earthdata:0.0.1", "tavily:0.0.1"],
        "skills": ["text-summarizer:0.0.1", "crawl:0.0.1"],
        "envvars": ["TAVILY_API_KEY:0.0.1"],
    },
    "accounting": {
        "emoji": "🧾",
        "icon": "credit-card",
        "color": "#F59E0B",
        "mcp": ["odoo:0.0.1"],
        "skills": ["accounting:0.0.1", "pdf:0.0.1"],
        "envvars": [],
    },
    "energy": {
        "emoji": "⚡",
        "icon": "zap",
        "color": "#EAB308",
        "mcp": ["tavily:0.0.1", "chart:0.0.1"],
        "skills": ["text-summarizer:0.0.1"],
        "envvars": ["TAVILY_API_KEY:0.0.1"],
    },
    "insurance": {
        "emoji": "🛡️",
        "icon": "shield",
        "color": "#EF4444",
        "mcp": ["earthdata:0.0.1", "tavily:0.0.1"],
        "skills": ["text-summarizer:0.0.1", "pdf:0.0.1"],
        "envvars": ["TAVILY_API_KEY:0.0.1"],
    },
    "life-sciences": {
        "emoji": "🧬",
        "icon": "beaker",
        "color": "#06B6D4",
        "mcp": ["huggingface:0.0.1", "kaggle:0.0.1"],
        "skills": ["text-summarizer:0.0.1", "pdf:0.0.1"],
        "envvars": ["HF_TOKEN:0.0.1", "KAGGLE_API_TOKEN:0.0.1"],
    },
    "capital-markets": {
        "emoji": "📈",
        "icon": "graph",
        "color": "#3B82F6",
        "mcp": ["alphavantage:0.0.1", "chart:0.0.1"],
        "skills": ["text-summarizer:0.0.1"],
        "envvars": ["ALPHAVANTAGE_API_KEY:0.0.1"],
    },
    "personal-assistant": {
        "emoji": "🤖",
        "icon": "person",
        "color": "#A855F7",
        "mcp": ["tavily:0.0.1", "google-workspace:0.0.1"],
        "skills": ["text-summarizer:0.0.1", "crawl:0.0.1", "events:0.0.1"],
        "envvars": ["TAVILY_API_KEY:0.0.1"],
    },
    "marketing": {
        "emoji": "📣",
        "icon": "megaphone",
        "color": "#8B5CF6",
        "mcp": ["tavily:0.0.1", "slack:0.0.1"],
        "skills": ["text-summarizer:0.0.1", "crawl:0.0.1", "events:0.0.1"],
        "envvars": ["TAVILY_API_KEY:0.0.1", "SLACK_BOT_TOKEN:0.0.1"],
    },
    "market-analyst": {
        "emoji": "🔎",
        "icon": "search",
        "color": "#EC4899",
        "mcp": ["tavily:0.0.1", "salesforce:0.0.1"],
        "skills": ["text-summarizer:0.0.1", "crawl:0.0.1"],
        "envvars": ["TAVILY_API_KEY:0.0.1"],
    },
}

# worker slug -> (vertical, name, description, goal). Renamed flagships excluded.
WORKERS = {
    # Earth Observation
    "change-detection": (
        "earth-observation",
        "Change Detection Worker",
        "Detects environmental and land-use change between satellite image time periods and produces evidence-backed change maps.",
        "Compare imagery across time periods, detect meaningful land-use and environmental change, and deliver annotated maps and reports.",
    ),
    "crop-monitoring": (
        "earth-observation",
        "Crop Monitoring Worker",
        "Monitors crop health, growth stages, and field conditions using multi-temporal satellite imagery.",
        "Track crop vigor and growth over time from satellite imagery and flag fields that need attention.",
    ),
    "disaster-assessment": (
        "earth-observation",
        "Disaster Assessment Worker",
        "Assesses affected areas after natural disasters by comparing pre- and post-event satellite imagery.",
        "Rapidly estimate affected areas and damage extent after a disaster and produce a response-ready assessment.",
    ),
    "infrastructure-monitoring": (
        "earth-observation",
        "Infrastructure Monitoring Worker",
        "Monitors infrastructure and physical assets from satellite imagery and detects anomalies over time.",
        "Continuously monitor infrastructure from satellite imagery and surface anomalies with supporting evidence.",
    ),
    "environmental-compliance": (
        "earth-observation",
        "Environmental Compliance Worker",
        "Tracks environmental compliance from Earth observation data and generates recurring, auditable reports.",
        "Detect potential environmental compliance issues from EO data and produce traceable evidence-backed reports.",
    ),
    # Accounting (Odoo)
    "ap-invoice": (
        "accounting",
        "AP Invoice Worker",
        "Extracts, codes, and matches supplier invoices to purchase orders and receipts in Odoo.",
        "Extract and code supplier invoices, match them to POs and receipts, and prepare them for approval.",
    ),
    "bank-reconciliation": (
        "accounting",
        "Bank Reconciliation Worker",
        "Reconciles bank statements against the ledger, matches transactions, and investigates exceptions.",
        "Reconcile bank feeds against the ledger, auto-match transactions, and flag exceptions for review.",
    ),
    "month-end-close": (
        "accounting",
        "Month-End Close Worker",
        "Prepares close checklists, suggests accruals, and reconciles intercompany balances for month-end close.",
        "Drive the month-end close checklist, suggest accruals, and surface remaining reconciliation gaps.",
    ),
    "collections": (
        "accounting",
        "Collections Worker",
        "Follows up on overdue receivables and drafts collection communications for approval.",
        "Prioritize overdue receivables and draft tailored collection follow-ups for human approval.",
    ),
    "expense-audit": (
        "accounting",
        "Expense Audit Worker",
        "Audits employee expenses for duplicates, anomalies, and policy violations.",
        "Review expenses for duplicates, anomalies, and policy breaches, and summarize findings.",
    ),
    "audit-pack-builder": (
        "accounting",
        "Audit-Pack Builder",
        "Assembles auditable evidence packs from invoices, approvals, and postings across Odoo.",
        "Assemble a complete, traceable audit-evidence pack for a given period or transaction set.",
    ),
    # Energy and Utilities
    "renewable-asset-performance": (
        "energy",
        "Renewable Asset Performance Worker",
        "Compares expected versus actual generation, adjusts for weather, and investigates performance anomalies.",
        "Compare expected vs actual generation, weather-adjust performance, and investigate underperformance.",
    ),
    "grid-forecast": (
        "energy",
        "Grid Forecast Worker",
        "Forecasts electricity demand and prices to support grid operations and planning.",
        "Produce demand and price forecasts for grid operations with clear assumptions and confidence.",
    ),
    "curtailment-investigator": (
        "energy",
        "Curtailment Investigator",
        "Analyzes curtailment events, quantifies lost generation, and investigates root causes.",
        "Investigate curtailment events, quantify lost generation, and explain the primary drivers.",
    ),
    "energy-trading-analyst": (
        "energy",
        "Energy Trading Analyst",
        "Analyzes power markets, price signals, and trading opportunities across energy markets.",
        "Analyze power-market signals and surface evidence-backed trading opportunities and risks.",
    ),
    "predictive-maintenance": (
        "energy",
        "Predictive Maintenance Worker",
        "Detects equipment degradation and anomalies to predict failures and prioritize maintenance.",
        "Detect degradation and anomalies, predict likely failures, and prioritize maintenance work.",
    ),
    # Insurance
    "cat-exposure": (
        "insurance",
        "CAT Exposure Worker",
        "Geocodes insurance portfolios and overlays hazard data to analyze catastrophe exposure.",
        "Geocode portfolios, overlay hazard layers, and quantify catastrophe exposure with lineage.",
    ),
    "event-response": (
        "insurance",
        "Event Response Worker",
        "Assesses live catastrophe events against insured portfolios to estimate exposure and losses.",
        "Assess a live catastrophe event against the portfolio and publish an auditable exposure estimate.",
    ),
    "portfolio-accumulation": (
        "insurance",
        "Portfolio Accumulation Worker",
        "Analyzes accumulation and concentration risk across an insurance portfolio.",
        "Analyze accumulation and concentration risk and highlight where limits are approached.",
    ),
    "exposure-data-quality": (
        "insurance",
        "Exposure Data Quality Worker",
        "Cleanses exposure data, validates geocoding, and improves data quality for risk analysis.",
        "Cleanse and validate exposure data and geocoding, and report remaining data-quality gaps.",
    ),
    "model-comparison": (
        "insurance",
        "Model Comparison Worker",
        "Compares catastrophe models and scenarios and explains differences in loss drivers.",
        "Compare catastrophe models and scenarios and explain the drivers behind divergent results.",
    ),
    # Life Sciences
    "rna-seq": (
        "life-sciences",
        "RNA-Seq Worker",
        "Runs RNA-seq quality control and differential expression analysis with reproducible pipelines.",
        "Run RNA-seq QC and differential expression analysis and produce reproducible, documented results.",
    ),
    "variant-analysis": (
        "life-sciences",
        "Variant Analysis Worker",
        "Analyzes genomic variants, annotates findings, and prepares interpretable reports.",
        "Analyze and annotate genomic variants and produce an interpretable, provenance-tracked report.",
    ),
    "single-cell-processing": (
        "life-sciences",
        "Single-Cell Processing Worker",
        "Processes, clusters, and annotates single-cell datasets with reproducible workflows.",
        "Process and cluster single-cell data and deliver annotated, reproducible outputs.",
    ),
    "cohort-comparison": (
        "life-sciences",
        "Cohort Comparison Worker",
        "Compares cohorts, validates statistical results, and checks reproducibility.",
        "Compare cohorts, validate the statistics, and confirm results are reproducible.",
    ),
    "pipeline-debugger": (
        "life-sciences",
        "Pipeline Debugger",
        "Troubleshoots bioinformatics pipeline failures and suggests corrective actions.",
        "Diagnose bioinformatics pipeline failures and recommend concrete fixes with evidence.",
    ),
    "compute-cost-optimizer": (
        "life-sciences",
        "Compute-Cost Optimizer",
        "Optimizes pipeline runtime and compute cost while preserving reproducibility.",
        "Analyze pipeline runs and recommend runtime and cost optimizations without breaking reproducibility.",
    ),
    # Capital Markets
    "quant-research": (
        "capital-markets",
        "Quant Research Worker",
        "Constructs datasets and researches factors for quantitative strategies with point-in-time care.",
        "Construct clean datasets and research factors, respecting point-in-time correctness.",
    ),
    "portfolio-risk": (
        "capital-markets",
        "Portfolio Risk Worker",
        "Computes exposures and generates recurring, auditable portfolio risk reports.",
        "Compute portfolio exposures and produce recurring, auditable risk reports.",
    ),
    "backtest-auditor": (
        "capital-markets",
        "Backtest Auditor",
        "Audits backtests for look-ahead leakage, survivorship bias, and methodological errors.",
        "Audit a backtest for leakage, survivorship bias, and other flaws, and report findings.",
    ),
    "factor-analysis": (
        "capital-markets",
        "Factor Analysis Worker",
        "Analyzes factor exposures and returns across a portfolio or strategy.",
        "Analyze factor exposures and returns and explain the primary contributors.",
    ),
    "performance-attribution": (
        "capital-markets",
        "Performance Attribution Worker",
        "Attributes portfolio performance to its underlying drivers and produces clear reports.",
        "Attribute portfolio performance to its drivers and produce a clear, auditable report.",
    ),
    "scenario-testing": (
        "capital-markets",
        "Scenario Testing Worker",
        "Runs stress tests and scenario analysis to quantify portfolio sensitivity to shocks.",
        "Run stress tests and scenarios and quantify portfolio sensitivity to defined shocks.",
    ),
    # Personal Assistant (news-aggregator excluded, already exists)
    "travel-recommender": (
        "personal-assistant",
        "Travel Recommender",
        "Researches travel options and builds personalized itineraries with source comparison.",
        "Research travel options and build a personalized itinerary, comparing sources and prices.",
    ),
    "trends-seeker": (
        "personal-assistant",
        "Trends Seeker",
        "Tracks emerging trends across sources and summarizes what is gaining momentum.",
        "Track emerging trends across sources and summarize what is worth attention and why.",
    ),
    "product-finder": (
        "personal-assistant",
        "Product Finder",
        "Researches and compares products against a user's criteria and budget.",
        "Research and compare products against the user's criteria and recommend the best fit.",
    ),
    "job-hunter": (
        "personal-assistant",
        "Job Hunter",
        "Searches for relevant jobs and prepares tailored application materials.",
        "Find relevant roles and prepare tailored application materials for review.",
    ),
    "coding-tutor": (
        "personal-assistant",
        "Coding Tutor",
        "Teaches coding through interactive, executable exercises and step-by-step feedback.",
        "Teach coding interactively with executable exercises and give clear, incremental feedback.",
    ),
    "mail-triage": (
        "personal-assistant",
        "Mail Triage Worker",
        "Classifies the inbox, drafts replies, and extracts follow-up tasks, with approval for sending.",
        "Classify the inbox, draft replies, and extract tasks, requiring approval before sending anything.",
    ),
    # Marketing (social-marketer excluded, already exists)
    "campaign-planning": (
        "marketing",
        "Campaign Planning Worker",
        "Plans content calendars and campaign tasks across channels.",
        "Plan a content calendar and campaign tasks aligned to goals and channels.",
    ),
    "content-repurposing": (
        "marketing",
        "Content Repurposing Worker",
        "Adapts existing content and assets across channels and formats.",
        "Repurpose existing content into channel-specific formats while keeping brand voice.",
    ),
    "social-listening": (
        "marketing",
        "Social Listening Worker",
        "Monitors conversations across platforms and surfaces actionable insights.",
        "Monitor conversations at scale and surface actionable, evidence-backed insights.",
    ),
    "community-response": (
        "marketing",
        "Community Response Worker",
        "Triages comments and messages and drafts community replies for approval.",
        "Triage community comments and draft on-brand replies for human approval.",
    ),
    # Market Analyst (customer-interviewer excluded, already exists)
    "interview-guide": (
        "market-analyst",
        "Interview Guide Worker",
        "Generates research plans and structured interview guides from research objectives.",
        "Turn research objectives into a structured research plan and interview guide.",
    ),
    "research-recruiter": (
        "market-analyst",
        "Research Recruiter",
        "Selects and schedules research participants and manages consent.",
        "Select suitable participants, schedule sessions, and manage consent.",
    ),
    "thematic-analysis": (
        "market-analyst",
        "Thematic Analysis Worker",
        "Codes transcripts, extracts themes, and organizes qualitative evidence.",
        "Code transcripts, extract themes, and organize the supporting evidence.",
    ),
    "competitive-intelligence": (
        "market-analyst",
        "Competitive Intelligence Worker",
        "Researches competitors and market dynamics and synthesizes findings.",
        "Research competitors and market dynamics and synthesize evidence-backed findings.",
    ),
    "evidence-repository": (
        "market-analyst",
        "Evidence Repository Worker",
        "Organizes research evidence for traceability from qualitative findings to conclusions.",
        "Organize research evidence so every conclusion traces back to its source.",
    ),
}

TEMPLATE = """# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

# Agent Specification: {name}
# {vertical_label} vertical worker.

id: worker-{slug}
version: 0.0.1
name: {name}
domain: {vertical}
description: >-
  {description}

tags:
{tags}

enabled: true
model: "bedrock:us.anthropic.claude-sonnet-4-6"

sandbox_variant: jupyter

# Durable memory to retain context across sessions
memory: mem0

# MCP servers used by this agent
mcp_servers:
{mcp}

# Skills available to this agent
skills:
{skills}

# Runtime tools — sensitive actions require human approval
tools:
  - runtime-echo:0.0.1
  - runtime-sensitive-echo:0.0.1
frontend_tools:
  - jupyter-notebook:0.0.1
  - lexical-document:0.0.1
{envvars}
# Runtime environment
environment_name: ai-agents-env

# UI customization
icon: {icon}
emoji: "{emoji}"
color: "{color}"

# Goal / Prompt (Step 4 in the UI — the user-facing objective)
goal: >-
  {goal}

# Protocols & UI Extensions
protocol: vercel-ai
ui_extension: a2ui

# Model configuration
model_config:
  temperature: 0.5
  max_tokens: 4096

# Codemode
codemode:
  enabled: true

# System prompt
system_prompt: >-
  {system_prompt}
"""


def yaml_list(items):
    return "\n".join(f"  - {i}" for i in items)


def main():
    written = 0
    for slug, (vertical, name, description, goal) in WORKERS.items():
        cfg = VERTICALS[vertical]
        tags = [vertical, "agent-worker"]
        envvars_block = ""
        if cfg["envvars"]:
            envvars_block = (
                "\n# Secrets / environment variables\nenvvars:\n"
                + yaml_list(cfg["envvars"])
                + "\n"
            )
        system_prompt = (
            f"You are the {name}, an autonomous agent worker in the "
            f"{vertical.replace('-', ' ')} domain. {description} "
            "Work step by step, show your reasoning and evidence, and require "
            "explicit human approval before any external or irreversible action."
        )
        content = TEMPLATE.format(
            name=name,
            slug=slug,
            vertical=vertical,
            vertical_label=vertical.replace("-", " ").title(),
            description=description,
            tags=yaml_list(tags),
            mcp=yaml_list(cfg["mcp"]),
            skills=yaml_list(cfg["skills"]),
            envvars=envvars_block,
            icon=cfg["icon"],
            emoji=cfg["emoji"],
            color=cfg["color"],
            goal=goal,
            system_prompt=system_prompt,
        )
        path = AGENTS_DIR / f"worker-{slug}.yaml"
        path.write_text(content, encoding="utf-8")
        written += 1
    print(f"Wrote {written} worker specs to {AGENTS_DIR}")


if __name__ == "__main__":
    main()
