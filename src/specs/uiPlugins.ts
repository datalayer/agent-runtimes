/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * UI Plugin Catalog.
 *
 * How an agent's answer becomes an interface: the protocols a host renders.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { ComponentSpec, UIPluginSpec } from '../types/agentspecs';

export const A2UI_UI_PLUGIN_0_0_1: UIPluginSpec = {
  id: 'a2ui',
  version: '0.0.1',
  name: 'A2UI',
  description:
    'An agent describes an interface — a form, a table, a card — as a tree of components from a catalogue the host allows, and the host renders it; what the user does in it comes back to the agent as an action.',
  docsUrl: 'https://a2ui.org/',
  enabled: true,
  catalog: 'a2ui/v0.9',
  components: [
    {
      id: 'Text',
      name: 'Text',
      category: 'text',
      emoji: '🔤',
      description:
        'Words on the page: a heading, a paragraph, the answer — plain or Markdown.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['text'],
        properties: {
          text: {
            type: 'string',
            title: 'Words',
            description: 'What it says, plain or in simple Markdown.',
          },
          variant: {
            type: 'string',
            title: 'Style',
            description: 'A heading of a level, a caption, or body text.',
            enum: ['h1', 'h2', 'h3', 'h4', 'h5', 'caption', 'body'],
            default: 'body',
          },
        },
      },
      events: [],
    },
    {
      id: 'Image',
      name: 'Image',
      category: 'media',
      emoji: '🖼️',
      description: 'A picture: a chart rendered elsewhere, a logo, a photo.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['url'],
        properties: {
          url: {
            type: 'string',
            title: 'Address',
            description: 'Where the picture is.',
          },
          description: {
            type: 'string',
            title: 'Description',
            description: 'What it shows, for those who cannot see it.',
          },
          fit: {
            type: 'string',
            title: 'Fit',
            description: 'How it is resized to its place.',
            enum: ['contain', 'cover', 'fill', 'none', 'scaleDown'],
            default: 'fill',
          },
          variant: {
            type: 'string',
            title: 'Size',
            description: 'An icon, an avatar, a feature or a header.',
            enum: [
              'icon',
              'avatar',
              'smallFeature',
              'mediumFeature',
              'largeFeature',
              'header',
            ],
            default: 'mediumFeature',
          },
        },
      },
      events: [],
    },
    {
      id: 'Icon',
      name: 'Icon',
      category: 'media',
      emoji: '🔣',
      description:
        'A small drawing that says what something is: a check, a warning, a link.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            title: 'Icon',
            description: 'Which drawing, by its name.',
            enum: [
              'accountCircle',
              'add',
              'arrowBack',
              'arrowForward',
              'attachFile',
              'calendarToday',
              'call',
              'camera',
              'check',
              'close',
              'delete',
              'download',
              'edit',
              'event',
              'error',
              'fastForward',
              'favorite',
              'favoriteOff',
              'folder',
              'help',
              'home',
              'info',
              'locationOn',
              'lock',
              'lockOpen',
              'mail',
              'menu',
              'moreVert',
              'moreHoriz',
              'notificationsOff',
              'notifications',
              'pause',
              'payment',
              'person',
              'phone',
              'photo',
              'play',
              'print',
              'refresh',
              'rewind',
              'search',
              'send',
              'settings',
              'share',
              'shoppingCart',
              'skipNext',
              'skipPrevious',
              'star',
              'starHalf',
              'starOff',
              'stop',
              'upload',
              'visibility',
              'visibilityOff',
              'volumeDown',
              'volumeMute',
              'volumeOff',
              'volumeUp',
              'warning',
            ],
          },
        },
      },
      events: [],
    },
    {
      id: 'Video',
      name: 'Video',
      category: 'media',
      emoji: '🎬',
      description: 'A film played in place.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['url'],
        properties: {
          url: {
            type: 'string',
            title: 'Address',
            description: 'Where the film is.',
          },
        },
      },
      events: [],
    },
    {
      id: 'AudioPlayer',
      name: 'Audio',
      category: 'media',
      emoji: '🔊',
      description:
        'A sound played in place: a recording, a summary read aloud.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['url'],
        properties: {
          url: {
            type: 'string',
            title: 'Address',
            description: 'Where the sound is.',
          },
          description: {
            type: 'string',
            title: 'Description',
            description: 'What it is: a title or a summary.',
          },
        },
      },
      events: [],
    },
    {
      id: 'Row',
      name: 'Row',
      category: 'layout',
      emoji: '➡️',
      description: 'Children side by side, left to right.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['children'],
        properties: {
          children: {
            type: 'array',
            title: 'Blocks',
            description: 'The blocks inside it, by id, left to right.',
            items: {
              type: 'string',
            },
          },
          justify: {
            type: 'string',
            title: 'Spacing',
            description: 'How the blocks share the width.',
            enum: [
              'center',
              'end',
              'spaceAround',
              'spaceBetween',
              'spaceEvenly',
              'start',
              'stretch',
            ],
            default: 'start',
          },
          align: {
            type: 'string',
            title: 'Alignment',
            description: 'How the blocks line up top to bottom.',
            enum: ['start', 'center', 'end', 'stretch'],
            default: 'stretch',
          },
        },
      },
      events: [],
    },
    {
      id: 'Column',
      name: 'Column',
      category: 'layout',
      emoji: '⬇️',
      description: 'Children one under the other.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['children'],
        properties: {
          children: {
            type: 'array',
            title: 'Blocks',
            description: 'The blocks inside it, by id, top to bottom.',
            items: {
              type: 'string',
            },
          },
          justify: {
            type: 'string',
            title: 'Spacing',
            description: 'How the blocks share the height.',
            enum: [
              'start',
              'center',
              'end',
              'spaceBetween',
              'spaceAround',
              'spaceEvenly',
              'stretch',
            ],
            default: 'start',
          },
          align: {
            type: 'string',
            title: 'Alignment',
            description: 'How the blocks line up left to right.',
            enum: ['center', 'end', 'start', 'stretch'],
            default: 'stretch',
          },
        },
      },
      events: [],
    },
    {
      id: 'List',
      name: 'List',
      category: 'layout',
      emoji: '📃',
      description:
        'Items one after the other, each drawn by the same children: results, alternatives, steps.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['children'],
        properties: {
          children: {
            type: 'array',
            title: 'Blocks',
            description:
              'The blocks inside it, by id, or the template repeated over a list.',
            items: {
              type: 'string',
            },
          },
          direction: {
            type: 'string',
            title: 'Direction',
            description: 'One under the other, or side by side.',
            enum: ['vertical', 'horizontal'],
            default: 'vertical',
          },
          align: {
            type: 'string',
            title: 'Alignment',
            description: 'How the items line up across.',
            enum: ['start', 'center', 'end', 'stretch'],
            default: 'stretch',
          },
        },
      },
      events: [],
    },
    {
      id: 'Card',
      name: 'Card',
      category: 'layout',
      emoji: '🗂️',
      description: 'A framed group: what belongs together, set apart.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['child'],
        properties: {
          child: {
            type: 'string',
            title: 'Block',
            description:
              'The one block inside it, by id; a Row or Column for several.',
          },
        },
      },
      events: [],
    },
    {
      id: 'Tabs',
      name: 'Tabs',
      category: 'layout',
      emoji: '📑',
      description: 'Several views of one place, one shown at a time.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['tabs'],
        properties: {
          tabs: {
            type: 'array',
            title: 'Tabs',
            description: "Each tab's title and the block it shows, by id.",
            minItems: 1,
            items: {
              type: 'object',
              required: ['title', 'child'],
              properties: {
                title: {
                  type: 'string',
                },
                child: {
                  type: 'string',
                },
              },
            },
          },
        },
      },
      events: [],
    },
    {
      id: 'Divider',
      name: 'Divider',
      category: 'layout',
      emoji: '➖',
      description: 'A line between what comes before and after.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        properties: {
          axis: {
            type: 'string',
            title: 'Direction',
            description: 'Across or up and down.',
            enum: ['horizontal', 'vertical'],
            default: 'horizontal',
          },
        },
      },
      events: [],
    },
    {
      id: 'Modal',
      name: 'Modal',
      category: 'layout',
      emoji: '🪟',
      description:
        'A window over the page, opened by a trigger: details, a confirmation.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['trigger', 'content'],
        properties: {
          trigger: {
            type: 'string',
            title: 'Opened by',
            description: 'The block that opens it, by id: a button.',
          },
          content: {
            type: 'string',
            title: 'Shows',
            description: 'The block shown inside it, by id.',
          },
        },
      },
      events: [],
    },
    {
      id: 'Button',
      name: 'Button',
      category: 'action',
      emoji: '🔘',
      description:
        'An action the person takes: send, run, approve. One filled button per screen.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['child', 'action'],
        properties: {
          child: {
            type: 'string',
            title: 'Label',
            description: 'The block on it, by id: a Text for its words.',
          },
          variant: {
            type: 'string',
            title: 'Style',
            description:
              'Primary for the one main action, borderless for a link.',
            enum: ['default', 'primary', 'borderless'],
            default: 'default',
          },
          action: {
            type: 'object',
            title: 'Does',
            description: 'What pressing it sends, by name, with what it reads.',
          },
        },
      },
      events: [],
    },
    {
      id: 'TextField',
      name: 'Input',
      category: 'input',
      emoji: '⌨️',
      description:
        'A field the person types in: a word, a sentence, a number, a date.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['label'],
        properties: {
          label: {
            type: 'string',
            title: 'Label',
            description: 'What the person reads beside it.',
          },
          value: {
            type: 'string',
            title: 'Value',
            description: 'What is typed in it.',
          },
          variant: {
            type: 'string',
            title: 'Kind',
            description: 'A short or long text, a number, or hidden as typed.',
            enum: ['longText', 'number', 'shortText', 'obscured'],
            default: 'shortText',
          },
          validationRegexp: {
            type: 'string',
            title: 'Pattern',
            description: 'A regular expression what is typed must match.',
          },
        },
      },
      events: [],
    },
    {
      id: 'CheckBox',
      name: 'Checkbox',
      category: 'input',
      emoji: '☑️',
      description: 'Yes or no: an option on or off, a consent given.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['label', 'value'],
        properties: {
          label: {
            type: 'string',
            title: 'Label',
            description: 'What the person reads beside it.',
          },
          value: {
            type: 'boolean',
            title: 'Value',
            description: 'Whether it is ticked.',
          },
        },
      },
      events: [],
    },
    {
      id: 'ChoicePicker',
      name: 'Select',
      category: 'input',
      emoji: '🔽',
      description:
        'One choice, or several, among options the builder lists or the data gives.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['options', 'value'],
        properties: {
          label: {
            type: 'string',
            title: 'Label',
            description: 'What the person reads above the options.',
          },
          variant: {
            type: 'string',
            title: 'Choice',
            description: 'One of the options, or several.',
            enum: ['multipleSelection', 'mutuallyExclusive'],
            default: 'mutuallyExclusive',
          },
          options: {
            type: 'array',
            title: 'Options',
            description:
              'What may be chosen: the words read and the value sent.',
            items: {
              type: 'object',
              required: ['label', 'value'],
              properties: {
                label: {
                  type: 'string',
                },
                value: {
                  type: 'string',
                },
              },
            },
          },
          value: {
            type: 'array',
            title: 'Value',
            description: 'The values chosen.',
            items: {
              type: 'string',
            },
          },
          displayStyle: {
            type: 'string',
            title: 'Shown as',
            description: 'Checkboxes or chips.',
            enum: ['checkbox', 'chips'],
            default: 'checkbox',
          },
          filterable: {
            type: 'boolean',
            title: 'Searchable',
            description: 'A search field above the options.',
            default: false,
          },
        },
      },
      events: [],
    },
    {
      id: 'Slider',
      name: 'Slider',
      category: 'input',
      emoji: '🎚️',
      description:
        'A number chosen along a range: a weight, a budget, a threshold.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['value', 'max'],
        properties: {
          label: {
            type: 'string',
            title: 'Label',
            description: 'What the person reads beside it.',
          },
          min: {
            type: 'number',
            title: 'Least',
            description: 'The smallest value.',
            default: 0,
          },
          max: {
            type: 'number',
            title: 'Most',
            description: 'The largest value.',
          },
          value: {
            type: 'number',
            title: 'Value',
            description: 'The value chosen.',
          },
        },
      },
      events: [],
    },
    {
      id: 'DateTimeInput',
      name: 'Date and time',
      category: 'input',
      emoji: '📅',
      description: 'A date, a time, or both, chosen from a calendar.',
      version: '0.9.0',
      standard: true,
      properties: {
        type: 'object',
        required: ['value'],
        properties: {
          value: {
            type: 'string',
            title: 'Value',
            description: 'The date or time chosen, in ISO 8601.',
          },
          enableDate: {
            type: 'boolean',
            title: 'Date',
            description: 'A date may be chosen.',
            default: false,
          },
          enableTime: {
            type: 'boolean',
            title: 'Time',
            description: 'A time may be chosen.',
            default: false,
          },
          min: {
            type: 'string',
            title: 'Earliest',
            description: 'The earliest that may be chosen, in ISO 8601.',
          },
          max: {
            type: 'string',
            title: 'Latest',
            description: 'The latest that may be chosen, in ISO 8601.',
          },
          label: {
            type: 'string',
            title: 'Label',
            description: 'What the person reads beside it.',
          },
        },
      },
      events: [],
    },
    {
      id: 'Table',
      name: 'Table',
      category: 'data',
      emoji: '📋',
      description:
        'Rows the application found or keeps, with the columns the builder chooses.',
      version: '1.0.0',
      standard: false,
      properties: {
        type: 'object',
        required: ['columns'],
        properties: {
          title: {
            type: 'string',
            title: 'Title',
            description: 'What the table is, above it.',
          },
          columns: {
            type: 'array',
            title: 'Columns',
            description: 'The columns, in order.',
            minItems: 1,
            items: {
              type: 'string',
            },
          },
          page_size: {
            type: 'integer',
            title: 'Rows per page',
            description: 'How many rows show at once.',
            minimum: 1,
            maximum: 500,
            default: 20,
          },
          selectable: {
            type: 'boolean',
            title: 'Selectable',
            description: 'A row may be chosen, and its choice sent.',
            default: false,
          },
        },
      },
      bindings: {
        shows: ['rows'],
        sends: ['selected'],
      },
      events: ['select'],
      example: {
        title: 'Runs',
        columns: ['model', 'pass rate', 'cost'],
      },
    },
    {
      id: 'Chart',
      name: 'Chart',
      category: 'data',
      emoji: '📊',
      description:
        'Numbers drawn: a bar, a line, a scatter of what the application measured.',
      version: '1.0.0',
      standard: false,
      properties: {
        type: 'object',
        required: ['kind', 'x', 'y'],
        properties: {
          title: {
            type: 'string',
            title: 'Title',
            description: 'What the chart shows, above it.',
          },
          kind: {
            type: 'string',
            title: 'Kind',
            description: 'How the numbers are drawn.',
            enum: ['bar', 'line', 'scatter', 'area'],
            default: 'bar',
          },
          x: {
            type: 'string',
            title: 'Across',
            description: 'The field along the bottom.',
          },
          y: {
            type: 'string',
            title: 'Up',
            description: 'The field measured.',
          },
          series: {
            type: 'string',
            title: 'Series',
            description: 'A field whose values are drawn apart.',
          },
        },
      },
      bindings: {
        shows: ['points'],
        sends: [],
      },
      events: [],
      example: {
        kind: 'bar',
        x: 'model',
        y: 'pass rate',
      },
    },
    {
      id: 'FileUpload',
      name: 'File upload',
      category: 'input',
      emoji: '📎',
      description:
        'A file the person gives the application: a document to read, a sheet to check.',
      version: '1.0.0',
      standard: false,
      properties: {
        type: 'object',
        required: ['label'],
        properties: {
          label: {
            type: 'string',
            title: 'Label',
            description: 'What the person reads beside it.',
          },
          accept: {
            type: 'array',
            title: 'Accepts',
            description: 'The kinds of file it takes, by extension.',
            items: {
              type: 'string',
              pattern: '^\\.[a-z0-9]+$',
            },
          },
          multiple: {
            type: 'boolean',
            title: 'Several',
            description: 'More than one file at once.',
            default: false,
          },
          max_mb: {
            type: 'integer',
            title: 'Largest (MB)',
            description: 'The largest file it takes.',
            minimum: 1,
            maximum: 500,
            default: 25,
          },
        },
      },
      bindings: {
        shows: [],
        sends: ['files'],
      },
      events: ['upload'],
      example: {
        label: 'The contract',
        accept: ['.pdf', '.docx'],
      },
    },
    {
      id: 'Chat',
      name: 'Chat',
      category: 'conversation',
      emoji: '💬',
      description:
        'The conversation with the application: its welcome, its starters, the composer.',
      version: '1.0.0',
      standard: false,
      properties: {
        type: 'object',
        properties: {
          welcome: {
            type: 'string',
            title: 'Welcome',
            description: 'What it says before anyone writes.',
          },
          placeholder: {
            type: 'string',
            title: 'Composer hint',
            description: 'Shown in the composer while it is empty.',
            default: 'Ask anything',
          },
          starters: {
            type: 'array',
            title: 'Starters',
            description: 'Questions offered before the first message.',
            maxItems: 6,
            items: {
              type: 'string',
            },
          },
          show_tools: {
            type: 'boolean',
            title: 'Shows its tools',
            description: 'The tool calls are shown as they happen.',
            default: true,
          },
        },
      },
      bindings: {
        shows: ['messages'],
        sends: ['message'],
      },
      events: ['send'],
      example: {
        welcome: 'Ask me to research anything.',
        starters: ['What changed in Python 3.13?'],
      },
    },
    {
      id: 'Evidence',
      name: 'Evidence',
      category: 'data',
      emoji: '🔎',
      description:
        'What an answer rests on: the sources opened, the passages cited, each with its link.',
      version: '1.0.0',
      standard: false,
      properties: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            title: 'Title',
            description: 'Above the sources.',
            default: 'Sources',
          },
          show_passages: {
            type: 'boolean',
            title: 'Shows passages',
            description: 'Each source with the passage cited from it.',
            default: true,
          },
          max_items: {
            type: 'integer',
            title: 'Most shown',
            description: 'How many sources show before *more*.',
            minimum: 1,
            maximum: 50,
            default: 5,
          },
        },
      },
      bindings: {
        shows: ['sources'],
        sends: [],
      },
      events: ['open'],
      example: {
        title: 'What this rests on',
      },
    },
    {
      id: 'Form',
      name: 'Form',
      category: 'input',
      emoji: '🧾',
      description:
        'Several fields asked at once, from a JSON Schema, checked as they are filled and again when they arrive (drawn with @datalayer/primer-rjsf).',
      version: '1.1.0',
      standard: false,
      properties: {
        type: 'object',
        required: ['schema'],
        properties: {
          title: {
            type: 'string',
            title: 'Title',
            description: 'What the form is for, above it.',
          },
          schema: {
            type: 'object',
            title: 'Fields',
            description:
              'The JSON Schema of what is asked: its fields, their types, what is required.',
          },
          ui: {
            type: 'object',
            title: 'How its fields are drawn',
            description:
              "By field name, the ui: options @datalayer/primer-rjsf reads (a uiSchema): ui:widget one of select, radio, range, updown, switch, checkbox, text, textarea, date, checkboxes, tags; each field's own widget when unsaid.",
          },
          submit_label: {
            type: 'string',
            title: 'Send button',
            description: 'The words on its button.',
            default: 'Send',
          },
        },
      },
      bindings: {
        shows: ['values'],
        sends: ['values'],
      },
      events: ['submit'],
      example: {
        title: 'The quote',
        schema: {
          type: 'object',
          required: ['seats'],
          properties: {
            seats: {
              type: 'integer',
              minimum: 1,
              title: 'Seats',
            },
          },
        },
      },
    },
  ],
};

