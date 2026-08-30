/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What an `@agent` looks like in the prompt.
 *
 * Its own module because `MentionNode.decorate` returns it and a Lexical node
 * file that also carried a styled component would be two things at once.
 *
 * @module chat/prompt/plugins/MentionChip
 */

import { Box } from '@datalayer/primer-addons';
import type { Icon } from '@primer/octicons-react';

export function MentionChip({
  name,
  icon: IconComponent,
}: {
  name: string;
  icon?: Icon;
}): JSX.Element {
  return (
    <Box
      as="span"
      // `contentEditable={false}` is what stops the caret entering it: without
      // it a person can put the cursor between the icon and the name and type
      // into a mention.
      contentEditable={false}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        px: 1,
        py: '1px',
        mx: '1px',
        borderRadius: 6,
        bg: 'accent.subtle',
        color: 'accent.fg',
        fontSize: 1,
        lineHeight: 1.4,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      {IconComponent ? <IconComponent size={12} /> : null}
      {name}
    </Box>
  );
}

export default MentionChip;
