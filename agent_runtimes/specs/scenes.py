# Copyright (c) 2025-2026 Datalayer, Inc.
# Distributed under the terms of the Modified BSD License.
"""
Scene Catalog.

A team, staged: the setting, the script, the stage directions, the
audience, the rehearsal and where it plays. The cast is resolved.

This file is AUTO-GENERATED from YAML specifications.
DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
"""

from typing import Dict

from agent_runtimes.types import SceneSpec

# ============================================================================
# Scene Definitions
# ============================================================================

CROP_MONITORING_SCENE_0_0_1 = SceneSpec.model_validate(
    {
        "schema": "loop.scene/v1",
        "id": "crop-monitoring",
        "version": "0.0.1",
        "name": "Crop Monitoring",
        "description": "One agent follows crop vigour and growth over a season from the satellite imagery NASA Earthdata holds, and flags the fields that need attention.",
        "tags": ["example", "scene", "earthdata", "agriculture", "a2a"],
        "icon": "globe",
        "emoji": "🛰️",
        "team": "crop-monitoring:0.0.1",
        "entry": "crop-monitoring",
        "cast": [
            {
                "member": "crop-monitoring",
                "app": "crop-monitoring:0.0.1",
                "ref": "",
                "server": "",
                "role": "initiator",
                "runs_in": "runtime",
                "persona": {
                    "name": "Crop Monitoring",
                    "face": "🌾",
                    "line": "I search the imagery and tell you how the fields are doing.",
                },
                "brief": "Take the field and the period, search the datasets and the granules that cover them, and report the vigour, the growth and the fields to watch; leave any download to the person.",
            }
        ],
        "setting": {
            "systems": [
                {
                    "server": "earthdata:0.0.1",
                    "as": "Earthdata",
                    "holds": "NASA's catalogue of satellite imagery, searched, not downloaded.",
                }
            ],
            "period": "the last three months",
            "language": "en",
            "assumes": "One agent, its data: Crop Monitoring on Datalayer, searching the satellite imagery NASA Earthdata holds.",
        },
        "script": [
            {
                "id": "vigour-this-season",
                "cue": {
                    "say": "How has crop vigour evolved over the last three months around 45.5N, 10.2E?",
                    "schedule": "",
                    "event": "",
                },
                "narration": "The datasets that cover the place, then the granules of the season.",
                "moves": [
                    {
                        "who": "crop-monitoring",
                        "asks": "earthdata",
                        "over": "mcp",
                        "what": "the vegetation datasets covering the place",
                        "tool": "search_earth_datasets",
                        "does": "read",
                    },
                    {
                        "who": "crop-monitoring",
                        "asks": "earthdata",
                        "over": "mcp",
                        "what": "the granules of the last three months",
                        "tool": "search_earth_datagranules",
                        "does": "read",
                    },
                    {
                        "who": "crop-monitoring",
                        "asks": "",
                        "what": "the vigour month by month",
                        "tool": "",
                        "answers": "chart",
                    },
                    {
                        "who": "crop-monitoring",
                        "asks": "",
                        "what": "how the season went, in a paragraph",
                        "tool": "",
                        "answers": "words",
                    },
                ],
                "expect": "A chart of the vigour month by month from the granules found, and a paragraph saying how the season went; nothing downloaded.",
                "shows": ["chart", "words"],
                "branch": [
                    {
                        "decision": "no granule covers the period",
                        "expect": "It says so, and names the nearest dates that are covered.",
                        "moves": [],
                        "then": "",
                    }
                ],
            },
            {
                "id": "fields-to-watch",
                "cue": {
                    "say": "Which fields around 41.9N, 12.5E show a drop in vegetation this month compared with last?",
                    "schedule": "",
                    "event": "",
                },
                "narration": "This month against the last, field by field.",
                "moves": [
                    {
                        "who": "crop-monitoring",
                        "asks": "earthdata",
                        "over": "mcp",
                        "what": "the granules of this month and the last",
                        "tool": "search_earth_datagranules",
                        "does": "read",
                    },
                    {
                        "who": "crop-monitoring",
                        "asks": "",
                        "what": "the fields whose vegetation dropped, with the drop",
                        "tool": "",
                        "answers": "table",
                    },
                ],
                "expect": "A table of the fields whose vegetation dropped from last month to this, each with the size of the drop, from the imagery found.",
                "shows": ["table"],
                "pace": "slow",
            },
            {
                "id": "imagery-available",
                "cue": {
                    "say": "Which datasets and granules cover the Po valley for June 2026?",
                    "schedule": "",
                    "event": "",
                },
                "narration": "What there is to look at, before anything is looked at.",
                "moves": [
                    {
                        "who": "crop-monitoring",
                        "asks": "earthdata",
                        "over": "mcp",
                        "what": "the datasets covering the Po valley",
                        "tool": "search_earth_datasets",
                        "does": "read",
                    },
                    {
                        "who": "crop-monitoring",
                        "asks": "earthdata",
                        "over": "mcp",
                        "what": "the granules of June 2026",
                        "tool": "search_earth_datagranules",
                        "does": "read",
                    },
                    {
                        "who": "crop-monitoring",
                        "asks": "",
                        "what": "the datasets and the granules as cards that open their pages",
                        "tool": "",
                        "answers": "sources",
                    },
                ],
                "expect": "The datasets and the granules that cover the Po valley in June 2026 as cards, each with its date and a link that opens it at NASA Earthdata; a download is left to the person.",
                "shows": ["sources"],
            },
            {
                "id": "save-granules",
                "cue": {
                    "say": "Save the June 2026 granules of the Po valley to my Space.",
                    "schedule": "",
                    "event": "",
                },
                "narration": "A download and a save — asked first, and not done for a visitor.",
                "moves": [
                    {
                        "who": "crop-monitoring",
                        "asks": "earthdata",
                        "over": "mcp",
                        "what": "the granules of June 2026",
                        "tool": "search_earth_datagranules",
                        "does": "read",
                    },
                    {
                        "who": "crop-monitoring",
                        "asks": "",
                        "what": "the granules it would save, as a choice to approve",
                        "tool": "",
                        "answers": "approval",
                    },
                ],
                "expect": "It names the granules it would save and asks first — Save them · Not now — and saves nothing; a visitor who approves is refused in a sentence: without an account it only reads.",
                "shows": ["approval"],
            },
        ],
        "stage": {
            "positions": {"crop-monitoring": {"x": 0.5, "y": 0.5}},
            "opens_first": "crop-monitoring",
            "transcript": {"tools": True, "narration": True},
            "inspectors": ["agent", "tools"],
            "rests_after": "10m",
            "pace": "steady",
        },
        "audience": {"who": "visitors", "ceiling_per_ask": 0.05, "asks_a_day": 5},
        "rehearsal": {
            "beats": [
                {
                    "beat": "vigour-this-season",
                    "lines": [
                        "You → Crop Monitoring",
                        "Crop Monitoring → Earthdata: search_earth_datasets",
                        "Crop Monitoring → Earthdata: search_earth_datagranules",
                        "Crop Monitoring: a chart",
                    ],
                    "must_say": ["vigour"],
                    "must_not_say": ["downloaded"],
                    "within": "90s",
                },
                {
                    "beat": "fields-to-watch",
                    "lines": [
                        "You → Crop Monitoring",
                        "Crop Monitoring → Earthdata: search_earth_datagranules",
                        "Crop Monitoring: a table",
                    ],
                    "must_say": ["drop"],
                    "within": "90s",
                },
                {
                    "beat": "imagery-available",
                    "lines": [
                        "You → Crop Monitoring",
                        "Crop Monitoring → Earthdata: search_earth_*",
                        "Crop Monitoring: sources",
                    ],
                    "must_say": ["granule"],
                    "must_not_say": ["downloaded"],
                    "within": "60s",
                },
                {
                    "beat": "save-granules",
                    "lines": [
                        "You → Crop Monitoring",
                        "Crop Monitoring → Earthdata: search_earth_datagranules",
                        "Crop Monitoring: an approval",
                    ],
                    "must_say": ["granule"],
                    "must_not_say": ["downloaded", "saved them"],
                    "within": "60s",
                },
            ],
            "within": "240s",
            "verified": {
                "live": [],
                "recorded": [],
                "unverified": [
                    "Its runtime is not deployed under the demo account yet, and the rehearsal has not been played (A-14)."
                ],
            },
        },
        "deployment": {
            "account": "demo",
            "page": "/",
            "addresses": {
                "crop-monitoring": "DATALAYER_DEMO_SCENE_CROP_MONITORING_CROP_MONITORING_A2A_URL"
            },
        },
        "setup": ["The agent 'worker-crop-monitoring:0.0.1' is not enabled."],
        "played": {
            "at": "2026-10-08T17:44:37+00:00",
            "where": "on Datalayer",
            "passed": False,
            "says": "Rehearsal: 0 of 4 beats passed. 4 not run. The scene is not Live.",
            "beats": [
                {
                    "beat": "vigour-this-season",
                    "state": "not_run",
                    "says": "Crop monitoring is not set up: the MCP server tavily needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. Crop monitoring is not set up: the skill crawl needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. The runtime was stopped.",
                    "seconds": 0.0,
                },
                {
                    "beat": "fields-to-watch",
                    "state": "not_run",
                    "says": "Crop monitoring is not set up: the MCP server tavily needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. Crop monitoring is not set up: the skill crawl needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. The runtime was stopped.",
                    "seconds": 0.0,
                },
                {
                    "beat": "imagery-available",
                    "state": "not_run",
                    "says": "Crop monitoring is not set up: the MCP server tavily needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. Crop monitoring is not set up: the skill crawl needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. The runtime was stopped.",
                    "seconds": 0.0,
                },
                {
                    "beat": "save-granules",
                    "state": "not_run",
                    "says": "Crop monitoring is not set up: the MCP server tavily needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. Crop monitoring is not set up: the skill crawl needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. The runtime was stopped.",
                    "seconds": 0.0,
                },
            ],
            "runtime": "1.3.93",
        },
    }
)

