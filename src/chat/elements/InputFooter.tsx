/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * InputFooter — Bottom section of the ChatBase component.
 *
 * Contains the InputPrompt component, the TokenUsageBar, and the
 * model / tools / skills action-menu selectors.
 *
 * @module components/chat/elements/InputFooter
 */

import {
  Text,
  Button,
  ActionMenu,
  ActionList,
  ToggleSwitch,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { ToolsIcon, BriefcaseIcon, AiModelIcon } from '@primer/octicons-react';

import { InputPrompt } from './InputPrompt';
import { TokenUsageBar } from './TokenUsageBar';
import type {
  ModelConfig,
  MCPServerConfig,
  SkillInfo,
  ContextSnapshotData,
} from '../../types/chat';
import type { BuiltinTool } from '../../types/Types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InputFooterProps {
  // ---- Input ----
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  placeholder?: string;
  autoFocus: boolean;
  focusTrigger?: number;
  padding: number;
  onSend: () => void;
  onStop: () => void;

  // ---- Token usage ----
  showTokenUsage: boolean;
  agentUsage?: ContextSnapshotData;

  // ---- Selectors visibility ----
  showModelSelector: boolean;
  showToolsMenu: boolean;
  showSkillsMenu: boolean;
  codemodeEnabled: boolean;
  isA2AProtocol: boolean;
  hasConfigData: boolean;
  hasSkillsData: boolean;

  // ---- Model ----
  models: ModelConfig[];
  selectedModel: string;
  onModelSelect: (modelId: string) => void;

  // ---- Tools ----
  availableTools: BuiltinTool[];
  /** MCP servers to render (already filtered by selection) */
  mcpServers: MCPServerConfig[];
  enabledMcpTools: Map<string, Set<string>>;
  enabledMcpToolCount: number;
  onToggleMcpTool: (serverId: string, toolName: string) => void;
  onToggleAllMcpServerTools: (
    serverId: string,
    toolNames: string[],
    enable: boolean,
  ) => void;

  // ---- Skills ----
  skills: SkillInfo[];
  skillsLoading: boolean;
  enabledSkills: Set<string>;
  onToggleSkill: (skillId: string) => void;
  onToggleAllSkills: (skillIds: string[], enable: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InputFooter({
  input,
  setInput,
  isLoading,
  placeholder,
  autoFocus,
  focusTrigger,
  padding,
  onSend,
  onStop,
  showTokenUsage,
  agentUsage,
  showModelSelector,
  showToolsMenu,
  showSkillsMenu,
  codemodeEnabled,
  isA2AProtocol,
  hasConfigData,
  hasSkillsData,
  models,
  selectedModel,
  onModelSelect,
  availableTools,
  mcpServers,
  enabledMcpTools,
  enabledMcpToolCount,
  onToggleMcpTool,
  onToggleAllMcpServerTools,
  skills,
  skillsLoading,
  enabledSkills,
  onToggleSkill,
  onToggleAllSkills,
}: InputFooterProps) {
  // Show token usage when we have valid context data
  const hasContext =
    agentUsage && !agentUsage.error && agentUsage.totalTokens > 0;

  return (
    <Box>
      {/* Input Area — powered by the standalone InputPrompt component */}
      <InputPrompt
        placeholder={placeholder || 'Type a message...'}
        isLoading={isLoading}
        onSend={onSend}
        onStop={onStop}
        autoFocus={autoFocus}
        focusTrigger={focusTrigger}
        padding={padding}
        value={input}
        onChange={setInput}
      />

      {/* Token usage bar — between input and selectors */}
      {showTokenUsage && hasContext && (
        <TokenUsageBar agentUsage={agentUsage!} padding={padding} />
      )}

      {/* Model, Skills, and Tools Footer — Below Input */}
      {(showModelSelector || showToolsMenu || showSkillsMenu) &&
        (hasConfigData || hasSkillsData) && (
          <Box
            sx={{
              display: 'flex',
              gap: 2,
              px: padding,
              py: 1,
              borderTop: '1px solid',
              borderColor: 'border.default',
              alignItems: 'center',
              bg: 'canvas.subtle',
            }}
          >
            {/* Tools Menu */}
            {showToolsMenu && (
              <ToolsMenu
                codemodeEnabled={codemodeEnabled}
                mcpServers={mcpServers}
                enabledMcpTools={enabledMcpTools}
                enabledMcpToolCount={enabledMcpToolCount}
                onToggleMcpTool={onToggleMcpTool}
                onToggleAllMcpServerTools={onToggleAllMcpServerTools}
                availableTools={availableTools}
              />
            )}

            {/* Skills Menu */}
            {showSkillsMenu && (
              <SkillsMenu
                skills={skills}
                skillsLoading={skillsLoading}
                enabledSkills={enabledSkills}
                onToggleSkill={onToggleSkill}
                onToggleAllSkills={onToggleAllSkills}
              />
            )}

            {/* Model Selector */}
            {showModelSelector && models.length > 0 && selectedModel && (
              <ModelSelector
                models={models}
                selectedModel={selectedModel}
                onModelSelect={onModelSelect}
                isA2AProtocol={isA2AProtocol}
              />
            )}
          </Box>
        )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// ToolsMenu (private sub-component)
// ---------------------------------------------------------------------------

function ToolsMenu({
  codemodeEnabled,
  mcpServers,
  enabledMcpTools,
  enabledMcpToolCount,
  onToggleMcpTool,
  onToggleAllMcpServerTools,
  availableTools,
}: {
  codemodeEnabled: boolean;
  mcpServers: MCPServerConfig[];
  enabledMcpTools: Map<string, Set<string>>;
  enabledMcpToolCount: number;
  onToggleMcpTool: (serverId: string, toolName: string) => void;
  onToggleAllMcpServerTools: (
    serverId: string,
    toolNames: string[],
    enable: boolean,
  ) => void;
  availableTools: BuiltinTool[];
}) {
  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        <Button
          type="button"
          variant="invisible"
          size="small"
          leadingVisual={ToolsIcon}
        >
          <Text sx={{ fontSize: 0 }}>
            Tools
            {enabledMcpToolCount > 0 && ` (${enabledMcpToolCount})`}
          </Text>
        </Button>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay side="outside-top" align="start" width="large">
        <Box sx={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <ActionList>
            {codemodeEnabled && (
              <ActionList.Group title="Codemode">
                <ActionList.Item disabled>
                  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                    MCP tools are accessible via Codemode meta-tools
                    (search_tools, list_tool_names, execute_code).
                  </Text>
                </ActionList.Item>
              </ActionList.Group>
            )}
            {/* MCP Server Tools */}
            {mcpServers.length > 0 ? (
              mcpServers.map(server => {
                const serverTools = enabledMcpTools.get(server.id);
                const allToolNames = server.tools.map(t => t.name);
                const enabledCount = serverTools?.size ?? 0;
                const allEnabled =
                  enabledCount === allToolNames.length &&
                  allToolNames.length > 0;
                return (
                  <ActionList.Group
                    key={server.id}
                    title={`${server.name}${server.isAvailable ? '' : ' (unavailable)'}`}
                  >
                    {/* Server-level toggle */}
                    {server.isAvailable && server.tools.length > 0 && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          px: 3,
                          py: 2,
                          borderBottom: '1px solid',
                          borderColor: 'border.muted',
                        }}
                      >
                        <Text
                          id={`toggle-all-${server.id}`}
                          sx={{
                            fontSize: 0,
                            fontWeight: 'semibold',
                            color: 'fg.muted',
                          }}
                        >
                          Enable all ({enabledCount}/{allToolNames.length})
                        </Text>
                        <ToggleSwitch
                          size="small"
                          checked={allEnabled}
                          onClick={() =>
                            onToggleAllMcpServerTools(
                              server.id,
                              allToolNames,
                              !allEnabled,
                            )
                          }
                          aria-labelledby={`toggle-all-${server.id}`}
                        />
                      </Box>
                    )}
                    {server.isAvailable && server.tools.length > 0 ? (
                      server.tools.map(tool => {
                        const isEnabled = serverTools?.has(tool.name) ?? false;
                        return (
                          <Box
                            key={`${server.id}-${tool.name}`}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              px: 3,
                              py: 2,
                              '&:hover': {
                                backgroundColor: 'canvas.subtle',
                              },
                            }}
                          >
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Text
                                id={`toggle-tool-${server.id}-${tool.name}`}
                                sx={{ fontWeight: 'semibold' }}
                              >
                                {tool.name}
                              </Text>
                              {tool.description && (
                                <Text
                                  sx={{
                                    display: 'block',
                                    fontSize: 0,
                                    color: 'fg.muted',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {tool.description}
                                </Text>
                              )}
                            </Box>
                            <ToggleSwitch
                              size="small"
                              checked={isEnabled}
                              onClick={() =>
                                onToggleMcpTool(server.id, tool.name)
                              }
                              aria-labelledby={`toggle-tool-${server.id}-${tool.name}`}
                            />
                          </Box>
                        );
                      })
                    ) : server.isAvailable ? (
                      <ActionList.Item disabled>
                        <Text sx={{ color: 'fg.muted', fontStyle: 'italic' }}>
                          No tools discovered
                        </Text>
                      </ActionList.Item>
                    ) : (
                      <ActionList.Item disabled>
                        <Text sx={{ color: 'fg.muted', fontStyle: 'italic' }}>
                          Server unavailable
                        </Text>
                      </ActionList.Item>
                    )}
                  </ActionList.Group>
                );
              })
            ) : (
              <ActionList.Group title="Available Tools">
                {availableTools.length > 0 ? (
                  availableTools.map(tool => (
                    <ActionList.Item key={tool.id} disabled>
                      <ActionList.LeadingVisual>
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: 'success.emphasis',
                          }}
                        />
                      </ActionList.LeadingVisual>
                      {tool.name}
                    </ActionList.Item>
                  ))
                ) : (
                  <ActionList.Item disabled>
                    <Text sx={{ color: 'fg.muted', fontStyle: 'italic' }}>
                      No tools available
                    </Text>
                  </ActionList.Item>
                )}
              </ActionList.Group>
            )}
          </ActionList>
        </Box>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

// ---------------------------------------------------------------------------
// SkillsMenu (private sub-component)
// ---------------------------------------------------------------------------

function SkillsMenu({
  skills,
  skillsLoading,
  enabledSkills,
  onToggleSkill,
  onToggleAllSkills,
}: {
  skills: SkillInfo[];
  skillsLoading: boolean;
  enabledSkills: Set<string>;
  onToggleSkill: (skillId: string) => void;
  onToggleAllSkills: (skillIds: string[], enable: boolean) => void;
}) {
  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        <Button
          type="button"
          variant="invisible"
          size="small"
          leadingVisual={BriefcaseIcon}
        >
          <Text sx={{ fontSize: 0 }}>
            Skills
            {enabledSkills.size > 0 && ` (${enabledSkills.size})`}
          </Text>
        </Button>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay side="outside-top" align="start" width="large">
        <Box sx={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <ActionList>
            {skillsLoading ? (
              <ActionList.Item disabled>
                <Text sx={{ color: 'fg.muted' }}>Loading skills...</Text>
              </ActionList.Item>
            ) : skills.length > 0 ? (
              <>
                {/* Enable all toggle */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 3,
                    py: 2,
                    borderBottom: '1px solid',
                    borderColor: 'border.muted',
                  }}
                >
                  <Text
                    id="toggle-all-skills"
                    sx={{
                      fontSize: 0,
                      fontWeight: 'semibold',
                      color: 'fg.muted',
                    }}
                  >
                    Enable all ({enabledSkills.size}/{skills.length})
                  </Text>
                  <ToggleSwitch
                    size="small"
                    checked={enabledSkills.size === skills.length}
                    onClick={() =>
                      onToggleAllSkills(
                        skills.map(s => s.id),
                        enabledSkills.size !== skills.length,
                      )
                    }
                    aria-labelledby="toggle-all-skills"
                  />
                </Box>
                {skills.map(skill => (
                  <Box
                    key={skill.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 3,
                      py: 2,
                      '&:hover': {
                        backgroundColor: 'canvas.subtle',
                      },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Text
                        id={`toggle-skill-${skill.id}`}
                        sx={{ fontWeight: 'semibold' }}
                      >
                        {skill.name}
                      </Text>
                      {skill.description && (
                        <Text
                          sx={{
                            display: 'block',
                            fontSize: 0,
                            color: 'fg.muted',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {skill.description}
                        </Text>
                      )}
                    </Box>
                    <ToggleSwitch
                      size="small"
                      checked={enabledSkills.has(skill.id)}
                      onClick={() => onToggleSkill(skill.id)}
                      aria-labelledby={`toggle-skill-${skill.id}`}
                    />
                  </Box>
                ))}
              </>
            ) : (
              <ActionList.Item disabled>
                <Text sx={{ color: 'fg.muted', fontStyle: 'italic' }}>
                  No skills available
                </Text>
              </ActionList.Item>
            )}
          </ActionList>
        </Box>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

// ---------------------------------------------------------------------------
// ModelSelector (private sub-component)
// ---------------------------------------------------------------------------

function ModelSelector({
  models,
  selectedModel,
  onModelSelect,
  isA2AProtocol,
}: {
  models: ModelConfig[];
  selectedModel: string;
  onModelSelect: (modelId: string) => void;
  isA2AProtocol: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
      }}
    >
      <ActionMenu>
        <ActionMenu.Anchor>
          <Button
            type="button"
            variant="invisible"
            size="small"
            leadingVisual={AiModelIcon}
            disabled={isA2AProtocol}
            sx={
              isA2AProtocol
                ? { opacity: 0.5, cursor: 'not-allowed' }
                : undefined
            }
          >
            <Text sx={{ fontSize: 0 }}>
              {models.find(m => m.id === selectedModel)?.name || 'Select Model'}
            </Text>
          </Button>
        </ActionMenu.Anchor>
        <ActionMenu.Overlay side="outside-top" align="end">
          <ActionList selectionVariant="single">
            {models.map(modelItem => (
              <ActionList.Item
                key={modelItem.id}
                selected={selectedModel === modelItem.id}
                onSelect={() => onModelSelect(modelItem.id)}
                disabled={modelItem.isAvailable === false || isA2AProtocol}
                sx={
                  modelItem.isAvailable === false
                    ? { color: 'fg.muted' }
                    : undefined
                }
              >
                {modelItem.name}
                {modelItem.isAvailable === false && (
                  <ActionList.Description variant="block">
                    Missing API key
                  </ActionList.Description>
                )}
              </ActionList.Item>
            ))}
          </ActionList>
        </ActionMenu.Overlay>
      </ActionMenu>
      {isA2AProtocol && (
        <Text sx={{ fontSize: 0, color: 'attention.fg', mt: 1 }}>
          A2A: Model set by agent config
        </Text>
      )}
    </Box>
  );
}
