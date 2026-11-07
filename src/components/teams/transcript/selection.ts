/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The selection the transcript's views and the stage share (SCENES S3-02).
 *
 * A line selected in the Lines, Table or Sequence view — or a row, or an
 * arrow — is one {@link TranscriptSelection}: the line's key, who it is from
 * and to, its kind and time. The page holds it (`TranscriptViews`'s
 * `selected`/`onSelect`) and hands the graph the edge it is on,
 * {@link selectedEdgeOf}: the member ids and, for a call, the connection's
 * node id, as `A2ATeamGraph` names its edges (`from->to` for an A2A link,
 * `member->member/connection` for a connection's call edge).
 *
 * **The contract with the graph and its backdrops.** The graph takes
 * `selected?: SelectedEdge | null` and draws that edge highlighted on every
 * backdrop — by its `id`, or by its endpoints in either direction, since an
 * answer travels the asker's edge back. A click on an edge gives the page the
 * edge's latest exchange: the graph calls `onSelectEdge?(edge)` and the page
 * answers with `latestLineOnEdge` to find the line to select.
 *
 * @module components/teams/transcript/selection
 */

import type {
  SceneTranscriptKind,
  SceneTranscriptLine,
  SceneTranscriptMember,
} from '../sceneTranscriptRules';

/** A line selected, as the views and the stage share it. */
export type TranscriptSelection = {
  /** The line's key. */
  key: string;
  from: string;
  to?: string;
  kind: SceneTranscriptKind;
  at: number;
  failed?: boolean;
};

/** The edge of the graph a selection is on. */
export type SelectedEdge = {
  /** As the graph names it: `sales->accounting`, `accounting->accounting/odoo-accounting`. */
  id: string;
  /** The asker's or caller's member id. */
  from: string;
  /** The member asked (by id), or the connection's node id. */
  to: string;
  over: 'a2a' | 'mcp';
  /** The selection it is for. */
  key: string;
};

/** The selection a line is. */
export function selectionOfLine(
  line: SceneTranscriptLine,
): TranscriptSelection {
  return {
    key: line.key,
    from: line.from,
    ...(line.to ? { to: line.to } : {}),
    kind: line.kind,
    at: line.at,
    ...(line.failed ? { failed: true } : {}),
  };
}

/** A connection's node id in the graph: the member's id, a slash, the connection's. */
export const connectionNodeIdOf = (
  member: string,
  connection: string,
): string => `${member}/${connection}`;

/** The member a name is: by name, then by id. */
function memberOf(
  name: string | undefined,
  members: readonly SceneTranscriptMember[],
): SceneTranscriptMember | undefined {
  return name
    ? (members.find(member => member.name === name) ??
        members.find(member => member.id === name))
    : undefined;
}

/**
 * The edge a selection is on, or none: a line between two members is on
 * their A2A link, oriented from the asker (an answer travels it back); a
 * call is on the caller's edge to the connection whose label it reaches.
 * A line the person speaks, or a call to a tool's home, is on no edge.
 */
export function selectedEdgeOf(
  selection: TranscriptSelection | null | undefined,
  members: readonly SceneTranscriptMember[],
): SelectedEdge | undefined {
  if (!selection || !selection.to) {
    return undefined;
  }
  const from = memberOf(selection.from, members);
  const to = memberOf(selection.to, members);
  if (selection.kind === 'called') {
    const connection = from?.connections?.find(
      one => one.label === selection.to || one.name === selection.to,
    );
    if (!from || !connection) {
      return undefined;
    }
    const node = connectionNodeIdOf(from.id, connection.id);
    return {
      id: `${from.id}->${node}`,
      from: from.id,
      to: node,
      over: 'mcp',
      key: selection.key,
    };
  }
  if (!from || !to) {
    return undefined;
  }
  // An answer (`said`, with `to`) goes back along the ask's edge.
  const [asker, asked] = selection.kind === 'said' ? [to, from] : [from, to];
  return {
    id: `${asker.id}->${asked.id}`,
    from: asker.id,
    to: asked.id,
    over: 'a2a',
    key: selection.key,
  };
}

/**
 * The latest line on an edge: what a click on the edge selects. The edge's
 * ends are member ids (or a connection's node id); the lines name members.
 */
export function latestLineOnEdge(
  edge: Pick<SelectedEdge, 'from' | 'to'>,
  lines: readonly SceneTranscriptLine[],
  members: readonly SceneTranscriptMember[],
): SceneTranscriptLine | undefined {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const on = selectedEdgeOf(selectionOfLine(line), members);
    if (
      on &&
      ((on.from === edge.from && on.to === edge.to) ||
        (on.from === edge.to && on.to === edge.from))
    ) {
      return line;
    }
  }
  return undefined;
}
