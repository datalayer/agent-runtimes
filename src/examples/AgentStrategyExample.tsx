/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentStrategyExample - Define and launch an agent reasoning *strategy*.
 *
 * This example demonstrates the control-loop paradigm (observe → think → act →
 * evaluate) instead of one-shot prompting. It is fully driven by the generic
 * strategy specifications defined in agentspecs (`src/specs/strategies.ts`):
 *
 * - Pick any strategy spec (Data Analysis, Plan/Execute/Critic, OODA,
 *   Human-in-the-Loop). The list is read from the strategy catalogue, so adding a
 *   new YAML strategy spec automatically makes it available here.
 * - The agent's system prompt is composed generically from the selected strategy's
 *   objective, phases, constraints, termination policy and human settings — no
 *   strategy-specific code.
 * - The agent then runs the strategy against a live Jupyter notebook, where the
 *   strategy state (dataframes, charts, intermediate results) lives outside the
 *   model so each iteration stays small and focused.
 *
 * To run this example:
 * 1. Start the agent-runtimes server.
 * 2. Select this example from the header dropdown (Agent group).
 *
 * @module examples/AgentStrategyExample
 */

import { useMemo, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { ServiceManager } from '@jupyterlab/services';
import { Notebook } from '@datalayer/jupyter-react';
import { useNotebookTools } from '../tools/adapters/agent-runtimes/notebookHooks';
import { ThemedJupyterProvider, ThemedProvider } from './utils/themedProvider';
import { ChatSidebar } from '../chat';
import type { StrategySpec } from '../types';
import { listStrategies, getStrategy, DEFAULT_STRATEGY } from '../specs';
import { useExampleJupyterAgent } from './hooks/useExampleJupyterAgent';

import MatplotlibNotebook from './utils/notebooks/Matplotlib.ipynb.json';
import { ExampleNotebookToolbar } from './utils/notebookToolbarItems';

// Fixed notebook ID
const NOTEBOOK_ID = 'agent-strategy-example';

// Use the imported Matplotlib notebook as the working surface for the strategy.
const NOTEBOOK_CONTENT = MatplotlibNotebook;

// Default configuration
const DEFAULT_AGENT_ID =
  import.meta.env.VITE_AGENT_ID || 'strategy-agent-runtime-example';

/**
 * Compose an agent system prompt generically from a strategy specification.
 *
 * This is intentionally spec-driven: every field comes from the strategy YAML, so
 * the same code drives any strategy (data analysis, plan/execute/critic, OODA, ...).
 */
function buildStrategySystemPrompt(strategy: StrategySpec): string {
  const lines: string[] = [];
  lines.push(
    `You are an agent that operates as a control loop rather than answering in a single prompt.`,
  );
  lines.push(`Strategy: ${strategy.name} (${strategy.strategy}).`);
  if (strategy.objective) {
    lines.push(`Objective: ${strategy.objective}`);
  }
  if (strategy.phases?.length) {
    lines.push(
      `Each iteration, execute these phases in order: ${strategy.phases.join(' → ')}. ` +
        `Decide the single best next action each iteration; do not try to solve everything at once.`,
    );
  }
  if (strategy.constraints?.length) {
    lines.push(
      `Constraints you must respect:\n${strategy.constraints
        .map(c => `- ${c}`)
        .join('\n')}`,
    );
  }
  if (strategy.termination) {
    const t = strategy.termination;
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
  if (strategy.human && strategy.human.mode !== 'none') {
    lines.push(
      `Human-in-the-loop: mode "${strategy.human.mode}"` +
        (strategy.human.approvalRequired
          ? `; request explicit approval before: ${strategy.human.approvalFor.join(', ') || 'sensitive actions'}.`
          : '.'),
    );
  }
  lines.push(
    `Keep strategy state (dataframes, charts, intermediate results) in the notebook/runtime, not in the prompt. ` +
      `For notebook operations, always use the notebook frontend tools (runCell, readAllCells, readCell, insertCell, updateCell, deleteCells) so actions happen in the live notebook UI. ` +
      `Use executeCodeInNotebook only for temporary inspection code that should not modify notebook cells.`,
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
 * A compact, read-only summary of the selected strategy specification.
 */
function StrategySummary({ strategy }: { strategy: StrategySpec }) {
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
        {strategy.phases.map((phase, index) => (
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
      {strategy.objective && (
        <Box sx={{ color: 'fg.muted' }}>
          <strong>Objective:</strong> {strategy.objective}
        </Box>
      )}
      {strategy.termination && (
        <Box sx={{ color: 'fg.muted', mt: 1 }}>
          <strong>Max iterations:</strong> {strategy.termination.maxIterations}{' '}
          · <strong>On blocked:</strong> {strategy.termination.onBlocked}
        </Box>
      )}
    </Box>
  );
}

interface AgentStrategyExampleInnerProps {
  serviceManager?: ServiceManager.IManager;
}

export function AgentStrategyExampleInner({
  serviceManager,
}: AgentStrategyExampleInnerProps) {
  // All available strategies come from the generated strategy catalogue.
  const strategies = useMemo(() => listStrategies(), []);
  const [selectedStrategyId, setSelectedStrategyId] =
    useState<string>(DEFAULT_STRATEGY);
  const selectedStrategy = useMemo(
    () => getStrategy(selectedStrategyId) ?? strategies[0],
    [selectedStrategyId, strategies],
  );

  const systemPrompt = useMemo(
    () => buildStrategySystemPrompt(selectedStrategy),
    [selectedStrategy],
  );

  // The tools. Which of the chat and the harness runs them depends on
  // where the strategy turns, and the hook decides that.
  const tools = useNotebookTools(NOTEBOOK_ID);

  const {
    agentReady,
    protocol: protocolConfig,
    chatFrontendTools,
    error,
    unavailableReason,
    createAttempted,
  } = useExampleJupyterAgent({
    exampleId: 'AgentStrategyExample',
    agentName: DEFAULT_AGENT_ID,
    description: `Strategy agent (${selectedStrategy.name}) for AgentStrategyExample`,
    systemPrompt,
    serviceManager,
    frontendTools: tools,
  });
  // One failed attempt is reported, not retried — see `useExampleJupyterAgent`.
  const chatError = error || unavailableReason;

  // The example's own agent, not merely the runtime: on the cloud target the
  // runtime is ready before this agent has been registered on it.
  const effectiveReady = agentReady;
  const isStrategySelectorDisabled = createAttempted;

  // Get notebook tools for ChatSidebar

  // Build Vercel AI protocol config

  // Chat suggestions derived from the selected strategy.
  const suggestions = useMemo(
    () => [
      {
        title: `${selectedStrategy.emoji} Run the strategy`,
        message: selectedStrategy.objective
          ? `Run the ${selectedStrategy.name}. ${selectedStrategy.objective}`
          : `Run the ${selectedStrategy.name} against the data in this notebook.`,
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
    [selectedStrategy],
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
                  {selectedStrategy.emoji} Agent Strategy Example
                </h1>
                <p style={{ margin: '8px 0 0', color: 'var(--fgColor-muted)' }}>
                  Define and launch an agent reasoning strategy — observe,
                  think, act, evaluate — over a live notebook.
                </p>
              </Box>

              {/* Strategy selector (generic, driven by the strategy catalogue) */}
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
                title={
                  isStrategySelectorDisabled
                    ? 'Strategy selector is temporarily disabled while launching the agent'
                    : 'Choose a strategy'
                }
              >
                <Box as="label" sx={{ fontSize: 1, fontWeight: 'bold' }}>
                  Strategy
                </Box>
                <Box
                  as="select"
                  value={selectedStrategyId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                    setSelectedStrategyId(e.target.value)
                  }
                  disabled={isStrategySelectorDisabled}
                  aria-label="Strategy specification"
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
                  {strategies.map(strategy => (
                    <option key={strategy.id} value={strategy.id}>
                      {strategy.emoji} {strategy.name}
                    </option>
                  ))}
                </Box>
              </Box>
            </Box>

            <StrategySummary strategy={selectedStrategy} />
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
            title={`${selectedStrategy.emoji} ${selectedStrategy.name}`}
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
export function AgentStrategyExample({
  serviceManager,
}: {
  serviceManager?: ServiceManager.IManager;
}) {
  return (
    <ThemedProvider>
      <AgentStrategyExampleInner serviceManager={serviceManager} />
    </ThemedProvider>
  );
}

export default AgentStrategyExample;
