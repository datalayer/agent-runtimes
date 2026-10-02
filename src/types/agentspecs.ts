/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { SkillSpec } from './skills';
import type { MCPServer, AgentMCPServerToolConfig } from './mcp';
import type {
  ToolSpec,
  FrontendToolSpec,
  FrontendRenderToolSpec,
} from './tools';
import type { AgentTriggerConfig } from './triggers';
import type { AgentModelConfig } from './models';
import type { AgentOutputConfig } from './outputs';
import type { GuardrailSpec } from './guardrails';
import type { AgentEvalConfig } from './evals';
import type { AgentNotificationConfig } from './notifications';
import type { AgentCodemodeConfig, AgentAdvancedConfig } from './config';

/**
 * Specification for an AI agent.
 *
 * Defines the configuration for a reusable agent template that can be
 * instantiated as an Agent Runtime.
 */
/**
 * An opener offered to somebody arriving at an empty chat.
 *
 * Text and, optionally, a mark to show beside it. It was a bare string, which
 * is enough for a chip in an empty state and not enough for anywhere else a
 * suggestion is offered — a menu, a launcher, a list of what an agent is for —
 * where an unmarked row of sentences is hard to scan. Both marks are optional
 * and independent: an octicon suits chrome already drawn in line art, an emoji
 * suits a place that has colour.
 */
export interface AgentSuggestion {
  /** What is sent when the suggestion is taken. */
  text: string;
  /**
   * A few words shown as the label where the text is too long to be one — a
   * chip, a menu row. The text itself is then the tooltip.
   */
  summary?: string;
  /** Octicon name to show beside it. */
  icon?: string;
  /** Unicode emoji to show beside it. */
  emoji?: string;
}

/**
 * Conversation checkpoint configuration.
 *
 * Snapshots of the message history the agent (or the person) can rewind to.
 * Complementary to runtime checkpoints (CRIU), which freeze the whole process.
 */
export interface AgentCheckpointsConfig {
  /** Whether checkpointing is on for this agent. */
  enabled?: boolean;
  /** When a checkpoint is taken on its own. */
  frequency?: 'every_turn' | 'every_tool' | 'manual_only';
  /** Rolling window: the oldest checkpoint goes when this is exceeded. */
  max_checkpoints?: number;
  /** Where checkpoints are kept. */
  store?: 'in_memory' | 'file';
}

/**
 * One kind of work an agent can be delegated, and what it takes and returns.
 *
 * The unit `agents.discover` matches on. It maps onto an A2A agent card's
 * `skills` entry, so a Datalayer agentspec and a third-party A2A worker are
 * discoverable through one query rather than two.
 */
export interface AgentCapability {
  /** One of the closed vocabulary in `agent_runtimes.types`. */
  id: string;
  /** Display label; the vocabulary's own description when absent. */
  name?: string;
  /** What this agent in particular does under that capability. */
  description?: string;
  /** Context reference kinds it accepts — notebook, dataset, file, sandbox. */
  inputs?: string[];
  /** Artifact types it produces — notebook, report, dataset, file. */
  outputs?: string[];
  /** Free text, for humans reading a catalogue; never matched on. */
  tags?: string[];
}

/**
 * How an agent's answer becomes an interface: a protocol the host renders
 * (`agentspecs/ui-plugins`). An agent spec's `uiPlugin` names one.
 */
export interface UIPluginSpec {
  /** What an agent spec's `uiPlugin` names (e.g. 'a2ui'). */
  id: string;
  version: string;
  name: string;
  /** What the plugin renders, and how the user's action comes back. */
  description: string;
  /** The protocol's own documentation. */
  docsUrl: string;
  /** Whether an agent spec may name it today. */
  enabled: boolean;
}

/** A check a Frame requires of the output of work done under it. */
export interface FrameGuardSpec {
  id: string;
  /**
   * What kind of check it is: algorithmic, source-grounding, consensus,
   * expert, policy-safety, regression-drift or outcome.
   */
  category: string;
  description: string;
  /** Whether the output counts only once this Guard has passed. */
  required: boolean;
}

/** A reusable prompt fragment a Cog loads into its context. */
export interface FramePromptSpec {
  id: string;
  text: string;
}

/**
 * The context work happens in, written down (`agentspecs/frames`): owned,
 * scoped, versioned and inherited. A Frame in the generated catalogue is
 * resolved — what it inherits through `extends` is already in it.
 */
