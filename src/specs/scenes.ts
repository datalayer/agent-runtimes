/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Scene Catalog.
 *
 * A team, staged: the setting, the script, the stage directions, the
 * audience, the rehearsal and where it plays. The cast is resolved.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { SceneSpec } from '../types/scenes';

export const CROP_MONITORING_SCENE_0_0_1: SceneSpec = {
  schema: 'loop.scene/v1',
  id: 'crop-monitoring',
  version: '0.0.1',
  name: 'Crop Monitoring',
  description:
    'One agent follows crop vigour and growth over a season from the satellite imagery NASA Earthdata holds, and flags the fields that need attention.',
  tags: ['example', 'scene', 'earthdata', 'agriculture', 'a2a'],
  icon: 'globe',
  emoji: '🛰️',
  team: 'crop-monitoring:0.0.1',
  entry: 'crop-monitoring',
  cast: [
    {
      member: 'crop-monitoring',
      app: 'crop-monitoring:0.0.1',
      ref: '',
      server: '',
      role: 'initiator',
      runsIn: 'runtime',
      persona: {
        name: 'Crop Monitoring',
        face: '🌾',
        line: 'I search the imagery and tell you how the fields are doing.',
      },
      brief:
        'Take the field and the period, search the datasets and the granules that cover them, and report the vigour, the growth and the fields to watch; leave any download to the person.',
    },
  ],
  setting: {
    systems: [
      {
        server: 'earthdata:0.0.1',
        as: 'Earthdata',
        holds:
          "NASA's catalogue of satellite imagery, searched, not downloaded.",
      },
    ],
    period: 'the last three months',
    language: 'en',
    assumes:
      'One agent, its data: Crop Monitoring on Datalayer, searching the satellite imagery NASA Earthdata holds.',
  },
  script: [
    {
      id: 'vigour-this-season',
      cue: {
        say: 'How has crop vigour evolved over the last three months around 45.5N, 10.2E?',
        schedule: '',
        event: '',
      },
      narration:
        'The datasets that cover the place, then the granules of the season.',
      moves: [
        {
          who: 'crop-monitoring',
          asks: 'earthdata',
          over: 'mcp',
          what: 'the vegetation datasets covering the place',
          tool: 'search_earth_datasets',
          does: 'read',
        },
        {
          who: 'crop-monitoring',
          asks: 'earthdata',
          over: 'mcp',
          what: 'the granules of the last three months',
          tool: 'search_earth_datagranules',
          does: 'read',
        },
        {
          who: 'crop-monitoring',
          asks: '',
          what: 'the vigour month by month',
          tool: '',
          answers: 'chart',
        },
        {
          who: 'crop-monitoring',
          asks: '',
          what: 'how the season went, in a paragraph',
          tool: '',
          answers: 'words',
        },
      ],
      expect:
        'A chart of the vigour month by month from the granules found, and a paragraph saying how the season went; nothing downloaded.',
      shows: ['chart', 'words'],
      branch: [
        {
          decision: 'no granule covers the period',
          expect: 'It says so, and names the nearest dates that are covered.',
          moves: [],
          then: '',
        },
      ],
    },
    {
      id: 'fields-to-watch',
      cue: {
        say: 'Which fields around 41.9N, 12.5E show a drop in vegetation this month compared with last?',
        schedule: '',
        event: '',
      },
      narration: 'This month against the last, field by field.',
      moves: [
        {
          who: 'crop-monitoring',
          asks: 'earthdata',
          over: 'mcp',
          what: 'the granules of this month and the last',
          tool: 'search_earth_datagranules',
          does: 'read',
        },
        {
          who: 'crop-monitoring',
          asks: '',
          what: 'the fields whose vegetation dropped, with the drop',
          tool: '',
          answers: 'table',
        },
      ],
      expect:
        'A table of the fields whose vegetation dropped from last month to this, each with the size of the drop, from the imagery found.',
      shows: ['table'],
      pace: 'slow',
    },
    {
      id: 'imagery-available',
      cue: {
        say: 'Which datasets and granules cover the Po valley for June 2026?',
        schedule: '',
        event: '',
      },
      narration: 'What there is to look at, before anything is looked at.',
      moves: [
        {
          who: 'crop-monitoring',
          asks: 'earthdata',
          over: 'mcp',
          what: 'the datasets covering the Po valley',
          tool: 'search_earth_datasets',
          does: 'read',
        },
        {
          who: 'crop-monitoring',
          asks: 'earthdata',
          over: 'mcp',
          what: 'the granules of June 2026',
          tool: 'search_earth_datagranules',
          does: 'read',
        },
        {
          who: 'crop-monitoring',
          asks: '',
          what: 'the datasets and the granules as cards that open their pages',
          tool: '',
          answers: 'sources',
        },
      ],
      expect:
        'The datasets and the granules that cover the Po valley in June 2026 as cards, each with its date and a link that opens it at NASA Earthdata; a download is left to the person.',
      shows: ['sources'],
    },
    {
      id: 'save-granules',
      cue: {
        say: 'Save the June 2026 granules of the Po valley to my Space.',
        schedule: '',
        event: '',
      },
      narration:
        'A download and a save — asked first, and not done for a visitor.',
      moves: [
        {
          who: 'crop-monitoring',
          asks: 'earthdata',
          over: 'mcp',
          what: 'the granules of June 2026',
          tool: 'search_earth_datagranules',
          does: 'read',
        },
        {
          who: 'crop-monitoring',
          asks: '',
          what: 'the granules it would save, as a choice to approve',
          tool: '',
          answers: 'approval',
        },
      ],
      expect:
        'It names the granules it would save and asks first — Save them · Not now — and saves nothing; a visitor who approves is refused in a sentence: without an account it only reads.',
      shows: ['approval'],
    },
  ],
  stage: {
    positions: {
      'crop-monitoring': {
        x: 0.5,
        y: 0.5,
      },
    },
    opensFirst: 'crop-monitoring',
    transcript: {
      tools: true,
      narration: true,
    },
    inspectors: ['agent', 'tools'],
    restsAfter: '10m',
    pace: 'steady',
  },
  audience: {
    who: 'visitors',
    ceilingPerAsk: 0.05,
    asksADay: 5,
  },
  rehearsal: {
    beats: [
      {
        beat: 'vigour-this-season',
        lines: [
          'You → Crop Monitoring',
          'Crop Monitoring → Earthdata: search_earth_datasets',
          'Crop Monitoring → Earthdata: search_earth_datagranules',
          'Crop Monitoring: a chart',
        ],
        mustSay: ['vigour'],
        mustNotSay: ['I downloaded', 'I have downloaded', 'downloaded them'],
        within: '120s',
      },
      {
        beat: 'fields-to-watch',
        lines: [
          'You → Crop Monitoring',
          'Crop Monitoring → Earthdata: search_earth_datagranules',
          'Crop Monitoring: a table',
        ],
        mustSay: ['drop'],
        within: '120s',
      },
      {
        beat: 'imagery-available',
        lines: [
          'You → Crop Monitoring',
          'Crop Monitoring → Earthdata: search_earth_*',
          'Crop Monitoring: sources',
        ],
        mustSay: ['granule'],
        mustNotSay: ['I downloaded', 'I have downloaded', 'downloaded them'],
        within: '120s',
      },
      {
        beat: 'save-granules',
        lines: [
          'You → Crop Monitoring',
          'Crop Monitoring → Earthdata: search_earth_datagranules',
          'Crop Monitoring: an approval',
        ],
        mustSay: ['granule'],
        mustNotSay: [
          'I downloaded',
          'I have downloaded',
          'downloaded them',
          'saved them',
        ],
        within: '120s',
      },
    ],
    within: '10m',
    verified: {
      live: [],
      recorded: [],
      unverified: [
        'Its runtime is not deployed under the demo account yet, and the rehearsal has not been played (A-14).',
      ],
    },
  },
  deployment: {
    account: 'demo',
    page: '/',
    addresses: {
      'crop-monitoring':
        'DATALAYER_DEMO_SCENE_CROP_MONITORING_CROP_MONITORING_A2A_URL',
    },
  },
  setup: ["The agent 'worker-crop-monitoring:0.0.1' is not enabled."],
  played: {
    at: '2026-10-09T17:40:33+00:00',
    where: 'on Datalayer',
    passed: true,
    says: 'Rehearsal: 4 of 4 beats passed. The scene is Live.',
    beats: [
      {
        beat: 'vigour-this-season',
        state: 'passed',
        says: '',
        seconds: 55.53831131900006,
      },
      {
        beat: 'fields-to-watch',
        state: 'passed',
        says: '',
        seconds: 57.56524624400117,
      },
      {
        beat: 'imagery-available',
        state: 'passed',
        says: '',
        seconds: 58.75493016499968,
      },
      {
        beat: 'save-granules',
        state: 'passed',
        says: '',
        seconds: 49.41034528199998,
      },
    ],
    runtime: '1.3.93',
  },
};

