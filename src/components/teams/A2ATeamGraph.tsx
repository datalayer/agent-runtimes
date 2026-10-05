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
 * A member's connections — the MCP servers it reaches, Odoo for Accounting —
 * hang under it, each a node half a member's size with the server's mark
 * (`SpecMark`), linked to it by an edge of its own. That edge is still until
 * the member calls one of the connection's tools: then it flows toward the
 * connection for as long as the call runs ({@link A2ATeamCall}), with the
 * tool's name on it; under reduced motion, the arrow and the words alone.
 *
 * The graph is a picture, not an editor: nothing is dragged, panned or
 * zoomed, and the wheel scrolls the page. Its viewport is worked out from its
 * box, so it fits a phone as it fits a desk.
 *
 * @module components/teams/A2ATeamGraph
 */

import type { JSX } from 'react';
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { SpecMark } from '../../chat/marks/SpecMark';
import {
  toolWords,
  type A2ATeamCall,
  type A2ATeamConnection,
  type A2ATeamFlow,
} from './a2aTeamFlow';
import type { A2ATeamPersona } from './useA2ATeam';
import { NotebookPreview } from './NotebookPreview';
import { notebookBalloonVisual } from './TeamNotebook';
import type { BalloonExpandTarget } from '../../chat/assistant/BalloonVisual';
import { toolLineText } from '../../chat/assistant/toolLine';
import type { BalloonDisplay } from '../../chat/assistant/toolLine';

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
  /** The MCP servers it reaches, drawn under it (`teamConnectionsOf`). */
  connections?: A2ATeamConnection[];
  /**
   * How its balloon shows what it says (LOOP T-23): only what it says or
   * does now (`current`, a team's default) — the words, the tool it calls,
   * a notebook it was given — or a peek (`history`).
   */
  balloonDisplay?: BalloonDisplay;
  /**
   * The notebook in its balloon was clicked: by default, it is expanded —
   * into `expandTarget`, scrolled to and focused, or in a dialog.
   */
  onNotebookOpen?: () => void;
  /**
   * Where the notebook it was given runs (`TeamNotebook`, editable, on the
   * browser sandbox): an element of the page — the area under the graph —
   * where it is drawn as it arrives and when it is expanded; without one,
   * *Expand* opens it in a dialog over the page.
   */
  expandTarget?: BalloonExpandTarget;
  /** What its notebook is called: `Accounting's notebook`. */
  notebookTitle?: string;
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
  /** The tool calls running now, to the members' connections (`useA2ATeam`). */
  calls?: A2ATeamCall[];
};

/** The graph's own coordinates: the members, and room above them for their balloons. */
const NODE_WIDTH = 200;
const BALLOON_ROOM = 144;
/** The room a balloon that holds a notebook needs above its member. */
const NOTEBOOK_BALLOON_ROOM = 340;
/** How tall the notebook in a balloon grows before it scrolls. */
const NOTEBOOK_PREVIEW_HEIGHT = 180;
const GAP = 220;
const WIDTH = NODE_WIDTH * 2 + GAP;
/** A connection's node: half a member's. */
const CONNECTION_WIDTH = NODE_WIDTH / 2;
/** Between a member and its connections. */
const CONNECTION_GAP = 44;
const CONNECTIONS_APART = 16;

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
  id: string;
  side: 'left' | 'right';
  size: number;
};

/**
 * The members as they are now, by id. Not in the nodes' data: a node whose
 * object changes is taken by React Flow for a new one, measured again, and
 * the edge is dropped until it is — the line vanished as the characters
 * moved. The nodes stay the same objects; what they show is read from here.
 */
const Members = createContext<Record<string, A2ATeamGraphMember>>({});

/** The connections being called now, by node id: read by their nodes, as the members are. */
const Busy = createContext<Record<string, string>>({});

/** A connection's node id: under its member. */
const connectionNodeId = (member: string, connection: string) =>
  `${member}/${connection}`;

