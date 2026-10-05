/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The notebook a member of the team gave, on the browser sandbox.
 *
 * What the loop's notebook view does (`loop/plugins/notebook/NotebookView`),
 * for a notebook that arrived over A2A: the browser sandbox
 * (`createBrowserSandboxService`, a JupyterLite Pyodide kernel in the page)
 * is started, and `EphemeralNotebook` is bound to its manager and its
 * kernel. Nothing runs anywhere but in the reader's browser.
 *
 * Loaded by `TeamNotebook` when a notebook is drawn, never before.
 *
 * @module components/teams/TeamNotebookView
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { INotebookContent } from '@jupyterlab/nbformat';
import type { ServiceManager } from '@jupyterlab/services';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DownloadIcon } from '@primer/octicons-react';
import { Button, Flash, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { useSignalValue } from '@datalayer/reactor/react';
import { notebookStore } from '@datalayer/jupyter-react';
import { EphemeralNotebook } from '../../chat/notebook/EphemeralNotebook';
import { createBrowserSandboxService } from '../../loop/plugins/agents/browserService';
import { teamNotebookKernel } from './teamNotebookKernel';
import type { A2APeerArtifact } from '../../runtimes/browser/a2aPeer';

export type TeamNotebookViewProps = {
  notebook: A2APeerArtifact;
  /** The file it is saved as. */
  fileName: string;
  height: number;
};

/** Each notebook drawn has its own id in jupyter-react's store. */
let drawn = 0;

/** Save a notebook as an `.ipynb` file, as Jupyter writes one. */
function download(content: unknown, fileName: string): void {
  const text = `${JSON.stringify(content, null, 1)}\n`;
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/x-ipynb+json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function TeamNotebookView({
  notebook,
  fileName,
  height,
}: TeamNotebookViewProps): JSX.Element {
  // One sandbox for the view: a notebook that replaces another runs on the
  // same kernel, already started.
  const service = useMemo(() => createBrowserSandboxService(), []);
  const snapshot = useSignalValue(service.snapshot);
  const [failed, setFailed] = useState<string | null>(null);
  // The notebook's store needs a query client; this view asks it nothing.
  const queries = useMemo(() => new QueryClient(), []);

  useEffect(() => {
    const disconnect = service.connect();
    return disconnect;
  }, [service]);

  useEffect(() => {
    if (snapshot.state === 'error') {
      setFailed(
        'Python could not start in this browser, so the notebook cannot run here. Download it to open it in Jupyter.',
      );
    }
  }, [snapshot.state]);

  // A new id for each notebook given: the notebook component keeps the
  // document it is first handed.
  const notebookId = useMemo(() => {
    drawn += 1;
    return `team-notebook-${drawn}`;
  }, [notebook]);
  const content = notebook.data as INotebookContent;
  // Handed once: the component edits it in place.
  const opening = useMemo(
    () => JSON.parse(JSON.stringify(content)) as INotebookContent,
    [content],
  );

  const save = () => {
    // What the reader has made of it, when it is open; as it came otherwise.
    const model = notebookStore
      .getState()
      .selectNotebook(notebookId)
      ?.model?.toJSON();
    download(model ?? content, fileName);
  };

  const manager =
    (service.getServiceManager() as ServiceManager.IManager | null) ??
    undefined;
  const running = snapshot.state === 'running' && manager !== undefined;

  // Say which kernel the notebook runs on, while it does: the browser
  // agent's *Code Sandbox Details…* lists its variables.
  useEffect(() => {
    const kernel = running ? service.getKernelConnection() : null;
    if (!kernel) {
      return;
    }
    teamNotebookKernel.value = kernel;
    return () => {
      if (teamNotebookKernel.peek() === kernel) {
        teamNotebookKernel.value = null;
      }
    };
  }, [running, service]);

  return (
    <QueryClientProvider client={queries}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Text sx={{ color: 'fg.muted', fontSize: 1, flex: '1 1 auto' }}>
            {running
              ? 'It runs in your browser, with Python (Pyodide): run its cells, change them, add your own.'
              : 'Starting Python in your browser…'}
          </Text>
          <Button
            size="small"
            leadingVisual={DownloadIcon}
            onClick={save}
            data-team-notebook-download=""
          >
            Download .ipynb
          </Button>
        </Box>
        {failed && <Flash variant="warning">{failed}</Flash>}
        <Box
          data-team-notebook-sheet=""
          sx={{
            position: 'relative',
            height,
            minHeight: 0,
            border: '1px solid',
            borderColor: 'border.default',
            borderRadius: 2,
            overflow: 'hidden',
            // As the loop's notebook view pins them: Lumino sizes these
            // itself, and a resize it never hears of leaves them at zero.
            '& .jp-NotebookPanel': {
              height: '100% !important',
              minHeight: 0,
            },
            '& .dla-Box-Notebook': {
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            },
          }}
        >
          {running && (
            <EphemeralNotebook
              key={notebookId}
              notebookId={notebookId}
              nbformat={opening}
              inheritTheme
              serviceManager={manager}
              // Join the sandbox's kernel rather than starting a rival one.
              kernelId={snapshot.kernelId}
            />
          )}
        </Box>
      </Box>
    </QueryClientProvider>
  );
}

export default TeamNotebookView;
