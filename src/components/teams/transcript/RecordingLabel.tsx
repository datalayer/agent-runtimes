/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The label a recording plays under: *Recording, taken 29 October 2026*,
 * so that nobody takes it for the scene playing live. Its note, when the
 * recording has one, is the label's title.
 *
 * @module components/teams/transcript/RecordingLabel
 */

import type { JSX } from 'react';
import { Label } from '@primer/react';
import { recordingLabel } from './recordingPlayback';

export type RecordingLabelProps = {
  /** When it was taken: `2026-10-29`. */
  taken?: string;
  /** What the audience is told of it. */
  note?: string;
  size?: 'small' | 'large';
};

export function RecordingLabel({
  taken,
  note,
  size = 'small',
}: RecordingLabelProps): JSX.Element {
  return (
    <Label
      variant="attention"
      size={size}
      title={note}
      data-scene-recording-label={taken ?? ''}
    >
      {recordingLabel(taken)}
    </Label>
  );
}

export default RecordingLabel;
