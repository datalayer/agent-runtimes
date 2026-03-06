/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Dynamic tool display component.
 * Renders dynamic tool UI parts with placeholder/warning styling.
 *
 * @module components/chat/components/display/DynamicToolPart
 */

import type { DynamicToolUIPart } from 'ai';
import { Text, Flash } from '@primer/react';

export interface DynamicToolPartProps {
  /** Dynamic tool UI part data */
  part: DynamicToolUIPart;
}

/**
 * DynamicToolPart component for displaying dynamic tool UI.
 *
 * This is a placeholder component that displays a warning flash
 * for dynamic tool parts. In a production application, this would
 * render custom UI based on the tool's specification.
 */
export function DynamicToolPart({ part }: DynamicToolPartProps) {
  return (
    <Flash variant="warning" sx={{ marginBottom: 2 }}>
      <Text>Dynamic Tool: {JSON.stringify(part)}</Text>
    </Flash>
  );
}

export default DynamicToolPart;
