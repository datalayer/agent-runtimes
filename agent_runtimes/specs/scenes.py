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
                    "must_not_say": [
                        "I downloaded",
                        "I have downloaded",
                        "downloaded them",
                    ],
                    "within": "120s",
                },
                {
                    "beat": "fields-to-watch",
                    "lines": [
                        "You → Crop Monitoring",
                        "Crop Monitoring → Earthdata: search_earth_datagranules",
                        "Crop Monitoring: a table",
                    ],
                    "must_say": ["drop"],
                    "within": "120s",
                },
                {
                    "beat": "imagery-available",
                    "lines": [
                        "You → Crop Monitoring",
                        "Crop Monitoring → Earthdata: search_earth_*",
                        "Crop Monitoring: sources",
                    ],
                    "must_say": ["granule"],
                    "must_not_say": [
                        "I downloaded",
                        "I have downloaded",
                        "downloaded them",
                    ],
                    "within": "120s",
                },
                {
                    "beat": "save-granules",
                    "lines": [
                        "You → Crop Monitoring",
                        "Crop Monitoring → Earthdata: search_earth_datagranules",
                        "Crop Monitoring: an approval",
                    ],
                    "must_say": ["granule"],
                    "must_not_say": [
                        "I downloaded",
                        "I have downloaded",
                        "downloaded them",
                        "saved them",
                    ],
                    "within": "120s",
                },
            ],
            "within": "10m",
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
            "at": "2026-10-09T17:40:33+00:00",
            "where": "on Datalayer",
            "passed": True,
            "says": "Rehearsal: 4 of 4 beats passed. The scene is Live.",
            "beats": [
                {
                    "beat": "vigour-this-season",
                    "state": "passed",
                    "says": "",
                    "seconds": 55.53831131900006,
                },
                {
                    "beat": "fields-to-watch",
                    "state": "passed",
                    "says": "",
                    "seconds": 57.56524624400117,
                },
                {
                    "beat": "imagery-available",
                    "state": "passed",
                    "says": "",
                    "seconds": 58.75493016499968,
                },
                {
                    "beat": "save-granules",
                    "state": "passed",
                    "says": "",
                    "seconds": 49.41034528199998,
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
                "brief": "Take the event and ask one specialist at a time, never both at once, waiting for each answer before you ask the next: Disaster Assessment for the area affected and the damage and for what the archive holds around the event, day by day, and then, only if the request asks what changed on the ground between two dates, Change detection. Report what they answer without adding to it. Do not question the audience first: a cue is the whole of what it says, and nobody is standing there to answer you back. A cue that says no date is yours to fill with the most recent one the imagery has, and a cue that says no place with the area the event names; ask the specialists with what you assumed, and say in your answer what you assumed. A cue that asks to send something is Disaster Assessment's: tell it what is to be sent and to whom, so that it shows the sending as a choice to approve, and never ask the audience to confirm it yourself.",
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
                "brief": "From the imagery before and after the event, estimate the area affected and the extent of the damage; say what the imagery does not show. Asked to send an assessment, send nothing: show its sending as a choice to approve — *Send it* · *Not now*.",
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
                "narration": "Event response asks one specialist at a time, waiting for each answer; each searches the imagery around the date.",
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
                    "must_not_say": [
                        "I downloaded",
                        "I have downloaded",
                        "downloaded them",
                    ],
                    "within": "360s",
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
                    "within": "240s",
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
                    "within": "240s",
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
                    "within": "240s",
                },
            ],
            "within": "20m",
            "verified": {
                "live": [],
                "recorded": [],
                "unverified": [
                    "Rehearsed on Datalayer on 2026-10-09: three beats of four pass — wildfire 121 s, storm 58 s, alert 98 s — and flood took 256 s against the 240 s it allows, a bound measured when Event response still asked both specialists at once (A-14)."
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
            "at": "2026-10-10T02:57:36+00:00",
            "where": "on Datalayer",
            "passed": False,
            "says": "Rehearsal: 3 of 4 beats passed. 1 failed. The scene is not Live.",
            "beats": [
                {
                    "beat": "flood",
                    "state": "passed",
                    "says": "",
                    "seconds": 216.90267557599873,
                },
                {
                    "beat": "wildfire",
                    "state": "passed",
                    "says": "",
                    "seconds": 110.26249580999865,
                },
                {
                    "beat": "storm",
                    "state": "passed",
                    "says": "",
                    "seconds": 55.37315007500001,
                },
                {
                    "beat": "alert",
                    "state": "failed",
                    "says": 'Expected “Disaster Assessment: an approval” after “Disaster Assessment → Earthdata: search_earth_datagranules”; the transcript went on: “Disaster Assessment → its runtime: show_components”; “Disaster Assessment: I\'ll work through this step by step: find the right datasets, locate pre- and post-event granules for the Valencia flood (late October 2024), then compare what they show.\n\n**Step 1 — Find relevant datasets for flood/surface change over Valencia, Spain**The generic flood search didn\'t return Spain-relevant results. Let me try the CYGNSS watermask (which covers Valencia\'s latitude) and also search for MODIS/Landsat surface reflectance over Valencia.Good. I have MODIS Terra/Aqua surface reflectance (MOD09GA / MYD09GA at 500m) and the CYGNSS watermask. Now let me search for granules — pre-event (before 29 Oct 2024) and post-event (after 29 Oct 2024) — over Valencia.\n\n**Step 2 — Pre-event granules (MOD09GA, ~Oct 20–28 2024)**Good — pre-event granules confirmed on tile h18v05 (covers Valencia, ~29.9°N–40°N, 0°–13°E) for 20–21 Oct 2024. Now post-event granules.\n\n**Step 3 — Post-event granules (MOD09GA, Nov 1–10 2024)**Excellent. Now let me also check the CYGNSS daily watermask for the same period, which directly classifies surface water.\n\n**Step 4 — CYGNSS watermask granules post-event**I now have all the evidence I need. Let me compile the full assessment and show the components.---\n\n## Valencia Flood Disaster Assessment\n**Event:** DANA (Depresión Aislada en Niveles Altos) flash flood\n**Location:** Valencia region, eastern Spain (~39.5°N, 0.4°W) — municipalities of Paiporta, Sedaví, Benetússer, Alfafar, Catarroja, and the Turia/Júcar river plain\n**Flood onset:** 29 October 2024 (afternoon/evening)\n**Assessment basis:** NASA Earthdata granule inventory; pixel-level analysis requires download (script below)\n\n---\n\n### What Earthdata holds\n\n**Primary instrument — MODIS/Terra MOD09GA V061 (500 m surface reflectance)**\nTwo SINUSOIDAL tiles bracket Valencia:\n- **h18v05** (0°–13°E, 29.9°–40°N) — contains the city and the coastal plain east of it\n- **h17v05** (13°W–0°, 29.9°–40°N) — contains the western hinterland\n\n| Role | Granule | Date |\n|---|---|---|\n| **Pre-event** | MOD09GA.A2024294.h18v05 + h17v05 | **20 Oct 2024** |\n| **Post-event** | MOD09GA.A2024304.h18v05 + h17v05 | **30 Oct 2024** |\n\nThe 30 Oct 2024 granule is the **earliest post-event acquisition** in the archive — one day after the flood peak. This is the most recent imagery that captures the acute inundation phase.\n\n**Secondary instrument — CYGNSS Daily Watermask V3.2 (1 km)**\nGranules exist for 29, 30, and 31 Oct 2024 — but **Valencia (39.5°N) lies outside the CYGNSS orbital coverage ceiling of 37.4°N**. These granules cannot observe the affected area and must be excluded.\n\n---\n\n### What the comparison would show (analysis script)\n\nBecause I do not download data, the pixel-level NDWI/NDVI change map must be run by a person. Here is the exact script:\n\n```python\nimport earthaccess, xarray as xr, numpy as np, matplotlib.pyplot as plt\n\nearthaccess.login()\n\n# --- Granule IDs ---\npre_id  = "MOD09GA.A2024294.h18v05.061.2024298001757"\npost_id = "MOD09GA.A2024304.h18v05.061.2024306200636"\n\n# Download both tiles (h18v05 covers Valencia city + coastal plain)\nresults_pre  = earthaccess.search_data(short_name="MOD09GA", granule_ur=pre_id)\nresults_post = earthaccess.search_data(short_name="MOD09GA", granule_ur=post_id)\nfiles_pre  = earthaccess.download(results_pre,  "./pre")\nfiles_post = earthaccess.download(results_post, "./post")\n\n# Open with xarray (pyhdf or rioxarray for HDF-EOS2)\nimport rioxarray as rxr\npre  = rxr.open_rasterio(files_pre[0],  masked=True)\npost = rxr.open_rasterio(files_post[0], masked=True)\n\n# NDWI = (Green - NIR) / (Green + NIR)  [Band 4 = Green, Band 2 = NIR in MOD09GA]\n# Bands are 1-indexed in the SDS; adjust for 0-indexed array slicing\ngreen_pre  = pre.sel(band=4)  / 10000.0\nnir_pre    = pre.sel(band=2)  / 10000.0\ngreen_post = post.sel(band=4) / 10000.0\nnir_post   = post.sel(band=2) / 10000.0\n\nndwi_pre  = (green_pre  - nir_pre)  / (green_pre  + nir_pre)\nndwi_post = (green_post - nir_post) / (green_post + nir_post)\n\n# Flood mask: pixels where NDWI flipped from <0.0 to >0.3\nflood_mask = (ndwi_pre < 0.0) & (ndwi_post > 0.3)\n\n# Clip to Valencia bounding box\nbbox = dict(x=slice(-0.8, 0.2), y=slice(40.0, 38.8))\nflood_clip = flood_mask.rio.clip_box(**bbox)\n\n# Area estimate: each 500m pixel = 0.25 km²\nn_flooded = int(flood_clip.sum())\narea_km2  = n_flooded * 0.25\nprint(f"Estimated inundated area: {area_km2:.1f} km²  ({n_flooded} pixels @ 500 m)")\n\n# Plot\nfig, axes = plt.subplots(1, 3, figsize=(15, 5))\nndwi_pre.rio.clip_box(**bbox).plot(ax=axes[0], vmin=-0.5, vmax=0.5, cmap="RdBu", title="NDWI Pre (20 Oct)")\nndwi_post.rio.clip_box(**bbox).plot(ax=axes[1], vmin=-0.5, vmax=0.5, cmap="RdBu", title="NDWI Post (30 Oct)")\nflood_clip.plot(ax=axes[2], cmap="Blues", title=f"Flood extent (~{area_km2:.0f} km²)")\nplt.tight_layout(); plt.savefig("valencia_flood_extent.png", dpi=150)\n```\n\n---\n\n### Damage extent — what the record supports\n\nBased on the granule geometry and the known event characteristics:\n\n| Dimension | Value | Basis |\n|---|---|---|\n| **Affected bounding box** | 38.8°–39.7°N, 0.8°W–0.2°E | Municipalities confirmed flooded (Paiporta, Sedaví, Catarroja, Alfafar, Benetússer, Massanassa) |\n| **Estimated inundated area** | **~200–400 km²** | Consistent with Copernicus EMS activation maps and MODIS 500 m pixel count estimates from comparable DANA events; **not pixel-counted here** |\n| **Primary land cover affected** | Huerta (irrigated farmland), urban periphery, L\'Albufera wetland buffer | Tile h18v05 land cover |\n| **Pre-event baseline date** | 20 Oct 2024 | MOD09GA.A2024294.h18v05 |\n| **Most recent post-event date** | **30 Oct 2024** | MOD09GA.A2024304.h18v05 — earliest available post-flood granule |\n\n---\n\n### Confidence and caveats\n\n| Caveat | Impact |\n|---|---|\n| **Cloud cover** | October DANA events bring heavy cloud. The 30 Oct granule may be partially or fully cloud-masked over the flood zone. The QA band must be checked before any pixel count is trusted. |\n| **MODIS 500 m resolution** | Sub-pixel inundation in narrow streets and drainage channels is invisible. Urban flood extent is likely **underestimated**. |\n| **CYGNSS excluded** | The only dedicated daily watermask product in the archive (CYGNSS) does not cover Valencia\'s latitude (39.5°N > 37.4°N ceiling). No direct water-classification product is available. |\n| **No pixel analysis performed** | The area figure above (200–400 km²) is an order-of-magnitude estimate from event reports, not a pixel count from these granules. The script above produces the actual figure. |\n| **Single overpass** | MODIS Terra passes once per day; if the 30 Oct overpass was cloudy, the next clear-sky granule may be several days later, by which time some water will have receded. |\n| **Overall confidence** | **Low–Medium** for the area figure until the script is run and cloud cover is assessed. **High** for the granule inventory: the correct tiles and dates are confirmed in the archive. |\n\nThe table beside this answer lists all six granules found, with their roles, tiles, dates, resolutions, and access paths.”; “Event response: I will ask Disaster Assessment about the Valencia flood before anything is sent. No date was given, so I am assuming the most recent date the imagery holds.Here is what Disaster Assessment returned. I have not sent anything, and I will not do so unless you explicitly approve it after reading the assessment below.\n\n---\n\n## Valencia Flood — Disaster Assessment\n\n**Event:** DANA flash flood, Valencia region, eastern Spain\n**Flood onset:** 29 October 2024\n**Most recent post-event imagery assumed:** 30 October 2024 (MOD09GA, the earliest post-flood granule in the archive — one day after the flood peak)\n\n---\n\n### Archive holdings\n\nThe assessor found the following confirmed granules in the NASA Earthdata archive:\n\n| Role | Dataset | Tile | Date |\n|---|---|---|---|\n| Pre-event | MOD09GA (MODIS Terra, 500 m) | h18v05 + h17v05 | 20 October 2024 |\n| Post-event | MOD09GA (MODIS Terra, 500 m) | h18v05 + h17v05 | 30 October 2024 |\n\nA CYGNSS daily watermask (1 km) exists for 29–31 October 2024 but **cannot be used**: Valencia at 39.5°N lies outside CYGNSS\'s orbital coverage ceiling of 37.4°N. The assessor excluded it.\n\n---\n\n### Area affected\n\n| Dimension | Value |\n|---|---|\n| Affected bounding box | 38.8°–39.7°N, 0.8°W–0.2°E |\n| Municipalities confirmed flooded | Paiporta, Sedaví, Catarroja, Alfafar, Benetússer, Massanassa |\n| Primary land cover affected | Irrigated farmland (huerta), urban periphery, L\'Albufera wetland buffer |\n\n---\n\n### Damage extent\n\nThe assessor states the estimated inundated area is **approximately 200–400 km²**. They flag explicitly that **this figure has not been pixel-counted from these granules** — it is an order-of-magnitude estimate consistent with Copernicus EMS activation maps and comparable DANA events. An analysis script is ready to produce the actual figure from the confirmed granules.\n\n---\n\n### Confidence and caveats (as reported by Disaster Assessment)\n\n| Caveat | Impact |\n|---|---|\n| **Cloud cover** | October DANA events bring heavy cloud; the 30 Oct granule may be partially or fully cloud-masked over the flood zone. The QA band must be checked before any pixel count is trusted. |\n| **MODIS 500 m resolution** | Sub-pixel inundation in narrow streets and drainage channels is invisible; urban flood extent is likely underestimated. |\n| **CYGNSS excluded** | No direct water-classification product covers Valencia\'s latitude. |\n| **No pixel analysis performed** | The 200–400 km² figure is not a pixel count from these granules. |\n| **Single overpass** | If the 30 Oct pass was cloudy, the next clear-sky granule may be several days later, by which time water will have receded. |\n| **Overall confidence** | **Low–Medium** for the area figure. **High** for the granule inventory. |\n\n---\n\n### Action requested: send to emergency services\n\n⚠️ **I have not sent anything.** Before I could proceed, I need your explicit approval, and I must flag the following:\n\n1. **The area figure is unconfirmed.** Disaster Assessment states it is an estimate, not a pixel-counted result, and assigns it only Low–Medium confidence. Sending an unverified figure to emergency services carries operational risk.\n2. **Cloud cover is unverified.** The post-event granule may be cloud-masked over the flood zone; the true extent could differ materially.\n3. **No send action has been confirmed by the assessor.** I can only report that the assessment exists; I cannot confirm it has been sent.\n\nPlease confirm explicitly that you wish this assessment — including its stated uncertainties and caveats — to be sent to emergency services, and I will proceed.”.',
                    "seconds": 104.22239985500346,
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
                "brief": "Read the period's books, one call at a time, and report what is done, what is to book and what is still open; change nothing, and say so when asked to. Show it the way the cue asked to see it, with `show_components` and never drawn in words: the checklist and figures that compare as a `table`; a month against the month before as a `chart`; the entries an accrual rests on as `sources`, a card each; and anything that would post to the books as a `choice` to approve. Asked to post, you do not refuse and you do not post: read the entries you would post and show them as that `choice` — *Post the accruals* · *Not now* — which is what your rule *Change the books: ask first* means. A person decides, and nothing reaches Odoo until they do.",
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
                        "Month-end Close → Odoo: odoo_accounting_*",
                        "Month-end Close → Odoo: odoo_accounting_*",
                        "Month-end Close: a table",
                    ],
                    "must_say": ["close"],
                    "must_not_say": ["I posted"],
                    "within": "240s",
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
                    "within": "180s",
                },
                {
                    "beat": "expenses-by-month",
                    "lines": [
                        "You → Month-end Close",
                        "Month-end Close → Odoo: odoo_accounting_trial_balance",
                        "Month-end Close: a chart",
                    ],
                    "must_say": ["expense"],
                    "within": "120s",
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
                    "within": "180s",
                },
            ],
            "within": "15m",
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
            "at": "2026-10-10T02:37:17+00:00",
            "where": "on Datalayer",
            "passed": True,
            "says": "Rehearsal: 4 of 4 beats passed. The scene is Live.",
            "beats": [
                {
                    "beat": "close-checklist",
                    "state": "passed",
                    "says": "",
                    "seconds": 97.45903585400083,
                },
                {
                    "beat": "accruals",
                    "state": "passed",
                    "says": "",
                    "seconds": 126.1125528449993,
                },
                {
                    "beat": "expenses-by-month",
                    "state": "passed",
                    "says": "",
                    "seconds": 68.2978395099999,
                },
                {
                    "beat": "post-accruals",
                    "state": "passed",
                    "says": "",
                    "seconds": 94.95879093399708,
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
                "brief": "Ask Accounting for every figure, one request each time, and report what it answers without adding to it. Do not question the audience first: a cue is the whole of what it says, and nobody is standing there to answer you back. A cue that names the report it wants — the invoices still open, the aged receivables as of today, the invoices behind the largest balance, a reminder to whoever is overdue — goes to Accounting as it stands, with how the audience asked to see it. A cue that says no period and no customer is Accounting's to fill: it takes the current fiscal year and the default company, and tells you which it took, so you ask it rather than the audience.",
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
                "brief": "Answer from the Odoo books, read only, and say so when the books do not hold the answer. Show it the way the cue asked to see it, with `show_components` and never drawn in words: figures that compare as a `table`; a balance by age or by customer as a `chart`; and, when the cue says to see each one, the records themselves as `sources` — a card per invoice, its number the title and its date and what is due the passage — rather than another table. Anything that would change the books is a `choice` to approve.",
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
                        "what": "what each customer owes, invoice by invoice: whose balance is the largest, and the invoices it is made of",
                        "tool": "odoo_accounting_list_open_balances",
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
                    "say": "Send a payment reminder to every customer whose invoice is overdue.",
                    "schedule": "",
                    "event": "",
                },
                "narration": "An action, not a report — asked first, and not done for a visitor.",
                "moves": [
                    {
                        "who": "sales",
                        "asks": "accounting",
                        "over": "a2a",
                        "what": "payment reminders to the customers whose invoices are overdue",
                        "tool": "",
                    },
                    {
                        "who": "accounting",
                        "asks": "odoo",
                        "over": "mcp",
                        "what": "what each customer owes by age: who is overdue, and by how much",
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
                    "within": "120s",
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
                    "within": "120s",
                },
                {
                    "beat": "largest-balance",
                    "lines": [
                        "You → Sales",
                        "Sales → Accounting",
                        "Accounting → Odoo: odoo_accounting_*",
                        "Accounting: sources",
                        "Sales: words",
                    ],
                    "must_say": ["invoice"],
                    "within": "120s",
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
                    "within": "120s",
                },
            ],
            "within": "10m",
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
            "at": "2026-10-09T15:18:40+00:00",
            "where": "on Datalayer",
            "passed": True,
            "says": "Rehearsal: 4 of 4 beats passed. The scene is Live.",
            "beats": [
                {
                    "beat": "open-invoices",
                    "state": "passed",
                    "says": "",
                    "seconds": 31.686379444999602,
                },
                {
                    "beat": "aged-receivables",
                    "state": "passed",
                    "says": "",
                    "seconds": 27.275244929999644,
                },
                {
                    "beat": "largest-balance",
                    "state": "passed",
                    "says": "",
                    "seconds": 41.62880667699983,
                },
                {
                    "beat": "payment-reminders",
                    "state": "passed",
                    "says": "",
                    "seconds": 25.168268976000036,
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
