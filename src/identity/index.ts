/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Identity module for OAuth 2.1 user-delegated access.
 *
 * Provides secure identity management for AI agents to access
 * external services like GitHub, Google, Kaggle, etc.
 *
 * Built-in provider support:
 * - **GitHub**: OAuth 2.1 with PKCE (requires client_secret server-side)
 * - **Google**: OAuth 2.1 with PKCE and offline access
 * - **Kaggle**: Standard OAuth 2.1 for MCP server access
 *
 * Provider-specific notes:
 * - GitHub requires `client_secret` for token exchange even with PKCE
 * - GitHub returns user info from `https://api.github.com/user` with `login`, `avatar_url` fields
 * - Google supports pure PKCE without client_secret
 * - All providers need backend proxy for token exchange due to CORS restrictions
 *
 * @module identity
 *
 * @example
 * ```tsx
 * import { useIdentity } from '@datalayer/agent-runtimes';
 *
 * function MyComponent() {
 *   const { connect, disconnect, isConnected, identities } = useIdentity({
 *     providers: {
 *       github: { clientId: 'your-github-client-id' },
 *     },
 *   });
 *
 *   return (
 *     <button onClick={() => connect('github', ['repo'])}>
 *       {isConnected('github') ? 'Disconnect GitHub' : 'Connect GitHub'}
 *     </button>
 *   );
 * }
 * ```
 */

// Types
export type {
  OAuthProvider,
  OAuthToken,
  Identity,
  ProviderUserInfo,
  OAuthProviderConfig,
  AuthorizationRequest,
  AuthorizationCallback,
  IdentityState,
  IdentityActions,
  IdentityStore,
  AuthType,
  TokenProviderConfig,
  OAuthIdentityProviderConfig,
  TokenIdentityProviderConfig,
  IdentityProviderConfig,
  IdentityProvidersConfig,
} from './types';

export {
  GITHUB_PROVIDER,
  GOOGLE_PROVIDER,
  KAGGLE_PROVIDER,
  KAGGLE_TOKEN_PROVIDER,
} from './types';

// PKCE utilities
export {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  generatePKCEPair,
} from './pkce';

// Dynamic Client Registration (DCR)
export {
  discoverAuthorizationServer,
  supportsDCR,
  registerClient,
  updateClientRegistration,
  deleteClientRegistration,
  getOrCreateDynamicClient,
  loadDynamicClient,
  saveDynamicClient,
  removeDynamicClient,
  getAllDynamicClients,
  clearAllDynamicClients,
  dynamicClientToProviderConfig,
  type AuthorizationServerMetadata,
  type ClientRegistrationRequest,
  type ClientRegistrationResponse,
  type ClientRegistrationError,
  type DynamicClient,
} from './dcr';

// Store
export {
  useIdentityStore,
  useConnectedIdentities,
  useConnectedProviders,
  useIdentity as useIdentitySelector,
  useIsProviderConnected,
  usePendingAuthorization,
  useIdentityLoading,
  useIdentityError,
  configureBuiltinProviders,
} from './identityStore';

// Main hook
export {
  useIdentity,
  type UseIdentityOptions,
  type UseIdentityReturn,
} from './useIdentity';

// UI Components
export {
  IdentityButton,
  IdentityConnect,
  IdentityMenu,
  type IdentityButtonProps,
  type IdentityConnectProps,
  type IdentityMenuProps,
} from './IdentityConnect';

// OAuth Callback
export { OAuthCallback, type OAuthCallbackProps } from './OAuthCallback';
