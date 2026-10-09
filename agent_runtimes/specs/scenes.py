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
                "brief": "Take the event and ask one specialist at a time, never both at once, waiting for each answer before you ask the next: Disaster Assessment for the area affected and the damage and for what the archive holds around the event, day by day, and then, only if the request asks what changed on the ground between two dates, Change detection. Report what they answer without adding to it. Do not question the audience first: a cue is the whole of what it says, and nobody is standing there to answer you back. A cue that says no date is yours to fill with the most recent one the imagery has, and a cue that says no place with the area the event names; ask the specialists with what you assumed, and say in your answer what you assumed.",
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
                    "within": "240s",
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
            "within": "10m",
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
            "at": "2026-10-09T20:11:31+00:00",
            "where": "on Datalayer",
            "passed": False,
            "says": "Rehearsal: 3 of 4 beats passed. 1 failed. The scene is not Live.",
            "beats": [
                {
                    "beat": "flood",
                    "state": "failed",
                    "says": "It took 256 s; the beat allows 240s.",
                    "seconds": 256.3913712079993,
                },
                {
                    "beat": "wildfire",
                    "state": "passed",
                    "says": "",
                    "seconds": 121.31498286299757,
                },
                {
                    "beat": "storm",
                    "state": "passed",
                    "says": "",
                    "seconds": 57.65464447400154,
                },
                {
                    "beat": "alert",
                    "state": "passed",
                    "says": "",
                    "seconds": 97.90184767000028,
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
                    "within": "120s",
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
            "at": "2026-10-09T15:33:25+00:00",
            "where": "on Datalayer",
            "passed": False,
            "says": "Rehearsal: 2 of 4 beats passed. 2 failed. The scene is not Live.",
            "beats": [
                {
                    "beat": "close-checklist",
                    "state": "passed",
                    "says": "",
                    "seconds": 100.39224812800012,
                },
                {
                    "beat": "accruals",
                    "state": "passed",
                    "says": "",
                    "seconds": 134.23890428100003,
                },
                {
                    "beat": "expenses-by-month",
                    "state": "failed",
                    "says": "Expected “Month-end Close: a chart” after “Month-end Close → Odoo: odoo_accounting_trial_balance”; the transcript went on: “Month-end Close → its runtime: show_components”; “Month-end Close: I'll pull the trial balance for both months. Today I'll treat **last month as April 2025** and **the month before as March 2025**.Both trial balance calls returned no data — the books hold no posted entries for either April 2025 or March 2025 in the default company, so there are no expense figures to chart.The trial balance returned **no posted entries** for either April 2025 (last month) or March 2025 (the month before), so there is nothing to chart. A few possible reasons:\n\n- The company may not have posted any journal entries in those months yet.\n- The default company in this Odoo instance may be a demo or test environment with no activity in that period.\n- Entries may still be in **draft** state (I only read posted entries by default).\n\n**What you can do:**\n1. **Post any draft entries** for those months in Odoo, then ask again.\n2. **Specify a different period** — tell me which months to look at and I'll re-run the comparison.\n3. If entries exist as drafts, let me know and I can re-run with `include_draft: true`.”.",
                    "seconds": 21.827084645000014,
                },
                {
                    "beat": "post-accruals",
                    "state": "failed",
                    "says": 'Expected “Month-end Close → Odoo: odoo_accounting_list_journal_entries” after “You → Month-end Close”; the transcript went on: “Month-end Close → its runtime: show_components”; “Month-end Close: I cannot post — or offer to post — journal entries. Writing to Odoo is outside what I do.\n\nHere is what that means in practice, and what a person would need to do instead:**I never write to Odoo.** My rules are explicit: I do not create, post, reconcile, book, match, lock, or delete anything — and I do not offer to do so on your behalf.\n\nWhat I *can* do is give a person everything they need to post the accruals themselves:\n\n1. **Show the suggested accruals** — account, amount, description, and period — drawn from the trial balance, open balances, and general ledger of last month.\n2. **Explain the journal entry** a person would need to create in Odoo (Accounting → Journal Entries → New) for each one.\n3. **Flag any gaps** — missing invoices, unreconciled items, or draft entries — that should be resolved before the entries are posted.\n\nPress **"Yes — show me the suggested accruals"** above and I will run the full month-end read and lay out exactly what a person would enter.”.',
                    "seconds": 12.189939259999846,
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
