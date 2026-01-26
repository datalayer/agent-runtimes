/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Zustand store for identity management.
 *
 * Provides OAuth 2.1 identity management with PKCE support.
 *
 * @module identity/identityStore
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector, persist } from 'zustand/middleware';
import type {
  Identity,
  IdentityStore,
  IdentityState,
  OAuthProviderConfig,
  OAuthToken,
  AuthorizationRequest,
  AuthorizationCallback,
  ProviderUserInfo,
} from './types';
import { GITHUB_PROVIDER, GOOGLE_PROVIDER, KAGGLE_PROVIDER } from './types';
import { generatePKCEPair, generateState } from './pkce';

/**
 * Storage key for persisted identity data
 */
const STORAGE_KEY = 'datalayer-agent-identities';

/**
 * Token exchange endpoint on the agent-runtimes server
 */
const DEFAULT_TOKEN_EXCHANGE_ENDPOINT = '/api/v1/identity/oauth/token';
const DEFAULT_USER_INFO_ENDPOINT = '/api/v1/identity/oauth/userinfo';
const DEFAULT_REVOKE_ENDPOINT = '/api/v1/identity/oauth/revoke';

/**
 * Initial state
 */
const initialState: IdentityState = {
  identities: new Map(),
  pendingAuthorization: null,
  providerConfigs: new Map(),
  isLoading: false,
  error: null,
};

/**
 * Build OAuth authorization URL with PKCE
 */
function buildAuthorizationUrl(
  config: OAuthProviderConfig,
  scopes: string[],
  state: string,
  codeChallenge: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    ...config.additionalParams,
  });

  return `${config.authorizationUrl}?${params.toString()}`;
}

/**
 * Create the identity store
 */
