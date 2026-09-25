/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The standard bar: the assembled props, rendered by `ChatBaseHeader`.
 *
 * In its own file for the same reason as the composer's view: the header
 * pulls the kernel indicator and its friends, and the plugin's module
 * should stay a manifest.
 *
 * @module loop/plugins/chat-header/HeaderView
 */

import type { JSX } from 'react';
import { ChatBaseHeader } from '../../../chat/header/ChatHeaderBase';
import type { LoopChatHeaderProps } from '../../core';

export function HeaderView({ header }: LoopChatHeaderProps): JSX.Element {
  return <ChatBaseHeader {...header} />;
}

export default HeaderView;
