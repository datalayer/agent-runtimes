/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A backdrop: how a scene's stage is drawn. The same members, systems and
 * links — what `A2ATeamGraph` computes of a team: who stands where, which
 * way each link carries a message, which connection answers a call — drawn
 * in another look: React Flow's node and edge types, the stage's own
 * colours as CSS variables on its box, and how a member is sized and its
 * connections placed beside it.
 *
 * The scene keeps its backdrop (`SceneStageSpec.backdrop`, agentspecs'
 * `Backdrop`): `studio`, the drawing every scene had first; `hero`, round
 * faces on a deep tint with a dot that flies with each message; `plain`,
 * boxes and arrows that do not move.
 *
 * @module components/teams/backdrops/types
 */

import type { EdgeTypes, NodeTypes } from '@xyflow/react';
import type { BoxProps } from '@datalayer/primer-addons';
import type { AssistantModel3D } from '../../../chat/assistant/avatar3dModel';
import type { AssistantAbout } from '../../../chat/assistant/AssistantStage';
import type { BalloonSuggestion } from '../../../chat/assistant/SpeechBalloon';
import type { DisplayItem } from '../../../types/chat';
import type { AssistantMenuItem } from '../../../chat/assistant/AssistantContextMenu';
import type { AssistantSandbox } from '../../../chat/assistant/assistantDetails';
import type { OtelLiveTracer } from '@datalayer/core/lib/otel/live';
import type { BalloonExpandTarget } from '../../../chat/assistant/BalloonVisual';
import type { BalloonDisplay } from '../../../chat/assistant/toolLine';
import type { A2ATeamConnection, A2ATeamFlow } from '../a2aTeamFlow';
import type { A2ATeamPersona } from '../useA2ATeam';
import type { SceneBackdropId } from '../../../types/scenes';

export type { SceneBackdropId };

/** Rules on the stage's box or a node, as `Box`'s `sx` reads them: Primer's tokens, nested selectors, keyframes. */
export type StageSx = NonNullable<BoxProps['sx']>;

/** One member of the team, as the graph draws it. */
export type A2ATeamGraphMember = {
  id: string;
  name: string;
  emoji?: string;
  /** Its avatar, as its Appspec's `interface.avatar` names it: an id, or a 3D model. */
  character: string | AssistantModel3D;
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
   * How its balloon shows what it says (T-23): only what it says or
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

/** What a member's node is given: the rest is read from the graph's contexts. */
export type MemberData = {
  id: string;
  /** Which half of the graph it stands in: its balloon opens toward the middle. */
  side: 'left' | 'right';
  /** Its figure's size, in pixels at full scale. */
  size: number;
};

/** What a connection's node is given. */
export type ConnectionData = {
  member: string;
  connection: string;
  /** Its mark's size, in pixels at full scale. */
  size: number;
};

/** What an A2A link's edge is given. */
export type LinkData = {
  flow: A2ATeamFlow;
  connected: boolean;
  /** What it says: `A2A`, and the flow's words while it carries a message. */
  label: string;
};

/** What a member's link to a connection is given. */
export type CallData = {
  /** Which way it carries a call: out with the call, back with its result. */
  flow: A2ATeamFlow;
  /** The tool being called, in words (`list invoices`); empty while none is. */
  calling: string;
  /** What it says: `MCP`, and what it carries while it carries something. */
  label: string;
};

/**
 * The stage's own colours and type, as CSS variables on the graph's box —
 * `--scene-stage-bg` and the others a backdrop's nodes and edges read —
 * for the light mode and the dark one (Primer's `data-color-mode`), and
 * the box's own rules beside them: its background, its corners, the
 * keyframes its edges move by.
 */
export interface SceneBackdropTheme {
  /** The variables in the light mode. */
  light: Record<`--${string}`, string>;
  /** The variables in the dark mode: `data-color-mode="dark"`, or `auto` on a dark system. */
  dark: Record<`--${string}`, string>;
  /** The box's rules: its background, padding and corners, the classes and keyframes its drawing uses. */
  sx?: StageSx;
}

/** How a member is sized, and how its connections are placed beside it, in the graph's coordinates at full scale. */
export interface SceneBackdropLayout {
  /** A member's node, wide. */
  nodeWidth: number;
  /** Between two columns of members. */
  gap: number;
  /** Between two rows of members. */
  rowGap: number;
  /** A member's node, tall: its figure of `size`, its name and where it runs. */
  memberHeight: (size: number) => number;
  /** A connection's mark, as a fraction of its member's figure. */
  connectionScale: number;
  /** A connection's node, wide. */
  connectionWidth: number;
  /** Between a member and its connections, to its right: room for the edge's words. */
  connectionGap: number;
  /** Between two connections of one member. */
  connectionsApart: number;
  /** A connection's node, tall: its mark of `size`, its label and how it is reached. */
  connectionHeight: (size: number) => number;
  /** Where a member's first connection's top is, from the member's top. */
  connectionsTop: (size: number) => number;
  /** The least room above the members for their balloons, when the page says none. */
  balloonRoom: number;
}

/** A backdrop: how a scene's stage is drawn. */
export interface SceneBackdrop {
  id: SceneBackdropId;
  /** `Studio`, `Hero`, `Plain`. */
  name: string;
  /** One line of what the stage looks like, for a chooser. */
  description: string;
  /** React Flow's node types: `member`, `connection`. */
  nodeTypes: NodeTypes;
  /** React Flow's edge types: `a2a`, `mcp`. */
  edgeTypes: EdgeTypes;
  theme: SceneBackdropTheme;
  layout: SceneBackdropLayout;
}