export interface FrameSpec {
  id: string;
  version: string;
  name: string;
  description: string;
  /** organization, department, team, project, role or relationship. */
  scope: string;
  /** Who manages the Frame and answers for it. */
  owner: string;
  /** The parent Frame, as the spec names it. */
  extends?: string;
  /** The Frames it inherits from, nearest parent first. */
  lineage: string[];
  tags: string[];
  /** Whether a Cog may name it today. */
  enabled: boolean;
  icon?: string;
  emoji?: string;
  rules: string[];
  terminology: Record<string, string>;
  goals: string[];
  style: string[];
  norms: string[];
  process: string[];
  architecture: string;
  prompts: FramePromptSpec[];
  skills: string[];
  tools: string[];
  mcpServers: string[];
  guards: FrameGuardSpec[];
}

/**
 * An AI worker you can hold to account (`agentspecs/cogs`): a Cog extends an
 * agent spec and is equipped with Frames. In the generated catalogue it is
 * resolved — `spec` is the agent with the Cog's changes and its Frames.
 */
export interface CogSpec {
  id: string;
  version: string;
  name: string;
  description: string;
  /** The id of the agent spec it extends. */
  agent: string;
  /** The Frames it works under, in order. */
  frames: string[];
  /** Every Frame that contributed: the named ones and those they inherit from. */
  lineage: string[];
  /** What the Cog packages: context, model or combined. */
  kind: string;
  /** Whether it is offered today. */
  enabled: boolean;
  /** The Guards its Frames declare: what its output answers to. */
  guards: FrameGuardSpec[];
  /** The Cog as an agent spec, resolved and ready to launch. */
  spec: Agentspec;
}

/** Something a Guard reports, which a Gate's condition reads. */
export interface GuardSignalSpec {
  name: string;
  /** boolean, number or string. */
  type: string;
  description: string;
}

/**
 * A reusable check (`agentspecs/guards`): a Guard extends a guardrail. The
 * guardrail is the policy; the Guard verifies that the work stayed within
 * it. Resolved: it carries the guardrail's policy under its own identity.
 */
export interface GuardSpec extends GuardrailSpec {
  id: string;
  version: string;
  name: string;
  description: string;
  /** The id of the guardrail it extends. */
  guardrail: string;
  /**
   * algorithmic, source-grounding, consensus, expert, policy-safety,
   * regression-drift or outcome.
   */
  category: string;
  /** preflight, in_flight, post_run, continuous: where it may run. */
  stages: string[];
  /** algorithmic, cog or human. */
  method: string;
  /** What is verified. */
  check: string;
  /** What it reports for a Gate to decide on. */
  signals: GuardSignalSpec[];
  /** Whether the work counts only once it has passed. */
  required: boolean;
  enabled: boolean;
  tags: string[];
  icon?: string;
  emoji?: string;
}

/** A decision point of an Op (`agentspecs/gates`): Guards check, Gates decide. */
export interface GateSpec {
  id: string;
  version: string;
  name: string;
  description: string;
  /** The stage it decides at. */
  stage: string;
  /** The Guards whose results it reads. */
  guards: string[];
  /** The condition on its Guards' signals, or `always`. */
  when: string;
  /** What happens when the condition holds. */
  then: string;
  /** What happens when it does not. */
  otherwise: string;
  /** The signals the condition reads. */
  signals: string[];
  /** The roles a decision is handed to. */
  reviewers: string[];
  maxRetries: number;
  enabled: boolean;
  tags: string[];
  icon?: string;
  emoji?: string;
}

/** What evidence a run keeps, and for how long (`agentspecs/tracks`). */
export interface TrackSpec {
  id: string;
  version: string;
  name: string;
  description: string;
  /** The retention, e.g. `7_years`. */
  retainFor: string;
  retentionDays: number;
  /** What a record has to include. */
  include: string[];
  /** The roles that may read a record. */
  readers: string[];
  /** Field patterns kept out of the record. */
  redact: string[];
  /** Whether corrections and overrides feed Organizational Memory. */
  feedsMemory: boolean;
  /** Whether a record may leave the Hub that produced it: it may not. */
  exchangeable: boolean;
  enabled: boolean;
  tags: string[];
  icon?: string;
  emoji?: string;
}

/** A Cog as an Op names it. */
export interface OpCogSpec {
  id: string;
  /** The agent spec the Cog extends. */
  agent: string;
  frames: string[];
  kind: string;
}

