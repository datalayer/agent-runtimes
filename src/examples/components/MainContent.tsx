/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { JupyterReactTheme, Viewer } from '@datalayer/jupyter-react';
import type { ServiceManager } from '@jupyterlab/services';
import { TimeTravel } from './TimeTravel';
import { LexicalEditor } from './LexicalEditor';
import {
  McpServerManager,
  type McpServerSelection,
} from '../../components/McpServerManager';

import matplotlib from '../stores/notebooks/NotebookExample2.ipynb.json';
import emptyNotebook from '../stores/notebooks/Empty.ipynb.json';

export interface MainContentProps {
  showNotebook: boolean;
  timeTravel: number;
  onTimeTravelChange: (value: number) => void;
  richEditor: boolean;
  notebookFile?: string;
  lexicalFile?: string;
  isNewAgent?: boolean;
  serviceManager?: ServiceManager.IManager;
  /** Base URL for MCP API */
  baseUrl?: string;
  /** Agent ID for updating the running agent */
  agentId?: string;
  /** Whether codemode is enabled */
  enableCodemode?: boolean;
  /** Currently selected MCP servers */
  selectedMcpServers?: McpServerSelection[];
  /** Callback when MCP server selection changes */
  onSelectedMcpServersChange?: (servers: McpServerSelection[]) => void;
  /** Callback when MCP servers are added/removed (for codemode regeneration) */
  onMcpServersChange?: () => void;
  /** Whether the agent is configured and running */
  isConfigured?: boolean;
}

/**
 * Main Content Component
 *
 * Displays the main content area with Simple notebook viewer or Lexical editor and time travel.
 * When an agent is running (isConfigured=true), also shows the MCP Server Manager for runtime management.
 */
export const MainContent: React.FC<MainContentProps> = ({
  showNotebook,
  timeTravel,
  onTimeTravelChange,
  richEditor,
  notebookFile,
  lexicalFile,
  isNewAgent,
  serviceManager,
  baseUrl,
  agentId,
  enableCodemode,
  selectedMcpServers,
  onSelectedMcpServersChange,
  onMcpServersChange,
  isConfigured,
}) => {
  // Use the provided notebook or fall back to matplotlib demo
  const [notebookData, setNotebookData] = React.useState<any>(matplotlib);
  const [lexicalContent, setLexicalContent] = React.useState<
    string | undefined
  >(undefined);

  React.useEffect(() => {
    if (isNewAgent) {
      // Use empty notebook for new agent
      setNotebookData(emptyNotebook);
      setLexicalContent(undefined);
    } else if (notebookFile) {
      // Dynamically import the notebook based on the file name
      import(
        /* webpackIgnore: true */ /* @vite-ignore */ `../stores/agents/${notebookFile}`
      )
        .then(module => {
          setNotebookData(module.default);
        })
        .catch(() => {
          // If the file doesn't exist, use matplotlib as fallback
          setNotebookData(matplotlib);
        });
    } else {
      setNotebookData(matplotlib);
    }
  }, [notebookFile, isNewAgent]);

  React.useEffect(() => {
    if (lexicalFile && !isNewAgent) {
      // Dynamically import the lexical file based on the file name
      import(
        /* webpackIgnore: true */ /* @vite-ignore */ `../stores/agents/${lexicalFile}`
      )
        .then(module => {
          // Convert the JSON to a string if needed
          setLexicalContent(
            typeof module.default === 'string'
              ? module.default
              : JSON.stringify(module.default),
          );
        })
        .catch(() => {
          setLexicalContent(undefined);
        });
    } else {
      setLexicalContent(undefined);
    }
  }, [lexicalFile, isNewAgent]);

  return (
    <Box sx={{ height: '100%', overflow: 'auto', padding: 3 }}>
      {/* MCP Server Manager - shown when agent is running */}
      {isConfigured && baseUrl && (
        <Box
          sx={{
            mb: 4,
            p: 3,
            bg: 'canvas.subtle',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'border.default',
          }}
        >
          <McpServerManager
            baseUrl={baseUrl}
            agentId={agentId}
            enableCodemode={enableCodemode}
            selectedServers={selectedMcpServers}
            onSelectedServersChange={onSelectedMcpServersChange}
            onServersChange={onMcpServersChange}
            disabled={false}
          />
        </Box>
      )}

      {showNotebook ? (
        <>
          {richEditor ? (
            <LexicalEditor
              serviceManager={serviceManager}
              content={lexicalContent}
            />
          ) : (
            <JupyterReactTheme>
              <Viewer nbformat={notebookData} outputs />
            </JupyterReactTheme>
          )}
          {!isNewAgent && (
            <TimeTravel value={timeTravel} onChange={onTimeTravelChange} />
          )}
        </>
      ) : (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
          }}
        >
          <Text sx={{ color: 'fg.muted' }}>
            Select a file to view or create a new notebook
          </Text>
        </Box>
      )}
    </Box>
  );
};
