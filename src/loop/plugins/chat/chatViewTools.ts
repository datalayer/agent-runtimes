/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The tools an agent keeps when no editor is on screen.
 *
 * In the chat view the notebook and the document are still mounted, out of
 * sight, so every tool would still *work* — but a cell inserted into a
 * notebook nobody is looking at is a change the person did not see happen.
 * So the view decides the toolset: with an editor open the agent has all of
 * its tools; with none, it keeps the ones that leave the editors as they
 * are — `executeCodeInNotebook` and `executeCodeInDocument`, whose outputs
 * stream onto the conversation, and the
 * read and list tools, so it can still answer from what is there.
 *
 * Names are matched by their reference form and their raw `datalayer_` form
 * alike, since the adapter registers whichever the definition carries.
 *
 * @module loop/plugins/chat/chatViewTools
 */

/** The reference name, with the adapter's prefix and the editor suffix off. */
function bareName(name: string): string {
  return name.replace(/^datalayer_/, '').replace(/_lexical$/, '');
}

/** Whether a tool changes nothing on an editor. */
export function isChatViewTool(name: string): boolean {
  const bare = bareName(name);
  return (
    /^executeCodeIn(Notebook|Document)$/.test(bare) ||
    /^(read|list)[A-Z]/.test(bare)
  );
}

/** The subset of `tools` an agent is handed while no editor is on screen. */
export function toolsForChatView<T extends { name: string }>(tools: T[]): T[] {
  return tools.filter(tool => isChatViewTool(tool.name));
}

/**
 * The order tool contributions are merged in, by their contribution id.
 *
 * The notebook and the document used to ship an `executeCode` under one
 * reference name, and which contribution arrived first decided which won —
 * a race, and in the chat view the document's would answer "No active kernel
 * session" to a request the notebook's could serve. The names are specific
 * now (`executeCodeInNotebook`, `executeCodeInDocument`), so nothing is
 * shadowed; the order is kept deterministic all the same, because "first
 * wins" should never again depend on which lazy import landed first.
 *
 * The editor on screen goes first; with none on screen, the notebook does.
 * Everything else keeps its relative order.
 */
export function orderToolContributions<T extends { value: { id: string } }>(
  entries: readonly T[],
  activeSurfaceId: string | undefined,
): T[] {
  const rank = (entry: T): number => {
    if (activeSurfaceId && entry.value.id === `${activeSurfaceId}-tools`) {
      return 0;
    }
    return entry.value.id === 'notebook-tools' ? 1 : 2;
  };
  return entries
    .map((entry, index) => ({ entry, index, rank: rank(entry) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(item => item.entry);
}
