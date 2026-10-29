/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The three views of a transcript under one switch (SCENES S2-03): Lines
 * (`SceneTranscript`), Table (`TranscriptTable`) and Sequence
 * (`SequenceDiagram`), with the filter they share (members, kinds, *failed
 * only*, failed first), the selection they share (a line, a row, an arrow:
 * the same {@link TranscriptSelection}, handed to the page for the stage),
 * the drill-down beside the view on a wide stage and under it on a narrow
 * one (`TranscriptDetail`, S3-01), *Copy* of the view (the lines as text,
 * the table as Markdown, the diagram as its source) and *Export JSON*
 * (S3-03).
 *
 * @module components/teams/transcript/TranscriptViews
 */

import type { JSX } from 'react';
import { useCallback, useMemo, useState } from 'react';
import {
  ActionList,
  ActionMenu,
  Button,
  Checkbox,
  FormControl,
  SegmentedControl,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { OtelLiveTracer } from '@datalayer/core/lib/otel/live';
import { useOtelLiveSpans } from '@datalayer/core/lib/otel/live';
import type { OtelSpan } from '@datalayer/core/lib/otel/types';
import { SceneTranscript } from '../SceneTranscript';
import {
  transcriptText,
  type SceneTranscriptKind,
  type SceneTranscriptLine,
  type SceneTranscriptMember,
} from '../sceneTranscriptRules';
import { SequenceDiagram, type MermaidLike } from './SequenceDiagram';
import {
  sequenceDiagramOf,
  type SequenceCastMember,
} from './sequenceDiagramRules';
import { TranscriptDetail } from './TranscriptDetail';
import { spanOfLine, type TranscriptSpanIds } from './transcriptDetailRules';
import {
  downloadText,
  transcriptFileName,
  transcriptJson,
} from './transcriptExport';
import {
  filterLines,
  namesOf,
  transcriptMarkdown,
  transcriptRows,
  type TranscriptFilter,
} from './transcriptRows';
import { TranscriptTable } from './TranscriptTable';
import { selectionOfLine, type TranscriptSelection } from './selection';
import type { TranscriptViewChoice } from './TranscriptViewsTypes';

export type TranscriptViewsProps = {
  /** The lines, in order. */
  lines: readonly SceneTranscriptLine[];
  /** The members, in the order the diagram's participants stand, with their connections. */
  members?: readonly SceneTranscriptMember[];
  /** The spans the lines were read from: the drill-down reads a line's. */
  spans?: readonly OtelSpan[];
  /** Or the tracer they are recorded into. */
  tracer?: OtelLiveTracer | null;
  /** The lines come from a recording: the drill-down says there is no span. Said by itself when neither spans nor a tracer is given. */
  recorded?: boolean;
  /** The scene, by id: the export's file name. */
  scene?: string;
  /** The selected line's key, held by the page; with `onSelect`. */
  selected?: string | null;
  /** The selection changed: a line, or none. */
  onSelect?: (selection: TranscriptSelection | null) => void;
  /** Which view shows first: the lines unless said. */
  defaultView?: TranscriptViewChoice;
  /** The view, held by the page; with `onViewChange`. */
  view?: TranscriptViewChoice;
  onViewChange?: (view: TranscriptViewChoice) => void;
  /** What is said while there is no line yet. */
  emptyText?: string;
  /** How tall a view grows before it scrolls, in pixels. */
  maxHeight?: number;
  /** The Inspector's page for a span, when the site has one. */
  inspectorHref?: (ids: TranscriptSpanIds) => string | undefined;
  /** Opens the Inspector over the page on the span. */
  onOpenInspector?: (ids: TranscriptSpanIds) => void;
  /** The clipboard: `navigator.clipboard.writeText` unless a test gives one. */
  writeText?: (text: string) => Promise<void>;
  /** How a file is handed to the browser: a download unless a test says. */
  download?: (name: string, text: string) => void;
  /** How mermaid is loaded (`SequenceDiagram`). */
  loadMermaid?: () => Promise<MermaidLike>;
};

const KINDS: readonly SceneTranscriptKind[] = ['asked', 'called', 'said'];
const KIND_WORDS: Record<SceneTranscriptKind, string> = {
  asked: 'Asked',
  called: 'Called',
  said: 'Said',
};
const VIEW_WORDS: Record<TranscriptViewChoice, string> = {
  lines: 'Lines',
  table: 'Table',
  sequence: 'Sequence',
};
const COPY_WORDS: Record<TranscriptViewChoice, string> = {
  lines: 'Copy as text',
  table: 'Copy as Markdown',
  sequence: 'Copy as mermaid',
};

/** How long *Copied* stays, in milliseconds. */
const COPIED_MS = 1500;

const NO_MEMBERS: readonly SceneTranscriptMember[] = [];

/** The cast as the diagram stands it: the members, then every system they reach. */
export function sequenceCastOf(
  members: readonly SceneTranscriptMember[],
): SequenceCastMember[] {
  const cast: SequenceCastMember[] = members.map(member => ({
    name: member.name,
  }));
  for (const member of members) {
    for (const connection of member.connections ?? []) {
      if (!cast.some(one => one.name === connection.label)) {
        cast.push({ name: connection.label, system: true });
      }
    }
  }
  return cast;
}

/** What the view copies: the lines as text, the table as Markdown, the diagram as its source. */
export function copyTextOf(
  view: TranscriptViewChoice,
  lines: readonly SceneTranscriptLine[],
  cast: readonly SequenceCastMember[],
): string {
  switch (view) {
    case 'table':
      return transcriptMarkdown(transcriptRows(lines));
    case 'sequence':
      return sequenceDiagramOf(lines, cast);
    default:
      return transcriptText(lines);
  }
}

/** The three views, the filter, the selection, the drill-down, Copy and Export. */
export function TranscriptViews({
  lines,
  members = NO_MEMBERS,
  spans,
  tracer,
  recorded,
  scene,
  selected,
  onSelect,
  defaultView = 'lines',
  view,
  onViewChange,
  emptyText,
  maxHeight = 360,
  inspectorHref,
  onOpenInspector,
  writeText,
  download = downloadText,
  loadMermaid,
}: TranscriptViewsProps): JSX.Element {
  const [ownView, setOwnView] = useState<TranscriptViewChoice>(defaultView);
  const shown = view ?? ownView;
  const choose = (next: TranscriptViewChoice) => {
    setOwnView(next);
    onViewChange?.(next);
  };
  const [ownSelected, setOwnSelected] = useState<string | null>(null);
  const selectedKey = selected !== undefined ? selected : ownSelected;
  const select = useCallback(
    (key: string | null) => {
      setOwnSelected(key);
      const line = key ? lines.find(one => one.key === key) : undefined;
      onSelect?.(line ? selectionOfLine(line) : null);
    },
    [lines, onSelect],
  );
  const [filter, setFilter] = useState<TranscriptFilter>({});
  const [copied, setCopied] = useState(false);

  const liveSpans = useOtelLiveSpans(spans ? null : tracer);
  const allSpans = spans ?? liveSpans;
  const isRecording = recorded ?? (!spans && !tracer);
  const names = useMemo(() => namesOf(lines), [lines]);
  const kept = useMemo(() => filterLines(lines, filter), [lines, filter]);
  const cast = useMemo(() => sequenceCastOf(members), [members]);
  const selectedLine = selectedKey
    ? lines.find(line => line.key === selectedKey)
    : undefined;
  const selectedSpan =
    selectedLine && !isRecording
      ? spanOfLine(selectedLine, allSpans)
      : undefined;

  const toggle = <T extends string>(
    list: readonly T[] | undefined,
    value: T,
  ): T[] =>
    list?.includes(value)
      ? list.filter(one => one !== value)
      : [...(list ?? []), value];

  const onCopy = async () => {
    const write =
      writeText ??
      (text =>
        globalThis.navigator?.clipboard?.writeText(text) ?? Promise.resolve());
    try {
      await write(copyTextOf(shown, kept, cast));
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      // The clipboard refused: the view is still on screen.
    }
  };
  const onExport = () =>
    download(transcriptFileName(scene), transcriptJson(kept, { scene }));

  const narrowed = Boolean(
    filter.members?.length || filter.kinds?.length || filter.failedOnly,
  );
  return (
    <Box
      data-transcript-views={shown}
      data-transcript-kept={kept.length}
      data-transcript-recorded={isRecording ? '' : undefined}
    >
      <Box display="flex" alignItems="center" gap={2} flexWrap="wrap" mb={2}>
        <SegmentedControl aria-label="Transcript view" size="small">
          {(Object.keys(VIEW_WORDS) as TranscriptViewChoice[]).map(choice => (
            <SegmentedControl.Button
              key={choice}
              selected={shown === choice}
              aria-pressed={shown === choice}
              onClick={() => choose(choice)}
              data-transcript-view-choice={choice}
            >
              {VIEW_WORDS[choice]}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
        <ActionMenu>
          <ActionMenu.Button size="small" data-transcript-filter="members">
            {filter.members?.length
              ? `Members (${filter.members.length})`
              : 'Members'}
          </ActionMenu.Button>
          <ActionMenu.Overlay width="small">
            <ActionList selectionVariant="multiple">
              {names.map(name => (
                <ActionList.Item
                  key={name}
                  selected={Boolean(filter.members?.includes(name))}
                  onSelect={() =>
                    setFilter(prior => ({
                      ...prior,
                      members: toggle(prior.members, name),
                    }))
                  }
                  data-transcript-member={name}
                >
                  {name}
                </ActionList.Item>
              ))}
              {names.length === 0 && (
                <ActionList.Item disabled>No one yet</ActionList.Item>
              )}
            </ActionList>
          </ActionMenu.Overlay>
        </ActionMenu>
        <ActionMenu>
          <ActionMenu.Button size="small" data-transcript-filter="kinds">
            {filter.kinds?.length ? `Kinds (${filter.kinds.length})` : 'Kinds'}
          </ActionMenu.Button>
          <ActionMenu.Overlay width="small">
            <ActionList selectionVariant="multiple">
              {KINDS.map(kind => (
                <ActionList.Item
                  key={kind}
                  selected={Boolean(filter.kinds?.includes(kind))}
                  onSelect={() =>
                    setFilter(prior => ({
                      ...prior,
                      kinds: toggle(prior.kinds, kind),
                    }))
                  }
                  data-transcript-kind={kind}
                >
                  {KIND_WORDS[kind]}
                </ActionList.Item>
              ))}
            </ActionList>
          </ActionMenu.Overlay>
        </ActionMenu>
        <FormControl sx={{ alignItems: 'center' }}>
          <Checkbox
            checked={Boolean(filter.failedOnly)}
            onChange={event =>
              setFilter(prior => ({
                ...prior,
                failedOnly: event.target.checked,
              }))
            }
            data-transcript-failed-only=""
          />
          <FormControl.Label sx={{ fontSize: 0, fontWeight: 'normal' }}>
            Failed only
          </FormControl.Label>
        </FormControl>
        <FormControl sx={{ alignItems: 'center' }}>
          <Checkbox
            checked={Boolean(filter.failedFirst)}
            onChange={event =>
              setFilter(prior => ({
                ...prior,
                failedFirst: event.target.checked,
              }))
            }
            data-transcript-failed-first=""
          />
          <FormControl.Label sx={{ fontSize: 0, fontWeight: 'normal' }}>
            Failed first
          </FormControl.Label>
        </FormControl>
        <Box flex={1} />
        {kept.length > 0 && (
          <>
            <Button
              size="small"
              onClick={() => void onCopy()}
              data-transcript-copy={shown}
            >
              {copied ? 'Copied' : COPY_WORDS[shown]}
            </Button>
            <Button size="small" onClick={onExport} data-transcript-export="">
              Export JSON
            </Button>
          </>
        )}
      </Box>
      <Box
        sx={{
          display: 'grid',
          gap: 3,
          alignItems: 'start',
          gridTemplateColumns: selectedLine
            ? ['1fr', '1fr', 'minmax(0, 1fr) minmax(280px, 340px)']
            : '1fr',
        }}
      >
        <Box minWidth={0}>
          {shown === 'lines' && (
            <SceneTranscript
              lines={kept}
              emptyText={
                narrowed && lines.length
                  ? 'No line matches the filter.'
                  : emptyText
              }
              maxHeight={maxHeight}
              copy={false}
              selected={selectedKey}
              onSelect={select}
            />
          )}
          {shown === 'table' && (
            <TranscriptTable
              lines={kept}
              emptyText={
                narrowed && lines.length
                  ? 'No row matches the filter.'
                  : emptyText
              }
              maxHeight={maxHeight}
              selected={selectedKey}
              onSelect={select}
            />
          )}
          {shown === 'sequence' && (
            <SequenceDiagram
              lines={kept}
              cast={cast}
              emptyText={
                narrowed && lines.length
                  ? 'No arrow matches the filter.'
                  : emptyText
              }
              maxHeight={maxHeight}
              selected={selectedKey}
              onSelect={select}
              {...(loadMermaid ? { load: loadMermaid } : {})}
            />
          )}
        </Box>
        {selectedLine && (
          <TranscriptDetail
            line={selectedLine}
            span={selectedSpan}
            inspectorHref={inspectorHref}
            onOpenInspector={onOpenInspector}
            onClose={() => select(null)}
          />
        )}
      </Box>
    </Box>
  );
}

export default TranscriptViews;
