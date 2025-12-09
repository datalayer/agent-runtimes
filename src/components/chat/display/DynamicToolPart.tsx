/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { DynamicToolUIPart } from 'ai';
import { Text, Flash } from '@primer/react';

interface IDynamicToolPartProps {
  part: DynamicToolUIPart;
}

export function DynamicToolPart({ part }: IDynamicToolPartProps) {
  return (
    <Flash variant="warning" sx={{ marginBottom: 2 }}>
      <Text>Dynamic Tool: {JSON.stringify(part)}</Text>
    </Flash>
  );
}
