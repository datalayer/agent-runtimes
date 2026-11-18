# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Backend Tool Catalog.

Predefined runtime tools that can be attached to agents.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict, List

from agent_runtimes.types import BackendToolRuntimeSpec, BackendToolSpec

# ============================================================================
# Backend Tool Definitions
# ============================================================================

AWS_COMPUTE_OPTIMIZER_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="aws-compute-optimizer",
    version="0.0.1",
    name="AWS Compute Optimizer",
    description="Read AWS Compute Optimizer's findings for EC2 instances, Auto Scaling groups, EBS volumes, Lambda functions, ECS services on Fargate, RDS databases or idle resources in a region — over- and under-provisioned, with the utilization they were judged on and the savings of each option — with the read role; answered as evidence.",
    tags=["aws", "cost", "steward"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.aws_account",
        method="aws_compute_optimizer",
    ),
    icon="@primer/octicons-react:cpu",
    emoji="📏",
)

AWS_COST_EXPLORER_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="aws-cost-explorer",
    version="0.0.1",
    name="AWS Cost Explorer",
    description="Read the account's spend from AWS Cost Explorer — by service, account, region, usage type or tag — its Savings Plans and Reserved Instance coverage and utilization, AWS's Savings Plans purchase recommendation and Cost Anomaly Detection's anomalies, with the read role; answered as evidence.",
    tags=["aws", "cost", "steward"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.aws_account",
        method="aws_cost_explorer",
    ),
    icon="@primer/octicons-react:credit-card",
    emoji="📊",
)

AWS_COST_OPTIMIZATION_HUB_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="aws-cost-optimization-hub",
    version="0.0.1",
    name="AWS Cost Optimization Hub",
    description="Read AWS Cost Optimization Hub's cost recommendations for the account — rightsize, stop, delete, Savings Plans and Reserved Instances, Graviton — each with AWS's estimated monthly saving, highest first, with the read role; answered as evidence (source, call, read time, items).",
    tags=["aws", "cost", "steward"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.aws_account",
        method="aws_cost_optimization_hub",
    ),
    icon="@primer/octicons-react:graph",
    emoji="💰",
)

CREATE_PLAN_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="create-plan",
    version="0.0.1",
    name="Create Plan",
    description="Create a plan with multiple steps and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="create_plan",
    ),
    icon="@primer/octicons-react:list-unordered",
    emoji="📋",
)

CURRENT_TIME_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="current-time",
    version="0.0.1",
    name="Current Time",
    description="Return the current time in ISO format for a given timezone.",
    tags=["example", "ag-ui", "time"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="current_time",
    ),
    icon="@primer/octicons-react:clock",
    emoji="🕒",
)

DECIDE_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="decide",
    version="0.0.1",
    name="Decide",
    description="Ask the agent's decision model typed questions about a text — noul (does a statement hold, with its probability), choice (one of named options) or score (a step on a rubric) — and get the typed answers back, through datalayer-ai-inference. An agent has it when its spec names decisions.",
    tags=["runtime", "decisions", "jev"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.decisions",
        method="decide",
    ),
    icon="@primer/octicons-react:law",
    emoji="⚖️",
)

DEMO_SHOP_FIND_PRODUCTS_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="demo-shop-find-products",
    version="0.0.1",
    name="Find Demo Shop Products",
    description="Find the demo shop's products by words, category and price range, the cheapest first, each with its photo, price, rating and stock. Drawn as a grid of product cards.",
    tags=["shopping", "demo", "demo-shop"],
    enabled=True,
    ui=[{"plugin": "product-cards"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.demo_shop",
        method="find_products",
    ),
    icon="@primer/octicons-react:search",
    emoji="🔎",
)

DEMO_SHOP_GET_PRODUCT_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="demo-shop-get-product",
    version="0.0.1",
    name="Get a Demo Shop Product",
    description="One product of the demo shop with its photo, price, rating, stock and description. Drawn as a product card.",
    tags=["shopping", "demo", "demo-shop"],
    enabled=True,
    ui=[{"plugin": "product-cards"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.demo_shop",
        method="get_product",
    ),
    icon="@primer/octicons-react:package",
    emoji="📦",
)