export const MCP_APPS_UI_PLUGIN_0_0_1: UIPluginSpec = {
  id: 'mcp-apps',
  version: '0.0.1',
  name: 'MCP Apps',
  description:
    "An MCP server ships an interactive app with a tool: the host renders it in a sandboxed frame beside the conversation, and the app calls the server's tools through the host.",
  docsUrl: 'https://modelcontextprotocol.io/docs/extensions/apps',
  enabled: false,
  catalog: '',
  components: [],
};

export const MCP_UI_UI_PLUGIN_0_0_1: UIPluginSpec = {
  id: 'mcp-ui',
  version: '0.0.1',
  name: 'MCP UI',
  description:
    'An MCP tool answers with a UI resource — HTML, a remote page or a component — that the host renders in place of plain text.',
  docsUrl: 'https://mcpui.dev/',
  enabled: false,
  catalog: '',
  components: [],
};

export const UI_PLUGIN_CATALOGUE: Record<string, UIPluginSpec> = {
  a2ui: A2UI_UI_PLUGIN_0_0_1,
  'mcp-apps': MCP_APPS_UI_PLUGIN_0_0_1,
  'mcp-ui': MCP_UI_UI_PLUGIN_0_0_1,
};

/** The plugin an agent spec's `uiPlugin` names, or undefined. */
export function getUIPlugin(pluginId: string): UIPluginSpec | undefined {
  return UI_PLUGIN_CATALOGUE[pluginId];
}

export function listUIPlugins(): UIPluginSpec[] {
  return Object.values(UI_PLUGIN_CATALOGUE);
}

/** The visual components the enabled UI plugins render, by the name a surface gives them (LOOP C-13). */
export const COMPONENT_CATALOGUE: Record<string, ComponentSpec> =
  Object.fromEntries(
    Object.values(UI_PLUGIN_CATALOGUE)
      .filter(plugin => plugin.enabled)
      .flatMap(plugin =>
        plugin.components.map(component => [component.id, component]),
      ),
  );

/** The component a layout names, or undefined. */
export function getComponent(name: string): ComponentSpec | undefined {
  return COMPONENT_CATALOGUE[name];
}

export function listComponents(): ComponentSpec[] {
  return Object.values(COMPONENT_CATALOGUE);
}
