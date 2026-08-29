/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A notebook agent with no server behind it.
 *
 * `NotebookAgentExample` is the same idea run the usual way: it allocates a
 * runtime, creates an agent on it, points a chat at that agent's endpoint, and
 * the loop turns server-side in pydantic-ai. This one runs the loop in the
 * page with the Vercel AI SDK, and the difference in this file is mostly what
 * is *absent* — no runtime, no sandbox, no endpoint, no lifecycle.
 *
 * What is not absent is the tools. `useNotebookTools` is the identical call
 * the AG-UI example makes, and the tools it returns are the identical objects.
 * They reach into the notebook on this page either way; all that changes is
 * who calls them — a runtime over the wire, or the SDK a few lines below.
 *
 * The one thing this agent still needs a server for is the model: a browser
 * cannot hold a Bedrock credential, so it asks the Datalayer inference service,
 * which does. That is a question-and-answer, not a place the agent lives.
 *
 * Spec: `jupyter-notebook-compactor-inbrowser`, whose `harness: vercel-ai` is
 * what says it belongs here.
 *
 * @module examples/NotebookInBrowserAgent
 */

import { useCallback, useMemo, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Button, Label, Spinner, Text, TextInput } from '@primer/react';
import type { ServiceManager } from '@jupyterlab/services';
import { Notebook } from '@datalayer/jupyter-react';

import { MessagePart } from '../chat/parts';
import { useBrowserAgent } from '../hooks/useBrowserAgent';
import { JUPYTER_NOTEBOOK_COMPACTOR_INBROWSER_AGENTSPEC_0_0_1 } from '../specs/agents/agents';
import { useCoreStore, useIAMStore } from '../state';
import { useNotebookTools } from '../tools/adapters/agent-runtimes/notebookHooks';
import { ThemedJupyterProvider, ThemedProvider } from './utils/themedProvider';
import { ExampleNotebookToolbar } from './utils/notebookToolbarItems';
import MatplotlibNotebook from './utils/notebooks/Matplotlib.ipynb.json';

const SPEC = JUPYTER_NOTEBOOK_COMPACTOR_INBROWSER_AGENTSPEC_0_0_1;

/** The notebook this agent works on — the one rendered beside the chat. */
const NOTEBOOK_ID = 'notebook-in-browser-agent';

type ChatPanelProps = {
  /** The notebook the agent edits, by the id the tools address it with. */
  notebookId: string;
};

/**
 * The agent, and everything needed to talk to it.
 *
 * Small on purpose: a browser agent is a spec, a set of tools and somewhere to
 * ask a model. There is nothing else to wire.
 */
