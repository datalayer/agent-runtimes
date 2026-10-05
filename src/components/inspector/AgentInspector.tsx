/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Agent Inspector: what agents do, one row a thing, newest last — the
 * time (to the millisecond, and since the first), who did it and toward
 * whom, its source and kind, its name with its mark, its status and
 * duration, and a line that says it. A row unfolds to its payload as a JSON
 * tree (a call's arguments and its result), and to what was made of it.
 *
 * Filters by source, kind and actor; *Pause* holds the rows still while the
 * record goes on, *Clear* empties it, *Export* saves the session as JSON. A
 * large payload (a notebook) says its size and stays folded until asked.
 *
 * Fed by a sink (`useAgentInspector`) or given its entries.
 *
 * @module components/inspector/AgentInspector
 */

import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { ActionList, ActionMenu, Button, Label, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  DownloadIcon,
  PlayIcon,
  TrashIcon,
  PauseIcon,
} from '@primer/octicons-react';
import { SpecMark } from '../../chat/marks';
import {
  AGENT_INSPECTOR_SOURCES,
  AGENT_INSPECTOR_SOURCE_LABELS,
  formatBytes,
  useAgentInspectorEntries,
  type AgentInspectorEntry,
  type AgentInspectorExport,
  type AgentInspectorSink,
  type AgentInspectorSource,
} from './agentInspector';
import { JsonTree } from './JsonTree';

export type AgentInspectorProps = {
  /** The record to show, kept current. */
  sink?: AgentInspectorSink | null;
  /** Or its entries, as given. */
  entries?: readonly AgentInspectorEntry[];
  /** How tall the rows grow before they scroll. */
  maxHeight?: number | string;
  /** Payloads larger than this, in bytes, stay folded until asked. */
  largeBytes?: number;
  /** What is said while nothing is recorded. */
  emptyText?: string;
  /** The file name the session is exported as, without `.json`. */
  exportName?: string;
  /**
   * One agent's own record: what it did (`actor`), and the A2A messages it
   * sent or received — one message shows in the sender's and in the
   * receiver's, the same entry, as sent in one and received in the other.
   */
  agent?: string;
};

/** Whether an entry is one agent's: done by it, or sent to or by it. */
export function isAgentsEntry(
  entry: AgentInspectorEntry,
  agent: string,
): boolean {
  return (
    entry.actor === agent ||
    entry.direction?.from === agent ||
    entry.direction?.to === agent
  );
}

/** Which way an entry went, from one agent's side: `→ Accounting`, `← Accounting`. */
export function directionFrom(
  entry: AgentInspectorEntry,
  agent: string | undefined,
): string {
  const direction = entry.direction;
  if (!direction) {
    return entry.actor;
  }
  if (agent === direction.from) {
    return `sent → ${direction.to}`;
  }
  if (agent === direction.to) {
    return `received ← ${direction.from}`;
  }
  return `${direction.from} → ${direction.to}`;
}

/** A kind, as its label is coloured. */
const KIND_VARIANTS: Record<
  string,
  | 'accent'
  | 'attention'
  | 'success'
  | 'secondary'
  | 'done'
  | 'sponsors'
  | 'primary'
  | 'danger'
  | 'severe'
> = {
  request: 'accent',
  'status-update': 'attention',
  'artifact-update': 'success',
  task: 'secondary',
  message: 'done',
  'agent-card': 'secondary',
  response: 'secondary',
  'tool-call': 'sponsors',
  turn: 'primary',
  error: 'danger',
  approval: 'severe',
};

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/** A time of day, to the millisecond: `15:44:31.299`. */
export function clockTime(at: number): string {
  const date = new Date(at);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

/** Time since the first entry: `+1.204s`. */
export function sinceFirst(at: number, first: number): string {
  return `+${((at - first) / 1000).toFixed(3)}s`;
}

/** How long a call took: `412 ms`, `3.4 s`. */
export function durationText(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export type AgentInspectorFilter = {
  sources: ReadonlySet<AgentInspectorSource>;
  kinds: ReadonlySet<string>;
  actors: ReadonlySet<string>;
};

/** The entries a filter keeps: an empty set keeps every value. */
export function filterEntries(
  entries: readonly AgentInspectorEntry[],
  filter: AgentInspectorFilter,
): AgentInspectorEntry[] {
  return entries.filter(
    entry =>
      (!filter.sources.size || filter.sources.has(entry.source)) &&
      (!filter.kinds.size || filter.kinds.has(entry.kind)) &&
      (!filter.actors.size || filter.actors.has(entry.actor)),
  );
}

/** A session, as JSON. */
export function exportEntries(
  entries: readonly AgentInspectorEntry[],
): AgentInspectorExport {
  return { exportedAt: new Date().toISOString(), entries: [...entries] };
}

function toggle<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}

function FilterMenu<T extends string>({
  label,
  options,
  selected,
  onToggle,
  onAll,
  name,
}: {
  label: string;
  options: readonly T[];
  selected: ReadonlySet<T>;
  onToggle: (value: T) => void;
  onAll: () => void;
  name: (value: T) => string;
}): JSX.Element {
  return (
    <ActionMenu>
      <ActionMenu.Button
        size="small"
        data-inspector-filter={label.toLowerCase()}
      >
        {label}
        {selected.size ? ` · ${selected.size}` : ''}
      </ActionMenu.Button>
      <ActionMenu.Overlay width="auto">
        <ActionList selectionVariant="multiple" aria-label={label}>
          <ActionList.Item selected={!selected.size} onSelect={onAll}>
            All
          </ActionList.Item>
          <ActionList.Divider />
          {options.map(option => (
            <ActionList.Item
              key={option}
              selected={selected.has(option)}
              onSelect={() => onToggle(option)}
            >
              {name(option)}
            </ActionList.Item>
          ))}
        </ActionList>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

function Payload({
  title,
  value,
  large,
}: {
  title: string;
  value: unknown;
  large: number;
}): JSX.Element {
  const bytes = useMemo(() => {
    try {
      return new TextEncoder().encode(JSON.stringify(value) ?? '').length;
    } catch {
      return 0;
    }
  }, [value]);
  const [shown, setShown] = useState(bytes <= large);
  return (
    <Box sx={{ minWidth: 0 }} data-inspector-payload={title}>
      <Text
        sx={{
          fontSize: 0,
          color: 'fg.muted',
          fontWeight: 600,
          display: 'block',
        }}
      >
        {title} · {formatBytes(bytes)}
      </Text>
      {shown ? (
        <JsonTree value={value} expandDepth={bytes > large ? 1 : 2} />
      ) : (
        <Button
          size="small"
          onClick={() => setShown(true)}
          data-inspector-large=""
        >
          Show {formatBytes(bytes)}
        </Button>
      )}
    </Box>
  );
}

function Row({
  entry,
  first,
  open,
  onToggle,
  large,
  agent,
}: {
  agent?: string;
  entry: AgentInspectorEntry;
  first: number;
  open: boolean;
  onToggle: () => void;
  large: number;
}): JSX.Element {
  const ended = entry.endedAt !== undefined;
  return (
    <Box
      as="li"
      data-inspector-entry={entry.id}
      data-inspector-source={entry.source}
      data-inspector-kind={entry.kind}
      data-inspector-status={entry.status ?? ''}
      sx={{
        borderBottom: '1px solid',
        borderColor: 'border.muted',
        listStyle: 'none',
      }}
    >
      <Box
        as="button"
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        sx={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: ['auto 1fr', 'auto auto auto minmax(0, 1fr)'],
          columnGap: 2,
          rowGap: 1,
          alignItems: 'center',
          px: 2,
          py: 1,
          border: 0,
          bg: open ? 'canvas.subtle' : 'transparent',
          color: 'fg.default',
          font: 'inherit',
          fontSize: 0,
          textAlign: 'left',
          cursor: 'pointer',
          '&:hover': { bg: 'canvas.subtle' },
        }}
      >
        <Box
          sx={{ fontFamily: 'mono', color: 'fg.muted', whiteSpace: 'nowrap' }}
        >
          <span title={new Date(entry.at).toISOString()}>
            {clockTime(entry.at)}
          </span>{' '}
          <Text sx={{ opacity: 0.7 }}>{sinceFirst(entry.at, first)}</Text>
        </Box>
        <Text
          sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}
          data-inspector-direction=""
        >
          {directionFrom(entry, agent)}
        </Text>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Label size="small" variant="secondary">
            {AGENT_INSPECTOR_SOURCE_LABELS[entry.source]}
          </Label>
          <Label
            size="small"
            variant={KIND_VARIANTS[entry.kind] ?? 'secondary'}
          >
            {entry.kind}
          </Label>
        </Box>
        <Box
          sx={{ display: 'flex', gap: 1, alignItems: 'center', minWidth: 0 }}
        >
          {(entry.icon || entry.emoji) && (
            <SpecMark icon={entry.icon} emoji={entry.emoji} size={14} />
          )}
          {entry.name && entry.kind !== 'request' && (
            <Text
              sx={{ fontFamily: 'mono', fontWeight: 600, whiteSpace: 'nowrap' }}
            >
              {entry.name}
            </Text>
          )}
          {entry.status && (
            <Label
              size="small"
              variant={
                entry.status === 'failed'
                  ? 'danger'
                  : entry.status === 'running'
                    ? 'attention'
                    : 'success'
              }
            >
              {entry.status}
              {ended && entry.endedAt !== undefined
                ? ` · ${durationText(entry.endedAt - entry.at)}`
                : ''}
            </Label>
          )}
          <Text
            sx={{
              color: 'fg.muted',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
            title={entry.summary}
          >
            {entry.summary}
          </Text>
          {entry.bytes > large && (
            <Text sx={{ color: 'fg.muted', whiteSpace: 'nowrap' }}>
              {formatBytes(entry.bytes)}
            </Text>
          )}
        </Box>
      </Box>
      {open && (
        <Box
          data-inspector-details=""
          sx={{
            px: 3,
            py: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            bg: 'canvas.subtle',
          }}
        >
          {entry.a2a && (
            <Text sx={{ fontSize: 0, color: 'fg.muted', fontFamily: 'mono' }}>
              {[
                entry.a2a.method && `method ${entry.a2a.method}`,
                entry.a2a.rpcId !== undefined && `id ${entry.a2a.rpcId}`,
                entry.a2a.taskId && `task ${entry.a2a.taskId}`,
                entry.a2a.contextId && `context ${entry.a2a.contextId}`,
                entry.a2a.state && entry.a2a.state,
                entry.a2a.chunks &&
                  entry.a2a.chunks > 1 &&
                  `${entry.a2a.chunks} chunks`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}
          {entry.error && (
            <Text sx={{ color: 'danger.fg', fontSize: 0 }}>{entry.error}</Text>
          )}
          {entry.payload !== undefined && (
            <Payload
              title={entry.kind === 'tool-call' ? 'Arguments' : 'Payload'}
              value={entry.payload}
              large={large}
            />
          )}
          {entry.result !== undefined && (
            <Payload title="Result" value={entry.result} large={large} />
          )}
          {entry.events.length > 0 && (
            <Payload title="Events" value={entry.events} large={large} />
          )}
          {entry.links.length > 0 && (
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              Linked: {entry.links.join(', ')}
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}

/** Save a session as a JSON file. */
function download(name: string, session: AgentInspectorExport) {
  const blob = new Blob([JSON.stringify(session, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The Agent Inspector. */
export function AgentInspector({
  sink,
  entries: given,
  maxHeight = 420,
  largeBytes = 16_000,
  emptyText = 'Nothing recorded yet.',
  exportName = 'agent-inspector',
  agent,
}: AgentInspectorProps): JSX.Element {
  const live = useAgentInspectorEntries(sink);
  const everything = given ?? live;
  const all = useMemo(
    () =>
      agent
        ? everything.filter(entry => isAgentsEntry(entry, agent))
        : everything,
    [everything, agent],
  );
  const [held, setHeld] = useState<readonly AgentInspectorEntry[] | null>(null);
  const [clearedAt, setClearedAt] = useState(0);
  const [sources, setSources] = useState<ReadonlySet<AgentInspectorSource>>(
    new Set(),
  );
  const [kinds, setKinds] = useState<ReadonlySet<string>>(new Set());
  const [actors, setActors] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const recorded = useMemo(
    () => (clearedAt ? all.filter(entry => entry.at >= clearedAt) : all),
    [all, clearedAt],
  );
  const shown = held ?? recorded;
  const waiting = held ? recorded.length - held.length : 0;
  const kindOptions = useMemo(
    () => [...new Set(recorded.map(entry => entry.kind))].sort(),
    [recorded],
  );
  const actorOptions = useMemo(
    () => [...new Set(recorded.map(entry => entry.actor))].sort(),
    [recorded],
  );
  const sourceOptions = useMemo(
    () =>
      AGENT_INSPECTOR_SOURCES.filter(source =>
        recorded.some(entry => entry.source === source),
      ),
    [recorded],
  );
  const rows = useMemo(
    () => filterEntries(shown, { sources, kinds, actors }),
    [shown, sources, kinds, actors],
  );
  const first = shown[0]?.at ?? 0;

  return (
    <Box
      data-agent-inspector=""
      sx={{
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        bg: 'canvas.default',
        color: 'fg.default',
        minWidth: 0,
      }}
    >
      <Box
        role="toolbar"
        aria-label={agent ? `${agent}'s Agent Inspector` : 'Agent Inspector'}
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          alignItems: 'center',
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
        }}
      >
        <FilterMenu
          label="Source"
          options={sourceOptions}
          selected={sources}
          onToggle={value => setSources(toggle(sources, value))}
          onAll={() => setSources(new Set())}
          name={value => AGENT_INSPECTOR_SOURCE_LABELS[value]}
        />
        <FilterMenu
          label="Kind"
          options={kindOptions}
          selected={kinds}
          onToggle={value => setKinds(toggle(kinds, value))}
          onAll={() => setKinds(new Set())}
          name={value => value}
        />
        <FilterMenu
          label="Actor"
          options={actorOptions}
          selected={actors}
          onToggle={value => setActors(toggle(actors, value))}
          onAll={() => setActors(new Set())}
          name={value => value}
        />
        <Box sx={{ flex: 1 }} />
        <Text sx={{ fontSize: 0, color: 'fg.muted' }} data-inspector-count="">
          {rows.length === shown.length
            ? `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}`
            : `${rows.length} of ${shown.length}`}
          {waiting > 0 ? ` · ${waiting} new` : ''}
        </Text>
        <Button
          size="small"
          leadingVisual={held ? PlayIcon : PauseIcon}
          aria-pressed={held !== null}
          onClick={() => setHeld(held ? null : recorded)}
          data-inspector-pause=""
        >
          {held ? 'Resume' : 'Pause'}
        </Button>
        <Button
          size="small"
          leadingVisual={TrashIcon}
          onClick={() => {
            setOpen(new Set());
            setHeld(null);
            // One agent's view of a shared record clears only itself.
            if (sink && !given && !agent) {
              sink.clear();
            } else {
              setClearedAt(Date.now());
            }
          }}
          data-inspector-clear=""
        >
          Clear
        </Button>
        <Button
          size="small"
          leadingVisual={DownloadIcon}
          disabled={!recorded.length}
          onClick={() => download(exportName, exportEntries(recorded))}
          data-inspector-export=""
        >
          Export
        </Button>
      </Box>
      <Box
        as="ol"
        aria-label="Recorded"
        sx={{ m: 0, p: 0, maxHeight, overflowY: 'auto' }}
      >
        {rows.length === 0 ? (
          <Text
            as="li"
            sx={{
              display: 'block',
              p: 3,
              color: 'fg.muted',
              fontSize: 1,
              listStyle: 'none',
            }}
          >
            {emptyText}
          </Text>
        ) : (
          rows.map(entry => (
            <Row
              key={entry.id}
              entry={entry}
              first={first}
              large={largeBytes}
              agent={agent}
              open={open.has(entry.id)}
              onToggle={() => setOpen(toggle(open, entry.id))}
            />
          ))
        )}
      </Box>
    </Box>
  );
}

export default AgentInspector;