DEMO_SHOP_LIST_PRODUCTS_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="demo-shop-list-products",
    version="0.0.1",
    name="List Demo Shop Products",
    description="List the demo shop's products, all or one category's, each with its photo, price, rating and stock. Drawn as a grid of product cards.",
    tags=["shopping", "demo", "demo-shop"],
    enabled=True,
    ui=[{"plugin": "product-cards"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.demo_shop",
        method="list_products",
    ),
    icon="@primer/octicons-react:apps",
    emoji="🛍️",
)

DEMO_SHOP_PLACE_TEST_ORDER_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="demo-shop-place-test-order",
    version="0.0.1",
    name="Place a Demo Shop Test Order",
    description="Place a test order of a basket at the demo shop: answered with a test order number, and nothing is charged, nothing ships and nothing is kept. Placed only once the person said to. Drawn with each product's photo.",
    tags=["shopping", "demo", "demo-shop"],
    enabled=True,
    ui=[{"plugin": "product-cards"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.demo_shop",
        method="place_test_order",
    ),
    icon="@primer/octicons-react:check-circle",
    emoji="✅",
)

DEMO_SHOP_QUOTE_BASKET_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="demo-shop-quote-basket",
    version="0.0.1",
    name="Quote a Demo Shop Basket",
    description="Price a basket of the demo shop's products from its catalogue: each line and the total, summed by the tool. A quote, not an order: nothing is reserved. Drawn with each product's photo.",
    tags=["shopping", "demo", "demo-shop"],
    enabled=True,
    ui=[{"plugin": "product-cards"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.demo_shop",
        method="quote_basket",
    ),
    icon="@primer/octicons-react:list-ordered",
    emoji="🧾",
)

DISPLAY_RECIPE_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="display-recipe",
    version="0.0.1",
    name="Display Recipe",
    description="Update the shared recipe state and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "shared-state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="display_recipe",
    ),
    icon="@primer/octicons-react:book",
    emoji="🍳",
)

EXAMPLE_CREATE_PLAN_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-create-plan",
    version="0.0.1",
    name="Create Plan",
    description="Create a plan with multiple steps and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="create_plan",
    ),
    icon="@primer/octicons-react:list-unordered",
    emoji="📋",
)

EXAMPLE_CURRENT_TIME_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-current-time",
    version="0.0.1",
    name="Current Time",
    description="Return the current time in ISO format for a given timezone.",
    tags=["example", "ag-ui", "time"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="current_time",
    ),
    icon="@primer/octicons-react:clock",
    emoji="🕒",
)

EXAMPLE_DISPLAY_RECIPE_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-display-recipe",
    version="0.0.1",
    name="Display Recipe",
    description="Update the shared recipe state and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "shared-state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="display_recipe",
    ),
    icon="@primer/octicons-react:book",
    emoji="🍳",
)

EXAMPLE_GENERATE_HAIKU_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-generate-haiku",
    version="0.0.1",
    name="Generate Haiku",
    description="Generate a haiku (Japanese + English + gradient) rendered as a card by the frontend.",
    tags=["example", "ag-ui", "generative-ui"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="generate_haiku",
    ),
    icon="@primer/octicons-react:pencil",
    emoji="🖋️",
)

EXAMPLE_GENERATE_TASK_STEPS_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-generate-task-steps",
    version="0.0.1",
    name="Generate Task Steps",
    description="Generate task steps for human review and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "human-in-the-loop"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="generate_task_steps",
    ),
    icon="@primer/octicons-react:tasklist",
    emoji="🙋",
)

EXAMPLE_GET_WEATHER_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-get-weather",
    version="0.0.1",
    name="Get Weather",
    description="Fetch current weather for a location from the Open-Meteo API for frontend rendering.",
    tags=["example", "ag-ui", "weather"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="get_weather",
    ),
    icon="@primer/octicons-react:sun",
    emoji="🌤️",
)

EXAMPLE_RENDER_A2UI_SURFACE_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-render-a2ui-surface",
    version="0.0.1",
    name="Render A2UI Surface",
    description="Turn a declarative field spec into a validated A2UI v0.9 surface rendered live by the frontend as an interactive form/card.",
    tags=["example", "ag-ui", "a2ui", "generative-ui"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.a2ui",
        method="render_a2ui_surface",
    ),
    icon="@primer/octicons-react:browser",
    emoji="🎛️",
)

EXAMPLE_UPDATE_PLAN_STEP_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="example-update-plan-step",
    version="0.0.1",
    name="Update Plan Step",
    description="Update a plan step and emit an AG-UI state delta (JSON Patch RFC 6902).",
    tags=["example", "ag-ui", "state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="update_plan_step",
    ),
    icon="@primer/octicons-react:checklist",
    emoji="✅",
)

