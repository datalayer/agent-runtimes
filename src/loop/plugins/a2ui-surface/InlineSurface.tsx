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
 * @module loop/plugins/a2ui-surface/InlineSurface
 */

import type { CSSProperties, JSX } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import {
  basicCatalog,
  type ReactComponentImplementation,
} from '@a2ui/react/v0_9';
import {
  MessageProcessor,
  type A2uiClientAction,
  type A2uiMessage,
  type SurfaceModel,
} from '@a2ui/web_core/v0_9';
import {
  A2UI_RENDER_SCOPE_SX,
  A2uiMarkdownProvider,
  A2uiSurfaceComposed,
} from '../../../components/a2ui';

type Surface = SurfaceModel<ReactComponentImplementation>;

/** The catalogue a surface is rewritten to before it is drawn. */
export const SURFACE_CATALOG_ID = basicCatalog.id;

const INHERIT_THEME: CSSProperties = {
  ['--a2ui-color-surface' as never]: 'var(--bgColor-muted)',
  ['--a2ui-color-on-surface' as never]: 'var(--fgColor-default)',
  ['--a2ui-color-primary' as never]: 'var(--fgColor-accent)',
  ['--a2ui-color-outline' as never]: 'var(--borderColor-default)',
};

export function InlineSurface({
  messages,
  onAction,
  validationError,
}: {
  messages: A2uiMessage[];
  onAction: (action: A2uiClientAction) => void;
  validationError?: string | null;
}): JSX.Element | null {
  // Reached through a ref: the processor is built once, and the handler it
  // was built with must not go stale when the host's does not.
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const processor = useMemo(
    () =>
      new MessageProcessor<ReactComponentImplementation>(
        [basicCatalog],
        action => onActionRef.current(action),
      ),
    [],
  );
  const [surfaces, setSurfaces] = useState<Surface[]>([]);

  useEffect(() => {
    const created = processor.onSurfaceCreated(surface =>
      setSurfaces(previous => [...previous, surface]),
    );
    const deleted = processor.onSurfaceDeleted(id =>
      setSurfaces(previous => previous.filter(surface => surface.id !== id)),
    );
    return () => {
      created.unsubscribe();
      deleted.unsubscribe();
    };
  }, [processor]);

  // Once: the messages are one tool result, processed when it arrives.
  const processedRef = useRef(false);
  useEffect(() => {
    if (processedRef.current) {
      return;
    }
    processedRef.current = true;
    processor.processMessages(messages);
  }, [messages, processor]);

  if (surfaces.length === 0) {
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
        {validationError ? (
          <Box
            role="alert"
            sx={{
              px: 3,
              py: 2,
              borderRadius: 2,
              bg: 'danger.subtle',
              border: '1px solid',
              borderColor: 'danger.muted',
              color: 'danger.fg',
              fontSize: 1,
            }}
          >
            {validationError}
          </Box>
        ) : null}
        {surfaces.map(surface => (
          <Box
            key={surface.id}
            sx={{
              border: '1px solid',
              borderColor: 'border.default',
              borderRadius: 2,
              p: 3,
              bg: 'canvas.default',
            }}
          >
            <A2uiSurfaceComposed surface={surface} />
          </Box>
        ))}
      </Box>
    </A2uiMarkdownProvider>
  );
}

export default InlineSurface;
