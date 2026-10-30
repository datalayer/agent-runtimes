/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A scene on a page: its graph (`A2ATeamGraph`) and its transcript
 * ({@link TranscriptViews}: the lines, the table, the sequence diagram, the
 * drill-down — SCENES S2, S3), one shown at a time behind a *Graph ·
 * Transcript* toggle (A-06). The graph stays mounted while the transcript
 * shows, so that what its members were doing is still there when it comes
 * back.
 *
 * The lines come from the Agent Inspector's tracer the graph's members
 * record into (`tracer`, with the `members` to name them), or are given
 * (`lines`: a finished run's, from its record — a recording, whose
 * drill-down says it has no span to open). *Open in the Inspector* opens
 * the Agent Inspector over the page on the tracer's record.
 *
 * @module components/teams/SceneView
 */

import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { SegmentedControl } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { OtelLiveTracer } from '@datalayer/core/lib/otel/live';
import { AgentInspectorDialog } from '../inspector/AgentInspectorDialog';
import { useSceneTranscript } from './SceneTranscript';
import type {
  SceneTranscriptLine,
  SceneTranscriptMember,
} from './sceneTranscriptRules';
import { TranscriptViews } from './transcript/TranscriptViews';
import type { TranscriptSelection } from './transcript/selection';
import type { TranscriptSpanIds } from './transcript/transcriptDetailRules';

/** Which of the two the scene shows. */
export type SceneViewChoice = 'graph' | 'transcript';

export type SceneViewProps = {
  /** The graph: an `A2ATeamGraph`, or whatever draws the scene. */
  children: ReactNode;
  /** The members, to name the spans' services and their connections. */
  members?: readonly SceneTranscriptMember[];
  /** The tracer the members record into: the transcript is read from it. */
  tracer?: OtelLiveTracer | null;
  /** The lines, given: a finished run's. Wins over `tracer`. */
  lines?: readonly SceneTranscriptLine[];
  /** What shows first: the graph unless said. */
  defaultView?: SceneViewChoice;
  /** The choice, held by the page; with `onViewChange`. */
  view?: SceneViewChoice;
  onViewChange?: (view: SceneViewChoice) => void;
  /** What the transcript says while there is no line yet. */
  emptyText?: string;
  /** How tall the transcript grows before it scrolls, in pixels. */
  maxHeight?: number;
  /** Something of the page's beside the toggle: a clock, a line. */
  aside?: ReactNode;
  /** The scene, by id: the transcript's export is named after it. */
  scene?: string;
  /**
   * The selected line's key, held by the page; with `onSelect`. The transcript
   * is mounted only while it shows: held here, a line selected from the graph
   * is there when it opens.
   */
  selected?: string | null;
  /** The selected line changed (SCENES S3-02): the page hands the stage its edge (`selectedEdgeOf`). */
  onSelect?: (selection: TranscriptSelection | null) => void;
  /** The Inspector's page for a span, when the site has one. */
  inspectorHref?: (ids: TranscriptSpanIds) => string | undefined;
};

const NO_MEMBERS: readonly SceneTranscriptMember[] = [];

/** The graph and the transcript of a scene, behind a *Graph · Transcript* toggle. */
export function SceneView({
  children,
  members = NO_MEMBERS,
  tracer,
  lines,
  defaultView = 'graph',
  view,
  onViewChange,
  emptyText,
  maxHeight = 360,
  aside,
  scene,
  selected,
  onSelect,
  inspectorHref,
}: SceneViewProps): JSX.Element {
  const [own, setOwn] = useState<SceneViewChoice>(defaultView);
  // *Open in the Inspector*: the Agent Inspector over the page, on the tracer's record.
  const [inspecting, setInspecting] = useState(false);
  const shown = view ?? own;
  const choose = (next: SceneViewChoice) => {
    setOwn(next);
    onViewChange?.(next);
  };
  const live = useSceneTranscript(lines ? null : tracer, members);
  const transcript = lines ?? live;
  return (
    <Box data-scene-view={shown}>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        gap={2}
        flexWrap="wrap"
        mb={2}
      >
        <SegmentedControl aria-label="Scene view" size="small">
          <SegmentedControl.Button
            selected={shown === 'graph'}
            onClick={() => choose('graph')}
            data-scene-choice="graph"
          >
            Graph
          </SegmentedControl.Button>
          <SegmentedControl.Button
            selected={shown === 'transcript'}
            onClick={() => choose('transcript')}
            data-scene-choice="transcript"
          >
            {transcript.length
              ? `Transcript (${transcript.length})`
              : 'Transcript'}
          </SegmentedControl.Button>
        </SegmentedControl>
        {aside}
      </Box>
      <Box hidden={shown !== 'graph'} data-scene-graph="">
        {children}
      </Box>
      {shown === 'transcript' && (
        <TranscriptViews
          lines={transcript}
          members={members}
          tracer={lines ? null : tracer}
          recorded={Boolean(lines)}
          scene={scene}
          emptyText={emptyText}
          maxHeight={maxHeight}
          selected={selected}
          onSelect={onSelect}
          inspectorHref={inspectorHref}
          onOpenInspector={
            tracer && !lines ? () => setInspecting(true) : undefined
          }
        />
      )}
      {inspecting && tracer && (
        <AgentInspectorDialog
          tracer={tracer}
          onClose={() => setInspecting(false)}
        />
      )}
    </Box>
  );
}

export default SceneView;
