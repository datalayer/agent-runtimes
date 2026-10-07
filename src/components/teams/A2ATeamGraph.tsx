/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A team over A2A, as a graph (React Flow): each member is its character
 * (`AssistantStage`), with its name and where it runs under it, and an edge
 * links the entry to each peer it asks — one peer (`peer`, a team of two)
 * or several (`peers`, a team of N; LOOP A-08). The edges are the team's
 * `talks_to` (`links`): a peer that talks to another peer has its edge
 * drawn too, still, since the page runs the entry's asks only.
 *
 * An edge is still until a message travels on it. While the entry asks, it
 * flows from the entry to the peer; while the peer answers, from the peer to
 * the entry ({@link A2ATeamFlow}, from the `A2APeerEvent` phases; one flow
 * per peer, `flows`). A reader who asks for no motion sees the same thing
 * without the movement: the arrow at the end the message goes to, and the
 * word for it on the edge.
 *
 * The members stand where the layout puts them: the entry on the left and
 * the peers to its right, one under another — or where a scene's stage
 * directions say (`positions`, fractions of the box; LOOP A-13): the
 * distinct `x` values are the columns, left to right, the distinct `y`
 * values the rows, top to bottom.
 *
 * A member's connections — the MCP servers it reaches, Odoo for Accounting —
 * stand to its right, each a node half a member's size with the server's mark
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

import type { JSX, KeyboardEvent } from 'react';
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useId,
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
import {
  AssistantStage,
  type AssistantAbout,
} from '../../chat/assistant/AssistantStage';
import type { BalloonSuggestion } from '../../chat/assistant/SpeechBalloon';
import type { DisplayItem } from '../../types/chat';
import type { AssistantMenuItem } from '../../chat/assistant/AssistantContextMenu';
import type { AssistantSandbox } from '../../chat/assistant/assistantDetails';
import { useSignalValue } from '@datalayer/reactor/react';
import { teamNotebookKernel } from './teamNotebookKernel';
import type { OtelLiveTracer } from '@datalayer/core/lib/otel/live';
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
import { useBalloonRoom } from './useBalloonRoom';
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
  /** The MCP servers it reaches, drawn to its right (`teamConnectionsOf`). */
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
  /**
   * What the person may ask it: chips in its balloon while it waits for a
   * question, and a group of its menu; one chosen is sent (`onSuggestion`).
   */
  suggestions?: readonly BalloonSuggestion[];
  onSuggestion?: (suggestion: BalloonSuggestion) => void;
  /**
   * The team's Agent Inspector's tracer: its menu offers *Inspect the
   * agent…*, its own spans (what it did, and the A2A requests sent to it).
   */
  inspector?: OtelLiveTracer | null;
  /** Stops its turn, from its menu, while it works. */
  onStop?: () => void;
  /** What its menu's *About* and *Agent Details…* say. */
  about?: AssistantAbout;
  /**
   * Its code sandbox, for *Code Sandbox Details…*. The entry — the agent in
   * the page — has the kernel of the notebook open under the graph, while
   * one is.
   */
  sandbox?: AssistantSandbox;
  /** The host's own entries of its menu. */
  contextMenu?: readonly AssistantMenuItem[];
  /**
   * What its menu calls a click on it (`onToggle`): `Ask Sales` where it
   * takes the person to the composer. Without `onToggle`, its menu has no
   * such entry.
   */
  conversationLabel?: string;
  /**
   * What it said and did, as its `history` balloon lists it (`useA2ATeam`'s
   * `entryHistory`, `peerHistory`): shown when its menu chooses *History*.
   */
  history?: readonly DisplayItem[];
  /** Its balloon's display was chosen in its menu: the page may keep it. */
  onBalloonDisplayChange?: (display: BalloonDisplay) => void;
};

/** Who talks to whom over A2A: an edge of the graph. */
export type A2ATeamGraphLink = { from: string; to: string };

/** Where a member stands: fractions of the box, as a scene's stage says. */
export type A2ATeamGraphPosition = { x: number; y: number };

