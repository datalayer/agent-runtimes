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
import type { ToolCallRenderContext } from '../types/chat';
import { Chat } from '../chat';
import { A2UI_RENDER_SCOPE_SX, A2uiSurfaceComposed } from '../components/a2ui';
import {
  ThemedJupyterProvider,
  ThemedProvider,
} from './utils/themedProvider';
import { A2uiMarkdownProvider } from './utils/a2uiMarkdownProvider';
import { useA2uiProcessor } from './utils/a2ui';
import { useExampleAgentRuntime } from './hooks/useExampleAgentRuntime';
import { uniqueAgentId } from './utils/agentId';
import { useRuntimeTarget } from './utils/runtimeTargetStore';

const EXAMPLE_ID = 'A2UiJupyterOutputExample';
const AGENT_NAME = 'a2ui-jupyter-output';
const AGENTSPEC_ID = 'example-a2ui-jupyter-output';

/*
 * The six kinds, as a value as well as a type.
 *
 * The list was written twice — once here and once in the tool's JSON schema
 * `enum` — which is two places to forget one. Deriving both from this array
 * keeps the schema the model is given and the check the handler performs
 * describing the same six things.
 */
const DEMO_KINDS = [
  'stream',
  'figure',
  'table',
  'error',
  'ipywidgets',
  'interactive',
] as const;

type DemoKind = (typeof DEMO_KINDS)[number];

/** Whether a value the model sent is one of the kinds we know how to run. */
function isDemoKind(value: unknown): value is DemoKind {
  return (
    typeof value === 'string' && (DEMO_KINDS as readonly string[]).includes(value)
  );
}
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

/*
 * What to ask for, in the words somebody would actually use.
 *
 * These used to read 'Call run_jupyter_output_demo with kind "figure"' — a
 * person reciting a function signature to a machine that already knows it,
 * and a demonstration of the plumbing rather than of the product. Which tool
 * answers a request is the agent's problem, and the agentspec's system prompt
 * now tells it how to read each of these; a suggestion is for the reader.
 *
 * They name the code sandbox, because that is the thing being demonstrated
 * and the reader can see it running.
 */
