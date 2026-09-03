/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the hidden editors hold, for the selector to show.
 *
 * The notebook and the document are mounted and connected whether or not
 * they are on screen — the agent works in them from the `none` view. The
 * selector is where that stops being invisible: each label carries a live
 * count ("Notebook (4)"), and hovering opens a card listing the cells or
 * blocks, one truncated source line each. A person watching the agent work
 * sees the notebook filling up without ever leaving the conversation.
 *
 * The notebook is read synchronously from the live model and followed
 * through its own signals; the document is read through the lexical store's
 * async block reader, refreshed when the store reports change. The lexical
 * module is imported lazily and only once the workspace actually offers a
 * document — this file must not be the import that drags lexical into every
 * bundle.
 *
 * @module loop/plugins/shell/useEditorPreviews
 */

import type { JSX, ReactNode } from 'react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Box, Text } from '@primer/react';
import { notebookStore } from '@datalayer/jupyter-react';
import { getEditorChoice, subscribeEditorChoice } from './editorChoice';

export type EditorPreview = {
  badge: string;
  details: ReactNode;
};

const PREVIEW_LENGTH = 56;

function stripped(source: string): string {
  const line = source.split('\n').find(entry => entry.trim()) ?? '';
  const trimmed = line.trim();
  return trimmed.length > PREVIEW_LENGTH
    ? `${trimmed.slice(0, PREVIEW_LENGTH - 1)}…`
    : trimmed || '(empty)';
}

/** The card's body: one row per cell or block. */
function PreviewList({
  title,
  rows,
}: {
  title: string;
  rows: { kind: string; text: string }[];
}): JSX.Element {
  return (
    <Box>
      <Text sx={{ fontWeight: 'semibold', display: 'block', mb: 1 }}>
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text sx={{ color: 'fg.muted' }}>Empty so far.</Text>
      ) : (
        rows.map((row, index) => (
          <Box
            key={index}
            sx={{ display: 'flex', gap: 2, py: '2px', alignItems: 'baseline' }}
          >
            <Text sx={{ color: 'fg.muted', flexShrink: 0, fontFamily: 'mono' }}>
              {index} · {row.kind}
            </Text>
            <Text
              sx={{
                fontFamily: 'mono',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {row.text}
            </Text>
          </Box>
        ))
      )}
    </Box>
  );
}

/** The editors currently on offer, from the choice store — reactive. */
function useOfferedEditors(): readonly string[] {
  return useSyncExternalStore(
    subscribeEditorChoice,
    () => getEditorChoice().options,
  );
}

/** The live notebook rows for a surface id, followed through model signals. */
function useNotebookRows(
  surfaceId: string,
  enabled: boolean,
): { kind: string; text: string }[] | null {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const bump = () => setTick(value => value + 1);
    const cleanups: (() => void)[] = [];
    // The store says when the notebook arrives; the model says when it
    // changes. Both guarded: the test environment mocks the store away.
    try {
      const unsubscribe = (
        notebookStore as { subscribe?: (cb: () => void) => () => void }
      ).subscribe?.(bump);
      if (unsubscribe) {
        cleanups.push(unsubscribe);
      }
      const model = notebookStore.getState()?.notebooks?.get(surfaceId)?.model;
      if (model) {
        const signals = [
          (model as { contentChanged?: { connect: any; disconnect: any } })
            .contentChanged,
          (
            model.cells as unknown as {
              changed?: { connect: any; disconnect: any };
            }
          )?.changed,
        ];
        for (const signal of signals) {
          if (signal?.connect) {
            signal.connect(bump);
            cleanups.push(() => signal.disconnect(bump));
          }
        }
      }
    } catch {
      // No live store here (tests, SSR): the selector simply shows no badge.
    }
    return () => {
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch {
          /* a disposed model refuses disconnects; nothing to do */
        }
      }
    };
    // Reconnected on every bump: a bump may have brought the model with it,
    // and re-attaching two listeners is cheaper than being clever about it.
  }, [enabled, surfaceId, tick]);

  return useMemo(() => {
    if (!enabled) {
      return null;
    }
    const model = safeModel(surfaceId);
    if (!model) {
      return null;
    }
    const rows: { kind: string; text: string }[] = [];
    const cells = model.cells;
    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells.get(index);
      rows.push({
        kind: cell.type,
        text: stripped(cell.sharedModel.getSource()),
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, surfaceId, tick]);
}

function safeModel(surfaceId: string) {
  try {
    return notebookStore.getState()?.notebooks?.get(surfaceId)?.model ?? null;
  } catch {
    return null;
  }
}

/** The document's brief blocks, refreshed when the lexical store changes. */
function useDocumentRows(
  surfaceId: string,
  enabled: boolean,
): { kind: string; text: string }[] | null {
  const [rows, setRows] = useState<{ kind: string; text: string }[] | null>(
    null,
  );

  useEffect(() => {
    if (!enabled) {
      setRows(null);
      return undefined;
    }
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let pending = false;

    // Lazily, and only because a document is actually on offer: this hook
    // must not be the import that pulls lexical into every bundle. The
    // Prism setup loads first, in the same chain — jupyter-lexical pulls
    // `@lexical/code`, whose language components read the bare global
    // `Prism` the instant they evaluate, and whichever dynamic import wins
    // the race decides whether the global exists yet.
    void import('@datalayer/jupyter-react/lib/css/PrismCss')
      .then(() => import('@datalayer/jupyter-lexical'))
      .then(({ lexicalStore }) => {
        if (cancelled) {
          return;
        }
        const refresh = () => {
          if (pending) {
            return;
          }
          pending = true;
          void lexicalStore
            .getState()
            .readAllBlocks(surfaceId, 'brief')
            .then(blocks => {
              pending = false;
              if (cancelled || !Array.isArray(blocks)) {
                return;
              }
              setRows(
                (blocks as { block_type?: string; preview?: string }[]).map(
                  block => ({
                    kind: block.block_type ?? 'block',
                    text: stripped(block.preview ?? ''),
                  }),
                ),
              );
            })
            .catch(() => {
              pending = false;
              // No adapter yet: the document has not mounted. No badge, no lie.
              if (!cancelled) {
                setRows(null);
              }
            });
        };
        refresh();
        unsubscribe = lexicalStore.subscribe(refresh);
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [enabled, surfaceId]);

  return rows;
}

/**
 * Live previews for the editor selector, keyed by surface id.
 *
 * Only the editors actually on offer are read — the store subscriptions and
 * the lexical import cost nothing in a workspace without them.
 */
export function useEditorPreviews(
  surfaceId: string,
): Record<string, EditorPreview | undefined> {
  const offered = useOfferedEditors();
  const notebookRows = useNotebookRows(surfaceId, offered.includes('notebook'));
  const documentRows = useDocumentRows(surfaceId, offered.includes('document'));

  return useMemo(() => {
    const previews: Record<string, EditorPreview | undefined> = {};
    if (notebookRows) {
      previews.notebook = {
        badge: String(notebookRows.length),
        details: <PreviewList title="Cells" rows={notebookRows} />,
      };
    }
    if (documentRows) {
      previews.document = {
        badge: String(documentRows.length),
        details: <PreviewList title="Blocks" rows={documentRows} />,
      };
    }
    return previews;
  }, [notebookRows, documentRows]);
}

export default useEditorPreviews;
