/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's page, as data: what it publishes to its surface by path,
 * what it takes from it, and what a button on it does (LOOP R-01, R-01b,
 * C-04).
 *
 * A chat, a widget or a worker runs as its conversation. Its page is its
 * A2UI surface (`interface.surface`) drawn beside that conversation, fed from
 * it: the question last asked, the answer as it streams, where the turn
 * stands, a chat's whole conversation. What a block writes — an input's `value` — stays in the surface's
 * data model at a path the application takes, and what a button does reaches
 * the application through the chat's own channels: a message sent, the
 * answer stopped, the conversation started over. Nothing here is a server
 * API: what a button did besides its message — the block's action, the files
 * given, the settings — goes with the chat's own run to the application's
 * session (LOOP R-04, `forwardedProps.loop`), which puts a file where the
 * application reads it; a setting also reaches a written application in the
 * words of its message.
 *
 * A decision is not here: its page is drawn by the Studio's run page, with
 * its own paths (`INTERFACE_PATHS`), until it moves onto the workspace (R-02).
 *
 * Pure: the plugin (`./index`) and its view (`./AppPage`) do the drawing.
 *
 * @module loop/plugins/app-page/appPageModel
 */

import type { AppSettingSpec, AppSpec } from '../../../types/agentspecs';
import type {
  ChatTurnSnapshot,
  ChatTurnStatus,
  ConversationEntry,
} from '../../core';

/** The id of the editor surface an application's page is drawn in. */
export const APP_PAGE_SURFACE = 'app-page';

/** The id of the A2UI surface itself, inside it. */
export const APP_PAGE_SURFACE_ID = 'app';

/** The kinds that run as their conversation and may have a page drawn by it. */
export type AppPageKind = 'chat' | 'widget' | 'worker';

/**
 * One thing an application publishes to its page, or takes from it, by
 * path. The shape of the Studio's `InterfacePath`, so that the Canvas reads
 * this list as it reads a decision's.
 */
export type AppPagePath = {
  path: string;
  /** What it is, for a composer. */
  meaning: string;
  /** What it is, for a person choosing it on the Canvas. */
  words: string;
  list?: boolean;
};

/** What a Button on the page may do: the Studio's `InterfaceAction`. */
export type AppPageAction = {
  name: string;
  meaning: string;
  words: string;
  /** The keys its context may carry. */
  context: string[];
  /** Each key, in words. */
  asks: Record<string, string>;
};

/** What one kind gives its page and takes from it. */
export type AppKindPaths = {
  /** What a block may show. */
  publishes: AppPagePath[];
  /** Where what a block writes is read. */
  accepts: AppPagePath[];
  /** What a Button may do. */
  actions: AppPageAction[];
  /**
   * Whether each of the application's settings (`interface.settings`) is
   * also published and taken, at `/inputs/<id>` — see {@link appKindPaths}.
   */
  inputs: boolean;
};

const APP: AppPagePath = {
  path: '/app',
  meaning: "The application's name.",
  words: 'Its name',
};

const STATUS: AppPagePath = {
  path: '/status',
  meaning:
    'Where its answer stands, in a word: Ready, Thinking, Answering, Answered or Stopped.',
  words: 'Where its answer stands',
};

const DRAFT: AppPagePath = {
  path: '/draft',
  meaning: 'A message written on the page, which a Send button sends.',
  words: 'A message to send',
};

const SEND: AppPageAction = {
  name: 'send',
  meaning:
    'Send a message to the application: the context’s message, or what is written at /draft.',
  words: 'Send the message',
  context: ['message'],
  asks: { message: 'The message it sends' },
};

const MESSAGES: AppPagePath = {
  path: '/messages',
  meaning:
    'The conversation so far, in order: each message {role: user or assistant, text}, each tool called {role: tool, name, args, result}.',
  words: 'The conversation',
  list: true,
};

