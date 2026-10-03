/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Component Catalog (LOOP C-13).
 *
 * The visual components a layout is made of: one catalog for the spec, the
 * Canvas and Python, each with its properties as a JSON Schema.
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { ComponentSpec } from '../types/agentspecs';

export const BUTTON_COMPONENT_0_0_1: ComponentSpec = {
  id: 'button',
  version: '0.0.1',
  name: 'Button',
  description:
    'An action the person takes: send, run, approve. One filled button per screen.',
  category: 'action',
  emoji: '🔘',
  a2ui: 'Button',
  properties: {
    type: 'object',
    required: ['label', 'action'],
    properties: {
      label: {
        type: 'string',
        title: 'Label',
        description: 'What the person reads beside it.',
      },
      action: {
        type: 'string',
        title: 'Does',
        description:
          "What pressing it does, in the application's words: send the question, run the comparison, approve.",
      },
      variant: {
        type: 'string',
        title: 'Weight',
        description: 'How much it stands out.',
        enum: ['primary', 'default', 'danger'],
        default: 'default',
      },
      confirm: {
        type: 'string',
        title: 'Asks first',
        description:
          'A sentence to confirm before it acts, when it acts on something.',
      },
    },
  },
  bindings: {
    shows: [],
    sends: ['action'],
  },
  events: ['press'],
  example: {
    label: 'Compare',
    action: 'run the comparison',
    variant: 'primary',
  },
};

export const CARD_COMPONENT_0_0_1: ComponentSpec = {
  id: 'card',
  version: '0.0.1',
  name: 'Card',
  description: 'A framed group: what belongs together, set apart.',
  category: 'layout',
  emoji: '🗂️',
  a2ui: 'Card',
  properties: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        title: 'Title',
        description: 'What the card holds, at its top.',
      },
      padding: {
        type: 'string',
        title: 'Padding',
        description: 'The space inside its frame.',
        enum: ['small', 'medium', 'large'],
        default: 'medium',
      },
    },
  },
  bindings: {
    shows: [],
    sends: [],
  },
  events: [],
  example: {
    title: 'Your quote',
  },
};

export const CHART_COMPONENT_0_0_1: ComponentSpec = {
  id: 'chart',
  version: '0.0.1',
  name: 'Chart',
  description:
    'Numbers drawn: a bar, a line, a scatter of what the application measured.',
  category: 'data',
  emoji: '📊',
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
};

export const CHAT_COMPONENT_0_0_1: ComponentSpec = {
  id: 'chat',
  version: '0.0.1',
  name: 'Chat',
  description:
    'The conversation with the application: its welcome, its starters, the composer.',
  category: 'conversation',
  emoji: '💬',
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
};

export const CHECKBOX_COMPONENT_0_0_1: ComponentSpec = {
  id: 'checkbox',
  version: '0.0.1',
  name: 'Checkbox',
  description: 'Yes or no: an option on or off, a consent given.',
  category: 'input',
  emoji: '☑️',
  a2ui: 'CheckBox',
  properties: {
    type: 'object',
    required: ['label'],
    properties: {
      label: {
        type: 'string',
        title: 'Label',
        description: 'What the person reads beside it.',
      },
      default: {
        type: 'boolean',
        title: 'Checked',
        description: 'Whether it starts checked.',
        default: false,
      },
    },
  },
  bindings: {
    shows: [],
    sends: ['value'],
  },
  events: ['change'],
  example: {
    label: 'Include archived mail',
  },
};

export const COLUMN_COMPONENT_0_0_1: ComponentSpec = {
  id: 'column',
  version: '0.0.1',
  name: 'Column',
  description: 'Children one under the other.',
  category: 'layout',
  emoji: '⬇️',
  a2ui: 'Column',
  properties: {
    type: 'object',
    properties: {
      gap: {
        type: 'string',
        title: 'Spacing',
        description: 'The space between its children.',
        enum: ['none', 'small', 'medium', 'large'],
        default: 'medium',
      },
      align: {
        type: 'string',
        title: 'Alignment',
        description: 'How its children line up.',
        enum: ['start', 'center', 'end', 'stretch'],
        default: 'stretch',
      },
    },
  },
  bindings: {
    shows: [],
    sends: [],
  },
  events: [],
  example: {
    gap: 'medium',
  },
};

