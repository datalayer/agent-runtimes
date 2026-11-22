/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application, authored as Visual Basic authored a form. Nothing runs here: what is built is played in the
 * Preview, at its address, embedded.
 *
 * Its surfaces, as a form designer had its form and its code: the **Agent**
 * — the agent in the centre of a React Flow graph, an edge from it to a node
 * per kind of part (Model, MCP, Protocols, Skills, Rules, UI, Tests, Events),
 * each listing its parts (`agentGraph`), the agent drawn as the avatar its
 * assistant shows, an avatar dropped on it —
 * the **Layout**, the page a person meets , the **Python** file when there is one, and the
 * **Preview**. On the right, the **Toolbox** of parts to drop on the agent —
 * each only on the node of its kind (`dropAllowed`), every other place
 * refusing it — arriving with its example filled in; the **Properties** of the part selected,
 * drawn from its JSON Schema; and the **Events**: what happens when,
 * and what it does.
 *
 * Every change is the application's spec read back through its own
 * converters, and handed to the page as one change named for its part: the
 * page's history makes it one undo, typing in one part's field coalesced
 *.
 *
 * @module apps/composer/AppCanvasEditor
 */

import type {
  ComponentType,
  DragEvent,
  JSX,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from 'react';
import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActionList,
  ActionMenu,
  Button,
  Flash,
  FormControl,
  Label,
  SegmentedControl,
  Select,
  Text,
  useConfirm,
  useTheme,
} from '@primer/react';
import { Box, SlidingPanel, usePaletteColor } from '@datalayer/primer-addons';
import { AiAgentIcon, PythonIcon } from '@datalayer/icons-react';
import {
  AlertIcon,
  BeakerIcon,
  BrowserIcon,
  AiModelIcon,
  DownloadIcon,
  GlobeIcon,
  PlayIcon,
  ListUnorderedIcon,
  PackageIcon,
  McpIcon,
  ShieldCheckIcon,
  ShieldLockIcon,
  CheckCircleIcon,
  SmileyIcon,
  BriefcaseIcon,
  WorkflowIcon,
  ZapIcon,
  type Icon,
} from '@primer/octicons-react';
import {
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import { APPSPEC_SCHEMA } from '../../specs/appspecSchema';
import { dumpAppspec, parseAppspec } from '../apps/appspec';
import type { AppDraft } from './draft';
import { codeOf } from './appCode';
import { EVENT_WORDS, appEventsOf, type PageEvent } from './appEvents';
import { kindInterface } from './appInterface';
import { sendChoices, writeAction, writeBinding } from './canvasModel';
import {
  DESIGNER_WORDS,
  DesignerPanel,
  DesignerShell,
  DesignerTool,
  type InitialDock,
} from './DesignerShell';
import { exampleDesigner, mockDesigner } from './designerMock';
import { SchemaProperties } from './SchemaProperties';
import { getAgentspecs } from '../../specs/agents';
import type { Agentspec } from '../../types/agentspecs';
import { getHarness } from '../../specs/harnesses';
import { HARNESS_WORDS, harnessOf, harnessTermsLines } from './appHarness';
import { KeptWhileHidden } from './KeptWhileHidden';
import type {
  CanvasPartContribution,
  CanvasPartKind,
} from '../core/canvasParts';
import { canvasPartsOf, canvasPartsReactorOf } from '../plugins/canvas-parts';
import {
  AGENT_DROP_WORDS,
  appParts,
  avatarModelUrlOf,
  avatarOf,
  kindProblemsOf,
  partFamilies,
  toolboxGroupsOf,
  uiChoiceRoot,
  withAgentsOwnUiFirst,
  withPartAdded,
  withPartRemoved,
  type AppPart,
  type AppPartKind,
} from './appDesign';
import { agentUiIdsOf } from '../agentUiChoices';
import {
  AssistantCharactersPlugin,
  ClippyJsCharactersPlugin,
  assistantCharacterFor,
  assistantCharactersFrom,
} from '../plugins/assistant-characters';
import {
  GRAPH_SIZES,
  PART_WORDS,
  agentGraph,
  dropAllowed,
  groupHeight,
  viewportOf,
  type AgentNodeData,
  type GroupKind,
  type GroupNodeData,
} from './agentGraph';

/** A part's mark: an octicon, or a Datalayer icon (the agent's), drawn at a pixel size. */
type PartMark = ComponentType<{ size?: number }>;

/** What each kind of part wears; what it is called is `PART_WORDS` (a connection's node is *MCP*). */
const KINDS: Record<AppPartKind, { icon: PartMark; frame: string }> = {
  agent: { icon: AiAgentIcon, frame: PART_WORDS.agent.title },
  model: { icon: AiModelIcon, frame: PART_WORDS.model.title },
  connection: { icon: McpIcon, frame: PART_WORDS.connection.title },
  rule: { icon: ShieldCheckIcon, frame: PART_WORDS.rule.title },
  skill: { icon: BriefcaseIcon, frame: PART_WORDS.skill.title },
  test: { icon: BeakerIcon, frame: PART_WORDS.test.title },
  event: { icon: ZapIcon, frame: PART_WORDS.event.title },
  protocol: { icon: GlobeIcon, frame: PART_WORDS.protocol.title },
  ui: { icon: BrowserIcon, frame: PART_WORDS.ui.title },
  // The accountability plane (6 November 2026): a Guard, a Gate, the Track — the toolbox's groups wore no icon, and the panel threw.
  guard: { icon: ShieldLockIcon, frame: PART_WORDS.guard.title },
  gate: { icon: CheckCircleIcon, frame: PART_WORDS.gate.title },
  track: { icon: WorkflowIcon, frame: PART_WORDS.track.title },
};

/** The mark of each toolbox menu, one per kind of part the plugins contribute. */
const TOOL_GROUP_ICONS: Record<CanvasPartKind, Icon> = {
  agent: ShieldCheckIcon,
  model: AiModelIcon,
  connection: McpIcon,
  rule: ShieldCheckIcon,
  skill: BriefcaseIcon,
  test: BeakerIcon,
  event: ZapIcon,
  protocol: GlobeIcon,
  ui: BrowserIcon,
  avatar: SmileyIcon,
  guard: ShieldLockIcon,
  gate: CheckCircleIcon,
  track: WorkflowIcon,
};

/** The avatars the enabled plugins contribute, read once: what the floating assistant may show. */
let CHARACTERS: ReturnType<typeof assistantCharactersFrom> | null = null;
const charactersContributed = (): ReturnType<typeof assistantCharactersFrom> =>
  (CHARACTERS ??= assistantCharactersFrom([
    AssistantCharactersPlugin,
    ClippyJsCharactersPlugin,
  ]));

/**
 * An avatar, as the application's floating assistant draws it (its own
 * drawing, never a new one), at a size; its name where it is a file a person
 * gave, or where nothing enabled draws it. A 3D model is marked here, not
 * drawn: three.js is for the assistant on the page and the Preview.
 */
function AvatarFace({
  id,
  size,
  modelUrl,
  listed,
}: {
  id: string;
  size: number;
  modelUrl?: string;
  listed?: boolean;
}): JSX.Element {
  const { colorScheme } = useTheme();
  if (id === 'model3d') {
    return (
      <Box
        role="img"
        aria-label="3D model"
        title={modelUrl ?? 'The default 3D model: a robot'}
        data-designer-avatar="model3d"
        sx={{
          width: size,
          height: size,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.6),
          lineHeight: 1,
        }}
      >
        <span aria-hidden>🤖</span>
      </Box>
    );
  }
  const chosen = assistantCharacterFor(charactersContributed(), {
    app: id || undefined,
  });
  if ('problem' in chosen) {
    return (
      <Text sx={{ fontSize: 0, color: 'danger.fg' }} title={chosen.problem}>
        {id}
      </Text>
    );
  }
  const character = chosen.character;
  if ('Drawing' in character && listed && character.fetchedFrom) {
    // A clippy.js character is fetched from jsDelivr when it is shown: in a list
    // it is marked, not fetched; worn by the agent, it is drawn.
    return (
      <Box
        role="img"
        aria-label={character.name}
        title={`${character.name}: Microsoft’s, fetched from ${character.fetchedFrom} when it is shown`}
        data-designer-avatar={chosen.id}
        data-designer-avatar-fetched=""
        sx={{
          width: size,
          height: size,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'fg.muted',
        }}
      >
        <DownloadIcon size={Math.min(16, size)} />
      </Box>
    );
  }
  if ('Drawing' in character) {
    const Drawing = character.Drawing;
    return (
      <Box
        aria-label={character.name}
        role="img"
        data-designer-avatar={chosen.id}
        sx={{
          width: size,
          height: size,
          flexShrink: 0,
          // A drawing's lids are drawn shut: the assistant's stage opens them (and blinks them).
          // Drawn here, outside the stage, the eyes open (asked 13 October 2026).
          '& .assistant-lids ellipse': {
            transformBox: 'fill-box',
            transformOrigin: 'top',
            transform: 'scaleY(0)',
          },
        }}
      >
        <Drawing
          size={size}
          mode={colorScheme?.startsWith('dark') ? 'dark' : 'light'}
        />
      </Box>
    );
  }
  return (
    <Text
      data-designer-avatar={chosen.id}
      sx={{ fontSize: 0, color: 'fg.muted' }}
    >
      {character.name}
    </Text>
  );
}

