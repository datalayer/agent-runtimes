/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Agent Inspector's record: what an agent does, as it does it, one entry
 * a thing — an A2A request or event, an MCP tool call, a skill, a frontend or
 * backend tool, a model turn, an approval — each with its time, the agent
 * that did it (`actor`), where it came from (`source`), its kind, its name,
 * its status and, once it ends, its duration, a line that says it, and its
 * payload whole.
 *
 * A call's start and its end are one entry: {@link AgentInspectorSink.start}
 * opens it under a key (a tool call's id), {@link AgentInspectorSink.end}
 * closes it with its result. Anything can push into a sink: the A2A capture
 * (`inspectA2AFetch`), a team (`useA2ATeam`'s `inspector`), a chat
 * (`ChatBase`, under {@link AgentInspectorProvider}). `AgentInspector` draws
 * it.
 *
 * @module components/inspector/agentInspector
 */

import {
  createContext,
  createElement,
  useContext,
  useState,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from 'react';

/** Where an entry comes from. */
export type AgentInspectorSource =
  | 'a2a'
  | 'mcp'
  | 'skill'
  | 'frontend-tool'
  | 'backend-tool'
  | 'model'
  | 'approval';

/** Every source, in the order the filters list them. */
export const AGENT_INSPECTOR_SOURCES: readonly AgentInspectorSource[] = [
  'a2a',
  'mcp',
  'skill',
  'frontend-tool',
  'backend-tool',
  'model',
  'approval',
];

/** A source, in words. */
export const AGENT_INSPECTOR_SOURCE_LABELS: Record<
  AgentInspectorSource,
  string
> = {
  a2a: 'A2A',
  mcp: 'MCP',
  skill: 'Skill',
  'frontend-tool': 'Frontend tool',
  'backend-tool': 'Backend tool',
  model: 'Model',
  approval: 'Approval',
};

export type AgentInspectorStatus = 'running' | 'done' | 'failed';

/** What A2A says of an entry: its JSON-RPC method and id, its task and context, its state. */
export type AgentInspectorA2A = {
  method?: string;
  rpcId?: string | number;
  taskId?: string;
  contextId?: string;
  /** `TASK_STATE_WORKING`, … */
  state?: string;
  /** The tool step a status carries: its call's id, and whether it is its end. */
  step?: { toolId?: string; name: string; ended: boolean };
  /** The artifact an artifact update is a chunk of. */
  artifactId?: string;
  /** How many chunks an artifact entry holds. */
  chunks?: number;
};

export type AgentInspectorEntry = {
  id: string;
  /** When it happened, or started: ms since the epoch. */
  at: number;
  /** When it ended, for a call. */
  endedAt?: number;
  /** Which agent did it. */
  actor: string;
  source: AgentInspectorSource;
  /** `request`, `status-update`, `artifact-update`, `task`, `message`, `tool-call`, `turn`, … */
  kind: string;
  /** The tool's, skill's or method's name. */
  name?: string;
  /** Its mark, as `SpecMark` draws it. */
  icon?: string;
  emoji?: string;
  status?: AgentInspectorStatus;
  /** One line that says it. */
  summary: string;
  /** Which way it went, between two agents. */
  direction?: { from: string; to: string };
  a2a?: AgentInspectorA2A;
  /** What was sent: a message, or a call's arguments. */
  payload?: unknown;
  /** What came back, for a call. */
  result?: unknown;
  error?: string;
  /** How large `payload` and `result` are, as JSON, in bytes. */
  bytes: number;
  /** The key a call's start and end share. */
  key?: string;
  /** Entries this one goes with: a tool call's A2A statuses, … */
  links: string[];
  /** What a caller made of it: the semantic events attached (`A2APeerEvent`, …). */
  events: unknown[];
};

/** What is pushed: an entry, less what the sink works out. */
export type AgentInspectorInput = Omit<
  AgentInspectorEntry,
  'id' | 'at' | 'bytes' | 'links' | 'events'
> & { at?: number; links?: string[] };

/** How a call ended. */
export type AgentInspectorOutcome = {
  status?: Exclude<AgentInspectorStatus, 'running'>;
  result?: unknown;
  error?: string;
  at?: number;
  summary?: string;
  links?: string[];
};

/** A session, exported. */
export type AgentInspectorExport = {
  exportedAt: string;
  entries: AgentInspectorEntry[];
};

export interface AgentInspectorSink {
  /** Record something that happened at once; returns its id. */
  push(input: AgentInspectorInput): string;
  /**
   * Open a call under `key`; a call already open under it has its payload
   * and summary updated instead (arguments that stream in).
   */
  start(input: AgentInspectorInput & { key: string }): string;
  /** Close the call open under `key`; `undefined` when none is. */
  end(key: string, outcome?: AgentInspectorOutcome): string | undefined;
  /** Change an entry. */
  update(
    id: string,
    patch: (entry: AgentInspectorEntry) => Partial<AgentInspectorEntry>,
  ): void;
  /**
   * Attach a semantic event to the newest entry `match` takes, or to the
   * first that arrives and does (a few are kept waiting).
   */
  attach(match: (entry: AgentInspectorEntry) => boolean, event: unknown): void;
  /** Whether a call is open under `key`. */
  running(key: string): boolean;
  /**
   * Say what a caller made of something (an `A2APeerEvent`): it is attached
   * to the entry it came from, as the first linker that knows it says
   * (`addLinker`; the A2A capture adds one). Nothing knows it: dropped.
   */
  note(event: unknown): void;
  /** Teach the sink to link a kind of event to its entry; returns its removal. */
  addLinker(linker: AgentInspectorLinker): () => void;
  clear(): void;
  entries(): readonly AgentInspectorEntry[];
  subscribe(listener: () => void): () => void;
  exportSession(): AgentInspectorExport;
}

/** The entry an event came from, as a matcher; `undefined` for an event it does not know. */
export type AgentInspectorLinker = (
  event: unknown,
) => ((entry: AgentInspectorEntry) => boolean) | undefined;

/** How large a value is, as JSON, in bytes. */
export function jsonBytes(value: unknown): number {
  if (value === undefined) {
    return 0;
  }
  try {
    const text = JSON.stringify(value);
    return text === undefined ? 0 : new TextEncoder().encode(text).length;
  } catch {
    return 0;
  }
}

/** A size, in words: `812 B`, `12.3 kB`, `1.2 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) {
    return `${bytes} B`;
  }
  if (bytes < 1_000_000) {
    return `${(bytes / 1000).toFixed(1)} kB`;
  }
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** A line short enough for a row. */
export function shortLine(text: string, length = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

export type AgentInspectorOptions = {
  /** The clock: `Date.now` unless a test sets it. */
  now?: () => number;
  /** The most entries kept: the oldest go first. */
  limit?: number;
};

/** How many semantic events wait for their entry. */
const PENDING_LIMIT = 32;

/** Make a sink: the record, and who listens to it. */
export function createAgentInspector(
  options: AgentInspectorOptions = {},
): AgentInspectorSink {
  const now = options.now ?? Date.now;
  const limit = options.limit ?? 2000;
  let list: AgentInspectorEntry[] = [];
  let counter = 0;
  const open = new Map<string, string>();
  const listeners = new Set<() => void>();
  let pending: {
    match: (entry: AgentInspectorEntry) => boolean;
    event: unknown;
  }[] = [];
  let scheduled = false;
  const linkers = new Set<AgentInspectorLinker>();

  const notify = () => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      listeners.forEach(listener => listener());
    });
  };

  const replace = (id: string, next: AgentInspectorEntry) => {
    list = list.map(entry => (entry.id === id ? next : entry));
  };

  const settlePending = (entry: AgentInspectorEntry): AgentInspectorEntry => {
    if (!pending.length) {
      return entry;
    }
    const taken = pending.filter(waiting => waiting.match(entry));
    if (!taken.length) {
      return entry;
    }
    pending = pending.filter(waiting => !taken.includes(waiting));
    return {
      ...entry,
      events: [...entry.events, ...taken.map(waiting => waiting.event)],
    };
  };

  const push = (input: AgentInspectorInput): string => {
    counter += 1;
    const id = `e${counter}`;
    const { links, at, ...rest } = input;
    const entry = settlePending({
      ...rest,
      id,
      at: at ?? now(),
      bytes: jsonBytes(input.payload) + jsonBytes(input.result),
      links: links ?? [],
      events: [],
    });
    list = [...list, entry];
    if (list.length > limit) {
      list = list.slice(list.length - limit);
    }
    notify();
    return id;
  };

  const find = (id: string) => list.find(entry => entry.id === id);

  const sink: AgentInspectorSink = {
    push,
    start(input) {
      const known = open.get(input.key);
      const entry = known ? find(known) : undefined;
      if (entry) {
        const payload = input.payload ?? entry.payload;
        replace(entry.id, {
          ...entry,
          payload,
          summary: input.summary || entry.summary,
          links: [...entry.links, ...(input.links ?? [])],
          bytes: jsonBytes(payload) + jsonBytes(entry.result),
        });
        notify();
        return entry.id;
      }
      const id = push({ ...input, status: 'running' });
      open.set(input.key, id);
      return id;
    },
    end(key, outcome = {}) {
      const id = open.get(key);
      const entry = id ? find(id) : undefined;
      if (!id || !entry) {
        return undefined;
      }
      open.delete(key);
      const result = outcome.result ?? entry.result;
      replace(id, {
        ...entry,
        status: outcome.status ?? (outcome.error ? 'failed' : 'done'),
        endedAt: outcome.at ?? now(),
        result,
        error: outcome.error ?? entry.error,
        summary: outcome.summary ?? entry.summary,
        links: [...entry.links, ...(outcome.links ?? [])],
        bytes: jsonBytes(entry.payload) + jsonBytes(result),
      });
      notify();
      return id;
    },
    update(id, patch) {
      const entry = find(id);
      if (!entry) {
        return;
      }
      const next = { ...entry, ...patch(entry) };
      replace(id, {
        ...next,
        bytes: jsonBytes(next.payload) + jsonBytes(next.result),
      });
      notify();
    },
    attach(match, event) {
      for (let index = list.length - 1; index >= 0; index -= 1) {
        const entry = list[index];
        if (match(entry) && !entry.events.includes(event)) {
          replace(entry.id, { ...entry, events: [...entry.events, event] });
          notify();
          return;
        }
      }
      pending = [...pending, { match, event }].slice(-PENDING_LIMIT);
    },
    running(key) {
      return open.has(key);
    },
    note(event) {
      for (const linker of linkers) {
        const match = linker(event);
        if (match) {
          sink.attach(match, event);
          return;
        }
      }
    },
    addLinker(linker) {
      linkers.add(linker);
      return () => {
        linkers.delete(linker);
      };
    },
    clear() {
      list = [];
      open.clear();
      pending = [];
      notify();
    },
    entries() {
      return list;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    exportSession() {
      return { exportedAt: new Date(now()).toISOString(), entries: [...list] };
    },
  };
  return sink;
}

const NO_ENTRIES: readonly AgentInspectorEntry[] = [];
const NO_SUBSCRIPTION = () => () => undefined;

/** A sink's entries, kept current; none without a sink. */
export function useAgentInspectorEntries(
  sink: AgentInspectorSink | null | undefined,
): readonly AgentInspectorEntry[] {
  return useSyncExternalStore(
    sink ? sink.subscribe : NO_SUBSCRIPTION,
    () => (sink ? sink.entries() : NO_ENTRIES),
    () => (sink ? sink.entries() : NO_ENTRIES),
  );
}

/**
 * A sink for a page, made once (or the one given), and its entries: what a
 * page passes to its team, its chat and its `AgentInspector`.
 */
export function useAgentInspector(given?: AgentInspectorSink | null): {
  sink: AgentInspectorSink;
  entries: readonly AgentInspectorEntry[];
} {
  const [own] = useState(() => given ?? createAgentInspector());
  const sink = given ?? own;
  return { sink, entries: useAgentInspectorEntries(sink) };
}

/** The sink the chats under it push into. */
export const AgentInspectorContext = createContext<AgentInspectorSink | null>(
  null,
);

/** The sink of the nearest {@link AgentInspectorProvider}, if any. */
export function useAgentInspectorSink(): AgentInspectorSink | null {
  return useContext(AgentInspectorContext);
}

/** Every chat under it records what its agent does into `sink`. */
export function AgentInspectorProvider({
  sink,
  children,
}: {
  sink: AgentInspectorSink;
  children?: ReactNode;
}): JSX.Element {
  return createElement(
    AgentInspectorContext.Provider,
    { value: sink },
    children,
  );
}

/** What a tool call is, for the inspector: its source and its mark. */
export type ToolClass = {
  source: AgentInspectorSource;
  icon?: string;
  emoji?: string;
};

/** A call's arguments, in a few words: `kind=customer, limit=100`. */
export function argumentsLine(args: unknown, length = 100): string {
  if (!args || typeof args !== 'object') {
    return args === undefined ? '' : shortLine(String(args), length);
  }
  const parts = Object.entries(args as Record<string, unknown>).map(
    ([key, value]) =>
      `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`,
  );
  return shortLine(parts.join(', '), length);
}