export const useIdentityStore = create<IdentityStore>()(
  devtools(
    subscribeWithSelector(
      persist(
        (set, get) => ({
          ...initialState,

          configureProvider: (config: OAuthProviderConfig) => {
            set(state => {
              const newConfigs = new Map(state.providerConfigs);
              newConfigs.set(config.provider, config);
              return { providerConfigs: newConfigs };
            });
          },

          startAuthorization: async (
            provider: string,
            scopes?: string[],
            options?: {
              onComplete?: (identity: Identity) => void;
              onError?: (error: Error) => void;
            },
          ): Promise<string> => {
            const state = get();
            const config = state.providerConfigs.get(provider);

            if (!config) {
              throw new Error(`Provider ${provider} is not configured`);
            }

            // Generate PKCE pair
            const { codeVerifier, codeChallenge } = await generatePKCEPair();
            const stateParam = generateState();
            const effectiveScopes = scopes || config.defaultScopes;

            // Build authorization URL
            const authUrl = buildAuthorizationUrl(
              config,
              effectiveScopes,
              stateParam,
              codeChallenge,
            );

            // Create pending authorization
            const request: AuthorizationRequest = {
              requestId: `auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              provider,
              authUrl,
              state: stateParam,
              codeVerifier,
              scopes: effectiveScopes,
              requestedAt: Date.now(),
              onComplete: options?.onComplete,
              onError: options?.onError,
            };

            set({ pendingAuthorization: request, error: null });

            return authUrl;
          },

          completeAuthorization: async (
            callback: AuthorizationCallback,
          ): Promise<Identity> => {
            const state = get();
            const pending = state.pendingAuthorization;

            if (!pending) {
              throw new Error('No pending authorization request');
            }

            // Verify state parameter (CSRF protection)
            if (callback.state !== pending.state) {
              const error = new Error('State mismatch - possible CSRF attack');
              pending.onError?.(error);
              set({ pendingAuthorization: null, error });
              throw error;
            }

            // Check for OAuth error
            if (callback.error) {
              const error = new Error(
                callback.errorDescription || callback.error,
              );
              pending.onError?.(error);
              set({ pendingAuthorization: null, error });
              throw error;
            }

            set({ isLoading: true });

            try {
              const config = state.providerConfigs.get(pending.provider);
              if (!config) {
                throw new Error(
                  `Provider ${pending.provider} is not configured`,
                );
              }

              // Exchange code for token via backend proxy
              // This keeps client_secret secure on the server
              const baseUrl = config.redirectUri
                .split('/')
                .slice(0, 3)
                .join('/');
              const tokenResponse = await fetch(
                `${baseUrl}${DEFAULT_TOKEN_EXCHANGE_ENDPOINT}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    provider: pending.provider,
                    code: callback.code,
                    code_verifier: pending.codeVerifier,
                    redirect_uri: config.redirectUri,
                  }),
                },
              );

              if (!tokenResponse.ok) {
                const errorData = await tokenResponse.json().catch(() => ({}));
                throw new Error(
                  errorData.detail ||
                    `Token exchange failed: ${tokenResponse.status}`,
                );
              }

              const tokenData = await tokenResponse.json();

              const token: OAuthToken = {
                accessToken: tokenData.access_token,
                tokenType: tokenData.token_type || 'Bearer',
                expiresAt: tokenData.expires_in
                  ? Date.now() + tokenData.expires_in * 1000
                  : undefined,
                refreshToken: tokenData.refresh_token,
                scopes: pending.scopes,
              };

              // Fetch user info
              let userInfo: ProviderUserInfo | undefined;
              if (config.userInfoUrl) {
                try {
                  const userInfoResponse = await fetch(
                    `${baseUrl}${DEFAULT_USER_INFO_ENDPOINT}`,
                    {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        provider: pending.provider,
                        access_token: token.accessToken,
                      }),
                    },
                  );

                  if (userInfoResponse.ok) {
                    const userInfoData = await userInfoResponse.json();
                    // Map provider-specific user info fields to common format
                    // - GitHub: login, avatar_url, html_url
                    // - Google: sub (id), picture, profile
                    // - Others: username, id, etc.
                    userInfo = {
                      id: userInfoData.id?.toString() || userInfoData.sub,
                      username: userInfoData.login || userInfoData.username, // GitHub uses 'login'
                      name: userInfoData.name,
                      email: userInfoData.email,
                      avatarUrl:
                        userInfoData.avatar_url || userInfoData.picture, // GitHub: avatar_url, Google: picture
                      profileUrl: userInfoData.html_url || userInfoData.profile, // GitHub: html_url, Google: profile
                      raw: userInfoData,
                    };
                  }
                } catch (e) {
                  console.warn('Failed to fetch user info:', e);
                }
              }

              // Create identity
              const identity: Identity = {
                provider: pending.provider,
                displayName: config.displayName,
                iconUrl: config.iconUrl,
                scopes: pending.scopes,
                isConnected: true,
                connectedAt: Date.now(),
                userInfo,
                token,
              };

              // Update store
              set(state => {
                const newIdentities = new Map(state.identities);
                newIdentities.set(pending.provider, identity);
                return {
                  identities: newIdentities,
                  pendingAuthorization: null,
                  isLoading: false,
                  error: null,
                };
              });

              // Call completion callback
              pending.onComplete?.(identity);

              return identity;
            } catch (error) {
              const err =
                error instanceof Error ? error : new Error(String(error));
              pending.onError?.(err);
              set({ isLoading: false, error: err, pendingAuthorization: null });
              throw err;
            }
          },

          cancelAuthorization: () => {
            const pending = get().pendingAuthorization;
            if (pending?.onError) {
              pending.onError(new Error('Authorization cancelled'));
            }
            set({ pendingAuthorization: null });
          },

          connectWithToken: async (
            provider: string,
            token: string,
            options?: {
              displayName?: string;
              iconUrl?: string;
              userInfo?: ProviderUserInfo;
            },
          ): Promise<Identity> => {
            set({ isLoading: true, error: null });

            try {
              // Create token object (token-based auth doesn't expire)
              const oauthToken: OAuthToken = {
                accessToken: token,
                tokenType: 'Bearer',
                scopes: [], // Token-based auth doesn't have scopes
              };

              // Provider display config
              const displayConfig = {
                kaggle: {
                  displayName: 'Kaggle',
                  iconUrl: 'https://www.kaggle.com/static/images/favicon.ico',
                },
              }[provider] || { displayName: provider, iconUrl: undefined };

              // Create identity
              const identity: Identity = {
                provider,
                authType: 'token',
                displayName: options?.displayName || displayConfig.displayName,
                iconUrl: options?.iconUrl || displayConfig.iconUrl,
                scopes: [],
                isConnected: true,
                connectedAt: Date.now(),
                userInfo: options?.userInfo,
                token: oauthToken,
              };

              // Update store
              set(state => {
                const newIdentities = new Map(state.identities);
                newIdentities.set(provider, identity);
                return {
                  identities: newIdentities,
                  isLoading: false,
                  error: null,
                };
              });

              return identity;
            } catch (error) {
              const err =
                error instanceof Error ? error : new Error(String(error));
              set({ isLoading: false, error: err });
              throw err;
            }
          },

          disconnect: async (provider: string) => {
            const state = get();
            const identity = state.identities.get(provider);
            const config = state.providerConfigs.get(provider);

            if (!identity || !identity.token) {
              // Already disconnected
              set(state => {
                const newIdentities = new Map(state.identities);
                newIdentities.delete(provider);
                return { identities: newIdentities };
              });
              return;
            }

            // For token-based auth, just remove from store (no revocation)
            if (identity.authType === 'token') {
              set(state => {
                const newIdentities = new Map(state.identities);
                newIdentities.delete(provider);
                return { identities: newIdentities };
              });
              return;
            }

            // Try to revoke token (OAuth only)
            if (config?.revocationUrl) {
              try {
                const baseUrl = config.redirectUri
                  .split('/')
                  .slice(0, 3)
                  .join('/');
                await fetch(`${baseUrl}${DEFAULT_REVOKE_ENDPOINT}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    provider,
                    access_token: identity.token.accessToken,
                  }),
                });
              } catch (e) {
                console.warn('Failed to revoke token:', e);
              }
            }

            // Remove from store
            set(state => {
              const newIdentities = new Map(state.identities);
              newIdentities.delete(provider);
              return { identities: newIdentities };
            });
          },

          refreshToken: async (provider: string): Promise<OAuthToken> => {
            const state = get();
            const identity = state.identities.get(provider);
            const config = state.providerConfigs.get(provider);

            if (!identity || !identity.token?.refreshToken) {
              throw new Error(`No refresh token available for ${provider}`);
            }

            if (!config) {
              throw new Error(`Provider ${provider} is not configured`);
            }

            const baseUrl = config.redirectUri.split('/').slice(0, 3).join('/');
            const response = await fetch(
              `${baseUrl}${DEFAULT_TOKEN_EXCHANGE_ENDPOINT}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  provider,
                  grant_type: 'refresh_token',
                  refresh_token: identity.token.refreshToken,
                }),
              },
            );

            if (!response.ok) {
              throw new Error(`Token refresh failed: ${response.status}`);
            }

            const tokenData = await response.json();

            const newToken: OAuthToken = {
              accessToken: tokenData.access_token,
              tokenType: tokenData.token_type || 'Bearer',
              expiresAt: tokenData.expires_in
                ? Date.now() + tokenData.expires_in * 1000
                : undefined,
              refreshToken:
                tokenData.refresh_token || identity.token.refreshToken,
              scopes: identity.scopes,
            };

            // Update identity with new token
            set(state => {
              const newIdentities = new Map(state.identities);
              newIdentities.set(provider, {
                ...identity,
                token: newToken,
              });
              return { identities: newIdentities };
            });

            return newToken;
          },

          getIdentity: (provider: string) => {
            return get().identities.get(provider);
          },

          isConnected: (provider: string) => {
            const identity = get().identities.get(provider);
            return identity?.isConnected ?? false;
          },

          getToken: async (provider: string): Promise<OAuthToken | null> => {
            const state = get();
            const identity = state.identities.get(provider);

            if (!identity || !identity.token) {
              return null;
            }

            // Check if token is expired or about to expire (5 min buffer)
            const expiresAt = identity.token.expiresAt;
            if (expiresAt && expiresAt - Date.now() < 5 * 60 * 1000) {
              // Token is expired or expiring soon, try to refresh
              if (identity.token.refreshToken) {
                try {
                  return await get().refreshToken(provider);
                } catch (e) {
                  console.warn('Token refresh failed:', e);
                  return null;
                }
              }
              return null;
            }

            return identity.token;
          },

          clearAll: () => {
            set({
              identities: new Map(),
              pendingAuthorization: null,
              error: null,
            });
          },

          setError: (error: Error | null) => {
            set({ error });
          },
        }),
        {
          name: STORAGE_KEY,
          // Custom serialization for Maps
          storage: {
            getItem: name => {
              const str = localStorage.getItem(name);
              if (!str) return null;
              const data = JSON.parse(str);

              // Check if we're in an OAuth callback (code and state in URL)
              // If not, clear any stale pendingAuthorization from previous sessions
              const urlParams = new URLSearchParams(window.location.search);
              const isOAuthCallback =
                urlParams.has('code') && urlParams.has('state');

              return {
                state: {
                  ...data.state,
                  identities: new Map(data.state.identities || []),
                  providerConfigs: new Map(data.state.providerConfigs || []),
                  // Only restore pendingAuthorization if we're in an OAuth callback
                  // Otherwise, clear it to prevent stale "Working..." state
                  pendingAuthorization: isOAuthCallback
                    ? data.state.pendingAuthorization || null
                    : null,
                  isLoading: false,
                  error: null,
                },
              };
            },
            setItem: (name, value) => {
              const data = {
                state: {
                  ...value.state,
                  identities: Array.from(value.state.identities.entries()),
                  providerConfigs: Array.from(
                    value.state.providerConfigs.entries(),
                  ),
                  // Persist pending auth so callback can complete after redirect
                  pendingAuthorization: value.state.pendingAuthorization
                    ? {
                        ...value.state.pendingAuthorization,
                        // Don't persist callbacks (functions can't be serialized)
                        onComplete: undefined,
                        onError: undefined,
                      }
                    : null,
                  isLoading: false,
                  error: null,
                },
              };
              localStorage.setItem(name, JSON.stringify(data));
            },
            removeItem: name => localStorage.removeItem(name),
          },
          partialize: state => ({
            identities: state.identities,
            providerConfigs: state.providerConfigs,
            pendingAuthorization: state.pendingAuthorization,
          }),
        },
      ),
    ),
    { name: 'IdentityStore' },
  ),
);

