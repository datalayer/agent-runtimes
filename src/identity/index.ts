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
 * @module identity
 *
 * @example
 * ```tsx
 * import { useIdentity } from '@datalayer/agent-runtimes';
 *
 * function MyComponent() {
 *   const { connect, disconnect, isConnected, identities } = useIdentity({
 *     providers: {
 *       github: { clientId: 'your-client-id' },
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
} from './types';

export { GITHUB_PROVIDER, GOOGLE_PROVIDER, KAGGLE_PROVIDER } from './types';

// PKCE utilities
export {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  generatePKCEPair,
} from './pkce';

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
