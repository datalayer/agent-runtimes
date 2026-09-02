/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * `@datalayer/loop-plugin-window-frame` — Loop in a window.
 *
 * The frame a page puts around an embedded Loop, and the two slots that make
 * its title bar extensible. The plugin itself contributes only the window
 * controls; everything else in the bar is somebody's contribution.
 *
 * Why a plugin and not just a component: the point of the frame is the slots,
 * and a slot is only useful if something can be contributed to it without the
 * host forwarding it. A page adds a button by mounting a plugin, exactly as it
 * would add anything else to the workspace — and a plugin that ships a control
 * takes the control with it when it is switched off.
 *
 * The frame is composed rather than injected: a plugin cannot wrap the shell,
 * so the host renders `<WindowFrame>` around whatever it is framing. That is
 * the one thing the host still does, and it is the one thing only the host
 * knows — how much of its page to give away.
 *
 * ```tsx
 * const reactor = buildLoopReactor([...loopPlugins(), WindowFramePlugin]);
 *
 * <WindowFrame title="Loop" height="60vh">
 *   <LoopWorkspace reactor={reactor} … />
 * </WindowFrame>
 * ```
 *
 * @module loop/plugins/window-frame
 */

import { definePlugin } from '@datalayer/reactor';
import type { ReactorReactOutput } from '@datalayer/reactor/react';
import { Box } from '@datalayer/primer-addons';
import { WINDOW_CONTROLS_SLOT } from './slots';

export { WindowFrame, type WindowFrameProps } from './WindowFrame';
export { WINDOW_ACTIONS_SLOT, WINDOW_CONTROLS_SLOT } from './slots';

export const WINDOW_FRAME_PLUGIN_NAME = '@datalayer/loop-plugin-window-frame';

/**
 * The three dots.
 *
 * They say "this is an application" without imitating a particular one, which
 * is why they are dots and not a close button that closes nothing. Contributed
 * rather than drawn into the frame so a host with its own idea of window
 * controls can switch this plugin off and fill the slot itself.
 */
function WindowControls(): React.JSX.Element {
  return (
    <>
      {['danger.emphasis', 'attention.emphasis', 'success.emphasis'].map(
        token => (
          <Box
            key={token}
            sx={{ width: 10, height: 10, borderRadius: '50%', bg: token }}
          />
        ),
      )}
    </>
  );
}

export const WindowFramePlugin = definePlugin<
  Record<string, never>,
  unknown,
  ReactorReactOutput
>({
  name: WINDOW_FRAME_PLUGIN_NAME,
  displayName: 'Window frame',
  description:
    'Draws Loop as a window, and opens its title bar to controls and actions.',
  octicon: 'browser',
  emoji: '\u{1FA9F}',
  build: () => ({
    components: [
      {
        id: 'window-controls',
        slot: WINDOW_CONTROLS_SLOT,
        Component: WindowControls,
      },
    ],
  }),
});

export default WindowFramePlugin;