GENERATE_HAIKU_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="generate-haiku",
    version="0.0.1",
    name="Generate Haiku",
    description="Generate a haiku (Japanese + English + gradient) rendered as a card by the frontend.",
    tags=["example", "ag-ui", "generative-ui"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="generate_haiku",
    ),
    icon="@primer/octicons-react:pencil",
    emoji="🖋️",
)

GENERATE_TASK_STEPS_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="generate-task-steps",
    version="0.0.1",
    name="Generate Task Steps",
    description="Generate task steps for human review and emit an AG-UI state snapshot.",
    tags=["example", "ag-ui", "human-in-the-loop"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="generate_task_steps",
    ),
    icon="@primer/octicons-react:tasklist",
    emoji="🙋",
)

GET_WEATHER_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="get-weather",
    version="0.0.1",
    name="Get Weather",
    description="Fetch current weather for a location from the Open-Meteo API for frontend rendering.",
    tags=["example", "ag-ui", "weather"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="get_weather",
    ),
    icon="@primer/octicons-react:sun",
    emoji="🌤️",
)

GITHUB_REPOSITORIES_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="github-repositories",
    version="0.0.1",
    name="GitHub Repositories",
    description="List the GitHub repositories of the person the agent works for, with the person's own GitHub grant; the first time, the person is asked to connect GitHub in the chat.",
    tags=["github", "identity"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.github",
        method="github_repositories",
    ),
    icon="@primer/octicons-react:mark-github",
    emoji="🐙",
)

LIST_RECOMMENDATIONS_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="list-recommendations",
    version="0.0.1",
    name="List Recommendations",
    description="List the recommendations recorded in this session, highest estimated saving first, by kind (cost or fix) and state, with the sum of their estimated monthly savings.",
    tags=["recommendations", "steward"],
    enabled=True,
    ui=[{"plugin": "aws-savings", "renderer": "a2ui"}, {"plugin": "aws-savings-badge"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.recommendations",
        method="list_recommendations",
    ),
    icon="@primer/octicons-react:list-ordered",
    emoji="📋",
)

RECOMMENDATIONS_REPORT_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="recommendations-report",
    version="0.0.1",
    name="Recommendations Report",
    description="Report the deployment's recommendations of the last days — how many were approved, dismissed and are still open, the estimated monthly savings of each and the largest open ones — read from its record, write it as a document in the Space the application may write, and send it through the application's notification channels with the document's link.",
    tags=["recommendations", "steward"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.recommendations",
        method="recommendations_report",
    ),
    icon="@primer/octicons-react:graph",
    emoji="📈",
)

RECORD_RECOMMENDATION_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="record-recommendation",
    version="0.0.1",
    name="Record Recommendation",
    description="Record one recommendation — a cost saving or a technical fix — with the evidence it rests on (each read's source, call, time and values), its estimate and how it was computed, its confidence and its fix as a reviewable change with its rollback; refused when any of them is missing.",
    tags=["recommendations", "steward"],
    enabled=True,
    ui=[
        {"plugin": "a2ui-surface", "renderer": "a2ui"},
        {"plugin": "aws-savings-badge"},
    ],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.recommendations",
        method="record_recommendation",
    ),
    icon="@primer/octicons-react:light-bulb",
    emoji="💡",
)

RUNTIME_ECHO_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="runtime-echo",
    version="0.0.1",
    name="Runtime Echo",
    description="Echo text back to the caller for quick runtime verification.",
    tags=["runtime", "utility"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools",
        method="runtime_echo",
    ),
    icon="@primer/octicons-react:comment",
    emoji="💬",
)

RUNTIME_SEND_MAIL_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="runtime-send-mail",
    version="0.0.1",
    name="Runtime Send Mail (Fake)",
    description="Fake mail sender for tool approval demos; returns a simulated send receipt.",
    tags=["runtime", "approval", "mail"],
    enabled=True,
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools",
        method="runtime_send_mail",
    ),
    icon="@primer/octicons-react:mail",
    emoji="📧",
)