DISASTER_ASSESSMENT_SCENE_0_0_1 = SceneSpec.model_validate(
    {
        "schema": "loop.scene/v1",
        "id": "disaster-assessment",
        "version": "0.0.1",
        "name": "Disaster Assessment",
        "description": "An event desk asks two specialists what a disaster affected and what changed on the ground, each reading NASA Earthdata, and reports.",
        "tags": ["example", "scene", "earthdata", "disaster", "insurance", "a2a"],
        "icon": "alert",
        "emoji": "🚨",
        "team": "disaster-assessment:0.0.1",
        "entry": "event-response",
        "cast": [
            {
                "member": "event-response",
                "app": "event-response:0.0.1",
                "ref": "",
                "server": "",
                "role": "initiator",
                "runs_in": "browser",
                "talks_to": [
                    {"member": "disaster-assessment", "over": "a2a"},
                    {"member": "change-detection", "over": "a2a"},
                ],
                "persona": {
                    "name": "Event response",
                    "face": "🛡️",
                    "line": "Tell me what happened; I ask the specialists and report.",
                },
                "brief": "Take the event, ask Disaster Assessment for the area and the damage and Change detection for the change on the ground, one request each, and report what they answer without adding to it.",
            },
            {
                "member": "disaster-assessment",
                "app": "disaster-assessment:0.0.1",
                "ref": "",
                "server": "",
                "role": "contributor",
                "runs_in": "runtime",
                "persona": {
                    "name": "Disaster Assessment",
                    "face": "🌊",
                    "line": "I estimate the area affected and the damage from the imagery.",
                },
                "brief": "From the imagery before and after the event, estimate the area affected and the extent of the damage; say what the imagery does not show.",
            },
            {
                "member": "change-detection",
                "app": "change-detection:0.0.1",
                "ref": "",
                "server": "",
                "role": "contributor",
                "runs_in": "runtime",
                "persona": {
                    "name": "Change detection",
                    "face": "🔍",
                    "line": "I find what changed on the ground between two dates.",
                },
                "brief": "From the imagery at two dates, find what changed on the ground; give the granules the change was read from.",
            },
        ],
        "setting": {
            "systems": [
                {
                    "server": "earthdata:0.0.1",
                    "as": "Earthdata",
                    "holds": "NASA's catalogue of satellite imagery, searched, not downloaded.",
                }
            ],
            "period": "the days before and after the event",
            "language": "en",
            "assumes": "Three agents over A2A — Event response in your browser, Disaster assessment and Change detection on Datalayer — each searching the satellite imagery NASA Earthdata holds.",
        },
        "script": [
            {
                "id": "flood",
                "cue": {
                    "say": "Valencia, Spain, was flooded on 29 October 2024. What was affected, and what changed?",
                    "schedule": "",
                    "event": "",
                },
                "narration": "Event response asks both specialists; each searches the imagery around the date.",
                "moves": [
                    {
                        "who": "event-response",
                        "asks": "disaster-assessment",
                        "over": "a2a",
                        "what": "the area the flood affected and the damage",
                        "tool": "",
                    },
                    {
                        "who": "disaster-assessment",
                        "asks": "earthdata",
                        "over": "mcp",
                        "what": "the granules before and after 29 October 2024",
                        "tool": "search_earth_datagranules",
                        "does": "read",
                    },
                    {
                        "who": "disaster-assessment",
                        "asks": "",
                        "what": "the area affected and the extent of the damage",
                        "tool": "",
                        "answers": "words",
                    },
                    {
                        "who": "event-response",
                        "asks": "change-detection",
                        "over": "a2a",
                        "what": "what changed on the ground around Valencia",
                        "tool": "",
                    },
                    {
                        "who": "change-detection",
                        "asks": "earthdata",
                        "over": "mcp",
                        "what": "the granules at the two dates",
                        "tool": "search_earth_datagranules",
                        "does": "read",
                    },
                    {
                        "who": "change-detection",
                        "asks": "",
                        "what": "the changes found, each with the granules it was read from",
                        "tool": "",
                        "answers": "table",
                    },
                    {
                        "who": "event-response",
                        "asks": "",
                        "what": "what the two answered, as they answered it",
                        "tool": "",
                        "answers": "words",
                    },
                ],
                "expect": "The area affected and the damage from Disaster Assessment, the changes on the ground from Change detection with their granules, reported by Event response without a figure of its own.",
                "shows": ["words", "table"],
                "pace": "slow",
                "branch": [
                    {
                        "decision": "no imagery covers the days around the event",
                        "expect": "The specialists say so, and Event response reports that nothing could be assessed.",
                        "moves": [],
                        "then": "",
                    }
                ],
            },
            {
                "id": "wildfire",
                "cue": {
                    "say": "Fires burned around Los Angeles from 7 January 2025. Which imagery shows what changed?",
                    "schedule": "",
                    "event": "",
                },
                "narration": "Change detection finds the imagery before and after, and gives it as sources.",
                "moves": [
                    {
                        "who": "event-response",
                        "asks": "change-detection",
                        "over": "a2a",
                        "what": "the imagery before and after the fires around Los Angeles",
                        "tool": "",
                    },
                    {
                        "who": "change-detection",
                        "asks": "earthdata",
                        "over": "mcp",
                        "what": "the granules before and after 7 January 2025",
                        "tool": "search_earth_datagranules",
                        "does": "read",
                    },
                    {
                        "who": "change-detection",
                        "asks": "",
                        "what": "the granules as cards that open their pages, each with its date",
                        "tool": "",
                        "answers": "sources",
                    },
                    {
                        "who": "event-response",
                        "asks": "",
                        "what": "what Change detection answered",
                        "tool": "",
                        "answers": "words",
                    },
                ],
                "expect": "The granules before and after the fires as cards, each with its date and a link that opens it at NASA Earthdata, reported by Event response as Change detection gave them.",
                "shows": ["sources"],
                "pace": "slow",
            },
            {
                "id": "storm",
                "cue": {
                    "say": "The Ahr valley was hit by a storm on 14 July 2021. Chart the imagery found each day from 10 to 20 July.",
                    "schedule": "",
                    "event": "",
                },
                "narration": "A storm, three years back: what the archive still holds, day by day.",
                "moves": [
                    {
                        "who": "event-response",
                        "asks": "disaster-assessment",
                        "over": "a2a",
                        "what": "the imagery found each day around the storm",
                        "tool": "",
                    },
                    {
                        "who": "disaster-assessment",
                        "asks": "earthdata",
                        "over": "mcp",
                        "what": "the granules from 10 to 20 July 2021",
                        "tool": "search_earth_datagranules",
                        "does": "read",
                    },
                    {
                        "who": "disaster-assessment",
                        "asks": "",
                        "what": "the granules found each day, drawn",
                        "tool": "",
                        "answers": "chart",
                    },
                    {
                        "who": "event-response",
                        "asks": "",
                        "what": "what Disaster Assessment answered",
                        "tool": "",
                        "answers": "words",
                    },
                ],
                "expect": "A chart of the granules found each day from 10 to 20 July 2021, read from the search, and what the archive does not cover said in words.",
                "shows": ["chart"],
                "pace": "slow",
            },
            {
                "id": "alert",
                "cue": {
                    "say": "Send the Valencia flood assessment to the emergency services.",
                    "schedule": "",
                    "event": "",
                },
                "narration": "An action, not a report — asked first, and not done for a visitor.",
                "moves": [
                    {
                        "who": "event-response",
                        "asks": "disaster-assessment",
                        "over": "a2a",
                        "what": "the flood assessment, to send to the emergency services",
                        "tool": "",
                    },
                    {
                        "who": "disaster-assessment",
                        "asks": "earthdata",
                        "over": "mcp",
                        "what": "the granules after 29 October 2024",
                        "tool": "search_earth_datagranules",
                        "does": "read",
                    },
                    {
                        "who": "disaster-assessment",
                        "asks": "",
                        "what": "the assessment it would send, as a choice to approve",
                        "tool": "",
                        "answers": "approval",
                    },
                    {
                        "who": "event-response",
                        "asks": "",
                        "what": "that the sending waits for an approval",
                        "tool": "",
                        "answers": "words",
                    },
                ],
                "expect": "Disaster Assessment says what it would send and asks first — Send it · Not now — and sends nothing; a visitor who approves is refused in a sentence: without an account it only reads.",
                "shows": ["approval"],
            },
        ],
        "stage": {
            "positions": {
                "event-response": {"x": 0.5, "y": 0.2},
                "disaster-assessment": {"x": 0.25, "y": 0.75},
                "change-detection": {"x": 0.75, "y": 0.75},
            },
            "opens_first": "event-response",
            "transcript": {"tools": True, "narration": True},
            "inspectors": ["agent", "a2a", "tools"],
            "rests_after": "10m",
            "pace": "slow",
        },
        "audience": {"who": "visitors", "ceiling_per_ask": 0.1, "asks_a_day": 3},
        "rehearsal": {
            "beats": [
                {
                    "beat": "flood",
                    "lines": [
                        "You → Event response",
                        "Event response → Disaster Assessment",
                        "Disaster Assessment → Earthdata: search_earth_datagranules",
                        "Disaster Assessment: words",
                        "Event response → Change detection",
                        "Change detection → Earthdata: search_earth_datagranules",
                        "Change detection: a table",
                        "Event response: words",
                    ],
                    "must_say": ["Valencia"],
                    "must_not_say": ["downloaded"],
                    "within": "120s",
                },
                {
                    "beat": "wildfire",
                    "lines": [
                        "You → Event response",
                        "Event response → Change detection",
                        "Change detection → Earthdata: search_earth_datagranules",
                        "Change detection: sources",
                        "Event response: words",
                    ],
                    "must_say": ["Los Angeles"],
                    "within": "120s",
                },
                {
                    "beat": "storm",
                    "lines": [
                        "You → Event response",
                        "Event response → Disaster Assessment",
                        "Disaster Assessment → Earthdata: search_earth_datagranules",
                        "Disaster Assessment: a chart",
                        "Event response: words",
                    ],
                    "must_say": ["Ahr"],
                    "within": "120s",
                },
                {
                    "beat": "alert",
                    "lines": [
                        "You → Event response",
                        "Event response → Disaster Assessment",
                        "Disaster Assessment → Earthdata: search_earth_datagranules",
                        "Disaster Assessment: an approval",
                        "Event response: words",
                    ],
                    "must_say": ["Valencia"],
                    "must_not_say": ["I sent"],
                    "within": "120s",
                },
            ],
            "within": "300s",
            "verified": {
                "live": [],
                "recorded": [],
                "unverified": [
                    "The two runtimes are not deployed under the demo account yet, the page runs a team of two today, and the rehearsal has not been played (A-14)."
                ],
            },
        },
        "deployment": {
            "account": "demo",
            "page": "/",
            "addresses": {
                "disaster-assessment": "DATALAYER_DEMO_SCENE_DISASTER_ASSESSMENT_DISASTER_ASSESSMENT_A2A_URL",
                "change-detection": "DATALAYER_DEMO_SCENE_DISASTER_ASSESSMENT_CHANGE_DETECTION_A2A_URL",
            },
        },
        "setup": [
            "The agent 'worker-event-response:0.0.1' is not enabled.",
            "The agent 'worker-disaster-assessment:0.0.1' is not enabled.",
            "The agent 'worker-change-detection:0.0.1' is not enabled.",
        ],
        "played": {
            "at": "2026-10-08T17:43:28+00:00",
            "where": "on Datalayer",
            "passed": False,
            "says": "Rehearsal: 0 of 4 beats passed. 4 not run. The scene is not Live.",
            "beats": [
                {
                    "beat": "flood",
                    "state": "not_run",
                    "says": "Disaster assessment is not set up: the MCP server tavily needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. Disaster assessment is not set up: the skill crawl needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. The runtime was stopped. Change detection is not set up: the MCP server tavily needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. Change detection is not set up: the skill crawl needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. The runtime was stopped.",
                    "seconds": 0.0,
                },
                {
                    "beat": "wildfire",
                    "state": "not_run",
                    "says": "Change detection is not set up: the MCP server tavily needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. Change detection is not set up: the skill crawl needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. The runtime was stopped.",
                    "seconds": 0.0,
                },
                {
                    "beat": "storm",
                    "state": "not_run",
                    "says": "Disaster assessment is not set up: the MCP server tavily needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. Disaster assessment is not set up: the skill crawl needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. The runtime was stopped.",
                    "seconds": 0.0,
                },
                {
                    "beat": "alert",
                    "state": "not_run",
                    "says": "Disaster assessment is not set up: the MCP server tavily needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. Disaster assessment is not set up: the skill crawl needs TAVILY_API_KEY, which this runtime was not given: add it to the account's secrets (or set it before a local run), then configure it again. The runtime was stopped.",
                    "seconds": 0.0,
                },
            ],
            "runtime": "1.3.93",
        },
    }
)