const MemberNode = memo(function MemberNode({
  data,
}: NodeProps<Node<MemberData>>): JSX.Element | null {
  const { id, side, size } = data;
  const member = useContext(Members)[id];
  const stageRef = useRef<HTMLDivElement>(null);
  if (!member) {
    return null;
  }
  const { persona } = member;
  // A notebook it was given: read-only in its balloon, and its large visual
  // the one that runs, editable — under the graph, or in a dialog.
  const notebookTitle =
    member.notebookTitle ?? (persona.notebook?.name || 'The notebook');
  const given = persona.notebook
    ? {
        attachment: (
          <NotebookPreview
            notebook={persona.notebook.data}
            title={notebookTitle}
            maxHeight={NOTEBOOK_PREVIEW_HEIGHT}
            onOpen={member.onNotebookOpen}
            openLabel={
              member.expandTarget ? 'Open it below to run it' : undefined
            }
          />
        ),
        visual: notebookBalloonVisual(persona.notebook, notebookTitle),
      }
    : {};
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
            balloonDisplay={member.balloonDisplay ?? 'current'}
            balloon={
              persona.tool
                ? {
                    text: toolLineText(persona.tool),
                    tool: persona.tool,
                    busy: persona.state !== 'idle',
                    ...given,
                  }
                : persona.saying
                  ? {
                      text: persona.saying,
                      more: persona.saying.endsWith('…'),
                      speaking: persona.state === 'speaking',
                      busy:
                        persona.state === 'thinking' ||
                        persona.state === 'working' ||
                        persona.state === 'speaking',
                      ...given,
                    }
                  : undefined
            }
            expandTarget={member.expandTarget}
            expandOnArrival={!!member.expandTarget}
            insist={persona.insist}
            onDismiss={away => member.onAway?.(away !== 'none')}
            // A member of the graph: what is clicked around it is the graph.
            stayPut
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
      {member.connections?.length ? (
        <Handle
          id="connections"
          type="source"
          position={Position.Bottom}
          style={{ ...HANDLE(size), top: 'auto', bottom: 0 }}
          isConnectable={false}
        />
      ) : null}
    </Box>
  );
});

type ConnectionData = {
  member: string;
  connection: string;
  size: number;
};

/** A connection of a member's: the server's mark, what it reaches, and how. */
const ConnectionNode = memo(function ConnectionNode({
  id,
  data,
}: NodeProps<Node<ConnectionData>>): JSX.Element | null {
  const { member, connection: connectionId, size } = data;
  const connection = useContext(Members)[member]?.connections?.find(
    known => known.id === connectionId,
  );
  const tool = useContext(Busy)[id];
  if (!connection) {
    return null;
  }
  return (
    <Box
      className="nodrag nopan nowheel"
      sx={{
        width: CONNECTION_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2px',
        cursor: 'default',
        pointerEvents: 'all',
      }}
      title={connection.name}
      data-team-connection={connection.id}
      data-connection-busy={tool ? 'true' : 'false'}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ ...HANDLE(0), top: 0 }}
        isConnectable={false}
      />
      <Box
        className={tool ? 'a2a-team-connection-busy' : undefined}
        sx={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 2,
          border: '1px solid',
          borderColor: tool ? 'accent.emphasis' : 'border.default',
          bg: 'canvas.default',
        }}
      >
        <SpecMark
          icon={connection.icon}
          emoji={connection.emoji}
          size={Math.round(size * 0.66)}
        />
      </Box>
      <Text sx={{ fontWeight: 600, fontSize: 1, textAlign: 'center' }}>
        {connection.label}
      </Text>
      {connection.via && (
        <Text
          sx={{ fontSize: '10px', color: 'fg.muted', textAlign: 'center' }}
          data-connection-via=""
        >
          {connection.via}
        </Text>
      )}
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

