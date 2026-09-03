/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The standard composer: the assembled props, rendered by `InputPrompt`.
 *
 * In a file of its own so the plugin's module stays a manifest: this is the
 * import that drags in the lexical editor and every menu behind it, and it
 * is loaded when the composer first renders rather than when the plugin
 * registers.
 *
 * @module loop/plugins/input-prompt/ComposerView
 */

import type { JSX } from 'react';
import { Box } from '@datalayer/primer-addons';
import { InputPrompt } from '../../../chat/prompt/InputPrompt';
import type { LoopChatComposerProps } from '../../core';

export function ComposerView({ composer }: LoopChatComposerProps): JSX.Element {
  return (
    <Box sx={{ flex: '0 0 auto' }}>
      <InputPrompt {...composer} />
    </Box>
  );
}

export default ComposerView;