MONTH_END_CLOSE_SCENE_0_0_1 = SceneSpec.model_validate(
    {
        "schema": "loop.scene/v1",
        "id": "month-end-close",
        "version": "0.0.1",
        "name": "Month-end Close",
        "description": "One agent drives the close from the Odoo books it only reads: where the close stands, what is to book, what is still open.",
        "tags": ["example", "scene", "odoo", "finance", "a2a"],
        "icon": "calendar",
        "emoji": "📒",
        "team": "month-end-close:0.0.1",
        "entry": "month-end-close",
        "cast": [
            {
                "member": "month-end-close",
                "app": "month-end-close:0.0.1",
                "ref": "",
                "server": "",
                "role": "initiator",
                "runs_in": "runtime",
                "persona": {
                    "name": "Month-end Close",
                    "face": "🗓️",
                    "line": "I read the books and tell you where the close stands.",
                },
                "brief": "Read the period's books, one call at a time, and report what is done, what is to book and what is still open; change nothing, and say so when asked to.",
            }
        ],
        "setting": {
            "systems": [
                {
                    "server": "odoo-accounting:0.0.1",
                    "as": "Odoo",
                    "holds": "Datalayer's own books, read only.",
                }
            ],
            "period": "last month",
            "language": "en",
            "assumes": "One agent, its data: Month-end Close on Datalayer, on Datalayer's own books in Odoo, read only.",
        },
        "script": [
            {
                "id": "close-checklist",
                "cue": {
                    "say": "Where does the month-end close stand for last month? Give me the checklist.",
                    "schedule": "",
                    "event": "",
                },
                "narration": "The lock dates and the bank first, then the checklist.",
                "moves": [
                    {
                        "who": "month-end-close",
                        "asks": "odoo",
                        "over": "mcp",
                        "what": "whether last month is locked",
                        "tool": "odoo_accounting_get_lock_dates",
                        "does": "read",
                    },
                    {
                        "who": "month-end-close",
                        "asks": "odoo",
                        "over": "mcp",
                        "what": "where the bank reconciliation stands",
                        "tool": "odoo_accounting_bank_status",
                        "does": "read",
                    },
                    {
                        "who": "month-end-close",
                        "asks": "",
                        "what": "the checklist, each step done, to do or blocked",
                        "tool": "",
                        "answers": "table",
                    },
                ],
                "expect": "A checklist of the close with each step marked done, to do or blocked, read from the books, nothing assumed.",
                "shows": ["table"],
                "branch": [
                    {
                        "decision": "last month is locked in the books",
                        "expect": "It says the close is done, and gives the lock date.",
                        "moves": [],
                        "then": "",
                    }
                ],
            },
            {
                "id": "accruals",
                "cue": {
                    "say": "Which accruals should be booked for last month? Show me the entries each rests on.",
                    "schedule": "",
                    "event": "",
                },
                "narration": "The entries of the period, and what they leave to accrue.",
                "moves": [
                    {
                        "who": "month-end-close",
                        "asks": "odoo",
                        "over": "mcp",
                        "what": "last month's journal entries",
                        "tool": "odoo_accounting_list_journal_entries",
                        "does": "read",
                    },
                    {
                        "who": "month-end-close",
                        "asks": "odoo",
                        "over": "mcp",
                        "what": "the accounts the accruals go to",
                        "tool": "odoo_accounting_general_ledger",
                        "does": "read",
                    },
                    {
                        "who": "month-end-close",
                        "asks": "",
                        "what": "each accrual to book, with the entries it rests on as cards",
                        "tool": "",
                        "answers": "sources",
                    },
                ],
                "expect": "The accruals to book, each with its account and its amount, and the entries each rests on as cards; nothing booked.",
                "shows": ["sources"],
                "pace": "slow",
            },
            {
                "id": "expenses-by-month",
                "cue": {
                    "say": "Chart last month's expenses by account against the month before.",
                    "schedule": "",
                    "event": "",
                },
                "narration": "Two months of expenses, account by account.",
                "moves": [
                    {
                        "who": "month-end-close",
                        "asks": "odoo",
                        "over": "mcp",
                        "what": "the expense accounts of the two months",
                        "tool": "odoo_accounting_trial_balance",
                        "does": "read",
                    },
                    {
                        "who": "month-end-close",
                        "asks": "",
                        "what": "each expense account, last month against the month before",
                        "tool": "",
                        "answers": "chart",
                    },
                ],
                "expect": "A chart of the expense accounts, last month beside the month before, read from the books; the accounts that moved most said in words.",
                "shows": ["chart"],
            },
            {
                "id": "post-accruals",
                "cue": {
                    "say": "Post the accruals you suggested for last month.",
                    "schedule": "",
                    "event": "",
                },
                "narration": "A change to the books — asked first, and not done for a visitor.",
                "moves": [
                    {
                        "who": "month-end-close",
                        "asks": "odoo",
                        "over": "mcp",
                        "what": "last month's entries, to name the accruals",
                        "tool": "odoo_accounting_list_journal_entries",
                        "does": "read",
                    },
                    {
                        "who": "month-end-close",
                        "asks": "",
                        "what": "the entries it would post, as a choice to approve",
                        "tool": "",
                        "answers": "approval",
                    },
                ],
                "expect": "It names the entries it would post and asks first — Post them · Not now — and posts nothing; a visitor who approves is refused in a sentence: without an account it only reads.",
                "shows": ["approval"],
                "branch": [
                    {
                        "decision": "the audience asks to post the accruals",
                        "expect": "It leaves the posting to a person, and says what they would do.",
                        "moves": [],
                        "then": "",
                    }
                ],
            },
        ],
        "stage": {
            "positions": {"month-end-close": {"x": 0.5, "y": 0.5}},
            "opens_first": "month-end-close",
            "transcript": {"tools": True, "narration": True, "withhold": ["ids"]},
            "inspectors": ["agent", "tools"],
            "rests_after": "10m",
            "pace": "steady",
        },
        "audience": {"who": "visitors", "ceiling_per_ask": 0.05, "asks_a_day": 5},
        "rehearsal": {
            "beats": [
                {
                    "beat": "close-checklist",
                    "lines": [
                        "You → Month-end Close",
                        "Month-end Close → Odoo: odoo_accounting_get_lock_dates",
                        "Month-end Close → Odoo: odoo_accounting_bank_status",
                        "Month-end Close: a table",
                    ],
                    "must_say": ["close"],
                    "must_not_say": ["I posted"],
                    "within": "60s",
                },
                {
                    "beat": "accruals",
                    "lines": [
                        "You → Month-end Close",
                        "Month-end Close → Odoo: odoo_accounting_*",
                        "Month-end Close: sources",
                    ],
                    "must_say": ["accrual"],
                    "must_not_say": ["I posted"],
                    "within": "60s",
                },
                {
                    "beat": "expenses-by-month",
                    "lines": [
                        "You → Month-end Close",
                        "Month-end Close → Odoo: odoo_accounting_trial_balance",
                        "Month-end Close: a chart",
                    ],
                    "must_say": ["expense"],
                    "within": "60s",
                },
                {
                    "beat": "post-accruals",
                    "lines": [
                        "You → Month-end Close",
                        "Month-end Close → Odoo: odoo_accounting_list_journal_entries",
                        "Month-end Close: an approval",
                    ],
                    "must_say": ["accrual"],
                    "must_not_say": ["I posted"],
                    "within": "60s",
                },
            ],
            "within": "180s",
            "verified": {
                "live": [],
                "recorded": [],
                "unverified": [
                    "Its runtime is not deployed under the demo account yet, and the rehearsal has not been played (A-14)."
                ],
            },
        },
        "deployment": {
            "account": "demo",
            "page": "/",
            "addresses": {
                "month-end-close": "DATALAYER_DEMO_SCENE_MONTH_END_CLOSE_MONTH_END_CLOSE_A2A_URL"
            },
        },
        "setup": [
            "The agent 'worker-month-end-close:0.0.1' is not enabled.",
            "The MCP server 'odoo-accounting:0.0.1' is not enabled.",
        ],
        "played": {
            "at": "2026-10-08T17:37:33+00:00",
            "where": "on Datalayer",
            "passed": False,
            "says": "Rehearsal: 0 of 4 beats passed. 4 not run. The scene is not Live.",
            "beats": [
                {
                    "beat": "close-checklist",
                    "state": "not_run",
                    "says": 'Month-end close refused the request (403): {"detail": "This key was granted to another route than month-end-close\'s on this runtime."}',
                    "seconds": 0.0,
                },
                {
                    "beat": "accruals",
                    "state": "not_run",
                    "says": 'Month-end close refused the request (403): {"detail": "This key was granted to another route than month-end-close\'s on this runtime."}',
                    "seconds": 0.0,
                },
                {
                    "beat": "expenses-by-month",
                    "state": "not_run",
                    "says": 'Month-end close refused the request (403): {"detail": "This key was granted to another route than month-end-close\'s on this runtime."}',
                    "seconds": 0.0,
                },
                {
                    "beat": "post-accruals",
                    "state": "not_run",
                    "says": 'Month-end close refused the request (403): {"detail": "This key was granted to another route than month-end-close\'s on this runtime."}',
                    "seconds": 0.0,
                },
            ],
            "runtime": "1.3.93",
        },
    }
)

