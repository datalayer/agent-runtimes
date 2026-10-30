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

export const CODING_AGENT_BEHIND_THE_SHIELD_SCENE_0_0_1: SceneSpec = {
  schema: 'loop.scene/v1',
  id: 'coding-agent-behind-the-shield',
  version: '0.0.1',
  name: 'A Coding Agent Behind the Shield',
  description:
    'A coding agent lent one repository to read explains a file; the edit it is then asked for is refused by the Shield, which says the rule.',
  tags: ['example', 'scene', 'coding', 'harness', 'shield', 'a2a'],
  icon: 'code',
  emoji: '🔒',
  kind: 'team',
  team: '',
  entry: 'code-explainer',
  cast: [
    {
      member: 'code-explainer',
      app: 'code-explainer:0.0.1',
      ref: '',
      server: '',
      role: 'initiator',
      runsIn: 'runtime',
      persona: {
        name: 'Code Explainer',
        face: '🔦',
        line: 'I read the repository I am lent and explain it; the Shield decides what I may do.',
      },
      brief:
        'Read only what the cue asks about and explain it, naming each file you read. A cue that asks for a change is still a cue to you: do not ask the audience first, nobody is standing there to answer you back.',
    },
  ],
  setting: {
    systems: [],
    contents: ['The repository it is lent, read only'],
    period: '',
    language: 'en',
    assumes:
      "One coding agent, OpenCode, on Datalayer, lent one repository to read; the Shield in front of it decides every file it opens and every edit it tries, by the application's Rules.",
  },
  script: [
    {
      id: 'explain-a-file',
      cue: {
        say: 'Explain what README.md says about this project, and how the repository is laid out.',
        schedule: '',
        event: '',
      },
      narration:
        'The agent reads the file through the Shield, step by step, and explains it.',
      moves: [
        {
          who: 'code-explainer',
          asks: '',
          what: 'what README.md says, and how the repository is laid out',
          tool: '',
          answers: 'words',
        },
      ],
      expect:
        'Each file it reads is a line of the transcript, allowed by the rule *Read the repository*; it explains the README and the layout, naming the files it read, and changes nothing.',
      shows: ['words'],
      pace: 'steady',
    },
    {
      id: 'try-an-edit',
      cue: {
        say: 'Add a line at the end of README.md that says who explained it.',
        schedule: '',
        event: '',
      },
      narration:
        'A write, refused by the Shield — the drill-down names the rule.',
      moves: [
        {
          who: 'code-explainer',
          asks: '',
          what: 'that the edit was refused, and the change it would make, in words',
          tool: '',
          answers: 'words',
        },
      ],
      expect:
        "The edit it tries is a line of the transcript marked refused; its drill-down shows the Shield's decision, *leave it to me*, and the rule *Change a file*. README.md is unchanged.",
      shows: ['words'],
      pace: 'slow',
    },
  ],
  stage: {
    positions: {
      'code-explainer': {
        x: 0.5,
        y: 0.5,
      },
    },
    opensFirst: 'code-explainer',
    transcript: {
      tools: true,
      narration: true,
      withhold: ['credentials'],
    },
    inspectors: ['agent', 'tools'],
    restsAfter: '10m',
    pace: 'steady',
    backdrop: 'hero',
  },
  audience: {
    who: 'visitors',
    ceilingPerAsk: 0.1,
    asksADay: 3,
  },
  rehearsal: {
    beats: [
      {
        beat: 'explain-a-file',
        lines: [
          'You → Code Explainer',
          'Code Explainer → its workspace: *README*',
          'Code Explainer: words',
        ],
        mustSay: ['README'],
        mustNotSay: ['I edited', 'I changed'],
        within: '180s',
      },
      {
        beat: 'try-an-edit',
        lines: [
          'You → Code Explainer',
          'Code Explainer → its workspace: *README*',
          'Code Explainer: words',
        ],
        mustSay: ['Change a file'],
        mustNotSay: ['I added', 'I have added'],
        within: '180s',
      },
    ],
    within: '10m',
    recording: {
      path: 'coding-agent-behind-the-shield/recording.json',
      taken: '2026-10-30',
      note: 'Rehearsed on Datalayer on 30 October 2026: OpenCode read README.md and explained the repository; asked to edit it, the Shield refused the edit under the rule Change a file, and README.md was unchanged.',
    },
    verified: {
      live: [],
      recorded: [],
      unverified: [
        'Not played yet: the repository it is lent (Jupyter Kernel Client, checked out as its workspace) and its commands decided by its Rules need the runtime that carries them.',
      ],
    },
  },
  deployment: {
    account: 'demo',
    page: '/',
    addresses: {
      'code-explainer':
        'DATALAYER_DEMO_SCENE_CODING_AGENT_BEHIND_THE_SHIELD_CODE_EXPLAINER_A2A_URL',
    },
  },
  actors: [],
  lines: [],
  live: '',
  setup: ["The agent 'example-harness-opencode:0.0.1' is not enabled."],
  played: {
    at: '2026-10-30T06:00:14+00:00',
    where: 'on Datalayer',
    passed: true,
    says: 'Rehearsal: 2 of 2 beats passed. The scene is Live.',
    beats: [
      {
        beat: 'explain-a-file',
        state: 'passed',
        says: '',
        seconds: 18.51475361300072,
      },
      {
        beat: 'try-an-edit',
        state: 'passed',
        says: '',
        seconds: 6.578561589999481,
      },
    ],
    runtime: '1.5.80',
  },
};

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
  kind: 'team',
  team: 'crop-monitoring:0.0.2',
  entry: 'crop-monitoring',
  cast: [
    {
      member: 'crop-monitoring',
      app: 'crop-monitoring:0.0.2',
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
    backdrop: 'hero',
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
    recording: {
      path: 'crop-monitoring/recording.json',
      taken: '2026-10-29',
      note: 'Rehearsed on Datalayer, under the demo account.',
    },
    verified: {
      live: [],
      recorded: [],
      unverified: [
        'Its runtime is not deployed under the demo account yet, and the rehearsal has not been played.',
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
  actors: [],
  lines: [],
  live: '',
  setup: ["The agent 'worker-crop-monitoring:0.0.1' is not enabled."],
  played: {
    at: '2026-10-29T14:24:34+00:00',
    where: 'on Datalayer',
    passed: true,
    says: 'Rehearsal: 4 of 4 beats passed. The scene is Live.',
    beats: [
      {
        beat: 'vigour-this-season',
        state: 'passed',
        says: '',
        seconds: 67.73760564999975,
      },
      {
        beat: 'fields-to-watch',
        state: 'passed',
        says: '',
        seconds: 48.32110785199984,
      },
      {
        beat: 'imagery-available',
        state: 'passed',
        says: '',
        seconds: 78.49201327000264,
      },
      {
        beat: 'save-granules',
        state: 'passed',
        says: '',
        seconds: 37.01923025799988,
      },
    ],
    runtime: '1.5.80',
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
  kind: 'team',
  team: 'disaster-assessment:0.0.2',
  entry: 'event-response',
  cast: [
    {
      member: 'event-response',
      app: 'event-response:0.0.3',
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
        "Take the event and ask one specialist at a time, never both at once, waiting for each answer before you ask the next: Disaster Assessment for the area affected and the damage and for what the archive holds around the event, day by day, and then, only if the request asks what changed on the ground between two dates, Change detection. Report what they answer without adding to it. Do not question the audience first: a cue is the whole of what it says, and nobody is standing there to answer you back. A cue that says no date is yours to fill with the most recent one the imagery has, and a cue that says no place with the area the event names; ask the specialists with what you assumed, and say in your answer what you assumed. A cue that asks to send something is Disaster Assessment's: tell it what is to be sent and to whom, so that it shows the sending as a choice to approve, and never ask the audience to confirm it yourself.",
    },
    {
      member: 'disaster-assessment',
      app: 'disaster-assessment:0.0.2',
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
        'From the imagery before and after the event, estimate the area affected and the extent of the damage; say what the imagery does not show. Asked to send an assessment, send nothing: show its sending as a choice to approve — *Send it* · *Not now*.',
    },
    {
      member: 'change-detection',
      app: 'change-detection:0.0.2',
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
        'Event response asks one specialist at a time, waiting for each answer; each searches the imagery around the date.',
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
    backdrop: 'hero',
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
        within: '360s',
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
    within: '20m',
    recording: {
      path: 'disaster-assessment/recording.json',
      taken: '2026-10-29',
      note: 'Rehearsed on Datalayer, under the demo account.',
    },
    verified: {
      live: [],
      recorded: [],
      unverified: [
        'Rehearsed on Datalayer on 2026-10-09: three beats of four pass — wildfire 121 s, storm 58 s, alert 98 s — and flood took 256 s against the 240 s it allows, a bound measured when Event response still asked both specialists at once.',
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
  actors: [],
  lines: [],
  live: '',
  setup: [
    "The agent 'worker-event-response:0.0.1' is not enabled.",
    "The agent 'worker-disaster-assessment:0.0.1' is not enabled.",
    "The agent 'worker-change-detection:0.0.1' is not enabled.",
  ],
  played: {
    at: '2026-10-29T14:31:19+00:00',
    where: 'on Datalayer',
    passed: true,
    says: 'Rehearsal: 4 of 4 beats passed. The scene is Live.',
    beats: [
      {
        beat: 'flood',
        state: 'passed',
        says: '',
        seconds: 177.86574391100294,
      },
      {
        beat: 'wildfire',
        state: 'passed',
        says: '',
        seconds: 88.12401191100071,
      },
      {
        beat: 'storm',
        state: 'passed',
        says: '',
        seconds: 45.252418705997115,
      },
      {
        beat: 'alert',
        state: 'passed',
        says: '',
        seconds: 68.9234332269989,
      },
    ],
    runtime: '1.5.80',
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
  kind: 'team',
  team: 'month-end-close:0.0.2',
  entry: 'month-end-close',
  cast: [
    {
      member: 'month-end-close',
      app: 'month-end-close:0.0.2',
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
    backdrop: 'hero',
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
        within: '180s',
      },
    ],
    within: '15m',
    recording: {
      path: 'month-end-close/recording.json',
      taken: '2026-10-29',
      note: 'Rehearsed on Datalayer, under the demo account.',
    },
    verified: {
      live: [],
      recorded: [],
      unverified: [
        'Its runtime is not deployed under the demo account yet, and the rehearsal has not been played.',
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
  actors: [],
  lines: [],
  live: '',
  setup: [
    "The agent 'worker-month-end-close:0.0.1' is not enabled.",
    "The MCP server 'odoo-accounting:0.0.1' is not enabled.",
  ],
  played: {
    at: '2026-10-29T14:17:04+00:00',
    where: 'on Datalayer',
    passed: true,
    says: 'Rehearsal: 4 of 4 beats passed. The scene is Live.',
    beats: [
      {
        beat: 'close-checklist',
        state: 'passed',
        says: '',
        seconds: 115.16930352199779,
      },
      {
        beat: 'accruals',
        state: 'passed',
        says: '',
        seconds: 81.98463336400164,
      },
      {
        beat: 'expenses-by-month',
        state: 'passed',
        says: '',
        seconds: 58.18933799399747,
      },
      {
        beat: 'post-accruals',
        state: 'passed',
        says: '',
        seconds: 71.78365175200088,
      },
    ],
    runtime: '1.5.80',
  },
};

export const PACT_A_PERSONAL_AGENT_AT_A_BUSINESS_SCENE_0_0_1: SceneSpec = {
  schema: 'loop.scene/v1',
  id: 'pact-a-personal-agent-at-a-business',
  version: '0.0.1',
  name: 'A Personal Agent at a Business',
  description:
    'Ada’s Travel Desk asks an airline about her flight, and she allows it to read her bookings, not to change them.',
  tags: ['stage', 'pact'],
  icon: 'people',
  emoji: '✈️',
  kind: 'scripted',
  team: '',
  entry: '',
  cast: [],
  setting: {
    systems: [],
    period: '',
    language: '',
    assumes: '',
  },
  script: [],
  stage: {
    positions: {},
    opensFirst: '',
    transcript: {
      tools: true,
      narration: true,
    },
    inspectors: [],
    restsAfter: '',
    pace: 'steady',
    backdrop: 'studio',
  },
  audience: {
    who: 'signed-in',
    ceilingPerAsk: 0.0,
    asksADay: 0,
  },
  rehearsal: {
    beats: [],
    within: '',
    verified: {
      live: [],
      recorded: [],
      unverified: [],
    },
  },
  deployment: {
    account: '',
    page: '',
    addresses: {},
  },
  actors: [
    {
      id: 'ada',
      name: 'Ada',
      face: '🧑',
      is: 'the person',
    },
    {
      id: 'agent',
      name: 'Travel Desk',
      face: '🤖',
      is: 'an application on Datalayer, working for Ada',
    },
    {
      id: 'air',
      name: 'Example Air Support',
      face: '🛫',
      is: 'a business, at air.examples.datalayer.run',
    },
  ],
  lines: [
    {
      from: 'ada',
      to: 'agent',
      says: '“When is my flight?”',
      how: '',
    },
    {
      from: 'agent',
      to: '',
      says: 'Finds Example Air Support by its domain and checks who answers for it.',
      card: {
        kind: 'found',
        title: 'Example Air Support',
        rows: [
          ['Its domain', 'air.examples.datalayer.run'],
          ['Answered for it by', 'Example Provider'],
          ['How a person signs in', 'With a code, on the airline’s page'],
          [
            'It may ask',
            'See your bookings and their status · Change the date of a booking',
          ],
        ],
        lines: [],
      },
      how: 'The application reads the card the business publishes for agents, at its own domain.',
    },
    {
      from: 'agent',
      to: 'air',
      says: 'Asks the airline’s agent about Ada’s bookings, as Travel Desk.',
      how: 'Each request says which application asks, signed by Datalayer; nobody is signed in yet.',
    },
    {
      from: 'air',
      to: 'agent',
      says: '“Happy to help. Please sign in so I can see your bookings.”',
      how: 'The business asks for a sign-in and names what it may ask for.',
    },
    {
      from: 'agent',
      to: 'ada',
      says: 'Asks Ada to sign in at Example Air, on the airline’s own page.',
      card: {
        kind: 'sign-in',
        title: 'Sign in at Example Air',
        rows: [],
        lines: [
          'Travel Desk asks for: See your bookings and their status; Change the date of a booking.',
          'You sign in on the airline’s page, and choose what it may do there.',
          'You can allow fewer permissions than it asks for.',
        ],
      },
      how: '',
      turn: {
        yes: 'Sign in, and allow only “See your bookings”',
        no: '',
        declined: '',
      },
    },
    {
      from: 'ada',
      to: 'air',
      says: 'Signs in on the airline’s page and allows “See your bookings and their status” only.',
      how: 'The airline gives Travel Desk a permission of its own, for Ada and for this application only; Datalayer keeps it, out of the agent’s reach.',
    },
    {
      from: 'air',
      to: 'agent',
      says: '“Your booking AB123 flies on 2026-11-02.”',
      how: 'The airline signs a receipt of what it did with the permission.',
    },
    {
      from: 'agent',
      to: 'ada',
      says: '“Your flight, booking AB123, is on 2 November 2026.”',
      how: '',
    },
    {
      from: 'agent',
      to: '',
      says: 'Keeps the airline’s receipt with its record, for Ada and for whoever built it.',
      card: {
        kind: 'record',
        title: 'Activity',
        rows: [
          ['Signed in at', 'Example Air, for Ada'],
          ['Allowed', 'See your bookings and their status'],
          ['Receipt', 'Looked up booking AB123, signed by the airline'],
        ],
        lines: [],
      },
      how: 'Ada sees the permission under In your name, and ends it there with Disconnect.',
    },
  ],
  live: 'Working with a business over PACT is built in the Studio and its services; asking a business through Datalayer waits for them to be shipped.',
  setup: [],
};

export const PAP_A_PERSON_AND_A_COMPANY_SCENE_0_0_1: SceneSpec = {
  schema: 'loop.scene/v1',
  id: 'pap-a-person-and-a-company',
  version: '0.0.1',
  name: 'A Person and a Company',
  description:
    'Ada’s agent asks a shop about her order, and she signs in at the shop itself.',
  tags: ['stage', 'pap', 'slice-1'],
  icon: 'people',
  emoji: '🧥',
  kind: 'scripted',
  team: '',
  entry: '',
  cast: [],
  setting: {
    systems: [],
    period: '',
    language: '',
    assumes: '',
  },
  script: [],
  stage: {
    positions: {},
    opensFirst: '',
    transcript: {
      tools: true,
      narration: true,
    },
    inspectors: [],
    restsAfter: '',
    pace: 'steady',
    backdrop: 'studio',
  },
  audience: {
    who: 'signed-in',
    ceilingPerAsk: 0.0,
    asksADay: 0,
  },
  rehearsal: {
    beats: [],
    within: '',
    verified: {
      live: [],
      recorded: [],
      unverified: [],
    },
  },
  deployment: {
    account: '',
    page: '',
    addresses: {},
  },
  actors: [
    {
      id: 'ada',
      name: 'Ada',
      face: '🧑',
      is: 'the person',
    },
    {
      id: 'agent',
      name: 'Her agent',
      face: '🤖',
      is: 'an application on Datalayer, working for Ada',
    },
    {
      id: 'manzanita',
      name: 'Manzanita Outfitters',
      face: '🧥',
      is: 'a company, at manzanita.example',
    },
  ],
  lines: [
    {
      from: 'ada',
      to: 'agent',
      says: '“Has my Ridge Jacket from Manzanita arrived?”',
      how: '',
    },
    {
      from: 'agent',
      to: '',
      says: 'Finds Manzanita Outfitters by its domain and checks it is who it says.',
      card: {
        kind: 'found',
        title: 'Manzanita Outfitters',
        rows: [
          ['Its domain', 'manzanita.example'],
          ['Signs its sign-ins as', 'manzanita.example'],
          ['How a person signs in', 'With a code, or in a protected form'],
          ['It offers', 'See your orders · Exchange and return items'],
        ],
        lines: [],
      },
      how: 'The agent reads the page every company publishes for personal agents and checks that the domain and who signs its sign-ins belong together.',
    },
    {
      from: 'agent',
      to: 'manzanita',
      says: 'Asks, before anybody signed in: “Where is Ada’s Ridge Jacket order?”',
      how: 'A conversation starts with the company’s own agent; nobody is signed in yet, so it answers only what anybody may ask.',
    },
    {
      from: 'manzanita',
      to: 'agent',
      says: '“I can look that up once you sign in to your Manzanita account.”',
      how: 'The company asks for a sign-in and names what it needs: See your orders.',
    },
    {
      from: 'agent',
      to: 'ada',
      says: 'Asks Ada to sign in at Manzanita, on Manzanita’s own page.',
      card: {
        kind: 'sign-in',
        title: 'Sign in at Manzanita Outfitters',
        rows: [],
        lines: [
          'Your agent asks to see your orders.',
          'You sign in on manzanita.example: your agent never sees your password.',
          'You can keep fewer permissions than it asks for.',
        ],
      },
      how: '',
      turn: {
        yes: 'Sign in at Manzanita',
        no: '',
        declined: '',
      },
    },
    {
      from: 'ada',
      to: 'manzanita',
      says: 'Signs in on Manzanita’s page and allows “See your orders”.',
      how: 'The company gives the agent a sign-in of its own, for Ada and for this agent only; Datalayer keeps it, out of the agent’s reach.',
    },
    {
      from: 'manzanita',
      to: 'agent',
      says: '“Your order ord_7Hk2: Ridge Jacket, size M, delivered.”',
      how: '',
    },
    {
      from: 'agent',
      to: 'ada',
      says: '“Yes: your Ridge Jacket, size M, was delivered.”',
      how: '',
    },
    {
      from: 'agent',
      to: '',
      says: 'Keeps a record of what it did, for Ada and for whoever built it.',
      card: {
        kind: 'record',
        title: 'Activity',
        rows: [
          ['Signed in at', 'Manzanita Outfitters, for Ada'],
          ['Allowed', 'See your orders'],
          ['Read', 'Order ord_7Hk2'],
        ],
        lines: [],
      },
      how: 'Ada sees it under In your name, and ends it there with Disconnect.',
    },
  ],
  live: 'Connecting an application to a company is built in the Studio (its Connections card); signing in at a company through Datalayer waits for the services to be shipped.',
  setup: [],
};

export const PAP_APPROVE_ONCE_SCENE_0_0_1: SceneSpec = {
  schema: 'loop.scene/v1',
  id: 'pap-approve-once',
  version: '0.0.1',
  name: 'A Change, Approved Once',
  description:
    'The shop proposes an exchange; Ada approves its exact terms, and it is done once.',
  tags: ['stage', 'pap', 'slice-2'],
  icon: 'people',
  emoji: '🔁',
  kind: 'scripted',
  team: '',
  entry: '',
  cast: [],
  setting: {
    systems: [],
    period: '',
    language: '',
    assumes: '',
  },
  script: [],
  stage: {
    positions: {},
    opensFirst: '',
    transcript: {
      tools: true,
      narration: true,
    },
    inspectors: [],
    restsAfter: '',
    pace: 'steady',
    backdrop: 'studio',
  },
  audience: {
    who: 'signed-in',
    ceilingPerAsk: 0.0,
    asksADay: 0,
  },
  rehearsal: {
    beats: [],
    within: '',
    verified: {
      live: [],
      recorded: [],
      unverified: [],
    },
  },
  deployment: {
    account: '',
    page: '',
    addresses: {},
  },
  actors: [
    {
      id: 'ada',
      name: 'Ada',
      face: '🧑',
      is: 'the person',
    },
    {
      id: 'agent',
      name: 'Her agent',
      face: '🤖',
      is: 'an application on Datalayer, working for Ada',
    },
    {
      id: 'manzanita',
      name: 'Manzanita Outfitters',
      face: '🧥',
      is: 'a company, at manzanita.example',
    },
  ],
  lines: [
    {
      from: 'ada',
      to: 'agent',
      says: '“It is not warm enough: exchange it for the insulated one.”',
      how: '',
    },
    {
      from: 'agent',
      to: 'manzanita',
      says: 'Asks for the exchange, signed in as Ada.',
      how: '',
    },
    {
      from: 'manzanita',
      to: 'agent',
      says: '“The insulated Ridge Jacket is in stock. Here is the exchange.”',
      how: 'The company does not do it yet: it proposes it, with its exact terms and a version.',
    },
    {
      from: 'agent',
      to: 'ada',
      says: 'Its rule says Ask me first: it waits for Ada.',
      card: {
        kind: 'approval',
        title: 'Manzanita Outfitters asks you to confirm',
        rows: [
          ['Order', 'ord_7Hk2'],
          ['Price difference', 'USD 70.00'],
          ['Version', '1'],
        ],
        lines: [
          'Exchange the Ridge Jacket (M) from order ord_7Hk2 for the insulated Ridge Jacket (M), USD 70.00 more.',
        ],
      },
      how: 'The summary is the company’s own sentence, never the model’s; approving version 1 never approves a version 2.',
      turn: {
        yes: 'Approve',
        no: 'Decline',
        declined:
          'Ada declined: her agent tells Manzanita no, and nothing is exchanged.',
      },
    },
    {
      from: 'agent',
      to: 'manzanita',
      says: 'Confirms version 1, exactly as Ada approved it.',
      how: 'Datalayer writes down that it confirms before it does: asked again, it reads the outcome back instead of sending it twice.',
    },
    {
      from: 'manzanita',
      to: 'agent',
      says: '“Exchanged the Ridge Jacket (M) for the insulated Ridge Jacket (M). USD 70.00 charged to the card ending 4242; a return label was emailed.”',
      how: '',
    },
    {
      from: 'agent',
      to: 'ada',
      says: 'Tells Ada what the company says it did, in its words.',
      card: {
        kind: 'done',
        title: 'Done, once',
        rows: [],
        lines: [
          'Exchanged the Ridge Jacket (M) for the insulated Ridge Jacket (M). USD 70.00 charged to the card ending 4242; a return label was emailed.',
        ],
      },
      how: '',
    },
  ],
  live: 'The approval card on Waiting for you is built in the Studio; a company’s exchange approved through Datalayer waits for the services to be shipped.',
  setup: [],
};

export const PAP_TWO_COMPANIES_SCENE_0_0_1: SceneSpec = {
  schema: 'loop.scene/v1',
  id: 'pap-two-companies',
  version: '0.0.1',
  name: 'Two Companies Together',
  description:
    'An accounting firm pays a bill at Ada’s bank, and every payment is Ada’s approval.',
  tags: ['stage', 'pap', 'slice-4'],
  icon: 'people',
  emoji: '🏦',
  kind: 'scripted',
  team: '',
  entry: '',
  cast: [],
  setting: {
    systems: [],
    period: '',
    language: '',
    assumes: '',
  },
  script: [],
  stage: {
    positions: {},
    opensFirst: '',
    transcript: {
      tools: true,
      narration: true,
    },
    inspectors: [],
    restsAfter: '',
    pace: 'steady',
    backdrop: 'studio',
  },
  audience: {
    who: 'signed-in',
    ceilingPerAsk: 0.0,
    asksADay: 0,
  },
  rehearsal: {
    beats: [],
    within: '',
    verified: {
      live: [],
      recorded: [],
      unverified: [],
    },
  },
  deployment: {
    account: '',
    page: '',
    addresses: {},
  },
  actors: [
    {
      id: 'ada',
      name: 'Ada',
      face: '🧑',
      is: 'the person',
    },
    {
      id: 'atlas',
      name: 'Atlas',
      face: '🤖',
      is: 'Ada’s agent',
    },
    {
      id: 'ledgerly',
      name: 'Ledgerly',
      face: '📒',
      is: 'an accounting firm: a company to Ada, an agent at her bank',
    },
    {
      id: 'northwind',
      name: 'Northwind Bank',
      face: '🏦',
      is: 'Ada’s bank',
    },
  ],
  lines: [
    {
      from: 'ada',
      to: 'atlas',
      says: '“Ask Ledgerly to pay invoice INV-0042.”',
      how: '',
    },
    {
      from: 'atlas',
      to: 'ledgerly',
      says: 'Asks Ledgerly, signed in as Ada.',
      how: 'To Atlas, Ledgerly is a company like any other.',
    },
    {
      from: 'ledgerly',
      to: 'ada',
      says: 'Needs Ada’s Northwind account first: Ada approves Ledgerly on Northwind’s own page.',
      card: {
        kind: 'sign-in',
        title: 'Let Ledgerly connect to your Northwind account',
        rows: [],
        lines: [
          'On northwind.example, with a code Ledgerly shows you: Ledgerly never sees your bank password.',
        ],
      },
      how: 'To Northwind, Ledgerly is a personal agent acting for Ada, with an identity of its own.',
      turn: {
        yes: 'Approve at Northwind',
        no: '',
        declined: '',
      },
    },
    {
      from: 'northwind',
      to: 'ledgerly',
      says: '“Ready to pay INV-0042.”',
      how: 'The bank proposes the payment; it does not make it yet.',
    },
    {
      from: 'ledgerly',
      to: 'ada',
      says: 'Passes the bank’s proposal on, quoting it as written.',
      card: {
        kind: 'approval',
        title: 'Ledgerly asks you to confirm',
        rows: [
          ['Amount', 'EUR 1250.00'],
          ['To', 'Acme GmbH'],
          ['Invoice', 'INV-0042'],
        ],
        lines: [
          'At Northwind Bank: Pay EUR 1250.00 to Acme GmbH for INV-0042 from the current account DE89 3704 0044 0532 0130 00, today. Payments cannot be recalled once sent.',
        ],
      },
      how: '',
      turn: {
        yes: 'Approve',
        no: 'Decline',
        declined:
          'Ada declined: Ledgerly tells the bank no, and nothing is paid.',
      },
    },
    {
      from: 'ledgerly',
      to: 'northwind',
      says: 'Confirms at the bank the exact version Ada approved, as approved by Ada.',
      how: '',
    },
    {
      from: 'northwind',
      to: 'ledgerly',
      says: '“Sent EUR 1250.00 to Acme GmbH for INV-0042 from DE89 3704 0044 0532 0130 00. Bank reference NW-0001.”',
      how: '',
    },
    {
      from: 'ada',
      to: 'atlas',
      says: '“Allow Ledgerly to pay Acme without asking, within limits.”',
      how: '',
    },
    {
      from: 'ledgerly',
      to: 'ada',
      says: 'Even a permission given in advance is something Ada approves.',
      card: {
        kind: 'approval',
        title: 'Ledgerly asks you to confirm',
        rows: [
          ['Up to', 'EUR 2000.00 each'],
          ['At most', '5 payments'],
          ['For', '30 days'],
        ],
        lines: [
          'Let Ledgerly pay Acme GmbH from your Northwind account without asking, up to EUR 2000.00 each, at most 5 payments, for 30 days.',
        ],
      },
      how: '',
      turn: {
        yes: 'Approve',
        no: 'Decline',
        declined: 'Ada declined: Ledgerly asks her again for every payment.',
      },
    },
    {
      from: 'ledgerly',
      to: 'ada',
      says: 'INV-0043, EUR 980.00, is within the limits: Ledgerly pays it and tells Ada what was done.',
      how: 'Approved in advance: the bank is told it was, never that Ada approved this one.',
    },
    {
      from: 'ledgerly',
      to: 'ada',
      says: 'INV-0044, EUR 3400.00, is beyond them: Ledgerly asks Ada again.',
      card: {
        kind: 'done',
        title: 'Within limits, done; beyond them, asked',
        rows: [],
        lines: [
          'INV-0043 paid under your permission (1 of 5 used).',
          'INV-0044 waits for your approval.',
        ],
      },
      how: '',
    },
  ],
  live: 'Two companies working together is the open-source SDK’s demonstration; on Datalayer it waits for both roles to be shipped.',
  setup: [],
};

export const PAP_YOUR_APPLICATION_A_COMPANY_SCENE_0_0_1: SceneSpec = {
  schema: 'loop.scene/v1',
  id: 'pap-your-application-a-company',
  version: '0.0.1',
  name: 'Your Application, a Company',
  description:
    'An application built in the Studio answers people’s own agents as a company does.',
  tags: ['stage', 'pap', 'slice-3'],
  icon: 'people',
  emoji: '🏪',
  kind: 'scripted',
  team: '',
  entry: '',
  cast: [],
  setting: {
    systems: [],
    period: '',
    language: '',
    assumes: '',
  },
  script: [],
  stage: {
    positions: {},
    opensFirst: '',
    transcript: {
      tools: true,
      narration: true,
    },
    inspectors: [],
    restsAfter: '',
    pace: 'steady',
    backdrop: 'studio',
  },
  audience: {
    who: 'signed-in',
    ceilingPerAsk: 0.0,
    asksADay: 0,
  },
  rehearsal: {
    beats: [],
    within: '',
    verified: {
      live: [],
      recorded: [],
      unverified: [],
    },
  },
  deployment: {
    account: '',
    page: '',
    addresses: {},
  },
  actors: [
    {
      id: 'maker',
      name: 'Maker',
      face: '🛠️',
      is: 'who builds the application',
    },
    {
      id: 'app',
      name: 'Exchange desk',
      face: '🏪',
      is: 'an application on Datalayer',
    },
    {
      id: 'visitor-agent',
      name: 'Sam’s agent',
      face: '🤖',
      is: 'somebody’s personal agent',
    },
    {
      id: 'sam',
      name: 'Sam',
      face: '🧑',
      is: 'a customer',
    },
  ],
  lines: [
    {
      from: 'maker',
      to: 'app',
      says: 'Turns on Lets personal agents work with it, offers orders:read and orders:write, and names what it does once a person confirms: orders.exchange.',
      card: {
        kind: 'found',
        title: 'What becomes public at Ship',
        rows: [],
        lines: [
          'Its own domain, exchange-desk.apps.datalayer.ai, with the page personal agents read first.',
          'How personal agents reach it: its agent, its API and its server for agents.',
          'What changes something is proposed to the person and done only with their approval.',
        ],
      },
      how: '',
    },
    {
      from: 'visitor-agent',
      to: 'app',
      says: 'Finds Exchange desk by its domain and asks, before Sam signed in: “Do you exchange jackets?”',
      how: 'The application answers what anybody may ask, as its Maker allowed.',
    },
    {
      from: 'app',
      to: 'visitor-agent',
      says: '“Yes. Sign in to see your orders.”',
      how: '',
    },
    {
      from: 'visitor-agent',
      to: 'sam',
      says: 'Asks Sam to sign in at Exchange desk, with his Datalayer account.',
      card: {
        kind: 'sign-in',
        title: 'Sign in at Exchange desk',
        rows: [],
        lines: [
          'With your Datalayer account, on Datalayer’s page: the agent never sees your password.',
        ],
      },
      how: '',
      turn: {
        yes: 'Sign in with Datalayer',
        no: '',
        declined: '',
      },
    },
    {
      from: 'app',
      to: 'visitor-agent',
      says: 'Proposes the exchange in the Maker’s own words: “Exchange order ord_7Hk2 for size L.”',
      card: {
        kind: 'approval',
        title: 'Exchange desk asks you to confirm',
        rows: [
          ['Order', 'ord_7Hk2'],
          ['Size', 'L'],
          ['Version', '1'],
        ],
        lines: ['Exchange order ord_7Hk2 for size L.'],
      },
      how: 'The model gives the terms; the sentence is the Maker’s, written once in the Studio.',
      turn: {
        yes: 'Approve',
        no: 'Decline',
        declined: 'Sam declined: Exchange desk does nothing.',
      },
    },
    {
      from: 'app',
      to: '',
      says: 'Does it once, with its own code, with exactly the terms Sam approved.',
      card: {
        kind: 'record',
        title: 'Activity of Exchange desk',
        rows: [
          ['Personal agent', 'Sam’s agent'],
          ['Proposed', 'orders.exchange, version 1'],
          ['Approved by', 'Sam'],
          ['Done', 'Once'],
        ],
        lines: [],
      },
      how: '',
    },
  ],
  live: 'The Studio’s card to make an application a company is built; its own domain and the company answering on Datalayer wait for the services to be shipped.',
  setup: [],
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
  kind: 'team',
  team: 'sales-and-accounting:0.0.2',
  entry: 'sales',
  cast: [
    {
      member: 'sales',
      app: 'sales:0.0.3',
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
      app: 'accounting:0.0.2',
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
    backdrop: 'hero',
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
    recording: {
      path: 'sales-and-accounting/recording.json',
      taken: '2026-10-29',
      note: 'Rehearsed on Datalayer, under the demo account.',
    },
    verified: {
      live: [
        "Sales asked Accounting live over A2A on a developer's machine (2026-10-06) for the open customer invoices: Accounting read the aged receivables and said the list of invoices had failed; one column total was wrong.",
      ],
      recorded: [],
      unverified: [
        'The rehearsal has not been played as a set: the scene is not Live yet.',
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
  actors: [],
  lines: [],
  live: '',
  setup: [
    "The agent 'worker-sales-pipeline-board-report:0.0.1' is not enabled.",
    "The agent 'worker-accountant:0.0.1' is not enabled.",
    "The MCP server 'odoo-accounting:0.0.1' is not enabled.",
  ],
  played: {
    at: '2026-10-29T14:00:28+00:00',
    where: 'on Datalayer',
    passed: true,
    says: 'Rehearsal: 4 of 4 beats passed. The scene is Live.',
    beats: [
      {
        beat: 'open-invoices',
        state: 'passed',
        says: '',
        seconds: 22.688269627997215,
      },
      {
        beat: 'aged-receivables',
        state: 'passed',
        says: '',
        seconds: 21.642744607997884,
      },
      {
        beat: 'largest-balance',
        state: 'passed',
        says: '',
        seconds: 26.706618044998322,
      },
      {
        beat: 'payment-reminders',
        state: 'passed',
        says: '',
        seconds: 19.099125767999794,
      },
    ],
    runtime: '1.5.80',
  },
};

export const UCP_A_PURCHASE_APPROVED_SCENE_0_0_1: SceneSpec = {
  schema: 'loop.scene/v1',
  id: 'ucp-a-purchase-approved',
  version: '0.0.1',
  name: 'A Purchase, Approved',
  description:
    'Ada’s Shopping Desk fills a basket at a test shop, and buys only once she approves the exact purchase.',
  tags: ['stage', 'ucp', 'commerce'],
  icon: 'people',
  emoji: '🛍️',
  kind: 'scripted',
  team: '',
  entry: '',
  cast: [],
  setting: {
    systems: [],
    period: '',
    language: '',
    assumes: '',
  },
  script: [],
  stage: {
    positions: {},
    opensFirst: '',
    transcript: {
      tools: true,
      narration: true,
    },
    inspectors: [],
    restsAfter: '',
    pace: 'steady',
    backdrop: 'studio',
  },
  audience: {
    who: 'signed-in',
    ceilingPerAsk: 0.0,
    asksADay: 0,
  },
  rehearsal: {
    beats: [],
    within: '',
    verified: {
      live: [],
      recorded: [],
      unverified: [],
    },
  },
  deployment: {
    account: '',
    page: '',
    addresses: {},
  },
  actors: [
    {
      id: 'ada',
      name: 'Ada',
      face: '🧑',
      is: 'the person',
    },
    {
      id: 'agent',
      name: 'Shopping Desk',
      face: '🤖',
      is: 'an application on Datalayer, shopping for Ada',
    },
    {
      id: 'store',
      name: 'Example Store',
      face: '🍵',
      is: 'a test shop, at store.examples.datalayer.run',
    },
  ],
  lines: [
    {
      from: 'ada',
      to: 'agent',
      says: '“Buy me a stoneware mug.”',
      how: '',
    },
    {
      from: 'agent',
      to: 'store',
      says: 'Searches the shop for a mug.',
      how: 'The application reads the page every shop publishes for agents, then its catalogue; reading changes nothing, so its rule lets it do it.',
    },
    {
      from: 'store',
      to: 'agent',
      says: '“Stoneware mug: USD 24.00.”',
      how: '',
    },
    {
      from: 'agent',
      to: 'store',
      says: 'Fills a checkout with one stoneware mug, for Ada.',
      how: 'A checkout the shop can cancel; nothing is bought yet.',
    },
    {
      from: 'store',
      to: 'agent',
      says: '“Your checkout is ready to complete.”',
      how: '',
    },
    {
      from: 'agent',
      to: 'ada',
      says: 'Every purchase is asked first, whatever its rule says: it waits for Ada.',
      card: {
        kind: 'approval',
        title: 'Shopping Desk asks you to approve a purchase',
        rows: [
          ['Shop', 'Example Store'],
          ['What', 'Stoneware mug × 1'],
          ['Tax', 'USD 1.92'],
          ['Total', 'USD 25.92'],
          ['The most one purchase may cost', 'USD 50.00'],
        ],
        lines: ['Buy 1 Stoneware mug at Example Store for USD 25.92.'],
      },
      how: 'The purchase is the shop’s own checkout, read again before it is shown; approving this one never approves a changed basket.',
      turn: {
        yes: 'Approve',
        no: 'Decline',
        declined:
          'Ada declined: the checkout is cancelled, and nothing is bought.',
      },
    },
    {
      from: 'agent',
      to: 'store',
      says: 'Completes the checkout, exactly as Ada approved it, with a test payment.',
      how: 'Datalayer writes down that it buys before it does: asked again, it reads the order back instead of paying twice. No card is ever in the conversation.',
    },
    {
      from: 'store',
      to: 'agent',
      says: '“Your order is placed.”',
      how: '',
    },
    {
      from: 'agent',
      to: 'ada',
      says: 'Tells Ada what the shop says it did.',
      card: {
        kind: 'done',
        title: 'Bought, once',
        rows: [],
        lines: ['1 Stoneware mug, USD 25.92, at Example Store.'],
      },
      how: '',
    },
    {
      from: 'agent',
      to: '',
      says: 'Keeps a record of the purchase, for Ada and for whoever built it.',
      card: {
        kind: 'record',
        title: 'Activity',
        rows: [
          ['Bought at', 'Example Store, for Ada'],
          ['Amount', 'USD 25.92'],
          ['Approved by', 'Ada, once'],
        ],
        lines: [],
      },
      how: 'The purchase shows in the application’s Activity with its amount.',
    },
  ],
  live: 'Buying at a test shop is built in the Studio and its services, always asked first, under a limit, with no real payment; the test shops answering on Datalayer wait for them to be shipped.',
  setup: [],
};

export const SCENE_CATALOGUE: Record<string, SceneSpec> = {
  'coding-agent-behind-the-shield': CODING_AGENT_BEHIND_THE_SHIELD_SCENE_0_0_1,
  'crop-monitoring': CROP_MONITORING_SCENE_0_0_1,
  'disaster-assessment': DISASTER_ASSESSMENT_SCENE_0_0_1,
  'month-end-close': MONTH_END_CLOSE_SCENE_0_0_1,
  'pact-a-personal-agent-at-a-business':
    PACT_A_PERSONAL_AGENT_AT_A_BUSINESS_SCENE_0_0_1,
  'pap-a-person-and-a-company': PAP_A_PERSON_AND_A_COMPANY_SCENE_0_0_1,
  'pap-approve-once': PAP_APPROVE_ONCE_SCENE_0_0_1,
  'pap-two-companies': PAP_TWO_COMPANIES_SCENE_0_0_1,
  'pap-your-application-a-company': PAP_YOUR_APPLICATION_A_COMPANY_SCENE_0_0_1,
  'sales-and-accounting': SALES_AND_ACCOUNTING_SCENE_0_0_1,
  'ucp-a-purchase-approved': UCP_A_PURCHASE_APPROVED_SCENE_0_0_1,
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
