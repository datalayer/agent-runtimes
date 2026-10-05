/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A team of two over A2A, as a graph (React Flow): each member is its
 * character (`AssistantStage`), with its name and where it runs under it, and
 * one edge links the entry to the peer.
 *
 * The edge is still until a message travels on it. While the entry asks, it
 * flows from the entry to the peer; while the peer answers, from the peer to
 * the entry ({@link A2ATeamFlow}, from the `A2APeerEvent` phases). A reader
 * who asks for no motion sees the same thing without the movement: the arrow
 * at the end the message goes to, and the word for it on the edge.
 *
 * The graph is a picture, not an editor: nothing is dragged, panned or
 * zoomed, and the wheel scrolls the page. Its viewport is worked out from its
 * box, so it fits a phone as it fits a desk.
 *
 * @module components/teams/A2ATeamGraph
 */

import type { JSX } from 'react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { Button, Label, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { AssistantStage } from '../../chat/assistant/AssistantStage';
import type { A2ATeamFlow } from './a2aTeamFlow';
import type { A2ATeamPersona } from './useA2ATeam';

/** One member of the team, as the graph draws it. */
export type A2ATeamGraphMember = {
  id: string;
  name: string;
  emoji?: string;
  /** Its character, as its Appspec's `interface.assistant` names it. */
  character: string;
  /** Where it runs, in a few words: "in your browser", "on a runtime". */
  where: string;
  persona: A2ATeamPersona;
  /** A click on the character. */
  onToggle?: () => void;
  /** It was sent away, or called back. */
  onAway?: (away: boolean) => void;
};

export type A2ATeamGraphProps = {
  /** The member that asks: drawn on the left. */
  entry: A2ATeamGraphMember;
  /** The member asked over A2A: drawn on the right. */
  peer: A2ATeamGraphMember;
  /** Which way the link carries a message now. */
  flow: A2ATeamFlow;
  /** Whether the peer is reached: the edge is drawn faint until it is. */
  connected: boolean;
  /** What the edge says at rest: `A2A · <the peer's skill>`. */
  label?: string;
  /** The character's size, in pixels at full scale. */
  size?: number;
};

/** The graph's own coordinates: the members, and room above them for their balloons. */
const NODE_WIDTH = 200;
const BALLOON_ROOM = 120;
const GAP = 220;
const WIDTH = NODE_WIDTH * 2 + GAP;

/** Where the edge leaves and reaches a member: the middle of its character. */
const HANDLE = (size: number) => ({
  opacity: 0,
  pointerEvents: 'none' as const,
  top: size / 2,
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 0,
});

type MemberData = {
  member: A2ATeamGraphMember;
  side: 'left' | 'right';
  size: number;
};

const MemberNode = memo(function MemberNode({
  data,
}: NodeProps<Node<MemberData>>): JSX.Element {
  const { member, side, size } = data;
  const stageRef = useRef<HTMLDivElement>(null);
  const { persona } = member;
  return (
    <Box
      // React Flow lets the pointer through a node that is neither dragged
      // nor selected (`pointer-events: none` on its wrapper): the character,
      // its balloon and its menu take it back, and are left to themselves —
      // no drag, no pan, no wheel.
      className="nodrag nopan nowheel"
      sx={{
        width: NODE_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        cursor: 'default',
        pointerEvents: 'all',
      }}
      data-team-member={member.id}
      data-member-state={persona.state}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={HANDLE(size)}
        isConnectable={false}
      />
      <Box sx={{ width: size, height: size, position: 'relative' }}>
        {persona.away ? (
          <Button
            size="small"
            sx={{ position: 'absolute', top: size / 2 - 16, left: -24 }}
            onClick={() => member.onAway?.(false)}
          >
            Call {member.name} back
          </Button>
        ) : (
          <AssistantStage
            character={member.character}
            state={persona.state}
            size={size}
            // In the node, not over the page; the balloon opens toward the
            // middle of the graph: rightward from the left member.
            place={
              side === 'left'
                ? { position: 'absolute', left: 'auto' }
                : { position: 'absolute', right: 'auto' }
            }
            stageRef={stageRef}
            onDragStart={() => undefined}
            open={false}
            onToggle={member.onToggle ?? (() => undefined)}
            balloon={
              persona.saying
                ? { text: persona.saying, more: persona.saying.endsWith('…') }
                : undefined
            }
            insist={persona.insist}
            onDismiss={away => member.onAway?.(away !== 'none')}
          />
        )}
      </Box>
      <Text sx={{ fontWeight: 600, textAlign: 'center' }}>
        {member.emoji ? `${member.emoji} ` : ''}
        {member.name}
      </Text>
      <Text
        sx={{ fontSize: 0, color: 'fg.muted', textAlign: 'center' }}
        data-member-where=""
      >
        {member.where}
      </Text>
      <Handle
        type="source"
        position={Position.Right}
        style={HANDLE(size)}
        isConnectable={false}
      />
    </Box>
  );
});

type LinkData = {
  flow: A2ATeamFlow;
  connected: boolean;
  label: string;
};

/** The words on the edge for a flow. */
export function flowWords(flow: A2ATeamFlow, entry: string, peer: string) {
  return flow === 'asking'
    ? `${entry} asks ${peer}`
    : flow === 'answering'
      ? `${peer} answers ${entry}`
      : '';
}

const ARROW = 9;

