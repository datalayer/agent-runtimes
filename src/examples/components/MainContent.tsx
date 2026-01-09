/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { JupyterReactTheme, Viewer } from '@datalayer/jupyter-react';
import type { ServiceManager } from '@jupyterlab/services';
import matplotlib from '../stores/notebooks/Matplotlib.ipynb.json';
import emptyNotebook from '../stores/notebooks/Empty.ipynb.json';
import { TimeTravel } from './TimeTravel';
import { LexicalEditor } from './LexicalEditor';

interface MainContentProps {
  showNotebook: boolean;
  timeTravel: number;
  onTimeTravelChange: (value: number) => void;
  richEditor: boolean;
  notebookFile?: string;
  lexicalFile?: string;
  isNewAgent?: boolean;
  serviceManager?: ServiceManager.IManager;
}

/**
 * Main Content Component
 *
 * Displays the main content area with Simple notebook viewer or Lexical editor and time travel.
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
      import(/* @vite-ignore */ `../stores/agents/${notebookFile}`)
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
      import(/* @vite-ignore */ `../stores/agents/${lexicalFile}`)
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
