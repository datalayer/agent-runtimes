/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * UI Catalog.
 *
 * The UI plugins: the Reactor plugins an interface is made of (R8).
 *
 * This file is AUTO-GENERATED from YAML specifications.
 * DO NOT EDIT MANUALLY - run 'make specs' to regenerate.
 */

import type { ComponentSpec, UISpec } from '../types/agentspecs';

export const A2UI_SURFACE_UI_0_0_1: UISpec = {
  id: 'a2ui-surface',
  version: '0.0.1',
  name: 'Surfaces in the conversation',
  description:
    'Forms, tables and cards the agent draws in the conversation; what you fill in goes back to it.',
  emoji: '🪟',
  octicon: 'browser',
  plugin: '@datalayer/loop-plugin-a2ui-surface',
  folder: 'a2ui-surface',
  contributions: {
    slots: ['loop.chatHeader'],
    points: ['reactor.ui.renderer', 'reactor.ui.toolBinding'],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: ['a2ui'],
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
    {
      id: 'Download',
      name: 'File to download',
      category: 'data',
      emoji: '📄',
      description:
        'A file the application gives, to save: a report, a sheet, an export — by its link, or the file itself as a data: URL.',
      version: '1.0.0',
      standard: false,
      properties: {
        type: 'object',
        required: ['name', 'url'],
        properties: {
          name: {
            type: 'string',
            title: 'File name',
            description: 'What the file is saved as, with its extension.',
            minLength: 1,
          },
          url: {
            type: 'string',
            title: 'Link',
            description:
              'Where the file is: an http(s) link, or the file itself as a data: URL.',
            pattern: '^(https?://|data:)',
          },
          media_type: {
            type: 'string',
            title: 'Kind',
            description:
              'Its media type (text/csv, application/pdf…), said beside its name.',
          },
          size: {
            type: 'integer',
            title: 'Size (bytes)',
            description: 'How large it is, said beside its name.',
            minimum: 0,
          },
          description: {
            type: 'string',
            title: 'Description',
            description: 'A line under its name.',
          },
        },
      },
      bindings: {
        shows: [],
        sends: [],
      },
      events: ['download'],
      example: {
        name: 'totals.csv',
        url: 'data:text/csv;base64,bW9udGgsdG90YWwKSmFuLDEyMDAK',
        media_type: 'text/csv',
        size: 21,
        description: "The month's totals.",
      },
    },
  ],
};

export const A2UI_VIEW_UI_0_0_1: UISpec = {
  id: 'a2ui-view',
  version: '0.0.1',
  name: 'Surface view',
  description:
    'The last result of the code, shown as a page you can use rather than as raw output.',
  emoji: '🖼',
  octicon: 'browser',
  plugin: '@datalayer/loop-plugin-a2ui',
  folder: 'a2ui',
  contributions: {
    slots: [],
    points: ['loop.command', 'loop.viewType'],
    commands: ['a2ui'],
  },
  contributionPoints: [],
  settings: {},
  renderers: ['a2ui'],
  catalog: '',
  components: [],
};

