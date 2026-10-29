/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A team over A2A, as a graph (React Flow): each member is its character
 * (`AssistantStage`), with its name and where it runs under it, and an edge
 * links the entry to each peer it asks — one peer (`peer`, a team of two)
 * or several (`peers`, a team of N; A-08). The edges are the team's
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
 * directions say (`positions`, fractions of the box; A-13): the
 * distinct `x` values are the columns, left to right, the distinct `y`
 * values the rows, top to bottom.
 *
 * A member's connections — the MCP servers it reaches, Odoo for Accounting —
 * stand to its right, each a node half a member's size with the server's mark
 * (`SpecMark`), linked to it by an edge of its own, `MCP`, drawn as the A2A
 * link is: still until the member calls one of the connection's tools, then
 * flowing toward the connection for as long as the call runs
 * ({@link A2ATeamCall}), `MCP · list invoices`, and back with its result for
 * a moment, `MCP · Odoo answers` (a screen reader hears who calls whom);
 * under reduced motion, the arrow and the words alone.
 *
 * The graph is a picture, not an editor: nothing is dragged, panned or
 * zoomed, and the wheel scrolls the page. Its viewport is worked out from its
 * box, so it fits a phone as it fits a desk.
 *
 * How it is drawn is its *backdrop* (`backdrop`, the scene's
 * `stage.backdrop`; {@link SceneBackdrop}): `studio`, the drawing above —
 * characters, balloons, flowing edges — `hero`, faces on a deep tint with
 * a dot that flies with each message, or `plain`, boxes and arrows that do
 * not move. The graph works out the same things for every backdrop — who
 * stands where, which way each link carries a message, which connection
 * answers a call, the words a screen reader hears — and reads the node
 * types, the edge types, the colours and the layout from the backdrop.
 *
 * @module components/teams/A2ATeamGraph
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow, type Edge, type Node, type Viewport } from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { Box } from '@datalayer/primer-addons';
import { useSignalValue } from '@datalayer/reactor/react';
import { teamNotebookKernel } from './teamNotebookKernel';
import {
  callFlow,
  toolWords,
  type A2ATeamCall,
  type A2ATeamConnection,
  type A2ATeamFlow,
} from './a2aTeamFlow';
import { useBalloonRoom } from './useBalloonRoom';
import { sceneBackdrop, sceneStageSx } from './backdrops';
import type {
  A2ATeamGraphLink,
  A2ATeamGraphMember,
  A2ATeamGraphPosition,
  CallData,
  ConnectionData,
  LinkData,
  MemberData,
  SceneBackdropId,
  SceneBackdropTheme,
  StageSx,
} from './backdrops/types';
import {
  AT_PLACE,
  Busy,
  MEMBER_HANDLES,
  Members,
  Moving,
  clampOffset,
  connectionNodeId,
  type MemberBounds,
  type MemberOffset,
} from './backdrops/nodes';
import { STUDIO_LAYOUT } from './backdrops/studio';
import type { SelectedEdge } from './transcript/selection';

export type {
  A2ATeamGraphLink,
  A2ATeamGraphMember,
  A2ATeamGraphPosition,
} from './backdrops/types';
export {
  MEMBER_HANDLES,
  clampOffset,
  connectionDetails,
  connectionLabel,
  memberLabel,
  type MemberBounds,
  type MemberOffset,
} from './backdrops/nodes';
export { arrowPath } from './backdrops/edges';
export {
  CallEdge,
  LinkEdge,
  MemberNode,
  ConnectionNode,
} from './backdrops/studio';

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
   * a balloon gets at least its own. Unsaid, the backdrop's.
   */
  balloonRoom?: number;
  /**
   * How the stage is drawn (`SceneStageSpec.backdrop`): `studio`, the
   * drawing every scene had first, `hero` or `plain`. `studio` when unsaid,
   * and for an id the graph does not know.
   */
  backdrop?: SceneBackdropId;
  /**
   * The exchange selected in the transcript, as the edge it is on
   * (`selectedEdgeOf`, SCENES S3-02): drawn with a halo on every backdrop —
   * the edge by its id, or by its ends either way, since an answer travels
   * the asker's edge back.
   */
  selected?: SelectedEdge | null;
  /**
   * An edge was clicked: the page selects its latest exchange
   * (`latestLineOnEdge`). With it, the edges take the pointer.
   */
  onSelectEdge?: (edge: A2ATeamGraphEdge) => void;
};

/** An edge of the graph, as a click names it: `selectedEdgeOf`'s shape without the selection's key. */
export type A2ATeamGraphEdge = Omit<SelectedEdge, 'key'>;

/** Whether a selection is on the edge between two ends: by its id, or by its ends either way. */
export function edgeSelected(
  selected: SelectedEdge | null | undefined,
  from: string,
  to: string,
): boolean {
  return Boolean(
    selected &&
    (selected.id === `${from}->${to}` ||
      (selected.from === from && selected.to === to) ||
      (selected.from === to && selected.to === from)),
  );
}

