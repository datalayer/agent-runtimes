/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A notebook a member of the team gave, open in the page to run.
 *
 * What a peer gives besides words arrives as an artifact by media type
 * (`a2aPeer`'s {@link A2APeerArtifact}); a Jupyter notebook
 * (`application/x-ipynb+json`) is shown here, as the loop's notebook view
 * shows one: jupyter-react's notebook on the browser sandbox, a Pyodide
 * kernel in the page, where the reader runs cells, edits them and adds more.
 * It runs in the reader's browser and costs nothing elsewhere.
 *
 * This module is light: the notebook, JupyterLab and Pyodide are in
 * `TeamNotebookView`, imported only once a notebook is drawn, so that a page
 * that shows a team — the landing's home page — loads none of them until a
 * notebook arrives.
 *
 * @module components/teams/TeamNotebook
 */

import type { JSX } from 'react';
import { Suspense, lazy } from 'react';
import { Heading, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { A2APeerArtifact } from '../../runtimes/browser/a2aPeer';
import type { BalloonVisual } from '../../chat/assistant/BalloonVisual';

/** The view itself: jupyter-react, JupyterLab and Pyodide, loaded when a notebook is drawn. */
const TeamNotebookView = lazy(() => import('./TeamNotebookView'));

export type TeamNotebookProps = {
  /** The notebook, as the peer gave it: its `data` is the nbformat document. */
  notebook: A2APeerArtifact;
  /** What the section is called: `Accounting's notebook`. */
  title: string;
  /** How tall the notebook is, in pixels. */
  height?: number;
  /** Leave the heading out: the dialog it is drawn in shows the title. */
  hideTitle?: boolean;
};

/** The file a notebook is saved as: the peer's name for it, else its name. */
export function notebookFileName(notebook: A2APeerArtifact): string {
  if (notebook.filename) {
    return notebook.filename;
  }
  const stem =
    notebook.name
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'notebook';
  return `${stem}.ipynb`;
}

/** A notebook a member of the team gave, under its title, to run in the page. */
export function TeamNotebook({
  notebook,
  title,
  height = 560,
  hideTitle = false,
}: TeamNotebookProps): JSX.Element {
  return (
    <Box
      as="section"
      aria-label={title}
      data-team-notebook=""
      // Focused when the notebook in a balloon is clicked (`focusExpanded`).
      tabIndex={-1}
      display="flex"
      flexDirection="column"
      gap={2}
      minWidth={0}
      scrollMarginTop="16px"
      focus={{ outline: 'none' }}
      focusVisible={{
        outline: '2px solid',
        outlineColor: 'var(--focus-outlineColor, var(--fgColor-accent))',
        outlineOffset: 4,
        borderRadius: 2,
      }}
    >
      {!hideTitle && (
        <Heading as="h3" sx={{ fontSize: 2, m: 0 }}>
          {title}
        </Heading>
      )}
      <Suspense
        fallback={
          <Text as="p" sx={{ color: 'fg.muted', fontSize: 1, m: 0 }}>
            Opening the notebook…
          </Text>
        }
      >
        <TeamNotebookView
          notebook={notebook}
          fileName={notebookFileName(notebook)}
          height={height}
        />
      </Suspense>
    </Box>
  );
}

/**
 * A notebook as a balloon's large visual: read-only in the balloon, and,
 * expanded, this notebook — editable, run on the browser sandbox, loaded
 * only then.
 */
export function notebookBalloonVisual(
  notebook: A2APeerArtifact,
  title: string,
  height?: number,
): BalloonVisual {
  return {
    id: `notebook:${notebook.filename ?? notebook.name}`,
    title,
    render: place => (
      <TeamNotebook
        notebook={notebook}
        title={title}
        height={height}
        hideTitle={place === 'overlay'}
      />
    ),
  };
}

export default TeamNotebook;