export const DISASTER_ASSESSMENT_SCENE_0_0_1: SceneSpec = {
  schema: 'loop.scene/v1',
  id: 'disaster-assessment',
  version: '0.0.1',
  name: 'Disaster Assessment',
  description:
    'An event desk asks two specialists what a disaster affected and what changed on the ground, each reading NASA Earthdata, and reports.',
  tags: ['example', 'scene', 'earthdata', 'disaster', 'insurance', 'a2a'],
  icon: 'alert',
  emoji: '🚨',
  team: 'disaster-assessment:0.0.1',
  entry: 'event-response',
  cast: [
    {
      member: 'event-response',
      app: 'event-response:0.0.1',
      ref: '',
      server: '',
      role: 'initiator',
      runsIn: 'browser',
      talksTo: [
        {
          member: 'disaster-assessment',
          over: 'a2a',
        },
        {
          member: 'change-detection',
          over: 'a2a',
        },
      ],
      persona: {
        name: 'Event response',
        face: '🛡️',
        line: 'Tell me what happened; I ask the specialists and report.',
      },
      brief:
        'Take the event, ask Disaster Assessment for the area and the damage and Change detection for the change on the ground, one request each, and report what they answer without adding to it.',
    },
    {
      member: 'disaster-assessment',
      app: 'disaster-assessment:0.0.1',
      ref: '',
      server: '',
      role: 'contributor',
      runsIn: 'runtime',
      persona: {
        name: 'Disaster Assessment',
        face: '🌊',
        line: 'I estimate the area affected and the damage from the imagery.',
      },
      brief:
        'From the imagery before and after the event, estimate the area affected and the extent of the damage; say what the imagery does not show.',
    },
    {
      member: 'change-detection',
      app: 'change-detection:0.0.1',
      ref: '',
      server: '',
      role: 'contributor',
      runsIn: 'runtime',
      persona: {
        name: 'Change detection',
        face: '🔍',
        line: 'I find what changed on the ground between two dates.',
      },
      brief:
        'From the imagery at two dates, find what changed on the ground; give the granules the change was read from.',
    },
  ],
  setting: {
    systems: [
      {
        server: 'earthdata:0.0.1',
        as: 'Earthdata',
        holds:
          "NASA's catalogue of satellite imagery, searched, not downloaded.",
      },
    ],
    period: 'the days before and after the event',
    language: 'en',
    assumes:
      'Three agents over A2A — Event response in your browser, Disaster assessment and Change detection on Datalayer — each searching the satellite imagery NASA Earthdata holds.',
  },
  script: [
    {
      id: 'flood',
      cue: {
        say: 'Valencia, Spain, was flooded on 29 October 2024. What was affected, and what changed?',
        schedule: '',
        event: '',
      },
      narration:
        'Event response asks both specialists; each searches the imagery around the date.',
      moves: [
        {
          who: 'event-response',
          asks: 'disaster-assessment',
          over: 'a2a',
          what: 'the area the flood affected and the damage',
          tool: '',
        },
        {
          who: 'disaster-assessment',
          asks: 'earthdata',
          over: 'mcp',
          what: 'the granules before and after 29 October 2024',
          tool: 'search_earth_datagranules',
          does: 'read',
        },
        {
          who: 'disaster-assessment',
          asks: '',
          what: 'the area affected and the extent of the damage',
          tool: '',
          answers: 'words',
        },
        {
          who: 'event-response',
          asks: 'change-detection',
          over: 'a2a',
          what: 'what changed on the ground around Valencia',
          tool: '',
        },
        {
          who: 'change-detection',
          asks: 'earthdata',
          over: 'mcp',
          what: 'the granules at the two dates',
          tool: 'search_earth_datagranules',
          does: 'read',
        },
        {
          who: 'change-detection',
          asks: '',
          what: 'the changes found, each with the granules it was read from',
          tool: '',
          answers: 'table',
        },
        {
          who: 'event-response',
          asks: '',
          what: 'what the two answered, as they answered it',
          tool: '',
          answers: 'words',
        },
      ],
      expect:
        'The area affected and the damage from Disaster Assessment, the changes on the ground from Change detection with their granules, reported by Event response without a figure of its own.',
      shows: ['words', 'table'],
      pace: 'slow',
      branch: [
        {
          decision: 'no imagery covers the days around the event',
          expect:
            'The specialists say so, and Event response reports that nothing could be assessed.',
          moves: [],
          then: '',
        },
      ],
    },
    {
      id: 'wildfire',
      cue: {
        say: 'Fires burned around Los Angeles from 7 January 2025. Which imagery shows what changed?',
        schedule: '',
        event: '',
      },
      narration:
        'Change detection finds the imagery before and after, and gives it as sources.',
      moves: [
        {
          who: 'event-response',
          asks: 'change-detection',
          over: 'a2a',
          what: 'the imagery before and after the fires around Los Angeles',
          tool: '',
        },
        {
          who: 'change-detection',
          asks: 'earthdata',
          over: 'mcp',
          what: 'the granules before and after 7 January 2025',
          tool: 'search_earth_datagranules',
          does: 'read',
        },
        {
          who: 'change-detection',
          asks: '',
          what: 'the granules as cards that open their pages, each with its date',
          tool: '',
          answers: 'sources',
        },
        {
          who: 'event-response',
          asks: '',
          what: 'what Change detection answered',
          tool: '',
          answers: 'words',
        },
      ],
      expect:
        'The granules before and after the fires as cards, each with its date and a link that opens it at NASA Earthdata, reported by Event response as Change detection gave them.',
      shows: ['sources'],
      pace: 'slow',
    },
    {
      id: 'storm',
      cue: {
        say: 'The Ahr valley was hit by a storm on 14 July 2021. Chart the imagery found each day from 10 to 20 July.',
        schedule: '',
        event: '',
      },
      narration:
        'A storm, three years back: what the archive still holds, day by day.',
      moves: [
        {
          who: 'event-response',
          asks: 'disaster-assessment',
          over: 'a2a',
          what: 'the imagery found each day around the storm',
          tool: '',
        },
        {
          who: 'disaster-assessment',
          asks: 'earthdata',
          over: 'mcp',
          what: 'the granules from 10 to 20 July 2021',
          tool: 'search_earth_datagranules',
          does: 'read',
        },
        {
          who: 'disaster-assessment',
          asks: '',
          what: 'the granules found each day, drawn',
          tool: '',
          answers: 'chart',
        },
        {
          who: 'event-response',
          asks: '',
          what: 'what Disaster Assessment answered',
          tool: '',
          answers: 'words',
        },
      ],
      expect:
        'A chart of the granules found each day from 10 to 20 July 2021, read from the search, and what the archive does not cover said in words.',
      shows: ['chart'],
      pace: 'slow',
    },
    {
      id: 'alert',
      cue: {
        say: 'Send the Valencia flood assessment to the emergency services.',
        schedule: '',
        event: '',
      },
      narration:
        'An action, not a report — asked first, and not done for a visitor.',
      moves: [
        {
          who: 'event-response',
          asks: 'disaster-assessment',
          over: 'a2a',
          what: 'the flood assessment, to send to the emergency services',
          tool: '',
        },
        {
          who: 'disaster-assessment',
          asks: 'earthdata',
          over: 'mcp',
          what: 'the granules after 29 October 2024',
          tool: 'search_earth_datagranules',
          does: 'read',
        },
        {
          who: 'disaster-assessment',
          asks: '',
          what: 'the assessment it would send, as a choice to approve',
          tool: '',
          answers: 'approval',
        },
        {
          who: 'event-response',
          asks: '',
          what: 'that the sending waits for an approval',
          tool: '',
          answers: 'words',
        },
      ],
      expect:
        'Disaster Assessment says what it would send and asks first — Send it · Not now — and sends nothing; a visitor who approves is refused in a sentence: without an account it only reads.',
      shows: ['approval'],
    },
  ],
  stage: {
    positions: {
      'event-response': {
        x: 0.5,
        y: 0.2,
      },
      'disaster-assessment': {
        x: 0.25,
        y: 0.75,
      },
      'change-detection': {
        x: 0.75,
        y: 0.75,
      },
    },
    opensFirst: 'event-response',
    transcript: {
      tools: true,
      narration: true,
    },
    inspectors: ['agent', 'a2a', 'tools'],
    restsAfter: '10m',
    pace: 'slow',
  },
  audience: {
    who: 'visitors',
    ceilingPerAsk: 0.1,
    asksADay: 3,
  },
  rehearsal: {
    beats: [
      {
        beat: 'flood',
        lines: [
          'You → Event response',
          'Event response → Disaster Assessment',
          'Disaster Assessment → Earthdata: search_earth_datagranules',
          'Disaster Assessment: words',
          'Event response → Change detection',
          'Change detection → Earthdata: search_earth_datagranules',
          'Change detection: a table',
          'Event response: words',
        ],
        mustSay: ['Valencia'],
        mustNotSay: ['I downloaded', 'I have downloaded', 'downloaded them'],
        within: '240s',
      },
      {
        beat: 'wildfire',
        lines: [
          'You → Event response',
          'Event response → Change detection',
          'Change detection → Earthdata: search_earth_datagranules',
          'Change detection: sources',
          'Event response: words',
        ],
        mustSay: ['Los Angeles'],
        within: '240s',
      },
      {
        beat: 'storm',
        lines: [
          'You → Event response',
          'Event response → Disaster Assessment',
          'Disaster Assessment → Earthdata: search_earth_datagranules',
          'Disaster Assessment: a chart',
          'Event response: words',
        ],
        mustSay: ['Ahr'],
        within: '240s',
      },
      {
        beat: 'alert',
        lines: [
          'You → Event response',
          'Event response → Disaster Assessment',
          'Disaster Assessment → Earthdata: search_earth_datagranules',
          'Disaster Assessment: an approval',
          'Event response: words',
        ],
        mustSay: ['Valencia'],
        mustNotSay: ['I sent'],
        within: '240s',
      },
    ],
    within: '10m',
    verified: {
      live: [],
      recorded: [],
      unverified: [
        'The two runtimes are not deployed under the demo account yet, the page runs a team of two today, and the rehearsal has not been played (A-14).',
      ],
    },
  },
  deployment: {
    account: 'demo',
    page: '/',
    addresses: {
      'disaster-assessment':
        'DATALAYER_DEMO_SCENE_DISASTER_ASSESSMENT_DISASTER_ASSESSMENT_A2A_URL',
      'change-detection':
        'DATALAYER_DEMO_SCENE_DISASTER_ASSESSMENT_CHANGE_DETECTION_A2A_URL',
    },
  },
  setup: [
    "The agent 'worker-event-response:0.0.1' is not enabled.",
    "The agent 'worker-disaster-assessment:0.0.1' is not enabled.",
    "The agent 'worker-change-detection:0.0.1' is not enabled.",
  ],
  played: {
    at: '2026-10-09T18:00:54+00:00',
    where: 'on Datalayer',
    passed: false,
    says: 'Rehearsal: 2 of 4 beats passed. 2 failed. The scene is not Live.',
    beats: [
      {
        beat: 'flood',
        state: 'failed',
        says: "Expected “Event response → Change detection” after “Disaster Assessment: words”; the transcript went on: “Change detection → its runtime: show_components”; “Change detection: I'll work through this step by step: find the right datasets, then search for granules before and after 29 October 2024 over Valencia, Spain.\n\n**Step 1 — Find relevant datasets for flood/land change detection over Valencia**Good — **MOD09GA** (MODIS/Terra daily surface reflectance, 500 m) is the best available daily optical dataset. Now let me also check for the CYGNSS water mask and search for granules. Let me search for granules before and after the flood.\n\n**Step 2 — Search for MOD09GA granules BEFORE the flood (around 20–28 Oct 2024)****Step 3 — Search for MOD09GA granules AFTER the flood (30 Oct – 10 Nov 2024)**Now let me also check the CYGNSS daily water mask for the same period, which is specifically designed for flood detection:Now I have everything I need. Let me compile the full change detection analysis and show the components.## Change Detection Report — Valencia, Spain\n**Event:** DANA flash flood, 29 October 2024\n**Comparison:** Pre-flood **20 October 2024** vs. post-flood **30 October 2024**\n**Dataset:** MODIS/Terra MOD09GA V061 — daily 500 m surface reflectance, tiles h17v05 + h18v05\n\n---\n\n### What Earthdata holds\n\nFour granules are confirmed in NASA Earthdata (LP DAAC / Earthdata Cloud):\n\n| | Tile h17v05 (western) | Tile h18v05 (eastern) |\n|---|---|---|\n| **Pre-flood** | MOD09GA.A2024294 — 20 Oct 2024 | MOD09GA.A2024294 — 20 Oct 2024 |\n| **Post-flood** | MOD09GA.A2024304 — 30 Oct 2024 | MOD09GA.A2024304 — 30 Oct 2024 |\n\nValencia city sits on the boundary of both tiles; the full affected area (Horta Sud, Albufera plain) is captured by h17v05 and h18v05 together.\n\n---\n\n### Changes detected (from granule metadata + known spectral signatures)\n\n**1 — Surface water expansion (HIGH confidence)**\nThe Horta Sud plain south and south-west of Valencia (Paiporta, Torrent, Picanya, Catarroja, Massanassa corridors) is normally dry agricultural land. After the flood, MODIS Band 2 (NIR) reflectance collapses and the NDWI (Normalised Difference Water Index = (Green − NIR)/(Green + NIR)) turns strongly positive across an estimated **300–500 km²** of previously dry surface. This is the most robust optical signal for standing water.\n\n**2 — Vegetation / crop loss (MEDIUM-HIGH confidence)**\nThe irrigated *huerta* fields and Albufera buffer zone show NDVI collapse: NIR drops, red rises. Tens of km² of high-productivity market-garden land are affected. Sediment deposition and waterlogging suppress the vegetation signal.\n\n**3 — Coastal turbidity plume (MEDIUM confidence)**\nAt the mouths of the Turia river and the drainage channels east of Valencia, Band 1 (red) and Band 3 (blue) reflectance increase in nearshore Mediterranean pixels, indicating a large sediment/turbidity plume extending ~10–30 km along the coast.\n\n**4 — Urban surface darkening / mud deposition (LOW-MEDIUM confidence)**\nIn the dense urban pixels of Paiporta, Alfafar, Sedaví and Massanassa, visible-band reflectance decreases slightly, consistent with mud and debris coating streets and rooftops. At 500 m resolution MODIS pixels are mixed; **SAR (e.g. Sentinel-1)** would be needed to confirm this at building scale.\n\n**5 — Albufera lagoon turbidity (MEDIUM confidence)**\nThe ~21 km² Albufera lagoon is large enough for MODIS to resolve. Band 1 (red) reflectance increases within the lagoon pixels, consistent with sediment-laden flood water draining into the lagoon from the surrounding plain.\n\n---\n\n### Important caveats\n- **These are granule-level findings.** The pixel-by-pixel change map requires downloading the four HDF files (~300 MB total) and running the NDWI/NDVI differencing script — I have not downloaded them.\n- **Cloud cover on 30 October** (the day after the flood) may obscure parts of the scene; the 31 October granules (A2024305) are also available as a fallback.\n- **500 m resolution** limits detection to features larger than ~1–2 pixels; individual streets, buildings and small channels are below the detection threshold. Sentinel-1 SAR (10 m, cloud-penetrating) is the recommended complement.\n- The CYGNSS daily water mask (designed for flood detection) returned no granules for this bounding box and period — likely a latency or coverage gap for this latitude.\n\nThe table beside this answer summarises all five detected change types with their location, indicator, estimated extent, confidence, and the granule pair behind each one. Would you like me to generate the Python processing script to produce the actual change map from these granules?”; “Event response: I have the event, the place, and the date. I will ask Disaster Assessment for the area and the damage, and Change Detection for what changed on the ground, both at once.Here is what each member reported.\n\n---\n\n## Disaster Assessment — Area and Damage\n\n**Source: Disaster Assessment member**\n\nThe event was identified as a catastrophic flash flood caused by a DANA (*Depresión Aislada en Niveles Altos*), with rainfall exceeding 400 mm in under 8 hours in some municipalities south of Valencia city.\n\n**Imagery used:** MODIS/Terra MOD09GA v061 (500 m daily surface reflectance), tile **h18v05**, confirmed present in NASA Earthdata.\n\n| Phase | Granule | Date |\n|---|---|---|\n| Pre-event | MOD09GA.A2024294.h18v05 | 20 Oct 2024 |\n| Pre-event | MOD09GA.A2024295.h18v05 | 21 Oct 2024 |\n| Post-event | MOD09GA.A2024304.h18v05 | 30 Oct 2024 |\n| Post-event (west) | MOD09GA.A2024304.h17v05 | 30 Oct 2024 |\n\n**Area affected:** The Turia and Júcar river floodplains south of Valencia city — including Paiporta, Sedaví, Alfafar, Massanassa, Catarroja, and the L'Albufera wetland margin — within approximately 39.3°–39.5°N, 0.3°–0.5°W.\n\n**Estimated flood extent:** ~120–150 km² of the Valencia metropolitan south, with floodwaters reported at 1–4 m depth in urban streets.\n\n**Confidence:** The member rated this **moderate**. The post-event scene is T+1 day (flood peak was 29 Oct); cloud cover from the DANA system may partially obscure the optical signal; and at 500 m resolution MODIS will underestimate inundation in narrow streets and channels. Pixel-level NDWI computation requires downloading the HDF files, which was not done.\n\n---\n\n## Change Detection — What Changed on the Ground\n\n**Source: Change Detection member**\n\n**Imagery used:** The same MODIS/Terra MOD09GA V061 granules, tiles h17v05 + h18v05, comparing **20 October 2024 (pre-flood)** against **30 October 2024 (post-flood)**.\n\nFive changes were detected:\n\n1. **Surface water expansion — HIGH confidence.** The Horta Sud plain south and south-west of Valencia (Paiporta, Torrent, Picanya, Catarroja, Massanassa corridors), normally dry agricultural land, shows NDWI turning strongly positive — estimated **300–500 km²** of previously dry surface now under water.\n\n2. **Vegetation and crop loss — MEDIUM-HIGH confidence.** Irrigated *huerta* fields and the Albufera buffer zone show NDVI collapse, affecting tens of km² of market-garden land. Sediment deposition and waterlogging are indicated.\n\n3. **Coastal turbidity plume — MEDIUM confidence.** At the mouths of the Turia river and drainage channels east of Valencia, reflectance increases in nearshore Mediterranean pixels, indicating a sediment/turbidity plume extending approximately 10–30 km along the coast.\n\n4. **Urban surface darkening / mud deposition — LOW-MEDIUM confidence.** In dense urban pixels of Paiporta, Alfafar, Sedaví and Massanassa, visible-band reflectance decreases slightly, consistent with mud and debris on streets and rooftops. The member noted that at 500 m resolution pixels are mixed, and that SAR (e.g. Sentinel-1) would be needed to confirm this at building scale.\n\n5. **Albufera lagoon turbidity — MEDIUM confidence.** Red-band reflectance increases within the ~21 km² Albufera lagoon, consistent with sediment-laden floodwater draining into it from the surrounding plain.\n\n**Caveats from the member:** These are granule-level findings; the pixel-by-pixel change map requires downloading the four HDF files (~300 MB) and running a differencing script — this was not done. Cloud cover on 30 October may obscure parts of the scene; the 31 October granules are available as a fallback. The CYGNSS daily water mask returned no granules for this area and period, likely due to a latency or coverage gap. At 500 m resolution, individual streets, buildings and small channels are below the detection threshold.\n\n---\n\n**In summary:** both members confirm a major inundation event across the Horta Sud plain south of Valencia, with the water extent estimated between 120–150 km² (Disaster Assessment) and 300–500 km² (Change Detection) — a difference the members attribute to methodology and resolution rather than to anything added here. Neither member downloaded the underlying imagery files, so all figures carry the caveats noted above.”.",
        seconds: 144.01061775500057,
      },
      {
        beat: 'wildfire',
        state: 'passed',
        says: '',
        seconds: 101.57695842600151,
      },
      {
        beat: 'storm',
        state: 'passed',
        says: '',
        seconds: 115.64063411299867,
      },
      {
        beat: 'alert',
        state: 'failed',
        says: 'Expected “Event response → Disaster Assessment” after “You → Event response”; the transcript went on: “Event response: Before I can act on this, I need to confirm a few things.\n\nYou have asked me to **send** the Valencia flood assessment to the emergency services. I want to be transparent with you on two points:\n\n1. **I change nothing anywhere.** Sending is an external and irreversible action. I can ask Disaster Assessment to produce an assessment, but I cannot send anything myself, and I will not report something as sent unless the tool explicitly confirms it was.\n\n2. **I need the date of the event** before I can ask for any assessment. The Valencia flood — can you confirm the date (or date range) of the event? For example: *29 October 2024*.\n\nOnce you give me the date, I will ask Disaster Assessment for the area and damage, and I will put your instruction — that the assessment is to be sent to the emergency services — in that request. I will then report exactly what Disaster Assessment says, including whether it confirms the send.\n\nPlease provide the event date and I will proceed immediately.”.',
        seconds: 6.073784349999187,
      },
    ],
    runtime: '1.3.93',
  },
};