export const AGENTSPECS_UI_0_0_1: UISpec = {
  id: 'agentspecs',
  version: '0.0.1',
  name: 'Agent picker',
  description: 'Choose which agent answers in this conversation.',
  emoji: '🤖',
  octicon: 'people',
  plugin: '@datalayer/loop-plugin-agentspecs',
  folder: 'agentspecs',
  contributions: {
    slots: ['loop.header'],
    points: ['loop.command'],
    commands: ['agents'],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const APP_ACTIVITY_UI_0_0_1: UISpec = {
  id: 'app-activity',
  version: '0.0.1',
  name: 'Activity',
  description:
    'What your application did, is doing, and is about to do, beside its page.',
  emoji: '🕘',
  octicon: 'pulse',
  plugin: '@datalayer/loop-plugin-app-activity',
  folder: 'app-activity',
  per: 'application',
  contributions: {
    slots: ['loop.sidebar'],
    points: [],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const APP_COMPONENTS_UI_0_0_1: UISpec = {
  id: 'app-components',
  version: '0.0.1',
  name: 'Your own components',
  description:
    "The components your application's developer wrote, on its page and in its answers.",
  emoji: '🧩',
  octicon: 'apps',
  plugin: '@datalayer/loop-plugin-app-components',
  folder: 'app-components',
  per: 'application',
  contributions: {
    slots: [],
    points: ['loop.a2ui.component', 'loop.canvas.block'],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: ['a2ui'],
  catalog: '',
  components: [],
};

export const APP_COMPUTER_UI_0_0_1: UISpec = {
  id: 'app-computer',
  version: '0.0.1',
  name: 'Computer',
  description:
    'The computer your application works on: what ran there, its files, and taking it over.',
  emoji: '🖥️',
  octicon: 'device-desktop',
  plugin: '@datalayer/loop-plugin-app-computer',
  folder: 'app-computer',
  per: 'application',
  contributions: {
    slots: ['loop.sidebar'],
    points: [],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const APP_ELEMENTS_UI_0_0_1: UISpec = {
  id: 'app-elements',
  version: '0.0.1',
  name: 'Side panel and pages',
  description:
    'What your application opens beside the conversation: a side panel, a page of its own, a question for you.',
  emoji: '🗂️',
  octicon: 'sidebar-expand',
  plugin: '@datalayer/loop-plugin-app-elements',
  folder: 'app-elements',
  contributions: {
    slots: ['root'],
    points: ['reactor.ui.renderer'],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: ['a2ui'],
  catalog: '',
  components: [],
};

export const APP_PAGE_UI_0_0_1: UISpec = {
  id: 'app-page',
  version: '0.0.1',
  name: 'Application page',
  description: "Your application's page, drawn beside its conversation.",
  emoji: '📈',
  octicon: 'browser',
  plugin: '@datalayer/loop-plugin-app-page',
  folder: 'app-page',
  per: 'application',
  contributions: {
    slots: [],
    points: ['loop.chat.surface'],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: ['a2ui', 'mcp-apps'],
  catalog: '',
  components: [],
};

export const APP_RULES_UI_0_0_1: UISpec = {
  id: 'app-rules',
  version: '0.0.1',
  name: 'Rules and approvals',
  description:
    'When your application acts alone, when it asks you, and the approvals waiting for your yes.',
  emoji: '🛡️',
  octicon: 'shield-check',
  plugin: '@datalayer/loop-plugin-app-rules',
  folder: 'app-rules',
  per: 'application',
  contributions: {
    slots: ['loop.sidebar'],
    points: [],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const CANVAS_BLOCKS_UI_0_0_1: UISpec = {
  id: 'canvas-blocks',
  version: '0.0.1',
  name: 'Blocks',
  description:
    "The blocks you place on your application's page in the visual editor, one set for each part that draws them.",
  emoji: '🧱',
  octicon: 'apps',
  plugin: '@datalayer/loop-plugin-ui',
  folder: 'canvas-blocks',
  per: 'ui',
  contributions: {
    slots: [],
    points: ['loop.canvas.block'],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const CANVAS_PARTS_UI_0_0_1: UISpec = {
  id: 'canvas-parts',
  version: '0.0.1',
  name: 'Parts',
  description:
    'What you drop on your agent in the visual editor: connections, skills, models, rules, tests and events.',
  emoji: '🧰',
  octicon: 'package',
  plugin: '@datalayer/loop-plugin-parts',
  folder: 'canvas-parts',
  per: 'source',
  contributions: {
    slots: [],
    points: ['loop.canvas.part'],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const CHAT_EXTRAS_UI_0_0_1: UISpec = {
  id: 'chat-extras',
  version: '0.0.1',
  name: 'Banner and status',
  description:
    'A live banner over the conversation and a status line under it, set by the page around it.',
  emoji: '📣',
  octicon: 'megaphone',
  plugin: '@datalayer/loop-plugin-chat-extras',
  folder: 'chat-extras',
  contributions: {
    slots: [],
    points: ['loop.chat.extras'],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const CHAT_HEADER_UI_0_0_1: UISpec = {
  id: 'chat-header',
  version: '0.0.1',
  name: 'Chat title bar',
  description:
    "The conversation's title bar: who answers, what it runs on, and its actions.",
  emoji: '🏷️',
  octicon: 'rows',
  plugin: '@datalayer/loop-plugin-chat-header',
  folder: 'chat-header',
  contributions: {
    slots: [],
    points: ['loop.chat.header'],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const CHAT_VIEW_UI_0_0_1: UISpec = {
  id: 'chat-view',
  version: '0.0.1',
  name: 'Chat button',
  description: 'Back to the conversation alone, from under the composer.',
  emoji: '💬',
  octicon: 'comment-discussion',
  plugin: '@datalayer/loop-plugin-chat-view',
  folder: 'chat-view',
  contributions: {
    slots: ['loop.promptAction'],
    points: [],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const CHAT_UI_0_0_1: UISpec = {
  id: 'chat',
  version: '0.0.1',
  name: 'Chat',
  description:
    'The conversation: what you ask, what it answers, and the work it opens beside it.',
  emoji: '💬',
  octicon: 'comment-discussion',
  plugin: '@datalayer/loop-plugin-chat',
  folder: 'chat',
  contributions: {
    slots: [],
    points: [
      'loop.chat.turn',
      'loop.command',
      'loop.document.toolbar.item',
      'loop.notebook.toolbar.item',
      'loop.session.action',
      'loop.viewType',
    ],
    commands: ['chat'],
  },
  contributionPoints: [
    'loop.agent.available',
    'loop.chat.composer',
    'loop.chat.extras',
    'loop.chat.header',
    'loop.chat.suggestion',
    'loop.chat.turn',
    'loop.frontendTool',
  ],
  settings: {
    type: 'object',
    properties: {
      placeholder: {
        type: 'string',
        title: 'Composer hint',
        description:
          "Shown in the composer while it is empty; the agent's own when unsaid.",
        default: '',
      },
      defaultSurface: {
        type: 'string',
        title: 'Opens beside it',
        description:
          'What opens beside the conversation: notebook, document, a page, or none.',
        default: 'notebook',
      },
      showSurfaceSelector: {
        type: 'boolean',
        title: 'Offers the switcher',
        description:
          'The strip that switches what is open beside the conversation.',
        default: true,
      },
      hideHeader: {
        type: 'boolean',
        title: 'Hides its title bar',
        description: 'The conversation without its own title bar.',
        default: false,
      },
      headerButtons: {
        type: 'object',
        title: 'Title bar buttons',
        description:
          'Whether the title bar offers a new chat and clearing this one.',
        properties: {
          newChat: {
            type: 'boolean',
            title: 'New chat',
            description: 'Start another conversation.',
          },
          clear: {
            type: 'boolean',
            title: 'Clear',
            description: 'Clear this conversation.',
          },
        },
        default: { newChat: false, clear: false },
      },
      hidePrompt: {
        type: 'boolean',
        title: 'Hides the composer',
        description: 'The conversation read without being written to.',
        default: false,
      },
      promptPlacement: {
        type: 'string',
        title: 'Composer place',
        description: 'Where the composer sits.',
        enum: ['top', 'bottom', 'bottom-chat', 'floating'],
        default: 'bottom',
      },
      autoFocusPrompt: {
        type: 'boolean',
        title: 'Composer takes the caret',
        description: 'The composer is ready to type in when the page opens.',
        default: true,
      },
      suggestionLabels: {
        type: 'boolean',
        title: 'Openers by the composer',
        description:
          'The openers shown as labels by the composer, not only in its menu.',
        default: true,
      },
      fullScreenTopOffset: {
        type: ['number', 'string'],
        title: 'Room kept at the top',
        description:
          "What full screen leaves at the top for the page's own header.",
        default: 0,
      },
    },
  },
  renderers: [],
  catalog: '',
  components: [],
};

export const COMMANDS_UI_0_0_1: UISpec = {
  id: 'commands',
  version: '0.0.1',
  name: 'Command palette',
  description: 'Every command at hand, with Ctrl-K.',
  emoji: '⌘',
  octicon: 'command-palette',
  plugin: '@datalayer/loop-plugin-commands',
  folder: 'commands',
  contributions: {
    slots: ['loop.status'],
    points: [],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const DOCUMENT_TOOLBAR_UI_0_0_1: UISpec = {
  id: 'document-toolbar',
  version: '0.0.1',
  name: 'Document toolbar',
  description: "Shows what the document's code blocks run on.",
  emoji: '🔵',
  octicon: 'circle',
  plugin: '@datalayer/loop-plugin-document-toolbar',
  folder: 'document-toolbar',
  contributions: {
    slots: [],
    points: ['loop.document.toolbar'],
    commands: [],
  },
  contributionPoints: ['loop.document.toolbar.item'],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const DOCUMENT_VIEW_UI_0_0_1: UISpec = {
  id: 'document-view',
  version: '0.0.1',
  name: 'Document button',
  description: 'The document beside the conversation, from under the composer.',
  emoji: '📄',
  octicon: 'file',
  plugin: '@datalayer/loop-plugin-document-view',
  folder: 'document-view',
  contributions: {
    slots: ['loop.promptAction'],
    points: [],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const DOCUMENT_UI_0_0_1: UISpec = {
  id: 'document',
  version: '0.0.1',
  name: 'Document',
  description: 'A document beside the conversation, written with the agent.',
  emoji: '📄',
  octicon: 'file',
  plugin: '@datalayer/loop-plugin-document',
  folder: 'document',
  contributions: {
    slots: [],
    points: ['loop.chat.surface', 'loop.command'],
    commands: ['document'],
  },
  contributionPoints: ['loop.document.opening', 'loop.document.toolbar'],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const INPUT_PROMPT_UI_0_0_1: UISpec = {
  id: 'input-prompt',
  version: '0.0.1',
  name: 'Composer',
  description: 'Where you write to the agent, under or over the conversation.',
  emoji: '✏️',
  octicon: 'pencil',
  plugin: '@datalayer/loop-plugin-input-prompt',
  folder: 'input-prompt',
  contributions: {
    slots: [],
    points: ['loop.chat.composer'],
    commands: [],
  },
  contributionPoints: ['loop.prompt.panel'],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const MODELS_UI_0_0_1: UISpec = {
  id: 'models',
  version: '0.0.1',
  name: 'Models',
  description: 'Which model answers, and the models you may choose from.',
  emoji: '🧠',
  octicon: 'cpu',
  plugin: '@datalayer/loop-plugin-models',
  folder: 'models',
  contributions: {
    slots: [],
    points: ['loop.command'],
    commands: ['models'],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const NOTEBOOK_TOOLBAR_UI_0_0_1: UISpec = {
  id: 'notebook-toolbar',
  version: '0.0.1',
  name: 'Notebook toolbar',
  description: 'Shows what the notebook is running on.',
  emoji: '🟢',
  octicon: 'circle',
  plugin: '@datalayer/loop-plugin-notebook-toolbar',
  folder: 'notebook-toolbar',
  contributions: {
    slots: [],
    points: ['loop.notebook.toolbar'],
    commands: [],
  },
  contributionPoints: ['loop.notebook.toolbar.item'],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const NOTEBOOK_VIEW_UI_0_0_1: UISpec = {
  id: 'notebook-view',
  version: '0.0.1',
  name: 'Notebook button',
  description: 'The notebook beside the conversation, from under the composer.',
  emoji: '📓',
  octicon: 'rows',
  plugin: '@datalayer/loop-plugin-notebook-view',
  folder: 'notebook-view',
  contributions: {
    slots: ['loop.promptAction'],
    points: [],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const NOTEBOOK_UI_0_0_1: UISpec = {
  id: 'notebook',
  version: '0.0.1',
  name: 'Notebook',
  description: 'A notebook beside the conversation, its code run as you go.',
  emoji: '📓',
  octicon: 'rows',
  plugin: '@datalayer/loop-plugin-notebook',
  folder: 'notebook',
  contributions: {
    slots: [],
    points: ['loop.chat.surface', 'loop.command'],
    commands: ['notebook'],
  },
  contributionPoints: ['loop.notebook.opening', 'loop.notebook.toolbar'],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const PAGE_LAYOUT_UI_0_0_1: UISpec = {
  id: 'page-layout',
  version: '0.0.1',
  name: 'Page layout',
  description:
    'The work on a centred sheet like a document, the composer above it and the conversation in a panel beside it; or the conversation and the work side by side.',
  emoji: '📄',
  octicon: 'file',
  plugin: '@datalayer/loop-plugin-page-layout',
  folder: 'page-layout',
  contributions: {
    slots: ['loop.header'],
    points: ['loop.chat.layout', 'loop.prompt.panel'],
    commands: [],
  },
  contributionPoints: [],
  settings: {
    type: 'object',
    properties: {
      arrangement: {
        type: 'string',
        title: 'Arrangement',
        description:
          'The work on a sheet with the conversation in a panel, or both side by side.',
        enum: ['page', 'split'],
        default: 'page',
      },
      turnPanel: {
        type: 'string',
        title: 'Current turn',
        description: 'Where the current turn hangs on the composer.',
        enum: ['below', 'above', 'none'],
        default: 'below',
      },
      turnPanelFooter: {
        type: 'string',
        title: 'Under the reply',
        description:
          'What is drawn under the reply: everything, its actions, or nothing.',
        enum: ['full', 'actions', 'none'],
        default: 'full',
      },
      prompt: {
        type: 'string',
        title: 'Composer',
        description: 'Docked above the sheet, or floating over it.',
        enum: ['docked', 'floating'],
        default: 'docked',
      },
      promptAnchor: {
        type: 'string',
        title: 'Floating composer starts',
        description: 'The edge a floating composer starts at.',
        enum: ['top', 'bottom'],
        default: 'top',
      },
      pageSize: {
        type: 'object',
        title: 'Sheet',
        description:
          'The sheet: free at its reading width when unsaid, or a paper (letter, a4) whose width it takes, with a width or a height of its own over either.',
        properties: {
          format: {
            type: 'string',
            title: 'Paper',
            description: 'The paper the sheet is.',
            enum: ['free', 'letter', 'a4'],
          },
          width: {
            type: 'number',
            title: 'Width',
            description:
              "The sheet's width in pixels; over a paper, it replaces the paper's.",
          },
          height: {
            type: 'number',
            title: 'Height',
            description:
              "The sheet's least height in pixels; what is past it grows the sheet.",
          },
        },
      },
    },
  },
  renderers: [],
  catalog: '',
  components: [],
};

export const PAP_SIGN_IN_UI_0_0_1: UISpec = {
  id: 'pap-sign-in',
  version: '0.0.1',
  name: 'Sign in at a company',
  description:
    'Where your agent asks you to sign in at a company: its page, the code, and until when.',
  emoji: '🔑',
  octicon: 'sign-in',
  plugin: '@datalayer/loop-plugin-pap-sign-in',
  folder: 'pap-sign-in',
  contributions: {
    slots: ['loop.chatHeader'],
    points: ['reactor.ui.renderer', 'reactor.ui.toolBinding'],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: ['mcp-ui'],
  catalog: '',
  components: [],
};

export const PROMPT_UI_0_0_1: UISpec = {
  id: 'prompt',
  version: '0.0.1',
  name: 'Floating composer',
  description:
    'The composer in a card you move over the page, and the commands that bring it back or start over.',
  emoji: '🪶',
  octicon: 'paper-airplane',
  plugin: '@datalayer/loop-plugin-prompt',
  folder: 'prompt',
  contributions: {
    slots: ['loop.promptAction'],
    points: ['loop.command'],
    commands: ['new', 'prompt'],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const SPREADSHEET_VIEW_UI_0_0_1: UISpec = {
  id: 'spreadsheet-view',
  version: '0.0.1',
  name: 'Spreadsheet button',
  description:
    'The spreadsheet beside the conversation, from under the composer.',
  emoji: '🧮',
  octicon: 'table',
  plugin: '@datalayer/loop-plugin-spreadsheet-view',
  folder: 'spreadsheet-view',
  contributions: {
    slots: ['loop.promptAction'],
    points: [],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const SPREADSHEET_UI_0_0_1: UISpec = {
  id: 'spreadsheet',
  version: '0.0.1',
  name: 'Spreadsheet',
  description: 'A workbook beside the conversation, drawn by Datalayer Cells.',
  emoji: '🧮',
  octicon: 'table',
  plugin: '@datalayer/loop-plugin-spreadsheet',
  folder: 'spreadsheet',
  contributions: {
    slots: [],
    points: ['loop.chat.surface', 'loop.command'],
    commands: ['spreadsheet'],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const SUBAGENT_ACTIVITY_UI_0_0_1: UISpec = {
  id: 'subagent-activity',
  version: '0.0.1',
  name: 'Delegated work',
  description:
    'The face of an agent yours handed work to, pulsing while it works.',
  emoji: '👥',
  octicon: 'people',
  plugin: '@datalayer/loop-plugin-subagent-activity',
  folder: 'subagent-activity',
  contributions: {
    slots: ['loop.inpromptMenu'],
    points: [],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const WINDOW_FRAME_UI_0_0_1: UISpec = {
  id: 'window-frame',
  version: '0.0.1',
  name: 'Window',
  description:
    'Draws the editor as a window, with room in its title bar for controls and actions.',
  emoji: '🪟',
  octicon: 'browser',
  plugin: '@datalayer/loop-plugin-window-frame',
  folder: 'window-frame',
  contributions: {
    slots: ['loop.header', 'loop.window.controls'],
    points: [],
    commands: [],
  },
  contributionPoints: [],
  settings: {},
  renderers: [],
  catalog: '',
  components: [],
};

export const UI_CATALOGUE: Record<string, UISpec> = {
  'a2ui-surface': A2UI_SURFACE_UI_0_0_1,
  'a2ui-view': A2UI_VIEW_UI_0_0_1,
  agentspecs: AGENTSPECS_UI_0_0_1,
  'app-activity': APP_ACTIVITY_UI_0_0_1,
  'app-components': APP_COMPONENTS_UI_0_0_1,
  'app-computer': APP_COMPUTER_UI_0_0_1,
  'app-elements': APP_ELEMENTS_UI_0_0_1,
  'app-page': APP_PAGE_UI_0_0_1,
  'app-rules': APP_RULES_UI_0_0_1,
  'canvas-blocks': CANVAS_BLOCKS_UI_0_0_1,
  'canvas-parts': CANVAS_PARTS_UI_0_0_1,
  'chat-extras': CHAT_EXTRAS_UI_0_0_1,
  'chat-header': CHAT_HEADER_UI_0_0_1,
  'chat-view': CHAT_VIEW_UI_0_0_1,
  chat: CHAT_UI_0_0_1,
  commands: COMMANDS_UI_0_0_1,
  'document-toolbar': DOCUMENT_TOOLBAR_UI_0_0_1,
  'document-view': DOCUMENT_VIEW_UI_0_0_1,
  document: DOCUMENT_UI_0_0_1,
  'input-prompt': INPUT_PROMPT_UI_0_0_1,
  models: MODELS_UI_0_0_1,
  'notebook-toolbar': NOTEBOOK_TOOLBAR_UI_0_0_1,
  'notebook-view': NOTEBOOK_VIEW_UI_0_0_1,
  notebook: NOTEBOOK_UI_0_0_1,
  'page-layout': PAGE_LAYOUT_UI_0_0_1,
  'pap-sign-in': PAP_SIGN_IN_UI_0_0_1,
  prompt: PROMPT_UI_0_0_1,
  'spreadsheet-view': SPREADSHEET_VIEW_UI_0_0_1,
  spreadsheet: SPREADSHEET_UI_0_0_1,
  'subagent-activity': SUBAGENT_ACTIVITY_UI_0_0_1,
  'window-frame': WINDOW_FRAME_UI_0_0_1,
};

/** The UI plugin an agent's or an application's `ui` names, or undefined. */
export function getUI(pluginId: string): UISpec | undefined {
  return UI_CATALOGUE[pluginId];
}

export function listUI(): UISpec[] {
  return Object.values(UI_CATALOGUE);
}

/** The visual components the UI plugins render, by the name a surface gives them (C-13). */
export const COMPONENT_CATALOGUE: Record<string, ComponentSpec> =
  Object.fromEntries(
    Object.values(UI_CATALOGUE).flatMap(plugin =>
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