RUNTIME_SENSITIVE_ECHO_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="runtime-sensitive-echo",
    version="0.0.1",
    name="Runtime Sensitive Echo",
    description="Echo text with a manual approval checkpoint before execution.",
    tags=["runtime", "approval"],
    enabled=True,
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools",
        method="runtime_sensitive_echo",
    ),
    icon="@primer/octicons-react:shield",
    emoji="🛡️",
)

SHOW_BASKET_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="show-basket",
    version="0.0.1",
    name="Show Basket",
    description="Show the person the basket — each item with its seller, quantity, price and photo, the shipping, and the total summed by the tool. Nothing is bought by showing it. Drawn by the shopping-basket UI plugin.",
    tags=["shopping", "card", "shopper"],
    enabled=True,
    ui=[{"plugin": "shopping-basket", "renderer": "a2ui"}, {"plugin": "basket-total"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.cards",
        method="show_basket",
    ),
    icon="@primer/octicons-react:package",
    emoji="🛒",
)

SHOW_COMPARISON_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="show-comparison",
    version="0.0.1",
    name="Show Comparison",
    description="Show the person the products compared, side by side — price, variant, availability, rating, seller and photo — and the one you would pick with why. Drawn as a table by the product-comparison UI plugin.",
    tags=["shopping", "card", "shopper"],
    enabled=True,
    ui=[{"plugin": "product-comparison", "renderer": "a2ui"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.cards",
        method="show_comparison",
    ),
    icon="@primer/octicons-react:table",
    emoji="📊",
)

SHOW_INDEX_RESULT_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="show-index-result",
    version="0.0.1",
    name="Show Index Result",
    description="Show the person an index computed from the pixels (NDVI, NDWI, NBR) over an area on each date, the change between the dates, its map and what limits the reading. Drawn by the earth-index UI plugin.",
    tags=["earth-observation", "card", "terra"],
    enabled=True,
    ui=[{"plugin": "earth-index", "renderer": "a2ui"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.cards",
        method="show_index_result",
    ),
    icon="@primer/octicons-react:graph",
    emoji="🌿",
)

SHOW_ITINERARY_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="show-itinerary",
    version="0.0.1",
    name="Show Itinerary",
    description="Show the person the trip day by day, each stop with its time and its place on a map. Drawn by the trip-itinerary UI plugin.",
    tags=["travel", "card", "traveller"],
    enabled=True,
    ui=[{"plugin": "trip-itinerary"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.cards",
        method="show_itinerary",
    ),
    icon="@primer/octicons-react:calendar",
    emoji="🗺️",
)

SHOW_RECONCILIATION_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="show-reconciliation",
    version="0.0.1",
    name="Show Reconciliation",
    description="Show the person bank lines beside the invoices they would settle, with the difference and a confidence; the person approves the matches and sends them back. Drawn by the bank-reconciliation UI plugin.",
    tags=["accounting", "card", "accountant"],
    enabled=True,
    ui=[{"plugin": "bank-reconciliation", "renderer": "a2ui"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.cards",
        method="show_reconciliation",
    ),
    icon="@primer/octicons-react:git-compare",
    emoji="🧾",
)

SHOW_SCENES_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="show-scenes",
    version="0.0.1",
    name="Show Scenes",
    description="Show the person the satellite scenes found, by date, each with its collection, sensor and cloud cover as the catalogue gave them. Drawn by the earth-scenes UI plugin.",
    tags=["earth-observation", "card", "terra"],
    enabled=True,
    ui=[{"plugin": "earth-scenes", "renderer": "a2ui"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.cards",
        method="show_scenes",
    ),
    icon="@primer/octicons-react:globe",
    emoji="🛰️",
)

SHOW_TRIAL_BALANCE_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="show-trial-balance",
    version="0.0.1",
    name="Show Trial Balance",
    description="Show the person a trial balance for a period — each account's debit, credit and balance, the totals summed by the tool and whether they agree. Drawn by the trial-balance UI plugin.",
    tags=["accounting", "card", "accountant"],
    enabled=True,
    ui=[{"plugin": "trial-balance"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.cards",
        method="show_trial_balance",
    ),
    icon="@primer/octicons-react:law",
    emoji="⚖️",
)

SHOW_TRIP_BUDGET_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="show-trip-budget",
    version="0.0.1",
    name="Show Trip Budget",
    description="Show the person what the trip costs, line by line, quotes apart from estimates, the total summed by the tool and what is left of their budget. Drawn by the trip-budget UI plugin.",
    tags=["travel", "card", "traveller"],
    enabled=True,
    ui=[{"plugin": "trip-budget"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.cards",
        method="show_trip_budget",
    ),
    icon="@primer/octicons-react:credit-card",
    emoji="💰",
)