/** The Guards of an Op, by the stage they run at, each resolved. */
export interface OpGuardsSpec {
  preflight: GuardSpec[];
  inFlight: GuardSpec[];
  postRun: GuardSpec[];
  continuous: GuardSpec[];
}

/**
 * An orchestrated, supervised workflow (`agentspecs/ops`): Cogs do the work,
 * and a validation strategy says how it is verified — Guards by stage, the
 * Gates that decide, the Track kept as evidence. Resolved: everything it
 * names is in it.
 */
export interface OpSpec {
  id: string;
  version: string;
  name: string;
  description: string;
  /** Who is accountable for the outcome. */
  owner: string;
  goal: string;
  cogs: OpCogSpec[];
  /** Frames applied at the workflow level. */
  frames: string[];
  /** Every Frame that orients the Op, its Cogs' included. */
  lineage: string[];
  supervisor: { model: string; instructions: string };
  guards: OpGuardsSpec;
  /** The checks its Frames declare. */
  frameGuards: FrameGuardSpec[];
  /** The Gates, in the order they are met. */
  gates: GateSpec[];
  track: TrackSpec;
  /** launcher, command, button, schedule. */
  triggers: string[];
  enabled: boolean;
  tags: string[];
  icon?: string;
  emoji?: string;
  color?: string;
}

export interface Agentspec {
  /** Unique agent identifier */
  id: string;
  /** Version */
  version?: string;
  /** Display name for the agent */
  name: string;
  /** Agent description */
  description: string;
  /** System prompt for the agent */
  systemPrompt?: string;
  /** System prompt addons when codemode is enabled */
  systemPromptCodemodeAddons?: string;
  /** Tags for categorization */
  tags: string[];
  /** Domain used to group agents in the gallery */
  domain?: string;
  /** Whether the agent is enabled */
  enabled: boolean;
  /** AI model identifier to use for this agent */
  model?: string;
  /** Inference provider routing strategy */
  inferenceProvider?: 'local' | 'datalayer';
  /** MCP servers used by this agent */
  mcpServers: MCPServer[];
  /** Skills available to this agent */
  skills: SkillSpec[];
  /** Runtime tools available to this agent */
  tools?: ToolSpec[];
  /** Disable tool approvals for this spec (default: false). */
  disableToolApprovals?: boolean;
  /** Frontend tool sets available to this agent */
  frontendTools?: FrontendToolSpec[];
  /** Bindings of backend tools to frontend renderers (tool name + css) */
  frontendRenderTools?: FrontendRenderToolSpec[];
  /** Runtime environment name for this agent */
  environmentName: string;
  /** Icon identifier or URL for the agent */
  icon?: string;
  /** Emoji identifier for the agent */
  emoji?: string;
  /** Theme color for the agent (hex code) */
  color?: string;
  /** Chat suggestions to show users what this agent can do */
  suggestions?: AgentSuggestion[];
  /** Welcome message shown when agent starts */
  welcomeMessage?: string;
  /** Path to Jupyter notebook to show on agent creation */
  welcomeNotebook?: string;
  /** Path to Lexical document to show on agent creation */
  welcomeDocument?: string;
  /**
   * Which agent framework runs this agent's loop.
   *
   * `pydantic-ai` (the default) runs it server-side in the agent runtime;
   * `vercel-ai` runs it in the browser with the Vercel AI SDK, for an agent
   * that has to work with no server behind it. Distinct from `protocol`,
   * which says how a client and an agent talk rather than what runs the loop.
   */
  harness?: string;
  /** Sandbox variant to use for this agent (e.g. 'eval', 'jupyter-server', 'kaggle'). */
  sandboxVariant?: string;
  /** User-facing objective for the agent */
  goal?: string;
  /**
   * What work this agent can be delegated (ORCHESTRATOR.md, O2-07).
   *
   * `protocol` below says how a client and an agent talk; this says what it
   * is worth handing the agent. Ids come from a closed vocabulary, because
   * `agents.discover --capability notebook.validate` has to match something
   * and free text does not: two specs saying "analysis" and "analyse"
   * describe the same work and find each other never.
   *
   * Deliberately not called `capabilities`: that name is already taken on
   * this type for pydantic-ai capability configurations, which are runtime
   * behaviours attached to an agent rather than work handed to it.
   */
  delegable?: AgentCapability[];
  /** Communication protocol (e.g., 'ag-ui', 'acp', 'a2a', 'vercel-ai') */
  protocol?: string;
  /** UI plugin (e.g., 'a2ui', 'mcp-apps'), one of the `UI_PLUGIN_CATALOGUE`. */
  uiPlugin?: string;
  /** Trigger configuration (type, cron, event source, prompt) */
  trigger?: AgentTriggerConfig;
  /** Model configuration (temperature, max_tokens) */
  modelConfig?: AgentModelConfig;
  /** MCP server tool configurations with approval settings */
  mcpServerTools?: AgentMCPServerToolConfig[];
  /** Guardrail configurations */
  guardrails?: GuardrailSpec[];
  /** Evaluation configurations */
  evals?: AgentEvalConfig[];
  /** Codemode configuration (enabled, token_reduction, speedup) */
  codemode?: AgentCodemodeConfig;
  /** Output configuration (type/formats, template) */
  output?: AgentOutputConfig;
  /** Advanced settings (cost_limit, time_limit, max_iterations, validation) */
  advanced?: AgentAdvancedConfig;
  /** Conversation checkpoints: auto-snapshots of the history, with tools to save, list and rewind. */
  checkpoints?: AgentCheckpointsConfig;
  /** Authorization policy */
  authorizationPolicy?: string;
  /** Notification configuration (email, slack) */
  notifications?: AgentNotificationConfig;
  /** Memory backend identifier (e.g., 'ephemeral', 'mem0', 'memu', 'simplemem') */
  memory?: string;
  /** Pre-launch hooks (package installs and sandbox code). */
  preHooks?: {
    packages?: string[];
    sandbox?: string | string[];
  };
  /** Post-stop hooks (sandbox cleanup code). */
  postHooks?: {
    sandbox?: string | string[];
  };
  /** Per-tool-call hooks (authorization/audit integration). */
  toolHooks?: Record<string, any>;
  /** JSON schema for launch-time parameter values. */
  parameters?: Record<string, any>;
  /** Subagent delegation configuration. */
  subagents?: SubAgentsConfig;
}

