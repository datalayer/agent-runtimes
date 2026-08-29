/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The A2UI view: what the sandbox produced, rendered.
 *
 * The conversion happens on the server (D20), so this view only receives
 * messages and draws them. That is what lets the terminal show a degraded
 * version of the same surface instead of a second implementation.
 *
 * @module loop/plugins/a2ui/A2uiView
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Box, Text } from '@primer/react';
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
import { useSignalValue } from '@datalayer/reactor/react';
import { A2uiSurfaceComposed } from '../../../components/a2ui';
import type { LoopViewProps } from '../../core';
import { useSandboxService } from '../agents';

type Surface = SurfaceModel<ReactComponentImplementation>;

/**
 * A2UI's basic catalog draws from inherited `--a2ui-*` custom properties, so a
 * surface follows the workspace's theme by inheriting rather than by being
 * told — which is what keeps a generated surface from being the one light card
 * in a dark workspace (§3.6).
 */
const INHERIT_THEME: CSSProperties = {
  ['--a2ui-color-surface' as never]: 'var(--bgColor-muted)',
  ['--a2ui-color-on-surface' as never]: 'var(--fgColor-default)',
  ['--a2ui-color-primary' as never]: 'var(--fgColor-accent)',
  ['--a2ui-color-outline' as never]: 'var(--borderColor-default)',
};

export default function A2uiView({ workspace }: LoopViewProps): JSX.Element {
  const service = useSandboxService();
  const lastExecution = useSignalValue(service.lastExecution);
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [error, setError] = useState<string | null>(null);

  // The code that produced what is on screen, so an action can re-run *it*
  // rather than whatever the sandbox happened to execute last.
  const sourceRef = useRef<string>('');
  const renderRef = useRef<
    ((code: string, action?: A2uiClientAction) => Promise<void>) | null
  >(null);

  const processor = useMemo(
    () =>
      new MessageProcessor<ReactComponentImplementation>(
        [basicCatalog],
        action => {
          // The round-trip: what the reader did goes back to the code that drew
          // the surface, and the surface it returns replaces this one. Without
          // this a surface is a screenshot with buttons on it.
          void renderRef.current?.(sourceRef.current, action);
        },
      ),
    [],
  );

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

  const render = useCallback(
    async (code: string, action?: A2uiClientAction) => {
      setError(null);
      sourceRef.current = code;
      try {
        const response = await fetch(
          `${workspace.serverUrl}/api/v1/sandbox/execute/a2ui`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code, action: action ?? null }),
          },
        );
        if (!response.ok) {
          setError(
            `The server could not render that execution (${response.status}).`,
          );
          return;
        }
        const payload = await response.json();
        // Replace rather than stack: a filtered view is the same surface with
        // different data, not a second one below the first.
        setSurfaces([]);
        processor.processMessages((payload.messages ?? []) as A2uiMessage[]);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    },
    [processor, workspace.serverUrl],
  );

  // Published for the processor's action callback, which is built once and
  // cannot close over a `render` that changes with the server URL.
  useEffect(() => {
    renderRef.current = render;
  }, [render]);

  // Re-render whenever the sandbox runs something new.
  useEffect(() => {
    if (lastExecution?.code) {
      void render(lastExecution.code);
    }
  }, [lastExecution, render]);

  if (error) {
    return (
      <Centered>
        <Text sx={{ color: 'danger.fg' }}>{error}</Text>
      </Centered>
    );
  }

  if (surfaces.length === 0) {
    return (
      <Centered>
        <Text>
          Nothing has run yet. Ask for something that executes code and the
          result appears here as a surface rather than as output.
        </Text>
      </Centered>
    );
  }

  return (
    <Box
      sx={{ height: '100%', overflowY: 'auto', px: 4, py: 3 }}
      style={INHERIT_THEME}
    >
      {surfaces.map(surface => (
        <A2uiSurfaceComposed key={surface.id} surface={surface} />
      ))}
    </Box>
  );
}

function Centered({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'fg.muted',
        fontSize: 1,
        px: 4,
        textAlign: 'center',
      }}
    >
      {children}
    </Box>
  );
}
