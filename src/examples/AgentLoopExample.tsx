/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentLoopExample - Define and launch an agent execution *loop*.
 *
 * This example demonstrates the "loop" paradigm (observe → think → act →
 * evaluate) instead of one-shot prompting. It is fully driven by the generic
 * loop specifications defined in agentspecs (`src/specs/loops.ts`):
 *
 * - Pick any loop spec (Data Analysis, Plan/Execute/Critic, OODA,
 *   Human-in-the-Loop). The list is read from the loop catalogue, so adding a
 *   new YAML loop spec automatically makes it available here.
 * - The agent's system prompt is composed generically from the selected loop's
 *   objective, phases, constraints, termination policy and human settings — no
 *   loop-specific code.
 * - The agent then runs the loop against a live Jupyter notebook, where the
 *   loop state (dataframes, charts, intermediate results) lives outside the
 *   model so each iteration stays small and focused.
 *
 * To run this example:
 * 1. Start the agent-runtimes server.
 * 2. Select this example from the header dropdown (Agent group).
 *
 * @module examples/AgentLoopExample
 */

import { useMemo, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { ServiceManager } from '@jupyterlab/services';
import { Notebook } from '@datalayer/jupyter-react';
import { useNotebookTools } from '../tools/adapters/agent-runtimes/notebookHooks';
import { ThemedJupyterProvider, ThemedProvider } from './utils/themedProvider';
import { ChatSidebar } from '../chat';
import type { LoopSpec } from '../types';
import { listLoops, getLoop, DEFAULT_LOOP } from '../specs';
import { useExampleJupyterAgent } from './hooks/useExampleJupyterAgent';

import MatplotlibNotebook from './utils/notebooks/Matplotlib.ipynb.json';
import { ExampleNotebookToolbar } from './utils/notebookToolbarItems';

// Fixed notebook ID
const NOTEBOOK_ID = 'agent-loop-example';

// Use the imported Matplotlib notebook as the working surface for the loop.
const NOTEBOOK_CONTENT = MatplotlibNotebook;

// Default configuration
const DEFAULT_AGENT_ID =
  import.meta.env.VITE_AGENT_ID || 'loop-agent-runtime-example';

/**
 * Compose an agent system prompt generically from a loop specification.
 *
 * This is intentionally spec-driven: every field comes from the loop YAML, so
 * the same code drives any loop (data analysis, plan/execute/critic, OODA, ...).
 */
function buildLoopSystemPrompt(loop: LoopSpec): string {
  const lines: string[] = [];
  lines.push(
    `You are an agent that operates as a control LOOP rather than answering in a single prompt.`,
  );
  lines.push(`Loop: ${loop.name} (${loop.strategy}).`);
  if (loop.objective) {
    lines.push(`Objective: ${loop.objective}`);
  }
  if (loop.phases?.length) {
    lines.push(
      `Each iteration, execute these phases in order: ${loop.phases.join(' → ')}. ` +
        `Decide the single best next action each iteration; do not try to solve everything at once.`,
    );
  }
  if (loop.constraints?.length) {
    lines.push(
      `Constraints you must respect:\n${loop.constraints
        .map(c => `- ${c}`)
        .join('\n')}`,
    );
  }
  if (loop.termination) {
    const t = loop.termination;
    lines.push(
      `Termination: stop after at most ${t.maxIterations} iterations, or when the goal is reached.`,
    );
    if (t.successCriteria?.length) {
      lines.push(
        `Success criteria:\n${t.successCriteria.map(s => `- ${s}`).join('\n')}`,
      );
    }
    if (t.onBlocked) {
      lines.push(`If blocked: ${t.onBlocked}.`);
    }
  }
  if (loop.human && loop.human.mode !== 'none') {
    lines.push(
      `Human-in-the-loop: mode "${loop.human.mode}"` +
        (loop.human.approvalRequired
          ? `; request explicit approval before: ${loop.human.approvalFor.join(', ') || 'sensitive actions'}.`
          : '.'),
    );
  }
  lines.push(
    `Keep loop state (dataframes, charts, intermediate results) in the notebook/runtime, not in the prompt. ` +
      `For notebook operations, always use the notebook frontend tools (runCell, readAllCells, readCell, insertCell, updateCell, deleteCells) so actions happen in the live notebook UI. ` +
      `Use executeCode only for temporary inspection code that should not modify notebook cells.`,
  );
  return lines.join('\n\n');
}

/**
 * Notebook UI component
 */
interface NotebookUIProps {
  serviceManager?: ServiceManager.IManager;
}

function NotebookUI({ serviceManager }: NotebookUIProps) {
  if (!serviceManager) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'fg.muted',
        }}
      >
        Loading Simple services...
      </Box>
    );
  }

  /*
   * Scoped to the notebook, not to the example.
   *
   * `JupyterReactTheme` nests a Primer theme of its own, and Primer tokens
   * resolve against the nearest one — so anything rendered inside it reads
   * `canvas.default` from that theme rather than from the Datalayer theme the
   * picker drives. Wrapping the whole example is why its chrome came out
   * white while every other example followed the theme; the working examples
   * all wrap the notebook alone.
   */
  return (
    <ThemedJupyterProvider>
      <Notebook
        nbformat={NOTEBOOK_CONTENT}
        id={NOTEBOOK_ID}
        Toolbar={ExampleNotebookToolbar}
        serviceManager={serviceManager}
        height="100%"
        cellSidebarMargin={120}
        startDefaultKernel={true}
      />
    </ThemedJupyterProvider>
  );
}

