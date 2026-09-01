/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The same execution, dumped and rendered.
 *
 * A Jupyter kernel answers with outputs — a stream, a mime bundle, a
 * traceback. Printed, that is a wall of text with a base64 blob in the middle;
 * it is what a person scrolls past. The A2UI converter reads the same outputs
 * and returns a surface: the error first because that is what you need first,
 * the figure as a figure, long text summarised rather than poured out.
 *
 * Both panels here come from one run. The left is what the kernel said, the
 * right is what the converter made of it, and the point of putting them side
 * by side is that nothing is added between them — the surface is a reading of
 * the outputs, not a second source of truth.
 *
 * The conversion happens on the server (D20), which is why this example needs
 * an agent-runtimes server and says so plainly when there is none.
 *
 * @module examples/A2UiJupyterOutputExample
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import {
  Button,
  Label,
  SegmentedControl,
  Spinner,
  Text,
  type BetterSystemStyleObject,
} from '@primer/react';
import { PlayIcon } from '@primer/octicons-react';
import type { IOutput } from '@jupyterlab/nbformat';
import { Output, OutputIPyWidgets } from '@datalayer/jupyter-react';
import type { A2uiClientAction, A2uiMessage } from '@a2ui/web_core/v0_9';
import type { FrontendToolDefinition } from '../types/tools';
import { Chat } from '../chat';
import { A2UI_RENDER_SCOPE_SX, A2uiSurfaceComposed } from '../components/a2ui';
import { ThemedProvider } from './utils/themedProvider';
import { A2uiMarkdownProvider } from './utils/a2uiMarkdownProvider';
import { useA2uiProcessor } from './utils/a2ui';
import { useExampleAgentRuntime } from './hooks/useExampleAgentRuntime';
import { uniqueAgentId } from './utils/agentId';
import { useRuntimeTarget } from './utils/runtimeTargetStore';

const EXAMPLE_ID = 'A2UiJupyterOutputExample';
const AGENT_NAME = 'a2ui-jupyter-output';
const AGENTSPEC_ID = 'example-a2ui-jupyter-output';

type DemoKind =
  'stream' | 'figure' | 'table' | 'error' | 'ipywidgets' | 'interactive';
type SurfaceAction = { name: string; label: string };

/** One kind of Jupyter output, and the code that produces it. */
interface Snippet {
  id: DemoKind | 'chat';
  label: string;
  /** What this one is here to show. */
  about: string;
  code: string;
  actions?: SurfaceAction[];
  chat?: boolean;
}

const SNIPPETS: Snippet[] = [
  {
    id: 'stream',
    label: 'Stream',
    about:
      'stdout and a returned value. The plainest case, and the one that reads worst as raw output.',
    code: `import platform
import time

print("Python", platform.python_version())
planets = [("Mars", 2), ("Jupiter", 95), ("Saturn", 274)]
for index, (planet, moons) in enumerate(planets):
    print(f"{planet:<8} {moons:>4} moons")
    if index < len(planets) - 1:
        for _ in range(6):
            print(".", end="", flush=True)
            time.sleep(0.25)
        print()

sum(moons for _, moons in planets)
`,
  },
  {
    id: 'figure',
    label: 'Figure',
    about:
      'An image/png mime bundle. As raw output this is a base64 blob; as a surface it is the plot.',
    code: `import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from io import BytesIO
from IPython.display import Image, display

x = np.linspace(0, 4 * np.pi, 400)
figure, axes = plt.subplots(figsize=(5, 2.6))
axes.plot(x, np.sin(x), label="sin")
axes.plot(x, np.sin(x) * np.exp(-x / 8), label="damped")
axes.legend()
axes.set_title("Two waves")
png = BytesIO()
figure.savefig(png, format="png", bbox_inches="tight")
display(Image(data=png.getvalue()))
plt.close(figure)
`,
  },
  {
    id: 'table',
    label: 'Table',
    about:
      'A DataFrame, which arrives as several representations of one value — text/plain beside text/html.',
    code: `import pandas as pd

pd.DataFrame(
    {
        "environment": ["python-cpu", "python-gpu", "ai-agents"],
        "runtimes": [12, 3, 27],
        "credits": [4.5, 61.0, 18.25],
    }
)
`,
  },
  {
    id: 'error',
    label: 'Error',
    about:
      'A traceback. The converter puts it first, above everything the code managed to print before it failed.',
    code: `print("this much worked")

readings = {"north": 12.5, "south": 9.0}
readings["east"] / 2
`,
  },
  {
    id: 'ipywidgets',
    label: 'IPyWidgets',
    about:
      'An IntSlider with its widget view and manager state embedded in the output, rendered by jupyter-react as an actual interactive control.',
    code: `from IPython.display import display
from ipywidgets import IntSlider
from ipywidgets.embed import embed_data

slider = IntSlider(
    value=7,
    min=0,
    max=10,
    step=1,
    description="Count:",
    continuous_update=True,
)
embedded = embed_data(views=[slider])
display(
    {
        "text/plain": repr(slider),
        "application/vnd.jupyter.widget-view+json": embedded["view_specs"][0],
        "application/vnd.jupyter.widget-state+json": embedded["manager_state"],
    },
    raw=True,
)
`,
  },
  {
    id: 'interactive',
    label: 'Interactive',
    about:
      'A surface you can press. The click comes back as `a2ui_action`, the code runs again knowing it, and the surface it returns replaces this one.',
    actions: [
      { name: 'errors', label: 'Errors' },
      { name: 'warnings', label: 'Warnings' },
      { name: 'info', label: 'Info' },
    ],
    code: `# \`a2ui_action\` is bound by the server when you press a button below.
choice = (globals().get("a2ui_action") or {}).get("name", "")

counts = {"errors": 3, "warnings": 11, "info": 240}
if choice in counts:
    print(f"{choice}: {counts[choice]}")
else:
    print("Pick a level to see its count.")
    print("levels:", ", ".join(counts))
`,
  },
  {
    id: 'chat',
    label: 'Chat',
    about:
      'Ask the agent to run any demonstration. The suggestions call the same Jupyter execution path as the tabs above.',
    code: '',
    chat: true,
  },
];

