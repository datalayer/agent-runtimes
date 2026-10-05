/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Decide: typed decisions asked of Jev (`cloudflare:wrk/typesafe/jev`), the
 * typed-decision model, from the chat and from the floating assistant.
 *
 * The *Decide* application of the catalogue (agentspecs `apps/decide.yaml`)
 * in the LOOP workspace, on the Local target: its agent — `example-simple`
 * with the `decide` tool — runs on the local agent-runtimes server, and
 * answers a question about a text by asking a typed decision. The floating
 * assistant beside it offers *Ask a decision* in its balloon: the situation,
 * the question and its type, asked through the same server's
 * `/api/v1/configure/inference/decisions`, the route that asks as `decide`
 * does, with the same token.
 *
 * The server needs ai-inference: start it with
 * `AGENT_RUNTIMES_INFERENCE_PROVIDER_OVERRIDE=datalayer`,
 * `DATALAYER_AI_INFERENCE_URL=https://r1.datalayer.run` and
 * `DATALAYER_AI_INFERENCE_API_KEY` set from `DATALAYER_API_KEY`. Another
 * server than `http://localhost:8765` is named with `?agentRuntimesUrl=`.
 *
 * @module examples/AgentDecideExample
 */

import React, { useMemo } from 'react';
import { configurePlugin } from '@datalayer/reactor';
import { Heading, Text } from '@primer/react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { ThemedProvider } from './utils/themedProvider';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import {
  AppRenderer,
  appDatalayerCreatePayload,
} from '../loop/apps/AppRenderer';
import { AssistantCharactersPlugin } from '../loop/plugins/assistant-characters';
import { LoopAssistantPlugin } from '../loop/plugins/assistant';
import { APP_CATALOGUE } from '../specs/apps';

setupPrimerPortals();

/** The local server: `?agentRuntimesUrl=` when given, else the examples' own. */
function serverUrlOf(): string {
  const named =
    typeof window === 'undefined'
      ? null
      : new URLSearchParams(window.location.search).get('agentRuntimesUrl');
  return resolveExampleAgentRuntimesUrl('local', named ?? undefined);
}

const AgentDecideExample: React.FC = () => {
  const app = APP_CATALOGUE['decide'];
  const serverUrl = useMemo(serverUrlOf, []);
  // Made once: a new plugin on a render restarts the workspace.
  const plugins = useMemo(
    () => [
      AssistantCharactersPlugin,
      configurePlugin(LoopAssistantPlugin, {
        app: app.interface.assistant ?? undefined,
        decisions: { serverUrl },
      }),
    ],
    [app, serverUrl],
  );
  // The Local agent is the application's: created under its id with its
  // spec, so that the server runs its instructions, its tool and its rule.
  const localAgent = useMemo(
    () => ({ createPayload: appDatalayerCreatePayload(app) }),
    [app],
  );
  return (
    <ThemedProvider>
      <Box
        sx={{
          height: '100vh',
          minHeight: 0,
          display: 'flex',
          bg: 'canvas.default',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <AppRenderer
            app={app}
            serverUrl={serverUrl}
            target="local"
            localAgent={localAgent}
            plugins={plugins}
          />
        </Box>
        <Box
          as="aside"
          sx={{
            width: 320,
            flexShrink: 0,
            p: 3,
            borderLeft: '1px solid',
            borderColor: 'border.default',
            overflowY: 'auto',
          }}
        >
          <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
            {app.emoji} Decide
          </Heading>
          <Text as="p" sx={{ fontSize: 1, mb: 2 }}>
            Typed decisions asked of Jev, the typed-decision model: yes or no
            with its probability, one of named options, or a score, each with
            its confidence.
          </Text>
          <Text as="p" sx={{ fontSize: 1, mb: 2 }}>
            <strong>In the chat</strong>: ask &ldquo;Is this ticket urgent?
            &lsquo;Help! My payouts have been failing for 3 days.&rsquo;&rdquo;
            Its agent calls the <code>decide</code> tool, a read it does without
            asking.
          </Text>
          <Text as="p" sx={{ fontSize: 1, mb: 2 }}>
            <strong>From the assistant</strong>: hover the character below and
            choose <em>Ask a decision</em> &mdash; the situation, the question,
            and its type. The answer comes back in its balloon.
          </Text>
          <Text as="p" sx={{ fontSize: 0, color: 'fg.muted' }}>
            Runs on the local agent-runtimes server at {serverUrl}, which asks
            Jev through ai-inference.
          </Text>
        </Box>
      </Box>
    </ThemedProvider>
  );
};

export default AgentDecideExample;
