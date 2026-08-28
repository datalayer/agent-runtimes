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
import type { A2uiClientAction, A2uiMessage } from '@a2ui/web_core/v0_9';
import { A2UI_RENDER_SCOPE_SX, A2uiSurfaceComposed } from '../components/a2ui';
import { ThemedProvider } from './utils/themedProvider';
import { A2uiMarkdownProvider } from './utils/a2uiMarkdownProvider';
import { useA2uiProcessor } from './utils/a2ui';
import { useExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { useRuntimeTarget } from './utils/runtimeTargetStore';

/** One kind of Jupyter output, and the code that produces it. */
interface Snippet {
  id: string;
  label: string;
  /** What this one is here to show. */
  about: string;
  code: string;
}

const SNIPPETS: Snippet[] = [
  {
    id: 'stream',
    label: 'Stream',
    about:
      'stdout and a returned value. The plainest case, and the one that reads worst as raw output.',
    code: `import platform

print("Python", platform.python_version())
for planet, moons in [("Mars", 2), ("Jupiter", 95), ("Saturn", 274)]:
    print(f"{planet:<8} {moons:>4} moons")

sum(moons for _, moons in [("Mars", 2), ("Jupiter", 95), ("Saturn", 274)])
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

x = np.linspace(0, 4 * np.pi, 400)
figure, axes = plt.subplots(figsize=(5, 2.6))
axes.plot(x, np.sin(x), label="sin")
axes.plot(x, np.sin(x) * np.exp(-x / 8), label="damped")
axes.legend()
axes.set_title("Two waves")
figure
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
    id: 'interactive',
    label: 'Interactive',
    about:
      'A surface you can press. The click comes back as `a2ui_action`, the code runs again knowing it, and the surface it returns replaces this one.',
    code: `# \`a2ui_action\` is bound by the server when you press a button below.
choice = (globals().get("a2ui_action") or {}).get("action", "")

counts = {"errors": 3, "warnings": 11, "info": 240}
if choice in counts:
    print(f"{choice}: {counts[choice]}")
else:
    print("Pick a level to see its count.")
    print("levels:", ", ".join(counts))
`,
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
 * What the kernel said, shown as a notebook would show it.
 *
 * Deliberately unpolished: this panel exists to be the thing the surface is
 * better than, and dressing it up would make the comparison dishonest.
 */
function RawOutputs({
  execution,
}: {
  execution: ExecutionPayload | null;
}): JSX.Element {
  if (!execution) {
    return (
      <Text sx={{ color: 'fg.muted', fontSize: 1 }}>Nothing has run yet.</Text>
    );
  }

  const blocks: Array<{ label: string; body: string; tone?: 'danger' }> = [];
  if (execution.stdout?.trim()) {
    blocks.push({ label: 'stdout', body: execution.stdout });
  }
  if (execution.stderr?.trim()) {
    blocks.push({ label: 'stderr', body: execution.stderr, tone: 'danger' });
  }
  if (execution.error) {
    blocks.push({ label: 'error', body: execution.error, tone: 'danger' });
  }
  for (const [index, output] of (execution.outputs ?? []).entries()) {
    const data = (output.data ?? {}) as Record<string, unknown>;
    for (const [mime, value] of Object.entries(data)) {
      const text = Array.isArray(value) ? value.join('') : String(value);
      blocks.push({
        label: `${String(output.output_type ?? 'output')}[${index}] · ${mime}`,
        // A base64 image is the honest reason this panel is hard to read; show
        // enough of it to make that obvious without filling the page.
        body:
          text.length > 600
            ? `${text.slice(0, 600)}\n… ${text.length} chars`
            : text,
      });
    }
  }

  if (blocks.length === 0) {
    return (
      <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
        The code ran and produced no output.
      </Text>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {blocks.map((block, index) => (
        <Box key={`${block.label}-${index}`}>
          <Text
            sx={{
              fontSize: 0,
              color: block.tone === 'danger' ? 'danger.fg' : 'fg.muted',
              fontFamily: 'mono',
            }}
          >
            {block.label}
          </Text>
          <Box
            as="pre"
            sx={{
              m: 0,
              mt: 1,
              p: 2,
              fontFamily: 'mono',
              fontSize: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              backgroundColor: 'canvas.subtle',
              borderRadius: 2,
              color: block.tone === 'danger' ? 'danger.fg' : 'fg.default',
            }}
          >
            {block.body}
          </Box>
        </Box>
      ))}
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
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        backgroundColor: 'canvas.default',
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
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
          ...sx,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

const A2UiJupyterOutputExample: React.FC = () => {
  const { hasAgent, label: targetLabel } = useRuntimeTarget();
  const serverUrl = useExampleAgentRuntimesUrl();

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
  const runRef = useRef<
    ((source: string, action?: A2uiClientAction) => Promise<void>) | null
  >(null);

  const handleAction = useCallback((action: A2uiClientAction) => {
    void runRef.current?.(sourceRef.current, action);
  }, []);

  const { surfaces, processMessages, resetSurfaces, themeStyle } =
    useA2uiProcessor(handleAction);

  const run = useCallback(
    async (source: string, action?: A2uiClientAction) => {
      setRunning(true);
      setFailure(null);
      sourceRef.current = source;
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
            }),
          },
        );
        if (!response.ok) {
          setFailure(
            `The server could not run that (${response.status} ${response.statusText}).`,
          );
          return;
        }
        const payload = await response.json();
        setExecution((payload.execution ?? null) as ExecutionPayload | null);
        // Replace rather than stack: a re-run is the same surface with new
        // data, not a second one below the first.
        resetSurfaces();
        processMessages((payload.messages ?? []) as A2uiMessage[]);
      } catch (error) {
        setFailure(error instanceof Error ? error.message : String(error));
      } finally {
        setRunning(false);
      }
    },
    [processMessages, resetSurfaces, serverUrl],
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

  return (
    <ThemedProvider>
      <A2uiMarkdownProvider>
        <Box
          sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <Box
            sx={{
              px: 3,
              py: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
              backgroundColor: 'canvas.default',
            }}
          >
            <Text as="h1" sx={{ fontSize: 3, fontWeight: 'bold' }}>
              📓 Jupyter output as a surface
            </Text>
            <Text sx={{ color: 'fg.muted' }}>
              One execution, twice: what the kernel said, and what the A2UI
              converter made of it. The conversion runs on the server, so a
              terminal and a JupyterLab panel get the same surface from the same
              code.
            </Text>
          </Box>

          {!hasAgent ? (
            <Box sx={{ p: 3 }}>
              <Text sx={{ color: 'fg.muted' }}>
                This example converts on the server, and the{' '}
                <strong>{targetLabel}</strong> target has no agent-runtimes
                server beside its sandbox. Switch to <strong>Local</strong> or{' '}
                <strong>Datalayer</strong> in the header to run it.
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
                  backgroundColor: 'canvas.default',
                  color: 'fg.default',
                  resize: 'vertical',
                }}
              />

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Button
                  variant="primary"
                  leadingVisual={PlayIcon}
                  disabled={running}
                  onClick={() => void run(code)}
                >
                  {running ? 'Running…' : 'Run'}
                </Button>
                {running && <Spinner size="small" />}
                {execution?.variant && (
                  <Label variant="secondary">{execution.variant}</Label>
                )}
                {failure && (
                  <Text sx={{ color: 'danger.fg', fontSize: 1 }}>
                    {failure}
                  </Text>
                )}
              </Box>

              <Box
                sx={{
                  flex: '1 1 0',
                  minHeight: 0,
                  display: 'flex',
                  gap: 3,
                  flexWrap: 'wrap',
                }}
              >
                <Panel
                  title="Jupyter output"
                  caption="What the kernel returned, mime bundles and all."
                >
                  <RawOutputs execution={execution} />
                </Panel>
                <Panel
                  title="A2UI surface"
                  caption="The same outputs, read by the server-side converter."
                  style={themeStyle}
                  sx={A2UI_RENDER_SCOPE_SX}
                >
                  {surfaces.length === 0 ? (
                    <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
                      Press Run to see the surface.
                    </Text>
                  ) : (
                    surfaces.map(surface => (
                      <A2uiSurfaceComposed key={surface.id} surface={surface} />
                    ))
                  )}
                </Panel>
              </Box>
            </Box>
          )}
        </Box>
      </A2uiMarkdownProvider>
    </ThemedProvider>
  );
};

export default A2UiJupyterOutputExample;
