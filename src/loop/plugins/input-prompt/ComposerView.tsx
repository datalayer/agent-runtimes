/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The composer, rendered from the props the chat view assembled.
 *
 * Plus whatever was hung on it: the `LoopPromptPanel` point takes panels for
 * above and below the composer, and this view stacks them inside the prompt's
 * own card — so a floating composer carries its panels with it. The page
 * layout's current-turn panel is the first of these; the point is open to any
 * plugin.
 *
 * @module loop/plugins/input-prompt/ComposerView
 */

import type { JSX } from 'react';
import { useMemo } from 'react';
import { Box } from '@datalayer/primer-addons';
import { useContributions } from '@datalayer/reactor/react';
import { InputPrompt } from '../../../chat/prompt/InputPrompt';
import {
  LoopPromptPanel,
  type LoopChatComposerProps,
  type PromptPanelContribution,
} from '../../core';

function byOrder(
  left: { value: PromptPanelContribution },
  right: { value: PromptPanelContribution },
): number {
  return (left.value.order ?? 100) - (right.value.order ?? 100);
}

export function ComposerView({
  workspace,
  composer,
}: LoopChatComposerProps): JSX.Element {
  const panels = useContributions(LoopPromptPanel);
  const { above, below } = useMemo(() => {
    const sorted = [...panels].sort(byOrder);
    return {
      above: sorted.filter(entry => entry.value.placement === 'above'),
      below: sorted.filter(entry => entry.value.placement !== 'above'),
    };
  }, [panels]);

  const stack = (entries: typeof panels) =>
    entries.length > 0 ? (
      <>
        {entries.map(entry => {
          const Panel = entry.value.Component;
          return <Panel key={entry.value.id} workspace={workspace} />;
        })}
      </>
    ) : undefined;

  return (
    <Box sx={{ flex: '0 0 auto' }}>
      <InputPrompt
        {...composer}
        leadingPanel={stack(above)}
        trailingPanel={stack(below)}
      />
    </Box>
  );
}

export default ComposerView;