/** What is said of the avatar chosen, from its family: the clippy.js characters are Microsoft's, fetched. */
const avatarNoteOf = (
  choices: readonly CanvasPartContribution[],
  avatar: string,
): string | undefined =>
  choices.find(tool => tool.id === `avatar:${avatar}`)?.groupNote;

/** The type a part dragged from the toolbox carries: the contributed part's id. */
const DRAGGED = 'application/x-datalayer-designer-part';

/** The toolbox for each list of plugins off, read once: what the enabled plugins contribute. */
const TOOLBOXES = new Map<string, CanvasPartContribution[]>();
const toolboxOf = (pluginsOff: readonly string[]): CanvasPartContribution[] => {
  const key = [...pluginsOff].sort().join(',');
  let parts = TOOLBOXES.get(key);
  if (!parts) {
    parts = canvasPartsOf(canvasPartsReactorOf(pluginsOff));
    TOOLBOXES.set(key, parts);
  }
  return parts;
};

/** The four handles a selected control wears on a form designer. */
function Handles(): JSX.Element {
  const corner = {
    position: 'absolute',
    width: 7,
    height: 7,
    bg: 'accent.emphasis',
    border: '1px solid',
    borderColor: 'canvas.default',
  } as const;
  return (
    <>
      <Box aria-hidden sx={{ ...corner, top: -4, left: -4 }} />
      <Box aria-hidden sx={{ ...corner, top: -4, right: -4 }} />
      <Box aria-hidden sx={{ ...corner, bottom: -4, left: -4 }} />
      <Box aria-hidden sx={{ ...corner, bottom: -4, right: -4 }} />
    </>
  );
}

