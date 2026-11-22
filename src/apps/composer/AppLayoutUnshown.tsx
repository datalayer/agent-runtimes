/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * On the Canvas, when the page it composes is not shown: agent-runtimes'
 * sentence, and the fix in one click — the layout set to `page` through the
 * Canvas's own edit.
 *
 * @module apps/composer/AppLayoutUnshown
 */

import type { JSX } from 'react';
import { Button, Flash, Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import type { AppDraft } from './draft';
import { layoutUnshown, withLayout } from './appLayout';
import { VERDICT_TONES } from './tones';

export type AppLayoutUnshownProps = {
  definition: AppDraft;
  disabled?: boolean;
  onChange: (next: AppDraft) => void;
};

export function AppLayoutUnshown({
  definition,
  disabled = false,
  onChange,
}: AppLayoutUnshownProps): JSX.Element | null {
  const unshown = layoutUnshown(definition);
  if (!unshown) {
    return null;
  }
  return (
    // Something to decide before it ships: *Needs attention*'s colour.
    <Flash variant={VERDICT_TONES['Needs attention'].flash} sx={{ mb: 3 }}>
      <Box display="flex" gap={3} alignItems="center" flexWrap="wrap">
        <Text sx={{ flex: '1 1 240px' }}>{unshown}</Text>
        <Button
          size="small"
          disabled={disabled}
          onClick={() => onChange(withLayout(definition, 'page'))}
        >
          Show the page
        </Button>
      </Box>
    </Flash>
  );
}

export default AppLayoutUnshown;
