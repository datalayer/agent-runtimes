/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The canvas: the drawing a call touched last, drawn by Excalidraw itself,
 * editable. What the agent changes is brought onto the canvas as it lands;
 * what the person draws is written back to the same drawing, so the agent
 * reads it. Imported lazily: Excalidraw is not in a chat's bundle until a
 * drawing is on the page.
 *
 * @module apps/plugins/page-excalidraw/DrawingStage
 */

import { useEffect, useRef, useState, type JSX } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { SegmentedControl, useTheme } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { ExcalidrawHostedDrawing } from '@datalayer/reactor-excalidraw';
import type { PageDrawings } from './store';

type Api = {
  updateScene: (scene: { elements?: unknown; appState?: unknown }) => void;
  addFiles: (files: unknown[]) => void;
  scrollToContent: () => void;
};

export default function DrawingStage({
  drawings,
  revision,
}: {
  drawings: PageDrawings;
  revision: number;
}): JSX.Element {
  const { resolvedColorScheme } = useTheme();
  const [listed, setListed] = useState<ExcalidrawHostedDrawing[]>([]);
  const [shown, setShown] = useState<string | undefined>(drawings.current);
  const api = useRef<Api | null>(null);
  // What the canvas last showed or wrote, to tell an agent's change from an echo.
  const written = useRef('');

  useEffect(() => {
    let live = true;
    void drawings.host.listDrawings().then(all => {
      if (live) {
        setListed(all);
        setShown(drawings.current ?? all[all.length - 1]?.id);
      }
    });
    return () => {
      live = false;
    };
  }, [drawings, revision]);

  const drawing = shown ? drawings.host.get(shown) : undefined;

  useEffect(() => {
    if (!drawing || !api.current) {
      return;
    }
    const serialized = JSON.stringify(drawing.scene.elements);
    if (serialized === written.current) {
      return;
    }
    written.current = serialized;
    api.current.addFiles(Object.values(drawing.scene.files ?? {}));
    api.current.updateScene({
      elements: drawing.scene.elements,
      appState: drawing.scene.appState,
    });
    api.current.scrollToContent();
  }, [drawing, revision]);

  if (!drawing) {
    return <Box minHeight={420} aria-busy="true" />;
  }
  return (
    <Box
      data-page-excalidraw-stage={drawing.id}
      display="flex"
      flexDirection="column"
      flex={1}
      minHeight={480}
      sx={{ gap: 2 }}
    >
      {listed.length > 1 && (
        <SegmentedControl aria-label="Drawings" size="small">
          {listed.map((each, index) => (
            <SegmentedControl.Button
              key={each.id}
              selected={each.id === drawing.id}
              onClick={() => setShown(each.id)}
            >
              {`Drawing ${index + 1}`}
            </SegmentedControl.Button>
          ))}
        </SegmentedControl>
      )}
      <Box flex={1} minHeight={440} sx={{ position: 'relative' }}>
        <Excalidraw
          key={drawing.id}
          theme={resolvedColorScheme?.startsWith('dark') ? 'dark' : 'light'}
          initialData={{
            elements: drawing.scene.elements as never,
            appState: { ...drawing.scene.appState, collaborators: new Map() },
            files: drawing.scene.files as never,
            scrollToContent: true,
          }}
          excalidrawAPI={instance => {
            api.current = instance as unknown as Api;
          }}
          onChange={(elements, appState, files) => {
            const serialized = JSON.stringify(elements);
            if (serialized === written.current) {
              return;
            }
            written.current = serialized;
            // The person's strokes, on the same drawing: the agent reads them.
            drawings.host.set({
              ...drawing,
              scene: {
                elements: elements as never,
                appState: {
                  viewBackgroundColor: appState.viewBackgroundColor,
                  gridSize: appState.gridSize,
                },
                files: files as never,
              },
            });
          }}
        />
      </Box>
    </Box>
  );
}
