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
      standard: true,
      events: [],
    },
    {
      id: 'Image',
      name: 'Image',
      category: 'media',
      emoji: '🖼️',
      description: 'A picture: a chart rendered elsewhere, a logo, a photo.',
      standard: true,
      events: [],
    },
    {
      id: 'Icon',
      name: 'Icon',
      category: 'media',
      emoji: '🔣',
      description:
        'A small drawing that says what something is: a check, a warning, a link.',
      standard: true,
      events: [],
    },
    {
      id: 'Video',
      name: 'Video',
      category: 'media',
      emoji: '🎬',
      description: 'A film played in place.',
      standard: true,
      events: [],
    },
    {
      id: 'AudioPlayer',
      name: 'Audio',
      category: 'media',
      emoji: '🔊',
      description:
        'A sound played in place: a recording, a summary read aloud.',
      standard: true,
      events: [],
    },
    {
      id: 'Row',
      name: 'Row',
      category: 'layout',
      emoji: '➡️',
      description: 'Children side by side, left to right.',
      standard: true,
      events: [],
    },
    {
      id: 'Column',
      name: 'Column',
      category: 'layout',
      emoji: '⬇️',
      description: 'Children one under the other.',
      standard: true,
      events: [],
    },
    {
      id: 'List',
      name: 'List',
      category: 'layout',
      emoji: '📃',
      description:
        'Items one after the other, each drawn by the same children: results, alternatives, steps.',
      standard: true,
      events: [],
    },
    {
      id: 'Card',
      name: 'Card',
      category: 'layout',
      emoji: '🗂️',
      description: 'A framed group: what belongs together, set apart.',
      standard: true,
      events: [],
    },
    {
      id: 'Tabs',
      name: 'Tabs',
      category: 'layout',
      emoji: '📑',
      description: 'Several views of one place, one shown at a time.',
      standard: true,
      events: [],
    },
    {
      id: 'Divider',
      name: 'Divider',
      category: 'layout',
      emoji: '➖',
      description: 'A line between what comes before and after.',
      standard: true,
      events: [],
    },
    {
      id: 'Modal',
      name: 'Modal',
      category: 'layout',
      emoji: '🪟',
      description:
        'A window over the page, opened by a trigger: details, a confirmation.',
      standard: true,
      events: [],
    },
    {
      id: 'Button',
      name: 'Button',
      category: 'action',
      emoji: '🔘',
      description:
        'An action the person takes: send, run, approve. One filled button per screen.',
      standard: true,
      events: [],
    },
    {
      id: 'TextField',
      name: 'Input',
      category: 'input',
      emoji: '⌨️',
      description:
        'A field the person types in: a word, a sentence, a number, a date.',
      standard: true,
      events: [],
    },
    {
      id: 'CheckBox',
      name: 'Checkbox',
      category: 'input',
      emoji: '☑️',
      description: 'Yes or no: an option on or off, a consent given.',
      standard: true,
      events: [],
    },
    {
      id: 'ChoicePicker',
      name: 'Select',
      category: 'input',
      emoji: '🔽',
      description:
        'One choice, or several, among options the builder lists or the data gives.',
      standard: true,
      events: [],
    },
    {
      id: 'Slider',
      name: 'Slider',
      category: 'input',
      emoji: '🎚️',
      description:
        'A number chosen along a range: a weight, a budget, a threshold.',
      standard: true,
      events: [],
    },
    {
      id: 'DateTimeInput',
      name: 'Date and time',
      category: 'input',
      emoji: '📅',
      description: 'A date, a time, or both, chosen from a calendar.',
      standard: true,
      events: [],
    },
    {
      id: 'Table',
      name: 'Table',
      category: 'data',
      emoji: '📋',
      description:
        'Rows the application found or keeps, with the columns the builder chooses.',
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
