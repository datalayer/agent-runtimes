/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * React hook for identity management.
 *
 * Provides a simple interface for OAuth 2.1 identity management.
 *
 * @module identity/useIdentity
 */

import { useCallback, useEffect, useMemo } from 'react';
import {
  useIdentityStore,
  useConnectedIdentities,
  useConnectedProviders,
  usePendingAuthorization,
  useIdentityLoading,
  useIdentityError,
  configureBuiltinProviders,
} from './identityStore';
import type {
  Identity,
  OAuthProviderConfig,
  AuthorizationCallback,
} from './types';

/**
 * Options for useIdentity hook
 */
export interface UseIdentityOptions {
  /**
   * Provider configurations to initialize.
   * Each provider has specific requirements:
   * - GitHub: clientId required, client_secret handled server-side
   * - Google: clientId required, supports pure PKCE
   * - Kaggle: clientId required, standard OAuth 2.1
   */
  providers?: {
    /** GitHub OAuth configuration. Note: client_secret must be configured server-side. */
    github?: { clientId: string; redirectUri?: string; scopes?: string[] };
    /** Google OAuth configuration. Supports offline access mode. */
    google?: { clientId: string; redirectUri?: string; scopes?: string[] };
    /** Kaggle OAuth configuration. */
    kaggle?: { clientId: string; redirectUri?: string; scopes?: string[] };
    /** Custom provider configurations. */
    custom?: OAuthProviderConfig[];
  };
  /** Base URL for redirect URIs (defaults to window.location.origin) */
  baseUrl?: string;
  /** Callback path for OAuth redirects (defaults to /oauth/callback) */
  callbackPath?: string;
  /** Auto-handle OAuth callback from URL params */
  autoHandleCallback?: boolean;
}

/**
 * Return type for useIdentity hook
 */
export interface UseIdentityReturn {
  // === State ===
  /** All connected identities */
  identities: Identity[];
  /** Connected provider names */
  connectedProviders: string[];
  /** Whether authorization is in progress */
  isAuthorizing: boolean;
  /** Whether loading (token exchange, etc.) */
  isLoading: boolean;
  /** Current error */
  error: Error | null;
  /** Pending authorization request */
  pendingAuthorization: ReturnType<typeof usePendingAuthorization>;

  // === Actions ===
  /** Start OAuth flow for a provider */
  connect: (provider: string, scopes?: string[]) => Promise<void>;
  /** Open OAuth popup for a provider */
  connectWithPopup: (provider: string, scopes?: string[]) => Promise<Identity>;
  /** Connect with a token directly (for token-based providers like Kaggle) */
  connectWithToken: (
    provider: string,
    token: string,
    options?: { displayName?: string; iconUrl?: string },
  ) => Promise<Identity>;
  /** Disconnect a provider */
  disconnect: (provider: string) => Promise<void>;
  /** Complete authorization with callback params */
  completeAuthorization: (callback: AuthorizationCallback) => Promise<Identity>;
  /** Cancel pending authorization */
  cancelAuthorization: () => void;
  /** Check if a provider is connected */
  isConnected: (provider: string) => boolean;
  /** Get identity for a provider */
  getIdentity: (provider: string) => Identity | undefined;
  /** Get access token for a provider (refreshes if needed) */
  getAccessToken: (provider: string) => Promise<string | null>;
  /** Configure a custom provider */
  configureProvider: (config: OAuthProviderConfig) => void;
}

/**
 * Hook for managing OAuth identities
 *
 * @example
 * ```tsx
 * const {
 *   identities,
 *   connect,
 *   disconnect,
 *   isConnected,
 * } = useIdentity({
 *   providers: {
 *     github: { clientId: 'your-client-id' },
 *   },
 * });
 *
 * // Connect to GitHub
 * await connect('github', ['repo', 'read:user']);
 *
 * // Check connection
 * if (isConnected('github')) {
 *   const token = await getAccessToken('github');
 * }
 * ```
 */
