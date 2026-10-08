/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A generated A2UI surface, drawn inline where the agent's answer lands.
 *
 * Its own processor, so the surface can be filled in and submitted here
 * whatever else is showing it. The basic catalogue draws from inherited
 * `--a2ui-*` custom properties, so the surface follows the workspace's theme
 * by inheriting rather than by being told — the same rule the Surface view
 * follows, and what keeps a generated form from being the one light card in
 * a dark workspace.
 *
 * The same renderer draws an application's page (`apps/plugins/app-page`):
 * there the surface is fed live `data` by path as the conversation moves, and
 * an action is handed the surface it came from, so that what a block wrote
 * into its data model can be read when a button is pressed. It draws from
 * Datalayer's catalog: the basic one, any block shown only while its
 * `visible_when` holds — or, given one, a catalog narrowed to the blocks
 * the workspace's plugins contribute (`catalogOfBlocks`).
 *
 * @module apps/plugins/a2ui-surface/InlineSurface
 */

import type { CSSProperties, JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import {
  Catalog,
  MessageProcessor,
  type A2uiClientAction,
  type A2uiMessage,
  type SurfaceModel,
} from '@a2ui/web_core/v0_9';
import {
  A2UI_RENDER_SCOPE_SX,
  A2uiMarkdownProvider,
  A2uiSurfaceComposed,
  datalayerCatalog,
} from '../../../components/a2ui';

/** A surface as the renderer holds it: its data model is `dataModel`. */
export type InlineSurfaceModel = SurfaceModel<ReactComponentImplementation>;
type Surface = InlineSurfaceModel;

/** The catalogue a surface is rewritten to before it is drawn. */
export const SURFACE_CATALOG_ID = datalayerCatalog.id;

const INHERIT_THEME: CSSProperties = {
  ['--a2ui-color-surface' as never]: 'var(--bgColor-muted)',
  ['--a2ui-color-on-surface' as never]: 'var(--fgColor-default)',
  ['--a2ui-color-primary' as never]: 'var(--fgColor-accent)',
  ['--a2ui-color-outline' as never]: 'var(--borderColor-default)',
};

/** Values to publish into a surface, by path. */
export type InlineSurfaceData = Record<string, unknown>;

export function InlineSurface({
  messages,
  onAction,
  validationError,
  data,
  catalog = datalayerCatalog,
  onSurface,
}: {
  messages: A2uiMessage[];
  /** What it draws with, read once: Datalayer's catalog unless given. */
  catalog?: Catalog<ReactComponentImplementation>;
  /** Told of an action, with the surface it came from. */
  onAction: (action: A2uiClientAction, surface?: Surface) => void;
  validationError?: string | null;
  /**
   * Values published into every surface's data model, by path, after the
   * messages are processed and whenever one changes. Only a path whose value
   * changed is written: what a person typed elsewhere in the model stays.
   */
  data?: InlineSurfaceData;
  /**
   * Told of each surface once it is created, for a host that reads what a
   * person writes as they write it — a widget's page run again as an input
   * changes (LOOP P-05) — rather than when a button is pressed.
   */
  onSurface?: (surface: Surface) => void;
}): JSX.Element | null {
  // Reached through a ref: the processor is built once, and the handler it
  // was built with must not go stale when the host's does not.
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const processor = useMemo(
    () =>
      new MessageProcessor<ReactComponentImplementation>([catalog], action =>
        onActionRef.current(
          action,
          processorRef.current?.model.getSurface(action.surfaceId),
        ),
      ),
    // Once: a host that changes what it draws with mounts a new surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const processorRef = useRef<
    MessageProcessor<ReactComponentImplementation> | undefined
  >(undefined);
  processorRef.current = processor;
  const [surfaces, setSurfaces] = useState<Surface[]>([]);

  const onSurfaceRef = useRef(onSurface);
  onSurfaceRef.current = onSurface;
  useEffect(() => {
    const created = processor.onSurfaceCreated(surface => {
      setSurfaces(previous => [...previous, surface]);
      onSurfaceRef.current?.(surface);
    });
    const deleted = processor.onSurfaceDeleted(id =>
      setSurfaces(previous => previous.filter(surface => surface.id !== id)),
    );
    return () => {
      created.unsubscribe();
      deleted.unsubscribe();
    };
  }, [processor]);

  // Once: the messages are one tool result, processed when it arrives.
  // A tree the catalog refuses is said, where it would have been drawn,
  // rather than thrown out of an effect and taking the page down with it.
  const processedRef = useRef(false);
  const [processError, setProcessError] = useState<string | null>(null);
  useEffect(() => {
    if (processedRef.current) {
      return;
    }
    processedRef.current = true;
    try {
      processor.processMessages(messages);
    } catch (error) {
      setProcessError(
        `This surface could not be drawn: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, [messages, processor]);

  // After the messages: the surfaces exist by then, created synchronously.
  const publishedRef = useRef<InlineSurfaceData>({});
  useEffect(() => {
    if (!data) {
      return;
    }
    const published = publishedRef.current;
    for (const [path, value] of Object.entries(data)) {
      if (Object.is(published[path], value)) {
        continue;
      }
      published[path] = value;
      for (const surface of processor.model.surfacesMap.values()) {
        surface.dataModel.set(path, value);
      }
    }
  }, [data, processor]);

  const notice = validationError || processError;
  if (surfaces.length === 0 && !notice) {
    return null;
  }

  return (
    <A2uiMarkdownProvider>
      <Box
        style={INHERIT_THEME}
        sx={{
          ...A2UI_RENDER_SCOPE_SX,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {notice ? (
          <Box
            role="alert"
            px={3}
            py={2}
            borderRadius={2}
            bg="danger.subtle"
            border="1px solid"
            borderColor="danger.muted"
            color="danger.fg"
            fontSize={1}
          >
            {notice}
          </Box>
        ) : null}
        {surfaces.map(surface => (
          <Box
            key={surface.id}
            border="1px solid"
            borderColor="border.default"
            borderRadius={2}
            p={3}
            bg="canvas.default"
          >
            <A2uiSurfaceComposed surface={surface} />
          </Box>
        ))}
      </Box>
    </A2uiMarkdownProvider>
  );
}

export default InlineSurface;
