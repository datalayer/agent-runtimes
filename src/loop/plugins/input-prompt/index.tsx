/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-input-prompt` — the composer, as a plugin.
 *
 * The chat view assembles everything the composer needs — the draft, the
 * send handler, the tools/skills/model menus' data, the placement — and
 * offers it through the {@link LoopChatComposer} point. This plugin is the
 * standard taker: it renders the assembled props with the chat's own
 * `InputPrompt`, which is the full composer — the lexical editor (`/` opens
 * the command menu, `@` mentions agents) and the session-controls footer.
 *
 * The split is what makes the composer honest workspace furniture: untick
 * this plugin and the box goes, the way unticking the notebook takes the
 * editor; contribute a different component to the same point and the
 * workspace types through *your* composer with none of the wiring
 * re-derived.
 *
 * The component is loaded lazily: `InputPrompt` drags the lexical editor
 * and every menu behind it, and none of that belongs in the module graph a
 * host pays for by merely mounting the preset. The plugin file is a
 * manifest; the composer arrives when it first renders.
 *
 * Not to be confused with `@datalayer/loop-plugin-prompt`, which owns the
 * `/prompt` and `/new` commands and the **+** footer action — commands about
 * the composer, wherever it came from.
 *
 * @module loop/plugins/input-prompt
 */

import type { JSX } from 'react';
import { Suspense, lazy } from 'react';
import { contribution, definePlugin } from '@datalayer/reactor';
import { LoopChatComposer, type LoopChatComposerProps } from '../../core';

export const INPUT_PROMPT_PLUGIN_NAME = '@datalayer/loop-plugin-input-prompt';

const LazyComposerView = lazy(() => import('./ComposerView'));

/** The lazy boundary, so the point's consumers need no Suspense of theirs. */
function ComposerView(props: LoopChatComposerProps): JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyComposerView {...props} />
    </Suspense>
  );
}

export const InputPromptPlugin = definePlugin({
  name: INPUT_PROMPT_PLUGIN_NAME,
  displayName: 'Input Prompt',
  description: 'The composer under (or over) the conversation.',
  octicon: 'pencil',
  emoji: '\u{270F}\u{FE0F}',
  contributes: [
    contribution(
      LoopChatComposer,
      { id: 'input-prompt', Component: ComposerView },
      { id: 'input-prompt' },
    ),
  ],
});

export default InputPromptPlugin;