export const MONTH_END_CLOSE_SCENE_0_0_1: SceneSpec = {
  schema: 'loop.scene/v1',
  id: 'month-end-close',
  version: '0.0.1',
  name: 'Month-end Close',
  description:
    'One agent drives the close from the Odoo books it only reads: where the close stands, what is to book, what is still open.',
  tags: ['example', 'scene', 'odoo', 'finance', 'a2a'],
  icon: 'calendar',
  emoji: '📒',
  team: 'month-end-close:0.0.1',
  entry: 'month-end-close',
  cast: [
    {
      member: 'month-end-close',
      app: 'month-end-close:0.0.1',
      ref: '',
      server: '',
      role: 'initiator',
      runsIn: 'runtime',
      persona: {
        name: 'Month-end Close',
        face: '🗓️',
        line: 'I read the books and tell you where the close stands.',
      },
      brief:
        "Read the period's books, one call at a time, and report what is done, what is to book and what is still open; change nothing, and say so when asked to. Show it the way the cue asked to see it, with `show_components` and never drawn in words: the checklist and figures that compare as a `table`; a month against the month before as a `chart`; the entries an accrual rests on as `sources`, a card each; and anything that would post to the books as a `choice` to approve. Asked to post, you do not refuse and you do not post: read the entries you would post and show them as that `choice` — *Post the accruals* · *Not now* — which is what your rule *Change the books: ask first* means. A person decides, and nothing reaches Odoo until they do.",
    },
  ],
  setting: {
    systems: [
      {
        server: 'odoo-accounting:0.0.1',
        as: 'Odoo',
        holds: "Datalayer's own books, read only.",
      },
    ],
    period: 'last month',
    language: 'en',
    assumes:
      "One agent, its data: Month-end Close on Datalayer, on Datalayer's own books in Odoo, read only.",
  },
  script: [
    {
      id: 'close-checklist',
      cue: {
        say: 'Where does the month-end close stand for last month? Give me the checklist.',
        schedule: '',
        event: '',
      },
      narration: 'The lock dates and the bank first, then the checklist.',
      moves: [
        {
          who: 'month-end-close',
          asks: 'odoo',
          over: 'mcp',
          what: 'whether last month is locked',
          tool: 'odoo_accounting_get_lock_dates',
          does: 'read',
        },
        {
          who: 'month-end-close',
          asks: 'odoo',
          over: 'mcp',
          what: 'where the bank reconciliation stands',
          tool: 'odoo_accounting_bank_status',
          does: 'read',
        },
        {
          who: 'month-end-close',
          asks: '',
          what: 'the checklist, each step done, to do or blocked',
          tool: '',
          answers: 'table',
        },
      ],
      expect:
        'A checklist of the close with each step marked done, to do or blocked, read from the books, nothing assumed.',
      shows: ['table'],
      branch: [
        {
          decision: 'last month is locked in the books',
          expect: 'It says the close is done, and gives the lock date.',
          moves: [],
          then: '',
        },
      ],
    },
    {
      id: 'accruals',
      cue: {
        say: 'Which accruals should be booked for last month? Show me the entries each rests on.',
        schedule: '',
        event: '',
      },
      narration: 'The entries of the period, and what they leave to accrue.',
      moves: [
        {
          who: 'month-end-close',
          asks: 'odoo',
          over: 'mcp',
          what: "last month's journal entries",
          tool: 'odoo_accounting_list_journal_entries',
          does: 'read',
        },
        {
          who: 'month-end-close',
          asks: 'odoo',
          over: 'mcp',
          what: 'the accounts the accruals go to',
          tool: 'odoo_accounting_general_ledger',
          does: 'read',
        },
        {
          who: 'month-end-close',
          asks: '',
          what: 'each accrual to book, with the entries it rests on as cards',
          tool: '',
          answers: 'sources',
        },
      ],
      expect:
        'The accruals to book, each with its account and its amount, and the entries each rests on as cards; nothing booked.',
      shows: ['sources'],
      pace: 'slow',
    },
    {
      id: 'expenses-by-month',
      cue: {
        say: "Chart last month's expenses by account against the month before.",
        schedule: '',
        event: '',
      },
      narration: 'Two months of expenses, account by account.',
      moves: [
        {
          who: 'month-end-close',
          asks: 'odoo',
          over: 'mcp',
          what: 'the expense accounts of the two months',
          tool: 'odoo_accounting_trial_balance',
          does: 'read',
        },
        {
          who: 'month-end-close',
          asks: '',
          what: 'each expense account, last month against the month before',
          tool: '',
          answers: 'chart',
        },
      ],
      expect:
        'A chart of the expense accounts, last month beside the month before, read from the books; the accounts that moved most said in words.',
      shows: ['chart'],
    },
    {
      id: 'post-accruals',
      cue: {
        say: 'Post the accruals you suggested for last month.',
        schedule: '',
        event: '',
      },
      narration:
        'A change to the books — asked first, and not done for a visitor.',
      moves: [
        {
          who: 'month-end-close',
          asks: 'odoo',
          over: 'mcp',
          what: "last month's entries, to name the accruals",
          tool: 'odoo_accounting_list_journal_entries',
          does: 'read',
        },
        {
          who: 'month-end-close',
          asks: '',
          what: 'the entries it would post, as a choice to approve',
          tool: '',
          answers: 'approval',
        },
      ],
      expect:
        'It names the entries it would post and asks first — Post them · Not now — and posts nothing; a visitor who approves is refused in a sentence: without an account it only reads.',
      shows: ['approval'],
      branch: [
        {
          decision: 'the audience asks to post the accruals',
          expect:
            'It leaves the posting to a person, and says what they would do.',
          moves: [],
          then: '',
        },
      ],
    },
  ],
  stage: {
    positions: {
      'month-end-close': {
        x: 0.5,
        y: 0.5,
      },
    },
    opensFirst: 'month-end-close',
    transcript: {
      tools: true,
      narration: true,
      withhold: ['ids'],
    },
    inspectors: ['agent', 'tools'],
    restsAfter: '10m',
    pace: 'steady',
  },
  audience: {
    who: 'visitors',
    ceilingPerAsk: 0.05,
    asksADay: 5,
  },
  rehearsal: {
    beats: [
      {
        beat: 'close-checklist',
        lines: [
          'You → Month-end Close',
          'Month-end Close → Odoo: odoo_accounting_*',
          'Month-end Close → Odoo: odoo_accounting_*',
          'Month-end Close: a table',
        ],
        mustSay: ['close'],
        mustNotSay: ['I posted'],
        within: '240s',
      },
      {
        beat: 'accruals',
        lines: [
          'You → Month-end Close',
          'Month-end Close → Odoo: odoo_accounting_*',
          'Month-end Close: sources',
        ],
        mustSay: ['accrual'],
        mustNotSay: ['I posted'],
        within: '180s',
      },
      {
        beat: 'expenses-by-month',
        lines: [
          'You → Month-end Close',
          'Month-end Close → Odoo: odoo_accounting_trial_balance',
          'Month-end Close: a chart',
        ],
        mustSay: ['expense'],
        within: '120s',
      },
      {
        beat: 'post-accruals',
        lines: [
          'You → Month-end Close',
          'Month-end Close → Odoo: odoo_accounting_list_journal_entries',
          'Month-end Close: an approval',
        ],
        mustSay: ['accrual'],
        mustNotSay: ['I posted'],
        within: '120s',
      },
    ],
    within: '15m',
    verified: {
      live: [],
      recorded: [],
      unverified: [
        'Its runtime is not deployed under the demo account yet, and the rehearsal has not been played (A-14).',
      ],
    },
  },
  deployment: {
    account: 'demo',
    page: '/',
    addresses: {
      'month-end-close':
        'DATALAYER_DEMO_SCENE_MONTH_END_CLOSE_MONTH_END_CLOSE_A2A_URL',
    },
  },
  setup: [
    "The agent 'worker-month-end-close:0.0.1' is not enabled.",
    "The MCP server 'odoo-accounting:0.0.1' is not enabled.",
  ],
  played: {
    at: '2026-10-09T15:33:25+00:00',
    where: 'on Datalayer',
    passed: false,
    says: 'Rehearsal: 2 of 4 beats passed. 2 failed. The scene is not Live.',
    beats: [
      {
        beat: 'close-checklist',
        state: 'passed',
        says: '',
        seconds: 100.39224812800012,
      },
      {
        beat: 'accruals',
        state: 'passed',
        says: '',
        seconds: 134.23890428100003,
      },
      {
        beat: 'expenses-by-month',
        state: 'failed',
        says: "Expected “Month-end Close: a chart” after “Month-end Close → Odoo: odoo_accounting_trial_balance”; the transcript went on: “Month-end Close → its runtime: show_components”; “Month-end Close: I'll pull the trial balance for both months. Today I'll treat **last month as April 2025** and **the month before as March 2025**.Both trial balance calls returned no data — the books hold no posted entries for either April 2025 or March 2025 in the default company, so there are no expense figures to chart.The trial balance returned **no posted entries** for either April 2025 (last month) or March 2025 (the month before), so there is nothing to chart. A few possible reasons:\n\n- The company may not have posted any journal entries in those months yet.\n- The default company in this Odoo instance may be a demo or test environment with no activity in that period.\n- Entries may still be in **draft** state (I only read posted entries by default).\n\n**What you can do:**\n1. **Post any draft entries** for those months in Odoo, then ask again.\n2. **Specify a different period** — tell me which months to look at and I'll re-run the comparison.\n3. If entries exist as drafts, let me know and I can re-run with `include_draft: true`.”.",
        seconds: 21.827084645000014,
      },
      {
        beat: 'post-accruals',
        state: 'failed',
        says: 'Expected “Month-end Close → Odoo: odoo_accounting_list_journal_entries” after “You → Month-end Close”; the transcript went on: “Month-end Close → its runtime: show_components”; “Month-end Close: I cannot post — or offer to post — journal entries. Writing to Odoo is outside what I do.\n\nHere is what that means in practice, and what a person would need to do instead:**I never write to Odoo.** My rules are explicit: I do not create, post, reconcile, book, match, lock, or delete anything — and I do not offer to do so on your behalf.\n\nWhat I *can* do is give a person everything they need to post the accruals themselves:\n\n1. **Show the suggested accruals** — account, amount, description, and period — drawn from the trial balance, open balances, and general ledger of last month.\n2. **Explain the journal entry** a person would need to create in Odoo (Accounting → Journal Entries → New) for each one.\n3. **Flag any gaps** — missing invoices, unreconciled items, or draft entries — that should be resolved before the entries are posted.\n\nPress **"Yes — show me the suggested accruals"** above and I will run the full month-end read and lay out exactly what a person would enter.”.',
        seconds: 12.189939259999846,
      },
    ],
    runtime: '1.3.93',
  },
};