export const DIVIDER_COMPONENT_0_0_1: ComponentSpec = {
  id: 'divider',
  version: '0.0.1',
  name: 'Divider',
  description: 'A line between what comes before and after.',
  category: 'layout',
  emoji: '➖',
  a2ui: 'Divider',
  properties: {
    type: 'object',
    properties: {
      orientation: {
        type: 'string',
        title: 'Direction',
        description: 'Across or up and down.',
        enum: ['horizontal', 'vertical'],
        default: 'horizontal',
      },
    },
  },
  bindings: {
    shows: [],
    sends: [],
  },
  events: [],
  example: {},
};

export const EVIDENCE_COMPONENT_0_0_1: ComponentSpec = {
  id: 'evidence',
  version: '0.0.1',
  name: 'Evidence',
  description:
    'What an answer rests on: the sources opened, the passages cited, each with its link.',
  category: 'data',
  emoji: '🔎',
  a2ui: 'Card',
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
};

export const FILE_UPLOAD_COMPONENT_0_0_1: ComponentSpec = {
  id: 'file-upload',
  version: '0.0.1',
  name: 'File upload',
  description:
    'A file the person gives the application: a document to read, a sheet to check.',
  category: 'input',
  emoji: '📎',
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
};

export const FORM_COMPONENT_0_0_1: ComponentSpec = {
  id: 'form',
  version: '0.0.1',
  name: 'Form',
  description:
    'Several fields asked at once, from a JSON Schema, checked as they are filled and again when they arrive (drawn with @datalayer/primer-rjsf).',
  category: 'input',
  emoji: '🧾',
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
};

export const IMAGE_COMPONENT_0_0_1: ComponentSpec = {
  id: 'image',
  version: '0.0.1',
  name: 'Image',
  description: 'A picture: a chart rendered elsewhere, a logo, a photo.',
  category: 'media',
  emoji: '🖼️',
  a2ui: 'Image',
  properties: {
    type: 'object',
    required: ['alt'],
    properties: {
      url: {
        type: 'string',
        title: 'Address',
        description: 'Where the picture is, when it is not bound to data.',
        format: 'uri',
      },
      alt: {
        type: 'string',
        title: 'Says',
        description: 'What the picture shows, for a person who cannot see it.',
      },
      fit: {
        type: 'string',
        title: 'Fit',
        description: 'How it fills its place.',
        enum: ['contain', 'cover'],
        default: 'contain',
      },
    },
  },
  bindings: {
    shows: ['url'],
    sends: [],
  },
  events: [],
  example: {
    alt: "The application's logo",
  },
};

export const INPUT_COMPONENT_0_0_1: ComponentSpec = {
  id: 'input',
  version: '0.0.1',
  name: 'Input',
  description:
    'A field the person types in: a word, a sentence, a number, a date.',
  category: 'input',
  emoji: '⌨️',
  a2ui: 'TextField',
  properties: {
    type: 'object',
    required: ['label'],
    properties: {
      label: {
        type: 'string',
        title: 'Label',
        description: 'What the person reads beside it.',
      },
      placeholder: {
        type: 'string',
        title: 'Placeholder',
        description: 'Shown while it is empty.',
      },
      kind: {
        type: 'string',
        title: 'Kind',
        description: 'What it takes.',
        enum: ['text', 'long-text', 'number', 'email', 'date'],
        default: 'text',
      },
      required: {
        type: 'boolean',
        title: 'Required',
        description: 'It must be filled before sending.',
        default: false,
      },
      max_length: {
        type: 'integer',
        title: 'Longest',
        description: 'The most characters it takes.',
        minimum: 1,
      },
    },
  },
  bindings: {
    shows: [],
    sends: ['value'],
  },
  events: ['change', 'submit'],
  example: {
    label: 'Your question',
    kind: 'long-text',
    required: true,
  },
};

