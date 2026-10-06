/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { SkillSpec } from './skills';
import type { MCPServer, AgentMCPServerToolConfig } from './mcp';
import type {
  BackendToolSpec,
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
 * A visual component a UI plugin renders (LOOP C-13), named as a surface names
 * it. A standard one's properties are its protocol's own; Datalayer's own
 * carry theirs as a JSON Schema, from which its properties form is drawn (C-14).
 */
export interface ComponentSpec {
  /** The name a surface gives it (e.g. 'Table'). */
  id: string;
  name: string;
  /** What it is for, in a sentence. */
  description: string;
  /** text, input, action, data, conversation, media, layout. */
  category: string;
  /** Its face on the palette. */
  emoji: string;
  /** Its version in the catalog. */
  version: string;
  /** Named and drawn as its protocol says (A2UI's basic catalog). */
  standard: boolean;
  /** Its properties as a JSON Schema: what a builder sets (C-13). */
  properties: Record<string, unknown>;
  /** What it can be bound to: what it shows, what it sends. */
  bindings?: { shows: string[]; sends: string[] };
  /** What it reports. */
  events: string[];
  /** A valid configuration of it. */
  example?: Record<string, unknown>;
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
  /** The catalog its components are written in. */
  catalog: string;
  /** The visual components it renders (LOOP C-13). */
  components: ComponentSpec[];
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
  /** Backend tools (agentspecs/backend-tools), `id:version`. */
  backendTools: string[];
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

/** What a tool does to the world (`agentspecs.actions`). */
export type ActionClass =
  'read' | 'write' | 'send' | 'buy' | 'delete' | 'publish';

/** An argument that makes a tool do something more than its own class. */
export interface ActionConditionSpec {
  /** The argument of the call. */
  argument: string;
  /** Holds when the argument is any of these: a word, a number, true or false. */
  equals?: Array<string | number | boolean>;
  /** Holds when the argument's values include any of these. */
  includes?: Array<string | number | boolean>;
  /** What the tool is then, besides its own. */
  classes: ActionClass[];
}

/** A condition, and what an application does when it holds. */
export interface AppEscalation extends ActionConditionSpec {
  behaviour: AppBehaviour;
}

/** What the tools of an MCP server do. */
export interface ServerActionsSpec {
  /** The day the tool names were read off the running server; absent when nobody looked. */
  checked?: string;
  /** The classes of a tool nothing else names; empty means unknown. */
  default: ActionClass[];
  /** What each tool does of its own, by name or pattern. */
  tools: Record<string, ActionClass[]>;
  /** What an argument makes a tool do besides, by tool. */
  conditions: Record<string, ActionConditionSpec[]>;
}

/** What kind of application it is: what its user meets. */
export type AppKind = 'chat' | 'widget' | 'decision' | 'worker';

/**
 * How an application was built: in Python (its `app.py`), on the Canvas (its
 * page composed there) or written out as its spec. Carried beside the
 * catalogue (`APP_BUILT`), since an Appspec does not hold it.
 */
export type AppBuilt = 'python' | 'canvas' | 'written';

/** What an application does when it meets an action. */
export type AppBehaviour = 'do_it' | 'if_asked' | 'ask_first' | 'leave_to_me';

export type AppLayout = 'chat' | 'page' | 'split';

/** The one colour of an application; everything else is neutral. */
export type AppAccent = 'green' | 'rose' | 'sky' | 'lime' | 'sun' | 'violet';

/** A theme of Appearance's, which an application may run in (LOOP T-30). */
export type AppThemeVariant =
  | 'datalayer'
  | 'spatial'
  | 'lovely'
  | 'matrix'
  | 'earth'
  | 'sand'
  | 'ivory'
  | 'sun'
  | 'loop';

/** The colour mode it is worn in: `auto` follows the device. */
export type AppThemeMode = 'light' | 'dark' | 'auto';

/**
 * The theme an application runs in by default (LOOP T-30): at its address,
 * embedded, in the Studio's Preview and as an example. The person's own
 * when unsaid; the mode, when unsaid, is the person's.
 */
export interface AppThemeSpec {
  variant: AppThemeVariant;
  mode?: AppThemeMode;
}

/**
 * The character an application's floating assistant shows (LOOP T-24): the id
 * an enabled plugin contributes it under to `loop.assistant.character` —
 * Datalayer's are `paperclip`, `wizard`, `cat` and `eyes`. The spec checks
 * its shape (`APP_ASSISTANT_CHARACTER_ID`); whether a plugin gives it is
 * known only where the plugins are.
 */
export type AppAssistantCharacter = string;

/** How a floating assistant's balloon shows the conversation (LOOP T-23). */
export type AppBalloonDisplay = 'history' | 'current';

/** How an application sits in another product's page (LOOP D-07). */
export type AppEmbedMode = 'inline' | 'bubble' | 'panel' | 'assistant';

/** Something an application reaches. */
export interface AppConnectionSpec {
  /** An MCP server, `id` or `id:version`. */
  server: string;
  access: 'read' | 'write';
  /** In whose name: the builder's account, or each user's own. */
  as: 'owner' | 'user';
  /** The tools it may use, by name or pattern; all when empty. */
  only: string[];
}

/** When an application acts alone, and when it asks. */
export interface AppRuleSpec {
  /** The action, in the words a person reads. */
  action: string;
  /** Classes of action, or tools (`server.tool`), the rule applies to. */
  appliesTo: string[];
  behaviour: AppBehaviour;
}

/** What an application may reach beside its connections. Nothing, unless said. */
export interface AppPermissionsSpec {
  /** The Spaces it reads or writes. */
  spaces: Array<{ space: string; access: 'read' | 'write' }>;
  /** Its computer; each off until it is turned on. */
  computer: { browse: boolean; files: boolean; shell: boolean };
}

export interface AppStarterSpec {
  label: string;
  message: string;
}

/** A slash command the user picks in the composer (LOOP P-19). */
export interface AppCommandSpec {
  /** What follows the slash: lower-case letters, digits and hyphens. */
  name: string;
  /** What the composer's menu says it does. */
  description: string;
  /** What picking it sends: `{input}` the words typed after it. */
  prompt: string;
}

/** One position of a mode switch (LOOP P-19). */
export interface AppModeOptionSpec {
  id: string;
  label: string;
  description?: string;
  /** What the agent is told in every run in this mode. */
  instructions?: string;
  /** The model a run in this mode runs on, in place of the application's. */
  model?: string | null;
}

/** A mode switch in the composer (LOOP P-19). */
export interface AppModeSpec {
  id: string;
  label: string;
  /** Its positions, two at least. */
  options: AppModeOptionSpec[];
  /** The option it starts on; the first when unsaid. */
  default?: string | null;
}

/**
 * What a run in the modes chosen is told, and the model it runs on (LOOP
 * P-19): agentspecs' `ModeEffect`.
 */
export interface AppModeEffect {
  /** The instructions of the options chosen, in the order of the modes. */
  instructions: string;
  /** The model an option chosen names; the application's when unsaid. */
  model?: string;
}

/**
 * One field of a form (LOOP C-16): its JSON Schema — a `type`, the `title` a
 * person reads, its `default`, and what it takes (`enum`, `minimum`,
 * `maximum`…).
 */
export type AppFormField = {
  type?: string;
  title?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  [keyword: string]: unknown;
};

/**
 * The JSON Schema of a form (LOOP C-16): an object of named fields, drawn with
 * `@datalayer/primer-rjsf` and checked by the runtime against the same schema.
 * An application's settings are one (`interface.settings`), as a Form block's
 * schema is.
 */
export type AppFormSchema = {
  type: 'object';
  properties: Record<string, AppFormField>;
  required?: string[];
  [keyword: string]: unknown;
};

/** The component tree a user meets, over the approved catalog (A2UI). */
export interface AppSurfaceSpec {
  protocol: string;
  components: Array<{
    id: string;
    component: string;
    [property: string]: unknown;
  }>;
  composedBy: string;
  composedAt: string;
}

/**
 * An application's voice (VOICE.md VO-41), off unless said: whether a person
 * may talk to it, whether its answers are heard, with which voice of the
 * catalogue (`specs/voices`), in which language (BCP 47) and where its
 * speech runs.
 */
export interface AppVoiceSpec {
  enabled: boolean;
  input: 'off' | 'push_to_talk' | 'hands_free';
  output: 'off' | 'on_request' | 'always';
  voice: string;
  language: string;
  where: 'auto' | 'device' | 'server';
}

/**
 * A kind of file a person may send, and how large (LOOP P-21): a media type
 * (`application/pdf`), a family (`image/*`, `audio/*`) or an extension
 * (`.csv`), lowercase.
 */
export interface AppUploadKindSpec {
  type: string;
  /** The largest file of this kind, in megabytes; 10 unless said, 25 at most. */
  maxMb: number;
}

/**
 * What a person may send in the composer without being asked (LOOP P-21):
 * the kinds it takes, each with its largest size, and how many at once.
 */
export interface AppUploadsSpec {
  kinds: AppUploadKindSpec[];
  /** The most files sent with one message; 5 unless said. */
  maxFiles: number;
}

/** What the user of an application sees. */
export interface AppInterfaceSpec {
  layout: AppLayout;
  /** Its one colour, over the `loop` theme only. */
  accent: AppAccent;
  /** The theme it runs in by default; the person's own when unsaid (T-30). */
  theme?: AppThemeSpec;
  welcome: string;
  starters: AppStarterSpec[];
  /** Slash commands picked in the composer: typing `/` lists them (P-19). */
  commands: AppCommandSpec[];
  /** Mode switches in the composer, the option picked going with every run (P-19). */
  modes: AppModeSpec[];
  /**
   * What a person may set: the JSON Schema of a form (C-16), drawn beside the
   * conversation and on a deployment's Ship card; none when unsaid.
   */
  settings?: AppFormSchema;
  /**
   * What a person may send in the composer without being asked (P-21): none
   * when unsaid — the composer offers no attachment, and the runtime refuses
   * a file sent with a message.
   */
  uploads?: AppUploadsSpec;
  /** The components of the catalog the surface may use. */
  components: string[];
  surface?: AppSurfaceSpec;
  /**
   * The character its floating assistant shows; the paper clip when unsaid.
   * Said, it wins over the one the person chose in their settings.
   */
  assistant?: AppAssistantCharacter;
  /**
   * How its floating assistant's balloon shows the conversation: `history`
   * (every message, the composer last) or `current` (only what it says or
   * does now). The page's own when unsaid.
   */
  balloon?: AppBalloonDisplay;
  /** Its voice: off unless said (VO-41); absent from a spec made before voice. */
  voice?: AppVoiceSpec;
  /**
   * The formats its answers come in, by media type, words first:
   * `text/markdown`, then `application/x-ipynb+json` for a Jupyter notebook.
   * Over A2A, its agent card's output modes. Empty: plain text alone.
   */
  outputs: string[];
}

export interface AppTestCaseSpec {
  ask: string;
  expect: string;
  /**
   * The function of its code that decides the case, by name (LOOP P-06:
   * `@app.test`); `expect` still says it in words, and decides it without
   * the file. Empty, or absent, for a case in words alone.
   */
  code?: string;
}

/**
 * What was verified, and how, each in a sentence a person reads (LOOP E-14):
 * what was tried live, what runs on recorded data, what is not verified yet.
 */
export interface AppVerifiedSpec {
  live: string[];
  recorded: string[];
  unverified: string[];
}

/** How an application is verified. */
export interface AppTestsSpec {
  /** The share of tests that has to pass for it to be ready. */
  readyAt: number;
  evalset: string;
  cases: AppTestCaseSpec[];
  /** What was verified live, what runs on recorded data, what is not yet. */
  verified: AppVerifiedSpec;
}

/** What is kept of what an application did, and for how long. */
export interface AppRecordSpec {
  /** The retention, e.g. `1_years`. */
  keepFor: string;
  retentionDays: number;
  include: string[];
  /**
   * Whether its conversations may be used to suggest tests (LOOP V-16): off
   * unless said, and only those kept while it is on are sampled.
   */
  suggestTests: boolean;
}

/** Where a check of an application's code runs (LOOP P-06). */
export type AppCheckStage = 'answer' | 'tool_call';

/** A check written in an application's code (LOOP P-06: `@app.check`). */
export interface AppCodeCheckSpec {
  /** The function of its code that checks. */
  name: string;
  /** On every answer, or every tool call the rules let through. */
  on: AppCheckStage;
  /** What it checks, in a sentence a person reads. */
  description: string;
}

/** Optional checks from the catalogue, and its code's own. */
export interface AppChecksSpec {
  guards: string[];
  gates: string[];
  track: string;
  /** Checks written in its code (LOOP P-06); absent when it has none. */
  code?: AppCodeCheckSpec[];
}

/**
 * A tool of an application's own, written in its code (LOOP P-06:
 * `@app.tool`): its agent calls it, and the rules decide each call by what
 * it `does`, or by a rule that names it by its name alone.
 */
export interface AppToolSpec {
  name: string;
  /** What it does, for the agent. */
  description: string;
  /** The JSON Schema of its arguments, an object. */
  parameters: Record<string, unknown>;
  /** What it does, by class of action: `read`, `write`, `send`… */
  does: string[];
}

/** A function of the host page the application's agent may call (LOOP D-10). */
export interface AppHostFunctionSpec {
  /** Lower-case words joined by `_`: called as the tool `host_<name>`. */
  name: string;
  /** What it does, for the agent: when to call it. */
  description: string;
  /** Its arguments, a JSON Schema of `type: object`. */
  parameters: Record<string, unknown>;
}

/**
 * What the host page and an embedded application say to each other (LOOP
 * D-10): the host's values it reads (`user`, `page`, or the host's own),
 * through the tool `host_context`, and the host's functions it may call,
 * each through `host_<name>` — every one of them decided by a rule that
 * names it.
 */
export interface AppHostBridgeSpec {
  context: string[];
  functions: AppHostFunctionSpec[];
}

export interface AppDeploymentSpec {
  hosted?: {
    visibility: 'private' | 'invited' | 'organization' | 'link' | 'public';
    slug: string;
    /**
     * At its address, only its character (LOOP T-21): the conversation
     * opens in its balloon, as when it is shipped as `assistant`. Off
     * unless said.
     */
    characterAlone?: boolean;
  };
  embedded?: {
    mode: AppEmbedMode;
    origins: string[];
    /** What the host page passes it and the functions of the host it may call (LOOP D-10). */
    host?: AppHostBridgeSpec;
  };
}

/** What starts a worker's work. */
export interface AppTriggerSpec {
  type: 'schedule' | 'event' | 'once';
  cron: string;
  event: string;
  at: string;
  description: string;
  prompt: string;
}

export interface AppCriterionSpec {
  name: string;
  kind: 'metric' | 'noul' | 'choice' | 'score';
  weight: number;
  instructions: string;
  options: string[];
  direction: 'higher' | 'lower';
  measure: '' | 'pass_rate' | 'cost_per_task' | 'seconds_per_task';
}

export interface AppScenarioSpec {
  name: string;
  weights: Record<string, number>;
}

/** What a decision application decides. */
export interface AppDecisionSpec {
  question: string;
  alternatives: string[];
  criteria: AppCriterionSpec[];
  minConfidence: number;
  scenarios: AppScenarioSpec[];
  decisionModel: string;
}

/**
 * An application (`agentspecs/apps`): the Appspec. An agent with an interface,
 * rules, tests and a place to run — a chat, a widget, a decision or a worker.
 * It stands alone: Guards, Gates and a Track are optional, under `checks`.
 * In the generated catalogue it carries its layout, and what it names that
 * is not enabled (`setup`).
 */
export interface AppSpec {
  /** The version of the spec itself: `loop.app/v1`. */
  schema: string;
  id: string;
  version: string;
  name: string;
  kind: AppKind;
  description: string;
  owner: string;
  /** The agent or the Cog that does the work; empty when a team does. */
  agent: string;
  team: string;
  instructions: string;
  model: string;
  skills: string[];
  /** Backend tools (agentspecs/backend-tools) it adds to its agent's. */
  backendTools: string[];
  /** Tools of its own, written in its code (LOOP P-06); absent when it has none. */
  tools?: AppToolSpec[];
  /** The Frames it works under. */
  context: string[];
  /** The documents and datasets it answers from. */
  contents: string[];
  connections: AppConnectionSpec[];
  rules: AppRuleSpec[];
  permissions: AppPermissionsSpec;
  interface: AppInterfaceSpec;
  tests: AppTestsSpec;
  record: AppRecordSpec;
  checks: AppChecksSpec;
  deployment: AppDeploymentSpec;
  /** For a worker: what it works toward. */
  goal: string;
  triggers: AppTriggerSpec[];
  memory: string;
  notifications: string[];
  decision?: AppDecisionSpec;
  /** What it names that is not enabled today, in sentences. */
  setup: string[];
  enabled: boolean;
  /**
   * Why it is not offered today, in a sentence its page shows: said when
   * `enabled` is false, and only then (empty otherwise).
   */
  unavailable_because: string;
  tags: string[];
  icon?: string;
  /** Its face: one emoji, shown wherever the application appears. */
  emoji: string;
  /**
   * Its avatar, by name: a drawing of the set people choose theirs from on
   * their profile. Empty, its emoji stands for it.
   */
  avatar: string;
  /** Its banner, by name, from the same profile's set. Empty, its id seeds one. */
  banner: string;
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
  /**
   * Other models of the catalogue this agent may be switched to, beside its
   * `model`. The runtime offers those of them its inference serves.
   */
  modelAdditionals?: string[];
  /** Inference provider routing strategy */
  inferenceProvider?: 'local' | 'datalayer';
  /** MCP servers used by this agent */
  mcpServers: MCPServer[];
  /** Skills available to this agent */
  skills: SkillSpec[];
  /** Backend tools available to this agent: they run on the runtime */
  backendTools?: BackendToolSpec[];
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