export const SALES_AND_ACCOUNTING_SCENE_0_0_1: SceneSpec = {
  schema: 'loop.scene/v1',
  id: 'sales-and-accounting',
  version: '0.0.1',
  name: 'Sales & Accounting',
  description:
    'A sales desk asks Accounting for the figures and hands them over; Accounting reads the Odoo books and answers, and changes nothing.',
  tags: ['example', 'scene', 'odoo', 'finance', 'a2a'],
  icon: 'people',
  emoji: '🤝',
  team: 'sales-and-accounting:0.0.1',
  entry: 'sales',
  cast: [
    {
      member: 'sales',
      app: 'sales:0.0.1',
      ref: '',
      server: '',
      role: 'initiator',
      runsIn: 'browser',
      talksTo: [
        {
          member: 'accounting',
          over: 'a2a',
        },
      ],
      persona: {
        name: 'Sales',
        face: '💼',
        line: 'I take your request and bring the figures back.',
      },
      brief:
        "Ask Accounting for every figure, one request each time, and report what it answers without adding to it. Do not question the audience first: a cue is the whole of what it says, and nobody is standing there to answer you back. A cue that names the report it wants — the invoices still open, the aged receivables as of today, the invoices behind the largest balance, a reminder to whoever is overdue — goes to Accounting as it stands, with how the audience asked to see it. A cue that says no period and no customer is Accounting's to fill: it takes the current fiscal year and the default company, and tells you which it took, so you ask it rather than the audience.",
    },
    {
      member: 'accounting',
      app: 'accounting:0.0.1',
      ref: '',
      server: '',
      role: 'contributor',
      runsIn: 'runtime',
      persona: {
        name: 'Accounting',
        face: '🧾',
        line: 'I read the books and answer; I change nothing.',
      },
      brief:
        'Answer from the Odoo books, read only, and say so when the books do not hold the answer. Show it the way the cue asked to see it, with `show_components` and never drawn in words: figures that compare as a `table`; a balance by age or by customer as a `chart`; and, when the cue says to see each one, the records themselves as `sources` — a card per invoice, its number the title and its date and what is due the passage — rather than another table. Anything that would change the books is a `choice` to approve.',
    },
  ],
  setting: {
    systems: [
      {
        server: 'odoo-accounting:0.0.1',
        as: 'Odoo',
        holds: "Datalayer's own books, read only.",
      },
    ],
    period: 'this month and the last',
    language: 'en',
    assumes:
      "Two agents over A2A — Sales in your browser, Accounting on Datalayer — on Datalayer's own books in Odoo, read only.",
  },
  script: [
    {
      id: 'open-invoices',
      cue: {
        say: 'Which customer invoices are still open, and how much is due in total?',
        schedule: '',
        event: '',
      },
      narration:
        'Sales takes the request and asks Accounting, which reads the books.',
      moves: [
        {
          who: 'sales',
          asks: 'accounting',
          over: 'a2a',
          what: 'the open customer invoices and the total due',
          tool: '',
        },
        {
          who: 'accounting',
          asks: 'odoo',
          over: 'mcp',
          what: 'the customer invoices still open',
          tool: 'odoo_accounting_list_invoices',
          does: 'read',
        },
        {
          who: 'accounting',
          asks: '',
          what: 'the open invoices by customer, with the total due',
          tool: '',
          answers: 'table',
        },
        {
          who: 'sales',
          asks: '',
          what: 'what Accounting answered, as it answered it',
          tool: '',
          answers: 'words',
        },
      ],
      expect:
        'A table of the open customer invoices, by customer, with one total that matches the books; Sales adds nothing to it.',
      shows: ['table'],
      pace: 'steady',
      branch: [
        {
          decision: 'the books hold no open invoice',
          expect: 'Sales says so in a sentence, and invents no figure.',
          moves: [],
          then: '',
        },
      ],
    },
    {
      id: 'aged-receivables',
      cue: {
        say: 'Chart the aged receivables as of today, by customer.',
        schedule: '',
        event: '',
      },
      narration: 'Accounting ages what is due, bucket by bucket, and draws it.',
      moves: [
        {
          who: 'sales',
          asks: 'accounting',
          over: 'a2a',
          what: 'the aged receivables as of today, by customer, as a chart',
          tool: '',
        },
        {
          who: 'accounting',
          asks: 'odoo',
          over: 'mcp',
          what: 'the receivables, aged',
          tool: 'odoo_accounting_aged_balance',
          does: 'read',
        },
        {
          who: 'accounting',
          asks: '',
          what: "each customer's balance by age, drawn",
          tool: '',
          answers: 'chart',
        },
        {
          who: 'sales',
          asks: '',
          what: 'which customers are furthest behind',
          tool: '',
          answers: 'words',
        },
      ],
      expect:
        "A chart of the receivables by customer and by age, its figures the books' own; Sales points at the customers furthest behind.",
      shows: ['chart'],
    },
    {
      id: 'largest-balance',
      cue: {
        say: 'Which invoices make up the largest balance due? Show me each one.',
        schedule: '',
        event: '',
      },
      narration: 'The customer who owes the most, invoice by invoice.',
      moves: [
        {
          who: 'sales',
          asks: 'accounting',
          over: 'a2a',
          what: 'the invoices behind the largest balance due',
          tool: '',
        },
        {
          who: 'accounting',
          asks: 'odoo',
          over: 'mcp',
          what: 'what each customer owes, invoice by invoice: whose balance is the largest, and the invoices it is made of',
          tool: 'odoo_accounting_list_open_balances',
          does: 'read',
        },
        {
          who: 'accounting',
          asks: '',
          what: 'each invoice as a card, its number, its date and what is due',
          tool: '',
          answers: 'sources',
        },
        {
          who: 'sales',
          asks: '',
          what: 'whose balance it is, and its total',
          tool: '',
          answers: 'words',
        },
      ],
      expect:
        'The invoices behind the largest balance as cards, each with its number, its date and the amount due, read from the books; their total is the balance.',
      shows: ['sources'],
    },
    {
      id: 'payment-reminders',
      cue: {
        say: 'Send a payment reminder to every customer whose invoice is overdue.',
        schedule: '',
        event: '',
      },
      narration:
        'An action, not a report — asked first, and not done for a visitor.',
      moves: [
        {
          who: 'sales',
          asks: 'accounting',
          over: 'a2a',
          what: 'payment reminders to the customers whose invoices are overdue',
          tool: '',
        },
        {
          who: 'accounting',
          asks: 'odoo',
          over: 'mcp',
          what: 'what each customer owes by age: who is overdue, and by how much',
          tool: 'odoo_accounting_aged_balance',
          does: 'read',
        },
        {
          who: 'accounting',
          asks: '',
          what: 'the reminders it would send, as a choice to approve',
          tool: '',
          answers: 'approval',
        },
        {
          who: 'sales',
          asks: '',
          what: 'that the reminders wait for an approval',
          tool: '',
          answers: 'words',
        },
      ],
      expect:
        'Accounting lists the customers it would remind and asks first — Send the reminders · Not now — and sends nothing; a visitor who approves is refused in a sentence: without an account it only reads.',
      shows: ['approval'],
      pace: 'slow',
    },
  ],
  stage: {
    positions: {
      sales: {
        x: 0.25,
        y: 0.5,
      },
      accounting: {
        x: 0.75,
        y: 0.5,
      },
    },
    opensFirst: 'sales',
    transcript: {
      tools: true,
      narration: true,
      withhold: ['ids'],
    },
    inspectors: ['agent', 'a2a', 'tools'],
    restsAfter: '10m',
    pace: 'steady',
  },
  audience: {
    who: 'visitors',
    ceilingPerAsk: 0.05,
    asksADay: 5,
  },
  rehearsal: {
    beats: [
      {
        beat: 'open-invoices',
        lines: [
          'You → Sales',
          'Sales → Accounting',
          'Accounting → Odoo: odoo_accounting_list_invoices',
          'Accounting: a table',
          'Sales: words',
        ],
        mustSay: ['invoice'],
        mustNotSay: ['I cannot', 'error'],
        within: '120s',
      },
      {
        beat: 'aged-receivables',
        lines: [
          'You → Sales',
          'Sales → Accounting',
          'Accounting → Odoo: odoo_accounting_aged_balance',
          'Accounting: a chart',
          'Sales: words',
        ],
        mustSay: ['days'],
        within: '120s',
      },
      {
        beat: 'largest-balance',
        lines: [
          'You → Sales',
          'Sales → Accounting',
          'Accounting → Odoo: odoo_accounting_*',
          'Accounting: sources',
          'Sales: words',
        ],
        mustSay: ['invoice'],
        within: '120s',
      },
      {
        beat: 'payment-reminders',
        lines: [
          'You → Sales',
          'Sales → Accounting',
          'Accounting → Odoo: odoo_accounting_aged_balance',
          'Accounting: an approval',
          'Sales: words',
        ],
        mustSay: ['reminder'],
        mustNotSay: ['I sent', 'reminders sent'],
        within: '120s',
      },
    ],
    within: '10m',
    verified: {
      live: [
        "Sales asked Accounting live over A2A on a developer's machine (2026-10-06) for the open customer invoices: Accounting read the aged receivables and said the list of invoices had failed; one column total was wrong.",
      ],
      recorded: [],
      unverified: [
        'The rehearsal has not been played as a set (A-14): the scene is not Live yet.',
      ],
    },
  },
  deployment: {
    account: 'demo',
    page: '/',
    addresses: {
      accounting: 'DATALAYER_DEMO_TEAM_ACCOUNTING_A2A_URL',
    },
  },
  setup: [
    "The agent 'worker-sales-pipeline-board-report:0.0.1' is not enabled.",
    "The agent 'worker-accountant:0.0.1' is not enabled.",
    "The MCP server 'odoo-accounting:0.0.1' is not enabled.",
  ],
  played: {
    at: '2026-10-09T15:18:40+00:00',
    where: 'on Datalayer',
    passed: true,
    says: 'Rehearsal: 4 of 4 beats passed. The scene is Live.',
    beats: [
      {
        beat: 'open-invoices',
        state: 'passed',
        says: '',
        seconds: 31.686379444999602,
      },
      {
        beat: 'aged-receivables',
        state: 'passed',
        says: '',
        seconds: 27.275244929999644,
      },
      {
        beat: 'largest-balance',
        state: 'passed',
        says: '',
        seconds: 41.62880667699983,
      },
      {
        beat: 'payment-reminders',
        state: 'passed',
        says: '',
        seconds: 25.168268976000036,
      },
    ],
    runtime: '1.3.93',
  },
};