SHOW_TRIP_OPTIONS_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="show-trip-options",
    version="0.0.1",
    name="Show Trip Options",
    description="Show the person up to three trips, one card each with dates, price and highlights, to choose from; the choice comes back as their next turn. Nothing is booked. Drawn by the trip-options UI plugin.",
    tags=["travel", "card", "traveller"],
    enabled=True,
    ui=[{"plugin": "trip-options", "renderer": "a2ui"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.cards",
        method="show_trip_options",
    ),
    icon="@primer/octicons-react:briefcase",
    emoji="🧳",
)

SHOW_VAT_SUMMARY_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="show-vat-summary",
    version="0.0.1",
    name="Show VAT Summary",
    description="Show the person the VAT for a period — the return's boxes with base and tax, what is due and deductible, and the net to pay or to be refunded. Nothing is filed. Drawn by the vat-summary UI plugin.",
    tags=["accounting", "card", "accountant", "vat"],
    enabled=True,
    ui=[{"plugin": "vat-summary"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.cards",
        method="show_vat_summary",
    ),
    icon="@primer/octicons-react:checklist",
    emoji="💶",
)

SOCIAL_ACCOUNTS_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="social-accounts",
    version="0.0.1",
    name="Social Accounts",
    description="Read which of X, Bluesky and LinkedIn the person linked in Settings, and the handle or name of each, through Datalayer's IAM; no account's token ever reaches the agent.",
    tags=["social", "datalayer-social"],
    enabled=True,
    ui=[{"plugin": "social-accounts"}],
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.social",
        method="social_accounts",
    ),
    icon="@primer/octicons-react:person",
    emoji="🪪",
)

SOCIAL_COMMENT_LINKEDIN_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="social-comment-linkedin",
    version="0.0.1",
    name="Comment on LinkedIn",
    description="Comment as the person under one LinkedIn post they name by its address, through Datalayer's IAM; it waits for the person's approval every time.",
    tags=["social", "linkedin", "datalayer-social"],
    enabled=True,
    ui=[
        {"plugin": "linkedin-post-preview", "renderer": "a2ui"},
        {"plugin": "linkedin-link"},
    ],
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.social",
        method="comment_on_linkedin",
    ),
    linked_accounts=["linkedin"],
    icon="@datalayer/icons-react:linked-in",
    emoji="💬",
)

SOCIAL_FOLLOW_BLUESKY_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="social-follow-bluesky",
    version="0.0.1",
    name="Follow on Bluesky",
    description="Follow one Bluesky account as the person, through Datalayer's IAM; it waits for the person's approval every time.",
    tags=["social", "bluesky", "datalayer-social"],
    enabled=True,
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.social",
        method="follow_on_bluesky",
    ),
    linked_accounts=["bluesky"],
    icon="@primer/octicons-react:person-add",
    emoji="➕",
)

SOCIAL_LIKE_BLUESKY_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="social-like-bluesky",
    version="0.0.1",
    name="Like on Bluesky",
    description="Like one Bluesky post as the person, through Datalayer's IAM; it waits for the person's approval every time.",
    tags=["social", "bluesky", "datalayer-social"],
    enabled=True,
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.social",
        method="like_on_bluesky",
    ),
    linked_accounts=["bluesky"],
    icon="@primer/octicons-react:heart",
    emoji="❤️",
)

SOCIAL_LIKE_X_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="social-like-x",
    version="0.0.1",
    name="Like on X",
    description="Like one X post as the person, through Datalayer's IAM; it waits for the person's approval every time, held to the person's X budget.",
    tags=["social", "x", "datalayer-social"],
    enabled=True,
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.social",
        method="like_on_x",
    ),
    linked_accounts=["x"],
    icon="@primer/octicons-react:heart",
    emoji="❤️",
)

SOCIAL_POST_BLUESKY_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="social-post-bluesky",
    version="0.0.1",
    name="Post to Bluesky",
    description="Publish one post on the person's own Bluesky account, linked in Settings, with up to four PNG or JPEG images and their alt text, through Datalayer's IAM; it waits for the person's approval every time.",
    tags=["social", "bluesky", "datalayer-social"],
    enabled=True,
    ui=[{"plugin": "bluesky-post-preview", "renderer": "a2ui"}],
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.social",
        method="post_to_bluesky",
    ),
    linked_accounts=["bluesky"],
    icon="@datalayer/icons-react:bluesky",
    emoji="🦋",
)

