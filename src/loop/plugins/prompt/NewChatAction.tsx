/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The + in the prompt's footer: start the conversation over.
 *
 * The chat header carries the same control, and a workspace that hides that
 * header — the Loop Shell does — used to lose the only way to reset. This one
 * lives with the composer, which is on screen in every placement.
 *
 * It presses the `/new` command rather than reaching into the chat, so the
 * button and the slash command cannot drift: one intent, one path, and the
 * command's own error shows when no conversation is on screen.
 *
 * @module loop/plugins/prompt/NewChatAction
 */

import type { JSX } from 'react';
import { IconButton } from '@primer/react';
import { PlusIcon } from '@primer/octicons-react';
import type { LoopWorkspaceContext } from '../../core';

export function NewChatAction({
  workspace,
}: {
  workspace?: LoopWorkspaceContext;
}): JSX.Element | null {
  if (!workspace) {
    return null;
  }
  return (
    <IconButton
      icon={PlusIcon}
      aria-label="New conversation"
      title="New conversation"
      variant="invisible"
      size="small"
      onClick={() => void workspace.submit('/new')}
    />
  );
}

export default NewChatAction;
