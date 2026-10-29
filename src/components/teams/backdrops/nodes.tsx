/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What every backdrop's nodes share: the member's node — its figure
 * (`AssistantStage`: the balloon that peeks and opens, the menu, the drag
 * within the graph's box, the arrow keys), its name and where it runs — and
 * the connection's node — the server's mark, a button whose details show
 * and hide — each drawn in a backdrop's *look* (`MemberLook`,
 * `ConnectionLook`): the figure a member is drawn as, the node's width, the
 * type of its name. A backdrop's node types are these two with its look.
 *
 * The members and the calls are read from the graph's contexts, not from
 * the nodes' data: a node whose object changes is taken by React Flow for
 * a new one, measured again, and the edge is dropped until it is — the line
 * vanished as the characters moved. The nodes stay the same objects; what
 * they show is read from here.
 *
 * @module components/teams/backdrops/nodes
 */

import type { JSX, KeyboardEvent } from 'react';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Button, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import {
  AssistantStage,
  type AssistantStageProps,
} from '../../../chat/assistant/AssistantStage';
import { SpecMark } from '../../../chat/marks/SpecMark';
import type { A2ATeamConnection } from '../a2aTeamFlow';
import { NotebookPreview } from '../NotebookPreview';
import { notebookBalloonVisual } from '../TeamNotebook';
import { toolLineText } from '../../../chat/assistant/toolLine';
import type { BalloonDisplay } from '../../../chat/assistant/toolLine';
import type {
  A2ATeamGraphMember,
  ConnectionData,
  MemberData,
  StageSx,
} from './types';

/** How tall the notebook in a balloon grows before it scrolls. */
export const NOTEBOOK_PREVIEW_HEIGHT = 180;

/** Where the edge leaves and reaches a member: the middle of its figure. */
export const HANDLE = (size: number) => ({
  opacity: 0,
  pointerEvents: 'none' as const,
  top: size / 2,
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 0,
});

/**
 * The handles an edge leaves and reaches a member by, named: the middle of
 * its figure on each side, chosen by where the other member stands.
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

/** The members as they are now, by id (see the module's note). */
export const Members = createContext<Record<string, A2ATeamGraphMember>>({});

/** The connections being called now, by node id: read by their nodes, as the members are. */
export const Busy = createContext<Record<string, string>>({});

/** How far a member was moved from its place, in the graph's coordinates. */
export type MemberOffset = { dx: number; dy: number };

export const AT_PLACE: MemberOffset = { dx: 0, dy: 0 };

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

/** How far a press moves before it is a drag, not a click, in pixels. */
const DRAG_THRESHOLD = 4;

/** How far an arrow key moves a member; with Shift, more. */
const NUDGE = 10;
const NUDGE_FAR = 40;

/** The members' moves, read by their nodes. */
export const Moving = createContext<{
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
export const connectionNodeId = (member: string, connection: string) =>
  `${member}/${connection}`;

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
    ? `${connection.label}, ${member}’s MCP connection`
    : `${connection.label}, an MCP connection`;
}

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

/** How a backdrop draws a member: its figure, and the words under it. */
export interface MemberLook {
  /** The node's width, the layout's `nodeWidth`. */
  width: number;
  /**
   * What the member is drawn as: its own character (studio), or a figure
   * made for the backdrop from its face — its emoji, its character, its
   * initial (hero, plain). Called on each render: give the same object
   * for the same member, so that the figure is not drawn anew.
   */
  figure: (member: A2ATeamGraphMember) => AssistantStageProps['character'];
  /** The name under the figure. */
  name: StageSx;
  /** Where it runs, under the name; `false` leaves it to the figure's label alone. */
  where: StageSx | false;
}

/** A member of the team, drawn in a look. */
export function MemberNodeBase({
  data,
  look,
}: NodeProps<Node<MemberData>> & { look: MemberLook }): JSX.Element | null {
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
      // nor selected (`pointer-events: none` on its wrapper): the figure,
      // its balloon and its menu take it back, and are left to themselves —
      // no drag, no pan, no wheel.
      className="nodrag nopan nowheel"
      width={look.width}
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
            character={look.figure(member)}
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
      <Text sx={look.name} data-member-name="">
        {member.emoji ? `${member.emoji} ` : ''}
        {member.name}
      </Text>
      {look.where !== false && (
        <Text sx={look.where} data-member-where="">
          {member.where}
        </Text>
      )}
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
}

/** How a backdrop draws a member's connection: its mark's frame, and the words under it. */
export interface ConnectionLook {
  /** The node's width, the layout's `connectionWidth`. */
  width: number;
  /** The frame round the mark: a bordered square (studio), a ring (hero). */
  mark: (busy: boolean) => StageSx;
  /** What the mark holds, as a fraction of the mark's size. */
  markScale: number;
  /** The label under the mark. */
  label: StageSx;
  /** How it is reached, under the label: `via MCP`. */
  via: StageSx;
  /** Its details, shown by a click on the mark. */
  details: StageSx;
}

/** A connection of a member's: the server's mark, what it reaches, and how. */
export function ConnectionNodeBase({
  id,
  data,
  look,
}: NodeProps<Node<ConnectionData>> & {
  look: ConnectionLook;
}): JSX.Element | null {
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
      width={look.width}
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
      {/* The edge reaches its mark, not the node's side. */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ ...HANDLE(size), left: (look.width - size) / 2 }}
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
        cursor="pointer"
        sx={look.mark(Boolean(tool))}
        focusVisible={{
          outline: '2px solid',
          outlineColor: 'var(--focus-outlineColor, var(--fgColor-accent))',
          outlineOffset: 2,
        }}
      >
        <SpecMark
          icon={connection.icon}
          emoji={connection.emoji}
          size={Math.round(size * look.markScale)}
        />
      </Box>
      <Text sx={look.label}>{connection.label}</Text>
      {connection.via && (
        <Text sx={look.via} data-connection-via="">
          {connection.via}
        </Text>
      )}
      <Box
        id={detailsId}
        hidden={!told}
        data-connection-details=""
        textAlign="center"
        maxWidth={look.width + 40}
        sx={look.details}
      >
        {connectionDetails(connection, owner?.name, tool)}
      </Box>
    </Box>
  );
}