export const LIST_COMPONENT_0_0_1: ComponentSpec = {
  id: 'list',
  version: '0.0.1',
  name: 'List',
  description:
    'Items one after the other, each drawn by the same children: results, alternatives, steps.',
  category: 'layout',
  emoji: '📃',
  a2ui: 'List',
  properties: {
    type: 'object',
    properties: {
      direction: {
        type: 'string',
        title: 'Direction',
        description: 'Down or across.',
        enum: ['vertical', 'horizontal'],
        default: 'vertical',
      },
      empty: {
        type: 'string',
        title: 'When empty',
        description: 'What it says when there is nothing to list.',
        default: 'Nothing yet.',
      },
    },
  },
  bindings: {
    shows: ['items'],
    sends: ['selected'],
  },
  events: ['select'],
  example: {
    empty: 'No alternative yet.',
  },
};

export const ROW_COMPONENT_0_0_1: ComponentSpec = {
  id: 'row',
  version: '0.0.1',
  name: 'Row',
  description: 'Children side by side, left to right.',
  category: 'layout',
  emoji: '➡️',
  a2ui: 'Row',
  properties: {
    type: 'object',
    properties: {
      gap: {
        type: 'string',
        title: 'Spacing',
        description: 'The space between its children.',
        enum: ['none', 'small', 'medium', 'large'],
        default: 'medium',
      },
      align: {
        type: 'string',
        title: 'Alignment',
        description: 'How its children line up.',
        enum: ['start', 'center', 'end', 'stretch'],
        default: 'stretch',
      },
      wrap: {
        type: 'boolean',
        title: 'Wraps',
        description: 'Children move to a new line when there is no room.',
        default: true,
      },
    },
  },
  bindings: {
    shows: [],
    sends: [],
  },
  events: [],
  example: {
    gap: 'small',
  },
};

export const SELECT_COMPONENT_0_0_1: ComponentSpec = {
  id: 'select',
  version: '0.0.1',
  name: 'Select',
  description:
    'One choice, or several, among options the builder lists or the data gives.',
  category: 'input',
  emoji: '🔽',
  a2ui: 'ChoicePicker',
  properties: {
    type: 'object',
    required: ['label'],
    properties: {
      label: {
        type: 'string',
        title: 'Label',
        description: 'What the person reads beside it.',
      },
      options: {
        type: 'array',
        title: 'Options',
        description: 'The choices, when they are not bound to data.',
        items: {
          type: 'string',
        },
      },
      multiple: {
        type: 'boolean',
        title: 'Several',
        description: 'More than one may be chosen.',
        default: false,
      },
      required: {
        type: 'boolean',
        title: 'Required',
        description: 'A choice must be made before sending.',
        default: false,
      },
    },
  },
  bindings: {
    shows: ['options'],
    sends: ['value'],
  },
  events: ['change'],
  example: {
    label: 'Model',
    options: ['Sonnet', 'Haiku'],
  },
};

export const SLIDER_COMPONENT_0_0_1: ComponentSpec = {
  id: 'slider',
  version: '0.0.1',
  name: 'Slider',
  description:
    'A number chosen along a range: a weight, a budget, a threshold.',
  category: 'input',
  emoji: '🎚️',
  a2ui: 'Slider',
  properties: {
    type: 'object',
    required: ['label', 'min', 'max'],
    properties: {
      label: {
        type: 'string',
        title: 'Label',
        description: 'What the person reads beside it.',
      },
      min: {
        type: 'number',
        title: 'Lowest',
        description: 'Its smallest value.',
      },
      max: {
        type: 'number',
        title: 'Highest',
        description: 'Its largest value.',
      },
      step: {
        type: 'number',
        title: 'Step',
        description: 'How far one move goes.',
        exclusiveMinimum: 0,
        default: 1,
      },
      default: {
        type: 'number',
        title: 'Starts at',
        description: 'Its value before anyone moves it.',
      },
    },
  },
  bindings: {
    shows: [],
    sends: ['value'],
  },
  events: ['change'],
  example: {
    label: 'Weight of cost',
    min: 0,
    max: 1,
    step: 0.1,
    default: 0.5,
  },
};