/** One part on the surface: a control a person selects. `nodrag nopan`: React Flow leaves its clicks to it. */
function PartControl({
  part,
  selected,
  onSelect,
}: {
  part: AppPart;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  const { icon: PartIcon } = KINDS[part.kind];
  return (
    <Box
      as="button"
      type="button"
      className="nodrag nopan"
      aria-pressed={selected}
      data-designer-part={part.id}
      onClick={(event: MouseEvent) => {
        // The part, not the node it sits in.
        event.stopPropagation();
        onSelect();
      }}
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 2,
        width: '100%',
        height: GRAPH_SIZES.row - 6,
        px: 2,
        py: 1,
        textAlign: 'left',
        font: 'inherit',
        color: 'fg.default',
        // Selected: the tint says it, with the corner handles; the hairline stays as it is (rule 3), and no shadow of its own (rule 4).
        bg: selected ? 'accent.subtle' : 'canvas.default',
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        cursor: 'pointer',
        transition: 'background-color 120ms ease',
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'accent.fg',
          outlineOffset: 2,
        },
      }}
    >
      {selected ? <Handles /> : null}
      <Box flexShrink={0} color={selected ? 'accent.fg' : 'fg.muted'} mt="2px">
        <PartIcon size={14} />
      </Box>
      <Box minWidth={0}>
        <Text
          as="div"
          sx={{
            fontSize: 1,
            fontWeight: 'semibold',
            lineHeight: '18px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {part.label}
        </Text>
        {part.detail ? (
          <Text
            as="div"
            sx={{
              fontSize: 0,
              lineHeight: '16px',
              color: 'fg.muted',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {part.detail}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}

/** What the surface's nodes read from the designer: the selection, what is being dragged, and where it goes. */
type SurfaceContext = {
  selected: string;
  select: (id: string) => void;
  /** A kind's node clicked: its first part's properties, or what to add when it has none. */
  selectKind: (kind: GroupKind) => void;
  /** The kind of the part dragged from the toolbox, while it is. */
  dragging: CanvasPartKind | null;
  /** The id of that part: an avatar dragged over the agent is worn before it is let go. */
  draggedId: string;
  drop: (id: string, into: AppPartKind) => void;
  /** What its checks find wrong with a kind's parts, in the Appspec's sentences (`kindProblemsOf`). */
  problems: Partial<Record<AppPartKind, string[]>>;
};
const Surface = createContext<SurfaceContext>({
  selected: '',
  select: () => {},
  selectKind: () => {},
  dragging: null,
  draggedId: '',
  drop: () => {},
  problems: {},
});

/** How large the agent's avatar is drawn on its node. */
const AGENT_FACE_SIZE = 112;

/** Edges join at a node's sides: handles nobody sees nor drags. */
const HIDDEN_HANDLE = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: 0,
  pointerEvents: 'none',
} as const;

/** The agent in the centre, drawn as its avatar: every edge starts here; an avatar is dropped on it. */
function AgentNode({
  data,
}: NodeProps<Node<AgentNodeData, 'agent'>>): JSX.Element {
  const { selected, select, dragging, drop, draggedId } = useContext(Surface);
  const [over, setOver] = useState(false);
  const target = dropAllowed(dragging, 'agent');
  // While an avatar is dragged over it, the agent wears it.
  const face =
    over && draggedId.startsWith('avatar:')
      ? draggedId.slice('avatar:'.length)
      : data.avatar;
  // Its frame in the agent's colour, as its spec names it (a palette name or a hex) and the theme draws it.
  const agentColor = getAgentspecs(data.part.label)?.color;
  const tone = usePaletteColor()(agentColor);
  return (
    <Box
      data-designer-node="agent"
      data-designer-agent-color={agentColor || undefined}
      data-designer-drop={
        dragging ? (target ? 'target' : 'refused') : undefined
      }
      onDragOver={(event: DragEvent) => {
        if (target && event.dataTransfer.types.includes(DRAGGED)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setOver(true);
        } else {
          event.dataTransfer.dropEffect = 'none';
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event: DragEvent) => {
        setOver(false);
        const dropped = event.dataTransfer.getData(DRAGGED);
        if (target && dropped) {
          event.preventDefault();
          drop(dropped, 'agent');
        }
      }}
      sx={{
        width: '100%',
        height: GRAPH_SIZES.agentHeight,
        boxSizing: 'border-box',
        p: 2,
        border: '2px solid',
        borderColor: tone ?? 'accent.emphasis',
        borderStyle: target ? 'dashed' : 'solid',
        borderRadius: 2,
        bg: over ? 'accent.muted' : target ? 'accent.subtle' : 'canvas.default',
        // The one shadow level of the surface (rule 4).
        boxShadow: 'shadow.small',
        opacity: dragging && !target ? 0.55 : 1,
        cursor: dragging && !target ? 'not-allowed' : 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        alignItems: 'center',
        position: 'relative',
      }}
    >
      {target && (dragging === 'agent' || dragging === 'avatar') ? (
        <Box
          data-designer-drop-says=""
          sx={{
            position: 'absolute',
            top: 2,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1,
            px: 2,
            py: 1,
            borderRadius: 2,
            bg: 'accent.emphasis',
            color: 'fg.onEmphasis',
            fontSize: 0,
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: 'shadow.small',
          }}
        >
          {over ? AGENT_DROP_WORDS.over : AGENT_DROP_WORDS[dragging]}
        </Box>
      ) : null}
      <Handle
        id="left-out"
        type="source"
        position={Position.Left}
        isConnectable={false}
        style={HIDDEN_HANDLE}
      />
      <Handle
        id="right-out"
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={HIDDEN_HANDLE}
      />
      <Handle
        id="bottom-out"
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={HIDDEN_HANDLE}
      />
      {/* The avatar large, over the agent's name: it is what the person sees (asked 13 October 2026). */}
      <AvatarFace
        id={face}
        size={AGENT_FACE_SIZE}
        modelUrl={face === data.avatar ? data.modelUrl : undefined}
      />
      <Box minWidth={0} width="100%">
        {/* No "Agent" over it: the avatar and its part say what it is (asked 13 October 2026). */}
        <PartControl
          part={data.part}
          selected={selected === data.part.id}
          onSelect={() => select(data.part.id)}
        />
      </Box>
    </Box>
  );
}

/** A kind's node: its title, its parts, and the one place a part of its kind is dropped. */
function GroupNode({
  data,
}: NodeProps<Node<GroupNodeData, 'kind'>>): JSX.Element {
  const { selected, select, dragging, drop, problems } = useContext(Surface);
  const [over, setOver] = useState(false);
  const { icon: GroupIcon } = KINDS[data.kind];
  // What its checks refuse about this kind (an application stored before `protocols`: a block it does not list).
  const wrong = problems[data.kind] ?? [];
  const target = dropAllowed(dragging, data.kind);
  const refused = Boolean(dragging) && !target;
  return (
    <Box
      data-designer-frame={data.kind}
      data-designer-drop={
        dragging ? (target ? 'target' : 'refused') : undefined
      }
      onDragOver={(event: DragEvent) => {
        if (target && event.dataTransfer.types.includes(DRAGGED)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setOver(true);
        } else {
          event.dataTransfer.dropEffect = 'none';
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event: DragEvent) => {
        setOver(false);
        const dropped = event.dataTransfer.getData(DRAGGED);
        if (target && dropped) {
          event.preventDefault();
          drop(dropped, data.kind);
        }
      }}
      sx={{
        width: '100%',
        height: groupHeight(data.parts.length),
        boxSizing: 'border-box',
        px: 2,
        border: target ? '2px dashed' : '1px solid',
        // The theme's border tokens are near white here: the frame drawn in its subtle ink, all four sides.
        borderColor: target ? 'accent.emphasis' : 'fg.subtle',
        borderRadius: 2,
        bg: over ? 'accent.muted' : target ? 'accent.subtle' : 'canvas.subtle',
        // Its frame and its tint, no shadow too (rule 4: the agent's node has the one level).
        opacity: refused ? 0.45 : 1,
        cursor: refused ? 'not-allowed' : 'pointer',
        transition:
          'background-color 120ms ease, border-color 120ms ease, opacity 120ms ease',
      }}
    >
      <Handle
        id="left-in"
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={HIDDEN_HANDLE}
      />
      <Handle
        id="right-in"
        type="target"
        position={Position.Right}
        isConnectable={false}
        style={HIDDEN_HANDLE}
      />
      <Box
        display="flex"
        alignItems="center"
        gap={1}
        height={GRAPH_SIZES.header}
        sx={{
          fontSize: 0,
          fontWeight: 'bold',
          color: target ? 'accent.fg' : 'fg.muted',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <GroupIcon size={12} />
        {data.title}
        {wrong.length ? (
          <Box
            as="span"
            role="img"
            aria-label={wrong.join(' ')}
            title={wrong.join('\n')}
            sx={{ display: 'inline-flex', color: 'danger.fg' }}
          >
            <AlertIcon size={12} />
          </Box>
        ) : null}
        <Text sx={{ ml: 'auto', fontWeight: 'normal', color: 'fg.subtle' }}>
          {data.parts.length || ''}
        </Text>
      </Box>
      {data.parts.length ? (
        data.parts.map(part => (
          <Box key={part.id} height={GRAPH_SIZES.row}>
            <PartControl
              part={part}
              selected={selected === part.id}
              onSelect={() => select(part.id)}
            />
          </Box>
        ))
      ) : (
        <Text
          as="div"
          sx={{
            height: GRAPH_SIZES.empty,
            fontSize: 0,
            color: wrong.length && !dragging ? 'danger.fg' : 'fg.subtle',
            fontStyle: 'italic',
          }}
        >
          {over
            ? 'Drop it here.'
            : target
              ? 'Drop it here: this is its place.'
              : wrong.length
                ? 'Not listed, yet configured: click to see.'
                : 'None yet: drag one from the toolbox.'}
        </Text>
      )}
    </Box>
  );
}

const NODE_TYPES = { agent: AgentNode, kind: GroupNode };

/** The agent and its parts on React Flow: still — nothing dragged, panned or zoomed — its viewport computed from the box's width. */
function AgentSurface({
  parts,
  avatar,
  modelUrl,
  context,
}: {
  parts: AppPart[];
  avatar: string;
  modelUrl?: string;
  context: SurfaceContext;
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = box.current;
    if (!element) {
      return;
    }
    const measure = (): void => {
      const measured = element.offsetWidth;
      if (measured > 0) {
        setWidth(previous => (previous === measured ? previous : measured));
      }
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const graph = useMemo(
    () => agentGraph(parts, width || GRAPH_SIZES.radialFrom, avatar, modelUrl),
    [parts, width, avatar, modelUrl],
  );
  const view = viewportOf(graph, width || GRAPH_SIZES.radialFrom);
  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map(edge => {
        const lit = dropAllowed(context.dragging, edge.data!.kind);
        return {
          ...edge,
          animated: lit,
          style: {
            stroke: lit
              ? 'var(--fgColor-accent, #0969da)'
              : 'var(--borderColor-emphasis, #818b98)',
            strokeWidth: lit ? 2.5 : 1.5,
          },
        };
      }),
    [graph, context.dragging],
  );
  return (
    <Surface.Provider value={context}>
      <Box
        data-designer-graph={graph.layout}
        aria-label={`The agent, ${graph.nodes.length - 1} kinds of part around it`}
        // Anywhere but the node of its kind, a dragged part is not dropped: the pointer says so.
        onDragOver={(event: DragEvent) => {
          if (!event.defaultPrevented) {
            event.dataTransfer.dropEffect = 'none';
          }
        }}
        sx={{
          width: '100%',
          height: view.height,
          cursor: context.dragging ? 'not-allowed' : 'default',
          '.react-flow__node': { cursor: 'default' },
          '.react-flow__edge-path': { transition: 'stroke 120ms ease' },
        }}
      >
        <div ref={box} style={{ width: '100%', height: '100%' }}>
          {width ? (
            <ReactFlow
              nodes={graph.nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              // Mounted once, its viewport controlled: a box laid out again — a
              // slide printed, a window resized — moves the drawing, and never
              // remounts it (a remount hides the nodes until React Flow measures
              // them again; a printed page was taken before, 12 October 2026).
              viewport={{ x: view.x, y: view.y, zoom: view.zoom }}
              // A node is clicked through React Flow: a node it holds neither
              // selectable nor draggable gets no pointer events unless the flow
              // has a click handler, so the nodes' own `onClick` never fired
              // (12 October 2026). A part's button stops its click first.
              onNodeClick={(_, node) =>
                node.type === 'agent'
                  ? context.select((node.data as AgentNodeData).part.id)
                  : context.selectKind((node.data as GroupNodeData).kind)
              }
              minZoom={0.3}
              maxZoom={1}
              nodesDraggable={false}
              nodesConnectable={false}
              nodesFocusable={false}
              edgesFocusable={false}
              elementsSelectable={false}
              panOnDrag={false}
              panOnScroll={false}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              preventScrolling={false}
              deleteKeyCode={null}
              selectionKeyCode={null}
              multiSelectionKeyCode={null}
              disableKeyboardA11y
              proOptions={{ hideAttribution: true }}
              style={{ background: 'transparent' }}
            />
          ) : null}
        </div>
      </Box>
    </Surface.Provider>
  );
}

/** One part the toolbox offers: dragged onto the node of its kind, or added with Enter. */
function ToolboxItem({
  tool,
  onAdd,
  onDrag,
  disabled,
}: {
  tool: CanvasPartContribution;
  onAdd: () => void;
  onDrag: (tool: CanvasPartContribution | null) => void;
  disabled: boolean;
}): JSX.Element {
  // An avatar wears its own drawing; the other kinds their mark.
  const icon =
    tool.kind === 'avatar' ? (
      <AvatarFace id={tool.id.slice('avatar:'.length)} size={20} listed />
    ) : tool.emoji ? (
      <span aria-hidden>{tool.emoji}</span>
    ) : (
      (() => {
        const ToolIcon = KINDS[tool.kind as AppPartKind].icon;
        return <ToolIcon size={16} />;
      })()
    );
  return (
    <DesignerTool
      type={DRAGGED}
      payload={tool.id}
      data={tool.id}
      icon={icon}
      label={tool.label}
      says={tool.enabled ? '' : 'Not enabled today'}
      onAdd={onAdd}
      onDragStart={() => onDrag(tool)}
      onDragEnd={() => onDrag(null)}
      disabled={disabled}
    />
  );
}

/** The designer of an application a person builds: every change handed to the page. */
export type AppCanvasEditorEditProps = {
  mock?: false;
  definition: AppDraft;
  /** A change, and the part it is of: the page's history coalesces typing in one part into one undo. */
  onChange: (next: AppDraft, source: string) => void;
  /** The application's layout (`AppLayoutEditor`), drawn when the Layout surface is chosen. */
  layout: ReactNode;
  /** Open on the layout: a block of it was asked for. */
  openOnLayout?: boolean;
  /**
   * How it works — who does the work, what it is connected to, its rules,
   * tests and record — on a surface of its own, *Flow*, rather
   * than under every other one (asked 12 October 2026).
   */
  flow?: ReactNode;
  /** The application running as it is built (its Preview), drawn when the Preview surface is chosen. */
  preview?: ReactNode;
  /** Open on the Preview: it was linked to. */
  openOnPreview?: boolean;
  /** The application written in Python (its file), drawn when the Python surface is chosen; kept mounted while hidden. */
  python?: ReactNode;
  /** Open on the Python: a line of it was asked for. */
  openOnPython?: boolean;
  /** The plugins its organization turned off: their parts are not in the toolbox, as their blocks are not on the layout's palette. */
  pluginsOff?: readonly string[];
  disabled?: boolean;
  /**
   * What runs and hosts its agent, drawn beside *Harness* in the agent's
   * Properties: the host's words for its runtime engines. Without one, the
   * line is not drawn.
   */
  agentEngine?: (agent: Agentspec) => ReactNode;
};

/**
 * The designer as a picture: the real designer on the catalogue's Accounting
 * example (`designerMock`), its Agent surface alone, read only — parts are
 * selected and panels unfolded, nothing is added, set or taken off, nothing
 * is fetched or kept. The slides and the documentation draw it.
 */
export type AppCanvasEditorMockProps = {
  mock: true;
  /** Its panels beside the surface whatever the medium: a picture laid out at a designer's width and scaled (a slide, printed). */
  wide?: boolean;
  /** The editor's own width, centred in a wider frame its floating controls may range over (`DesignerShell`). */
  contentWidth?: number;
  /** Where its controls first stand (`DesignerShell`): docked, or floating on the editor's right. */
  initialDock?: InitialDock;
  /** A catalogue example to draw instead of the picture's Accounting, read only (its example page). */
  example?: string;
  /**
   * An application that is not the catalogue's to draw instead, read only: the one a chat's
   * Composer portal shows (the user, 21 November 2026), its definition read from its Appspec.
   */
  definition?: AppDraft;
  /** What runs and hosts its agent, beside *Harness* (`AppCanvasEditorEditProps.agentEngine`). */
  agentEngine?: (agent: Agentspec) => ReactNode;
};

export type AppCanvasEditorProps =
  AppCanvasEditorEditProps | AppCanvasEditorMockProps;

const NO_PLUGINS_OFF: readonly string[] = [];

/** What a read-only designer says when a part is dropped on it. */
type DemoWords = { why: string; details: string };
const DESIGNER_DEMO: DemoWords = {
  why: 'this visual editor is a demo.',
  details:
    'Nothing here is saved or changed. Sign in and create an application to build your own.',
};
const EXAMPLE_DEMO: DemoWords = {
  why: 'this is the example as it ships.',
  details:
    'Nothing here is saved or changed. Clone it to make it yours, then change it on its Canvas.',
};
const APPLICATION_DEMO: DemoWords = {
  why: 'this is the application as it runs here, read only.',
  details:
    'Nothing here is saved or changed. Its owner changes it where it is built.',
};

/** What the mock designer hands a change: there is none to hand, and one reaching here is a fault, said at once. */
const refuseMockChange = (_next: AppDraft, source: string): never => {
  throw new Error(
    `The mock designer changes nothing (${source}): its every control that writes is disabled.`,
  );
};

/** What the switch above the designer shows. */
type DesignedSurface = 'agent' | 'layout' | 'flow' | 'python' | 'preview';
/** Each surface's button in the switch: drawn from the surfaces there are, so the index Primer's
 *  `SegmentedControl` answers (it counts a `null` child too) is always the surface's. */
const SURFACE_BUTTONS = {
  agent: { label: 'Agent', icon: AiAgentIcon },
  // Configuration, not Layout (the user, 22 November 2026).
  layout: { label: 'Configuration', icon: PackageIcon },
  flow: { label: 'Flow', icon: WorkflowIcon },
  python: { label: 'Python', icon: PythonIcon },
  preview: { label: 'Preview', icon: PlayIcon },
} as const;

/** An application in the designer; with `mock`, the designer as a picture of the Accounting example. */
export function AppCanvasEditor(props: AppCanvasEditorProps): JSX.Element {
  if (props.mock) {
    return (
      <Designer
        definition={
          props.definition ??
          (props.example ? exampleDesigner(props.example) : mockDesigner())
        }
        demo={
          props.definition
            ? APPLICATION_DEMO
            : props.example
              ? EXAMPLE_DEMO
              : DESIGNER_DEMO
        }
        onChange={refuseMockChange}
        layout={null}
        disabled
        pictured
        wide={props.wide ?? false}
        contentWidth={props.contentWidth}
        initialDock={props.initialDock}
        agentEngine={props.agentEngine}
      />
    );
  }
  return <Designer {...props} />;
}

function Designer({
  definition,
  onChange,
  layout,
  openOnLayout = false,
  flow,
  preview,
  openOnPreview = false,
  python,
  openOnPython = false,
  pluginsOff = NO_PLUGINS_OFF,
  disabled = false,
  agentEngine,
  pictured = false,
  wide = false,
  contentWidth,
  initialDock,
  demo = DESIGNER_DEMO,
}: AppCanvasEditorEditProps & {
  /** The mock: the Agent surface alone, no switch above it, every write disabled. */
  pictured?: boolean;
  /** The panels beside the surface whatever the medium (`DesignerShell`). */
  wide?: boolean;
  /** The editor's own width in a wider frame (`DesignerShell`). */
  contentWidth?: number;
  /** Where its controls first stand (`DesignerShell`). */
  initialDock?: InitialDock;
  /** What a picture says when a part is dropped on it: nothing is added. */
  demo?: DemoWords;
}): JSX.Element {
  const [surface, setSurface] = useState<DesignedSurface>(
    openOnPreview && preview
      ? 'preview'
      : openOnPython && python
        ? 'python'
        : openOnLayout
          ? 'layout'
          : 'agent',
  );
  // The part dragged from the toolbox, while it is: its node is lit, every other place refuses it.
  const [draggedTool, setDraggedTool] = useState<CanvasPartContribution | null>(
    null,
  );
  const dragging: CanvasPartKind | null = draggedTool?.kind ?? null;
  const [selected, setSelected] = useState<string>('agent');
  // The panels open folded; a click on the surface opens the Properties of what it picked.
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const confirm = useConfirm();
  // A kind's node clicked while it holds no part: the Properties say what to add.
  const [emptyKind, setEmptyKind] = useState<GroupKind | null>(null);
  const pick = (id: string) => {
    setEmptyKind(null);
    setSelected(id);
    setPropertiesOpen(true);
  };
  const [refusal, setRefusal] = useState('');
  // What the last change did, in a line: every change is one step of the page's Undo.
  const [said, setSaid] = useState('');
  // The mock's toolbox drags and drops (asked 14 October 2026), and a drop says it changed nothing: a demo.
  const [demoDrop, setDemoDrop] = useState<{
    label: string;
    nonce: number;
  } | null>(null);
  const offered = toolboxOf(pluginsOff);
  // Its agent's own UI first in the UI group: offered, never added for the Maker.
  const agentRef = definition.spec?.agent ?? '';
  const groups = useMemo(
    () =>
      toolboxGroupsOf(
        withAgentsOwnUiFirst(offered, agentRef ? agentUiIdsOf(agentRef) : []),
      ),
    [offered, agentRef],
  );
  const eventChoices =
    groups.find(group => group.kind === 'event')?.parts ?? [];
  const avatarChoices =
    groups.find(group => group.kind === 'avatar')?.parts ?? [];
  const data = useMemo(
    () => (definition.spec ? dumpAppspec(definition.spec) : undefined),
    [definition.spec],
  );
  const parts = useMemo(() => (data ? appParts(data) : []), [data]);
  const part = parts.find(each => each.id === selected) ?? parts[0];
  const kindProblems = useMemo(
    () => (definition.spec ? kindProblemsOf(definition.spec) : {}),
    [definition.spec],
  );
  const selectedProblems =
    kindProblems[emptyKind ?? part?.kind ?? 'agent'] ?? [];
  const problemCount = useMemo(
    () =>
      Object.values(kindProblems).reduce(
        (count, found) => count + (found?.length ?? 0),
        0,
      ),
    [kindProblems],
  );

  /** The application written from its data, or refused in the Appspec's sentence. */
  const write = (next: unknown, source: string, says: string): boolean => {
    const read = parseAppspec(next);
    if (read.problems.length) {
      setRefusal(read.problems[0]);
      return false;
    }
    setRefusal('');
    setSaid(says);
    onChange({ ...definition, spec: read.app }, source);
    return true;
  };
  /** A contributed part placed, by its id; dropped on a node, only a part of the node's kind (`dropAllowed`). */
  const add = (id: string, into?: AppPartKind) => {
    const tool = offered.find(each => each.id === id);
    if (pictured) {
      if (tool && (!into || dropAllowed(tool.kind, into))) {
        setDemoDrop({ label: tool.label, nonce: Date.now() });
      }
      return;
    }
    if (!tool || !data || disabled || (into && !dropAllowed(tool.kind, into))) {
      return;
    }
    if (tool.kind === 'agent' && !tool.example) {
      // A harness no agent of the catalogue runs yet: offered, said, never set.
      setSaid(tool.says);
      return;
    }
    const added = withPartAdded(data, tool);
    if (added.data === data) {
      // Listed once: the one already there is selected.
      setSaid(
        tool.kind === 'ui'
          ? `Its interface already has ${tool.label}.`
          : `It already speaks ${tool.label}.`,
      );
      pick(added.id);
      return;
    }
    const says =
      tool.kind === 'agent'
        ? `Its agent is ${tool.label}, behind the Shield.`
        : tool.kind === 'model'
          ? `It runs on ${tool.label}.`
          : tool.kind === 'avatar'
            ? `Its assistant shows ${tool.label}.`
            : `Added ${tool.label}.`;
    if (write(added.data, `designer:add:${added.id}`, says)) {
      setSurface('agent');
      // The part is drawn at once; its Properties, a form of their own, right after.
      startTransition(() => pick(added.id));
    }
  };
  const remove = (target: AppPart) => {
    if (!data || disabled || target.at.keys) {
      return;
    }
    if (
      write(
        withPartRemoved(data, target),
        `designer:remove:${target.id}`,
        `Took off ${target.label}.`,
      )
    ) {
      setSelected('agent');
    }
  };
  /** *Remove this part*, a quiet button behind a confirm (rule 6): the Delete key, on a part already selected, takes it off at once — one step of Undo. */
  const removeAsked = async (target: AppPart) => {
    const yes = await confirm({
      title: DESIGNER_WORDS.removeTitle(target.label),
      content: DESIGNER_WORDS.removeSays,
      confirmButtonContent: DESIGNER_WORDS.removeConfirm,
      confirmButtonType: 'danger',
    });
    if (yes) {
      remove(target);
    }
  };
  const onKey = (event: KeyboardEvent) => {
    const inText = (event.target as HTMLElement).closest(
      'input, textarea, [contenteditable="true"]',
    );
    if (
      !inText &&
      (event.key === 'Delete' || event.key === 'Backspace') &&
      part &&
      !part.at.keys
    ) {
      event.preventDefault();
      remove(part);
    }
  };

  if (!data) {
    return (
      <Flash variant="warning">
        This application has no spec to design yet: build it from a sentence, or
        write its YAML.
      </Flash>
    );
  }
  const frameParts = (kind: AppPartKind) =>
    parts.filter(each => each.kind === kind);
  const events = frameParts('event');
  // What happens when: the page's events beside the triggers, each doing what it is chosen to do.
  const gives = kindInterface(definition.spec);
  const pageEvents = appEventsOf(
    definition.spec,
    definition.interface,
    gives,
    codeOf(definition.source),
  ).filter((event): event is PageEvent => event.on === 'page');
  const choosePage = (event: PageEvent, chosen: string) => {
    const surface = definition.interface;
    if (!surface || disabled || event.decidedBy) {
      return;
    }
    const next =
      event.kind === 'pressed'
        ? writeAction(surface, event.block, chosen, gives)
        : writeBinding(surface, event.block, event.property!, chosen);
    setSaid(`${event.when}: ${chosen ? 'chosen' : 'nothing'}.`);
    onChange({ ...definition, interface: next }, `designer:${event.id}`);
  };

  const surfaces: DesignedSurface[] = [
    'agent',
    'layout',
    ...(flow ? (['flow'] as const) : []),
    ...(python ? (['python'] as const) : []),
    ...(preview ? (['preview'] as const) : []),
  ];
  const switcher = (
    <Box display="flex" alignItems="center" gap={3} mb={2} flexWrap="wrap">
      <SegmentedControl
        aria-label="What is designed"
        size="small"
        onChange={index => setSurface(surfaces[index] ?? 'agent')}
      >
        {surfaces.map(each => (
          <SegmentedControl.Button
            key={each}
            selected={surface === each}
            leadingIcon={SURFACE_BUTTONS[each].icon}
          >
            {SURFACE_BUTTONS[each].label}
          </SegmentedControl.Button>
        ))}
      </SegmentedControl>
      <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
        {surface === 'agent'
          ? 'Drag a part from the toolbox onto its place around the agent, an avatar onto the agent itself; select a part to set its properties. Delete takes a selected part off; Ctrl+Z takes back one change.'
          : surface === 'layout'
            ? 'The page a person meets: drag a component from the toolbox onto it.'
            : surface === 'flow'
              ? 'How it works, from who does the work to what it records.'
              : surface === 'python'
                ? 'The application written in Python: what the file builds is the application.'
                : 'The application running as it is now: try it as a person would, then save what you tried as a test.'}
      </Text>
      {said ? (
        <Text
          sx={{ fontSize: 0, color: 'fg.muted', ml: 'auto' }}
          aria-live="polite"
          data-designer-last-change=""
        >
          {said}
        </Text>
      ) : null}
    </Box>
  );

  // The Preview stays mounted while another surface is shown, at the same place
  // in each: what was said to it is kept when the Maker comes back.
  // Hidden, neither is drawn again on a change: shown, it is.
  // Keyed: the Agent's tree puts them one place further than the other
  // surfaces' do, and unkeyed, a change between them handed the Preview's kept
  // part to the Python's, which, hidden, went on holding a second, stale
  // Preview (22 November 2026), and mounted the Preview again.
  const previewBody = preview ? (
    <KeptWhileHidden
      key="preview"
      as="div"
      hidden={surface !== 'preview'}
      data-designer-preview=""
    >
      {preview}
    </KeptWhileHidden>
  ) : null;
  // The Python file too: its editor keeps its place, its undo and its scroll.
  const pythonBody = python ? (
    <KeptWhileHidden
      key="python"
      as="div"
      hidden={surface !== 'python'}
      data-designer-python=""
    >
      {python}
    </KeptWhileHidden>
  ) : null;

  if (surface !== 'agent') {
    return (
      <Box data-designer-app={surface}>
        {switcher}
        {previewBody}
        {pythonBody}
        {surface === 'layout' ? layout : null}
        {surface === 'flow' ? flow : null}
      </Box>
    );
  }

  return (
    <Box
      data-designer-app="agent"
      data-designer-mock={pictured ? '' : undefined}
      onKeyDown={onKey}
    >
      {pictured ? (
        <SlidingPanel
          key={demoDrop?.nonce}
          isOpen={!!demoDrop}
          onDismiss={() => setDemoDrop(null)}
          variant="warning"
          position="north"
          message={`${demoDrop?.label ?? 'That part'} was not added: ${demo.why}`}
          details={demo.details}
          durationMs={4500}
          transitionMs={220}
          fullWidth
          offset={0}
          zIndex={40}
        />
      ) : null}
      {pictured ? null : switcher}
      {previewBody}
      {pythonBody}
      {refusal ? (
        <Flash variant="danger" role="alert">
          {refusal}
        </Flash>
      ) : null}
      <DesignerShell
        wide={wide}
        contentWidth={contentWidth}
        initialDock={initialDock}
        keepDock={!pictured}
        dockHeader={
          // What is selected, beside the dock's name.
          emptyKind || part ? (
            <Label
              size="small"
              variant="accent"
              sx={{
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              data-designer-dock-selected=""
            >
              {emptyKind ? PART_WORDS[emptyKind].title : part?.label}
            </Label>
          ) : null
        }
        dockFooter={
          <>
            <Text
              sx={{ fontSize: 0, color: 'fg.muted', whiteSpace: 'nowrap' }}
              data-designer-dock-parts={parts.length}
            >
              {`${parts.length} ${parts.length === 1 ? 'part' : 'parts'}`}
            </Text>
            <Box flex={1} />
            {problemCount ? (
              <Label
                size="small"
                variant="danger"
                data-designer-dock-problems={problemCount}
              >
                {`${problemCount} to fix`}
              </Label>
            ) : (
              <Label
                size="small"
                variant="success"
                data-designer-dock-problems={0}
              >
                Ready
              </Label>
            )}
          </>
        }
        surface={
          <AgentSurface
            parts={parts}
            avatar={avatarOf(data)}
            modelUrl={avatarModelUrlOf(data)}
            context={{
              selected: emptyKind ? '' : (part?.id ?? ''),
              select: pick,
              selectKind: kind => {
                const first = parts.find(each => each.kind === kind);
                if (first) {
                  pick(first.id);
                } else {
                  setEmptyKind(kind);
                  setPropertiesOpen(true);
                }
              },
              dragging,
              draggedId: draggedTool?.id ?? '',
              drop: (id, into) => {
                setDraggedTool(null);
                add(id, into);
              },
              problems: kindProblems,
            }}
          />
        }
        panels={
          <>
            <DesignerPanel
              id="properties"
              title={DESIGNER_WORDS.properties}
              icon={ListUnorderedIcon}
              open={propertiesOpen}
              onOpenChange={setPropertiesOpen}
            >
              {selectedProblems.length ? (
                <Flash
                  variant="warning"
                  sx={{ mb: 2 }}
                  data-designer-problems={emptyKind ?? part?.kind}
                >
                  {selectedProblems.map(problem => (
                    <Text as="p" key={problem} sx={{ m: 0, fontSize: 1 }}>
                      {problem}
                    </Text>
                  ))}
                </Flash>
              ) : null}
              {emptyKind ? (
                <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                  {`${PART_WORDS[emptyKind].title}: none yet. Drag one from the Toolbox onto it.`}
                </Text>
              ) : part ? (
                <>
                  {part.kind === 'agent'
                    ? (() => {
                        // Its harness, and what runs and hosts it: Datalayer or kagent.
                        const agentRef = (
                          data as Record<string, unknown> | null
                        )?.agent;
                        const spec =
                          typeof agentRef === 'string' && agentRef
                            ? getAgentspecs(agentRef)
                            : undefined;
                        return spec && agentEngine ? (
                          <Box
                            mb={2}
                            display="flex"
                            alignItems="center"
                            gap={2}
                            data-designer-agent-engine={spec.id}
                          >
                            <Text sx={{ fontSize: 1, fontWeight: 'semibold' }}>
                              Harness
                            </Text>
                            {agentEngine(spec)}
                          </Box>
                        ) : null;
                      })()
                    : null}
                  {part.kind === 'agent'
                    ? (() => {
                        // A coding agent over ACP: its register's terms, its credential, what it honours.
                        const agentRef = (
                          data as Record<string, unknown> | null
                        )?.agent;
                        const harness = harnessOf(
                          typeof agentRef === 'string' ? agentRef : '',
                          {
                            harnessOfAgent: id => getAgentspecs(id)?.harness,
                            harness: getHarness,
                          },
                        );
                        return harness ? (
                          <Box mb={3} data-designer-harness={harness.id}>
                            <Text
                              as="div"
                              sx={{
                                fontSize: 1,
                                fontWeight: 'semibold',
                                mb: 1,
                              }}
                            >
                              {`${HARNESS_WORDS.title}: ${harness.name}`}
                            </Text>
                            <Box
                              as="ul"
                              pl={3}
                              m={0}
                              sx={{ fontSize: 0, color: 'fg.muted' }}
                            >
                              {harnessTermsLines(harness).map(line => (
                                <Box as="li" key={line}>
                                  {line}
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        ) : null;
                      })()
                    : null}
                  {part.kind === 'agent' && avatarChoices.length ? (
                    // The agent's avatar is one of its properties, as an avatar dropped on it
                    // (asked 12 October 2026): chosen here, it is placed as the toolbox places it.
                    <FormControl disabled={disabled} sx={{ mb: 3 }}>
                      <FormControl.Label>Avatar</FormControl.Label>
                      <Select
                        block
                        size="small"
                        data-designer-avatar-choice=""
                        value={avatarOf(data)}
                        onChange={change =>
                          add(`avatar:${change.target.value}`, 'agent')
                        }
                      >
                        {avatarOf(data) ? null : (
                          <Select.Option value="">The default</Select.Option>
                        )}
                        {partFamilies(avatarChoices).map(family => (
                          <Select.OptGroup
                            key={family.label}
                            label={family.label}
                          >
                            {family.parts.map(tool => (
                              <Select.Option
                                key={tool.id}
                                value={tool.id.slice('avatar:'.length)}
                              >
                                {tool.label}
                              </Select.Option>
                            ))}
                          </Select.OptGroup>
                        ))}
                      </Select>
                      <FormControl.Caption>
                        What its floating assistant shows.
                        {/* A clippy.js character says, once chosen, that it is Microsoft's and fetched. */}
                        {avatarNoteOf(avatarChoices, avatarOf(data))
                          ? ` ${avatarNoteOf(avatarChoices, avatarOf(data))}`
                          : ''}
                      </FormControl.Caption>
                    </FormControl>
                  ) : null}
                  <SchemaProperties
                    key={part.id}
                    // A UI part: one of the UI plugins, then a renderer it may be exposed through.
                    root={
                      part.kind === 'ui'
                        ? uiChoiceRoot(APPSPEC_SCHEMA, data, part.at)
                        : APPSPEC_SCHEMA
                    }
                    data={data}
                    at={part.at}
                    title={part.label}
                    disabled={disabled}
                    onChange={(next, refused) => {
                      if (!refused) {
                        write(
                          next,
                          `designer:${part.id}`,
                          `Set ${part.label}.`,
                        );
                      }
                    }}
                  />
                  {part.at.keys ? null : (
                    <Button
                      size="small"
                      sx={{ mt: 2 }}
                      disabled={disabled}
                      onClick={() => void removeAsked(part)}
                    >
                      Remove this {PART_WORDS[part.kind].one}
                    </Button>
                  )}
                </>
              ) : (
                <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                  {DESIGNER_WORDS.nothingSelected}
                </Text>
              )}
            </DesignerPanel>
            {/* One folded menu per kind of part (asked 12 October 2026): skills, protocols, rules,
                tests… each dragged onto its node, or added with Enter. */}
            {groups.map(group => (
              <DesignerPanel
                key={group.kind}
                id={`toolbox-${group.kind}`}
                title={group.label}
                icon={TOOL_GROUP_ICONS[group.kind]}
                maxHeight={280}
                folded
              >
                <Box data-designer-tool-group={group.kind}>
                  {partFamilies(group.parts).map(family => (
                    <Box
                      key={family.label}
                      data-designer-tool-family={family.label || undefined}
                    >
                      {family.label ? (
                        <Text
                          as="div"
                          sx={{
                            fontSize: 0,
                            color: 'fg.muted',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            mt: 2,
                            mb: 1,
                          }}
                        >
                          {family.label}
                        </Text>
                      ) : null}
                      {family.note ? (
                        <Text
                          as="p"
                          sx={{ fontSize: 0, color: 'fg.muted', mt: 0, mb: 1 }}
                        >
                          {family.note}
                        </Text>
                      ) : null}
                      {family.parts.map(tool => (
                        <ToolboxItem
                          key={tool.id}
                          tool={tool}
                          disabled={disabled && !pictured}
                          onAdd={() => add(tool.id)}
                          onDrag={setDraggedTool}
                        />
                      ))}
                    </Box>
                  ))}
                </Box>
              </DesignerPanel>
            ))}
            <DesignerPanel
              id="events"
              title={DESIGNER_WORDS.events}
              icon={ZapIcon}
              folded
            >
              <Text
                as="div"
                sx={{
                  fontSize: 0,
                  color: 'fg.muted',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  mb: 1,
                }}
              >
                {EVENT_WORDS.page}
              </Text>
              {pageEvents.length ? (
                <Box
                  display="grid"
                  gap={2}
                  mb={3}
                  data-designer-page-events={pageEvents.length}
                >
                  {pageEvents.map(event => {
                    const choices =
                      event.kind === 'pressed'
                        ? gives.actions.map(action => ({
                            value: action.name,
                            words: action.words,
                          }))
                        : sendChoices(gives).map(choice => ({
                            value: choice.path,
                            words: choice.words,
                          }));
                    return (
                      <Box key={event.id} data-designer-event={event.id}>
                        <FormControl
                          disabled={disabled || Boolean(event.decidedBy)}
                        >
                          <FormControl.Label sx={{ fontSize: 0 }}>
                            {event.when}
                          </FormControl.Label>
                          <Select
                            block
                            size="small"
                            value={event.does}
                            onChange={change =>
                              choosePage(event, change.target.value)
                            }
                          >
                            <Select.Option value="">
                              {event.kind === 'pressed'
                                ? EVENT_WORDS.nothing
                                : EVENT_WORDS.nowhere}
                            </Select.Option>
                            {choices.map(choice => (
                              <Select.Option
                                key={choice.value}
                                value={choice.value}
                              >
                                {choice.words}
                              </Select.Option>
                            ))}
                            {event.unknown ? (
                              <Select.Option value={event.does}>
                                {EVENT_WORDS.unknown}
                              </Select.Option>
                            ) : null}
                          </Select>
                          {event.decidedBy ? (
                            <FormControl.Caption>
                              {event.decidedBy}
                            </FormControl.Caption>
                          ) : null}
                        </FormControl>
                      </Box>
                    );
                  })}
                </Box>
              ) : (
                <Text
                  as="p"
                  sx={{ fontSize: 0, color: 'fg.muted', mt: 0, mb: 3 }}
                >
                  {EVENT_WORDS.noPage}
                </Text>
              )}
              <Text
                as="div"
                sx={{
                  fontSize: 0,
                  color: 'fg.muted',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  mb: 1,
                }}
              >
                {EVENT_WORDS.own}
              </Text>
              {events.length ? (
                <ActionList variant="full" sx={{ mb: 2 }}>
                  {events.map(each => (
                    <ActionList.Item
                      key={each.id}
                      active={part?.id === each.id}
                      onSelect={() => pick(each.id)}
                    >
                      <ActionList.LeadingVisual>
                        <ZapIcon />
                      </ActionList.LeadingVisual>
                      {each.label}
                      <ActionList.Description variant="block">
                        {each.detail || 'Does nothing yet: say what it does.'}
                      </ActionList.Description>
                    </ActionList.Item>
                  ))}
                </ActionList>
              ) : (
                <Text as="p" sx={{ fontSize: 1, color: 'fg.muted', mt: 0 }}>
                  {EVENT_WORDS.noOwn}
                </Text>
              )}
              <ActionMenu>
                <ActionMenu.Button
                  size="small"
                  leadingVisual={ZapIcon}
                  disabled={disabled}
                >
                  Add an event
                </ActionMenu.Button>
                <ActionMenu.Overlay>
                  <ActionList>
                    {eventChoices.map(choice => (
                      <ActionList.Item
                        key={choice.id}
                        onSelect={() => add(choice.id)}
                      >
                        {choice.label}
                        <ActionList.Description variant="block">
                          {choice.says}
                        </ActionList.Description>
                      </ActionList.Item>
                    ))}
                  </ActionList>
                </ActionMenu.Overlay>
              </ActionMenu>
            </DesignerPanel>
          </>
        }
      />
    </Box>
  );
}

export default AppCanvasEditor;
