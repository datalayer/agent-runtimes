/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The prompt, with everything under it.
 *
 * Wraps the editor and adds the row beneath: the agent, tools, skills and
 * model menus, and the context-window bar. The menus themselves live in
 * `./menus` — they were private sub-components here, which made one module
 * carry four unrelated overlays.
 *
 * @module chat/prompt/InputPrompt
 */

import type { ReactNode } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Text } from '@primer/react';
import type { KernelMessage } from '@jupyterlab/services';
import type {
  BuiltinTool,
  ContextSnapshotData,
  MCPServerConfig,
  McpToolsetsStatusResponse,
  ModelConfig,
  SkillInfo,
} from '../../types';
import { InputPromptBase, type InputPromptVariant } from './InputPromptBase';
import {
  AgentsMenu,
  InlineAgentsMenu,
  ToolsMenu,
  SkillsMenu,
  ModelSelector,
} from './menus';
import { ContextPie } from '../usage/ContextPie';
import { McpStatusIndicator } from '../indicators/McpStatusIndicator';
import { SkillsStatusIndicator } from '../indicators/SkillsStatusIndicator';
import type { MentionableAgent } from './plugins/AgentMentionPlugin';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** One agent the footer may offer. */
import type { FooterAgent } from '../../types/chat';

/*
 * Re-exported, not defined here.
 *
 * It lived in this module and was imported back by the menus this module
 * renders, and by `types/chat` — a component importing its own children
 * importing the component. Definition moved to `types`; this keeps the name
 * reachable from where callers already look for it.
 */
export type { FooterAgent };

/* Shared, so a defaulted prop is the same object on every render: a fresh
   `new Map()` per render is a new dependency for anything memoising on it. */
const EMPTY_TOOL_MAP: Map<string, Set<string>> = new Map();
const EMPTY_ID_SET: Set<string> = new Set();

export interface InputPromptProps {
  // ---- Input ----
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  kernelStatus?: KernelMessage.Status;
  connectionConfirmed: boolean;
  placeholder?: string;
  /**
   * Openers to type out in the placeholder, one after another, on a loop.
   *
   * Forwarded to the prompt itself — see `InputPromptBase`. The chat's own
   * suggestions, usually: the empty state offers them until the first message
   * and then stops, while the box they would be typed into is there the whole
   * time.
   */
  typingSuggestions?: string[];
  autoFocus: boolean;
  focusTrigger?: number;
  padding: number;
  /**
   * Called with the message when it is sent.
   *
   * The argument is handed straight through from `InputPromptBase`, which has
   * always passed it — the type here simply said `() => void` and hid that, so
   * a caller wanting the text had to read the source to learn it was there.
   * Declaring it costs callers that ignore it nothing.
   */
  onSend: (message: string) => void;
  onStop: () => void;
  disableInputPrompt?: boolean;
  /**
   * Which editor the prompt uses.
   *
   * Forwarded to `InputPrompt`, which is the one prompt component either way —
   * this toolbar is chrome around it, not a second implementation. Without the
   * pass-through the toolbar could only ever be the plain textarea, so a host
   * wanting the `@` menu had to stop using the toolbar to get it.
   */
  promptVariant?: InputPromptVariant;
  /** Agents the prompt may address by typing `@`. Lexical only. */
  mentionableAgents?: MentionableAgent[];
  /** Rendered inside the prompt, above where the typing goes. */
  headerContent?: ReactNode;

  // ---- Agents ----
  /**
   * Whether the agent chooser is offered.
   *
   * Beside the tools, the skills and the model rather than in a bar at the top
   * of the workspace: all four decide what the *next message* does, and a
   * person setting them up is composing, not configuring.
   */
  showAgentsMenu?: boolean;
  /** Everyone this conversation may be addressed to. */
  agents?: FooterAgent[];
  /** Who is being addressed now. */
  selectedAgentId?: string;
  /** Address somebody else. */
  onSelectAgent?: (agentId: string) => void;
  /**
   * Whether the agent chip is also drawn inside the prompt.
   *
   * True by default: the chip says who is answering while a person is
   * writing, which the footer's menu says too but further from the eye.
   *
   * False for a host that would rather have one place for every control than
   * two — the footer keeps the chooser either way, so nothing is lost but the
   * duplication.
   */
  showInlineAgentsMenu?: boolean;