const CHAT_SUGGESTIONS = [
  {
    title: 'Stream output',
    message:
      'Call run_jupyter_output_demo with kind "stream" to demonstrate stdout and an execution result.',
  },
  {
    title: 'Figure output',
    message:
      'Call run_jupyter_output_demo with kind "figure" to render a Matplotlib image.',
  },
  {
    title: 'Table output',
    message:
      'Call run_jupyter_output_demo with kind "table" to render a pandas DataFrame.',
  },
  {
    title: 'Error output',
    message:
      'Call run_jupyter_output_demo with kind "error" to demonstrate a Jupyter traceback.',
  },
  {
    title: 'IPyWidgets output',
    message:
      'Call run_jupyter_output_demo with kind "ipywidgets" to render an interactive IntSlider.',
  },
  {
    title: 'Interactive output',
    message:
      'Call run_jupyter_output_demo with kind "interactive" to show an actionable A2UI surface.',
  },
];

/** The surface this example draws into; re-running replaces rather than stacks. */
const SURFACE_ID = 'jupyter-output';

interface ExecutionPayload {
  code?: string;
  success?: boolean;
  stdout?: string;
  stderr?: string;
  error?: string | null;
  results?: string[];
  outputs?: Array<Record<string, unknown>>;
  variant?: string | null;
}

/**
 * What the sandbox kernel returned, rendered through the same jupyter-react
 * Output component applications use for notebook output.
 */
function JupyterOutputs({
  execution,
}: {
  execution: ExecutionPayload | null;
}): JSX.Element {
  if (!execution) {
    return (
      <Text sx={{ color: 'fg.muted', fontSize: 1 }}>Nothing has run yet.</Text>
    );
  }

  const outputs = [...(execution.outputs ?? [])] as IOutput[];
  const hasStdout = outputs.some(
    output => output.output_type === 'stream' && output.name === 'stdout',
  );
  if (!hasStdout && execution.stdout?.trim()) {
    outputs.push({
      output_type: 'stream',
      name: 'stdout',
      text: execution.stdout,
    });
  }
  if (execution.stderr?.trim()) {
    outputs.push({
      output_type: 'stream',
      name: 'stderr',
      text: execution.stderr,
    });
  }
  if (
    execution.error &&
    !outputs.some(output => output.output_type === 'error')
  ) {
    outputs.push({
      output_type: 'error',
      ename: 'ExecutionError',
      evalue: execution.error,
      traceback: [execution.error],
    });
  }

  if (outputs.length === 0) {
    return (
      <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
        The code ran and produced no output.
      </Text>
    );
  }

  const widgetViewMime = 'application/vnd.jupyter.widget-view+json';
  const widgetStateMime = 'application/vnd.jupyter.widget-state+json';

  return (
    <Box
      sx={{
        bg: 'canvas.default',
        color: 'fg.default',
        '& .jp-OutputArea, & .jp-OutputArea-output': {
          bg: 'canvas.default',
          color: 'fg.default',
        },
        '& table, & th, & td': {
          backgroundColor: 'canvas.default',
          color: 'fg.default',
          borderColor: 'border.default',
        },
      }}
    >
      {outputs.map((output, index) => {
        const data =
          'data' in output && output.data
            ? (output.data as Record<string, unknown>)
            : undefined;
        const view = data?.[widgetViewMime];
        const state = data?.[widgetStateMime];

        if (view && state) {
          return (
            <OutputIPyWidgets
              key={`${SURFACE_ID}-widget-${index}`}
              view={view}
              state={state}
            />
          );
        }

        const isError =
          output.output_type === 'error' ||
          (output.output_type === 'stream' && output.name === 'stderr');
        return (
          <Output
            key={`${SURFACE_ID}-output-${index}`}
            id={`${SURFACE_ID}-output-${index}`}
            outputs={[output]}
            autoRun={false}
            lumino={!isError}
            showControl={false}
            showEditor={false}
            showKernelProgressBar={false}
          />
        );
      })}
    </Box>
  );
}