const CHAT_SUGGESTIONS = [
  {
    title: 'Stream output',
    message: 'Run something in the code sandbox that prints as it goes.',
  },
  {
    title: 'Figure output',
    message: 'Plot a chart in the code sandbox and show me the image.',
  },
  {
    title: 'Table output',
    message:
      'Build a small DataFrame in the code sandbox and show it as a table.',
  },
  {
    title: 'Error output',
    message:
      'Run something in the code sandbox that fails, so I can see the traceback.',
  },
  {
    title: 'IPyWidgets output',
    message: 'Show me an interactive slider from the code sandbox.',
  },
  {
    title: 'Interactive output',
    message: 'Give me a surface with buttons I can press.',
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
    /*
      `ThemedJupyterProvider`, which is both halves of what this panel needs.

      It had neither. The example's `ThemedProvider` supplies Primer and the
      Datalayer theme and nothing Jupyter, so the JupyterLab stylesheets were
      never loaded and no `--jp-*` variable existed on the page. `Output`
      still rendered — its structure is React, and `OutputRenderer` colours an
      error with an inline style needing no stylesheet — but everything that
      makes it *look* like a notebook did not: `.jp-RenderedText`, an error's
      background and padding, the mono stack, and the ipywidgets control CSS,
      which is why a slider could arrive looking like text.

      A bare `JupyterReactTheme` fixes that and brings its own problem: it
      applies JupyterLab's palette, so the outputs stop matching the page
      around them. This wrapper is the pairing that already exists for it —
      the Datalayer theme outside, carrying the reader's chosen variant and
      colormode, and a `JupyterReactTheme` inside it that loads the
      stylesheets while taking its colormode and canvas from that theme, with
      `useBaseStyles` off so the branded font survives.
    */
    <ThemedJupyterProvider>
    <Box
      sx={{
        bg: 'canvas.default',
        color: 'fg.default',
        /*
          The JupyterLab palette, pointed at the Datalayer one.

          `JupyterLabCss` injects the `--jp-*` variables onto `document.body`,
          for the whole page — so a wrapper's `backgroundColor` cannot reach
          them, and the outputs kept JupyterLab's own white while the page
          around them was the reader's theme. That is why an ipywidget arrived
          sitting on a white band.

          Redefining them here rather than fighting for specificity: custom
          properties inherit, and the nearest definition wins for the subtree
          below it. Everything Jupyter draws inside this panel — output areas,
          rendered text, widget controls, which all resolve their colours
          through these — therefore follows the theme the reader picked.
        */
        '--jp-layout-color0': 'var(--bgColor-default)',
        '--jp-layout-color1': 'var(--bgColor-default)',
        '--jp-layout-color2': 'var(--bgColor-muted)',
        '--jp-layout-color3': 'var(--bgColor-muted)',
        '--jp-content-font-color0': 'var(--fgColor-default)',
        '--jp-content-font-color1': 'var(--fgColor-default)',
        '--jp-content-font-color2': 'var(--fgColor-muted)',
        '--jp-ui-font-color0': 'var(--fgColor-default)',
        '--jp-ui-font-color1': 'var(--fgColor-default)',
        '--jp-ui-font-color2': 'var(--fgColor-muted)',
        '--jp-border-color1': 'var(--borderColor-default)',
        '--jp-border-color2': 'var(--borderColor-muted)',
        '--jp-border-color3': 'var(--borderColor-muted)',
        // ipywidgets keeps its own names, and a control left on the defaults
        // is the one thing in the panel still wearing JupyterLab's palette.
        '--jp-widgets-color': 'var(--fgColor-default)',
        '--jp-widgets-label-color': 'var(--fgColor-default)',
        '--jp-widgets-readout-color': 'var(--fgColor-default)',
        '--jp-widgets-input-color': 'var(--fgColor-default)',
        '--jp-widgets-input-background-color': 'var(--bgColor-default)',
        '--jp-widgets-input-border-color': 'var(--borderColor-default)',
        '--jp-widgets-border-color': 'var(--borderColor-default)',
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
    </ThemedJupyterProvider>
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
              // A2UI is a streaming protocol and its specification names the
              // single POST as the one transport that cannot carry that. The
              // stream demonstration prints a line at a time and was invisible
              // until it had finished.
              stream: true,
            }),
          },
        );
        if (!response.ok) {
          setFailure(
            `The server could not run that (${response.status} ${response.statusText}).`,
          );
          return null;
        }

        // Replace rather than stack: a re-run is the same surface with new
        // data, not a second one below the first. Done before the first
        // message arrives, so the old surface is not on screen underneath the
        // new one while it builds.
        resetSurfaces();

        /*
         * Branch on what the server actually sent, not on what was asked for.
         *
         * A server that does not know the `stream` flag ignores it and answers
         * with the whole surface as JSON — and a reader loop turned loose on
         * that finds no `data:` lines, processes no messages, and renders an
         * empty surface. Which is worse than not streaming: the feature would
         * appear to have broken the example rather than simply not being
         * there. The same branch covers an environment that gives no readable
         * body at all.
         */
        const streamed = (response.headers.get('content-type') ?? '').includes(
          'text/event-stream',
        );
        const reader = streamed ? response.body?.getReader() : undefined;
        if (!reader) {
          const payload = await response.json();
          const whole = (payload.execution ?? null) as ExecutionPayload | null;
          setExecution(whole);
          processMessages((payload.messages ?? []) as A2uiMessage[]);
          return whole;
        }

        const decoder = new TextDecoder();
        let buffer = '';
        let nextExecution: ExecutionPayload | null = null;
        /*
         * Surfaces already created, so a redelivered `createSurface` is not
         * processed twice.
         *
         * The reference A2UI client keeps the same set for the same reason:
         * the processor treats a second create for one id as an error, and a
         * stream that re-announces its surface would otherwise fail partway
         * through for a reason that looks nothing like its cause.
         */
        const created = new Set<string>();

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          // Events are separated by a blank line; the last piece may be a
          // partial event, so it stays in the buffer for the next read.
          const chunks = buffer.split(/\r?\n\r?\n/);
          buffer = chunks.pop() ?? '';
          for (const chunk of chunks) {
            for (const line of chunk.split(/\r?\n/)) {
              if (!line.startsWith('data: ')) {
                continue;
              }
              let event: Record<string, unknown>;
              try {
                event = JSON.parse(line.slice(6));
              } catch {
                // A malformed event is not worth abandoning the run for.
                continue;
              }
              /*
                An execution snapshot, whether or not the run has finished.

                The Jupyter Output panel renders from this rather than from
                the A2UI surface, so applying it only on the final event left
                one half of the comparison streaming and the other half
                frozen until the end — which is the least useful place for the
                difference to be.
              */
              if (event.execution) {
                nextExecution = event.execution as ExecutionPayload;
                setExecution(nextExecution);
                continue;
              }
              if (event.done) {
                continue;
              }
              const create = event.createSurface as
                | { surfaceId?: string }
                | undefined;
              if (create?.surfaceId) {
                if (created.has(create.surfaceId)) {
                  continue;
                }
                created.add(create.surfaceId);
              }
              processMessages([event as unknown as A2uiMessage]);
            }
          }
        }
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

  /*
   * Arguments typed as they actually arrive: unvalidated.
   *
   * This was declared `FrontendToolDefinition<{ kind: DemoKind }, …>`, and
   * TypeScript was right to refuse it. Parameters are contravariant, so a
   * handler that demands `{ kind: DemoKind }` cannot stand in for one the
   * runner will call with an arbitrary `Record<string, unknown>` — and an
   * arbitrary record is exactly what it gets, because these arguments are
   * whatever the model emitted against the JSON schema below. Nothing between
   * the model and here checks them.
   *
   * So the narrowing happens where the values are, at runtime. `isDemoKind`
   * is the same check the lookup was doing implicitly, made explicit and made
   * to say something useful when it fails.
   *
   * The result is left at the default `unknown` for a related reason: the
   * optional `render` on this interface *consumes* the result, so the type is
   * invariant in it, and a narrower result type cannot stand in for the wider
   * one the tool list holds — whether or not this tool supplies a `render`.
   * TypeScript checks the shape either way.
   */
  /*
   * Each kind's most recent execution, for the chat to draw.
   *
   * A ref rather than state: it is read during a render the tool's own status
   * change already causes, so storing it does not need to cause another.
   */
  const executionsByKindRef = useRef(new Map<DemoKind, ExecutionPayload>());

  /*
   * The output, drawn under the tool message in the conversation.
   *
   * Running a demonstration updated the two panels and left the chat saying
   * only that a tool had been called — so a reader following the conversation
   * was told something happened and shown none of it, and had to look away to
   * find out what.
   *
   * This is `renderToolResult` on `Chat` rather than the `render` field on the
   * tool definition. That field exists on `FrontendToolDefinition` and nothing
   * in the chat ever calls it; the first version of this was written there and
   * was simply dead code, which is only visible by grepping for the call site
   * rather than by reading the type.
   *
   * The execution comes from a ref rather than from the tool's result, because
   * a handler's return value is sent back to the model: putting a base64
   * figure or a widget's manager state in there would spend the context window
   * on bytes no model needs to read.
   */
  const renderToolResult = useCallback(
    ({ name, args, status, error }: ToolCallRenderContext) => {
      if (name !== 'run_jupyter_output_demo') {
        return null;
      }
      const kind = args.kind;
      if (!isDemoKind(kind)) {
        return null;
      }
      if (status === 'error') {
        return (
          <Text sx={{ color: 'danger.fg', fontSize: 1 }}>
            {error || 'The demonstration could not run.'}
          </Text>
        );
      }
      if (status !== 'complete') {
        return (
          <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
            Running the {kind} demonstration…
          </Text>
        );
      }
      const executed = executionsByKindRef.current.get(kind);
      if (!executed) {
        return null;
      }
      return (
        <Box sx={{ mt: 2 }}>
          <Text
            sx={{ display: 'block', mb: 1, fontSize: 0, color: 'fg.muted' }}
          >
            Jupyter output
          </Text>
          <JupyterOutputs execution={executed} />
        </Box>
      );
    },
    [],
  );


  const runDemoTool = useMemo<FrontendToolDefinition>(
    () => ({
      name: 'run_jupyter_output_demo',
      description:
        'Run one output demonstration in the connected Jupyter sandbox and display both its A2UI surface and jupyter-react Output.',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: [...DEMO_KINDS],
            description: 'The Jupyter output demonstration to run.',
          },
        },
        required: ['kind'],
        additionalProperties: false,
      },
      handler: async args => {
        const kind = args.kind;
        if (!isDemoKind(kind)) {
          throw new Error(
            `Unknown Jupyter output demonstration: ${String(kind)}. ` +
              `Expected one of ${DEMO_KINDS.join(', ')}.`,
          );
        }
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
        // Kept for `render` above, and deliberately not returned: the value a
        // handler returns goes to the model.
        executionsByKindRef.current.set(kind, result);
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
                        renderToolResult={renderToolResult}
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
