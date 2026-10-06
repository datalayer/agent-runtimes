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
    ActionClass: {
      description: 'What a tool does to the world.',
      enum: ['read', 'write', 'send', 'buy', 'delete', 'publish'],
      title: 'ActionClass',
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
        "Optional: checks from the catalogue, for a builder who wants them — and its code's own.",
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
        code: {
          description:
            'Checks written in its code (`@app.check`), each run at its stage (LOOP P-06)',
          items: {
            $ref: '#/$defs/AppCodeCheck',
          },
          title: 'Code',
          type: 'array',
        },
      },
      title: 'AppChecks',
      type: 'object',
    },
    AppCodeCheck: {
      additionalProperties: false,
      description:
        "A check written in the application's code (LOOP P-06): `@app.check`.\n\nRun at its stage beside the built-in checks and the catalogue's Guards;\nwhat it refuses is said in its own sentence. Without its file nothing\nruns it, and validation says so.",
      properties: {
        name: {
          description: 'The function of its code that checks, by name',
          pattern: '^[A-Za-z_][A-Za-z0-9_]*$',
          title: 'Name',
          type: 'string',
        },
        on: {
          $ref: '#/$defs/CheckStage',
          description: '`answer` or `tool_call`: where it runs',
        },
        description: {
          description: 'What it checks, in a sentence a person reads',
          minLength: 1,
          title: 'Description',
          type: 'string',
        },
      },
      required: ['name', 'on', 'description'],
      title: 'AppCodeCheck',
      type: 'object',
    },
    AppCommand: {
      additionalProperties: false,
      description:
        "A slash command the user picks in the composer (LOOP P-19).\n\nTyping `/` lists the application's commands; picking one sends its\n`prompt`, `{input}` replaced by the words typed after the command.",
      properties: {
        name: {
          description:
            'What follows the slash: lower-case letters, digits and hyphens, a letter first (`summarise`)',
          pattern: '^[a-z](?:[a-z0-9-]{0,30}[a-z0-9])?$',
          title: 'Name',
          type: 'string',
        },
        description: {
          description: "What the composer's menu says it does",
          minLength: 1,
          title: 'Description',
          type: 'string',
        },
        prompt: {
          description:
            "What is sent when it is picked: `{input}` stands for the words typed after it; without `{input}`, those words follow the prompt. An application's code answers `/<name> {input}` itself (`@app.command`)",
          minLength: 1,
          title: 'Prompt',
          type: 'string',
        },
      },
      required: ['name', 'description', 'prompt'],
      title: 'AppCommand',
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
      description: 'What an alternative is weighed on.',
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
            'What a decision model is asked, or how a metric is computed',
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
          description: 'What each is weighed on',
          items: {
            $ref: '#/$defs/AppCriterion',
          },
          title: 'Criteria',
          type: 'array',
        },
        min_confidence: {
          default: 0,
          description:
            'An answer less confident than this is put to the reader',
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
        decision_model: {
          default: '',
          description: "The model that answers the decision's typed questions",
          title: 'Decision Model',
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
    AppFieldTranslation: {
      additionalProperties: false,
      description: 'A field of the settings in another language.',
      properties: {
        title: {
          default: '',
          description: 'Its title',
          title: 'Title',
          type: 'string',
        },
        description: {
          default: '',
          description: 'What it is for',
          title: 'Description',
          type: 'string',
        },
        options: {
          additionalProperties: {
            type: 'string',
          },
          description:
            "What each value of its `enum` (or of its items') reads as, by the value; the value is sent",
          title: 'Options',
          type: 'object',
        },
      },
      title: 'AppFieldTranslation',
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
        theme: {
          anyOf: [
            {
              $ref: '#/$defs/AppTheme',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            "The theme it runs in by default, at its address, embedded, in the Studio's Preview and as an example: a `variant` and, optionally, a colour `mode`. The person's own when unsaid. Its `accent` colours the `loop` theme only",
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
        commands: {
          description:
            'Slash commands the user picks in the composer: typing `/` lists them (LOOP P-19)',
          items: {
            $ref: '#/$defs/AppCommand',
          },
          title: 'Commands',
          type: 'array',
        },
        modes: {
          description:
            'Mode switches in the composer: the option picked goes with every run, its instructions told to the agent and its model run on (LOOP P-19)',
          items: {
            $ref: '#/$defs/AppMode',
          },
          title: 'Modes',
          type: 'array',
        },
        profiles: {
          description:
            'Several assistants in one application, two at least: the person picks one before the conversation starts — the first unless they do — and keeps it to the end; its instructions, model and starters go with every run (LOOP P-20). None when unsaid',
          items: {
            $ref: '#/$defs/AppProfile',
          },
          title: 'Profiles',
          type: 'array',
        },
        settings: {
          anyOf: [
            {
              additionalProperties: true,
              type: 'object',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            "What the user may set: the JSON Schema of a form, an object of named fields, each with its `title` and its `default` (LOOP C-16). Drawn with `@datalayer/primer-rjsf` beside the conversation and on a deployment's Ship card, its values go with every run and are checked by the runtime against the same schema. None when unsaid",
          title: 'Settings',
        },
        settings_ui: {
          anyOf: [
            {
              additionalProperties: true,
              type: 'object',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            "How the settings' fields are drawn, as `@datalayer/primer-rjsf` reads a uiSchema: by field name, its `ui:` options — `ui:widget` one of `select`, `radio`, `range`, `updown`, `switch`, `checkbox`, `text`, `textarea`, `date`, `checkboxes`, `tags` — and `ui:order` (LOOP P-20). Each field's own widget when unsaid",
          title: 'Settings Ui',
        },
        language: {
          default: 'en',
          description:
            'The language its own words are in, as BCP 47 tags it (`en`, `fr`, `pt-BR`) (LOOP P-26)',
          title: 'Language',
          type: 'string',
        },
        translations: {
          additionalProperties: {
            $ref: '#/$defs/AppTranslation',
          },
          description:
            "What a person reads of it in other languages, by BCP 47 tag: its name, welcome, starters and their categories, settings, commands, modes and profiles. The page shows the person's language when it has it, else its own words (LOOP P-26)",
          title: 'Translations',
          type: 'object',
        },
        uploads: {
          anyOf: [
            {
              $ref: '#/$defs/AppUploads',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            'What a person may send in the composer without being asked — images, files, audio — by kind, each with its largest size, and how many at once (LOOP P-21). None when unsaid: the composer offers no attachment, and a file sent with a message is refused',
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
              maxLength: 64,
              pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
              type: 'string',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            "The character its floating assistant shows, by the id a plugin contributes it under (lowercase letters and digits, words joined by a hyphen): Datalayer's are `paperclip`, `wizard`, `cat` and `eyes`. The paper clip when unsaid; an id no enabled plugin contributes is refused where the plugins are known, the runtime and the page. Said here, it wins over a person's own choice in their settings",
          title: 'Assistant',
        },
        balloon: {
          anyOf: [
            {
              $ref: '#/$defs/BalloonDisplay',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            "How its floating assistant's balloon shows the conversation: `history` (every message, scrolled, the composer last) or `current` (only what it says or does now, the answer being written or the tool it calls, in one balloon). The page's own when unsaid: `history` for the floating chat",
        },
        voice: {
          $ref: '#/$defs/AppVoice',
          description:
            'Its voice: whether it listens and speaks, with which voice, in which language (off unless said)',
        },
        outputs: {
          description:
            "The formats its answers come in, by media type, words first: `text/markdown`, then `application/x-ipynb+json` for a Jupyter notebook. Over A2A, its agent card's output modes; a caller asks for some of them (`acceptedOutputModes`). Plain text alone when unsaid",
          items: {
            pattern: '^[a-z0-9][a-z0-9.+-]*/[a-z0-9][a-z0-9.+-]*$',
            type: 'string',
          },
          title: 'Outputs',
          type: 'array',
          uniqueItems: true,
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
    AppMode: {
      additionalProperties: false,
      description:
        'A mode switch in the composer (LOOP P-19): the person picks one of its options.',
      properties: {
        id: {
          description: 'Its id, the key a run says its option under',
          pattern: '^[a-z][a-z0-9_-]{0,39}$',
          title: 'Id',
          type: 'string',
        },
        label: {
          description: 'What the switch is called',
          minLength: 1,
          title: 'Label',
          type: 'string',
        },
        options: {
          description: 'Its positions, two at least',
          items: {
            $ref: '#/$defs/AppModeOption',
          },
          minItems: 2,
          title: 'Options',
          type: 'array',
        },
        default: {
          anyOf: [
            {
              type: 'string',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'The option it starts on; the first when unsaid',
          title: 'Default',
        },
      },
      required: ['id', 'label', 'options'],
      title: 'AppMode',
      type: 'object',
    },
    AppModeOption: {
      additionalProperties: false,
      description:
        'One position of a mode switch (LOOP P-19): what the agent is told, the model it runs on.',
      properties: {
        id: {
          description: 'Its id, what a run says it is in',
          pattern: '^[a-z][a-z0-9_-]{0,39}$',
          title: 'Id',
          type: 'string',
        },
        label: {
          description: 'What the switch says',
          minLength: 1,
          title: 'Label',
          type: 'string',
        },
        description: {
          default: '',
          description: 'What it changes, in a sentence',
          title: 'Description',
          type: 'string',
        },
        instructions: {
          default: '',
          description:
            'What the agent is told besides its instructions, in every run in this mode',
          title: 'Instructions',
          type: 'string',
        },
        model: {
          anyOf: [
            {
              type: 'string',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            "The model a run in this mode runs on, in place of the application's",
          title: 'Model',
        },
      },
      required: ['id', 'label'],
      title: 'AppModeOption',
      type: 'object',
    },
    AppModeTranslation: {
      additionalProperties: false,
      description: 'A mode in another language.',
      properties: {
        label: {
          default: '',
          description: 'What the switch is called',
          title: 'Label',
          type: 'string',
        },
        options: {
          additionalProperties: {
            $ref: '#/$defs/AppOptionTranslation',
          },
          description: 'Its options, by id',
          title: 'Options',
          type: 'object',
        },
      },
      title: 'AppModeTranslation',
      type: 'object',
    },
    AppOptionTranslation: {
      additionalProperties: false,
      description: 'An option of a mode in another language.',
      properties: {
        label: {
          default: '',
          description: 'What the switch says',
          title: 'Label',
          type: 'string',
        },
        description: {
          default: '',
          description: 'What it changes',
          title: 'Description',
          type: 'string',
        },
      },
      title: 'AppOptionTranslation',
      type: 'object',
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
    AppProfile: {
      additionalProperties: false,
      description:
        "One of several assistants in one application (LOOP P-20): a variant of its agent.\n\nThe person picks a profile before the conversation starts, and keeps it to\nthe end: its instructions are told to the agent on top of the\napplication's in every run, its model run in place of the application's\n(a mode's model wins over it), and its starters offered in place of the\napplication's.",
      properties: {
        id: {
          description: 'Its id, what a conversation says it is with',
          pattern: '^[a-z][a-z0-9_-]{0,39}$',
          title: 'Id',
          type: 'string',
        },
        label: {
          description: 'What the person picks it by',
          minLength: 1,
          title: 'Label',
          type: 'string',
        },
        description: {
          default: '',
          description: 'What it is for, in a sentence, beside its label',
          title: 'Description',
          type: 'string',
        },
        instructions: {
          default: '',
          description:
            'What the agent is told besides its instructions, in every run with this profile',
          title: 'Instructions',
          type: 'string',
        },
        model: {
          anyOf: [
            {
              type: 'string',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            "The model it runs on, in place of the application's; a mode's model wins over it",
          title: 'Model',
        },
        starters: {
          description:
            "The first messages it offers, in place of the application's; the application's when empty",
          items: {
            $ref: '#/$defs/AppStarter',
          },
          title: 'Starters',
          type: 'array',
        },
      },
      required: ['id', 'label'],
      title: 'AppProfile',
      type: 'object',
    },
    AppProfileTranslation: {
      additionalProperties: false,
      description: 'A profile in another language.',
      properties: {
        label: {
          default: '',
          description: 'What the person picks it by',
          title: 'Label',
          type: 'string',
        },
        description: {
          default: '',
          description: 'What it is for',
          title: 'Description',
          type: 'string',
        },
      },
      title: 'AppProfileTranslation',
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
        category: {
          default: '',
          description:
            'The heading it is offered under: the starters of one category are shown together, those without one first (LOOP P-20)',
          title: 'Category',
          type: 'string',
        },
      },
      required: ['label', 'message'],
      title: 'AppStarter',
      type: 'object',
    },
    AppStarterTranslation: {
      additionalProperties: false,
      description: 'A starter in another language.',
      properties: {
        label: {
          default: '',
          description: 'What the button says',
          title: 'Label',
          type: 'string',
        },
        message: {
          default: '',
          description: 'What is sent when it is chosen',
          title: 'Message',
          type: 'string',
        },
      },
      title: 'AppStarterTranslation',
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
        "An example of what the application should do, in plain words.\n\nWhen plain words are not enough, its code decides it (LOOP P-06): `code`\nnames the function of the application's `app.py` that is given the\nconversation and says whether it passed — `@app.test` writes it. `expect`\nstill says it in words: without its file, the case is judged by them.",
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
        code: {
          default: '',
          description:
            'The function of its code that decides the case, by name, when words are not enough; `expect` says it in words',
          pattern: '^(?:[A-Za-z_][A-Za-z0-9_]*)?$',
          title: 'Code',
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
        verified: {
          $ref: '#/$defs/AppVerified',
          description:
            'What was verified live, what runs on recorded data, and what is not verified yet',
        },
      },
      title: 'AppTests',
      type: 'object',
    },
    AppTheme: {
      additionalProperties: false,
      description: 'The theme an application runs in by default (LOOP T-30).',
      properties: {
        variant: {
          $ref: '#/$defs/ThemeVariant',
          description:
            'The theme: `datalayer`, `spatial`, `lovely`, `matrix`, `earth`, `sand`, `ivory`, `sun` or `loop`',
        },
        mode: {
          anyOf: [
            {
              $ref: '#/$defs/ThemeMode',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            "`light`, `dark` or `auto` (the device's); the person's own when unsaid",
        },
      },
      required: ['variant'],
      title: 'AppTheme',
      type: 'object',
    },
    AppTool: {
      additionalProperties: false,
      description:
        "A tool of the application's own, written in its code (LOOP P-06): `@app.tool`.\n\nIts agent calls it as any tool; the rules decide each call by what it\n`does` — a rule may name it, by its name alone — and the Canvas lists it.\nWithout its file the agent is not given it.",
      properties: {
        name: {
          description: 'Its name: what the agent calls, and a rule names',
          pattern: '^[A-Za-z_][A-Za-z0-9_]*$',
          title: 'Name',
          type: 'string',
        },
        description: {
          description: 'What it does, for the agent: when to call it',
          minLength: 1,
          title: 'Description',
          type: 'string',
        },
        parameters: {
          additionalProperties: true,
          description:
            'The JSON Schema of its arguments, an object; none when unsaid',
          title: 'Parameters',
          type: 'object',
        },
        does: {
          description:
            'What it does, by class of action (`read`, `write`, `send`…): what the rules decide',
          items: {
            $ref: '#/$defs/ActionClass',
          },
          minItems: 1,
          title: 'Does',
          type: 'array',
        },
      },
      required: ['name', 'description', 'does'],
      title: 'AppTool',
      type: 'object',
    },
    AppTranslation: {
      additionalProperties: false,
      description:
        "What a person reads of an application, in another language (LOOP P-26).\n\nEach part is keyed by what names it in the spec: a starter by its label,\na category by its words, a setting by its field, a command by its name,\na mode and a profile by their ids. What is not translated is shown in\nthe spec's own words; what is translated is shown, never sent, but a\nstarter's message — the agent is written to in the person's language.",
      properties: {
        name: {
          default: '',
          description: 'Its display name',
          title: 'Name',
          type: 'string',
        },
        description: {
          default: '',
          description: 'What it does',
          title: 'Description',
          type: 'string',
        },
        welcome: {
          default: '',
          description: 'What it says first',
          title: 'Welcome',
          type: 'string',
        },
        starters: {
          additionalProperties: {
            $ref: '#/$defs/AppStarterTranslation',
          },
          description: "Its starters and its profiles', by their label",
          title: 'Starters',
          type: 'object',
        },
        categories: {
          additionalProperties: {
            type: 'string',
          },
          description: "The starters' categories, by their words",
          title: 'Categories',
          type: 'object',
        },
        settings: {
          additionalProperties: {
            $ref: '#/$defs/AppFieldTranslation',
          },
          description: 'The fields of its settings, by name',
          title: 'Settings',
          type: 'object',
        },
        commands: {
          additionalProperties: {
            type: 'string',
          },
          description: "Its commands' descriptions, by name",
          title: 'Commands',
          type: 'object',
        },
        modes: {
          additionalProperties: {
            $ref: '#/$defs/AppModeTranslation',
          },
          description: 'Its modes, by id',
          title: 'Modes',
          type: 'object',
        },
        profiles: {
          additionalProperties: {
            $ref: '#/$defs/AppProfileTranslation',
          },
          description: 'Its profiles, by id',
          title: 'Profiles',
          type: 'object',
        },
      },
      title: 'AppTranslation',
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
    AppUploadKind: {
      additionalProperties: false,
      description:
        'A kind of file a person may send, and how large (LOOP P-21).',
      properties: {
        type: {
          description:
            'A media type (`application/pdf`), a family of them (`image/*`, `audio/*`) or an extension (`.csv`), lowercase',
          pattern:
            '^(?:[a-z0-9][a-z0-9.+-]*/(?:\\*|[a-z0-9][a-z0-9.+-]*)|\\.[a-z0-9][a-z0-9_+-]*)$',
          title: 'Type',
          type: 'string',
        },
        max_mb: {
          default: 10,
          description:
            'The largest file of this kind, in megabytes; 25 at most',
          exclusiveMinimum: 0,
          maximum: 25,
          title: 'Max Mb',
          type: 'number',
        },
      },
      required: ['type'],
      title: 'AppUploadKind',
      type: 'object',
    },
    AppUploads: {
      additionalProperties: false,
      description:
        'What a person may send in the composer without being asked (LOOP P-21): images, files, audio.\n\nA file of a kind it does not name, larger than its kind takes, or one too\nmany is refused, in a sentence — by the page before it is sent, and by the\nruntime when it is sent all the same.',
      properties: {
        kinds: {
          description: 'The kinds of file it takes, each with its largest size',
          items: {
            $ref: '#/$defs/AppUploadKind',
          },
          minItems: 1,
          title: 'Kinds',
          type: 'array',
        },
        max_files: {
          default: 5,
          description: 'The most files sent with one message',
          maximum: 20,
          minimum: 1,
          title: 'Max Files',
          type: 'integer',
        },
      },
      required: ['kinds'],
      title: 'AppUploads',
      type: 'object',
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
    AppVoice: {
      additionalProperties: false,
      description:
        'Its voice (VOICE.md VO-41): whether it listens, whether it speaks, with which voice, in which language.\n\nOff unless said. What is said becomes a message, and what is heard is the\nanswer the conversation shows: the text stays the truth.',
      properties: {
        enabled: {
          default: false,
          description: 'Whether it has a voice at all; off unless said',
          title: 'Enabled',
          type: 'boolean',
        },
        input: {
          $ref: '#/$defs/VoiceInput',
          default: 'push_to_talk',
          description:
            '`off`, `push_to_talk` (hold a key or the microphone, speak, let go) or `hands_free`',
        },
        output: {
          $ref: '#/$defs/VoiceOutput',
          default: 'on_request',
          description:
            'When its answers are heard: `off`, `on_request` (a Read aloud on each answer) or `always`',
        },
        voice: {
          default: '',
          description:
            "The voice it speaks with, an id of the voice catalogue (`kokoro-af-heart`); the language's first when unsaid",
          title: 'Voice',
          type: 'string',
        },
        language: {
          default: '',
          description:
            "The language it listens and speaks in, BCP 47 (`en-US`, `fr-FR`); the person's when unsaid",
          pattern: '^(?:[a-z]{2,3}(?:-[A-Z]{2})?)?$',
          title: 'Language',
          type: 'string',
        },
        where: {
          $ref: '#/$defs/VoiceWhere',
          default: 'auto',
          description:
            "Where its speech runs: `auto`, `device` (the person's browser) or `server` (Datalayer's)",
        },
      },
      title: 'AppVoice',
      type: 'object',
    },
    BalloonDisplay: {
      description:
        "How a floating assistant's balloon shows the conversation (LOOP T-23).",
      enum: ['history', 'current'],
      title: 'BalloonDisplay',
      type: 'string',
    },
    Behaviour: {
      description:
        'What an application does when it meets an action: the four a person chooses from.',
      enum: ['do_it', 'if_asked', 'ask_first', 'leave_to_me'],
      title: 'Behaviour',
      type: 'string',
    },
    CheckStage: {
      description:
        'Where a check of its code runs (LOOP P-06), as the built-in checks do (R-06).',
      enum: ['answer', 'tool_call'],
      title: 'CheckStage',
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
        host: {
          anyOf: [
            {
              $ref: '#/$defs/HostBridge',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            'What the host page passes it and the functions of the host it may call',
        },
      },
      title: 'EmbeddedDeployment',
      type: 'object',
    },
    HostBridge: {
      additionalProperties: false,
      description:
        "What the host page and the application say to each other (LOOP D-10).\n\nThe values of the host it reads (`context`: `user`, `page`, or a name of\nthe host's own), through the tool `host_context`; the functions of the\nhost it may call, each through `host_<name>`. Every one of these tools is\ndecided by a rule that names it, as any tool is: one no rule names is\nleft to the person.",
      properties: {
        context: {
          description:
            "The host's values it reads: `user`, `page`, or names of the host's own",
          items: {
            type: 'string',
          },
          title: 'Context',
          type: 'array',
        },
        functions: {
          description: "The host's functions it may call",
          items: {
            $ref: '#/$defs/HostFunction',
          },
          title: 'Functions',
          type: 'array',
        },
      },
      title: 'HostBridge',
      type: 'object',
    },
    HostFunction: {
      additionalProperties: false,
      description:
        "A function of the host page the application's agent may call (LOOP D-10).",
      properties: {
        name: {
          description:
            'Its name, lower-case words joined by `_`: `open_ticket`',
          title: 'Name',
          type: 'string',
        },
        description: {
          description: 'What it does, for the agent: when to call it',
          title: 'Description',
          type: 'string',
        },
        parameters: {
          additionalProperties: true,
          description: 'Its arguments, as a JSON Schema object',
          title: 'Parameters',
          type: 'object',
        },
      },
      required: ['name', 'description'],
      title: 'HostFunction',
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
        character_alone: {
          default: false,
          description:
            'At its address, only its character: the conversation opens in its balloon, as when it is shipped as `assistant`',
          title: 'Character Alone',
          type: 'boolean',
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
        'audio',
      ],
      title: 'RecordItem',
      type: 'string',
    },
    ThemeMode: {
      description:
        'The colour mode a theme is worn in: `auto` follows the device.',
      enum: ['light', 'dark', 'auto'],
      title: 'ThemeMode',
      type: 'string',
    },
    ThemeVariant: {
      description:
        "A theme of Datalayer's, as Appearance names it (LOOP T-30).",
      enum: [
        'datalayer',
        'spatial',
        'lovely',
        'matrix',
        'earth',
        'sand',
        'ivory',
        'sun',
        'loop',
      ],
      title: 'ThemeVariant',
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
    VoiceInput: {
      description:
        'How a person talks to the application (VOICE.md VO-10, VO-12).',
      enum: ['off', 'push_to_talk', 'hands_free'],
      title: 'VoiceInput',
      type: 'string',
    },
    VoiceOutput: {
      description: 'When its answers are heard (VO-21).',
      enum: ['off', 'on_request', 'always'],
      title: 'VoiceOutput',
      type: 'string',
    },
    VoiceWhere: {
      description:
        "Where its speech runs: in the person's browser, on Datalayer's servers, or the better of the two (§5).",
      enum: ['auto', 'device', 'server'],
      title: 'VoiceWhere',
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
    backend_tools: {
      description: "Backend tools of the catalogue it adds to its agent's",
      items: {
        type: 'string',
      },
      title: 'Backend Tools',
      type: 'array',
    },
    tools: {
      description:
        'Tools of its own, written in its code (`@app.tool`): the agent calls them, rules decide them',
      items: {
        $ref: '#/$defs/AppTool',
      },
      title: 'Tools',
      type: 'array',
    },
    context: {
      description:
        "The Frames it works under: the catalogue's, or its organization's own (`org-…`)",
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
    unavailable_because: {
      default: '',
      description:
        'Why it is not offered today, in a sentence its page shows: said when `enabled` is false, and only then',
      title: 'Unavailable Because',
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