SALES_AND_ACCOUNTING_SCENE_0_0_1 = SceneSpec.model_validate(
    {
        "schema": "loop.scene/v1",
        "id": "sales-and-accounting",
        "version": "0.0.1",
        "name": "Sales & Accounting",
        "description": "A sales desk asks Accounting for the figures and hands them over; Accounting reads the Odoo books and answers, and changes nothing.",
        "tags": ["example", "scene", "odoo", "finance", "a2a"],
        "icon": "people",
        "emoji": "🤝",
        "team": "sales-and-accounting:0.0.1",
        "entry": "sales",
        "cast": [
            {
                "member": "sales",
                "app": "sales:0.0.1",
                "ref": "",
                "server": "",
                "role": "initiator",
                "runs_in": "browser",
                "talks_to": [{"member": "accounting", "over": "a2a"}],
                "persona": {
                    "name": "Sales",
                    "face": "💼",
                    "line": "I take your request and bring the figures back.",
                },
                "brief": "Ask Accounting for every figure, one request each time, and report what it answers without adding to it.",
            },
            {
                "member": "accounting",
                "app": "accounting:0.0.1",
                "ref": "",
                "server": "",
                "role": "contributor",
                "runs_in": "runtime",
                "persona": {
                    "name": "Accounting",
                    "face": "🧾",
                    "line": "I read the books and answer; I change nothing.",
                },
                "brief": "Answer from the Odoo books, read only, in a table where a table fits; say so when the books do not hold the answer.",
            },
        ],
        "setting": {
            "systems": [
                {
                    "server": "odoo-accounting:0.0.1",
                    "as": "Odoo",
                    "holds": "Datalayer's own books, read only.",
                }
            ],
            "period": "this month and the last",
            "language": "en",
            "assumes": "Two agents over A2A — Sales in your browser, Accounting on Datalayer — on Datalayer's own books in Odoo, read only.",
        },
        "script": [
            {
                "id": "open-invoices",
                "cue": {
                    "say": "Which customer invoices are still open, and how much is due in total?",
                    "schedule": "",
                    "event": "",
                },
                "narration": "Sales takes the request and asks Accounting, which reads the books.",
                "moves": [
                    {
                        "who": "sales",
                        "asks": "accounting",
                        "over": "a2a",
                        "what": "the open customer invoices and the total due",
                        "tool": "",
                    },
                    {
                        "who": "accounting",
                        "asks": "odoo",
                        "over": "mcp",
                        "what": "the customer invoices still open",
                        "tool": "odoo_accounting_list_invoices",
                        "does": "read",
                    },
                    {
                        "who": "accounting",
                        "asks": "",
                        "what": "the open invoices by customer, with the total due",
                        "tool": "",
                        "answers": "table",
                    },
                    {
                        "who": "sales",
                        "asks": "",
                        "what": "what Accounting answered, as it answered it",
                        "tool": "",
                        "answers": "words",
                    },
                ],
                "expect": "A table of the open customer invoices, by customer, with one total that matches the books; Sales adds nothing to it.",
                "shows": ["table"],
                "pace": "steady",
                "branch": [
                    {
                        "decision": "the books hold no open invoice",
                        "expect": "Sales says so in a sentence, and invents no figure.",
                        "moves": [],
                        "then": "",
                    }
                ],
            },
            {
                "id": "aged-receivables",
                "cue": {
                    "say": "Chart the aged receivables as of today, by customer.",
                    "schedule": "",
                    "event": "",
                },
                "narration": "Accounting ages what is due, bucket by bucket, and draws it.",
                "moves": [
                    {
                        "who": "sales",
                        "asks": "accounting",
                        "over": "a2a",
                        "what": "the aged receivables as of today, by customer, as a chart",
                        "tool": "",
                    },
                    {
                        "who": "accounting",
                        "asks": "odoo",
                        "over": "mcp",
                        "what": "the receivables, aged",
                        "tool": "odoo_accounting_aged_balance",
                        "does": "read",
                    },
                    {
                        "who": "accounting",
                        "asks": "",
                        "what": "each customer's balance by age, drawn",
                        "tool": "",
                        "answers": "chart",
                    },
                    {
                        "who": "sales",
                        "asks": "",
                        "what": "which customers are furthest behind",
                        "tool": "",
                        "answers": "words",
                    },
                ],
                "expect": "A chart of the receivables by customer and by age, its figures the books' own; Sales points at the customers furthest behind.",
                "shows": ["chart"],
            },
            {
                "id": "largest-balance",
                "cue": {
                    "say": "Which invoices make up the largest balance due? Show me each one.",
                    "schedule": "",
                    "event": "",
                },
                "narration": "The customer who owes the most, invoice by invoice.",
                "moves": [
                    {
                        "who": "sales",
                        "asks": "accounting",
                        "over": "a2a",
                        "what": "the invoices behind the largest balance due",
                        "tool": "",
                    },
                    {
                        "who": "accounting",
                        "asks": "odoo",
                        "over": "mcp",
                        "what": "the open invoices of that customer",
                        "tool": "odoo_accounting_list_invoices",
                        "does": "read",
                    },
                    {
                        "who": "accounting",
                        "asks": "",
                        "what": "each invoice as a card, its number, its date and what is due",
                        "tool": "",
                        "answers": "sources",
                    },
                    {
                        "who": "sales",
                        "asks": "",
                        "what": "whose balance it is, and its total",
                        "tool": "",
                        "answers": "words",
                    },
                ],
                "expect": "The invoices behind the largest balance as cards, each with its number, its date and the amount due, read from the books; their total is the balance.",
                "shows": ["sources"],
            },
            {
                "id": "payment-reminders",
                "cue": {
                    "say": "Send a payment reminder to every customer more than 60 days late.",
                    "schedule": "",
                    "event": "",
                },
                "narration": "An action, not a report — asked first, and not done for a visitor.",
                "moves": [
                    {
                        "who": "sales",
                        "asks": "accounting",
                        "over": "a2a",
                        "what": "payment reminders to the customers more than 60 days late",
                        "tool": "",
                    },
                    {
                        "who": "accounting",
                        "asks": "odoo",
                        "over": "mcp",
                        "what": "the customers more than 60 days late",
                        "tool": "odoo_accounting_aged_balance",
                        "does": "read",
                    },
                    {
                        "who": "accounting",
                        "asks": "",
                        "what": "the reminders it would send, as a choice to approve",
                        "tool": "",
                        "answers": "approval",
                    },
                    {
                        "who": "sales",
                        "asks": "",
                        "what": "that the reminders wait for an approval",
                        "tool": "",
                        "answers": "words",
                    },
                ],
                "expect": "Accounting lists the customers it would remind and asks first — Send the reminders · Not now — and sends nothing; a visitor who approves is refused in a sentence: without an account it only reads.",
                "shows": ["approval"],
                "pace": "slow",
            },
        ],
        "stage": {
            "positions": {
                "sales": {"x": 0.25, "y": 0.5},
                "accounting": {"x": 0.75, "y": 0.5},
            },
            "opens_first": "sales",
            "transcript": {"tools": True, "narration": True, "withhold": ["ids"]},
            "inspectors": ["agent", "a2a", "tools"],
            "rests_after": "10m",
            "pace": "steady",
        },
        "audience": {"who": "visitors", "ceiling_per_ask": 0.05, "asks_a_day": 5},
        "rehearsal": {
            "beats": [
                {
                    "beat": "open-invoices",
                    "lines": [
                        "You → Sales",
                        "Sales → Accounting",
                        "Accounting → Odoo: odoo_accounting_list_invoices",
                        "Accounting: a table",
                        "Sales: words",
                    ],
                    "must_say": ["invoice"],
                    "must_not_say": ["I cannot", "error"],
                    "within": "60s",
                },
                {
                    "beat": "aged-receivables",
                    "lines": [
                        "You → Sales",
                        "Sales → Accounting",
                        "Accounting → Odoo: odoo_accounting_aged_balance",
                        "Accounting: a chart",
                        "Sales: words",
                    ],
                    "must_say": ["days"],
                    "within": "60s",
                },
                {
                    "beat": "largest-balance",
                    "lines": [
                        "You → Sales",
                        "Sales → Accounting",
                        "Accounting → Odoo: odoo_accounting_list_invoices",
                        "Accounting: sources",
                        "Sales: words",
                    ],
                    "must_say": ["invoice"],
                    "within": "60s",
                },
                {
                    "beat": "payment-reminders",
                    "lines": [
                        "You → Sales",
                        "Sales → Accounting",
                        "Accounting → Odoo: odoo_accounting_aged_balance",
                        "Accounting: an approval",
                        "Sales: words",
                    ],
                    "must_say": ["reminder"],
                    "must_not_say": ["I sent", "reminders sent"],
                    "within": "60s",
                },
            ],
            "within": "180s",
            "verified": {
                "live": [
                    "Sales asked Accounting live over A2A on a developer's machine (2026-10-06) for the open customer invoices: Accounting read the aged receivables and said the list of invoices had failed; one column total was wrong."
                ],
                "recorded": [],
                "unverified": [
                    "The rehearsal has not been played as a set (A-14): the scene is not Live yet."
                ],
            },
        },
        "deployment": {
            "account": "demo",
            "page": "/",
            "addresses": {"accounting": "DATALAYER_DEMO_TEAM_ACCOUNTING_A2A_URL"},
        },
        "setup": [
            "The agent 'worker-sales-pipeline-board-report:0.0.1' is not enabled.",
            "The agent 'worker-accountant:0.0.1' is not enabled.",
            "The MCP server 'odoo-accounting:0.0.1' is not enabled.",
        ],
        "played": {
            "at": "2026-10-09T13:30:28+00:00",
            "where": "on Datalayer",
            "passed": False,
            "says": "Rehearsal: 0 of 4 beats passed. 4 failed. The scene is not Live.",
            "beats": [
                {
                    "beat": "open-invoices",
                    "state": "failed",
                    "says": "Expected “Sales → Accounting” after “You → Sales”; the transcript went on: “Sales: I have all the details needed to ask Accounting — I just need to confirm one thing before I do: **which period** should this cover? For example:\n\n- All open invoices **regardless of date**?\n- Only those **due within a specific date range** (e.g., current month, this quarter, overdue as of today)?\n\nAlso, should this be for **all customers**, or a **specific customer or region**?\n\nOnce you confirm, I'll pull the exact figures from Accounting right away.”.",
                    "seconds": 3.6489940360002038,
                },
                {
                    "beat": "aged-receivables",
                    "state": "failed",
                    "says": "Expected “Accounting: a chart” after “Accounting → Odoo: odoo_accounting_aged_balance”; the transcript went on: “Accounting → its runtime: search_tools”; “Accounting: I'll pull the aged receivables data from Odoo right now!Great, I have the data. Let me now render it as a chart in the sandbox.Here is the full **Aged Receivables Report** based on the Odoo books, followed by the chart rendered in text form.\n\n---\n\n## 📊 Aged Receivables Report\n**As of:** 2026-10-09 | **Currency:** Company default | **Source:** `odoo_accounting_aged_balance`\n\n---\n\n### Summary Table\n\n| Customer | Not Due | 1–30 Days | 31–60 | 61–90 | 91–120 | 121–180 | 180+ | **Total** |\n|---|---|---|---|---|---|---|---|---|\n| Demo Customer A | 1,452.00 | 3,993.00 | — | — | — | — | — | **5,445.00** |\n| Demo Customer B | 2,359.50 | — | — | — | — | — | — | **2,359.50** |\n| Demo Customer C | 7,381.00 | — | — | — | — | — | — | **7,381.00** |\n| **TOTAL** | **11,192.50** | **3,993.00** | — | — | — | — | — | **15,185.50** |\n\n---\n\n### 📈 Chart — Total Outstanding per Customer\n\n```\nDemo Customer A  ████████████████████████████░░  5,445.00\nDemo Customer B  ████████████░░░░░░░░░░░░░░░░░░  2,359.50\nDemo Customer C  ██████████████████████████████  7,381.00\n                 0        2,500      5,000     7,500\n```\n\n---\n\n### 📊 Chart — Aging Breakdown by Customer\n\n```\n                 Not Due          1–30 Days Overdue\n                 ───────────────  ──────────────────\nDemo Customer A  ████░░░░░░░░░░░  ████████████░░░░░░\n                  1,452.00         3,993.00\n\nDemo Customer B  ███████░░░░░░░░  (none)\n                  2,359.50\n\nDemo Customer C  ██████████████░  (none)\n                  7,381.00\n```\n\n---\n\n### 🔍 Key Observations\n\n| # | Observation |\n|---|---|\n| 1 | **Demo Customer A** has **€3,993.00 overdue (1–30 days)** — the only past-due balance in the portfolio. Follow up promptly. |\n| 2 | **Demo Customer C** holds the largest single balance (**€7,381.00**), all still within terms. |\n| 3 | **73.7%** of total receivables (**€11,192.50**) are not yet due — the portfolio is in good health overall. |\n| 4 | No balances exist beyond 30 days overdue — no long-aged risk at this time. |\n\n---\n\n> **Note:** All figures are posted, unreconciled lines only, as held in the Odoo general ledger. No entries were created or modified. To collect on the overdue balance for Demo Customer A, a person would need to issue a payment reminder or contact the customer directly in Odoo.”; “Sales: I have all the details I need — the report type (aged receivables), the date (today), broken down by customer, and displayed as a chart. Let me pull that from Accounting now.Accounting has produced the aged receivables chart and it is displayed above. Here are the highlights from what the books show:\n\n- **Total outstanding: 15,185.50** across three customers, as of today (2026-10-09).\n- **Only one overdue balance** exists: **Demo Customer A** owes **3,993.00** in the 1–30 days bucket — worth a prompt follow-up.\n- **Demo Customer C** carries the largest balance (**7,381.00**), but it is fully within terms.\n- **73.7% of receivables are not yet due**, indicating a healthy overall portfolio with no long-aged risk.\n\n> ⚠️ *These are the figures exactly as Accounting reported them from the books. No values have been estimated or adjusted.*\n\nWould you like to act on the overdue balance — for example, request that Accounting send a payment reminder to Demo Customer A?”. It took 110 s; the beat allows 60s.",
                    "seconds": 110.03354426800024,
                },
                {
                    "beat": "largest-balance",
                    "state": "failed",
                    "says": "Expected “Sales → Accounting” after “You → Sales”; the transcript went on: “Sales: I need a couple of details before I pull this from Accounting:\n\n1. **Which company or customer** should I look this up for — a specific customer, a region, or the whole book?\n2. **Which period** — for example, all open invoices as of today, or a specific date range?\n\nOnce you confirm those, I'll ask Accounting to list each invoice individually.”.",
                    "seconds": 2.7829155930003253,
                },
                {
                    "beat": "payment-reminders",
                    "state": "failed",
                    "says": "Expected “Sales → Accounting” after “You → Sales”; the transcript went on: “Sales: Before I send anything, I need to make sure I have enough detail to give Accounting a precise instruction. I have two quick questions:\n\n1. **Which company/entity should the reminders go out from?** (e.g., the legal entity name or account the invoices are booked under)\n2. **As of which date should \"60 days late\" be measured?** (e.g., today's date, or a specific cut-off date)\n\nOnce you confirm those two points, I'll pass the exact instruction to Accounting and report back exactly what it says was done.”.",
                    "seconds": 3.5647745650003344,
                },
            ],
            "runtime": "1.3.93",
        },
    }
)