const FILES: AppPagePath = {
  path: '/files',
  meaning:
    'The files given on the page, each {name, type, size, data_url}: they go to the application’s session with the next run, put in its sandbox when it has a shell, a text file in the message when it has none.',
  words: 'The files given',
  list: true,
};

const STOP: AppPageAction = {
  name: 'stop',
  meaning: 'Stop the answer being written.',
  words: 'Stop the answer',
  context: [],
  asks: {},
};

/**
 * What each kind publishes to its page and takes from it, by path — the
 * least that is real today, read from the conversation it runs as.
 */
export const APP_KIND_PATHS: Record<AppPageKind, AppKindPaths> = {
  chat: {
    publishes: [
      APP,
      {
        path: '/question',
        meaning: 'The question last asked.',
        words: 'The question last asked',
      },
      {
        path: '/answer',
        meaning: 'Its answer to it, as it is written.',
        words: 'Its answer',
      },
      STATUS,
      MESSAGES,
    ],
    accepts: [DRAFT],
    actions: [
      SEND,
      STOP,
      {
        name: 'new',
        meaning: 'Start the conversation over.',
        words: 'Start over',
        context: [],
        asks: {},
      },
    ],
    inputs: true,
  },
  widget: {
    publishes: [
      APP,
      {
        path: '/output',
        meaning: 'What it gave for the inputs last run, as it is written.',
        words: 'What it gave',
      },
      STATUS,
    ],
    accepts: [FILES],
    actions: [
      {
        name: 'run',
        meaning:
          'Run it on its inputs: every value written under /inputs is sent, and each file at /files, with the context’s message when there is one.',
        words: 'Run it on its inputs',
        context: ['message'],
        asks: { message: 'What it says before the inputs' },
      },
      {
        name: 'upload',
        meaning:
          'Run it on the files just given — the context’s files, else those at /files — with its inputs.',
        words: 'Run it on the files given',
        context: ['files'],
        asks: { files: 'The files it runs on' },
      },
      STOP,
    ],
    inputs: true,
  },
  worker: {
    publishes: [
      APP,
      {
        path: '/goal',
        meaning: 'What it works toward.',
        words: 'What it works toward',
      },
      {
        path: '/activity',
        meaning: 'What it is doing right now, in a short line, or nothing.',
        words: 'What it is doing now',
      },
      {
        path: '/report',
        meaning: 'What it last said, as it is written.',
        words: 'What it last said',
      },
      STATUS,
    ],
    accepts: [DRAFT],
    actions: [SEND, STOP],
    inputs: false,
  },
};

/** Whether a kind runs as its conversation and has its paths here. */
export const isAppPageKind = (kind: string): kind is AppPageKind =>
  Object.prototype.hasOwnProperty.call(APP_KIND_PATHS, kind);

/** The path a setting, an input of the page, is kept at. */
export const inputPath = (id: string): string => `/inputs/${id}`;

/**
 * What an application publishes and takes, with its own settings: the kind's
 * list, and for a kind that has inputs each setting at `/inputs/<id>`, both
 * shown and written. Empty lists for a decision, or a kind not known.
 */
export function appKindPaths(
  app: Pick<AppSpec, 'kind' | 'interface'>,
): AppKindPaths {
  if (!isAppPageKind(app.kind)) {
    return { publishes: [], accepts: [], actions: [], inputs: false };
  }
  const kind = APP_KIND_PATHS[app.kind];
  if (!kind.inputs) {
    return kind;
  }
  const inputs = app.interface.settings.map(setting => ({
    path: inputPath(setting.id),
    meaning: `The setting “${setting.label || setting.id}”.`,
    words: setting.label || setting.id,
  }));
  return {
    ...kind,
    publishes: [...kind.publishes, ...inputs],
    accepts: [...kind.accepts, ...inputs],
  };
}

/** The components its surface has, or none. */
const surfaceComponents = (app: Pick<AppSpec, 'interface'>) =>
  app.interface.surface?.components ?? [];