function Panel({
  title,
  caption,
  children,
  style,
  sx,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  sx?: BetterSystemStyleObject;
}): JSX.Element {
  return (
    <Box
      sx={{
        flex: '1 1 0',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        bg: 'canvas.default',
        color: 'fg.default',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          bg: 'canvas.default',
          color: 'fg.default',
        }}
      >
        <Text sx={{ fontWeight: 'semibold' }}>{title}</Text>
        <Text sx={{ display: 'block', fontSize: 0, color: 'fg.muted' }}>
          {caption}
        </Text>
      </Box>
      <Box
        style={style}
        sx={{
          flex: '1 1 0',
          minHeight: 0,
          overflow: 'auto',
          p: 3,
          bg: 'canvas.default',
          color: 'fg.default',
          ...sx,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

const A2UiJupyterOutputExample: React.FC = () => {
  const { label: targetLabel } = useRuntimeTarget();
  const agentName = useMemo(() => uniqueAgentId(AGENT_NAME), []);
  const {
    agentId,
    isReady: agentReady,
    baseUrl: serverUrl,
    hasAgent,
    chatGate,
    error: agentError,
  } = useExampleAgentRuntime({
    exampleId: EXAMPLE_ID,
    agentName,
    specId: AGENTSPEC_ID,
    agentConfig: {
      protocol: 'vercel-ai',
      agentSpecId: AGENTSPEC_ID,
    },
  });
  const unavailableReason = chatGate.disableReason;

  const [snippetId, setSnippetId] = useState(SNIPPETS[0].id);
  const snippet = useMemo(
    () => SNIPPETS.find(entry => entry.id === snippetId) ?? SNIPPETS[0],
    [snippetId],
  );
  const [code, setCode] = useState(SNIPPETS[0].code);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [execution, setExecution] = useState<ExecutionPayload | null>(null);

  // The code that drew what is on screen, so an action re-runs *it* rather
  // than whatever happens to be in the editor by the time the click lands.
  const sourceRef = useRef(SNIPPETS[0].code);
  const actionsRef = useRef<SurfaceAction[]>([]);
  const runRef = useRef<
    | ((
        source: string,
        action?: A2uiClientAction,
        actions?: SurfaceAction[],
      ) => Promise<ExecutionPayload | null>)
    | null
  >(null);

  const handleAction = useCallback((action: A2uiClientAction) => {
    void runRef.current?.(sourceRef.current, action, actionsRef.current);
  }, []);

  const { surfaces, processMessages, resetSurfaces, themeStyle } =
    useA2uiProcessor(handleAction);

  const run = useCallback(
    async (
      source: string,
      action?: A2uiClientAction,
      actions: SurfaceAction[] = [],
    ): Promise<ExecutionPayload | null> => {
      if (!agentId) {
        setFailure('The Jupyter agent is not ready yet.');
        return null;
      }
      setRunning(true);
      setFailure(null);
      sourceRef.current = source;
      actionsRef.current = actions;
      try {
        const response = await fetch(
          `${serverUrl.replace(/\/$/, '')}/api/v1/sandbox/execute/a2ui`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              code: source,
              action: action ?? null,
              surface_id: SURFACE_ID,
              agent_id: agentId,
              actions,
            }),
          },
        );
        if (!response.ok) {
          setFailure(
            `The server could not run that (${response.status} ${response.statusText}).`,
          );
          return null;
        }
        const payload = await response.json();
        const nextExecution = (payload.execution ??
          null) as ExecutionPayload | null;
        setExecution(nextExecution);
        // Replace rather than stack: a re-run is the same surface with new
        // data, not a second one below the first.
        resetSurfaces();
        processMessages((payload.messages ?? []) as A2uiMessage[]);
        return nextExecution;
      } catch (error) {
        setFailure(error instanceof Error ? error.message : String(error));
        return null;
      } finally {
        setRunning(false);
      }
    },
    [agentId, processMessages, resetSurfaces, serverUrl],
  );

  // Published for the processor's action callback, which is built once and
  // cannot close over a `run` that changes with the server URL.
  React.useEffect(() => {
    runRef.current = run;
  }, [run]);

  const chooseSnippet = useCallback(
    (next: Snippet) => {
      setSnippetId(next.id);
      setCode(next.code);
      setExecution(null);
      setFailure(null);
      resetSurfaces();
    },
    [resetSurfaces],
  );

  const runDemoTool = useMemo<
    FrontendToolDefinition<
      { kind: DemoKind },
      { kind: DemoKind; displayed: boolean; executionSucceeded?: boolean }
    >
  >(
    () => ({
      name: 'run_jupyter_output_demo',
      description:
        'Run one output demonstration in the connected Jupyter sandbox and display both its A2UI surface and jupyter-react Output.',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: [
              'stream',
              'figure',
              'table',
              'error',
              'ipywidgets',
              'interactive',
            ],
            description: 'The Jupyter output demonstration to run.',
          },
        },
        required: ['kind'],
        additionalProperties: false,
      },
      handler: async ({ kind }) => {
        const demo = SNIPPETS.find(
          (entry): entry is Snippet & { id: DemoKind } =>
            entry.id === kind && !entry.chat,
        );
        if (!demo) {
          throw new Error(`Unknown Jupyter output demonstration: ${kind}`);
        }
        const result = await run(demo.code, undefined, demo.actions ?? []);
        if (!result) {
          throw new Error('The Jupyter output demonstration could not run.');
        }
        return {
          kind,
          displayed: true,
          executionSucceeded: result.success,
        };
      },
    }),
    [run],
  );

  const outputPanels = (
    <Box
      sx={{
        flex: '1 1 0',
        minHeight: 0,
        height: '100%',
        display: 'grid',
        gridTemplateColumns: [
          'minmax(0, 1fr)',
          'minmax(0, 1fr)',
          'repeat(2, minmax(0, 1fr))',
        ],
        gridTemplateRows: [
          'repeat(2, minmax(280px, auto))',
          'repeat(2, minmax(280px, auto))',
          'minmax(0, 1fr)',
        ],
        gap: 3,
        alignItems: 'stretch',
        overflow: ['auto', 'auto', 'hidden'],
      }}
    >
      <Panel
        title="A2UI Surface"
        caption="The same outputs, read by the server-side converter."
        style={themeStyle}
        sx={A2UI_RENDER_SCOPE_SX}
      >
        {surfaces.length === 0 ? (
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
            {snippet.chat
              ? 'Choose a chat suggestion to see the surface.'
              : 'Press Run to see the surface.'}
          </Text>
        ) : (
          surfaces.map(surface => (
            <A2uiSurfaceComposed key={surface.id} surface={surface} />
          ))
        )}
      </Panel>
      <Panel
        title="Jupyter Output"
        caption="The sandbox result rendered by jupyter-react Output."
      >
        <JupyterOutputs execution={execution} />
      </Panel>
    </Box>
  );

  return (
    <ThemedProvider>
      <A2uiMarkdownProvider>
        <Box
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden',
            bg: 'canvas.default',
            color: 'fg.default',
          }}
        >
          <Box
            sx={{
              px: 3,
              py: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
              bg: 'canvas.default',
              color: 'fg.default',
            }}
          >
            <Text as="h1" sx={{ fontSize: 3, fontWeight: 'bold' }}>
              📓 Jupyter Output as a Surface
            </Text>
            <Text sx={{ color: 'fg.muted' }}>
              One execution, twice: what the kernel said, and what the A2UI
              converter made of it. The conversion runs on the server, so a
              terminal and a JupyterLab panel get the same surface from the same
              code.
            </Text>
          </Box>

          {!hasAgent || unavailableReason || agentError ? (
            <Box sx={{ p: 3, bg: 'canvas.default', color: 'fg.default' }}>
              <Text sx={{ color: 'fg.muted' }}>
                {unavailableReason || agentError || (
                  <>
                    This example converts on the server, and the{' '}
                    <strong>{targetLabel}</strong> target has no agent-runtimes
                    server beside its sandbox. Switch to <strong>Local</strong>{' '}
                    or <strong>Datalayer</strong> in the header to run it.
                  </>
                )}
              </Text>
            </Box>
          ) : (
            <Box
              sx={{
                flex: '1 1 0',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                p: 3,
                bg: 'canvas.default',
                color: 'fg.default',
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <SegmentedControl aria-label="Output kind" fullWidth>
                  {SNIPPETS.map(entry => (
                    <SegmentedControl.Button
                      key={entry.id}
                      selected={entry.id === snippetId}
                      onClick={() => chooseSnippet(entry)}
                    >
                      {entry.label}
                    </SegmentedControl.Button>
                  ))}
                </SegmentedControl>
                <Text sx={{ fontSize: 1, color: 'fg.muted' }}>
                  {snippet.about}
                </Text>
              </Box>

              {snippet.chat ? (
                <Box
                  sx={{
                    flex: '1 1 0',
                    minHeight: 0,
                    display: 'grid',
                    gridTemplateColumns: [
                      'minmax(0, 1fr)',
                      'minmax(0, 1fr)',
                      'minmax(320px, 0.7fr) minmax(0, 1.3fr)',
                    ],
                    gridTemplateRows: [
                      'minmax(420px, auto) minmax(560px, auto)',
                      'minmax(420px, auto) minmax(560px, auto)',
                      'minmax(0, 1fr)',
                    ],
                    gap: 3,
                    overflow: ['auto', 'auto', 'hidden'],
                  }}
                >
                  <Box
                    sx={{
                      minHeight: 0,
                      border: '1px solid',
                      borderColor: 'border.default',
                      borderRadius: 2,
                      overflow: 'hidden',
                      bg: 'canvas.default',
                    }}
                  >
                    {agentReady && agentId ? (
                      <Chat
                        protocol="vercel-ai"
                        baseUrl={serverUrl}
                        agentId={agentId}
                        title="Jupyter Output Agent"
                        description="Run and compare Jupyter output demonstrations"
                        placeholder="Ask to run an output demonstration…"
                        height="100%"
                        runtimeId={agentId}
                        historyEndpoint={`${serverUrl}/api/v1/history`}
                        frontendTools={[runDemoTool]}
                        suggestions={CHAT_SUGGESTIONS}
                        submitOnSuggestionClick
                        showHeader
                        showModelSelector
                        showToolsMenu
                        showTokenUsage
                        showInformation
                      />
                    ) : (
                      <Box
                        sx={{
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 2,
                        }}
                      >
                        <Spinner size="small" />
                        <Text sx={{ color: 'fg.muted' }}>
                          Starting Jupyter output agent…
                        </Text>
                      </Box>
                    )}
                  </Box>
                  {outputPanels}
                </Box>
              ) : (
                <>
                  <Box
                    as="textarea"
                    value={code}
                    onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                      setCode(event.target.value)
                    }
                    spellCheck={false}
                    aria-label="Code to run"
                    sx={{
                      width: '100%',
                      minHeight: '150px',
                      p: 2,
                      fontFamily: 'mono',
                      fontSize: 1,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: 'border.default',
                      bg: 'canvas.default',
                      color: 'fg.default',
                      resize: 'vertical',
                    }}
                  />

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Button
                      variant="primary"
                      leadingVisual={PlayIcon}
                      disabled={running || !agentReady || !agentId}
                      onClick={() =>
                        void run(code, undefined, snippet.actions ?? [])
                      }
                    >
                      {running
                        ? 'Running…'
                        : !agentReady
                          ? 'Starting Jupyter…'
                          : 'Run'}
                    </Button>
                    {(running || !agentReady) && <Spinner size="small" />}
                    {execution?.variant && (
                      <Label variant="secondary">{execution.variant}</Label>
                    )}
                    {failure && (
                      <Text sx={{ color: 'danger.fg', fontSize: 1 }}>
                        {failure}
                      </Text>
                    )}
                  </Box>

                  {outputPanels}
                </>
              )}
            </Box>
          )}
        </Box>
      </A2uiMarkdownProvider>
    </ThemedProvider>
  );
};

export default A2UiJupyterOutputExample;