type CallData = {
  /** The tool being called, in words (`list invoices`); empty while none is. */
  calling: string;
};

/** A member's link to a connection: still, or flowing toward it while a call runs. */
export const CallEdge = memo(function CallEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<Edge<CallData>>): JSX.Element {
  const calling = Boolean(data?.calling);
  const path = `M ${sourceX},${sourceY} L ${targetX},${targetY}`;
  const arrow = `M ${targetX},${targetY} L ${targetX - ARROW / 1.6},${targetY - ARROW} L ${targetX + ARROW / 1.6},${targetY - ARROW} Z`;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{
          stroke: 'var(--borderColor-default, #d0d7de)',
          strokeWidth: 2,
          opacity: calling ? 0.3 : 0.8,
        }}
      />
      {calling && (
        <g data-mcp-edge-call={data?.calling}>
          <path
            d={path}
            fill="none"
            className="a2a-team-flow a2a-team-call"
            stroke="var(--fgColor-accent, #0969da)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="6 8"
          />
          <path d={arrow} fill="var(--fgColor-accent, #0969da)" />
        </g>
      )}
      {calling && (
        <EdgeLabelRenderer>
          <Box
            className="nodrag nopan"
            sx={{
              position: 'absolute',
              // Beside the edge, toward the middle of the graph.
              transform: `translate(calc(-100% - 10px), -50%) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <Label variant="accent">{data?.calling}</Label>
          </Box>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

const NODE_TYPES = { member: MemberNode, connection: ConnectionNode };
const EDGE_TYPES = { a2a: LinkEdge, mcp: CallEdge };

/** Where a member's connections sit: under it, side by side, centred. */
function connectionsX(memberX: number, count: number): number[] {
  const row = count * CONNECTION_WIDTH + (count - 1) * CONNECTIONS_APART;
  const left = memberX + (NODE_WIDTH - row) / 2;
  return Array.from(
    { length: count },
    (_, at) => left + at * (CONNECTION_WIDTH + CONNECTIONS_APART),
  );
}

/** What a member's call says, on its edge and to a screen reader. */
export function callWords(
  member: string,
  connection: A2ATeamConnection,
  tool: string,
): string {
  return `${member} calls ${connection.label} · ${toolWords(tool, connection)}`;
}

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
  calls = [],
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
  const connectionSize = Math.round(size / 2);
  // Its mark, its label and how it is reached (about 45px under the mark),
  // and room under it before the graph's edge.
  const connectionHeight = connectionSize + 58;
  // The connections' ids, member by member: the nodes change only when they do.
  const placed = [entry, peer].map(member => ({
    member: member.id,
    connections: (member.connections ?? []).map(connection => connection.id),
  }));
  const placedKey = JSON.stringify(placed);
  const hasConnections = placed.some(({ connections }) => connections.length);
  // A notebook in a balloon: more room above the members.
  const room = [entry, peer].some(member => member.persona.notebook)
    ? NOTEBOOK_BALLOON_ROOM
    : BALLOON_ROOM;
  const height = Math.ceil(
    (room +
      memberHeight +
      (hasConnections ? CONNECTION_GAP + connectionHeight : 0)) *
      viewport.zoom,
  );

  const nodes = useMemo<Node<MemberData | ConnectionData>[]>(
    () => [
      {
        id: entry.id,
        type: 'member',
        position: { x: 0, y: room },
        width: NODE_WIDTH,
        height: memberHeight,
        draggable: false,
        selectable: false,
        // Above the edge and its label: a balloon overflows its node.
        zIndex: 10,
        data: { id: entry.id, side: 'left', size },
      },
      {
        id: peer.id,
        type: 'member',
        position: { x: NODE_WIDTH + GAP, y: room },
        width: NODE_WIDTH,
        height: memberHeight,
        draggable: false,
        selectable: false,
        zIndex: 10,
        data: { id: peer.id, side: 'right', size },
      },
      ...(JSON.parse(placedKey) as typeof placed).flatMap(
        ({ member, connections }, side) => {
          const xs = connectionsX(
            side === 0 ? 0 : NODE_WIDTH + GAP,
            connections.length,
          );
          return connections.map((connection, at) => ({
            id: connectionNodeId(member, connection),
            type: 'connection',
            position: {
              x: xs[at],
              y: room + memberHeight + CONNECTION_GAP,
            },
            width: CONNECTION_WIDTH,
            height: connectionHeight,
            draggable: false,
            selectable: false,
            zIndex: 5,
            data: { member, connection, size: connectionSize },
          }));
        },
      ),
    ],
    [
      entry.id,
      peer.id,
      size,
      room,
      memberHeight,
      placedKey,
      connectionSize,
      connectionHeight,
    ],
  );
  const members = useMemo(
    () => ({ [entry.id]: entry, [peer.id]: peer }),
    [entry, peer],
  );
  const words = flowWords(flow, entry.name, peer.name);
  // The tool each connection is answering now, in words, by its node's id.
  const busy = useMemo(() => {
    const byNode: Record<string, string> = {};
    const said: string[] = [];
    for (const call of calls) {
      const member = call.member === entry.id ? entry : peer;
      const connection = member.connections?.find(
        known => known.id === call.connection,
      );
      if (!connection || member.id !== call.member) {
        continue;
      }
      const node = connectionNodeId(member.id, connection.id);
      byNode[node] ??= toolWords(call.tool, connection);
      said.push(callWords(member.name, connection, call.tool));
    }
    return { byNode, said: [...new Set(said)] };
  }, [calls, entry, peer]);
  const edges = useMemo<Edge<LinkData | CallData>[]>(
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
      ...(JSON.parse(placedKey) as typeof placed).flatMap(
        ({ member, connections }) =>
          connections.map(connection => {
            const node = connectionNodeId(member, connection);
            const calling = busy.byNode[node] ?? '';
            return {
              id: `${member}->${node}`,
              source: member,
              sourceHandle: 'connections',
              target: node,
              type: 'mcp',
              selectable: false,
              focusable: false,
              data: { calling },
            };
          }),
      ),
    ],
    [entry.id, peer.id, flow, connected, label, words, placedKey, busy],
  );
  const heard = [words, ...busy.said].filter(Boolean).join('. ');

  return (
    <Box
      ref={box}
      data-a2a-team-graph=""
      data-a2a-flow={flow}
      data-a2a-calls={calls.length}
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
        '@keyframes a2aTeamCall': {
          from: { strokeDashoffset: 14 },
          to: { strokeDashoffset: 0 },
        },
        '@keyframes a2aTeamPulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 transparent' },
          '50%': {
            boxShadow: '0 0 0 4px var(--bgColor-accent-muted, #ddf4ff)',
          },
        },
        '& .a2a-team-call': {
          animation: 'a2aTeamCall 0.5s linear infinite',
        },
        '& .a2a-team-connection-busy': {
          animation: 'a2aTeamPulse 1s ease-in-out infinite',
        },
        // The arrow and the words say which way; the movement is extra.
        '@media (prefers-reduced-motion: reduce)': {
          '& .a2a-team-flow, & .a2a-team-connection-busy': {
            animation: 'none',
          },
        },
        '& .react-flow, & .react-flow__renderer, & .react-flow__viewport': {
          overflow: 'visible',
        },
        '& .react-flow__node': { cursor: 'default' },
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
        {heard}
      </Box>
      <Members.Provider value={members}>
        <Busy.Provider value={busy.byNode}>
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
            // The library is MIT: its credit is not required on the page.
            proOptions={{ hideAttribution: true }}
            aria-label={`${entry.name} and ${peer.name}, over A2A`}
          />
        </Busy.Provider>
      </Members.Provider>
    </Box>
  );
}

export default A2ATeamGraph;