/**
 * Whether the workspace draws the application's page: a chat, a widget or a
 * worker whose layout has one (`page`, `split`). A `chat` layout is the
 * conversation alone: a surface composed for it is not drawn, which
 * `surfaceUnshown` says in a sentence.
 */
export function hasAppPage(
  app: Pick<AppSpec, 'kind' | 'interface' | 'agent'>,
): boolean {
  if (!app.agent || !isAppPageKind(app.kind)) {
    return false;
  }
  return app.interface.layout !== 'chat';
}

/**
 * Why a composed surface is not drawn, or `null` when it is (or there is
 * none): the application's layout is `chat`, the conversation alone.
 */
export function surfaceUnshown(
  app: Pick<AppSpec, 'kind' | 'interface' | 'agent'>,
): string | null {
  if (
    !app.agent ||
    !isAppPageKind(app.kind) ||
    app.interface.layout !== 'chat' ||
    surfaceComponents(app).length === 0
  ) {
    return null;
  }
  return 'Its page is composed but its layout is chat, the conversation alone: choose page or split to show it.';
}

const STATUS_WORDS: Record<ChatTurnStatus, string> = {
  idle: 'Ready',
  thinking: 'Thinking',
  streaming: 'Answering',
  done: 'Answered',
  error: 'Stopped',
};

/** A setting's first value, as its input holds it. */
export function initialInput(setting: AppSettingSpec): unknown {
  switch (setting.type) {
    case 'toggle':
      return Boolean(setting.default ?? false);
    case 'select':
      // A ChoicePicker holds a list of the values chosen.
      return setting.default === undefined ? [] : [String(setting.default)];
    case 'slider':
      return Number(setting.default ?? setting.min ?? 0);
    case 'number':
      return setting.max === undefined
        ? String(setting.default ?? '')
        : Number(setting.default ?? setting.min ?? 0);
    default:
      return String(setting.default ?? '');
  }
}

/**
 * What the conversation publishes to the page, by path, now: from its
 * current turn, and for a chat its whole conversation.
 */
export function appPageData(
  app: Pick<AppSpec, 'kind' | 'name' | 'goal'>,
  turn: ChatTurnSnapshot,
  conversation: ConversationEntry[],
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    '/app': app.name,
    '/status': STATUS_WORDS[turn.status] ?? '',
  };
  switch (app.kind) {
    case 'chat':
      data['/question'] = turn.user ?? '';
      data['/answer'] = turn.assistant ?? '';
      data['/messages'] = conversation;
      break;
    case 'widget':
      data['/output'] = turn.assistant ?? '';
      break;
    case 'worker':
      data['/goal'] = app.goal;
      data['/activity'] = turn.activity ?? '';
      data['/report'] = turn.assistant ?? '';
      break;
    default:
      break;
  }
  return data;
}

/** The page's data model when it is drawn: what is published, the inputs, the draft. */
export function appPageInitialData(
  app: Pick<AppSpec, 'kind' | 'name' | 'goal' | 'interface'>,
): Record<string, unknown> {
  const tree: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(
    appPageData(app, { id: 0, status: 'idle' }, []),
  )) {
    tree[path.slice(1)] = value;
  }
  const paths = appKindPaths(app);
  if (paths.inputs) {
    tree.inputs = Object.fromEntries(
      app.interface.settings.map(setting => [
        setting.id,
        initialInput(setting),
      ]),
    );
  }
  if (paths.accepts.some(entry => entry.path === DRAFT.path)) {
    tree.draft = '';
  }
  if (paths.accepts.some(entry => entry.path === FILES.path)) {
    tree.files = [];
  }
  return tree;
}