export function useIdentity(
  options: UseIdentityOptions = {},
): UseIdentityReturn {
  const {
    providers,
    baseUrl = typeof window !== 'undefined' ? window.location.origin : '',
    callbackPath = typeof window !== 'undefined'
      ? window.location.pathname
      : '/oauth/callback',
    autoHandleCallback = true,
  } = options;

  // Store state
  const identities = useConnectedIdentities();
  const connectedProviders = useConnectedProviders();
  const pendingAuthorization = usePendingAuthorization();
  const isLoading = useIdentityLoading();
  const error = useIdentityError();

  // Store actions
  const startAuthorization = useIdentityStore(s => s.startAuthorization);
  const completeAuthorizationAction = useIdentityStore(
    s => s.completeAuthorization,
  );
  const cancelAuthorizationAction = useIdentityStore(
    s => s.cancelAuthorization,
  );
  const disconnectAction = useIdentityStore(s => s.disconnect);
  const getIdentityAction = useIdentityStore(s => s.getIdentity);
  const isConnectedAction = useIdentityStore(s => s.isConnected);
  const getTokenAction = useIdentityStore(s => s.getToken);
  const configureProviderAction = useIdentityStore(s => s.configureProvider);

  // Configure providers on mount
  useEffect(() => {
    if (!providers) return;

    const redirectUri = `${baseUrl}${callbackPath}`;

    if (providers.github) {
      configureBuiltinProviders({
        github: {
          clientId: providers.github.clientId,
          redirectUri: providers.github.redirectUri || redirectUri,
        },
      });
    }

    if (providers.google) {
      configureBuiltinProviders({
        google: {
          clientId: providers.google.clientId,
          redirectUri: providers.google.redirectUri || redirectUri,
        },
      });
    }

    if (providers.kaggle) {
      configureBuiltinProviders({
        kaggle: {
          clientId: providers.kaggle.clientId,
          redirectUri: providers.kaggle.redirectUri || redirectUri,
        },
      });
    }

    // Configure custom providers
    if (providers.custom) {
      providers.custom.forEach(config => {
        configureProviderAction(config);
      });
    }
  }, [providers, baseUrl, callbackPath, configureProviderAction]);

  // Auto-handle OAuth callback from URL
  useEffect(() => {
    if (!autoHandleCallback || typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if ((code && state) || error) {
      completeAuthorizationAction({
        code: code || '',
        state: state || '',
        error: error || undefined,
        errorDescription: errorDescription || undefined,
      })
        .then(() => {
          // Clean up URL
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, '', cleanUrl);
        })
        .catch(err => {
          console.error('OAuth callback error:', err);
          // Clean up URL even on error
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, '', cleanUrl);
        });
    }
  }, [autoHandleCallback, completeAuthorizationAction]);

  // Connect via redirect
  const connect = useCallback(
    async (provider: string, scopes?: string[]) => {
      const authUrl = await startAuthorization(provider, scopes);
      // Redirect to authorization URL
      window.location.href = authUrl;
    },
    [startAuthorization],
  );

  // Connect via popup
  const connectWithPopup = useCallback(
    async (provider: string, scopes?: string[]): Promise<Identity> => {
      // Start authorization first (async), then create promise for popup flow
      const authUrl = await startAuthorization(provider, scopes, {
        onComplete: () => {},
        onError: () => {},
      });

      return new Promise((resolve, reject) => {
        // Update callbacks for the pending authorization
        const store = useIdentityStore.getState();
        if (store.pendingAuthorization) {
          store.pendingAuthorization.onComplete = resolve;
          store.pendingAuthorization.onError = reject;
        }

        // Open popup
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
          authUrl,
          'oauth_popup',
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`,
        );

        if (!popup) {
          reject(new Error('Failed to open popup window'));
          return;
        }

        // Listen for callback via postMessage from OAuthCallback component
        const handleMessage = (event: MessageEvent) => {
          if (event.origin !== window.location.origin) return;

          // Handle success message from OAuthCallback
          if (event.data?.type === 'oauth-callback-success') {
            window.removeEventListener('message', handleMessage);
            clearInterval(pollTimer);
            popup.close();

            const providerName = event.data.provider;
            const identityFromPopup = event.data.identity as
              | Identity
              | undefined;

            console.debug(
              '[Identity] Received oauth-callback-success for provider:',
              providerName,
            );
            console.debug('[Identity] Identity from popup:', identityFromPopup);

            if (identityFromPopup) {
              // Use the identity directly from the popup message
              // Create a new Map to ensure React detects the change
              const currentIdentities = useIdentityStore.getState().identities;
              const newIdentities = new Map(currentIdentities);
              newIdentities.set(providerName, identityFromPopup);

              // Update the store
              useIdentityStore.setState({
                identities: newIdentities,
                pendingAuthorization: null,
              });
              console.debug(
                '[Identity] Store updated with identity from popup, identities count:',
                newIdentities.size,
              );
              resolve(identityFromPopup);
              return;
            }

            // Fallback: read from localStorage if identity not in message
            setTimeout(() => {
              const STORAGE_KEY = 'agent-runtimes-identity';
              const stored = localStorage.getItem(STORAGE_KEY);
              console.debug('[Identity] Fallback: reading from localStorage');

              if (stored) {
                try {
                  const data = JSON.parse(stored);
                  const identitiesArray = data.state?.identities || [];
                  const identitiesMap = new Map(identitiesArray);
                  const identity = identitiesMap.get(providerName) as
                    | Identity
                    | undefined;

                  if (identity) {
                    const currentIdentities =
                      useIdentityStore.getState().identities;
                    const newIdentities = new Map(currentIdentities);
                    newIdentities.set(providerName, identity);

                    useIdentityStore.setState({
                      identities: newIdentities,
                      pendingAuthorization: null,
                    });
                    resolve(identity);
                    return;
                  }
                } catch (e) {
                  console.error(
                    '[Identity] Failed to parse identity from localStorage:',
                    e,
                  );
                }
              }

              // Final fallback
              useIdentityStore.setState({ pendingAuthorization: null });
              reject(new Error('Identity not found after OAuth success'));
            }, 100);
          }
          // Handle error message from OAuthCallback
          else if (event.data?.type === 'oauth-callback-error') {
            window.removeEventListener('message', handleMessage);
            clearInterval(pollTimer);
            popup.close();
            useIdentityStore.setState({ pendingAuthorization: null });
            reject(
              new Error(event.data.error || 'OAuth authentication failed'),
            );
          }
          // Legacy: handle 'oauth_callback' message type
          else if (event.data?.type === 'oauth_callback') {
            window.removeEventListener('message', handleMessage);
            clearInterval(pollTimer);
            popup.close();

            completeAuthorizationAction(event.data.payload)
              .then(resolve)
              .catch(reject);
          }
        };

        window.addEventListener('message', handleMessage);

        // Also poll for popup close (user cancelled)
        const pollTimer = setInterval(() => {
          if (popup.closed) {
            clearInterval(pollTimer);
            window.removeEventListener('message', handleMessage);
            // Don't reject if we already got a message
            if (useIdentityStore.getState().pendingAuthorization) {
              cancelAuthorizationAction();
              reject(new Error('Popup closed by user'));
            }
          }
        }, 500);
      });
    },
    [
      startAuthorization,
      completeAuthorizationAction,
      cancelAuthorizationAction,
    ],
  );

  // Connect with token (for token-based providers like Kaggle)
  const connectWithTokenAction = useIdentityStore(s => s.connectWithToken);
  const connectWithToken = useCallback(
    async (
      provider: string,
      token: string,
      options?: { displayName?: string; iconUrl?: string },
    ): Promise<Identity> => {
      return connectWithTokenAction(provider, token, options);
    },
    [connectWithTokenAction],
  );

  // Disconnect
  const disconnect = useCallback(
    async (provider: string) => {
      await disconnectAction(provider);
    },
    [disconnectAction],
  );

  // Complete authorization
  const completeAuthorization = useCallback(
    async (callback: AuthorizationCallback) => {
      return completeAuthorizationAction(callback);
    },
    [completeAuthorizationAction],
  );

  // Cancel authorization
  const cancelAuthorization = useCallback(() => {
    cancelAuthorizationAction();
  }, [cancelAuthorizationAction]);

  // Check if connected
  const isConnected = useCallback(
    (provider: string) => {
      return isConnectedAction(provider);
    },
    [isConnectedAction],
  );

  // Get identity
  const getIdentity = useCallback(
    (provider: string) => {
      return getIdentityAction(provider);
    },
    [getIdentityAction],
  );

  // Get access token
  const getAccessToken = useCallback(
    async (provider: string): Promise<string | null> => {
      const token = await getTokenAction(provider);
      return token?.accessToken ?? null;
    },
    [getTokenAction],
  );

  // Configure provider
  const configureProvider = useCallback(
    (config: OAuthProviderConfig) => {
      configureProviderAction(config);
    },
    [configureProviderAction],
  );

  // Derived state
  const isAuthorizing = pendingAuthorization !== null;

  return useMemo(
    () => ({
      // State
      identities,
      connectedProviders,
      isAuthorizing,
      isLoading,
      error,
      pendingAuthorization,

      // Actions
      connect,
      connectWithPopup,
      connectWithToken,
      disconnect,
      completeAuthorization,
      cancelAuthorization,
      isConnected,
      getIdentity,
      getAccessToken,
      configureProvider,
    }),
    [
      identities,
      connectedProviders,
      isAuthorizing,
      isLoading,
      error,
      pendingAuthorization,
      connect,
      connectWithPopup,
      connectWithToken,
      disconnect,
      completeAuthorization,
      cancelAuthorization,
      isConnected,
      getIdentity,
      getAccessToken,
      configureProvider,
    ],
  );
}