export const TABLE_COMPONENT_0_0_1: ComponentSpec = {
  id: 'table',
  version: '0.0.1',
  name: 'Table',
  description:
    'Rows the application found or keeps, with the columns the builder chooses.',
  category: 'data',
  emoji: '📋',
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
};

export const TABS_COMPONENT_0_0_1: ComponentSpec = {
  id: 'tabs',
  version: '0.0.1',
  name: 'Tabs',
  description: 'Several views of one place, one shown at a time.',
  category: 'layout',
  emoji: '📑',
  a2ui: 'Tabs',
  properties: {
    type: 'object',
    required: ['tabs'],
    properties: {
      tabs: {
        type: 'array',
        title: 'Tabs',
        description: 'The tab titles, in order.',
        minItems: 1,
        items: {
          type: 'string',
        },
      },
      selected: {
        type: 'integer',
        title: 'Opens on',
        description: 'The tab shown first, counting from 0.',
        minimum: 0,
        default: 0,
      },
    },
  },
  bindings: {
    shows: [],
    sends: ['selected'],
  },
  events: ['select'],
  example: {
    tabs: ['Evidence', 'Comparison'],
  },
};

export const TEXT_COMPONENT_0_0_1: ComponentSpec = {
  id: 'text',
  version: '0.0.1',
  name: 'Text',
  description:
    'Words on the page: a heading, a paragraph, the answer — plain or Markdown.',
  category: 'text',
  emoji: '🔤',
  a2ui: 'Text',
  properties: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        title: 'Text',
        description: 'What it says, when it is not bound to data.',
      },
      variant: {
        type: 'string',
        title: 'Variant',
        description: 'How it reads.',
        enum: ['heading', 'subheading', 'body', 'caption'],
        default: 'body',
      },
      markdown: {
        type: 'boolean',
        title: 'Markdown',
        description: 'Read the text as Markdown.',
        default: false,
      },
    },
  },
  bindings: {
    shows: ['text'],
    sends: [],
  },
  events: [],
  example: {
    text: 'Which model should this run on?',
    variant: 'heading',
  },
};

export const COMPONENT_CATALOGUE: Record<string, ComponentSpec> = {
  button: BUTTON_COMPONENT_0_0_1,
  card: CARD_COMPONENT_0_0_1,
  chart: CHART_COMPONENT_0_0_1,
  chat: CHAT_COMPONENT_0_0_1,
  checkbox: CHECKBOX_COMPONENT_0_0_1,
  column: COLUMN_COMPONENT_0_0_1,
  divider: DIVIDER_COMPONENT_0_0_1,
  evidence: EVIDENCE_COMPONENT_0_0_1,
  'file-upload': FILE_UPLOAD_COMPONENT_0_0_1,
  form: FORM_COMPONENT_0_0_1,
  image: IMAGE_COMPONENT_0_0_1,
  input: INPUT_COMPONENT_0_0_1,
  list: LIST_COMPONENT_0_0_1,
  row: ROW_COMPONENT_0_0_1,
  select: SELECT_COMPONENT_0_0_1,
  slider: SLIDER_COMPONENT_0_0_1,
  table: TABLE_COMPONENT_0_0_1,
  tabs: TABS_COMPONENT_0_0_1,
  text: TEXT_COMPONENT_0_0_1,
};

/** The component a layout names, or undefined. */
export function getComponent(componentId: string): ComponentSpec | undefined {
  return COMPONENT_CATALOGUE[componentId];
}

export function listComponents(): ComponentSpec[] {
  return Object.values(COMPONENT_CATALOGUE);
}
