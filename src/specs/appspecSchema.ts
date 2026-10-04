/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Appspec's JSON Schema, generated from agentspecs by
 * `scripts/codegen/generate_apps.py`. Do not edit.
 *
 * @module specs/appspecSchema
 */

export type JsonSchema = {
  [key: string]: unknown;
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: readonly unknown[];
  anyOf?: readonly JsonSchema[];
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
};

export const APPSPEC_SCHEMA: JsonSchema = {
  $defs: {
    Accent: {
      description:
        'The one colour of an application; everything else is neutral.',
      enum: ['green', 'rose', 'sky', 'lime', 'sun', 'violet'],
      title: 'Accent',
      type: 'string',
    },
    Access: {
      description: 'How far a connection goes.',
      enum: ['read', 'write'],
      title: 'Access',
      type: 'string',
    },
    ActsAs: {
      description: 'In whose name a connection acts.',
      enum: ['owner', 'user'],
      title: 'ActsAs',
      type: 'string',
    },
    AppChecks: {
      additionalProperties: false,
      description:
        'Optional: checks from the catalogue, for a builder who wants them.',
      properties: {
        guards: {
          description: 'Guards, `id` or `id:version`',
          items: {
            type: 'string',
          },
          title: 'Guards',
          type: 'array',
        },
        gates: {
          description: 'Gates, `id` or `id:version`',
          items: {
            type: 'string',
          },
          title: 'Gates',
          type: 'array',
        },
        track: {
          default: '',
          description: 'A Track, `id` or `id:version`',
          title: 'Track',
          type: 'string',
        },
      },
      title: 'AppChecks',
      type: 'object',
    },
    AppComputer: {
      additionalProperties: false,
      description:
        'What the application may do on its own computer. Each is off until it is turned on.',
      properties: {
        browse: {
          default: false,
          description: 'Open pages in a browser',
          title: 'Browse',
          type: 'boolean',
        },
        files: {
          default: false,
          description: 'Read and write files',
          title: 'Files',
          type: 'boolean',
        },
        shell: {
          default: false,
          description: 'Run commands',
          title: 'Shell',
          type: 'boolean',
        },
      },
      title: 'AppComputer',
      type: 'object',
    },
    AppConnection: {
      additionalProperties: false,
      description: 'Something the application reaches.',
      properties: {
        server: {
          description: 'An MCP server of the catalogue, `id` or `id:version`',
          title: 'Server',
          type: 'string',
        },
        access: {
          $ref: '#/$defs/Access',
          default: 'read',
          description: 'How far: `read`, or `write`',
        },
        as: {
          $ref: '#/$defs/ActsAs',
          default: 'owner',
          description:
            "In whose name: `owner` (the builder's account) or `user` (each user's own)",
        },
        only: {
          description:
            'The tools of the server the application may use, by name or pattern (`*gmail*`: `*` is any run of characters, `?` any one); all of them when empty. A tool left out is not reached at all',
          items: {
            type: 'string',
          },
          title: 'Only',
          type: 'array',
        },
      },
      required: ['server'],
      title: 'AppConnection',
      type: 'object',
    },
    AppCriterion: {
      additionalProperties: false,
      description: 'What an alternative is judged on.',
      properties: {
        name: {
          description: 'Its name',
          title: 'Name',
          type: 'string',
        },
        kind: {
          $ref: '#/$defs/CriterionKind',
          default: 'metric',
          description: '`metric`, `noul`, `choice`, `score`',
        },
        weight: {
          default: 1,
          description: 'How much it counts',
          minimum: 0,
          title: 'Weight',
          type: 'number',
        },
        instructions: {
          default: '',
          description:
            'What a judgment model is asked, or how a metric is computed',
          title: 'Instructions',
          type: 'string',
        },
        options: {
          description: 'For a choice or a score: from the worst to the best',
          items: {
            type: 'string',
          },
          title: 'Options',
          type: 'array',
        },
        direction: {
          default: 'higher',
          description: 'Whether more counts for, or against',
          pattern: '^(higher|lower)$',
          title: 'Direction',
          type: 'string',
        },
        measure: {
          default: '',
          description: 'For a metric: what a benchmark run fills it from',
          pattern: '^(|pass_rate|cost_per_task|seconds_per_task)$',
          title: 'Measure',
          type: 'string',
        },
      },
      required: ['name'],
      title: 'AppCriterion',
      type: 'object',
    },
    AppDecision: {
      additionalProperties: false,
      description: 'What a decision application decides.',
      properties: {
        question: {
          description: 'The question it answers',
          title: 'Question',
          type: 'string',
        },
        alternatives: {
          description: 'What is chosen between',
          items: {
            type: 'string',
          },
          title: 'Alternatives',
          type: 'array',
        },
        criteria: {
          description: 'What each is judged on',
          items: {
            $ref: '#/$defs/AppCriterion',
          },
          title: 'Criteria',
          type: 'array',
        },
        min_confidence: {
          default: 0,
          description:
            'A judgment less confident than this is put to the reader',
          maximum: 1,
          minimum: 0,
          title: 'Min Confidence',
          type: 'number',
        },
        scenarios: {
          description: 'Named sets of weights',
          items: {
            $ref: '#/$defs/AppScenario',
          },
          title: 'Scenarios',
          type: 'array',
        },
        judgment_model: {
          default: '',
          description: 'The model that answers the judgments',
          title: 'Judgment Model',
          type: 'string',
        },
      },
      required: ['question'],
      title: 'AppDecision',
      type: 'object',
    },
    AppDeployment: {
      additionalProperties: false,
      description: 'Where the application goes.',
      properties: {
        hosted: {
          anyOf: [
            {
              $ref: '#/$defs/HostedDeployment',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'At an address of its own',
        },
        embedded: {
          anyOf: [
            {
              $ref: '#/$defs/EmbeddedDeployment',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'Inside another product',
        },
      },
      title: 'AppDeployment',
      type: 'object',
    },
    AppInterface: {
      additionalProperties: false,
      description: 'What the user sees.',
      properties: {
        layout: {
          anyOf: [
            {
              $ref: '#/$defs/Layout',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: "`chat`, `page` or `split`; the kind's own when unsaid",
        },
        accent: {
          $ref: '#/$defs/Accent',
          default: 'green',
          description: "The application's one colour",
        },
        welcome: {
          default: '',
          description: 'What the application says first',
          title: 'Welcome',
          type: 'string',
        },
        starters: {
          description: 'First messages offered to the user',
          items: {
            $ref: '#/$defs/AppStarter',
          },
          title: 'Starters',
          type: 'array',
        },
        settings: {
          description: 'What the user may set',
          items: {
            $ref: '#/$defs/AppSetting',
          },
          title: 'Settings',
          type: 'array',
        },
        components: {
          description:
            "The components of the catalog the surface may use; the kind's own when empty",
          items: {
            type: 'string',
          },
          title: 'Components',
          type: 'array',
        },
        surface: {
          anyOf: [
            {
              $ref: '#/$defs/AppSurface',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'The component tree, when there is one',
        },
        assistant: {
          anyOf: [
            {
              $ref: '#/$defs/AssistantCharacter',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            'The character its floating assistant shows: `paperclip`, `wizard`, `cat` or `eyes`. The paper clip when unsaid; a person may choose another in their settings',
        },
      },
      title: 'AppInterface',
      type: 'object',
    },
    AppKind: {
      description: 'What kind of application it is: what its user meets.',
      enum: ['chat', 'widget', 'decision', 'worker'],
      title: 'AppKind',
      type: 'string',
    },
    AppPermissions: {
      additionalProperties: false,
      description:
        'What the application may reach beside its connections. Nothing, unless said.',
      properties: {
        spaces: {
          description: 'The Spaces it reads or writes',
          items: {
            $ref: '#/$defs/AppSpaceGrant',
          },
          title: 'Spaces',
          type: 'array',
        },
        computer: {
          $ref: '#/$defs/AppComputer',
          description: 'Its computer: browse, files, shell',
        },
      },
      title: 'AppPermissions',
      type: 'object',
    },
    AppRecord: {
      additionalProperties: false,
      description:
        'What is kept of what the application did, and for how long.',
      properties: {
        keep_for: {
          default: '1_years',
          description: 'How long: `90_days`, `18_months`, `1_years`',
          title: 'Keep For',
          type: 'string',
        },
        include: {
          description: 'What is kept',
          items: {
            $ref: '#/$defs/RecordItem',
          },
          title: 'Include',
          type: 'array',
        },
        suggest_tests: {
          default: false,
          description:
            'Whether its conversations may be used to suggest tests: a few, sampled from those kept while it is on, proposed to its builder; off unless said',
          title: 'Suggest Tests',
          type: 'boolean',
        },
      },
      title: 'AppRecord',
      type: 'object',
    },
    AppRule: {
      additionalProperties: false,
      description: 'When the application acts alone, and when it asks.',
      properties: {
        action: {
          description:
            'The action, in the words a person reads: `Send an email`',
          title: 'Action',
          type: 'string',
        },
        applies_to: {
          anyOf: [
            {
              type: 'string',
            },
            {
              items: {
                type: 'string',
              },
              type: 'array',
            },
          ],
          description:
            'What the rule applies to: a class of action (`read`, `write`, `send`, `buy`, `delete`, `publish`), or named tools (`server.tool`, or a tool id)',
          title: 'Applies To',
        },
        behaviour: {
          $ref: '#/$defs/Behaviour',
          description: '`do_it`, `if_asked`, `ask_first` or `leave_to_me`',
        },
      },
      required: ['action', 'applies_to', 'behaviour'],
      title: 'AppRule',
      type: 'object',
    },
    AppScenario: {
      additionalProperties: false,
      description:
        'A named set of weights: one way of looking at the same findings.',
      properties: {
        name: {
          description: 'Its name',
          title: 'Name',
          type: 'string',
        },
        weights: {
          additionalProperties: {
            type: 'number',
          },
          description: 'By criterion name',
          title: 'Weights',
          type: 'object',
        },
      },
      required: ['name'],
      title: 'AppScenario',
      type: 'object',
    },
    AppSetting: {
      additionalProperties: false,
      description: 'Something the user may set for their session.',
      properties: {
        id: {
          description: 'The name the application reads it by',
          title: 'Id',
          type: 'string',
        },
        type: {
          $ref: '#/$defs/SettingType',
          description: '`select`, `text`, `toggle`, `slider` or `number`',
        },
        label: {
          description: 'What the user reads',
          title: 'Label',
          type: 'string',
        },
        options: {
          description: 'For a select: its options',
          items: {
            type: 'string',
          },
          title: 'Options',
          type: 'array',
        },
        default: {
          anyOf: [
            {
              type: 'string',
            },
            {
              type: 'boolean',
            },
            {
              type: 'number',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'Its value at the start',
          title: 'Default',
        },
        min: {
          anyOf: [
            {
              type: 'number',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'For a slider or a number: the least',
          title: 'Min',
        },
        max: {
          anyOf: [
            {
              type: 'number',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'For a slider or a number: the most',
          title: 'Max',
        },
      },
      required: ['id', 'type', 'label'],
      title: 'AppSetting',
      type: 'object',
    },
    AppSpaceGrant: {
      additionalProperties: false,
      description: 'A Space the application may reach.',
      properties: {
        space: {
          description: 'The Space, by its handle or its id',
          title: 'Space',
          type: 'string',
        },
        access: {
          $ref: '#/$defs/Access',
          default: 'read',
          description: '`read`, or `write`',
        },
      },
      required: ['space'],
      title: 'AppSpaceGrant',
      type: 'object',
    },
    AppStarter: {
      additionalProperties: false,
      description: 'A first message offered to the user.',
      properties: {
        label: {
          description: 'What the button says',
          title: 'Label',
          type: 'string',
        },
        message: {
          description: 'What is sent when it is chosen',
          title: 'Message',
          type: 'string',
        },
      },
      required: ['label', 'message'],
      title: 'AppStarter',
      type: 'object',
    },
    AppSurface: {
      additionalProperties: false,
      description:
        'The component tree the user meets, over the approved catalog (A2UI).',
      properties: {
        protocol: {
          default: 'a2ui/v0.9',
          description: 'The protocol the tree is written in',
          title: 'Protocol',
          type: 'string',
        },
        components: {
          description:
            "The components, as the protocol's `updateComponents` carries them",
          items: {
            additionalProperties: true,
            type: 'object',
          },
          title: 'Components',
          type: 'array',
        },
        composed_by: {
          default: '',
          description:
            "Who composed it: a model's id, `canvas` (a person on the Canvas), `developer`, `template`",
          title: 'Composed By',
          type: 'string',
        },
        composed_at: {
          default: '',
          description: 'When, as an ISO date',
          title: 'Composed At',
          type: 'string',
        },
      },
      title: 'AppSurface',
      type: 'object',
    },
    AppTestCase: {
      additionalProperties: false,
      description:
        'An example of what the application should do, in plain words.',
      properties: {
        ask: {
          description: 'What it is asked',
          title: 'Ask',
          type: 'string',
        },
        expect: {
          description: 'What it should do',
          title: 'Expect',
          type: 'string',
        },
      },
      required: ['ask', 'expect'],
      title: 'AppTestCase',
      type: 'object',
    },
    AppTests: {
      additionalProperties: false,
      description: 'How the application is verified.',
      properties: {
        ready_at: {
          default: 0.8,
          description:
            'The share of tests that has to pass for the application to be ready',
          maximum: 1,
          minimum: 0,
          title: 'Ready At',
          type: 'number',
        },
        evalset: {
          default: '',
          description:
            'An evalset its runs validate against, when one is chosen',
          title: 'Evalset',
          type: 'string',
        },
        cases: {
          description: 'Its test conversations',
          items: {
            $ref: '#/$defs/AppTestCase',
          },
          title: 'Cases',
          type: 'array',
        },
      },
      title: 'AppTests',
      type: 'object',
    },
    AppTrigger: {
      additionalProperties: false,
      description: "What starts a worker's work.",
      properties: {
        type: {
          $ref: '#/$defs/TriggerType',
          description: '`schedule`, `event` or `once`',
        },
        cron: {
          default: '',
          description: 'For a schedule: a cron expression, `0 8 * * *`',
          title: 'Cron',
          type: 'string',
        },
        event: {
          default: '',
          description: 'For an event: its name, `email_received`',
          title: 'Event',
          type: 'string',
        },
        at: {
          default: '',
          description: 'For once: when, as an ISO date',
          title: 'At',
          type: 'string',
        },
        description: {
          default: '',
          description: 'What it is, in words: `Every morning at 8`',
          title: 'Description',
          type: 'string',
        },
        prompt: {
          default: '',
          description: 'What the worker is told when it fires',
          title: 'Prompt',
          type: 'string',
        },
      },
      required: ['type'],
      title: 'AppTrigger',
      type: 'object',
    },
    AssistantCharacter: {
      description:
        "The character an application's floating assistant shows (LOOP T-24):\none of those a UI plugin contributes. Datalayer's are these four.",
      enum: ['paperclip', 'wizard', 'cat', 'eyes'],
      title: 'AssistantCharacter',
      type: 'string',
    },
    Behaviour: {
      description:
        'What an application does when it meets an action: the four a person chooses from.',
      enum: ['do_it', 'if_asked', 'ask_first', 'leave_to_me'],
      title: 'Behaviour',
      type: 'string',
    },
    CriterionKind: {
      description: 'How a criterion is assessed.',
      enum: ['metric', 'noul', 'choice', 'score'],
      title: 'CriterionKind',
      type: 'string',
    },
    EmbedMode: {
      description: "How an application sits in another product's page.",
      enum: ['inline', 'bubble', 'panel', 'assistant'],
      title: 'EmbedMode',
      type: 'string',
    },
    EmbeddedDeployment: {
      additionalProperties: false,
      description: "The application inside another product's page.",
      properties: {
        mode: {
          $ref: '#/$defs/EmbedMode',
          default: 'inline',
          description: '`inline`, `bubble`, `panel` or `assistant`',
        },
        origins: {
          description: 'The origins allowed to embed it',
          items: {
            type: 'string',
          },
          title: 'Origins',
          type: 'array',
        },
      },
      title: 'EmbeddedDeployment',
      type: 'object',
    },
    HostedDeployment: {
      additionalProperties: false,
      description: 'The application at an address of its own.',
      properties: {
        visibility: {
          $ref: '#/$defs/Visibility',
          default: 'private',
          description: 'Who can open it',
        },
        slug: {
          default: '',
          description: 'The readable part of its address',
          title: 'Slug',
          type: 'string',
        },
      },
      title: 'HostedDeployment',
      type: 'object',
    },
    Layout: {
      description: 'How the application is laid out.',
      enum: ['chat', 'page', 'split'],
      title: 'Layout',
      type: 'string',
    },
    RecordItem: {
      description: 'What an application may keep of what it did.',
      enum: [
        'conversations',
        'actions',
        'decisions',
        'approvals',
        'checks',
        'sources',
        'outputs',
        'feedback',
      ],
      title: 'RecordItem',
      type: 'string',
    },
    SettingType: {
      description: 'What a setting is set with.',
      enum: ['select', 'text', 'toggle', 'slider', 'number'],
      title: 'SettingType',
      type: 'string',
    },
    TriggerType: {
      description: 'What starts a worker: the trigger kinds of the catalogue.',
      enum: ['schedule', 'event', 'once'],
      title: 'TriggerType',
      type: 'string',
    },
    Visibility: {
      description: 'Who can open a hosted application.',
      enum: ['private', 'invited', 'organization', 'link', 'public'],
      title: 'Visibility',
      type: 'string',
    },
  },
  additionalProperties: false,
  description: 'Specification for an application.',
  properties: {
    schema: {
      description: 'The version of the spec itself',
      title: 'Schema',
      const: 'loop.app/v1',
      default: 'loop.app/v1',
    },
    id: {
      description: 'Unique application identifier',
      title: 'Id',
      type: 'string',
    },
    version: {
      default: '0.0.1',
      description: 'Application version',
      title: 'Version',
      type: 'string',
    },
    name: {
      description: 'Display name',
      title: 'Name',
      type: 'string',
    },
    kind: {
      $ref: '#/$defs/AppKind',
      description: '`chat`, `widget`, `decision` or `worker`',
    },
    description: {
      default: '',
      description: 'What it does, in a sentence',
      title: 'Description',
      type: 'string',
    },
    owner: {
      default: '',
      description: 'Who answers for it',
      title: 'Owner',
      type: 'string',
    },
    agent: {
      default: '',
      description:
        'The agent or the Cog that does the work, `id` or `id:version`',
      title: 'Agent',
      type: 'string',
    },
    team: {
      default: '',
      description: 'Or a team of them, `id` or `id:version`',
      title: 'Team',
      type: 'string',
    },
    instructions: {
      default: '',
      description: 'What this application tells its agent, on top of its own',
      title: 'Instructions',
      type: 'string',
    },
    model: {
      default: '',
      description: "The model, when it is not the organization's default",
      title: 'Model',
      type: 'string',
    },
    skills: {
      description: "Skills it adds to its agent's",
      items: {
        type: 'string',
      },
      title: 'Skills',
      type: 'array',
    },
    tools: {
      description: "Tools of the catalogue it adds to its agent's",
      items: {
        type: 'string',
      },
      title: 'Tools',
      type: 'array',
    },
    context: {
      description: 'The Frames it works under',
      items: {
        type: 'string',
      },
      title: 'Context',
      type: 'array',
    },
    contents: {
      description: 'The documents and datasets it answers from',
      items: {
        type: 'string',
      },
      title: 'Contents',
      type: 'array',
    },
    connections: {
      description: 'What it reaches',
      items: {
        $ref: '#/$defs/AppConnection',
      },
      title: 'Connections',
      type: 'array',
    },
    rules: {
      description: 'When it acts alone, and when it asks',
      items: {
        $ref: '#/$defs/AppRule',
      },
      title: 'Rules',
      type: 'array',
    },
    permissions: {
      $ref: '#/$defs/AppPermissions',
      description:
        'What else it may reach: Spaces, its computer. Nothing, unless said',
    },
    interface: {
      $ref: '#/$defs/AppInterface',
      description: 'What the user sees',
    },
    tests: {
      $ref: '#/$defs/AppTests',
      description: 'How it is verified',
    },
    record: {
      $ref: '#/$defs/AppRecord',
      description: 'What is kept of what it did',
    },
    checks: {
      $ref: '#/$defs/AppChecks',
      description: 'Optional checks from the catalogue',
    },
    deployment: {
      $ref: '#/$defs/AppDeployment',
      description: 'Where it goes',
    },
    goal: {
      default: '',
      description: 'For a worker: what it works toward',
      title: 'Goal',
      type: 'string',
    },
    triggers: {
      description: 'For a worker: what starts its work',
      items: {
        $ref: '#/$defs/AppTrigger',
      },
      title: 'Triggers',
      type: 'array',
    },
    memory: {
      default: '',
      description: 'A memory of the catalogue, when it remembers',
      title: 'Memory',
      type: 'string',
    },
    notifications: {
      description: 'Where an approval reaches a person',
      items: {
        type: 'string',
      },
      title: 'Notifications',
      type: 'array',
    },
    decision: {
      anyOf: [
        {
          $ref: '#/$defs/AppDecision',
        },
        {
          type: 'null',
        },
      ],
      default: null,
      description: 'For a decision: what it decides',
    },
    enabled: {
      default: true,
      description: 'Whether it is offered today',
      title: 'Enabled',
      type: 'boolean',
    },
    tags: {
      items: {
        type: 'string',
      },
      title: 'Tags',
      type: 'array',
    },
    icon: {
      default: 'apps',
      description: 'Icon identifier',
      title: 'Icon',
      type: 'string',
    },
    emoji: {
      default: '👀',
      description:
        'Its face: one emoji, shown wherever the application appears',
      title: 'Emoji',
      type: 'string',
    },
    avatar: {
      default: '',
      description:
        'Its avatar, by name: a drawing of the set people choose theirs from on their profile. Its emoji stands for it when unsaid, and where only text goes',
      pattern: '^\\s*([A-Z][A-Za-z0-9]{0,63})?\\s*$',
      title: 'Avatar',
      type: 'string',
    },
    banner: {
      default: '',
      description:
        'Its banner, by name, from the set people choose theirs from on their profile. The one its id seeds when unsaid',
      pattern: '^\\s*([A-Z][A-Za-z0-9]{0,63})?\\s*$',
      title: 'Banner',
      type: 'string',
    },
  },
  required: ['id', 'name', 'kind'],
  title: 'Appspec',
  type: 'object',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://agentspecs.datalayer.tech/schemas/loop.app/v1.json',
};
