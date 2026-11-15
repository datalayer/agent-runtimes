/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agents' UI in the chat's own chrome (the user, 15 November 2026:
 * "make sure ui can be used to be injected in the chat itself (toolbar,
 * header...)"). A UI spec says its `placements`; a chrome UI is one
 * component, mounted where its declaration places it:
 *
 * | Placement | A Loop workspace          | `Chat`                               |
 * |-----------|---------------------------|--------------------------------------|
 * | `header`  | `loop.chatHeader`         | items of its header toolbar ("…" when narrow) |
 * | `toolbar` | `loop.promptAction`       | the input toolbar (`toolbarExtras`)  |
 * | `footer`  | `loop.status`             | the band over the prompt (`footerContent`) |
 * | `banner`  | `loop.chatBanner`         | under the title (`headerContent`)    |
 * | `panel`   | none yet                  | none yet                             |
 *
 * A `message` UI is a card in the conversation (`defineToolCardPlugin`).
 *
 * @module apps/toolCards/chrome
 */

import type { ComponentType, JSX, ReactNode } from 'react';
import { Label } from '@primer/react';
import { definePlugin } from '@datalayer/reactor';
import type { ReactorPlugin } from '@datalayer/reactor';
import { LoopSlots } from '../core';

export type UiPlacement =
  'header' | 'toolbar' | 'footer' | 'banner' | 'panel' | 'message';

export type ChromePlacement = Exclude<UiPlacement, 'message'>;

export const CHROME_PLACEMENTS: readonly ChromePlacement[] = [
  'header',
  'toolbar',
  'footer',
  'banner',
  'panel',
];

/** The Loop slot of each chrome placement; none where the chat has none. */
export const CHROME_SLOTS: Record<ChromePlacement, string | undefined> = {
  header: LoopSlots.chatHeader,
  toolbar: LoopSlots.promptAction,
  footer: LoopSlots.status,
  banner: LoopSlots.chatBanner,
  panel: undefined,
};

export const isChromePlacement = (
  placement: string | undefined,
): placement is ChromePlacement =>
  CHROME_PLACEMENTS.includes(placement as ChromePlacement);

export type ChromeComponentProps = { placement: ChromePlacement };

export type ChromePluginOptions = {
  id: string;
  displayName: string;
  description: string;
  octicon: string;
  emoji: string;
  /** What it draws; nothing when it has nothing true to say. */
  Component: ComponentType<ChromeComponentProps>;
};

/**
 * A chrome UI's plugin, for a placement: its component in that placement's
 * slot, under the plugin's one name (`@datalayer/loop-plugin-<id>`).
 */
export function defineChromePlugin(
  options: ChromePluginOptions,
): (
  placement: ChromePlacement,
) => ReactorPlugin<Record<string, never>, unknown, unknown> {
  const { Component } = options;
  return placement => {
    const slot = CHROME_SLOTS[placement];
    function Slotted(): JSX.Element {
      return <Component placement={placement} />;
    }
    return definePlugin({
      name: `@datalayer/loop-plugin-${options.id}`,
      displayName: options.displayName,
      description: options.description,
      octicon: options.octicon,
      emoji: options.emoji,
      build() {
        return {
          components: slot
            ? [
                {
                  slot,
                  id: `${options.id}-${placement}`,
                  Component: Slotted as never,
                },
              ]
            : [],
        };
      },
    }) as unknown as ReactorPlugin<Record<string, never>, unknown, unknown>;
  };
}

/** A chip: a few words, the whole sentence as its title. */
export function Chip({
  children,
  title,
  attention = false,
  data,
}: {
  children: ReactNode;
  title: string;
  attention?: boolean;
  data?: string;
}): JSX.Element {
  return (
    <Label
      variant={attention ? 'attention' : 'secondary'}
      title={title}
      aria-label={title}
      data-chrome-chip={data}
    >
      {children}
    </Label>
  );
}