/** The studio's width at full scale: the entry, a peer, and the room between them. */
const WIDTH = STUDIO_LAYOUT.nodeWidth * 2 + STUDIO_LAYOUT.gap;
/** The room a balloon that holds a notebook needs above its member. */
const NOTEBOOK_BALLOON_ROOM = 480;

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
 * Where the members were moved, by page and member: kept for the session,
 * in memory, so a graph drawn again on the page keeps them where they were.
 */
const MOVED = new Map<string, MemberOffset>();
const movedKey = (id: string) =>
  `${typeof location === 'undefined' ? '' : location.pathname}#${id}`;

/** The words on the edge for a flow. */
export function flowWords(flow: A2ATeamFlow, entry: string, peer: string) {
  return flow === 'asking'
    ? `${entry} asks ${peer}`
    : flow === 'answering'
      ? `${peer} answers ${entry}`
      : '';
}

/**
 * Where a member's connections sit: right of it, the first one's top where
 * the backdrop puts it (level with the character's middle on `studio`),
 * the next ones under it.
 */
function connectionsY(
  memberY: number,
  top: number,
  count: number,
  connectionHeight: number,
  apart: number,
): number[] {
  return Array.from(
    { length: count },
    (_, at) => memberY + top + at * (connectionHeight + apart),
  );
}

/** How far down a member's connections reach, from its top; none, 0. */
function connectionsReach(
  top: number,
  count: number,
  connectionHeight: number,
  apart: number,
): number {
  return count ? top + count * connectionHeight + (count - 1) * apart : 0;
}

/** What a link to a connection says at rest, as `A2A` says the members' link. */
export const MCP_LABEL = 'MCP';

/**
 * What a link to a connection says while it carries a call, short enough
 * for the room beside the member: the tool going out, `MCP · list invoices`,
 * then `MCP · Odoo answers` as its result comes back.
 */
export function callEdgeWords(
  connection: A2ATeamConnection,
  tool: string,
  flow: A2ATeamFlow,
): string {
  return flow === 'asking'
    ? `${MCP_LABEL} · ${toolWords(tool, connection)}`
    : flow === 'answering'
      ? `${MCP_LABEL} · ${connection.label} answers`
      : MCP_LABEL;
}

/**
 * What a member's call says, on its edge and to a screen reader: the call
 * going out, `Accounting calls Odoo · list invoices`, then its result
 * coming back, `Odoo answers Accounting · list invoices`.
 */
