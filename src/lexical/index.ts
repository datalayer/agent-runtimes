/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Lexical plugin exports.
 *
 * @module lexical
 */

export {
  ChatInlinePlugin,
  type ChatInlinePluginProps,
  SAVE_SELECTION_COMMAND,
  RESTORE_SELECTION_COMMAND,
} from './ChatInlinePlugin';

export {
  useChatInlineToolbarItems,
  type ChatInlineToolbarState,
} from './useChatInlineToolbarItems';