export const SCENE_CATALOGUE: Record<string, SceneSpec> = {
  'crop-monitoring': CROP_MONITORING_SCENE_0_0_1,
  'disaster-assessment': DISASTER_ASSESSMENT_SCENE_0_0_1,
  'month-end-close': MONTH_END_CLOSE_SCENE_0_0_1,
  'sales-and-accounting': SALES_AND_ACCOUNTING_SCENE_0_0_1,
};

/** A scene, by `id` or `id:version`, or undefined. */
export function getSceneSpec(ref: string): SceneSpec | undefined {
  // Own entries only: `constructor` and `toString` are not scenes.
  const own = (id: string): SceneSpec | undefined =>
    Object.prototype.hasOwnProperty.call(SCENE_CATALOGUE, id)
      ? SCENE_CATALOGUE[id]
      : undefined;
  const at = ref.lastIndexOf(':');
  return (
    own(ref) ??
    (at > 0 && ref.slice(at + 1).includes('.')
      ? own(ref.slice(0, at))
      : undefined)
  );
}

/** Every scene of the catalogue, in the catalogue's order, or those carrying a tag. */
export function listSceneSpecs(tag?: string): SceneSpec[] {
  return Object.values(SCENE_CATALOGUE).filter(
    scene => tag === undefined || scene.tags.includes(tag),
  );
}

/** Every scene that stages a team, by its id with or without a version. */
export function scenesStaging(teamId: string): SceneSpec[] {
  const wanted = teamId.split(':')[0];
  return Object.values(SCENE_CATALOGUE).filter(
    scene => scene.team !== '' && scene.team.split(':')[0] === wanted,
  );
}
