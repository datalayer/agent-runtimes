/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The notebook view: the ephemeral notebook, bound to the sandbox the base
 * plugin owns.
 *
 * @module loop/plugins/notebook/NotebookView
 */

import type { JSX } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import type { ServiceManager } from '@jupyterlab/services';
import { useSignalValue } from '@datalayer/reactor/react';
import { Box, Text } from '@primer/react';
import { EphemeralNotebook } from '../../../chat/notebook/EphemeralNotebook';
import {
  LoopNotebookToolbar,
  LoopNotebookToolbarItem,
  type ChatSurfaceProps,
} from '../../core';
import { useEditorToolbar } from '../../core/toolbar';
import { openingCode, openingNotebook } from './openingNotebook';
import { useSandboxService } from '../agents';

export default function NotebookView({
  workspace,
}: ChatSurfaceProps): JSX.Element {
  const service = useSandboxService();
  const snapshot = useSignalValue(service.snapshot);
  // Named once: it identifies the notebook to its store, and it is what a
  // toolbar item is handed so it can report on *this* notebook.
  const notebookId = workspace.surfaceId;

  // The toolbar is not this view's to draw. It offers the point, and a plugin
  // provides the bar; with that plugin switched off there is no toolbar here
  // at all, not an empty one. Items come from whoever adds to it — the toolbar
  // plugin's kernel light, the chat's agent actions — and this view names none
  // of them. It used to hardcode two buttons that submitted prompts, which
  // meant the notebook knew about the chat.
  const toolbar = useEditorToolbar(
    LoopNotebookToolbar,
    LoopNotebookToolbarItem,
    {
      workspace,
      editorId: notebookId,
    },
  );

  /*
   * One document per mount, built before anything can return.
   *
   * `EphemeralNotebook` holds on to the object it is first handed and edits it
   * in place, so a shared literal would be a shared notebook — hence the memo.
   * It sits up here with the other hooks because the guard below returns
   * early, and a hook after an early return runs on some renders and not
   * others, which is the one thing React cannot tolerate.
   */
  const opening = useMemo(() => openingNotebook(), []);

  /*
   * Run the opening cell on the sandbox, once it has one.
   *
   * The notebook opens showing that cell as already executed — `[1]`, with its
   * frame printed underneath — and until this runs, that is a picture of a
   * session rather than one: `sales` is on screen and undefined, so the first
   * thing the agent or the reader does with it raises `NameError`. Executing
   * the same source the cell displays makes the kernel agree with the page.
   *
   * Through the sandbox service rather than the notebook's own run command,
   * because the two share a kernel and only one of them exists this early: the
   * service is ready the moment the sandbox is, while the notebook is still
   * mounting its editor. The output goes to the service's own execution log,
   * so the cell keeps the result it was born with rather than gaining a second
   * copy.
   *
   * Keyed on the kernel, so a target switch — which is a new kernel — primes
   * the new one, and a re-render does not run it again.
   */
  const primed = useRef<string | null>(null);
  useEffect(() => {
    const kernelId = snapshot.kernelId;
    if (snapshot.state !== 'running' || !kernelId) {
      return;
    }
    if (primed.current === kernelId) {
      return;
    }
    primed.current = kernelId;
    void service.execute(openingCode()).catch((error: unknown) => {
      // Not worth a banner. The notebook still shows what it showed; what a
      // reader loses is the variable, and the agent will say so plainly the
      // first time it looks.
      console.warn('[loop] could not prime the opening cell', error);
    });
  }, [service, snapshot.state, snapshot.kernelId]);

  // The switcher's `canOpen` gate should have kept this view shut, but a
  // sandbox can go away while it is on screen — say so rather than rendering a
  // notebook wired to nothing.
  if (snapshot.state !== 'running') {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'fg.muted',
          fontSize: 1,
          px: 4,
          textAlign: 'center',
        }}
      >
        <Text>
          The notebook needs a running sandbox. Open the Sandbox view to see
          what it is doing.
        </Text>
      </Box>
    );
  }

  // A browser sandbox already owns its kernel; binding to that manager is what
  // puts the agent's executions and the reader's cells in the same one. A
  // server sandbox is reached by URL, as before, and returns null here.
  const browserManager =
    (service.getServiceManager() as ServiceManager.IManager | null) ??
    undefined;

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 0,
        /*
          A height for the Lumino widgets, forced.

          WORKAROUND, and knowingly a blunt one. The notebook renders inside a
          chain of Lumino widgets — `.jp-NotebookPanel` holds `.jp-Notebook`,
          which is absolutely positioned and therefore sized entirely by its
          parent. Lumino sets those sizes itself, from a resize it expects to
          be told about; when that message does not arrive, or arrives before
          the panel has a box of its own, the parent measures zero and the
          absolutely positioned notebook inside it has nothing to fill. The
          cells are in the DOM the whole time. Nothing is on screen.

          It is intermittent, which is what makes it worth a hack: measured
          side by side on a good load, every element here — panel, notebook,
          cell, editor — has exactly the geometry it has locally, so there is
          no wrong number to correct, only a number that sometimes never
          arrives. Declaring it in CSS means the browser resolves it on layout
          whether or not Lumino ever says anything.

          `!important` because Lumino writes its own inline sizes and would
          otherwise win. Scoped to this view, so it is the LOOP workspace's
          notebook that is pinned and not every notebook in the package — the
          real fix belongs in the widget layer, and this must not make that
          harder to find.
        */
        '& .jp-NotebookPanel': {
          height: '100% !important',
          minHeight: 0,
        },
        /* The panel is the only thing between the flex column above and the
           absolutely positioned notebook below, so it has to be a box that
           fills rather than one that wraps its content. */
        '& .dla-Box-Notebook': {
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        },
      }}
    >
      <EphemeralNotebook
        /*
          Opened on a small analysis that has already run, not on a blank cell.

          Every opener this agent offers refers to "this notebook" — analyze
          this dataset, find the anomalies, plot revenue by region — and
          against an empty document those are questions with no answer. Built
          once per mount: the notebook component keeps the object it is given
          and edits it in place.
        */
        nbformat={opening}
        // The entry point owns the theme; a second provider here would fight
        // it over BaseStyles and font tokens (§3.5, §3.6).
        inheritTheme
        notebookId={notebookId}
        serviceManager={browserManager}
        // Join the sandbox's kernel rather than starting a rival one.
        kernelId={browserManager ? snapshot.kernelId : undefined}
        showToolbar={toolbar.present}
        toolbarExtraItems={toolbar.items}
        runtimeOverride={
          !browserManager && snapshot.jupyterUrl
            ? {
                baseUrl: snapshot.jupyterUrl,
                // Without the token the server refuses every request and the
                // cell runs into silence — no kernel, no output, no error the
                // reader can act on.
                token: snapshot.jupyterToken,
              }
            : undefined
        }
      />
    </Box>
  );
}
