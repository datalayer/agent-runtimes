/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Whether there is an agent to talk to, said once by the host.
 *
 * A chat can be unavailable for a reason that has nothing to do with the chat:
 * the sandbox runs in the browser, or on an anonymous server, and no agent runs
 * beside it. That is the host's knowledge, not the chat's — and not something
 * every screen rendering a chat should have to work out and pass down.
 *
 * So the host says it once, here, and every `ChatBase` beneath it shows itself
 * switched off with the reason in its header. An explicit `disabled` prop still
 * wins: a caller that knows better about one particular chat can say so.
 *
 * @module chat/base/ChatAvailability
 */

import type { JSX } from 'react';
import { createContext, useContext, useMemo, type ReactNode } from 'react';

/** What the host knows about whether a chat can be used. */
export interface ChatAvailability {
  /** Whether the chat is unusable here. */
  disabled: boolean;
  /** Why, in the person's terms. Shown in the chat header. */
  disableReason?: string;
}

const AVAILABLE: ChatAvailability = { disabled: false };

const ChatAvailabilityContext = createContext<ChatAvailability>(AVAILABLE);

/**
 * Declare, for everything beneath, whether a chat can be used.
 *
 * Rendering no provider means available — the common case should cost nothing.
 */
export function ChatAvailabilityProvider({
  disabled = false,
  disableReason,
  children,
}: ChatAvailability & { children: ReactNode }): JSX.Element {
  const value = useMemo<ChatAvailability>(
    () => (disabled ? { disabled: true, disableReason } : AVAILABLE),
    [disabled, disableReason],
  );
  return (
    <ChatAvailabilityContext.Provider value={value}>
      {children}
    </ChatAvailabilityContext.Provider>
  );
}

/** What the host said about chat availability here. */
export function useChatAvailability(): ChatAvailability {
  return useContext(ChatAvailabilityContext);
}

export default ChatAvailabilityProvider;