export function callWords(
  member: string,
  connection: A2ATeamConnection,
  tool: string,
  flow: A2ATeamFlow = 'asking',
): string {
  const words = toolWords(tool, connection);
  return flow === 'answering'
    ? `${connection.label} answers ${member} · ${words}`
    : `${member} calls ${connection.label} · ${words}`;
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

/**
 * The rules on the graph's box: what every backdrop needs — React Flow
 * overflowing so a balloon shows whole, the cursors, a busy connection's
 * pulse, and no movement under reduced motion — then the backdrop's own
 * and its variables, light and dark (`sceneStageSx`).
 */
function stageRules(theme: SceneBackdropTheme, clickable: boolean): StageSx {
  return {
    // An edge is clicked for its latest exchange: it takes the pointer.
    ...(clickable
      ? { '& .react-flow__edge': { cursor: 'pointer', pointerEvents: 'all' } }
      : {}),
    '@keyframes a2aTeamPulse': {
      '0%, 100%': { boxShadow: '0 0 0 0 transparent' },
      '50%': {
        boxShadow: '0 0 0 4px var(--bgColor-accent-muted)',
      },
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
    // A member is moved by dragging its figure.
    '& [data-team-member] [data-assistant-figure]': { cursor: 'grab' },
    '& [data-team-member] [data-assistant-figure]:active': {
      cursor: 'grabbing',
    },
    ...(sceneStageSx(theme) as Record<string, unknown>),
  } as StageSx;
}

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
  balloonRoom,
  backdrop,
  selected,
  onSelectEdge,
}: A2ATeamGraphProps): JSX.Element {
  // How the stage is drawn: its nodes and edges, its colours, its layout.
  const look = sceneBackdrop(backdrop);
  const { layout: sized, theme } = look;
  const NODE_WIDTH = sized.nodeWidth;
  const GAP = sized.gap;
  const ROW_GAP = sized.rowGap;
  const CONNECTION_WIDTH = sized.connectionWidth;
  const CONNECTIONS_APART = sized.connectionsApart;
  const CONNECTION_X = NODE_WIDTH + sized.connectionGap;
  const CONNECTIONS_BESIDE = sized.connectionGap + CONNECTION_WIDTH;
  const roomFloor = balloonRoom ?? sized.balloonRoom;
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
    NODE_WIDTH * 2 + GAP,
    placing.columns * NODE_WIDTH +
      (placing.columns - 1) * GAP +
      (hasConnections ? CONNECTIONS_BESIDE : 0),
  );
  const viewport = useMemo(
    () => teamViewport(width || drawn, drawn),
    [width, drawn],
  );
  // The members' height: the figure, its name and where it runs.
  const memberHeight = sized.memberHeight(size);
  const connectionSize = Math.round(size * sized.connectionScale);
  // Its mark, its label and how it is reached, and room under it before
  // the graph's edge.
  const connectionHeight = sized.connectionHeight(connectionSize);
  const connectionsTop = sized.connectionsTop(size);
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
    floor: roomFloor,
  });
  const room = members.some(member => member.persona.notebook)
    ? Math.max(NOTEBOOK_BALLOON_ROOM, measured)
    : measured;
  // Beside a member, its connections may reach below it: the row takes them.
  const reach = Math.max(
    0,
    ...placed.map(({ connections }) =>
      connectionsReach(
        connectionsTop,
        connections.length,
        connectionHeight,
        CONNECTIONS_APART,
      ),
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
      connectionsReach(
        connectionsTop,
        count,
        connectionHeight,
        CONNECTIONS_APART,
      ),
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
              connectionsTop,
              connections.length,
              connectionHeight,
              CONNECTIONS_APART,
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
    [
      layoutKey,
      size,
      memberHeight,
      connectionSize,
      connectionHeight,
      connectionsTop,
      CONNECTIONS_APART,
      CONNECTION_X,
      CONNECTION_WIDTH,
      NODE_WIDTH,
    ],
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
  // The tool each connection is answering now, in words, by its node's id,
  // and which way its edge carries it: a call still running before one
  // whose result is coming back.
  const busy = useMemo(() => {
    const byNode: Record<string, string> = {};
    const edgeByNode: Record<string, { flow: A2ATeamFlow; label: string }> = {};
    const said: string[] = [];
    const running = [
      ...calls.filter(call => callFlow(call) === 'asking'),
      ...calls.filter(call => callFlow(call) === 'answering'),
    ];
    for (const call of running) {
      const member = members.find(one => one.id === call.member);
      const connection = member?.connections?.find(
        known => known.id === call.connection,
      );
      if (!member || !connection) {
        continue;
      }
      const node = connectionNodeId(member.id, connection.id);
      const flow = callFlow(call);
      const words = callWords(member.name, connection, call.tool, flow);
      byNode[node] ??= toolWords(call.tool, connection);
      edgeByNode[node] ??= {
        flow,
        label: callEdgeWords(connection, call.tool, flow),
      };
      said.push(words);
    }
    return { byNode, edgeByNode, said: [...new Set(said)] };
  }, [calls, members]);
  const linkKey = JSON.stringify(
    edgesWanted.map(link => ({
      ...link,
      flow: link.from === entry.id ? flowOf(link.to) : 'still',
      connected: connectedOf(link.to),
      label: wordsOf(link)
        ? `${labelOf(link.to)} · ${wordsOf(link)}`
        : labelOf(link.to),
      selected: edgeSelected(selected, link.from, link.to),
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
          selected: chosen,
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
          data: {
            flow: linkFlow,
            connected: reached,
            label: said,
            selected: chosen,
          },
        }),
      ),
      ...(JSON.parse(placedKey) as typeof placed).flatMap(
        ({ member, connections }) =>
          connections.map(connection => {
            const node = connectionNodeId(member, connection);
            const calling = busy.byNode[node] ?? '';
            const carried = busy.edgeByNode[node];
            return {
              id: `${member}->${node}`,
              source: member,
              sourceHandle: MEMBER_HANDLES.connections,
              target: node,
              type: 'mcp',
              selectable: false,
              focusable: false,
              data: {
                flow: carried?.flow ?? 'still',
                calling,
                label: carried?.label ?? MCP_LABEL,
                selected: edgeSelected(selected, member, node),
              },
            };
          }),
      ),
    ],
    [linkKey, placedKey, busy, selected],
  );
  const heard = [...words, ...busy.said].filter(Boolean).join('. ');
  const flowNow = flowOfAll(peers.map(one => flowOf(one.id)));
  const clickable = Boolean(onSelectEdge);
  const stageSx = useMemo(
    () => stageRules(theme, clickable),
    [theme, clickable],
  );

  return (
    <Box
      ref={box}
      data-a2a-team-graph=""
      data-scene-backdrop={look.id}
      data-a2a-flow={flowNow}
      data-a2a-calls={calls.length}
      data-a2a-members={members.length}
      data-a2a-selected={selected ? selected.id : undefined}
      width="100%"
      height={height}
      position="relative"
      sx={stageSx}
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
              nodeTypes={look.nodeTypes}
              edgeTypes={look.edgeTypes}
              // A click on an edge: its latest exchange, for the page (S3-02).
              onEdgeClick={
                onSelectEdge
                  ? (_event, edge) =>
                      onSelectEdge({
                        id: edge.id,
                        from: edge.source,
                        to: edge.target,
                        over: edge.type === 'mcp' ? 'mcp' : 'a2a',
                      })
                  : undefined
              }
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