/** One input in words: `Plan: Team`; nothing for an empty one. */
function inputWords(label: string, value: unknown): string {
  const shown = Array.isArray(value)
    ? value.map(String).join(', ')
    : typeof value === 'boolean'
      ? value
        ? 'yes'
        : 'no'
      : value === undefined || value === null
        ? ''
        : String(value);
  return shown.trim() ? `${label}: ${shown}` : '';
}

/**
 * The inputs written on the page, in words, one per line: each setting by
 * its label, then any other value a block wrote under `/inputs` by its id.
 */
export function inputsInWords(
  app: Pick<AppSpec, 'interface'>,
  inputs: unknown,
): string {
  const values =
    inputs && typeof inputs === 'object'
      ? (inputs as Record<string, unknown>)
      : {};
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const setting of app.interface.settings) {
    seen.add(setting.id);
    lines.push(inputWords(setting.label || setting.id, values[setting.id]));
  }
  for (const [id, value] of Object.entries(values)) {
    if (!seen.has(id)) {
      lines.push(inputWords(id, value));
    }
  }
  return lines.filter(Boolean).join('\n');
}

/**
 * The largest file a session takes: what the session API refuses above
 * (`agent_runtimes.loop.apps.sessions.MAX_FILE_BYTES`), said here before
 * the file is sent.
 */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** A file as File upload gives it, and as the session API takes it. */
export type GivenFile = {
  name: string;
  type: string;
  size: number;
  data_url: string;
};

/**
 * The files given on the page, as the session API takes them — or why they
 * cannot go: what was given is not files as File upload gives them, or one
 * is larger than a session takes. What becomes of each — put in the
 * application's sandbox, or its text in the message — is the session's to
 * decide (LOOP R-04).
 */
export function givenFiles(
  files: unknown,
): { files: GivenFile[] } | { refused: string } {
  if (files === undefined || files === null) {
    return { files: [] };
  }
  if (!Array.isArray(files)) {
    return { refused: 'What was given as files is not a list of files.' };
  }
  const given: GivenFile[] = [];
  for (const [index, file] of files.entries()) {
    const item = (file ?? {}) as Record<string, unknown>;
    if (typeof item.name !== 'string' || typeof item.data_url !== 'string') {
      return {
        refused: `File ${index + 1} is not a file as File upload gives it ({name, type, size, data_url}).`,
      };
    }
    const size = typeof item.size === 'number' ? item.size : 0;
    if (size > MAX_FILE_BYTES) {
      return {
        refused: `${item.name} is ${size.toLocaleString('en')} bytes: a session takes files of at most ${MAX_FILE_BYTES.toLocaleString('en')}.`,
      };
    }
    given.push({
      name: item.name,
      type: typeof item.type === 'string' ? item.type : '',
      size,
      data_url: item.data_url,
    });
  }
  return { files: given };
}

/**
 * The application's settings as the page holds them, as the session API
 * takes them: a choice as the option chosen, a number as a number, a toggle
 * as on or off — each setting the page has a value for.
 */
export function settingsOf(
  app: Pick<AppSpec, 'interface'>,
  inputs: unknown,
): Record<string, unknown> {
  const values =
    inputs && typeof inputs === 'object'
      ? (inputs as Record<string, unknown>)
      : {};
  const settings: Record<string, unknown> = {};
  for (const setting of app.interface.settings) {
    const value = values[setting.id];
    if (value === undefined || value === null) {
      continue;
    }
    switch (setting.type) {
      case 'select': {
        const chosen = Array.isArray(value) ? value[0] : value;
        if (chosen !== undefined && chosen !== '') {
          settings[setting.id] = String(chosen);
        }
        break;
      }
      case 'toggle':
        settings[setting.id] = Boolean(value);
        break;
      case 'slider':
      case 'number':
        if (value !== '' && !Number.isNaN(Number(value))) {
          settings[setting.id] = Number(value);
        }
        break;
      default:
        settings[setting.id] = String(value);
    }
  }
  return settings;
}