const LinkEdge = memo(function LinkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<Edge<LinkData>>): JSX.Element {
  const flow = data?.flow ?? 'still';
  const path = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
  // The arrow at the end the message goes to.
  const towardPeer = flow === 'asking';
  const tipX = towardPeer ? targetX : sourceX;
  const back = towardPeer ? -ARROW : ARROW;
  const arrow = `M ${tipX},${targetY} L ${tipX + back},${targetY - ARROW / 1.6} L ${tipX + back},${targetY + ARROW / 1.6} Z`;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: data?.connected
            ? 'var(--borderColor-accent-emphasis, #0969da)'
            : 'var(--borderColor-muted, #d0d7de)',
          strokeWidth: 2,
          strokeDasharray: data?.connected ? undefined : '6 6',
          opacity: flow === 'still' ? 0.6 : 0.25,
        }}
      />
      {flow !== 'still' && (
        <g data-a2a-edge-flow={flow}>
          <path
            d={path}
            fill="none"
            className={`a2a-team-flow a2a-team-flow-${flow}`}
            stroke="var(--fgColor-accent, #0969da)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="10 14"
          />
          <path d={arrow} fill="var(--fgColor-accent, #0969da)" />
        </g>
      )}
      <EdgeLabelRenderer>
        <Box
          className="nodrag nopan"
          sx={{
            position: 'absolute',
            transform: `translate(-50%, 12px) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`,
            pointerEvents: 'none',
            textAlign: 'center',
          }}
        >
          <Label variant={data?.connected ? 'accent' : 'secondary'}>
            {data?.label}
          </Label>
        </Box>
      </EdgeLabelRenderer>
    </>
  );
});

const NODE_TYPES = { member: MemberNode };
const EDGE_TYPES = { a2a: LinkEdge };

/** The viewport that shows the graph's width whole in a box `width` wide, never larger than drawn. */
export function teamViewport(width: number): Viewport {
  const zoom = Math.min(1, width / WIDTH);
  return { zoom, x: (width - WIDTH * zoom) / 2, y: 0 };
}

/** Draw a team of two over A2A, the link moving with what travels on it. */
export function A2ATeamGraph({
  entry,
  peer,
  flow,
  connected,
  label = 'A2A',
  size = 96,
}: A2ATeamGraphProps): JSX.Element {
  const box = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = box.current;
    if (!element) {
      return undefined;
    }
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const viewport = useMemo(() => teamViewport(width || WIDTH), [width]);
  // The members' height: the character, its name and where it runs.
  const memberHeight = size + 56;
  const height = Math.ceil((BALLOON_ROOM + memberHeight) * viewport.zoom);

  const nodes = useMemo<Node<MemberData>[]>(
    () => [
      {
        id: entry.id,
        type: 'member',
        position: { x: 0, y: BALLOON_ROOM },
        width: NODE_WIDTH,
        height: memberHeight,
        draggable: false,
        selectable: false,
        // Above the edge and its label: a balloon overflows its node.
        zIndex: 10,
        data: { member: entry, side: 'left', size },
      },
      {
        id: peer.id,
        type: 'member',
        position: { x: NODE_WIDTH + GAP, y: BALLOON_ROOM },
        width: NODE_WIDTH,
        height: memberHeight,
        draggable: false,
        selectable: false,
        zIndex: 10,
        data: { member: peer, side: 'right', size },
      },
    ],
    [entry, peer, size, memberHeight],
  );
  const words = flowWords(flow, entry.name, peer.name);
  const edges = useMemo<Edge<LinkData>[]>(
    () => [
      {
        id: `${entry.id}->${peer.id}`,
        source: entry.id,
        target: peer.id,
        type: 'a2a',
        selectable: false,
        focusable: false,
        data: {
          flow,
          connected,
          label: words ? `${label} · ${words}` : label,
        },
      },
    ],
    [entry.id, peer.id, flow, connected, label, words],
  );

  return (
    <Box
      ref={box}
      data-a2a-team-graph=""
      data-a2a-flow={flow}
      sx={{
        width: '100%',
        height,
        position: 'relative',
        '@keyframes a2aTeamFlow': {
          from: { strokeDashoffset: 24 },
          to: { strokeDashoffset: 0 },
        },
        '& .a2a-team-flow-asking': {
          animation: 'a2aTeamFlow 0.6s linear infinite',
        },
        '& .a2a-team-flow-answering': {
          animation: 'a2aTeamFlow 0.6s linear infinite reverse',
        },
        // The arrow and the words say which way; the movement is extra.
        '@media (prefers-reduced-motion: reduce)': {
          '& .a2a-team-flow': { animation: 'none' },
        },
        '& .react-flow, & .react-flow__renderer, & .react-flow__viewport': {
          overflow: 'visible',
        },
        '& .react-flow__node': { cursor: 'default' },
        // The library's credit stays, quietly (as the landing's network does).
        '& .react-flow__attribution': { bg: 'transparent', color: 'fg.muted' },
        '& .react-flow__attribution a': { color: 'fg.muted' },
      }}
    >
      {/* What a screen reader hears of the exchange as it happens. */}
      <Box
        as="span"
        aria-live="polite"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        {words}
      </Box>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        viewport={viewport}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        panOnDrag={false}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        style={{ overflow: 'visible', background: 'transparent' }}
        aria-label={`${entry.name} and ${peer.name}, over A2A`}
      />
    </Box>
  );
}

export default A2ATeamGraph;
