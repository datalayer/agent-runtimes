/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * React context and hook for injecting an {@link IAgentRuntimesClient}
 * implementation into the chat component tree.
 *
 * Consumers wrap the `<Chat>` component with `<AgentRuntimesClientProvider>`
 * and pass the implementation of their choice — the default
 * `SdkAgentRuntimesClient` for browser / Node, or a bridge
 * implementation in the VSCode webview sandbox. Components and hooks inside
 * the tree call {@link useAgentRuntimesClient} to retrieve the current client
 * without knowing anything about how it talks to the backend.
 *
 * @module client/AgentRuntimesClientContext
 */

import type { ReactNode } from 'react';
import { createContext, useContext, useMemo } from 'react';

import type { IAgentRuntimesClient } from './IAgentRuntimesClient';

/**
 * React context carrying the active {@link IAgentRuntimesClient}. `null` when
 * no provider is mounted — in that case {@link useAgentRuntimesClient} throws
 * so callers fail loudly rather than silently making no-op HTTP calls.
 */
const AgentRuntimesClientContext = createContext<IAgentRuntimesClient | null>(
  null,
);

/** Props for {@link AgentRuntimesClientProvider}. */
export interface AgentRuntimesClientProviderProps {
  /** Client implementation to make available to descendants. */
  client: IAgentRuntimesClient;
  /** Descendants that should see the provided client. */
  children: ReactNode;
}

/**
 * Provides an {@link IAgentRuntimesClient} instance to every descendant.
 *
 * @param props - Provider props.
 *
 * @returns A React element that exposes `props.client` to descendants.
 */
export function AgentRuntimesClientProvider(
  props: AgentRuntimesClientProviderProps,
): JSX.Element {
  const { client, children } = props;
  // Memoize the context value so identity only changes when the client
  // reference itself changes.
  const value = useMemo(() => client, [client]);
  return (
    <AgentRuntimesClientContext.Provider value={value}>
      {children}
    </AgentRuntimesClientContext.Provider>
  );
}

/**
 * Reads the active {@link IAgentRuntimesClient} from context.
 *
 * @returns The active client.
 *
 * @throws When called outside an {@link AgentRuntimesClientProvider}. Prefer a
 *   loud failure to silently falling back to a default client, because a
 *   missing provider usually indicates a wiring bug (especially in the VSCode
 *   webview where the default client would make forbidden direct HTTP calls).
 */
export function useAgentRuntimesClient(): IAgentRuntimesClient {
  const client = useContext(AgentRuntimesClientContext);
  if (client === null) {
    throw new Error(
      'useAgentRuntimesClient must be called inside an <AgentRuntimesClientProvider>. ' +
        'Wrap your <Chat> component (or the subtree that uses agent-runtimes hooks) ' +
        'with <AgentRuntimesClientProvider client={...}>.',
    );
  }
  return client;
}

/**
 * Reads the current {@link IAgentRuntimesClient} from context without
 * throwing.
 *
 * Use this variant in code paths that want to fall back to some other behavior
 * when no provider is mounted (for example, legacy hook implementations that
 * currently still make direct network calls and are being migrated
 * incrementally).
 *
 * @returns The active client, or `null` when no provider is mounted.
 */
export function useOptionalAgentRuntimesClient(): IAgentRuntimesClient | null {
  return useContext(AgentRuntimesClientContext);
}
