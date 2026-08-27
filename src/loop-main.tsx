/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The standalone LOOP workspace page.
 *
 * This is the entry point, and it owns the providers — theme, query client —
 * because the workspace itself mounts none. The same component runs unchanged
 * inside the Datalayer app and, later, inside a JupyterLab panel, each bringing
 * providers of its own.
 *
 * @module loop-main
 */

import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { Box } from '@primer/react';
import {
  DatalayerThemeProvider,
  setupPrimerPortals,
  themeConfigs,
  useSystemColorMode,
  useThemeStore,
} from '@datalayer/primer-addons';
import { LoopWorkspace } from './loop/shell/LoopWorkspace';
import { ChatExtension } from './loop/plugins/chat';
import { internalQueryClient } from './utils';
import type { SandboxSnapshot } from './loop/core';

import './index.css';

type Session = {
  serverUrl: string;
  agentId: string;
  conversationId?: string;
  model?: string;
  view?: string;
  sandbox: SandboxSnapshot;
};

/**
 * Redeem a handoff code for the session the terminal was holding.
 *
 * The code is single-use and short-lived, so it is exchanged once on load and
 * then removed from the address bar — a URL that still carries it would be
 * pasted, bookmarked, and screenshotted.
 */
async function resolveSession(serverUrl: string): Promise<Session> {
  const params = new URLSearchParams(window.location.search);
  const handoff = params.get('handoff');
  const view = params.get('view') ?? undefined;
  const fallback: Session = {
    serverUrl,
    agentId: params.get('agentId') ?? '',
    view,
    sandbox: { state: 'idle' },
  };

  if (!handoff) {
    return fallback;
  }

  try {
    const response = await fetch(
      `${serverUrl}/api/v1/loop/handoff/exchange?code=${encodeURIComponent(handoff)}`,
      { method: 'POST' },
    );
    if (!response.ok) {
      return fallback;
    }
    const session = await response.json();

    params.delete('handoff');
    const query = params.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}`,
    );

    return {
      serverUrl,
      agentId: session.agent_id ?? fallback.agentId,
      conversationId: session.conversation_id ?? undefined,
      model: session.model ?? undefined,
      view: session.view ?? view,
      sandbox: {
        state: session.sandbox?.sandbox_running ? 'running' : 'idle',
        variant: session.sandbox?.variant,
        kernelId: session.sandbox?.kernel_id,
        jupyterUrl: session.sandbox?.jupyter_url,
      },
    };
  } catch {
    // A handoff that cannot be redeemed is not a reason to show nothing: the
    // page still opens, just without the terminal's conversation.
    return fallback;
  }
}

function LoopPage(): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const { colorMode, theme } = useThemeStore();
  const systemColorMode = useSystemColorMode();
  const resolvedMode = colorMode === 'auto' ? systemColorMode : colorMode;
  const themeConfig = themeConfigs[theme];

  useEffect(() => {
    // Overlays — the view switcher's tooltips, dialogs, the mention typeahead —
    // render outside this subtree, so the portal root has to exist and be
    // themed before anything opens one.
    setupPrimerPortals();
  }, []);

  useEffect(() => {
    const serverUrl = window.location.origin;
    void resolveSession(serverUrl).then(setSession);
  }, []);

  return (
    <DatalayerThemeProvider
      colorMode={resolvedMode}
      theme={themeConfig.primerTheme}
      themeStyles={themeConfig.themeStyles}
    >
      <QueryClientProvider client={internalQueryClient}>
        <Box sx={{ height: '100vh', overflow: 'hidden' }}>
          {session ? (
            <LoopWorkspace
              serverUrl={session.serverUrl}
              agentId={session.agentId}
              conversationId={session.conversationId}
              model={session.model}
              sandbox={session.sandbox}
              initialViewType={session.view}
              extensions={[ChatExtension]}
            />
          ) : null}
        </Box>
      </QueryClientProvider>
    </DatalayerThemeProvider>
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <LoopPage />
    </StrictMode>,
  );
}