function ChatPanel({ notebookId }: ChatPanelProps): JSX.Element {
  const { configuration } = useCoreStore();
  const token = useIAMStore(state => state.token);

  // The same tools the AG-UI examples pass to `<ChatFloating frontendTools>`.
  const frontendTools = useNotebookTools(notebookId);

  const inference = useMemo(
    () => ({
      inferenceUrl:
        configuration?.aiInferenceUrl || 'https://prod1.datalayer.run',
      token: token || undefined,
    }),
    [configuration?.aiInferenceUrl, token],
  );

  const { messages, sendMessage, status, error } = useBrowserAgent({
    spec: SPEC,
    frontendTools,
    inference,
  });

  const [draft, setDraft] = useState('');
  const busy = status === 'submitted' || status === 'streaming';

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) {
        return;
      }
      setDraft('');
      void sendMessage({ text: trimmed });
    },
    [busy, sendMessage],
  );

  return (
    <Box
      sx={{
        width: 420,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid',
        borderColor: 'border.default',
        bg: 'canvas.subtle',
      }}
    >
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Text sx={{ fontWeight: 'semibold' }}>{SPEC.name}</Text>
        {/* The claim this example exists to make. */}
        <Box sx={{ ml: 'auto' }}>
          <Label variant="success">{SPEC.harness}</Label>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 3 }}>
        {messages.length === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
              {SPEC.welcomeMessage}
            </Text>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(SPEC.suggestions ?? []).map(suggestion => (
                <Button
                  key={suggestion}
                  size="small"
                  onClick={() => send(suggestion)}
                  sx={{ justifyContent: 'flex-start', textAlign: 'left' }}
                >
                  {suggestion}
                </Button>
              ))}
            </Box>
          </Box>
        )}

        {/* The same renderers the server-side chat uses. Both harnesses end in
            `useChat`, so a tool call made in this page displays exactly like
            one made by a runtime — including the notebook tools running. */}
        {messages.map((message, messageIndex) => (
          <Box key={message.id} sx={{ mb: 3 }}>
            <Text
              sx={{
                display: 'block',
                fontSize: 0,
                color: 'fg.muted',
                mb: 1,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {message.role}
            </Text>
            {message.parts.map((part, index) => (
              <MessagePart
                key={index}
                part={part}
                message={message}
                status={status}
                regen={() => undefined}
                index={index}
                lastMessage={messageIndex === messages.length - 1}
              />
            ))}
          </Box>
        ))}

        {busy && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Spinner size="small" />
            <Text sx={{ color: 'fg.muted', fontSize: 1 }}>Working…</Text>
          </Box>
        )}

        {error && (
          <Box
            sx={{
              mt: 3,
              p: 3,
              borderRadius: 2,
              bg: 'danger.subtle',
              color: 'danger.fg',
            }}
          >
            <Text sx={{ fontSize: 1 }}>{error.message}</Text>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          p: 3,
          borderTop: '1px solid',
          borderColor: 'border.default',
          display: 'flex',
          gap: 2,
        }}
      >
        <TextInput
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              send(draft);
            }
          }}
          placeholder="Ask it to compact the notebook…"
          block
          disabled={busy}
        />
        <Button variant="primary" onClick={() => send(draft)} disabled={busy}>
          Send
        </Button>
      </Box>
    </Box>
  );
}

export type NotebookInBrowserAgentProps = {
  /**
   * The Jupyter runtime for the notebook itself.
   *
   * Only the notebook needs it — the agent does not. It edits cells through
   * the frontend tools, and a compaction never has to run anything.
   */
  serviceManager?: ServiceManager.IManager;
};

/**
 * A notebook and an agent that edits it, both running in this page.
 */
function NotebookInBrowserAgent({
  serviceManager,
}: NotebookInBrowserAgentProps): JSX.Element {
  return (
    <ThemedProvider>
      <Box sx={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
            p: 3,
          }}
        >
          <Box sx={{ mb: 3 }}>
            <Box as="h1" sx={{ m: 0, fontSize: 4 }}>
              Notebook Compactor, in the browser
            </Box>
            <Text sx={{ color: 'fg.muted' }}>
              {SPEC.description}
            </Text>
          </Box>

          {serviceManager ? (
            // Only the notebook is wrapped: `JupyterReactTheme` nests a Primer
            // theme of its own, and wrapping the whole example in it would
            // make the surrounding chrome read its colours from that theme
            // rather than the app's.
            <ThemedJupyterProvider>
              <Notebook
                nbformat={MatplotlibNotebook}
                id={NOTEBOOK_ID}
                Toolbar={ExampleNotebookToolbar}
                serviceManager={serviceManager}
                height="calc(100vh - 220px)"
                cellSidebarMargin={120}
              />
            </ThemedJupyterProvider>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Spinner size="small" />
              <Text sx={{ color: 'fg.muted' }}>Starting the notebook…</Text>
            </Box>
          )}
        </Box>

        <ChatPanel notebookId={NOTEBOOK_ID} />
      </Box>
    </ThemedProvider>
  );
}

export { NotebookInBrowserAgent };
export default NotebookInBrowserAgent;