SOCIAL_POST_LINKEDIN_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="social-post-linkedin",
    version="0.0.1",
    name="Post to LinkedIn",
    description="Publish one post on the person's own LinkedIn profile, linked in Settings, with one PNG or JPEG image and its alt text, through Datalayer's IAM; it waits for the person's approval every time.",
    tags=["social", "linkedin", "datalayer-social"],
    enabled=True,
    ui=[
        {"plugin": "linkedin-post-preview", "renderer": "a2ui"},
        {"plugin": "linkedin-link"},
    ],
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.social",
        method="post_to_linkedin",
    ),
    linked_accounts=["linkedin"],
    icon="@datalayer/icons-react:linked-in",
    emoji="💼",
)

SOCIAL_POST_X_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="social-post-x",
    version="0.0.1",
    name="Post to X",
    description="Publish one post on the person's own X account, linked in Settings, with up to four PNG or JPEG images, through Datalayer's IAM; it waits for the person's approval every time.",
    tags=["social", "x", "datalayer-social"],
    enabled=True,
    ui=[{"plugin": "x-post-preview", "renderer": "a2ui"}],
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.social",
        method="post_to_x",
    ),
    linked_accounts=["x"],
    icon="@datalayer/icons-react:x",
    emoji="✖️",
)

SOCIAL_READ_BLUESKY_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="social-read-bluesky",
    version="0.0.1",
    name="Read Bluesky",
    description="Read Bluesky as the person, with their account linked in Settings: their timeline, someone's posts, a thread and its replies, who liked or reposted a post, a profile, search of posts and people, their notifications, follows and followers, through Datalayer's IAM.",
    tags=["social", "bluesky", "datalayer-social"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.social",
        method="read_bluesky",
    ),
    linked_accounts=["bluesky"],
    icon="@datalayer/icons-react:bluesky",
    emoji="🦋",
)

SOCIAL_READ_X_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="social-read-x",
    version="0.0.1",
    name="Read X",
    description="Read X as the person, with their account linked in Settings: their own profile, someone's, a post, their timeline, their posts, their mentions, the replies to a post and a search of recent posts, through Datalayer's IAM; each read is held to the person's X budget.",
    tags=["social", "x", "datalayer-social"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.social",
        method="read_x",
    ),
    linked_accounts=["x"],
    icon="@datalayer/icons-react:x",
    emoji="✖️",
)

SOCIAL_REPLY_BLUESKY_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="social-reply-bluesky",
    version="0.0.1",
    name="Reply on Bluesky",
    description="Reply as the person under one Bluesky post they or the agent named by its address, through Datalayer's IAM; it waits for the person's approval every time.",
    tags=["social", "bluesky", "datalayer-social"],
    enabled=True,
    ui=[{"plugin": "bluesky-post-preview", "renderer": "a2ui"}],
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.social",
        method="reply_on_bluesky",
    ),
    linked_accounts=["bluesky"],
    icon="@datalayer/icons-react:bluesky",
    emoji="💬",
)

SOCIAL_REPLY_X_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="social-reply-x",
    version="0.0.1",
    name="Reply on X",
    description="Reply as the person under one X post, through Datalayer's IAM; it waits for the person's approval every time. A reply costs Datalayer USD 0.015 at X, USD 0.20 with a link, held to the person's X budget.",
    tags=["social", "x", "datalayer-social"],
    enabled=True,
    ui=[{"plugin": "x-post-preview", "renderer": "a2ui"}],
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.social",
        method="reply_on_x",
    ),
    linked_accounts=["x"],
    icon="@primer/octicons-react:reply",
    emoji="↩️",
)

SOCIAL_REPOST_BLUESKY_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="social-repost-bluesky",
    version="0.0.1",
    name="Repost on Bluesky",
    description="Repost one Bluesky post on the person's profile, through Datalayer's IAM; it waits for the person's approval every time.",
    tags=["social", "bluesky", "datalayer-social"],
    enabled=True,
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.social",
        method="repost_on_bluesky",
    ),
    linked_accounts=["bluesky"],
    icon="@primer/octicons-react:sync",
    emoji="🔁",
)