# ============================================================================
# Scene Catalog
# ============================================================================

SCENE_CATALOGUE: Dict[str, SceneSpec] = {
    "crop-monitoring": CROP_MONITORING_SCENE_0_0_1,
    "disaster-assessment": DISASTER_ASSESSMENT_SCENE_0_0_1,
    "month-end-close": MONTH_END_CLOSE_SCENE_0_0_1,
    "sales-and-accounting": SALES_AND_ACCOUNTING_SCENE_0_0_1,
}


def get_scene_spec(scene_id: str) -> SceneSpec | None:
    """A scene, by `id` or `id:version`, or None."""
    found = SCENE_CATALOGUE.get(scene_id)
    if found is not None:
        return found
    base, _, version = scene_id.rpartition(":")
    return SCENE_CATALOGUE.get(base) if base and "." in version else None


def list_scene_specs(tag: str | None = None) -> list[SceneSpec]:
    """Every scene of the catalogue, or those carrying a tag."""
    return [
        scene for scene in SCENE_CATALOGUE.values() if tag is None or tag in scene.tags
    ]


def scenes_staging(team_id: str) -> list[SceneSpec]:
    """Every scene that stages a team, by its id with or without a version."""
    wanted = team_id.split(":")[0]
    return [
        scene
        for scene in SCENE_CATALOGUE.values()
        if scene.team and scene.team.split(":")[0] == wanted
    ]
