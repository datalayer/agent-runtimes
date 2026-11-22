/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An editor, the application's Python file and its Preview under one switch —
 * *Editor* · *Python* · *Preview* — as the Canvas has *Agent* · *Layout* ·
 * *Python* · *Preview*: the YAML written, the application written in Python,
 * and the application running as it is now. The Python editor has it too,
 * as *Eject* (or *Python*) · *Preview*.
 *
 * All stay mounted: what was said to the Preview is kept while the Maker
 * edits, and each editor keeps its cursor and its scroll while they try it.
 *
 * @module apps/composer/AppEditorWithPreview
 */

import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { SegmentedControl, Text } from '@primer/react';
import { FileCodeIcon, PlayIcon } from '@primer/octicons-react';
import { PythonIcon } from '@datalayer/icons-react';
import { Box } from '@datalayer/primer-addons';

export type Surface = 'editor' | 'python' | 'preview';

/**
 * The tabs there are, in their order: the editor always, then what is given.
 * The switch draws exactly these, one button each, so that the index Primer's
 * SegmentedControl reports is an index of this list. Before 27 October 2026
 * the buttons were drawn with a `null` in place of a missing *Python*, and
 * Primer counts that slot: the Python editor's *Preview* (index 2) named no
 * surface, and nothing was shown.
 */
export const surfacesOf = (python: boolean, preview: boolean): Surface[] => [
  'editor',
  ...(python ? (['python'] as const) : []),
  ...(preview ? (['preview'] as const) : []),
];

/** The surface the switch's `index` names, the editor for one it does not. */
export const surfaceAt = (
  surfaces: readonly Surface[],
  index: number,
): Surface => surfaces[index] ?? 'editor';

export type AppEditorWithPreviewProps = {
  /** The editor. */
  editor: ReactNode;
  /** The application written as a Python file; none, and no Python tab. */
  python?: ReactNode;
  /** The application running as it is built; none, and no Preview tab. */
  preview?: ReactNode;
  /** Open on the Python file: a line of it was linked to. */
  openOnPython?: boolean;
  /** Open on the Preview: it was linked to. */
  openOnPreview?: boolean;
  /**
   * The editor's tab, when it is not the YAML's *Editor*: the Python editor
   * names it *Eject* or *Python*, by whether the application has a file.
   */
  editorTab?: { label: string; icon: typeof PythonIcon; hint: string };
};

const HINTS: Record<Surface, string> = {
  editor: 'The application as it is written.',
  python:
    'The application written in Python: what the file builds is the application.',
  preview:
    'The application running as it is now: try it as a person would, then save what you tried as a test.',
};

export function AppEditorWithPreview({
  editor,
  python,
  preview,
  openOnPython = false,
  openOnPreview = false,
  editorTab,
}: AppEditorWithPreviewProps): JSX.Element {
  const surfaces = surfacesOf(Boolean(python), Boolean(preview));
  const [surface, setSurface] = useState<Surface>(
    openOnPython && python
      ? 'python'
      : openOnPreview && preview
        ? 'preview'
        : 'editor',
  );
  if (surfaces.length === 1) {
    return <>{editor}</>;
  }
  return (
    <Box data-editor-surface={surface}>
      <Box display="flex" alignItems="center" gap={3} mb={2} flexWrap="wrap">
        <SegmentedControl
          aria-label={`${editorTab?.label ?? 'Editor'}${python ? ', Python' : ''} or Preview`}
          size="small"
          onChange={index => setSurface(surfaceAt(surfaces, index))}
        >
          {/* One button per surface, none left out as `null`: the index is the list's (`surfacesOf`). */}
          {surfaces.map(each =>
            each === 'editor' ? (
              <SegmentedControl.Button
                key={each}
                selected={surface === each}
                leadingIcon={editorTab?.icon ?? FileCodeIcon}
              >
                {editorTab?.label ?? 'Editor'}
              </SegmentedControl.Button>
            ) : each === 'python' ? (
              <SegmentedControl.Button
                key={each}
                selected={surface === each}
                leadingIcon={PythonIcon}
              >
                Python
              </SegmentedControl.Button>
            ) : (
              <SegmentedControl.Button
                key={each}
                selected={surface === each}
                leadingIcon={PlayIcon}
              >
                Preview
              </SegmentedControl.Button>
            ),
          )}
        </SegmentedControl>
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          {surface === 'editor' && editorTab ? editorTab.hint : HINTS[surface]}
        </Text>
      </Box>
      <Box hidden={surface !== 'editor'}>{editor}</Box>
      {python ? <Box hidden={surface !== 'python'}>{python}</Box> : null}
      {preview ? <Box hidden={surface !== 'preview'}>{preview}</Box> : null}
    </Box>
  );
}

export default AppEditorWithPreview;
