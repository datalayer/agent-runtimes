/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Where an application written in Python decides something:
 * `save, app.py line 23` — a link that shows that line in the Python tab when
 * the application's item keeps its file; said, not linked, otherwise. Drawn
 * by the Canvas, and by the Build tab's cards over what its code decides of
 * the Personal Agent Protocol.
 *
 * @module apps/composer/AppCodeWhere
 */

import type { JSX } from 'react';
import { Link } from '@primer/react';
import { whereWords, type CodeMark } from './appCode';

export function CodeWhere({
  mark,
  openLine,
}: {
  mark: CodeMark;
  openLine?: (line: number) => void;
}): JSX.Element {
  const line = mark.line;
  if (line === null || !openLine) {
    return <>{whereWords(mark)}</>;
  }
  return (
    <Link
      as="button"
      type="button"
      onClick={() => openLine(line)}
      sx={{ fontSize: 'inherit' }}
    >
      {whereWords(mark)}
    </Link>
  );
}

export default CodeWhere;