  // ---- Token usage ----
  showTokenUsage: boolean;
  /**
   * Whether the usage bar draws its context ring.
   *
   * False by default — see `TokenUsageBar`. The numbers appear either way;
   * this is the pie beside them.
   */
  showContextRing?: boolean;
  agentUsage?: ContextSnapshotData;

  // ---- Selectors visibility ----
  showModelSelector: boolean;
  showToolsMenu: boolean;
  showSkillsMenu: boolean;
  codemodeEnabled: boolean;
  /**
   * Optional callback invoked when the user toggles codemode from the Tools
   * menu. When omitted the toggle renders as read-only.
   */
  onToggleCodemode?: (enabled: boolean) => void | Promise<void>;
  isA2AProtocol: boolean;
  hasConfigData: boolean;
  hasSkillsData: boolean;
  /**
   * Whether the config request is still in flight.
   *
   * Separate from `hasConfigData` because "not here yet" and "not coming" want
   * different words, and only the caller can tell them apart. Without it the
   * bar said "Loading controls..." for ever whenever a request failed or the
   * agent had no config endpoint to ask.
   */
  configLoading?: boolean;

  /*
    Everything below is optional.

    A host that renders this toolbar for one of its features — an agent
    chooser and a context bar, say — should not have to invent a model list,
    an MCP toggle handler and a skills query to get there. Each menu is drawn
    only when it is switched on, so the props it needs are only needed then.
  */
  // ---- Model ----
  models?: ModelConfig[];
  selectedModel?: string;
  onModelSelect?: (modelId: string) => void;

  // ---- Tools ----
  availableTools?: BuiltinTool[];
  /** MCP servers to render (already filtered by selection) */
  mcpServers?: MCPServerConfig[];
  enabledMcpTools?: Map<string, Set<string>>;
  enabledMcpToolCount?: number;
  onToggleMcpTool?: (serverId: string, toolName: string) => void;
  onToggleAllMcpServerTools?: (
    serverId: string,
    toolNames: string[],
    enable: boolean,
  ) => void;
  /** Approved MCP tools per server (default: all tools approved) */
  approvedMcpTools?: Map<string, Set<string>>;
  onToggleMcpToolApproval?: (serverId: string, toolName: string) => void;

  // ---- Skills ----
  skills?: SkillInfo[];
  skillsLoading?: boolean;
  enabledSkills?: Set<string>;
  onToggleSkill?: (skillId: string) => void;
  onToggleAllSkills?: (skillIds: string[], enable: boolean) => void;
  /** Approved skills set (default: all skills approved) */
  approvedSkills?: Set<string>;
  onToggleSkillApproval?: (skillId: string) => void;