/**
 * A compact, read-only summary of the selected loop specification.
 */
function LoopSummary({ loop }: { loop: LoopSpec }) {
  return (
    <Box
      sx={{
        mt: 2,
        p: 2,
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        bg: 'canvas.default',
        fontSize: 0,
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 1 }}>
        {loop.phases.map((phase, index) => (
          <Box
            key={phase}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: '2px',
              borderRadius: 6,
              bg: 'neutral.muted',
              color: 'fg.default',
              fontWeight: 'bold',
            }}
          >
            {index + 1}. {phase}
          </Box>
        ))}
      </Box>
      {loop.objective && (
        <Box sx={{ color: 'fg.muted' }}>
          <strong>Objective:</strong> {loop.objective}
        </Box>
      )}
      {loop.termination && (
        <Box sx={{ color: 'fg.muted', mt: 1 }}>
          <strong>Max iterations:</strong> {loop.termination.maxIterations} ·{' '}
          <strong>On blocked:</strong> {loop.termination.onBlocked}
        </Box>
      )}
    </Box>
  );
}

interface AgentLoopExampleInnerProps {
  serviceManager?: ServiceManager.IManager;
}

export function AgentLoopExampleInner({
  serviceManager,
}: AgentLoopExampleInnerProps) {
  // All available loops come from the generated loop catalogue.
  const loops = useMemo(() => listLoops(), []);
  const [selectedLoopId, setSelectedLoopId] = useState<string>(DEFAULT_LOOP);
  const selectedLoop = useMemo(
    () => getLoop(selectedLoopId) ?? loops[0],
    [selectedLoopId, loops],
  );

  const systemPrompt = useMemo(
    () => buildLoopSystemPrompt(selectedLoop),
    [selectedLoop],
  );

  // The tools. Which of the chat and the harness runs them depends on
  // where the loop turns, and the hook decides that.
  const tools = useNotebookTools(NOTEBOOK_ID);

  const {
    agentReady,
    protocol: protocolConfig,
    chatFrontendTools,
    error,
    unavailableReason,
    createAttempted,
  } = useExampleJupyterAgent({
    exampleId: 'AgentLoopExample',
    agentName: DEFAULT_AGENT_ID,
    description: `Loop agent (${selectedLoop.name}) for AgentLoopExample`,
    systemPrompt,
    serviceManager,
    frontendTools: tools,
  });
  // One failed attempt is reported, not retried — see `useExampleJupyterAgent`.
  const chatError = error || unavailableReason;

  // The example's own agent, not merely the runtime: on the cloud target the
  // runtime is ready before this agent has been registered on it.
  const effectiveReady = agentReady;
  const isLoopSelectorDisabled = createAttempted;

  // Get notebook tools for ChatSidebar

  // Build Vercel AI protocol config

  // Chat suggestions derived from the selected loop.
  const suggestions = useMemo(
    () => [
      {
        title: `${selectedLoop.emoji} Run the loop`,
        message: selectedLoop.objective
          ? `Run the ${selectedLoop.name}. ${selectedLoop.objective}`
          : `Run the ${selectedLoop.name} against the data in this notebook.`,
      },
      {
        title: '🔁 Next iteration',
        message:
          'Observe the current notebook state, then decide and execute the single best next step.',
      },
      {
        title: '🎯 Check the goal',
        message:
          'Evaluate the latest result against the objective and success criteria. Are we done? If not, what is missing?',
      },
      {
        title: '📊 Summarize findings',
        message:
          'Summarize the key findings and produce a final, decision-oriented report.',
      },
    ],
    [selectedLoop],
  );

  return (
    <>
      <Box
        sx={{
          // The wrapper is the viewport, not the window: it sits below the
          // header and beside the sidebar, so viewport units size this box to
          // an area it is not in — and the wrapper paints no background of its
          // own, so wherever this box failed to reach showed through white.
          height: '100%',
          width: '100%',
          display: 'flex',
          overflow: 'hidden',
          bg: 'canvas.default',
          color: 'fg.default',
        }}
      >
        {/* Main content area */}
        <Box
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <Box
            sx={{
              p: 3,
              borderBottom: '1px solid',
              borderColor: 'border.default',
              bg: 'canvas.default',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 3,
                flexWrap: 'wrap',
              }}
            >
              <Box>
                <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
                  {selectedLoop.emoji} Agent Loop Example
                </h1>
                <p style={{ margin: '8px 0 0', color: 'var(--fgColor-muted)' }}>
                  Define and launch an agent execution loop — observe, think,
                  act, evaluate — over a live notebook.
                </p>
              </Box>

              {/* Loop selector (generic, driven by the loop catalogue) */}
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
                title={
                  isLoopSelectorDisabled
                    ? 'Loop selector is temporarily disabled while launching the agent'
                    : 'Choose a loop'
                }
              >
                <Box as="label" sx={{ fontSize: 1, fontWeight: 'bold' }}>
                  Loop
                </Box>
                <Box
                  as="select"
                  value={selectedLoopId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setSelectedLoopId(e.target.value)
                  }
                  disabled={isLoopSelectorDisabled}
                  aria-label="Loop specification"
                  sx={{
                    px: 2,
                    py: '6px',
                    fontSize: 1,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'border.default',
                    bg: 'canvas.default',
                    color: 'fg.default',
                  }}
                >
                  {loops.map(loop => (
                    <option key={loop.id} value={loop.id}>
                      {loop.emoji} {loop.name}
                    </option>
                  ))}
                </Box>
              </Box>
            </Box>

            <LoopSummary loop={selectedLoop} />
          </Box>

          {/* Notebook */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              overflow: 'hidden',
              bg: 'canvas.default',
              p: 3,
            }}
          >
            <Box
              sx={{
                flex: 1,
                border: '1px solid',
                borderColor: 'border.default',
                borderRadius: 2,
                overflow: 'hidden',
              }}
            >
              <NotebookUI serviceManager={serviceManager} />
            </Box>
          </Box>
        </Box>

        {/* Chat sidebar */}
        {effectiveReady && (
          <ChatSidebar
            title={`${selectedLoop.emoji} ${selectedLoop.name}`}
            protocol={protocolConfig}
            position="right"
            width={400}
            clickOutsideToClose={false}
            showNewChatButton={true}
            showClearButton={true}
            showSettingsButton={true}
            defaultOpen={true}
            panelProps={{
              protocol: protocolConfig,
              frontendTools: chatFrontendTools,
              useStore: false,
              showModelSelector: true,
              showToolsMenu: true,
              showSkillsMenu: true,
              suggestions,
            }}
          />
        )}

        {chatError && (
          <Box
            sx={{
              position: 'fixed',
              bottom: 20,
              right: 20,
              padding: 3,
              backgroundColor: 'danger.subtle',
              color: 'danger.fg',
              borderRadius: 2,
              maxWidth: 320,
              zIndex: 999,
            }}
          >
            <strong>Error:</strong> {chatError}
          </Box>
        )}
      </Box>
    </>
  );
}

/**
 * Main example component with Jupyter provider wrapper.
 */
export function AgentLoopExample({
  serviceManager,
}: {
  serviceManager?: ServiceManager.IManager;
}) {
  return (
    <ThemedProvider>
      <AgentLoopExampleInner serviceManager={serviceManager} />
    </ThemedProvider>
  );
}

export default AgentLoopExample;