/**
 * What the page did besides its message, for the session API: the action of
 * the block pressed, the files given with it, the settings it holds. Sent
 * with the chat's own run (AG-UI's `forwardedProps.loop`), so that what it
 * answers streams in the conversation (LOOP R-04).
 */
export type AppPageLoop = {
  action: { name: string; payload: Record<string, unknown> };
  files?: GivenFile[];
  settings?: Record<string, unknown>;
};

/** What a button asked, as the surface hands it over. */
export type AppPageEvent = {
  name: string;
  context?: Record<string, unknown>;
};

/** What the page does about a button: at most one of these. */
export type AppPageOutcome =
  | {
      /** A message for the application, sent as the person's next turn. */
      send: string;
      /** What the page did besides, for the session it is sent in. */
      loop: AppPageLoop;
      /** The inputs in words as sent, to tell a change next time. */
      inputs: string;
      /** Paths to empty once it is sent. */
      clear: string[];
    }
  | { stop: true }
  | { newChat: true }
  | { refused: string };

/**
 * What a button pressed on the page does.
 *
 * `read` gives what is in the surface's data model at a path; `lastInputs`
 * is the inputs in words as last sent, so that a chat's message carries its
 * settings only when they changed.
 */
export function appPageAction(
  app: Pick<AppSpec, 'kind' | 'name' | 'interface'>,
  event: AppPageEvent,
  read: (path: string) => unknown,
  lastInputs = '',
): AppPageOutcome {
  const paths = appKindPaths(app);
  if (!paths.actions.some(action => action.name === event.name)) {
    const offered = paths.actions.map(action => action.name).join(', ');
    return {
      refused: offered
        ? `“${event.name}” is not something ${app.name} does: it does ${offered}.`
        : `${app.name} handles no button.`,
    };
  }
  const given = event.context?.message;
  const message = typeof given === 'string' ? given.trim() : '';
  const inputs = paths.inputs ? inputsInWords(app, read('/inputs')) : '';
  const settings = paths.inputs ? settingsOf(app, read('/inputs')) : undefined;
  const payload = Object.fromEntries(
    Object.entries(event.context ?? {}).filter(
      ([key]) => key !== 'message' && key !== 'files',
    ),
  );
  const loop = (files?: GivenFile[]): AppPageLoop => ({
    action: { name: event.name, payload },
    ...(files && files.length > 0 ? { files } : {}),
    ...(settings ? { settings } : {}),
  });
  switch (event.name) {
    case 'stop':
      return { stop: true };
    case 'new':
      return { newChat: true };
    case 'run':
    case 'upload': {
      const context = event.context?.files;
      const files = givenFiles(
        event.name === 'upload' && context !== undefined
          ? context
          : read(FILES.path),
      );
      if ('refused' in files) {
        return files;
      }
      if (event.name === 'upload' && files.files.length === 0) {
        return { refused: 'No file was given: choose one first.' };
      }
      const names = files.files.map(file => file.name).join(', ');
      const text =
        [message, inputs].filter(Boolean).join('\n') ||
        (names ? `Run on ${names}.` : '');
      return text
        ? { send: text, inputs, clear: [], loop: loop(files.files) }
        : { refused: `${app.name} has no inputs to run on: set one first.` };
    }
    default: {
      const draft = read(DRAFT.path);
      const written =
        message || (typeof draft === 'string' ? draft.trim() : '');
      if (!written) {
        return { refused: 'Nothing to send: write a message first.' };
      }
      const changed = inputs && inputs !== lastInputs;
      return {
        send: changed ? `${written}\n\n${inputs}` : written,
        inputs,
        clear: message ? [] : [DRAFT.path],
        loop: loop(),
      };
    }
  }
}

/** A Text, a Button and its label: the parts the default pages are made of. */
type Component = { id: string; component: string; [key: string]: unknown };

const text = (id: string, path: string, variant?: string): Component => ({
  id,
  component: 'Text',
  text: { path },
  ...(variant ? { variant } : {}),
});