export type A2ATeamGraphProps = {
  /** The member that asks: drawn on the left. */
  entry: A2ATeamGraphMember;
  /** The member asked over A2A: drawn on the right. A team of two. */
  peer?: A2ATeamGraphMember;
  /** The members asked over A2A, a team of N: after `peer` when both are given. */
  peers?: readonly A2ATeamGraphMember[];
  /** Which way the link to `peer` carries a message now. */
  flow?: A2ATeamFlow;
  /** Which way each peer's link carries a message now, by the peer's id. */
  flows?: Record<string, A2ATeamFlow>;
  /**
   * Whether the peers are reached: an edge is drawn faint until its peer
   * is. One answer for all, or one per peer id.
   */
  connected: boolean | Record<string, boolean>;
  /** What an edge says at rest: `A2A · <the peer's skill>`. */
  label?: string;
  /** What each peer's edge says at rest, by the peer's id; `label` unsaid. */
  labels?: Record<string, string>;
  /**
   * The edges: the team's `talks_to` over A2A. Unsaid, the entry to each
   * peer. An edge between two peers is drawn still.
   */
  links?: readonly A2ATeamGraphLink[];
  /** Where each member stands, by its id (a scene's `stage.positions`). */
  positions?: Record<string, A2ATeamGraphPosition>;
  /** The character's size, in pixels at full scale. */
  size?: number;
  /** The tool calls running now, to the members' connections (`useA2ATeam`). */
  calls?: A2ATeamCall[];
  /**
   * The least room above the members for their balloons, in pixels at full
   * scale: the graph keeps what its balloons take now (`useBalloonRoom`) —
   * suggestions, *more* unfolded — and never less than this. A notebook in
   * a balloon gets at least its own.
   */
  balloonRoom?: number;
};

/** The graph's own coordinates: the members, and room above them for their balloons. */
const NODE_WIDTH = 200;
const BALLOON_ROOM = 144;
/** The room a balloon that holds a notebook needs above its member. */
const NOTEBOOK_BALLOON_ROOM = 480;
/** How tall the notebook in a balloon grows before it scrolls. */
const NOTEBOOK_PREVIEW_HEIGHT = 180;
const GAP = 220;
const WIDTH = NODE_WIDTH * 2 + GAP;
/** Between two rows of members. */
const ROW_GAP = 48;
/** A connection's node: half a member's. */
const CONNECTION_WIDTH = NODE_WIDTH / 2;
/** Between a member and its connections, to its right. */
const CONNECTION_GAP = 44;
const CONNECTIONS_APART = 16;
/** Where a member's connections start: right of it. */
const CONNECTION_X = NODE_WIDTH + CONNECTION_GAP;
/** Below the character's middle, so the A2A edge leaving it passes above. */
const CONNECTION_DROP = 12;
/** What a member's connections take beside it. */
const CONNECTIONS_BESIDE = CONNECTION_GAP + CONNECTION_WIDTH;

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
 * The handles an edge leaves and reaches a member by, named: the middle of
 * its character on each side, chosen by where the other member stands.
 */
export const MEMBER_HANDLES = {
  inLeft: 'in-left',
  outRight: 'out-right',
  inTop: 'in-top',
  outBottom: 'out-bottom',
  inRight: 'in-right',
  outLeft: 'out-left',
  inBottom: 'in-bottom',
  outTop: 'out-top',
  connections: 'connections',
} as const;

/**
 * The handles for an edge from one place to another: rightward across,
 * leftward across, or down or up when the other member is mostly below or
 * above.
 */
export function handlesBetween(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? {
          sourceHandle: MEMBER_HANDLES.outRight,
          targetHandle: MEMBER_HANDLES.inLeft,
        }
      : {
          sourceHandle: MEMBER_HANDLES.outLeft,
          targetHandle: MEMBER_HANDLES.inRight,
        };
  }
  return dy >= 0
    ? {
        sourceHandle: MEMBER_HANDLES.outBottom,
        targetHandle: MEMBER_HANDLES.inTop,
      }
    : {
        sourceHandle: MEMBER_HANDLES.outTop,
        targetHandle: MEMBER_HANDLES.inBottom,
      };
}

/**
 * The members as they are now, by id. Not in the nodes' data: a node whose
 * object changes is taken by React Flow for a new one, measured again, and
 * the edge is dropped until it is — the line vanished as the characters
 * moved. The nodes stay the same objects; what they show is read from here.
 */
const Members = createContext<Record<string, A2ATeamGraphMember>>({});

/** The connections being called now, by node id: read by their nodes, as the members are. */
const Busy = createContext<Record<string, string>>({});

/** How far a member was moved from its place, in the graph's coordinates. */
export type MemberOffset = { dx: number; dy: number };

const AT_PLACE: MemberOffset = { dx: 0, dy: 0 };

/** How far a member may move: its node stays inside the graph's box. */
export type MemberBounds = {
  minDx: number;
  maxDx: number;
  minDy: number;
  maxDy: number;
};

/** An offset kept inside its bounds. */
export function clampOffset(
  offset: MemberOffset,
  bounds: MemberBounds,
): MemberOffset {
  return {
    dx: Math.min(bounds.maxDx, Math.max(bounds.minDx, offset.dx)),
    dy: Math.min(bounds.maxDy, Math.max(bounds.minDy, offset.dy)),
  };
}