// === Selector Hooks ===

/**
 * Get all connected identities
 */
export function useConnectedIdentities(): Identity[] {
  return useIdentityStore(state =>
    Array.from(state.identities.values()).filter(i => i.isConnected),
  );
}

/**
 * Get connected provider names
 */
export function useConnectedProviders(): string[] {
  return useIdentityStore(state =>
    Array.from(state.identities.entries())
      .filter(([_, identity]) => identity.isConnected)
      .map(([provider]) => provider),
  );
}

/**
 * Get identity for a specific provider
 */
export function useIdentity(provider: string): Identity | undefined {
  return useIdentityStore(state => state.identities.get(provider));
}

/**
 * Check if a provider is connected
 */
export function useIsProviderConnected(provider: string): boolean {
  return useIdentityStore(
    state => state.identities.get(provider)?.isConnected ?? false,
  );
}

/**
 * Get pending authorization
 */
export function usePendingAuthorization() {
  return useIdentityStore(state => state.pendingAuthorization);
}

/**
 * Get identity loading state
 */
export function useIdentityLoading() {
  return useIdentityStore(state => state.isLoading);
}

/**
 * Get identity error
 */
export function useIdentityError() {
  return useIdentityStore(state => state.error);
}

// === Initialization Helpers ===

/**
 * Configure built-in providers with client IDs
 */
export function configureBuiltinProviders(options: {
  github?: { clientId: string; redirectUri: string };
  google?: { clientId: string; redirectUri: string };
  kaggle?: { clientId: string; redirectUri: string };
}) {
  const store = useIdentityStore.getState();

  if (options.github) {
    store.configureProvider({
      ...GITHUB_PROVIDER,
      clientId: options.github.clientId,
      redirectUri: options.github.redirectUri,
    } as OAuthProviderConfig);
  }

  if (options.google) {
    store.configureProvider({
      ...GOOGLE_PROVIDER,
      clientId: options.google.clientId,
      redirectUri: options.google.redirectUri,
    } as OAuthProviderConfig);
  }

  if (options.kaggle) {
    store.configureProvider({
      ...KAGGLE_PROVIDER,
      clientId: options.kaggle.clientId,
      redirectUri: options.kaggle.redirectUri,
    } as OAuthProviderConfig);
  }
}