const button = (
  id: string,
  label: string,
  name: string,
  primary = false,
): Component[] => [
  {
    id,
    component: 'Button',
    child: `${id}-label`,
    ...(primary ? { variant: 'primary' } : {}),
    action: { event: { name } },
  },
  { id: `${id}-label`, component: 'Text', text: label },
];

/** A setting as the input of the catalog that holds its value. */
function settingInput(setting: AppSettingSpec): Component {
  const base = {
    id: `input-${setting.id}`,
    label: setting.label || setting.id,
    value: { path: inputPath(setting.id) },
  };
  switch (setting.type) {
    case 'toggle':
      return { ...base, component: 'CheckBox' };
    case 'select':
      return {
        ...base,
        component: 'ChoicePicker',
        options: setting.options.map(option => ({
          label: option,
          value: option,
        })),
      };
    case 'slider':
      return {
        ...base,
        component: 'Slider',
        min: setting.min ?? 0,
        max: setting.max ?? 100,
      };
    case 'number':
      return setting.max === undefined
        ? { ...base, component: 'TextField', variant: 'number' }
        : {
            ...base,
            component: 'Slider',
            min: setting.min ?? 0,
            max: setting.max,
          };
    default:
      return { ...base, component: 'TextField' };
  }
}

/**
 * The page drawn when the application has a page layout and no surface
 * composed: what its kind publishes, its settings as inputs, and the
 * buttons its kind handles that the conversation does not already give.
 */
export function defaultAppSurface(
  app: Pick<AppSpec, 'kind' | 'interface'>,
): Component[] {
  const inputs = appKindPaths(app).inputs
    ? app.interface.settings.map(settingInput)
    : [];
  const body: Component[] = [];
  switch (app.kind) {
    case 'chat':
      body.push(
        text('question', '/question', 'h3'),
        text('answer', '/answer'),
        text('status', '/status', 'caption'),
        ...inputs,
      );
      break;
    case 'widget':
      body.push(
        ...inputs,
        { id: 'actions', component: 'Row', children: ['run', 'stop'] },
        ...button('run', 'Run', 'run', true),
        ...button('stop', 'Stop', 'stop'),
        text('status', '/status', 'caption'),
        text('output', '/output'),
      );
      break;
    case 'worker':
      body.push(
        text('goal', '/goal', 'h3'),
        text('status', '/status', 'caption'),
        text('activity', '/activity', 'caption'),
        text('report', '/report'),
      );
      break;
    default:
      break;
  }
  // The root's children: what is not inside a Row or a Button.
  const inner = new Set(
    body.flatMap(component =>
      [
        ...(Array.isArray(component.children) ? component.children : []),
        component.child,
      ].filter((id): id is string => typeof id === 'string'),
    ),
  );
  return [
    {
      id: 'root',
      component: 'Column',
      children: body
        .map(component => component.id)
        .filter(id => !inner.has(id)),
    },
    ...body,
  ];
}

/**
 * The A2UI messages that draw the application's page: its surface composed,
 * or the default page of its kind, fed its first data.
 */
export function appPageMessages(
  app: Pick<AppSpec, 'kind' | 'name' | 'goal' | 'interface'>,
  catalogId: string,
) {
  const composed = surfaceComponents(app);
  return [
    {
      version: 'v0.9' as const,
      createSurface: { surfaceId: APP_PAGE_SURFACE_ID, catalogId },
    },
    {
      version: 'v0.9' as const,
      updateComponents: {
        surfaceId: APP_PAGE_SURFACE_ID,
        components: composed.length > 0 ? composed : defaultAppSurface(app),
      },
    },
    {
      version: 'v0.9' as const,
      updateDataModel: {
        surfaceId: APP_PAGE_SURFACE_ID,
        path: '/',
        value: appPageInitialData(app),
      },
    },
  ];
}
