/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The `loop` theme's four reference screens (LOOP T-01) and the floating
 * assistant's states (T-27), as stories: the real chat components with fixed
 * data, in any theme of the registry and either mode. The same screens are
 * pictured and compared by `npm run test:pictures` (T-16).
 */

import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ASSISTANT_PICTURES,
  AssistantScreen,
  ApprovalScreen,
  BesideWorkScreen,
  ConversationScreen,
  REFERENCE_THEMES,
  ReferenceTheme,
  WorkerActivityScreen,
  type AssistantPicture,
  type ReferenceMode,
} from './ReferenceScreens';
import type { ThemeVariant } from '@datalayer/primer-addons';

interface ReferenceArgs {
  theme: ThemeVariant;
  mode: ReferenceMode;
  picture: AssistantPicture;
}

const meta: Meta<ReferenceArgs> = {
  title: 'Loop/Reference screens',
  parameters: { layout: 'fullscreen' },
  args: { theme: 'loop', mode: 'light', picture: 'idle' },
  argTypes: {
    theme: { control: 'select', options: REFERENCE_THEMES },
    mode: { control: 'inline-radio', options: ['light', 'dark'] },
    picture: { control: 'select', options: [...ASSISTANT_PICTURES] },
  },
};

export default meta;

type Story = StoryObj<ReferenceArgs>;

function story(Screen: () => React.JSX.Element): Story {
  return {
    argTypes: { picture: { table: { disable: true } } },
    render: ({ theme, mode }) => (
      <ReferenceTheme theme={theme} mode={mode}>
        <Screen />
      </ReferenceTheme>
    ),
  };
}

/** A conversation. */
export const Conversation: Story = story(ConversationScreen);

/** A conversation beside its work. */
export const BesideItsWork: Story = story(BesideWorkScreen);

/** The activity of a worker. */
export const WorkerActivity: Story = story(WorkerActivityScreen);

/** An approval. */
export const Approval: Story = story(ApprovalScreen);

/** The floating assistant, in each of its states or stepped aside. */
export const Assistant: Story = {
  render: ({ theme, mode, picture }) => (
    <ReferenceTheme theme={theme} mode={mode}>
      <AssistantScreen picture={picture} />
    </ReferenceTheme>
  ),
};
