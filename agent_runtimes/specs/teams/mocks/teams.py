# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.

"""
Team Specifications.

THIS FILE IS AUTO-GENERATED from YAML team specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, Optional

from agent_runtimes.types import (
    TeamAgentSpec,
    TeamSpec,
    TeamSupervisorSpec,
    TeamValidationSpec,
)

# ============================================================================
# Team Definitions
# ============================================================================

# ============================================================================
# Mocks
# ============================================================================

MOCKS_ANALYZE_CAMPAIGN_PERFORMANCE_TEAM_SPEC = TeamSpec(
    id="mocks/analyze-campaign-performance",
    name="Analyze Campaign Performance",
    description="A multi-agent team that unifies marketing data from Google Ads, Meta, TikTok, LinkedIn, GA4, CRM, and email platforms. Normalises metrics into a unified view, detects performance anomalies in real time, and generates budget reallocation recommendations to maximise ROAS.",
    tags=[
        "marketing",
        "media",
        "campaigns",
        "analytics",
        "advertising",
        "social-media",
    ],
    enabled=False,
    icon="megaphone",
    emoji="📢",
    color="#8250df",
    agent_spec_id="analyze-campaign-performance",
    orchestration_protocol="datalayer",
    execution_mode="sequential",
    supervisor=TeamSupervisorSpec(
        name="Campaign Analytics Orchestrator Agent", model="openai-gpt-4-1"
    ),
    routing_instructions="Start with Platform Connector to pull data from all ad platforms, then Metrics Normaliser for unified KPIs, then Anomaly Detector for real-time performance monitoring, then Budget Optimiser for reallocation recommendations. Escalate CPA spikes above 50% immediately.",
    validation=TeamValidationSpec(timeout="300s", retry_on_failure=True, max_retries=2),
    agents=[
        TeamAgentSpec(
            id="cp-1",
            name="Platform Connector Agent",
            role="Primary · Initiator",
            goal="Pull campaign data from Google Ads, Meta, TikTok, LinkedIn, GA4, and email platforms",
            model="openai-gpt-4-1",
            mcp_server="Ad Platforms MCP",
            tools=[
                "Google Ads Connector",
                "Meta Ads Connector",
                "TikTok Ads Connector",
                "LinkedIn Ads Connector",
                "GA4 Connector",
            ],
            trigger="Schedule: Every 4 hours",
            approval="auto",
        ),
        TeamAgentSpec(
            id="cp-2",
            name="Metrics Normaliser Agent",
            role="Secondary",
            goal="Normalise CPA, ROAS, CTR, and attribution across all platforms into unified view",
            model="openai-gpt-4-1",
            mcp_server="Analytics MCP",
            tools=[
                "Metric Unifier",
                "Currency Converter",
                "Attribution Mapper",
                "Naming Convention Resolver",
            ],
            trigger="On completion of Platform Connector Agent",
            approval="auto",
        ),
        TeamAgentSpec(
            id="cp-3",
            name="Anomaly Detector Agent",
            role="Secondary",
            goal="Monitor all KPIs for CTR drops, CPA spikes, and budget pacing issues",
            model="anthropic-claude-sonnet-4",
            mcp_server="Monitoring MCP",
            tools=[
                "Anomaly Scanner",
                "Budget Pacer",
                "Alert Generator",
                "Campaign Pauser",
            ],
            trigger="On completion of Metrics Normaliser Agent",
            approval="manual",
        ),
        TeamAgentSpec(
            id="cp-4",
            name="Budget Optimiser Agent",
            role="Final",
            goal="Generate budget reallocation recommendations to maximise ROAS across channels",
            model="openai-gpt-4-1",
            mcp_server="Optimisation MCP",
            tools=[
                "ROAS Calculator",
                "Budget Allocator",
                "Scenario Modeller",
                "Report Generator",
            ],
            trigger="On completion of Anomaly Detector Agent",
            approval="manual",
        ),
    ],
)

MOCKS_ANALYZE_SUPPORT_TICKETS_TEAM_SPEC = TeamSpec(
    id="mocks/analyze-support-tickets",
    name="Analyze Support Tickets",
    description="A multi-agent team that triages incoming support tickets, categorizes by urgency and topic, identifies recurring patterns, and generates resolution recommendations with escalation paths.",
    tags=["analytics", "data", "support", "tickets"],
    enabled=False,
    icon="issue-opened",
    emoji="🎫",
    color="#bf8700",
    agent_spec_id="analyze-support-tickets",
    orchestration_protocol="datalayer",
    execution_mode="sequential",
    supervisor=TeamSupervisorSpec(
        name="Support Orchestrator Agent", model="openai-gpt-4-1"
    ),
    routing_instructions="Route new tickets to the Triage Agent first, then to the Categorizer, then to the Pattern Analyzer. Escalate P1/critical tickets immediately to human support leads.",
    validation=TeamValidationSpec(timeout="180s", retry_on_failure=True, max_retries=2),
    agents=[
        TeamAgentSpec(
            id="st-1",
            name="Triage Agent",
            role="Primary · Initiator",
            goal="Ingest new support tickets and assess urgency level (P1-P4)",
            model="openai-gpt-4-1",
            mcp_server="Helpdesk MCP",
            tools=["Ticket Reader", "Priority Classifier"],
            trigger="Event: new ticket received",
            approval="auto",
        ),
        TeamAgentSpec(
            id="st-2",
            name="Categorizer Agent",
            role="Secondary",
            goal="Categorize tickets by topic, product area, and sentiment",
            model="openai-gpt-4-1",
            mcp_server="NLP Pipeline MCP",
            tools=["Topic Classifier", "Sentiment Analyzer", "Product Tagger"],
            trigger="On completion of Triage Agent",
            approval="auto",
        ),
        TeamAgentSpec(
            id="st-3",
            name="Pattern Analyzer Agent",
            role="Final",
            goal="Identify recurring issues and generate resolution recommendations",
            model="anthropic-claude-sonnet-4",
            mcp_server="Analytics MCP",
            tools=["Pattern Detector", "Knowledge Base Search", "Resolution Generator"],
            trigger="On completion of Categorizer Agent",
            approval="manual",
        ),
    ],
)

MOCKS_AUDIT_INVENTORY_LEVELS_TEAM_SPEC = TeamSpec(
    id="mocks/audit-inventory-levels",
    name="Audit Inventory Levels",
    description="A multi-agent team that monitors inventory levels across warehouses, detects discrepancies between physical and system counts, forecasts demand by SKU, and generates automated reorder recommendations.",
    tags=["finance", "automation", "inventory", "supply-chain"],
    enabled=False,
    icon="package",
    emoji="📦",
    color="#0969da",
    agent_spec_id="audit-inventory-levels",
    orchestration_protocol="datalayer",
    execution_mode="sequential",
    supervisor=TeamSupervisorSpec(
        name="Inventory Orchestrator Agent", model="openai-gpt-4-1"
    ),
    routing_instructions="Start with the Scanner to pull current levels, then Auditor to check discrepancies, then Forecaster for demand predictions, then Planner for reorder recommendations, then Reporter for the final audit report. Escalate critical shortages immediately.",
    validation=TeamValidationSpec(timeout="600s", retry_on_failure=True, max_retries=3),
    agents=[
        TeamAgentSpec(
            id="inv-1",
            name="Inventory Scanner Agent",
            role="Primary · Initiator",
            goal="Pull current inventory levels from all warehouse management systems",
            model="openai-gpt-4-1",
            mcp_server="Warehouse MCP",
            tools=["WMS Connector", "Barcode Scanner API"],
            trigger="Schedule: Every 6 hours",
            approval="auto",
        ),
        TeamAgentSpec(
            id="inv-2",
            name="Discrepancy Auditor Agent",
            role="Secondary",
            goal="Compare system counts vs physical counts and flag discrepancies",
            model="openai-gpt-4-1",
            mcp_server="Audit MCP",
            tools=["Count Comparator", "Discrepancy Logger", "Shrinkage Calculator"],
            trigger="On completion of Inventory Scanner",
            approval="auto",
        ),
        TeamAgentSpec(
            id="inv-3",
            name="Demand Forecaster Agent",
            role="Secondary",
            goal="Forecast demand by SKU using historical sales and seasonal patterns",
            model="anthropic-claude-sonnet-4",
            mcp_server="Analytics MCP",
            tools=[
                "Time Series Model",
                "Seasonal Analyzer",
                "External Signals Fetcher",
            ],
            trigger="On completion of Discrepancy Auditor",
            approval="auto",
        ),
        TeamAgentSpec(
            id="inv-4",
            name="Reorder Planner Agent",
            role="Secondary",
            goal="Calculate optimal reorder points and generate purchase order recommendations",
            model="openai-gpt-4-1",
            mcp_server="Procurement MCP",
            tools=["EOQ Calculator", "Supplier Catalog", "PO Generator"],
            trigger="On completion of Demand Forecaster",
            approval="manual",
        ),
        TeamAgentSpec(
            id="inv-5",
            name="Audit Report Agent",
            role="Final",
            goal="Compile inventory audit report with discrepancies, forecasts, and reorder plan",
            model="openai-gpt-4-1",
            mcp_server="Document Generation MCP",
            tools=["PDF Generator", "Chart Builder", "Email Sender"],
            trigger="On completion of Reorder Planner",
            approval="auto",
        ),
    ],
)

MOCKS_AUTOMATE_REGULATORY_REPORTING_TEAM_SPEC = TeamSpec(
    id="mocks/automate-regulatory-reporting",
    name="Automate Regulatory Reporting",
    description="A multi-agent team that automates end-to-end regulatory reporting for financial institutions. Ingests data from trading systems, risk engines, and accounting platforms, reconciles positions, computes risk metrics, validates against regulatory rules (Basel III/IV, MiFID II, SOX), and generates submission-ready compliance reports with full audit trails.",
    tags=["finance", "compliance", "regulatory", "risk", "banking", "audit"],
    enabled=False,
    icon="shield-check",
    emoji="🏦",
    color="#0969da",
    agent_spec_id="automate-regulatory-reporting",
    orchestration_protocol="datalayer",
    execution_mode="sequential",
    supervisor=TeamSupervisorSpec(
        name="Compliance Orchestrator Agent", model="openai-gpt-4-1"
    ),
    routing_instructions="Start with Data Ingestion to pull positions and transactions, then Risk Calculator for metric computation, then Reconciliation Agent to cross-check figures, then Validation Agent for regulatory rule checks, then Report Generator for submission-ready output. Escalate any reconciliation breaks above $10K immediately to the compliance team.",
    validation=TeamValidationSpec(timeout="900s", retry_on_failure=True, max_retries=2),
    agents=[
        TeamAgentSpec(
            id="reg-1",
            name="Data Ingestion Agent",
            role="Primary · Initiator",
            goal="Extract positions, transactions, and P&L from trading and accounting systems",
            model="openai-gpt-4-1",
            mcp_server="Trading Systems MCP",
            tools=["Position Reader", "Transaction Fetcher", "P&L Extractor"],
            trigger="Schedule: Monthly on the 3rd business day",
            approval="auto",
        ),
        TeamAgentSpec(
            id="reg-2",
            name="Risk Calculator Agent",
            role="Secondary",
            goal="Compute Basel III/IV risk-weighted assets, capital ratios, and VaR metrics",
            model="anthropic-claude-sonnet-4",
            mcp_server="Risk Engine MCP",
            tools=[
                "RWA Calculator",
                "VaR Engine",
                "Capital Ratio Computer",
                "Stress Test Runner",
            ],
            trigger="On completion of Data Ingestion Agent",
            approval="auto",
        ),
        TeamAgentSpec(
            id="reg-3",
            name="Reconciliation Agent",
            role="Secondary",
            goal="Cross-check computed figures against source systems and flag discrepancies",
            model="openai-gpt-4-1",
            mcp_server="Reconciliation MCP",
            tools=["Position Reconciler", "Break Detector", "Audit Logger"],
            trigger="On completion of Risk Calculator Agent",
            approval="auto",
        ),
        TeamAgentSpec(
            id="reg-4",
            name="Validation Agent",
            role="Secondary",
            goal="Validate all metrics against Basel III/IV, MiFID II, and SOX regulatory rules",
            model="openai-gpt-4-1",
            mcp_server="Compliance Rules MCP",
            tools=["Basel Rule Validator", "MiFID II Checker", "SOX Control Verifier"],
            trigger="On completion of Reconciliation Agent",
            approval="manual",
        ),
        TeamAgentSpec(
            id="reg-5",
            name="Report Generator Agent",
            role="Final",
            goal="Generate submission-ready regulatory reports with full data lineage and audit trail",
            model="openai-gpt-4-1",
            mcp_server="Document Generation MCP",
            tools=["PDF Generator", "XBRL Formatter", "Email Sender"],
            trigger="On completion of Validation Agent",
            approval="auto",
        ),
    ],
)

MOCKS_COMPREHENSIVE_SALES_ANALYTICS_TEAM_SPEC = TeamSpec(
    id="mocks/comprehensive-sales-analytics",
    name="Comprehensive Sales Analytics",
    description="A multi-agent team that replaces a single KPI monitor with four specialized agents: a Data Collector that pulls real-time CRM metrics, an Anomaly Detector that flags statistical outliers, a Trend Analyzer that identifies patterns and forecasts, and a Report Generator that compiles executive dashboards and sends alerts. Together they deliver deeper insights, faster detection, and richer reporting than any single agent could.",
    tags=["sales", "analytics", "kpi", "monitoring", "horizontal"],
    enabled=False,
    icon="graph",
    emoji="📈",
    color="#1a7f37",
    agent_spec_id="comprehensive-sales-analytics",
    orchestration_protocol="datalayer",
    execution_mode="sequential",
    supervisor=TeamSupervisorSpec(
        name="Sales Analytics Supervisor", model="anthropic-claude-opus-4"
    ),
    routing_instructions="Route data collection to KPI Collector first, then pass raw metrics to Anomaly Detector and Trend Analyzer in parallel, then aggregate all outputs into the Report Generator. Escalate if anomalies exceed the critical threshold (>25% deviation from target).",
    validation=TeamValidationSpec(timeout="300s", retry_on_failure=True, max_retries=3),
    agents=[
        TeamAgentSpec(
            id="sa-1",
            name="KPI Data Collector",
            role="Primary · Initiator",
            goal="Pull real-time sales metrics from CRM, ERP, and marketing platforms. Normalize data into a unified schema with timestamps, dimensions (region, product line, rep), and measures (revenue, pipeline, conversion).",
            model="openai-gpt-4-1",
            mcp_server="CRM Data Server",
            tools=["get_sales_data", "get_customer_list", "API Connector"],
            trigger="Schedule: Daily at 7:30 AM",
            approval="auto",
        ),
        TeamAgentSpec(
            id="sa-2",
            name="Anomaly Detector",
            role="Secondary",
            goal="Apply statistical anomaly detection (Z-score, IQR, moving average) to the collected KPIs. Flag any metric deviating more than 10% from its rolling 30-day average. Classify anomalies as info, warning, or critical.",
            model="anthropic-claude-sonnet-4",
            mcp_server="Analytics Server",
            tools=["run_analysis", "Statistical Analysis", "ML Predictor"],
            trigger="On completion of KPI Data Collector",
            approval="auto",
        ),
        TeamAgentSpec(
            id="sa-3",
            name="Trend Analyzer",
            role="Secondary",
            goal="Identify week-over-week, month-over-month, and quarter-over-quarter trends. Generate 30-day forecasts for each KPI using time-series models. Highlight the top 3 improving and top 3 declining metrics.",
            model="anthropic-claude-sonnet-4",
            mcp_server="Analytics Server",
            tools=["run_analysis", "generate_charts", "Forecaster"],
            trigger="On completion of KPI Data Collector",
            approval="auto",
        ),
        TeamAgentSpec(
            id="sa-4",
            name="Executive Report Generator",
            role="Final",
            goal="Compile all insights — raw KPIs, anomalies, trends, and forecasts — into a polished executive dashboard with charts, tables, and narrative commentary. Send the report via Slack and email. Highlight critical anomalies with a red-flag summary at the top.",
            model="openai-gpt-4-1",
            mcp_server="Document Generation MCP",
            tools=["PDF Generator", "Chart Builder", "Email Sender", "Slack Notifier"],
            trigger="On completion of Anomaly Detector & Trend Analyzer",
            approval="manual",
        ),
    ],
)

MOCKS_OPTIMIZE_GRID_OPERATIONS_TEAM_SPEC = TeamSpec(
    id="mocks/optimize-grid-operations",
    name="Optimize Grid Operations",
    description="A multi-agent team that processes millions of IoT sensor data points from smart meters, substations, and renewable generation assets. Predicts equipment failures 2–4 weeks in advance, optimises load balancing across the grid, and reduces unplanned downtime by 50%.",
    tags=[
        "energy",
        "utilities",
        "smart-grid",
        "iot",
        "predictive-maintenance",
        "sustainability",
    ],
    enabled=False,
    icon="zap",
    emoji="⚡",
    color="#1a7f37",
    agent_spec_id="optimize-grid-operations",
    orchestration_protocol="datalayer",
    execution_mode="sequential",
    supervisor=TeamSupervisorSpec(
        name="Grid Operations Orchestrator Agent", model="openai-gpt-4-1"
    ),
    routing_instructions="Start with Sensor Ingestion to process real-time telemetry, then Anomaly Detector for pattern identification, then Failure Predictor for maintenance forecasting, then Grid Balancer for load optimisation. Escalate critical failure predictions (< 48h) immediately to operations dispatch.",
    validation=TeamValidationSpec(timeout="600s", retry_on_failure=True, max_retries=3),
    agents=[
        TeamAgentSpec(
            id="grid-1",
            name="Sensor Ingestion Agent",
            role="Primary · Initiator",
            goal="Ingest and process real-time telemetry from SCADA, smart meters, and IoT gateways",
            model="openai-gpt-4-1",
            mcp_server="SCADA MCP",
            tools=[
                "SCADA Connector",
                "Smart Meter Reader",
                "IoT Gateway Adapter",
                "Time Series Processor",
            ],
            trigger="Schedule: Every 5 minutes",
            approval="auto",
        ),
        TeamAgentSpec(
            id="grid-2",
            name="Anomaly Detector Agent",
            role="Secondary",
            goal="Detect vibration, temperature, and voltage anomalies across all grid assets",
            model="openai-gpt-4-1",
            mcp_server="Monitoring MCP",
            tools=[
                "Vibration Analyzer",
                "Temperature Anomaly Detector",
                "Voltage Pattern Scanner",
                "Historical Comparator",
            ],
            trigger="On completion of Sensor Ingestion Agent",
            approval="auto",
        ),
        TeamAgentSpec(
            id="grid-3",
            name="Failure Predictor Agent",
            role="Secondary",
            goal="Predict equipment failures 2–4 weeks in advance using anomaly patterns and failure history",
            model="anthropic-claude-sonnet-4",
            mcp_server="Predictive Analytics MCP",
            tools=[
                "Failure Correlation Engine",
                "Risk Scorer",
                "Maintenance Scheduler",
                "Work Order Generator",
            ],
            trigger="On completion of Anomaly Detector Agent",
            approval="manual",
        ),
        TeamAgentSpec(
            id="grid-4",
            name="Grid Balancer Agent",
            role="Final",
            goal="Optimise real-time load balancing across renewable and conventional generation sources",
            model="openai-gpt-4-1",
            mcp_server="Grid Control MCP",
            tools=[
                "Load Forecaster",
                "Renewable Integration Model",
                "Dispatch Optimiser",
                "Grid Stability Checker",
            ],
            trigger="On completion of Failure Predictor Agent",
            approval="auto",
        ),
    ],
)

MOCKS_PROCESS_CITIZEN_REQUESTS_TEAM_SPEC = TeamSpec(
    id="mocks/process-citizen-requests",
    name="Process Citizen Requests",
    description="A multi-agent team that automates citizen request processing for government agencies. Classifies and triages permits, FOIA requests, and benefit claims from multiple channels. Models policy impacts across population datasets and ensures every automated decision is explainable, auditable, and compliant with transparency mandates.",
    tags=[
        "government",
        "public-sector",
        "civic",
        "policy",
        "compliance",
        "transparency",
    ],
    enabled=False,
    icon="organization",
    emoji="🏛️",
    color="#0550ae",
    agent_spec_id="process-citizen-requests",
    orchestration_protocol="datalayer",
    execution_mode="sequential",
    supervisor=TeamSupervisorSpec(
        name="Citizen Services Orchestrator Agent", model="openai-gpt-4-1"
    ),
    routing_instructions="Route incoming citizen requests to the Intake Agent for classification and triage, then to the Case Processor for handling and routing, then to the Policy Analyst for impact assessment on relevant items, then to the Transparency Agent for audit trail and public documentation. Escalate urgent citizen safety issues immediately to supervisors.",
    validation=TeamValidationSpec(timeout="300s", retry_on_failure=True, max_retries=2),
    agents=[
        TeamAgentSpec(
            id="cit-1",
            name="Intake & Classification Agent",
            role="Primary · Initiator",
            goal="Classify, triage, and route citizen submissions from web portals, email, and documents",
            model="openai-gpt-4-1",
            mcp_server="Citizen Portal MCP",
            tools=[
                "Request Classifier",
                "Urgency Assessor",
                "Jurisdiction Router",
                "OCR Scanner",
            ],
            trigger="Event: new citizen request received",
            approval="auto",
        ),
        TeamAgentSpec(
            id="cit-2",
            name="Case Processor Agent",
            role="Secondary",
            goal="Process and route requests to appropriate departments with required documentation",
            model="openai-gpt-4-1",
            mcp_server="Case Management MCP",
            tools=[
                "Case Creator",
                "Document Assembler",
                "Department Router",
                "Status Tracker",
            ],
            trigger="On completion of Intake Agent",
            approval="auto",
        ),
        TeamAgentSpec(
            id="cit-3",
            name="Policy Impact Analyst Agent",
            role="Secondary",
            goal="Model policy outcomes across population datasets with scenario simulation",
            model="anthropic-claude-sonnet-4",
            mcp_server="Policy Analytics MCP",
            tools=[
                "Monte Carlo Simulator",
                "Demographic Analyzer",
                "Budget Impact Model",
                "Scenario Comparator",
            ],
            trigger="On completion of Case Processor Agent",
            approval="manual",
        ),
        TeamAgentSpec(
            id="cit-4",
            name="Transparency & Audit Agent",
            role="Final",
            goal="Generate explainable decision documentation with full audit trail for public record",
            model="openai-gpt-4-1",
            mcp_server="Compliance MCP",
            tools=[
                "Decision Explainer",
                "Audit Trail Builder",
                "FOIA Compliance Checker",
                "Public Record Generator",
            ],
            trigger="On completion of Policy Impact Analyst Agent",
            approval="auto",
        ),
    ],
)

MOCKS_PROCESS_CLINICAL_TRIAL_DATA_TEAM_SPEC = TeamSpec(
    id="mocks/process-clinical-trial-data",
    name="Process Clinical Trial Data",
    description="A multi-agent team that automates clinical trial data processing across dozens of trial sites. Harmonises patient records and lab results to CDISC SDTM format, detects safety signals and adverse events in real time, and prepares submission-ready datasets — all with strict HIPAA and GxP compliance guardrails.",
    tags=["healthcare", "pharma", "clinical-trials", "patient-data", "compliance"],
    enabled=False,
    icon="heart",
    emoji="🏥",
    color="#cf222e",
    agent_spec_id="process-clinical-trial-data",
    orchestration_protocol="datalayer",
    execution_mode="sequential",
    supervisor=TeamSupervisorSpec(
        name="Clinical Data Orchestrator Agent", model="anthropic-claude-sonnet-4"
    ),
    routing_instructions="Route incoming data through the Ingestion Agent first for format detection and parsing, then to Harmonisation Agent for CDISC SDTM standardisation, then Safety Monitor for adverse event screening, then Submission Preparer for final dataset assembly. Escalate serious adverse events (SAEs) immediately to the medical officer.",
    validation=TeamValidationSpec(timeout="600s", retry_on_failure=True, max_retries=2),
    agents=[
        TeamAgentSpec(
            id="ct-1",
            name="Data Ingestion Agent",
            role="Primary · Initiator",
            goal="Ingest patient records, lab results, and CRFs from clinical sites",
            model="openai-gpt-4-1",
            mcp_server="Clinical EDC MCP",
            tools=[
                "Medidata Connector",
                "Veeva Vault Reader",
                "Oracle Clinical Adapter",
                "Format Detector",
            ],
            trigger="Event: new data batch received from site",
            approval="auto",
        ),
        TeamAgentSpec(
            id="ct-2",
            name="Harmonisation Agent",
            role="Secondary",
            goal="Standardise all data to CDISC SDTM format with MedDRA coding",
            model="openai-gpt-4-1",
            mcp_server="Data Standards MCP",
            tools=["SDTM Mapper", "MedDRA Coder", "Unit Converter", "Site Normaliser"],
            trigger="On completion of Data Ingestion Agent",
            approval="auto",
        ),
        TeamAgentSpec(
            id="ct-3",
            name="Safety Monitor Agent",
            role="Secondary",
            goal="Screen every data point for adverse events and safety signals",
            model="anthropic-claude-sonnet-4",
            mcp_server="Safety Database MCP",
            tools=[
                "AE Classifier",
                "Signal Detector",
                "SAE Escalator",
                "Evidence Trail Builder",
            ],
            trigger="On completion of Harmonisation Agent",
            approval="manual",
        ),
        TeamAgentSpec(
            id="ct-4",
            name="Submission Preparer Agent",
            role="Final",
            goal="Assemble submission-ready SDTM datasets with validation and define.xml",
            model="openai-gpt-4-1",
            mcp_server="Submission MCP",
            tools=[
                "Dataset Validator",
                "Define.xml Generator",
                "PDF Report Builder",
                "Compliance Checker",
            ],
            trigger="On completion of Safety Monitor Agent",
            approval="auto",
        ),
    ],
)

MOCKS_SYNC_CRM_CONTACTS_TEAM_SPEC = TeamSpec(
    id="mocks/sync-crm-contacts",
    name="Sync CRM Contacts",
    description="A multi-agent team that collects and aggregates contact data from multiple CRM sources, analyzes and deduplicates records, writes cleaned data back, and generates sync summary reports.",
    tags=["sales", "crm", "data-sync", "deduplication"],
    enabled=False,
    icon="people",
    emoji="🔄",
    color="#0969da",
    agent_spec_id="sync-crm-contacts",
    orchestration_protocol="datalayer",
    execution_mode="sequential",
    supervisor=TeamSupervisorSpec(
        name="CRM Orchestrator Agent", model="anthropic-claude-opus-4"
    ),
    routing_instructions="Route data collection tasks to the Data Collector first, then analysis, then sync, then reporting. Escalate to human if sync fails 3 times.",
    validation=TeamValidationSpec(timeout="300s", retry_on_failure=True, max_retries=3),
    agents=[
        TeamAgentSpec(
            id="tm-1",
            name="Data Collector Agent",
            role="Primary · Initiator",
            goal="Collect and aggregate contact data from multiple CRM sources",
            model="openai-gpt-4-1",
            mcp_server="Data Processing MCP",
            tools=["API Connector", "Data Parser"],
            trigger="Schedule: Daily at 2:00 AM",
            approval="auto",
        ),
        TeamAgentSpec(
            id="tm-2",
            name="Analyzer Agent",
            role="Secondary",
            goal="Analyze collected data and identify patterns and duplicates",
            model="anthropic-claude-opus-4",
            mcp_server="Analytics MCP",
            tools=["Statistical Analysis", "ML Predictor", "Deduplicator"],
            trigger="On completion of Data Collector",
            approval="manual",
        ),
        TeamAgentSpec(
            id="tm-3",
            name="Sync Writer Agent",
            role="Secondary",
            goal="Write cleaned and merged contacts back to the CRM systems",
            model="openai-gpt-4-1",
            mcp_server="CRM Write MCP",
            tools=["Salesforce Connector", "HubSpot Connector"],
            trigger="On completion of Analyzer",
            approval="manual",
        ),
        TeamAgentSpec(
            id="tm-4",
            name="Report Generator Agent",
            role="Final",
            goal="Generate sync summary reports and send notifications",
            model="openai-gpt-4-1",
            mcp_server="Document Generation MCP",
            tools=["PDF Generator", "Chart Builder", "Email Sender"],
            trigger="On completion of Sync Writer",
            approval="auto",
        ),
    ],
)

# ============================================================================
# Team Specs Registry
# ============================================================================

TEAM_SPECS: Dict[str, TeamSpec] = {
    # Mocks
    "mocks/analyze-campaign-performance": MOCKS_ANALYZE_CAMPAIGN_PERFORMANCE_TEAM_SPEC,
    "mocks/analyze-support-tickets": MOCKS_ANALYZE_SUPPORT_TICKETS_TEAM_SPEC,
    "mocks/audit-inventory-levels": MOCKS_AUDIT_INVENTORY_LEVELS_TEAM_SPEC,
    "mocks/automate-regulatory-reporting": MOCKS_AUTOMATE_REGULATORY_REPORTING_TEAM_SPEC,
    "mocks/comprehensive-sales-analytics": MOCKS_COMPREHENSIVE_SALES_ANALYTICS_TEAM_SPEC,
    "mocks/optimize-grid-operations": MOCKS_OPTIMIZE_GRID_OPERATIONS_TEAM_SPEC,
    "mocks/process-citizen-requests": MOCKS_PROCESS_CITIZEN_REQUESTS_TEAM_SPEC,
    "mocks/process-clinical-trial-data": MOCKS_PROCESS_CLINICAL_TRIAL_DATA_TEAM_SPEC,
    "mocks/sync-crm-contacts": MOCKS_SYNC_CRM_CONTACTS_TEAM_SPEC,
}


def get_team_spec(team_id: str) -> TeamSpec | None:
    """Get a team specification by ID."""
    return TEAM_SPECS.get(team_id)


def list_team_specs(prefix: str | None = None) -> list[TeamSpec]:
    """List all available team specifications.

    Args:
        prefix: If provided, only return specs whose ID starts with this prefix.
    """
    specs = list(TEAM_SPECS.values())
    if prefix is not None:
        specs = [s for s in specs if s.id.startswith(prefix)]
    return specs