/**
 * Where the members were moved, by page and member: kept for the session,
 * in memory, so a graph drawn again on the page keeps them where they were.
 */
const MOVED = new Map<string, MemberOffset>();
const movedKey = (id: string) =>
  `${typeof location === 'undefined' ? '' : location.pathname}#${id}`;

/** How far a press moves before it is a drag, not a click, in pixels. */
const DRAG_THRESHOLD = 4;

/** How far an arrow key moves a member; with Shift, more. */
const NUDGE = 10;
const NUDGE_FAR = 40;

/** The members' moves, read by their nodes. */
const Moving = createContext<{
  zoom: number;
  offsetOf: (id: string) => MemberOffset;
  move: (id: string, offset: MemberOffset) => void;
  reset: (id: string) => void;
}>({
  zoom: 1,
  offsetOf: () => AT_PLACE,
  move: () => undefined,
  reset: () => undefined,
});

/** A connection's node id: beside its member. */
const connectionNodeId = (member: string, connection: string) =>
  `${member}/${connection}`;

const MemberNode = memo(function MemberNode({
  data,
}: NodeProps<Node<MemberData>>): JSX.Element | null {
  const { id, side, size } = data;
  const member = useContext(Members)[id];
  const moving = useContext(Moving);
  const offset = moving.offsetOf(id);
  const stageRef = useRef<HTMLDivElement>(null);
  // Its balloon's display, as its menu changes it.
  const [display, setDisplay] = useState<BalloonDisplay | undefined>();
  // Its balloon as a click on it left it: shown, hidden, or as the team
  // says (`auto`: what it is doing, and on hover).
  const [shown, setShown] = useState<'auto' | 'shown' | 'hidden'>('auto');
  // What it says or does now: something new reopens a hidden balloon.
  const persona = member?.persona;
  const news = [
    persona?.saying,
    persona?.tool ? toolLineText(persona.tool) : '',
    persona?.notebook?.name,
  ].join('\u0000');
  const seen = useRef(news);
  useEffect(() => {
    if (news !== seen.current) {
      seen.current = news;
      setShown(current => (current === 'hidden' ? 'auto' : current));
    }
  }, [news]);
  if (!member || !persona) {
    return null;
  }
  const shownDisplay = display ?? member.balloonDisplay ?? 'current';
  // History: what it said and did, listed.
  const listed =
    shownDisplay === 'history' && member.history?.length
      ? { history: member.history }
      : {};
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
  const balloonNow = persona.tool
    ? {
        text: toolLineText(persona.tool),
        tool: persona.tool,
        busy: persona.state !== 'idle',
        ...given,
        ...listed,
      }
    : persona.saying
      ? {
          text: persona.saying,
          ...(persona.full ? { fullText: persona.full } : {}),
          more: persona.saying.endsWith('…'),
          speaking: persona.state === 'speaking',
          busy:
            persona.state === 'thinking' ||
            persona.state === 'working' ||
            persona.state === 'speaking',
          ...given,
          ...listed,
        }
      : 'history' in listed
        ? { text: '', ...listed }
        : undefined;
  return (
    <Box
      // React Flow lets the pointer through a node that is neither dragged
      // nor selected (`pointer-events: none` on its wrapper): the character,
      // its balloon and its menu take it back, and are left to themselves —
      // no drag, no pan, no wheel.
      className="nodrag nopan nowheel"
      width={NODE_WIDTH}
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap={1}
      cursor="default"
      pointerEvents="all"
      data-team-member={member.id}
      data-member-balloon={shown}
      data-member-moved={
        offset.dx || offset.dy
          ? `${Math.round(offset.dx)},${Math.round(offset.dy)}`
          : undefined
      }
      data-member-state={persona.state}
    >
      <Handle
        id={MEMBER_HANDLES.inLeft}
        type="target"
        position={Position.Left}
        style={HANDLE(size)}
        isConnectable={false}
      />
      <Handle
        id={MEMBER_HANDLES.inRight}
        type="target"
        position={Position.Right}
        style={HANDLE(size)}
        isConnectable={false}
      />
      <Handle
        id={MEMBER_HANDLES.inTop}
        type="target"
        position={Position.Top}
        style={{ ...HANDLE(size), top: 0 }}
        isConnectable={false}
      />
      <Handle
        id={MEMBER_HANDLES.inBottom}
        type="target"
        position={Position.Bottom}
        style={{ ...HANDLE(size), top: size }}
        isConnectable={false}
      />
      <Box width={size} height={size} position="relative">
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
            // Dragged within the graph's box: a press that moves more than
            // a few pixels is a drag; one that does not is a click, and the
            // stage ignores the click that ends a drag.
            onDragStart={event => {
              if (event.button !== 0) {
                return;
              }
              const start = { x: event.clientX, y: event.clientY };
              const from = offset;
              let dragging = false;
              const onMove = (next: PointerEvent) => {
                const dx = next.clientX - start.x;
                const dy = next.clientY - start.y;
                if (!dragging && Math.hypot(dx, dy) <= DRAG_THRESHOLD) {
                  return;
                }
                dragging = true;
                moving.move(id, {
                  dx: from.dx + dx / moving.zoom,
                  dy: from.dy + dy / moving.zoom,
                });
              };
              const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onUp);
              };
              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', onUp);
              window.addEventListener('pointercancel', onUp);
            }}
            onCharacterKeyDown={event => {
              const step = event.shiftKey ? NUDGE_FAR : NUDGE;
              const by: Record<string, MemberOffset> = {
                ArrowLeft: { dx: -step, dy: 0 },
                ArrowRight: { dx: step, dy: 0 },
                ArrowUp: { dx: 0, dy: -step },
                ArrowDown: { dx: 0, dy: step },
              };
              const nudge = by[event.key];
              if (nudge) {
                event.preventDefault();
                moving.move(id, {
                  dx: offset.dx + nudge.dx,
                  dy: offset.dy + nudge.dy,
                });
              }
            }}
            onResetPosition={
              offset.dx || offset.dy ? () => moving.reset(id) : undefined
            }
            open={false}
            onToggle={member.onToggle ?? (() => undefined)}
            // A click shows and hides its balloon; the menu's *Ask Sales*
            // still takes the reader to the composer.
            onCharacterClick={() =>
              setShown(current =>
                current === 'shown' ||
                (current === 'auto' &&
                  (persona.insist || display === 'history'))
                  ? 'hidden'
                  : 'shown',
              )
            }
            balloonDisplay={shownDisplay}
            onBalloonDisplayChange={next => {
              setDisplay(next);
              member.onBalloonDisplayChange?.(next);
            }}
            conversationLabel={
              member.onToggle ? (member.conversationLabel ?? undefined) : false
            }
            balloon={
              shown === 'hidden'
                ? undefined
                : (balloonNow ??
                  (shown === 'shown'
                    ? {
                        text: `${member.name}, ${member.where ?? ''}`.replace(
                          /, $/,
                          '',
                        ),
                      }
                    : undefined))
            }
            expandTarget={member.expandTarget}
            expandOnArrival={!!member.expandTarget}
            // History, chosen in its menu: shown until Current is.
            insist={
              shown === 'shown' ||
              (shown === 'auto' && (persona.insist || display === 'history'))
            }
            onDismiss={away => member.onAway?.(away !== 'none')}
            suggestions={member.suggestions}
            onSuggestion={member.onSuggestion}
            inspector={member.inspector}
            inspectAgent={member.name}
            onStop={member.onStop}
            about={member.about}
            sandbox={member.sandbox}
            contextMenu={member.contextMenu}
            // A member of the graph: what is clicked around it is the graph.
            stayPut
            // Named as the member, not its character: `Sales (in your
            // browser)`; the character describes it.
            agentName={member.name}
            label={memberLabel(member)}
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
        id={MEMBER_HANDLES.outRight}
        type="source"
        position={Position.Right}
        style={HANDLE(size)}
        isConnectable={false}
      />
      <Handle
        id={MEMBER_HANDLES.outLeft}
        type="source"
        position={Position.Left}
        style={HANDLE(size)}
        isConnectable={false}
      />
      <Handle
        id={MEMBER_HANDLES.outBottom}
        type="source"
        position={Position.Bottom}
        style={{ ...HANDLE(size), top: size }}
        isConnectable={false}
      />
      <Handle
        id={MEMBER_HANDLES.outTop}
        type="source"
        position={Position.Top}
        style={{ ...HANDLE(size), top: 0 }}
        isConnectable={false}
      />
      {member.connections?.length ? (
        <Handle
          id={MEMBER_HANDLES.connections}
          type="source"
          position={Position.Right}
          style={{ ...HANDLE(size), left: 'auto', right: 0 }}
          isConnectable={false}
        />
      ) : null}
    </Box>
  );
});