/**
 * Where a subagent reached over A2A lives, or how to launch it.
 *
 * Either `url` names an agent already running, or the subagent's `ref` names
 * the agentspec to launch one from — on the local agent-runtimes server when
 * the parent runs locally and on a Datalayer runtime when it runs in the
 * cloud (`launch: 'auto'`, the default), or on one of those explicitly.
 */
export interface A2ASubagentConfig {
  /** JSON-RPC endpoint of an A2A agent already running. */
  url?: string;
  /** Where to launch the agent named by `ref`. */
  launch?: 'local' | 'cloud' | 'auto';
  /** Runtime environment for a cloud launch. */
  environment?: string;
}

/**
 * Configuration for a subagent within an agent specification.
 */
export interface SubAgentspecConfig {
  /** Unique identifier for the subagent */
  name: string;
  /** Brief description shown to the parent agent */
  description: string;
  /**
   * System prompt for the subagent. Optional when `ref` names an agentspec to
   * take it from.
   */
  instructions?: string;
  /**
   * An agentspec this subagent *is*, as `<id>:<version>`.
   *
   * A specialist defined once and referenced by many parents, rather than its
   * instructions copy-pasted into each — which is how they drift apart.
   */
  ref?: string;
  /**
   * Reach this subagent over A2A, as a separate agent, instead of running it
   * inside the parent's process.
   */
  a2a?: A2ASubagentConfig;
  /** LLM model to use (defaults to parent agent's model) */
  model?: string;
  /** Whether the subagent can ask the parent for clarification */
  canAskQuestions?: boolean;
  /** Maximum questions the subagent may ask per task */
  maxQuestions?: number;
  /** Default execution mode preference */
  preferredMode?: 'sync' | 'async' | 'auto';
  /** Typical task complexity hint for auto-mode selection */
  typicalComplexity?: 'simple' | 'moderate' | 'complex';
  /** Whether this subagent typically needs user context */
  typicallyNeedsContext?: boolean;
}

/**
 * Top-level subagents configuration for an agent specification.
 */
export interface SubAgentsConfig {
  /** List of subagent configurations */
  subagents: SubAgentspecConfig[];
  /** Default model for subagents that don't specify one */
  defaultModel?: string;
  /** Include a general-purpose fallback subagent */
  includeGeneralPurpose?: boolean;
  /** Maximum depth for nested subagent delegation (0 = no nesting) */
  maxNestingDepth?: number;
}