SOCIAL_REPOST_X_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="social-repost-x",
    version="0.0.1",
    name="Repost on X",
    description="Repost one X post on the person's profile, through Datalayer's IAM; it waits for the person's approval every time, held to the person's X budget.",
    tags=["social", "x", "datalayer-social"],
    enabled=True,
    approval="manual",
    timeout=None,
    requires_approval=True,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.tools.social",
        method="repost_on_x",
    ),
    linked_accounts=["x"],
    icon="@primer/octicons-react:sync",
    emoji="🔁",
)

UPDATE_PLAN_STEP_BACKEND_TOOL_SPEC_0_0_1 = BackendToolSpec(
    id="update-plan-step",
    version="0.0.1",
    name="Update Plan Step",
    description="Update a plan step and emit an AG-UI state delta (JSON Patch RFC 6902).",
    tags=["example", "ag-ui", "state"],
    enabled=True,
    approval="auto",
    timeout=None,
    requires_approval=False,
    runtime=BackendToolRuntimeSpec(
        language="python",
        package="agent_runtimes.examples.tools.ag_ui",
        method="update_plan_step",
    ),
    icon="@primer/octicons-react:checklist",
    emoji="✅",
)

# ============================================================================
# Backend Tool Catalog
# ============================================================================

BACKEND_TOOL_CATALOG: Dict[str, BackendToolSpec] = {
    "aws-compute-optimizer": AWS_COMPUTE_OPTIMIZER_BACKEND_TOOL_SPEC_0_0_1,
    "aws-cost-explorer": AWS_COST_EXPLORER_BACKEND_TOOL_SPEC_0_0_1,
    "aws-cost-optimization-hub": AWS_COST_OPTIMIZATION_HUB_BACKEND_TOOL_SPEC_0_0_1,
    "create-plan": CREATE_PLAN_BACKEND_TOOL_SPEC_0_0_1,
    "current-time": CURRENT_TIME_BACKEND_TOOL_SPEC_0_0_1,
    "decide": DECIDE_BACKEND_TOOL_SPEC_0_0_1,
    "demo-shop-find-products": DEMO_SHOP_FIND_PRODUCTS_BACKEND_TOOL_SPEC_0_0_1,
    "demo-shop-get-product": DEMO_SHOP_GET_PRODUCT_BACKEND_TOOL_SPEC_0_0_1,
    "demo-shop-list-products": DEMO_SHOP_LIST_PRODUCTS_BACKEND_TOOL_SPEC_0_0_1,
    "demo-shop-place-test-order": DEMO_SHOP_PLACE_TEST_ORDER_BACKEND_TOOL_SPEC_0_0_1,
    "demo-shop-quote-basket": DEMO_SHOP_QUOTE_BASKET_BACKEND_TOOL_SPEC_0_0_1,
    "display-recipe": DISPLAY_RECIPE_BACKEND_TOOL_SPEC_0_0_1,
    "example-create-plan": EXAMPLE_CREATE_PLAN_BACKEND_TOOL_SPEC_0_0_1,
    "example-current-time": EXAMPLE_CURRENT_TIME_BACKEND_TOOL_SPEC_0_0_1,
    "example-display-recipe": EXAMPLE_DISPLAY_RECIPE_BACKEND_TOOL_SPEC_0_0_1,
    "example-generate-haiku": EXAMPLE_GENERATE_HAIKU_BACKEND_TOOL_SPEC_0_0_1,
    "example-generate-task-steps": EXAMPLE_GENERATE_TASK_STEPS_BACKEND_TOOL_SPEC_0_0_1,
    "example-get-weather": EXAMPLE_GET_WEATHER_BACKEND_TOOL_SPEC_0_0_1,
    "example-render-a2ui-surface": EXAMPLE_RENDER_A2UI_SURFACE_BACKEND_TOOL_SPEC_0_0_1,
    "example-update-plan-step": EXAMPLE_UPDATE_PLAN_STEP_BACKEND_TOOL_SPEC_0_0_1,
    "generate-haiku": GENERATE_HAIKU_BACKEND_TOOL_SPEC_0_0_1,
    "generate-task-steps": GENERATE_TASK_STEPS_BACKEND_TOOL_SPEC_0_0_1,
    "get-weather": GET_WEATHER_BACKEND_TOOL_SPEC_0_0_1,
    "github-repositories": GITHUB_REPOSITORIES_BACKEND_TOOL_SPEC_0_0_1,
    "list-recommendations": LIST_RECOMMENDATIONS_BACKEND_TOOL_SPEC_0_0_1,
    "recommendations-report": RECOMMENDATIONS_REPORT_BACKEND_TOOL_SPEC_0_0_1,
    "record-recommendation": RECORD_RECOMMENDATION_BACKEND_TOOL_SPEC_0_0_1,
    "runtime-echo": RUNTIME_ECHO_BACKEND_TOOL_SPEC_0_0_1,
    "runtime-send-mail": RUNTIME_SEND_MAIL_BACKEND_TOOL_SPEC_0_0_1,
    "runtime-sensitive-echo": RUNTIME_SENSITIVE_ECHO_BACKEND_TOOL_SPEC_0_0_1,
    "show-basket": SHOW_BASKET_BACKEND_TOOL_SPEC_0_0_1,
    "show-comparison": SHOW_COMPARISON_BACKEND_TOOL_SPEC_0_0_1,
    "show-index-result": SHOW_INDEX_RESULT_BACKEND_TOOL_SPEC_0_0_1,
    "show-itinerary": SHOW_ITINERARY_BACKEND_TOOL_SPEC_0_0_1,
    "show-reconciliation": SHOW_RECONCILIATION_BACKEND_TOOL_SPEC_0_0_1,
    "show-scenes": SHOW_SCENES_BACKEND_TOOL_SPEC_0_0_1,
    "show-trial-balance": SHOW_TRIAL_BALANCE_BACKEND_TOOL_SPEC_0_0_1,
    "show-trip-budget": SHOW_TRIP_BUDGET_BACKEND_TOOL_SPEC_0_0_1,
    "show-trip-options": SHOW_TRIP_OPTIONS_BACKEND_TOOL_SPEC_0_0_1,
    "show-vat-summary": SHOW_VAT_SUMMARY_BACKEND_TOOL_SPEC_0_0_1,
    "social-accounts": SOCIAL_ACCOUNTS_BACKEND_TOOL_SPEC_0_0_1,
    "social-comment-linkedin": SOCIAL_COMMENT_LINKEDIN_BACKEND_TOOL_SPEC_0_0_1,
    "social-follow-bluesky": SOCIAL_FOLLOW_BLUESKY_BACKEND_TOOL_SPEC_0_0_1,
    "social-like-bluesky": SOCIAL_LIKE_BLUESKY_BACKEND_TOOL_SPEC_0_0_1,
    "social-like-x": SOCIAL_LIKE_X_BACKEND_TOOL_SPEC_0_0_1,
    "social-post-bluesky": SOCIAL_POST_BLUESKY_BACKEND_TOOL_SPEC_0_0_1,
    "social-post-linkedin": SOCIAL_POST_LINKEDIN_BACKEND_TOOL_SPEC_0_0_1,
    "social-post-x": SOCIAL_POST_X_BACKEND_TOOL_SPEC_0_0_1,
    "social-read-bluesky": SOCIAL_READ_BLUESKY_BACKEND_TOOL_SPEC_0_0_1,
    "social-read-x": SOCIAL_READ_X_BACKEND_TOOL_SPEC_0_0_1,
    "social-reply-bluesky": SOCIAL_REPLY_BLUESKY_BACKEND_TOOL_SPEC_0_0_1,
    "social-reply-x": SOCIAL_REPLY_X_BACKEND_TOOL_SPEC_0_0_1,
    "social-repost-bluesky": SOCIAL_REPOST_BLUESKY_BACKEND_TOOL_SPEC_0_0_1,
    "social-repost-x": SOCIAL_REPOST_X_BACKEND_TOOL_SPEC_0_0_1,
    "update-plan-step": UPDATE_PLAN_STEP_BACKEND_TOOL_SPEC_0_0_1,
}


def get_backend_tool_spec(tool_id: str) -> BackendToolSpec | None:
    """Get a tool specification by ID (accepts both bare and versioned refs)."""
    spec = BACKEND_TOOL_CATALOG.get(tool_id)
    if spec is not None:
        return spec
    base, _, ver = tool_id.rpartition(":")
    if base and "." in ver:
        return BACKEND_TOOL_CATALOG.get(base)
    return None


def list_backend_tool_specs() -> List[BackendToolSpec]:
    """List all tool specifications."""
    return list(BACKEND_TOOL_CATALOG.values())
