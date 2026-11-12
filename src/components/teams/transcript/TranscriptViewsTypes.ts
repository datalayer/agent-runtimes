/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What the three views share: the lines. In its own module so that the
 * table and the diagram say the same shape without reading each other.
 *
 * @module components/teams/transcript/TranscriptViewsTypes
 */

import type { SceneTranscriptLine } from '../sceneTranscriptRules';

/** The lines a view draws, in order: already filtered. */
export type TranscriptRowsLines = {
  lines: readonly SceneTranscriptLine[];
};

/** Which of the three views shows. */
export type TranscriptViewChoice = 'lines' | 'table' | 'sequence';
