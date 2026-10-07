/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The scene spec's JSON Schema (`loop.scene/v1`), generated from agentspecs by
 * `scripts/codegen/generate_scenes.py`. Do not edit.
 *
 * @module specs/sceneSchema
 */

import type { JsonSchema } from './appspecSchema';

export const SCENE_SCHEMA: JsonSchema = {
  $defs: {
    ActionClass: {
      description: 'What a tool does to the world.',
      enum: ['read', 'write', 'send', 'buy', 'delete', 'publish'],
      title: 'ActionClass',
      type: 'string',
    },
    AnswerKind: {
      description: 'What kind of answer comes back, and what the page shows.',
      enum: ['words', 'table', 'chart', 'notebook', 'map', 'file', 'image'],
      title: 'AnswerKind',
      type: 'string',
    },
    AppVerified: {
      additionalProperties: false,
      description:
        'What was verified, and how, each in a sentence a person reads (LOOP E-14).\n\nAn example says it on its card and on its page: what was tried live,\nwhat runs on recorded data instead, and what is not verified yet. Said\nby whoever tried it; nothing here is computed.',
      properties: {
        live: {
          description: 'What was tried live, where and when',
          items: {
            type: 'string',
          },
          title: 'Live',
          type: 'array',
        },
        recorded: {
          description: 'What runs on recorded data, not on live calls',
          items: {
            type: 'string',
          },
          title: 'Recorded',
          type: 'array',
        },
        unverified: {
          description: 'What is not verified yet',
          items: {
            type: 'string',
          },
          title: 'Unverified',
          type: 'array',
        },
      },
      title: 'AppVerified',
      type: 'object',
    },
    Inspector: {
      description: 'The inspectors a page may offer under a scene.',
      enum: ['agent', 'tools', 'a2a', 'notebook', 'cost'],
      title: 'Inspector',
      type: 'string',
    },
    Pace: {
      description: 'How fast a beat plays for the audience.',
      enum: ['quick', 'steady', 'slow'],
      title: 'Pace',
      type: 'string',
    },
    RehearsalBeat: {
      additionalProperties: false,
      description: "What a beat's transcript must look like.",
      properties: {
        beat: {
          description: 'The beat, by id',
          title: 'Beat',
          type: 'string',
        },
        lines: {
          description:
            'The shape, in order: `Sales → Accounting`, `Accounting → Odoo: odoo_accounting_*`, `Accounting: a table`',
          items: {
            type: 'string',
          },
          title: 'Lines',
          type: 'array',
        },
        must_say: {
          description: 'Words that must appear',
          items: {
            type: 'string',
          },
          title: 'Must Say',
          type: 'array',
        },
        must_not_say: {
          description: 'Words that must not',
          items: {
            type: 'string',
          },
          title: 'Must Not Say',
          type: 'array',
        },
        within: {
          default: '',
          description: 'The time the beat may take',
          pattern: '^(?:[1-9]\\d*(?:ms|s|m|h))?$',
          title: 'Within',
          type: 'string',
        },
      },
      required: ['beat'],
      title: 'RehearsalBeat',
      type: 'object',
    },
    SceneAudience: {
      additionalProperties: false,
      description: 'Who may watch and ask, and what an ask may cost.',
      properties: {
        who: {
          $ref: '#/$defs/Watchers',
          default: 'signed-in',
          description: '`visitors`, `signed-in`, or `nobody`',
        },
        ceiling_per_ask: {
          default: 0,
          description: "What one ask may cost, in USD; the site's when 0",
          minimum: 0,
          title: 'Ceiling Per Ask',
          type: 'number',
        },
        asks_a_day: {
          default: 0,
          description: "How many asks a visitor gets a day; the site's when 0",
          minimum: 0,
          title: 'Asks A Day',
          type: 'integer',
        },
      },
      title: 'SceneAudience',
      type: 'object',
    },
    SceneBeat: {
      additionalProperties: false,
      description: 'One beat of the script.',
      properties: {
        id: {
          description: 'Its id: what the rehearsal and a branch name',
          title: 'Id',
          type: 'string',
        },
        cue: {
          $ref: '#/$defs/SceneCue',
          description: 'What starts it',
        },
        narration: {
          default: '',
          description: 'One line for the audience, read in the transcript',
          title: 'Narration',
          type: 'string',
        },
        moves: {
          description: 'Who asks whom over what, in order',
          items: {
            $ref: '#/$defs/SceneMove',
          },
          title: 'Moves',
          type: 'array',
        },
        expect: {
          description: 'What should happen, in words',
          title: 'Expect',
          type: 'string',
        },
        shows: {
          description:
            'What the page shows: the answers to the audience when unsaid',
          items: {
            $ref: '#/$defs/AnswerKind',
          },
          title: 'Shows',
          type: 'array',
        },
        pace: {
          anyOf: [
            {
              $ref: '#/$defs/Pace',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: "Its pace; the stage's when unsaid",
        },
        branch: {
          description: 'What it does instead, on a decision',
          items: {
            $ref: '#/$defs/SceneBranch',
          },
          title: 'Branch',
          type: 'array',
        },
      },
      required: ['id', 'cue', 'expect'],
      title: 'SceneBeat',
      type: 'object',
    },
    SceneBranch: {
      additionalProperties: false,
      description: 'What a beat does instead when a decision holds.',
      properties: {
        decision: {
          description: 'When, in words: *the books hold no open invoice*',
          title: 'Decision',
          type: 'string',
        },
        expect: {
          default: '',
          description: 'What happens then, in words',
          title: 'Expect',
          type: 'string',
        },
        moves: {
          description: 'The moves then, when they differ',
          items: {
            $ref: '#/$defs/SceneMove',
          },
          title: 'Moves',
          type: 'array',
        },
        then: {
          default: '',
          description:
            'The beat that follows, by id, when the script goes on elsewhere',
          title: 'Then',
          type: 'string',
        },
      },
      required: ['decision'],
      title: 'SceneBranch',
      type: 'object',
    },
    SceneCastMember: {
      additionalProperties: false,
      description:
        'A member of the cast.\n\nOn a staged team, it names a member of the team (`member`) and says only\nhow it appears here (`persona`) and what it is for in this scene\n(`brief`). Written inline — a scene with no `team` — it is the member:\nwhat it is (`app`, `ref` or `server`), its `role`, where it `runs_in`\nand whom it `talks_to`, as a team member says them.',
      properties: {
        member: {
          description: 'Its id: in the team, or in this cast',
          title: 'Member',
          type: 'string',
        },
        app: {
          default: '',
          description: 'Inline: the application it is, `id` or `id:version`',
          title: 'App',
          type: 'string',
        },
        ref: {
          default: '',
          description: 'Inline: the agent it is, `id` or `id:version`',
          title: 'Ref',
          type: 'string',
        },
        server: {
          default: '',
          description: 'Inline: the MCP server it is, a system of the scene',
          title: 'Server',
          type: 'string',
        },
        role: {
          anyOf: [
            {
              $ref: '#/$defs/TeamRole',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'Inline: what it is for, structurally',
        },
        runs_in: {
          anyOf: [
            {
              $ref: '#/$defs/TeamPlace',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'Inline: `browser` or `runtime`',
        },
        talks_to: {
          description: 'Inline: whom it asks, and over what',
          items: {
            $ref: '#/$defs/TeamLink',
          },
          title: 'Talks To',
          type: 'array',
        },
        persona: {
          $ref: '#/$defs/ScenePersona',
          description: 'How it appears on stage',
        },
        brief: {
          default: '',
          description:
            "What it is for in this scene, over its application's instructions",
          title: 'Brief',
          type: 'string',
        },
      },
      required: ['member'],
      title: 'SceneCastMember',
      type: 'object',
    },
    SceneCue: {
      additionalProperties: false,
      description:
        'What starts a beat: something the audience says, a schedule, or an event.',
      properties: {
        say: {
          default: '',
          description:
            "An opener the audience may say: the entry's suggestion on the page",
          title: 'Say',
          type: 'string',
        },
        schedule: {
          default: '',
          description: 'A schedule, when the beat starts by itself',
          title: 'Schedule',
          type: 'string',
        },
        event: {
          default: '',
          description: 'An event, when something happening starts it',
          title: 'Event',
          type: 'string',
        },
      },
      title: 'SceneCue',
      type: 'object',
    },
    SceneDeployment: {
      additionalProperties: false,
      description: 'Where the scene plays.',
      properties: {
        account: {
          default: '',
          description: 'Under which account the scene plays: `demo`',
          title: 'Account',
          type: 'string',
        },
        page: {
          default: '',
          description: "The page it plays on: the entry's address",
          title: 'Page',
          type: 'string',
        },
        addresses: {
          additionalProperties: {
            type: 'string',
          },
          description:
            'For each member on a runtime, the variable its address is read from at build',
          title: 'Addresses',
          type: 'object',
        },
      },
      title: 'SceneDeployment',
      type: 'object',
    },
    SceneMove: {
      additionalProperties: false,
      description:
        'One member asking another over a protocol, or answering the audience.',
      properties: {
        who: {
          description: 'The member moving, by its id in the cast',
          title: 'Who',
          type: 'string',
        },
        asks: {
          default: '',
          description:
            'Whom: a member or a system; nobody when it answers the audience',
          title: 'Asks',
          type: 'string',
        },
        over: {
          anyOf: [
            {
              $ref: '#/$defs/TeamProtocol',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: '`a2a` to a member, `mcp` to a system',
        },
        what: {
          default: '',
          description: 'What it asks for, or what it answers, in words',
          title: 'What',
          type: 'string',
        },
        tool: {
          default: '',
          description:
            'Over `mcp`: the tool, by name or pattern (`odoo_accounting_*`)',
          title: 'Tool',
          type: 'string',
        },
        does: {
          anyOf: [
            {
              $ref: '#/$defs/ActionClass',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'The kind of tool: `read`, `write`, …',
        },
        answers: {
          anyOf: [
            {
              $ref: '#/$defs/AnswerKind',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'What kind of answer comes back',
        },
      },
      required: ['who'],
      title: 'SceneMove',
      type: 'object',
    },
    ScenePersona: {
      additionalProperties: false,
      description: 'How a member appears to the audience, in this scene.',
      properties: {
        name: {
          default: '',
          description:
            "The name the audience sees; its application's when unsaid",
          title: 'Name',
          type: 'string',
        },
        face: {
          default: '',
          description: "One emoji; its application's when unsaid",
          title: 'Face',
          type: 'string',
        },
        line: {
          default: '',
          description: 'One line of *who I am here*',
          title: 'Line',
          type: 'string',
        },
      },
      title: 'ScenePersona',
      type: 'object',
    },
    SceneRecording: {
      additionalProperties: false,
      description:
        'A transcript recorded once, played when the scene cannot play live (LOOP H-08).',
      properties: {
        path: {
          description:
            'Its file, beside the scenes: `sales-and-accounting/recording.json`',
          title: 'Path',
          type: 'string',
        },
        taken: {
          default: '',
          description: 'When it was recorded',
          title: 'Taken',
          type: 'string',
        },
        note: {
          default: '',
          description: 'What the audience is told: *recorded on 2026-10-07*',
          title: 'Note',
          type: 'string',
        },
      },
      required: ['path'],
      title: 'SceneRecording',
      type: 'object',
    },
    SceneRehearsal: {
      additionalProperties: false,
      description:
        "The scene's tests: a passing rehearsal is the gallery's *Live*.",
      properties: {
        beats: {
          description: "Each beat's expected shape",
          items: {
            $ref: '#/$defs/RehearsalBeat',
          },
          title: 'Beats',
          type: 'array',
        },
        within: {
          default: '',
          description: 'The time the whole scene may take',
          pattern: '^(?:[1-9]\\d*(?:ms|s|m|h))?$',
          title: 'Within',
          type: 'string',
        },
        recording: {
          anyOf: [
            {
              $ref: '#/$defs/SceneRecording',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'A recording, for when it cannot play live',
        },
        verified: {
          $ref: '#/$defs/AppVerified',
          description:
            'What was verified live, what runs on recorded data, and what is not verified yet',
        },
      },
      title: 'SceneRehearsal',
      type: 'object',
    },
    SceneSetting: {
      additionalProperties: false,
      description: 'The stage: what is on it, and what the audience is told.',
      properties: {
        systems: {
          description: 'The systems the cast reaches',
          items: {
            $ref: '#/$defs/SceneSystem',
          },
          title: 'Systems',
          type: 'array',
        },
        frames: {
          description: "The Frames the scene plays under, over the team's",
          items: {
            type: 'string',
          },
          title: 'Frames',
          type: 'array',
        },
        contents: {
          description: 'The data in play: documents and datasets',
          items: {
            type: 'string',
          },
          title: 'Contents',
          type: 'array',
        },
        period: {
          default: '',
          description: 'When the scene plays, in words: *March 2026*',
          title: 'Period',
          type: 'string',
        },
        language: {
          default: '',
          description: 'The language it plays in, `en`',
          pattern: '^(?:[a-z]{2,3}(?:-[A-Z]{2})?)?$',
          title: 'Language',
          type: 'string',
        },
        assumes: {
          default: '',
          description: 'What the audience is told before it starts, one line',
          title: 'Assumes',
          type: 'string',
        },
      },
      title: 'SceneSetting',
      type: 'object',
    },
    SceneStage: {
      additionalProperties: false,
      description: 'Directions for the page.',
      properties: {
        positions: {
          additionalProperties: {
            $ref: '#/$defs/StagePosition',
          },
          description: 'Where each member stands',
          title: 'Positions',
          type: 'object',
        },
        opens_first: {
          default: '',
          description: "Whose balloon opens first; the entry's when unsaid",
          title: 'Opens First',
          type: 'string',
        },
        transcript: {
          $ref: '#/$defs/SceneTranscript',
          description: 'What the transcript shows',
        },
        inspectors: {
          description: 'The inspectors offered',
          items: {
            $ref: '#/$defs/Inspector',
          },
          title: 'Inspectors',
          type: 'array',
        },
        rests_after: {
          default: '',
          description: 'How long the scene plays before it rests',
          pattern: '^(?:[1-9]\\d*(?:ms|s|m|h))?$',
          title: 'Rests After',
          type: 'string',
        },
        pace: {
          $ref: '#/$defs/Pace',
          default: 'steady',
          description: 'The pace of the beats that say none',
        },
      },
      title: 'SceneStage',
      type: 'object',
    },
    SceneSystem: {
      additionalProperties: false,
      description:
        'A system on stage: an MCP server of the catalogue the cast reaches.',
      properties: {
        server: {
          description: 'An MCP server of the catalogue, `id` or `id:version`',
          title: 'Server',
          type: 'string',
        },
        as: {
          default: '',
          description:
            'The name the audience reads on the graph and in the transcript',
          title: 'As',
          type: 'string',
        },
        holds: {
          default: '',
          description:
            "What it holds in this scene: *Datalayer's own books, March 2026*",
          title: 'Holds',
          type: 'string',
        },
      },
      required: ['server'],
      title: 'SceneSystem',
      type: 'object',
    },
    SceneTranscript: {
      additionalProperties: false,
      description: 'What the transcript shows.',
      properties: {
        tools: {
          default: true,
          description: 'Whether tool lines are shown',
          title: 'Tools',
          type: 'boolean',
        },
        narration: {
          default: true,
          description: "Whether the beats' narration is read in it",
          title: 'Narration',
          type: 'boolean',
        },
        withhold: {
          description: 'Words withheld: credentials, ids, …',
          items: {
            $ref: '#/$defs/Withheld',
          },
          title: 'Withhold',
          type: 'array',
        },
      },
      title: 'SceneTranscript',
      type: 'object',
    },
    StagePosition: {
      additionalProperties: false,
      description:
        'Where a member stands: fractions of the box, left to right and top to bottom.',
      properties: {
        x: {
          maximum: 1,
          minimum: 0,
          title: 'X',
          type: 'number',
        },
        y: {
          maximum: 1,
          minimum: 0,
          title: 'Y',
          type: 'number',
        },
      },
      required: ['x', 'y'],
      title: 'StagePosition',
      type: 'object',
    },
    TeamLink: {
      description:
        'One member asking another, directly, over a protocol.\n\nDistinct from `depends_on`, which orders work: a link says who may ask\nwhom while the work runs, in either order and as often as it needs.',
      properties: {
        member: {
          description: 'The member asked, by its id in this team',
          title: 'Member',
          type: 'string',
        },
        over: {
          $ref: '#/$defs/TeamProtocol',
          default: 'a2a',
          description:
            'The protocol it is asked over: `a2a` to an agent or an application, `mcp` to a server',
        },
      },
      required: ['member'],
      title: 'TeamLink',
      type: 'object',
    },
    TeamPlace: {
      description:
        "Where a member's loop turns.\n\nA team of applications can be split between the person's page and a\nruntime: what reads the person's screen and talks to them turns in their\nbrowser, what reaches a company's systems turns on a runtime, where its\nconnections and its credentials are.",
      enum: ['browser', 'runtime'],
      title: 'TeamPlace',
      type: 'string',
    },
    TeamProtocol: {
      description: 'How one member talks to another.',
      enum: ['a2a', 'mcp'],
      title: 'TeamProtocol',
      type: 'string',
    },
    TeamRole: {
      description:
        'What a member is *for*, structurally.\n\nDeliberately about position in the work rather than about subject matter: a\nteam of analysts and a team of reviewers have the same shape, and a runtime\nscheduling them cares which member opens the work and which closes it, not\nwhat the work is about.',
      enum: [
        'coordinator',
        'initiator',
        'contributor',
        'reviewer',
        'finalizer',
      ],
      title: 'TeamRole',
      type: 'string',
    },
    Watchers: {
      description: 'Who may watch and ask.',
      enum: ['visitors', 'signed-in', 'nobody'],
      title: 'Watchers',
      type: 'string',
    },
    Withheld: {
      description: 'What the transcript does not show.',
      enum: ['credentials', 'ids', 'addresses', 'amounts'],
      title: 'Withheld',
      type: 'string',
    },
  },
  additionalProperties: false,
  description: 'Specification for a scene: a team, staged.',
  properties: {
    schema: {
      description: 'The version of the spec itself',
      title: 'Schema',
      const: 'loop.scene/v1',
      default: 'loop.scene/v1',
    },
    id: {
      description: 'Unique scene identifier',
      title: 'Id',
      type: 'string',
    },
    version: {
      default: '0.0.1',
      description: 'Scene version',
      title: 'Version',
      type: 'string',
    },
    name: {
      description: "Display name: the tab's",
      title: 'Name',
      type: 'string',
    },
    description: {
      default: '',
      description: 'What happens in it, in a sentence',
      title: 'Description',
      type: 'string',
    },
    tags: {
      items: {
        type: 'string',
      },
      title: 'Tags',
      type: 'array',
    },
    icon: {
      default: 'people',
      description: 'Icon identifier',
      title: 'Icon',
      type: 'string',
    },
    emoji: {
      default: '👀',
      description: 'Its face: one emoji, drawn before its name',
      title: 'Emoji',
      type: 'string',
    },
    team: {
      default: '',
      description: 'The team it stages, `id` or `id:version`',
      title: 'Team',
      type: 'string',
    },
    entry: {
      default: '',
      description:
        "The member the audience talks to; the team's entry when unsaid",
      title: 'Entry',
      type: 'string',
    },
    cast: {
      description: 'The cast: personas and briefs, or the members',
      items: {
        $ref: '#/$defs/SceneCastMember',
      },
      title: 'Cast',
      type: 'array',
    },
    setting: {
      $ref: '#/$defs/SceneSetting',
      description: 'The stage',
    },
    script: {
      description: 'The beats, in order',
      items: {
        $ref: '#/$defs/SceneBeat',
      },
      title: 'Script',
      type: 'array',
    },
    stage: {
      $ref: '#/$defs/SceneStage',
      description: 'Directions for the page',
    },
    audience: {
      $ref: '#/$defs/SceneAudience',
      description: 'Who may watch and ask',
    },
    rehearsal: {
      $ref: '#/$defs/SceneRehearsal',
      description: 'Its tests',
    },
    deployment: {
      $ref: '#/$defs/SceneDeployment',
      description: 'Where it plays',
    },
  },
  required: ['id', 'name'],
  title: 'Scene spec',
  type: 'object',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://agentspecs.datalayer.tech/schemas/loop.scene/v1.json',
};