/** A member's accessible name: its name, and where it runs. */
export function memberLabel(
  member: Pick<A2ATeamGraphMember, 'name' | 'where'>,
): string {
  return member.where ? `${member.name} (${member.where})` : member.name;
}

/** A connection's accessible name: `Odoo, Accounting's MCP connection`. */
export function connectionLabel(
  connection: Pick<A2ATeamConnection, 'label'>,
  member: string | undefined,
): string {
  return member
    ? `${connection.label}, ${member}\u2019s MCP connection`
    : `${connection.label}, an MCP connection`;
}

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
  const owner = useContext(Members)[member];
  const connection = owner?.connections?.find(
    known => known.id === connectionId,
  );
  const tool = useContext(Busy)[id];
  // Its details, shown and hidden by a click or Enter on its mark.
  const [told, setTold] = useState(false);
  const detailsId = useId();
  if (!connection) {
    return null;
  }
  return (
    <Box
      className="nodrag nopan nowheel"
      width={CONNECTION_WIDTH}
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap="2px"
      cursor="default"
      pointerEvents="all"
      title={connection.name}
      data-team-connection={connection.id}
      data-connection-busy={tool ? 'true' : 'false'}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ ...HANDLE(size), left: 0 }}
        isConnectable={false}
      />
      <Box
        as="button"
        type="button"
        className={tool ? 'a2a-team-connection-busy' : undefined}
        aria-label={connectionLabel(connection, owner?.name)}
        aria-expanded={told}
        aria-controls={detailsId}
        data-connection-figure=""
        onClick={() => setTold(shown => !shown)}
        onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
          if (event.key === 'Escape' && told) {
            event.stopPropagation();
            setTold(false);
          }
        }}
        width={size}
        height={size}
        p={0}
        display="flex"
        alignItems="center"
        justifyContent="center"
        borderRadius={2}
        border="1px solid"
        borderColor={tool ? 'accent.emphasis' : 'border.default'}
        bg="canvas.default"
        cursor="pointer"
        focusVisible={{
          outline: '2px solid',
          outlineColor: 'var(--focus-outlineColor, var(--fgColor-accent))',
          outlineOffset: 2,
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
      <Box
        id={detailsId}
        hidden={!told}
        data-connection-details=""
        fontSize="10px"
        color="fg.muted"
        textAlign="center"
        maxWidth={CONNECTION_WIDTH + 40}
      >
        {connectionDetails(connection, owner?.name, tool)}
      </Box>
    </Box>
  );
});