  // ---- Indicators ----
  /** API base URL passed to MCP indicator */
  apiBase?: string;
  /** Auth token passed to MCP indicator */
  authToken?: string;
  /** Pre-fetched MCP status from WebSocket — bypasses REST polling */
  mcpStatusData?: McpToolsetsStatusResponse | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InputPrompt({
  input,
  setInput,
  isLoading,
  kernelStatus,
  connectionConfirmed,
  placeholder,
  typingSuggestions,
  autoFocus,
  focusTrigger,
  padding,
  onSend,
  onStop,
  disableInputPrompt = false,
  promptVariant,
  mentionableAgents,
  headerContent,
  showAgentsMenu = false,
  showInlineAgentsMenu = true,
  agents = [],
  selectedAgentId,
  onSelectAgent,
  showTokenUsage,
  showContextRing = false,
  agentUsage,
  showModelSelector,
  showToolsMenu,
  showSkillsMenu,
  codemodeEnabled,
  onToggleCodemode,
  isA2AProtocol,
  hasConfigData,
  hasSkillsData,
  configLoading = false,
  models = [],
  selectedModel = '',
  onModelSelect = () => {},
  availableTools = [],
  mcpServers = [],
  enabledMcpTools = EMPTY_TOOL_MAP,
  enabledMcpToolCount = 0,
  onToggleMcpTool = () => {},
  onToggleAllMcpServerTools = () => {},
  approvedMcpTools = EMPTY_TOOL_MAP,
  onToggleMcpToolApproval = () => {},
  skills = [],
  skillsLoading = false,
  enabledSkills = EMPTY_ID_SET,
  onToggleSkill = () => {},
  onToggleAllSkills = () => {},
  approvedSkills = EMPTY_ID_SET,
  onToggleSkillApproval = () => {},
  apiBase,
  authToken,
  mcpStatusData,
}: InputPromptProps) {
  const isKernelBusy = kernelStatus === 'busy';
  /*
   * Each menu is offered when it is switched on *and* has something behind it.
   *
   * The bar used to ask one question — has any request come back — and answer
   * for all four menus at once. So a chat with a model list and no config
   * endpoint showed "Loading controls..." over a model menu that was ready,
   * and went on showing it, because the request it was waiting for was never
   * going to arrive.
   */
  /*
   * Offered for one agent as much as for several.
   *
   * `> 1` treated the control as a *switch* — useless with nothing to switch
   * to — but it is also a label: it says who is answering, which is worth
   * knowing in a chat with exactly one agent and no other place that says so.
   * The menu then simply has one row, already selected.
   */
  /*
   * Offered because the host asked for them, not because they have contents.
   *
   * Each of these used to require something behind it — a model in the list, a
   * config request answered, a skill loaded — so a chat that had asked for all
   * four showed however many happened to be populated, and the row's shape
   * changed as answers arrived. Worse, "no skills" and "skills not reported"
   * looked identical: both were an absent menu.
   *
   * A menu that opens onto nothing says nothing is there, which is an answer.
   * An absent menu is not.
   */
  const agentsOffered = showAgentsMenu && agents.length > 0;
  /* The same control, drawn in the prompt as well as under it. */
  const inlineAgents = agentsOffered && showInlineAgentsMenu;
  const modelsOffered = showModelSelector;
  const toolsOffered = showToolsMenu;
  const skillsOffered = showSkillsMenu;
  const anyOffered =
    agentsOffered || modelsOffered || toolsOffered || skillsOffered;

  /* Still coming, as opposed to never coming. Only a menu that was asked for
     and is genuinely waiting justifies the word "loading". */
  const stillLoading =
    (showToolsMenu && !hasConfigData && configLoading) ||
    (showSkillsMenu && !hasSkillsData && skillsLoading);

  // No bar at all when there is nothing to put in it and nothing on its way:
  // an empty bordered strip is worse than no strip.
  const showSelectorsBar = anyOffered || stillLoading;
  /*
   * The agents are in hand the moment the bar renders — they come from the
   * team the workspace was opened with, not from a query — so a bar that
   * carries them has content whether or not the tool and skill requests have
   * come back yet. Without this a workspace with only an agent chooser sat on
   * "Loading controls..." for ever.
   */

  /*
   * Shown as soon as the agent accounts for itself, not once it has spent
   * something.
   *
   * `totalTokens > 0` kept the bar hidden until after the first answer, so it
   * arrived mid-conversation and pushed the prompt down with it — and the
   * counts beside the ring could never read zero, which is the one state that
   * says "connected, nothing sent yet". Both harnesses now report a snapshot
   * from the start; this shows it.
   */
  const hasContext = Boolean(agentUsage && !agentUsage.error);

  return (
    <Box>
      {/* Input Area — powered by the standalone InputPrompt component */}
      <InputPromptBase
        variant={promptVariant}
        mentionableAgents={mentionableAgents}
        /*
          Whatever the host puts inside the prompt, and the agent chip beside
          it. Both, rather than either: a host contributing its own controls
          should not lose the one control that says who is being addressed.
        */
        headerContent={
          inlineAgents || headerContent ? (
            <>
              {inlineAgents ? (
                <InlineAgentsMenu
                  agents={agents}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={onSelectAgent}
                />
              ) : null}
              {headerContent}
            </>
          ) : undefined
        }
        placeholder={placeholder || 'Type a message...'}
        typingSuggestions={typingSuggestions}
        isLoading={isLoading}
        isKernelBusy={isKernelBusy}
        disabled={disableInputPrompt}
        readOnly={!connectionConfirmed}
        onSend={onSend}
        onStop={onStop}
        autoFocus={autoFocus}
        focusTrigger={focusTrigger}
        padding={padding}
        value={input}
        onChange={setInput}
        footerRightContent={
          <>
            <McpStatusIndicator
              apiBase={apiBase}
              authToken={authToken}
              data={mcpStatusData}
            />
            <SkillsStatusIndicator
              skillsCount={skills.length}
              enabledCount={enabledSkills.size}
              loading={skillsLoading}
            />
          </>
        }
      />

      {/* Token usage slot — keep rendered to prevent async layout jumps */}
      {showTokenUsage && (
        <Box
          // Dimmed with the controls beneath it. The ring and the counts are
          // as unavailable as the menus when the prompt is disabled, and one
          // half of the footer at full strength over the other half at half
          // read as a rendering fault rather than as a state.
          sx={{
            /*
              No band when there is nothing to put in it.
              
              The 8px was there to stop the layout jumping when usage arrived
              late. For an agent that never reports any — an in-page one with
              no server keeping the account — it is a permanent white stripe
              between the prompt and its footer, reserved for a thing that is
              not coming.
            */
            minHeight: hasContext && agentUsage ? 28 : 0,
            ...(disableInputPrompt
              ? { opacity: 0.5, pointerEvents: 'none' }
              : null),
          }}
        >
          {hasContext && agentUsage ? (
            <ContextPie
              agentUsage={agentUsage}
              padding={padding}
              showContextRing={showContextRing}
            />
          ) : null}
        </Box>
      )}

      {/* Model, Skills, and Tools Footer — Below Input */}
      {showSelectorsBar && (
        <Box
          aria-disabled={disableInputPrompt || undefined}
          sx={{
            display: 'flex',
            gap: 2,
            px: padding,
            py: 0.5,
            minHeight: 36,
            borderTop: '1px solid',
            borderColor: 'border.default',
            alignItems: 'center',
            bg: 'canvas.subtle',
            /*
              Dimmed and inert, but still the theme's colours.

              `grayscale(1)` was doing the desaturating, and it takes the
              theme with it: a workspace on the Jupyter variant — where there
              is no agent, so the bar is disabled from the moment it renders —
              showed a grey strip under a coloured page, as though the theme
              had failed rather than the controls being unavailable. Opacity
              alone says "not now" without saying "not yours".
            */
            ...(disableInputPrompt
              ? { opacity: 0.5, pointerEvents: 'none' }
              : null),
          }}
        >
          {anyOffered ? (
            <>
              {/* Agents Menu */}
              {agentsOffered && (
                <AgentsMenu
                  agents={agents}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={onSelectAgent}
                />
              )}

              {/* Tools Menu */}
              {toolsOffered && (
                <ToolsMenu
                  codemodeEnabled={codemodeEnabled}
                  onToggleCodemode={onToggleCodemode}
                  mcpServers={mcpServers}
                  enabledMcpTools={enabledMcpTools}
                  enabledMcpToolCount={enabledMcpToolCount}
                  onToggleMcpTool={onToggleMcpTool}
                  onToggleAllMcpServerTools={onToggleAllMcpServerTools}
                  approvedMcpTools={approvedMcpTools}
                  onToggleMcpToolApproval={onToggleMcpToolApproval}
                  availableTools={availableTools}
                />
              )}

              {/* Skills Menu */}
              {skillsOffered && (
                <SkillsMenu
                  skills={skills}
                  skillsLoading={skillsLoading}
                  enabledSkills={enabledSkills}
                  onToggleSkill={onToggleSkill}
                  onToggleAllSkills={onToggleAllSkills}
                  approvedSkills={approvedSkills}
                  onToggleSkillApproval={onToggleSkillApproval}
                />
              )}

              {/* Model Selector */}
              {modelsOffered && (
                <ModelSelector
                  models={models}
                  selectedModel={selectedModel}
                  onModelSelect={onModelSelect}
                  isA2AProtocol={isA2AProtocol}
                />
              )}
            </>
          ) : (
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              Loading controls...
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
