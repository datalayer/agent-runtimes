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
    AppA2A: {
      additionalProperties: false,
      description:
        "A2A: what the application's Agent Card says beside its name and skill.",
      properties: {
        extensions: {
          description:
            "Extensions its card advertises, besides the runtime's own",
          items: {
            $ref: '#/$defs/AppA2AExtension',
          },
          title: 'Extensions',
          type: 'array',
        },
      },
      title: 'AppA2A',
      type: 'object',
    },
    AppA2AExtension: {
      additionalProperties: false,
      description:
        "An A2A extension the application's Agent Card advertises (A2A 1.0\n*Extensions*), beside the runtime's own.\n\nNamed by its URI, as `capabilities.extensions` writes it; its params are\npublished on the card as they are, so they never hold a credential.\nDatalayer's own extensions (orchestration, the face) are the runtime's,\nnever declared here.",
      properties: {
        uri: {
          description:
            "The extension's URI: `https://example.com/ext/gift-wrap/v1`",
          title: 'Uri',
          type: 'string',
        },
        description: {
          default: '',
          description: 'What it adds, for whoever reads the card',
          title: 'Description',
          type: 'string',
        },
        required: {
          default: false,
          description:
            'Whether a client must support it to talk to the application at all',
          title: 'Required',
          type: 'boolean',
        },
        params: {
          additionalProperties: true,
          description:
            'Its parameters on the card, as the extension defines them; public',
          title: 'Params',
          type: 'object',
        },
      },
      required: ['uri'],
      title: 'AppA2AExtension',
      type: 'object',
    },
    AppAction: {
      additionalProperties: false,
      description:
        'An action of its code a person presses (`@app.action`, RU-5).\n\nWhat its payload is, typed: the JSON Schema of an object, written from the\npydantic model its code declares (`@app.action(name, payload=Model)`); an\naction declaring none takes nothing. The runtime offers it only where a\ndisplay showed it, or to the session that runs it, each press with a\ntoken; a press of an action not declared here is refused, and its payload\nis checked against this schema before its code runs.',
      properties: {
        name: {
          description: 'Its name, as its button presses it',
          pattern: '^[A-Za-z_][A-Za-z0-9_]*$',
          title: 'Name',
          type: 'string',
        },
        description: {
          default: '',
          description: 'What it does, in a sentence',
          title: 'Description',
          type: 'string',
        },
        payload: {
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
            'The JSON Schema of what it is pressed with, an object; none when it takes nothing (a press with anything is then refused)',
          title: 'Payload',
        },
      },
      required: ['name'],
      title: 'AppAction',
      type: 'object',
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
            'Checks written in its code (`@app.check`), each run at its stage',
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
        "A check written in the application's code: `@app.check`.\n\nRun at its stage beside the built-in checks and the catalogue's Guards;\nwhat it refuses is said in its own sentence. Without its file nothing\nruns it, and validation says so.",
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
        "A slash command the user picks in the composer.\n\nTyping `/` lists the application's commands; picking one sends its\n`prompt`, `{input}` replaced by the words typed after the command.",
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
    AppCommerce: {
      additionalProperties: false,
      description: 'Commerce: the merchants it shops at for each person.',
      properties: {
        merchants: {
          description:
            'Merchants, over UCP or ACP: test merchants only for now',
          items: {
            $ref: '#/$defs/AppCommerceMerchant',
          },
          title: 'Merchants',
          type: 'array',
        },
      },
      title: 'AppCommerce',
      type: 'object',
    },
    AppCommerceMerchant: {
      additionalProperties: false,
      description:
        "A merchant the application shops at for each person, over UCP or ACP.\n\nDecided 2026-10-13: test merchants only, with no real payment — a\npurchase is always asked of the person first (*Ask me first*),\nas the exact checkout, and made at most once; Datalayer's gateway pays\nwith a test instrument and refuses any merchant it does not know as a\ntest one. Named by its domain (its profile at `/.well-known/ucp`, or\n`/.well-known/acp.json`), always in each person's own name. No\ncredential is ever part of a spec.",
      properties: {
        id: {
          description: 'Stable within the application: `example-store`',
          title: 'Id',
          type: 'string',
        },
        protocol: {
          $ref: '#/$defs/CommerceProtocol',
          description: '`ucp` or `acp`',
        },
        merchant: {
          description: "The merchant's domain: `store.example`",
          title: 'Merchant',
          type: 'string',
        },
        access: {
          $ref: '#/$defs/Access',
          default: 'read',
          description:
            'How far: `read` (searches and reads its checkouts), or `write` (also fills a checkout and buys, each purchase asked of the person)',
        },
        limit: {
          anyOf: [
            {
              $ref: '#/$defs/AppSpendLimit',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            'The most one purchase may cost there: required for `write`',
        },
      },
      required: ['id', 'protocol', 'merchant'],
      title: 'AppCommerceMerchant',
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
        repository: {
          anyOf: [
            {
              $ref: '#/$defs/AppRepository',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'A repository lent to it, checked out as its workspace',
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
    AppCustomComponent: {
      additionalProperties: false,
      description:
        "A component the developer writes, an A2UI component of this\napplication only: the catalog grows for it, it does not open.\n\nReviewed like any component of the catalog — its properties a JSON\nSchema, what it shows and sends bindings into the page's data — and drawn\nin a sandboxed frame of no origin, its module loaded from `source` and\nnothing else: what it is given is its properties and data, and what it\ngives back is what it sends.",
      properties: {
        name: {
          description:
            "Its name on a surface, as a catalog component's (`Gauge`); none of the catalog's own",
          pattern: '^[A-Z][A-Za-z0-9]{0,63}$',
          title: 'Name',
          type: 'string',
        },
        description: {
          description: 'What it is for, in a sentence: what the palette says',
          minLength: 1,
          title: 'Description',
          type: 'string',
        },
        props: {
          additionalProperties: true,
          description:
            'Its properties, as the JSON Schema of an object: each typed `string`, `integer`, `number`, `boolean`, `array` or `object`, or an `enum` of words, with its `title`, `description` and `default`; `required` among them',
          title: 'Props',
          type: 'object',
        },
        shows: {
          description:
            "What it shows from the page's data: each a binding, given a path or a value in place",
          items: {
            type: 'string',
          },
          title: 'Shows',
          type: 'array',
        },
        sends: {
          description:
            'What it sends back: each a binding it writes, then its `action` dispatched',
          items: {
            type: 'string',
          },
          title: 'Sends',
          type: 'array',
        },
        source: {
          description:
            "Its module, a built ES module whose default export draws it (`export default function (root, {props, send})`): an address over `https://`, or `http://localhost` while it is written; or a file of the application's folder, by its path in it (`gauge.js`), packaged with the application and served by the server its package is installed beside",
          title: 'Source',
          type: 'string',
        },
        integrity: {
          default: '',
          description:
            'The module as it was reviewed: its Subresource Integrity hash (`sha384-…`); a module that differs is not drawn. Any module at the address when unsaid',
          title: 'Integrity',
          type: 'string',
        },
        height: {
          default: 240,
          description: 'Its height on the page, in pixels',
          maximum: 2000,
          minimum: 40,
          title: 'Height',
          type: 'integer',
        },
        example: {
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
            'A configuration of it its schema accepts: what the palette previews',
          title: 'Example',
        },
      },
      required: ['name', 'description', 'source'],
      title: 'AppCustomComponent',
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
          anyOf: [
            {
              $ref: '#/$defs/Accent',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            "The application's one colour, over whichever theme it runs in; unsaid, it wears the theme's own colours",
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
            "The theme it runs in by default, at its address, embedded, in the Studio's Preview and as an example: a `variant` and, optionally, a colour `mode`. The person's own when unsaid. Its `accent`, when it names one, colours it, whichever theme it is",
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
            'Slash commands the user picks in the composer: typing `/` lists them',
          items: {
            $ref: '#/$defs/AppCommand',
          },
          title: 'Commands',
          type: 'array',
        },
        modes: {
          description:
            'Mode switches in the composer: the option picked goes with every run, its instructions told to the agent and its model run on',
          items: {
            $ref: '#/$defs/AppMode',
          },
          title: 'Modes',
          type: 'array',
        },
        actions: {
          description:
            'The actions of its code a person presses (`@app.action`, RU-5), each with the JSON Schema of its payload: what its buttons offer, with a token, and nothing else',
          items: {
            $ref: '#/$defs/AppAction',
          },
          title: 'Actions',
          type: 'array',
        },
        profiles: {
          description:
            'Several assistants in one application, two at least: the person picks one before the conversation starts — the first unless they do — and keeps it to the end; its instructions, model and starters go with every run. None when unsaid',
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
            "What the user may set: the JSON Schema of a form, an object of named fields, each with its `title` and its `default`. Drawn with `@datalayer/primer-rjsf` beside the conversation and on a deployment's Ship card, its values go with every run and are checked by the runtime against the same schema. None when unsaid",
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
            "How the settings' fields are drawn, as `@datalayer/primer-rjsf` reads a uiSchema: by field name, its `ui:` options — `ui:widget` one of `select`, `radio`, `range`, `updown`, `switch`, `checkbox`, `text`, `textarea`, `date`, `checkboxes`, `tags` — and `ui:order`. Each field's own widget when unsaid",
          title: 'Settings Ui',
        },
        language: {
          default: 'en',
          description:
            'The language its own words are in, as BCP 47 tags it (`en`, `fr`, `pt-BR`)',
          title: 'Language',
          type: 'string',
        },
        translations: {
          additionalProperties: {
            $ref: '#/$defs/AppTranslation',
          },
          description:
            "What a person reads of it in other languages, by BCP 47 tag: its name, welcome, starters and their categories, settings, commands, modes and profiles. The page shows the person's language when it has it, else its own words",
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
            'What a person may send in the composer without being asked — images, files, audio — by kind, each with its largest size, and how many at once. None when unsaid: the composer offers no attachment, and a file sent with a message is refused',
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
        custom_components: {
          description:
            "Components its developer wrote, of this application only: each named, its props a JSON Schema, its module's address; placed, shown and drawn as the catalog's own",
          items: {
            $ref: '#/$defs/AppCustomComponent',
          },
          title: 'Custom Components',
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
        page: {
          anyOf: [
            {
              $ref: '#/$defs/AppPage',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            "A widget's page written in its code (`@app.page`): its inputs as a form, its outputs as values; run again as an input changes, its outputs shown in place. None when unsaid",
        },
        avatar: {
          anyOf: [
            {
              maxLength: 64,
              pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$',
              type: 'string',
            },
            {
              $ref: '#/$defs/Model3DAvatar',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            "The avatar its floating assistant shows, its appearance: by the id a plugin contributes it under (lowercase letters and digits, words joined by a hyphen): Datalayer's orb `orb`, in the theme's colours, acting out each of the assistant's states; Datalayer's own drawings `paperclip`, `wizard`, `cat` and `eyes`; the characters clippy.js publishes, Microsoft's, fetched from jsDelivr when shown (`clippy-js-clippy`, `clippy-js-merlin`, `clippy-js-links`, `clippy-js-rover`, `clippy-js-genie`, `clippy-js-genius`, `clippy-js-f1`, `clippy-js-peedy`, `clippy-js-rocky`, `clippy-js-bonzi`); or a Microsoft Agent character a plugin brings; or a 3D model, `{kind: model3d, url}`. The paper clip when unsaid; an id no enabled plugin contributes is refused where the plugins are known, the runtime and the page. Said here, it wins over a person's own choice in their settings",
          title: 'Avatar',
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
        'A mode switch in the composer: the person picks one of its options.',
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
        'One position of a mode switch: what the agent is told, the model it runs on.',
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
    AppPact: {
      additionalProperties: false,
      description:
        'PACT: the businesses it asks for each person, and\nwhether it answers as one.',
      properties: {
        connections: {
          description: 'Businesses, over PACT',
          items: {
            $ref: '#/$defs/AppPactConnection',
          },
          title: 'Connections',
          type: 'array',
        },
        business: {
          $ref: '#/$defs/AppPactBusiness',
          description: 'As a business',
        },
      },
      title: 'AppPact',
      type: 'object',
    },
    AppPactBusiness: {
      additionalProperties: false,
      description:
        "The application answers as a PACT business.\n\nPublished at its deployment's own address: its A2A Agent Card names\nDatalayer as the Provider and the application's owner as the Brand; its\nA2A interface verifies each personal-agent JWT against a registered\nissuer's keys; with `scopes`, a person delegates to a personal agent\nthrough the Provider's device-code sign-in — their Datalayer sign-in — and\nevery answer under their delegation carries a signed receipt.",
      properties: {
        enabled: {
          default: false,
          description: 'Whether it is published as a business at Ship',
          title: 'Enabled',
          type: 'boolean',
        },
        brand: {
          default: '',
          description:
            "The Brand's name on its card: the application's `owner` when unsaid",
          title: 'Brand',
          type: 'string',
        },
        scopes: {
          additionalProperties: {
            type: 'string',
          },
          description:
            'What a person may let a personal agent do, `{scope: what the person is shown}`: `bookings:read: See your bookings`; none, it answers personal agents alone',
          title: 'Scopes',
          type: 'object',
        },
        registered_agents: {
          description:
            'The personal agents it accepts, each its issuer and its keys',
          items: {
            $ref: '#/$defs/AppPactRegisteredAgent',
          },
          title: 'Registered Agents',
          type: 'array',
        },
      },
      title: 'AppPactBusiness',
      type: 'object',
    },
    AppPactConnection: {
      additionalProperties: false,
      description:
        "A business the application asks for each person, over PACT 1.0.\n\nThe Brand is named by its domain — its Agent Card is at\n`https://<brand>/.well-known/agent-card.json` (PACT §2.1) — and its\nProvider's `audience`, which the Provider assigns at registration and\nthe personal-agent JWT carries. Always in each person's own name:\nPACT acts for a person. No credential is ever part of a spec.",
      properties: {
        id: {
          description: 'Stable within the application: `support`',
          title: 'Id',
          type: 'string',
        },
        brand: {
          description: "The business's domain: `example.com`",
          title: 'Brand',
          type: 'string',
        },
        audience: {
          description: 'The audience its Provider assigned (PACT §3.1)',
          title: 'Audience',
          type: 'string',
        },
        access: {
          $ref: '#/$defs/Access',
          default: 'read',
          description:
            'How far: `read` (asks as the application alone), or `write` (also for the person, delegated)',
        },
        scopes: {
          description:
            "The Brand's scopes it may ask the person for: `orders:read`",
          items: {
            type: 'string',
          },
          title: 'Scopes',
          type: 'array',
        },
      },
      required: ['id', 'brand', 'audience'],
      title: 'AppPactConnection',
      type: 'object',
    },
    AppPactRegisteredAgent: {
      additionalProperties: false,
      description:
        'A personal agent the business accepts (PACT 1.0 §3.1): its issuer, and where its keys are.\n\nRegistered by the Maker, as `pap.company.registered_agents`: a personal-agent JWT is verified against the keys of a registered\nissuer only, and any other is refused.',
      properties: {
        issuer: {
          description: "The personal agent's `iss`, an HTTPS URL",
          title: 'Issuer',
          type: 'string',
        },
        jwks_uri: {
          description: 'Where its public keys are (a JWKS), an HTTPS URL',
          title: 'Jwks Uri',
          type: 'string',
        },
      },
      required: ['issuer', 'jwks_uri'],
      title: 'AppPactRegisteredAgent',
      type: 'object',
    },
    AppPage: {
      additionalProperties: false,
      description:
        "A widget's page written in its code: `@app.page`.\n\nIts inputs are a form, drawn on the page; as one changes, the function\nof its code runs again on them and the page shows what it returned, in\nplace. Without its file nothing runs it, and validation says so.",
      properties: {
        function: {
          description: 'The function of its code that runs the page',
          pattern: '^[A-Za-z_][A-Za-z0-9_]*$',
          title: 'Function',
          type: 'string',
        },
        inputs: {
          additionalProperties: true,
          description:
            'Its inputs: the JSON Schema of a form, an object of named fields, each with its `title` and its `default`; on the page at `/inputs/<name>`, checked by the runtime against the same schema',
          title: 'Inputs',
          type: 'object',
        },
        inputs_ui: {
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
            'How its inputs are drawn, as `interface.settings_ui` draws the settings: a uiSchema by field name',
          title: 'Inputs Ui',
        },
        outputs: {
          description:
            'What it shows for its inputs, in order, each at `/outputs/<name>`',
          items: {
            $ref: '#/$defs/AppPageOutput',
          },
          minItems: 1,
          title: 'Outputs',
          type: 'array',
        },
        live: {
          default: true,
          description:
            'Whether it runs again as an input changes; `false`: when the person presses Run',
          title: 'Live',
          type: 'boolean',
        },
      },
      required: ['function', 'inputs', 'outputs'],
      title: 'AppPage',
      type: 'object',
    },
    AppPageOutput: {
      additionalProperties: false,
      description:
        'One thing a page shows for its inputs: a value, drawn with a component.',
      properties: {
        name: {
          description:
            'Its name: what its code returns it under, and where the page shows it (`/outputs/<name>`)',
          pattern: '^[A-Za-z_][A-Za-z0-9_]*$',
          title: 'Name',
          type: 'string',
        },
        title: {
          default: '',
          description: 'What a person reads above it; none when unsaid',
          title: 'Title',
          type: 'string',
        },
        component: {
          default: 'Text',
          description:
            "What draws it: `Text` (words, unless said), `Image` (an address), `Table` (rows) or `Chart` (points), or a component of the application's own (`interface.custom_components`), its value what it shows first",
          title: 'Component',
          type: 'string',
        },
        props: {
          additionalProperties: true,
          description:
            "The component's other properties: a Table's `columns`, a Chart's `kind`, `x` and `y`",
          title: 'Props',
          type: 'object',
        },
      },
      required: ['name'],
      title: 'AppPageOutput',
      type: 'object',
    },
    AppPair: {
      additionalProperties: false,
      description:
        "One of a pair of examples, a PACT business and the personal agent that asks it.\n\nA personal agent's issuer is its own application's, known only once a copy\nexists: when a person has copied both of a pair, the Studio registers the\npersonal agent's copy with the business's copy (`pact.business.registered_agents`)\nand points the personal agent at the business's own domain.",
      properties: {
        id: {
          description: "The pair's id, the same on both of its applications",
          title: 'Id',
          type: 'string',
        },
        role: {
          $ref: '#/$defs/PairRole',
          description: '`business`, or `personal_agent`: the one that asks it',
        },
      },
      required: ['id', 'role'],
      title: 'AppPair',
      type: 'object',
    },
    AppPap: {
      additionalProperties: false,
      description:
        'Personal Agent Protocol: the companies it works with, and whether it is one.\n\nA `pap` block names the profile it is written for: one\nDatalayer speaks, or it is refused in a sentence. An application without the\nblock has none.',
      properties: {
        profile: {
          anyOf: [
            {
              const: 'draft-01',
              type: 'string',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            'The Personal Agent Protocol profile it is written for: `draft-01`',
          title: 'Profile',
        },
        connections: {
          description: 'Companies, as a personal agent',
          items: {
            $ref: '#/$defs/AppPapConnection',
          },
          title: 'Connections',
          type: 'array',
        },
        company: {
          $ref: '#/$defs/AppPapCompany',
          description: 'As a company',
        },
      },
      title: 'AppPap',
      type: 'object',
    },
    AppPapAlternative: {
      additionalProperties: false,
      description:
        'Another way to do an excluded task (PAP draft 0.3 §8.2): instructions, references, or both.',
      properties: {
        instructions: {
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
            'What the person or their agent can do instead, at most 2000 characters',
          title: 'Instructions',
        },
        references: {
          description: 'Where to do it instead',
          items: {
            $ref: '#/$defs/AppPapReference',
          },
          title: 'References',
          type: 'array',
        },
      },
      title: 'AppPapAlternative',
      type: 'object',
    },
    AppPapCompany: {
      additionalProperties: false,
      description: 'The application is a company personal agents work with.',
      properties: {
        enabled: {
          default: false,
          description: 'Whether it publishes itself as a company at Ship',
          title: 'Enabled',
          type: 'boolean',
        },
        signed_out: {
          default: true,
          description: 'Whether a personal agent may ask before signing in',
          title: 'Signed Out',
          type: 'boolean',
        },
        interfaces: {
          description:
            "How personal agents reach it: `agent`, `openapi`, `mcp`, and `web` — its pages, a browser joining the person's Session through the one-time-code form (PAP draft 0.3 §6)",
          items: {
            $ref: '#/$defs/PapInterface',
          },
          title: 'Interfaces',
          type: 'array',
        },
        scopes: {
          description:
            'The scopes it offers, each with what it allows and its hints',
          items: {
            $ref: '#/$defs/AppPapCompanyScope',
          },
          title: 'Scopes',
          type: 'array',
        },
        excluded_tasks: {
          description:
            'Tasks it does not offer through the protocol, each with another way when there is one',
          items: {
            $ref: '#/$defs/AppPapExcludedTask',
          },
          title: 'Excluded Tasks',
          type: 'array',
        },
        extensions: {
          description: 'Extensions it offers: `operations`',
          items: {
            type: 'string',
          },
          title: 'Extensions',
          type: 'array',
        },
        personal_agents: {
          $ref: '#/$defs/PapAgents',
          default: 'any',
          description: '`any`, or `registered` only',
        },
        registered_agents: {
          description:
            "The personal agents it accepts when `registered` only: each one's `client_id` URL",
          items: {
            type: 'string',
          },
          title: 'Registered Agents',
          type: 'array',
        },
        operations: {
          description:
            'What it does for the person once they confirm (the `operations` extension)',
          items: {
            $ref: '#/$defs/AppPapOperation',
          },
          title: 'Operations',
          type: 'array',
        },
      },
      title: 'AppPapCompany',
      type: 'object',
    },
    AppPapCompanyScope: {
      additionalProperties: false,
      description:
        'A scope the company offers: its name, what it allows, and its hints (PAP draft 0.3 §4.4).\n\nThe description is published in `auth.scopes`; the hints, when given, in\n`auth.scope_hints`. Without them the hints are derived from the Rules\nclasses of the tools behind the scope.',
      properties: {
        name: {
          description: 'The scope, in OAuth syntax: `orders:read`',
          title: 'Name',
          type: 'string',
        },
        description: {
          description:
            'What it allows, as a person reads it: `Read your orders`',
          title: 'Description',
          type: 'string',
        },
        changes: {
          anyOf: [
            {
              $ref: '#/$defs/PapScopeChanges',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description:
            'What its most consequential use changes: `none`, `reversible` or `irreversible`',
        },
        personal_data: {
          anyOf: [
            {
              type: 'boolean',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: "Whether it reads or changes the person's personal data",
          title: 'Personal Data',
        },
      },
      required: ['name', 'description'],
      title: 'AppPapCompanyScope',
      type: 'object',
    },
    AppPapConnection: {
      additionalProperties: false,
      description:
        'A company the application works with as a Personal Agent.\n\nThe company is named by its domain, the discovery input, and nothing else:\nits endpoints, issuer and metadata are what discovery verifies and are kept\nby the deployment, never here, and no credential is ever part of a spec.\n`access` and `as` mean what they mean for every connection.',
      properties: {
        id: {
          description: 'Stable within the application: `orders`',
          title: 'Id',
          type: 'string',
        },
        company: {
          description:
            "The company's domain, as discovery takes it: `example.com`",
          title: 'Company',
          type: 'string',
        },
        access: {
          $ref: '#/$defs/Access',
          default: 'read',
          description: 'How far: `read`, or `write`',
        },
        as: {
          $ref: '#/$defs/ActsAs',
          default: 'user',
          description:
            'In whose account: `user` (each person signs in to their own) or `owner`',
        },
        scopes: {
          description: 'The fewest scopes the application needs',
          items: {
            type: 'string',
          },
          title: 'Scopes',
          type: 'array',
        },
        interfaces: {
          description: 'How it reaches the company',
          items: {
            $ref: '#/$defs/PapInterface',
          },
          title: 'Interfaces',
          type: 'array',
        },
        sign_in: {
          description:
            'Sign-in modes the application accepts, preferred first; which of them the company offers is read from its issuer (`grant_types_supported`, Mediated from its `poppy.json`)',
          items: {
            $ref: '#/$defs/PapSignIn',
          },
          title: 'Sign In',
          type: 'array',
        },
        extensions: {
          description: 'Extensions it uses: `operations`',
          items: {
            type: 'string',
          },
          title: 'Extensions',
          type: 'array',
        },
      },
      required: ['id', 'company'],
      title: 'AppPapConnection',
      type: 'object',
    },
    AppPapExcludedTask: {
      additionalProperties: false,
      description:
        'A task the company chose not to offer through the protocol (PAP draft 0.3 §8.1).',
      properties: {
        task: {
          description: 'The task, as a person says it, at most 200 characters',
          title: 'Task',
          type: 'string',
        },
        alternative: {
          anyOf: [
            {
              $ref: '#/$defs/AppPapAlternative',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'Another way to do it',
        },
      },
      required: ['task'],
      title: 'AppPapExcludedTask',
      type: 'object',
    },
    AppPapOperation: {
      additionalProperties: false,
      description:
        "Something a personal agent may ask the application to do for the person,\ndone only once they approve its exact terms (Operations v2).\n\nAsked by a personal agent, the application's agent does not call `tool`:\nthe company answers with the operation, its arguments the terms, and the\npersonal agent asks the person about that revision. Its request sent again\nwith their approval runs the tool, with those arguments and only once.",
      properties: {
        action: {
          description:
            "The action's name at this company, e.g. `orders.exchange`",
          title: 'Action',
          type: 'string',
        },
        tool: {
          description:
            "The application's tool that does it, called with the terms",
          title: 'Tool',
          type: 'string',
        },
        summary: {
          description:
            'What the person is shown, with `{term}` for each term, e.g. `Exchange order {order_id} for size {size}`; never written by the model',
          title: 'Summary',
          type: 'string',
        },
      },
      required: ['action', 'tool', 'summary'],
      title: 'AppPapOperation',
      type: 'object',
    },
    AppPapReference: {
      additionalProperties: false,
      description:
        'One place an alternative points to: an OpenAPI operation, an MCP tool, or a page.',
      properties: {
        type: {
          $ref: '#/$defs/PapReferenceType',
          description: '`openapi`, `mcp` or `web`',
        },
        url: {
          description:
            "Its HTTPS URL: the API's or server's the company lists, or the page",
          title: 'Url',
          type: 'string',
        },
        operation_id: {
          anyOf: [
            {
              type: 'string',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'For `openapi`: the operation',
          title: 'Operation Id',
        },
        tool: {
          anyOf: [
            {
              type: 'string',
            },
            {
              type: 'null',
            },
          ],
          default: null,
          description: 'For `mcp`: the tool',
          title: 'Tool',
        },
      },
      required: ['type', 'url'],
      title: 'AppPapReference',
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
        "One of several assistants in one application: a variant of its agent.\n\nThe person picks a profile before the conversation starts, and keeps it to\nthe end: its instructions are told to the agent on top of the\napplication's in every run, its model run in place of the application's\n(a mode's model wins over it), and its starters offered in place of the\napplication's.",
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
    AppRepository: {
      additionalProperties: false,
      description:
        "A repository lent to its computer: checked out at one revision, as its workspace.\n\nThe same git content an Environment brings (a public repository at a\npinned commit): an agent that works in a workspace — a coding harness —\nfinds it there when it starts. What it may do to it is its Rules'.",
      properties: {
        url: {
          description: 'The repository, an https:// git URL anyone may clone',
          title: 'Url',
          type: 'string',
        },
        revision: {
          description: 'The full commit sha it is checked out at',
          title: 'Revision',
          type: 'string',
        },
      },
      required: ['url', 'revision'],
      title: 'AppRepository',
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
    AppSampleAlternative: {
      additionalProperties: false,
      description:
        'An alternative a decision is tried on, and what is known about it.',
      properties: {
        name: {
          description: 'Its name',
          title: 'Name',
          type: 'string',
        },
        evidence: {
          description:
            'What is known about it: the text its typed questions are asked on',
          title: 'Evidence',
          type: 'string',
        },
        metrics: {
          additionalProperties: {
            type: 'number',
          },
          description:
            "What each metric criterion found for it, by the criterion's name",
          title: 'Metrics',
          type: 'object',
        },
      },
      required: ['name', 'evidence'],
      title: 'AppSampleAlternative',
      type: 'object',
    },
    AppSampleDocument: {
      additionalProperties: false,
      description:
        'A document it answers from, as Datalayer publishes it with the application.',
      properties: {
        name: {
          description: 'The document, as its `contents` names it',
          title: 'Name',
          type: 'string',
        },
        file: {
          description:
            'The file it is given as, in a sandbox: `price-list.csv`',
          title: 'File',
          type: 'string',
        },
        text: {
          description: 'What it holds',
          title: 'Text',
          type: 'string',
        },
      },
      required: ['name', 'file', 'text'],
      title: 'AppSampleDocument',
      type: 'object',
    },
    AppSamples: {
      additionalProperties: false,
      description:
        "What it is tried on before it is anybody's.\n\nPublished with it by Datalayer and read only: what a visitor without an\naccount tries it on, in the browser.",
      properties: {
        documents: {
          description:
            'Documents of its `contents`, as Datalayer publishes them',
          items: {
            $ref: '#/$defs/AppSampleDocument',
          },
          title: 'Documents',
          type: 'array',
        },
        alternatives: {
          description: 'For a decision: alternatives with their evidence',
          items: {
            $ref: '#/$defs/AppSampleAlternative',
          },
          title: 'Alternatives',
          type: 'array',
        },
      },
      title: 'AppSamples',
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
    AppSignedFetch: {
      additionalProperties: false,
      description:
        'Signed fetch: the sites it reads pages of, signed with its Web Bot Auth key.',
      properties: {
        sites: {
          description:
            'Sites, each by its exact domain: read with GET only, every request signed',
          items: {
            $ref: '#/$defs/AppSignedFetchSite',
          },
          title: 'Sites',
          type: 'array',
        },
      },
      title: 'AppSignedFetch',
      type: 'object',
    },
    AppSignedFetchSite: {
      additionalProperties: false,
      description:
        "A website the application reads pages of, each request signed.\n\nDecided 2026-10-13: a *signed fetch* names exact sites, an allow-list.\nDatalayer's gateway reads a page there with `GET` only, on its safe\negress path (public addresses only), each request signed with the\napplication's own Web Bot Auth key and recorded; reading is under the\napplication's Rules like any read. Named by its domain: no other host is\nreached, and no credential is ever part of a spec.",
      properties: {
        id: {
          description: 'Stable within the application: `example-verifier`',
          title: 'Id',
          type: 'string',
        },
        site: {
          description:
            "The site's domain, exactly: `verify.examples.datalayer.run`",
          title: 'Site',
          type: 'string',
        },
      },
      required: ['id', 'site'],
      title: 'AppSignedFetchSite',
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
    AppSpendLimit: {
      additionalProperties: false,
      description: 'The most one purchase may cost at a merchant.',
      properties: {
        amount: {
          description: 'At most this much, as written: `50`, `12.50`',
          title: 'Amount',
          type: 'string',
        },
        currency: {
          description: 'Its currency, ISO 4217: `USD`',
          title: 'Currency',
          type: 'string',
        },
      },
      required: ['amount', 'currency'],
      title: 'AppSpendLimit',
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
            'The heading it is offered under: the starters of one category are shown together, those without one first',
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
        "An example of what the application should do, in plain words.\n\nA case is one message (`ask`) or a short conversation (`turns`): what\nthe person says, chooses and presses, in order, each after the\napplication answered the turn before — and what it should do is judged\non the whole conversation.\n\nWhen plain words are not enough, its code decides it: `code`\nnames the function of the application's `app.py` that is given the\nconversation and says whether it passed — `@app.test` writes it. `expect`\nstill says it in words: without its file, the case is judged by them.",
      properties: {
        ask: {
          default: '',
          description:
            'What it is asked, in one message; none when it has turns',
          title: 'Ask',
          type: 'string',
        },
        turns: {
          description:
            'The conversation it is had in, turn by turn, in place of one message: what the person says, chooses and presses',
          items: {
            $ref: '#/$defs/AppTestTurn',
          },
          title: 'Turns',
          type: 'array',
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
        files: {
          description:
            'Text files it is given with what it is asked, each in the message after it',
          items: {
            $ref: '#/$defs/AppTestFile',
          },
          title: 'Files',
          type: 'array',
        },
      },
      required: ['expect'],
      title: 'AppTestCase',
      type: 'object',
    },
    AppTestFile: {
      additionalProperties: false,
      description:
        'A text file a test gives with what it asks, as a person gives one on its page.',
      properties: {
        name: {
          description: 'Its name, without a folder: `orders.csv`',
          title: 'Name',
          type: 'string',
        },
        text: {
          description: 'What it holds',
          title: 'Text',
          type: 'string',
        },
      },
      required: ['name', 'text'],
      title: 'AppTestFile',
      type: 'object',
    },
    AppTestTurn: {
      additionalProperties: false,
      description:
        "One turn of a test's conversation: what the person says, the option of a\nchoice they pick, or an action of its code they press, with its payload.\n\nEach is sent as its page sends it, after the application answered the turn\nbefore: a message, a choice answered in its option's words, an action by\nits name (``@app.action``).",
      properties: {
        say: {
          default: '',
          description: 'What the person says',
          title: 'Say',
          type: 'string',
        },
        choose: {
          default: '',
          description: 'The option they pick, of the choice it asked',
          title: 'Choose',
          type: 'string',
        },
        press: {
          default: '',
          description:
            'The action of its code they press, by name (`@app.action`)',
          pattern: '^(?:[A-Za-z_][A-Za-z0-9_]*)?$',
          title: 'Press',
          type: 'string',
        },
        payload: {
          additionalProperties: true,
          description: 'What the action is given with its press',
          title: 'Payload',
          type: 'object',
        },
      },
      title: 'AppTestTurn',
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
      description: 'The theme an application runs in by default.',
      properties: {
        variant: {
          $ref: '#/$defs/ThemeVariant',
          description:
            'The theme: `datalayer`, `spatial`, `lovely`, `matrix`, `earth`, `sand`, `ivory`, `sun`, `loop` or `vscode`',
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
        "A tool of the application's own, written in its code: `@app.tool`.\n\nIts agent calls it as any tool; the rules decide each call by what it\n`does` — a rule may name it, by its name alone — and the Canvas lists it.\nWithout its file the agent is not given it.",
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
        "What a person reads of an application, in another language.\n\nEach part is keyed by what names it in the spec: a starter by its label,\na category by its words, a setting by its field, a command by its name,\na mode and a profile by their ids. What is not translated is shown in\nthe spec's own words; what is translated is shown, never sent, but a\nstarter's message — the agent is written to in the person's language.",
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
      description: 'A kind of file a person may send, and how large.',
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
        'What a person may send in the composer without being asked: images, files, audio.\n\nA file of a kind it does not name, larger than its kind takes, or one too\nmany is refused, in a sentence — by the page before it is sent, and by the\nruntime when it is sent all the same.',
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
        'What was verified, and how, each in a sentence a person reads.\n\nAn example says it on its card and on its page: what was tried live,\nwhat runs on recorded data instead, and what is not verified yet. Said\nby whoever tried it; nothing here is computed.',
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
        'Its voice: whether it listens, whether it speaks, with which voice, in which language.\n\nOff unless said. What is said becomes a message, and what is heard is the\nanswer the conversation shows: the text stays the truth.',
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
            '`off` or `push_to_talk` (click the microphone or hold it, speak; it stops when let go or once the person stops speaking)',
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
      description: "How a floating assistant's balloon shows the conversation.",
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
      description: 'Where a check of its code runs, as the built-in checks do.',
      enum: ['answer', 'tool_call'],
      title: 'CheckStage',
      type: 'string',
    },
    CommerceProtocol: {
      description: 'The commerce protocol a merchant is reached over.',
      enum: ['ucp', 'acp'],
      title: 'CommerceProtocol',
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
        "What the host page and the application say to each other.\n\nThe values of the host it reads (`context`: `user`, `page`, or a name of\nthe host's own), through the tool `host_context`; the functions of the\nhost it may call, each through `host_<name>`. Every one of these tools is\ndecided by a rule that names it, as any tool is: one no rule names is\nleft to the person.\n\nWho its user is (`user`): what the page says (`claimed`), or\nonly what the host's server signed (`signed`) — a short token, HS256\nwith the deployment's secret, naming `sub`, `name` and `exp` at most an\nhour away. An application that acts in each user's name, or shows data\nthat is theirs, says `signed`.",
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
        user: {
          $ref: '#/$defs/HostUser',
          default: 'claimed',
          description:
            "Who its user is: `claimed`, what the page says; `signed`, only a token the host's server signed with the deployment's secret, the unsigned one refused",
        },
      },
      title: 'HostBridge',
      type: 'object',
    },
    HostFunction: {
      additionalProperties: false,
      description:
        "A function of the host page the application's agent may call.",
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
    HostUser: {
      description: "What the host page's word on its visitor is worth.",
      enum: ['claimed', 'signed'],
      title: 'HostUser',
      type: 'string',
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
        avatar_alone: {
          default: false,
          description:
            'At its address, only its avatar: the conversation opens in its balloon, as when it is shipped as `assistant`',
          title: 'Avatar Alone',
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
    Model3DAvatar: {
      additionalProperties: false,
      description:
        'An avatar that is a 3D model (glTF), drawn in the page with three.js.',
      properties: {
        kind: {
          const: 'model3d',
          description: '`model3d`',
          title: 'Kind',
          type: 'string',
        },
        url: {
          default: '',
          description:
            "The https address of its model, a `.glb` or `.gltf`; when unsaid, Datalayer's default robot (RobotExpressive, CC0). Its animation named `Idle` plays while it is quiet; while it speaks, its mouth and head move with its voice",
          maxLength: 2048,
          pattern: '^(?:https://[^\\s]+\\.(?:glb|gltf)(?:[?#][^\\s]*)?)?$',
          title: 'Url',
          type: 'string',
        },
      },
      required: ['kind'],
      title: 'Model3DAvatar',
      type: 'object',
    },
    PairRole: {
      description: 'Which side of a pair of examples an application is.',
      enum: ['business', 'personal_agent'],
      title: 'PairRole',
      type: 'string',
    },
    PapAgents: {
      description: 'Which personal agents a company application accepts.',
      enum: ['any', 'registered'],
      title: 'PapAgents',
      type: 'string',
    },
    PapInterface: {
      description:
        'How a Personal Agent Protocol company is reached (PAP §3.1).',
      enum: ['agent', 'openapi', 'mcp', 'web'],
      title: 'PapInterface',
      type: 'string',
    },
    PapReferenceType: {
      description: 'Where an alternative points (PAP draft 0.3 §8.2).',
      enum: ['openapi', 'mcp', 'web'],
      title: 'PapReferenceType',
      type: 'string',
    },
    PapScopeChanges: {
      description:
        'The most consequential thing a scope lets an agent do (PAP draft 0.3 §4.4).',
      enum: ['none', 'reversible', 'irreversible'],
      title: 'PapScopeChanges',
      type: 'string',
    },
    PapSignIn: {
      description:
        'How a person signs in at a company, in the order the application prefers.',
      enum: ['direct', 'device', 'mediated'],
      title: 'PapSignIn',
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
        'diffs',
        'terminals',
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
      description: "A theme of Datalayer's, as Appearance names it.",
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
        'vscode',
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
    UiChoice: {
      additionalProperties: false,
      description:
        'A UI plugin an agent or an application names, and the renderer it is exposed through, when it is.',
      properties: {
        plugin: {
          description: 'A UI plugin of `agentspecs/ui`, by id',
          minLength: 1,
          title: 'Plugin',
          type: 'string',
        },
        renderer: {
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
            'The UI renderer of `agentspecs/ui-renderers` it is exposed through, by id',
          title: 'Renderer',
        },
      },
      required: ['plugin'],
      title: 'UiChoice',
      type: 'object',
    },
    Visibility: {
      description: 'Who can open a hosted application.',
      enum: ['private', 'invited', 'organization', 'link', 'public'],
      title: 'Visibility',
      type: 'string',
    },
    VoiceInput: {
      description:
        'How a person talks to the application.\n\n`push_to_talk`: the microphone in the composer, clicked or held.\n`hands_free`: a conversation by voice — the composer offers *Talk with\nit*; a turn ends after a short silence and is sent, the answer is said,\nand listening goes on; speaking over the agent stops its voice.\nHands-free implies answers said as they are written (`output: always`).',
      enum: ['off', 'push_to_talk', 'hands_free'],
      title: 'VoiceInput',
      type: 'string',
    },
    VoiceOutput: {
      description: 'When its answers are heard.',
      enum: ['off', 'on_request', 'always'],
      title: 'VoiceOutput',
      type: 'string',
    },
    VoiceWhere: {
      description:
        "Where its speech runs: in the person's browser, on Datalayer's servers, or the better of the two.",
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
    protocols: {
      description:
        'The agent protocols it speaks, ids of the protocols catalogue: its `pap`, `pact`, `signed_fetch` and `a2a` blocks, and each merchant of `commerce`, are refused unless their protocol is listed, and a planned protocol only while it is not offered',
      items: {
        type: 'string',
      },
      title: 'Protocols',
      type: 'array',
    },
    ui: {
      description:
        'Its UI plugins, each `{plugin, renderer}`: a plugin of `agentspecs/ui`, each once, and the renderer of `agentspecs/ui-renderers` it is exposed through, when it is — one the plugin may be exposed through, and one that is not enabled only while the application is not offered',
      items: {
        $ref: '#/$defs/UiChoice',
      },
      title: 'Ui',
      type: 'array',
    },
    pap: {
      $ref: '#/$defs/AppPap',
      description:
        'Personal Agent Protocol: companies it works with, or being one',
    },
    pact: {
      $ref: '#/$defs/AppPact',
      description: 'PACT: businesses it asks for each person',
    },
    commerce: {
      $ref: '#/$defs/AppCommerce',
      description: 'UCP and ACP: merchants it shops at for each person',
    },
    signed_fetch: {
      $ref: '#/$defs/AppSignedFetch',
      description:
        'Web Bot Auth: the sites it reads pages of, GET only, each request signed with its key',
    },
    pair: {
      anyOf: [
        {
          $ref: '#/$defs/AppPair',
        },
        {
          type: 'null',
        },
      ],
      default: null,
      description:
        'One of a pair of examples: a PACT business, or the personal agent that asks it',
    },
    a2a: {
      $ref: '#/$defs/AppA2A',
      description: 'A2A: the extensions its Agent Card advertises',
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
    samples: {
      $ref: '#/$defs/AppSamples',
      description:
        "What it is tried on before it is anybody's: published with it by Datalayer, read only",
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
        'Its avatar, as people keep theirs on their profile: `emoji:<emoji>`, or `@datalayer/icons-react:<Name>Icon` for a drawing of the set. Its emoji stands for it when unsaid, and where only text goes',
      pattern:
        '^\\s*(emoji:[^\\sA-Za-z0-9]{1,32}|@datalayer/icons-react:[A-Z][A-Za-z0-9]{0,62}Icon)?\\s*$',
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