/** What a connection's details say: the server, who reaches it, and the call running now. */
export function connectionDetails(
  connection: Pick<A2ATeamConnection, 'name' | 'tools'>,
  member: string | undefined,
  calling?: string,
): string {
  const tools = connection.tools.length;
  return [
    `${connection.name}, an MCP server${member ? ` ${member} reaches` : ''}.`,
    tools ? `${tools} tool${tools === 1 ? '' : 's'}.` : '',
    calling ? `Now: ${calling}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

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

/**
 * An arrowhead at the end a message goes to — the target's when `forward`,
 * the source's otherwise — pointing along the edge.
 */
export function arrowPath(
  source: { x: number; y: number },
  target: { x: number; y: number },
  forward: boolean,
): string {
  const tip = forward ? target : source;
  const from = forward ? source : target;
  const length = Math.hypot(tip.x - from.x, tip.y - from.y) || 1;
  // Along the edge, toward the tip; and across it.
  const ax = (tip.x - from.x) / length;
  const ay = (tip.y - from.y) / length;
  const bx = tip.x - ax * ARROW;
  const by = tip.y - ay * ARROW;
  const px = -ay * (ARROW / 1.6);
  const py = ax * (ARROW / 1.6);
  return `M ${tip.x},${tip.y} L ${bx + px},${by + py} L ${bx - px},${by - py} Z`;
}

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
  // The arrow at the end the message goes to, along the edge.
  const towardPeer = flow === 'asking';
  const arrow = arrowPath(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    towardPeer,
  );
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
          position="absolute"
          transform={`translate(-50%, 12px) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`}
          pointerEvents="none"
          textAlign="center"
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
            position="absolute"
            // Beside the edge, toward the middle of the graph.
            transform={`translate(calc(-100% - 10px), -50%) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`}
            pointerEvents="none"
            whiteSpace="nowrap"
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

/** Where a member's connections sit: right of it, one under another from its character's middle. */
function connectionsY(
  memberY: number,
  size: number,
  count: number,
  connectionHeight: number,
): number[] {
  const top = memberY + size / 2 + CONNECTION_DROP;
  return Array.from(
    { length: count },
    (_, at) => top + at * (connectionHeight + CONNECTIONS_APART),
  );
}

/** How far down a member's connections reach, from its top; none, 0. */
function connectionsReach(
  size: number,
  count: number,
  connectionHeight: number,
): number {
  return count
    ? size / 2 +
        CONNECTION_DROP +
        count * connectionHeight +
        (count - 1) * CONNECTIONS_APART
    : 0;
}

/** What a member's call says, on its edge and to a screen reader. */
export function callWords(
  member: string,
  connection: A2ATeamConnection,
  tool: string,
): string {
  return `${member} calls ${connection.label} · ${toolWords(tool, connection)}`;
}

/** The viewport that shows a graph `drawn` wide whole in a box `width` wide, never larger than drawn. */
export function teamViewport(width: number, drawn = WIDTH): Viewport {
  const zoom = Math.min(1, width / drawn);
  return { zoom, x: (width - drawn * zoom) / 2, y: 0 };
}

/** Where a member is laid out: its column and row, from the positions or the default. */
export type MemberPlace = { column: number; row: number };

/**
 * Where each member stands, as columns and rows: from the positions given
 * (the distinct `x` values are the columns left to right, the distinct `y`
 * values the rows top to bottom), or the entry in the first column and the
 * peers one under another in the second.
 */
export function placeMembers(
  entryId: string,
  peerIds: readonly string[],
  positions?: Record<string, A2ATeamGraphPosition>,
): { places: Record<string, MemberPlace>; columns: number; rows: number } {
  const ids = [entryId, ...peerIds];
  const placed = positions ?? {};
  if (ids.every(id => placed[id])) {
    const xs = [...new Set(ids.map(id => placed[id].x))].sort((a, b) => a - b);
    const ys = [...new Set(ids.map(id => placed[id].y))].sort((a, b) => a - b);
    return {
      places: Object.fromEntries(
        ids.map(id => [
          id,
          { column: xs.indexOf(placed[id].x), row: ys.indexOf(placed[id].y) },
        ]),
      ),
      columns: xs.length,
      rows: ys.length,
    };
  }
  return {
    places: {
      [entryId]: { column: 0, row: 0 },
      ...Object.fromEntries(
        peerIds.map((id, at) => [id, { column: 1, row: at }]),
      ),
    },
    columns: peerIds.length ? 2 : 1,
    rows: Math.max(1, peerIds.length),
  };
}

/** The one flow the graph reports for all its edges: asking before answering before still. */
export function flowOfAll(flows: readonly A2ATeamFlow[]): A2ATeamFlow {
  return flows.includes('asking')
    ? 'asking'
    : flows.includes('answering')
      ? 'answering'
      : 'still';
}

const NO_PEERS: readonly A2ATeamGraphMember[] = [];

/** Draw a team over A2A, each link moving with what travels on it. */
export function A2ATeamGraph({
  entry,
  peer,
  peers: more = NO_PEERS,
  flow,
  flows,
  connected,
  label = 'A2A',
  labels,
  links,
  positions,
  size = 96,
  calls = [],
  balloonRoom = BALLOON_ROOM,
}: A2ATeamGraphProps): JSX.Element {
  const peers = useMemo(() => [...(peer ? [peer] : []), ...more], [peer, more]);
  const members = useMemo(() => [entry, ...peers], [entry, peers]);
  const memberOf = (id: string) => members.find(member => member.id === id);
  const flowOf = (peerId: string): A2ATeamFlow =>
    flows?.[peerId] ??
    (peer && peerId === peer.id ? (flow ?? 'still') : 'still');
  const connectedOf = (peerId: string): boolean =>
    typeof connected === 'boolean' ? connected : Boolean(connected[peerId]);
  const labelOf = (peerId: string): string => labels?.[peerId] ?? label;
  const edgesWanted: readonly A2ATeamGraphLink[] =
    links ?? peers.map(one => ({ from: entry.id, to: one.id }));

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
  // Where the members stand, as columns and rows, and the width that takes.
  const peerIds = peers.map(one => one.id);
  const placing = placeMembers(entry.id, peerIds, positions);
  const hasConnections = members.some(member => member.connections?.length);
  // The last column's connections sit beside it, inside the graph.
  const drawn = Math.max(
    WIDTH,
    placing.columns * NODE_WIDTH +
      (placing.columns - 1) * GAP +
      (hasConnections ? CONNECTIONS_BESIDE : 0),
  );
  const viewport = useMemo(
    () => teamViewport(width || drawn, drawn),
    [width, drawn],
  );
  // The members' height: the character, its name and where it runs.
  const memberHeight = size + 56;
  const connectionSize = Math.round(size / 2);
  // Its mark, its label and how it is reached (about 45px under the mark),
  // and room under it before the graph's edge.
  const connectionHeight = connectionSize + 58;
  // The connections' ids, member by member: the nodes change only when they do.
  const placed = members.map(member => ({
    member: member.id,
    connections: (member.connections ?? []).map(connection => connection.id),
  }));
  const placedKey = JSON.stringify(placed);
  // What the balloons take now, at least the room the page gives; a
  // notebook in a balloon, at least its own.
  const measured = useBalloonRoom(box, {
    anchor: '[data-team-member]',
    zoom: viewport.zoom,
    floor: balloonRoom,
  });
  const room = members.some(member => member.persona.notebook)
    ? Math.max(NOTEBOOK_BALLOON_ROOM, measured)
    : measured;
  // Beside a member, its connections may reach below it: the row takes them.
  const reach = Math.max(
    0,
    ...placed.map(({ connections }) =>
      connectionsReach(size, connections.length, connectionHeight),
    ),
  );
  const rowHeight = Math.max(memberHeight, reach);
  const total = room + placing.rows * rowHeight + (placing.rows - 1) * ROW_GAP;
  const height = Math.ceil(total * viewport.zoom);
  // Where each member is laid out, before it is moved.
  const layoutOf = (id: string): { x: number; y: number } => {
    const place = placing.places[id] ?? { column: 0, row: 0 };
    return {
      x: place.column * (NODE_WIDTH + GAP),
      y: room + place.row * (rowHeight + ROW_GAP),
    };
  };

  // Where the members were moved, kept inside the graph's box.
  const boundsOf = (id: string): MemberBounds => {
    const layout = layoutOf(id);
    const count =
      placed.find(({ member }) => member === id)?.connections.length ?? 0;
    const beside = count ? CONNECTIONS_BESIDE : 0;
    const tall = Math.max(
      memberHeight,
      connectionsReach(size, count, connectionHeight),
    );
    return {
      minDx: -layout.x,
      maxDx: drawn - NODE_WIDTH - beside - layout.x,
      minDy: -layout.y,
      maxDy: total - layout.y - tall,
    };
  };
  const [moved, setMoved] = useState<Record<string, MemberOffset>>(() =>
    Object.fromEntries(
      members.map(member => [
        member.id,
        MOVED.get(movedKey(member.id)) ?? AT_PLACE,
      ]),
    ),
  );
  const offsetOf = (id: string): MemberOffset =>
    clampOffset(moved[id] ?? AT_PLACE, boundsOf(id));
  const movingValue = {
    zoom: viewport.zoom,
    offsetOf,
    move: (id: string, offset: MemberOffset) => {
      const next = clampOffset(offset, boundsOf(id));
      MOVED.set(movedKey(id), next);
      setMoved(current => ({ ...current, [id]: next }));
    },
    reset: (id: string) => {
      MOVED.delete(movedKey(id));
      setMoved(current => ({ ...current, [id]: AT_PLACE }));
    },
  };

  // Each member's place and move, and its connections: the nodes are made
  // again only when one of them changes.
  const layout = members.map(member => {
    const at = layoutOf(member.id);
    const offset = offsetOf(member.id);
    return {
      id: member.id,
      x: at.x + offset.dx,
      y: at.y + offset.dy,
      // Its balloon opens toward the middle of the graph.
      side:
        at.x + NODE_WIDTH / 2 <= drawn / 2
          ? ('left' as const)
          : ('right' as const),
      connections: (member.connections ?? []).map(connection => connection.id),
    };
  });
  const layoutKey = JSON.stringify(layout);
  const nodes = useMemo<Node<MemberData | ConnectionData>[]>(
    () =>
      (JSON.parse(layoutKey) as typeof layout).flatMap(
        ({ id, x, y, side, connections }) => [
          {
            id,
            type: 'member',
            position: { x, y },
            width: NODE_WIDTH,
            height: memberHeight,
            draggable: false,
            selectable: false,
            // Above the edge and its label: a balloon overflows its node.
            zIndex: 10,
            data: { id, side, size },
          } as Node<MemberData>,
          // A member's connections move with it.
          ...connections.map((connection, at) => {
            const ys = connectionsY(
              y,
              size,
              connections.length,
              connectionHeight,
            );
            return {
              id: connectionNodeId(id, connection),
              type: 'connection',
              position: {
                x: x + CONNECTION_X,
                y: ys[at],
              },
              width: CONNECTION_WIDTH,
              height: connectionHeight,
              draggable: false,
              selectable: false,
              zIndex: 5,
              data: { member: id, connection, size: connectionSize },
            } as Node<ConnectionData>;
          }),
        ],
      ),
    [layoutKey, size, memberHeight, connectionSize, connectionHeight],
  );
  // The notebook open under the graph runs on a Pyodide kernel in the page:
  // the entry's sandbox, while it is open.
  const notebookKernel = useSignalValue(teamNotebookKernel);
  const entryMember = useMemo<A2ATeamGraphMember>(
    () =>
      entry.sandbox
        ? entry
        : {
            ...entry,
            // The entry runs in the page: its sandbox is the Pyodide kernel
            // of the notebook open under the graph, and none until one is.
            sandbox: notebookKernel
              ? {
                  kind: 'browser',
                  status: 'running',
                  connection: notebookKernel,
                }
              : { kind: 'browser', status: 'not running' },
          },
    [entry, notebookKernel],
  );
  const membersById = useMemo(
    () => ({
      [entry.id]: entryMember,
      ...Object.fromEntries(peers.map(one => [one.id, one])),
    }),
    [entry.id, entryMember, peers],
  );
  // The words for each flow, for the edges and for a screen reader.
  const wordsOf = (link: A2ATeamGraphLink): string =>
    link.from === entry.id
      ? flowWords(
          flowOf(link.to),
          entry.name,
          memberOf(link.to)?.name ?? link.to,
        )
      : '';
  const words = edgesWanted.map(wordsOf).filter(Boolean);
  // The tool each connection is answering now, in words, by its node's id.
  const busy = useMemo(() => {
    const byNode: Record<string, string> = {};
    const said: string[] = [];
    for (const call of calls) {
      const member = members.find(one => one.id === call.member);
      const connection = member?.connections?.find(
        known => known.id === call.connection,
      );
      if (!member || !connection) {
        continue;
      }
      const node = connectionNodeId(member.id, connection.id);
      byNode[node] ??= toolWords(call.tool, connection);
      said.push(callWords(member.name, connection, call.tool));
    }
    return { byNode, said: [...new Set(said)] };
  }, [calls, members]);
  const linkKey = JSON.stringify(
    edgesWanted.map(link => ({
      ...link,
      flow: link.from === entry.id ? flowOf(link.to) : 'still',
      connected: connectedOf(link.to),
      label: wordsOf(link)
        ? `${labelOf(link.to)} · ${wordsOf(link)}`
        : labelOf(link.to),
      ...handlesBetween(layoutOf(link.from), layoutOf(link.to)),
    })),
  );
  const edges = useMemo<Edge<LinkData | CallData>[]>(
    () => [
      ...(
        JSON.parse(linkKey) as (A2ATeamGraphLink &
          LinkData & { sourceHandle: string; targetHandle: string })[]
      ).map(
        ({
          from,
          to,
          flow: linkFlow,
          connected: reached,
          label: said,
          sourceHandle,
          targetHandle,
        }) => ({
          id: `${from}->${to}`,
          source: from,
          sourceHandle,
          target: to,
          targetHandle,
          type: 'a2a',
          selectable: false,
          focusable: false,
          data: { flow: linkFlow, connected: reached, label: said },
        }),
      ),
      ...(JSON.parse(placedKey) as typeof placed).flatMap(
        ({ member, connections }) =>
          connections.map(connection => {
            const node = connectionNodeId(member, connection);
            const calling = busy.byNode[node] ?? '';
            return {
              id: `${member}->${node}`,
              source: member,
              sourceHandle: MEMBER_HANDLES.connections,
              target: node,
              type: 'mcp',
              selectable: false,
              focusable: false,
              data: { calling },
            };
          }),
      ),
    ],
    [linkKey, placedKey, busy],
  );
  const heard = [...words, ...busy.said].filter(Boolean).join('. ');
  const flowNow = flowOfAll(peers.map(one => flowOf(one.id)));

  return (
    <Box
      ref={box}
      data-a2a-team-graph=""
      data-a2a-flow={flowNow}
      data-a2a-calls={calls.length}
      data-a2a-members={members.length}
      width="100%"
      height={height}
      position="relative"
      sx={{
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
        // A member is moved by dragging its character.
        '& [data-team-member] [data-assistant-figure]': { cursor: 'grab' },
        '& [data-team-member] [data-assistant-figure]:active': {
          cursor: 'grabbing',
        },
      }}
    >
      {/* What a screen reader hears of the exchange as it happens. */}
      <Box
        as="span"
        aria-live="polite"
        position="absolute"
        width={1}
        height={1}
        overflow="hidden"
        clip="rect(0 0 0 0)"
        whiteSpace="nowrap"
      >
        {heard}
      </Box>
      <Moving.Provider value={movingValue}>
        <Members.Provider value={membersById}>
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
              aria-label={`${entry.name} and ${peers.map(one => one.name).join(', ')}, over A2A`}
            />
          </Busy.Provider>
        </Members.Provider>
      </Moving.Provider>
    </Box>
  );
}

export default A2ATeamGraph;
