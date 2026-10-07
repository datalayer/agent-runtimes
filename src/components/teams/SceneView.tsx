/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A scene on a page: its graph (`A2ATeamGraph`) and its transcript
 * ({@link SceneTranscript}), one shown at a time behind a *Graph · Transcript*
 * toggle (LOOP A-06). The graph stays mounted while the transcript shows, so
 * that what its members were doing is still there when it comes back.
 *
 * The lines come from the Agent Inspector's tracer the graph's members
 * record into (`tracer`, with the `members` to name them), or are given
 * (`lines`: a finished run's, from its record).
 *
 * @module components/teams/SceneView
 */

import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { SegmentedControl } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { OtelLiveTracer } from '@datalayer/core/lib/otel/live';
import { SceneTranscript, useSceneTranscript } from './SceneTranscript';
import type {
  SceneTranscriptLine,
  SceneTranscriptMember,
} from './sceneTranscript';

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
}: SceneViewProps): JSX.Element {
  const [own, setOwn] = useState<SceneViewChoice>(defaultView);
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
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
          mb: 2,
        }}
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
        <SceneTranscript
          lines={transcript}
          emptyText={emptyText}
          maxHeight={maxHeight}
        />
      )}
    </Box>
  );
}

export default SceneView;
