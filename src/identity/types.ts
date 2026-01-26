/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Identity types for OAuth 2.1 user-delegated access and token-based authentication.
 *
 * @module identity/types
 */

/**
 * Supported OAuth providers
 */
export type OAuthProvider =
  | 'github'
  | 'google'
  | 'kaggle'
  | 'linkedin'
  | 'slack'
  | 'notion'
  | 'custom';

/**
 * Authentication type for a provider
 */
export type AuthType = 'oauth' | 'token';

/**
 * OAuth token with metadata
 */
export interface OAuthToken {
  /** Access token */
  accessToken: string;
  /** Token type (usually 'Bearer') */
  tokenType: string;
  /** Expiration timestamp (ms since epoch) */
  expiresAt?: number;
  /** Refresh token for token renewal */
  refreshToken?: string;
  /** Granted scopes */
  scopes: string[];
  /** Token metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Identity represents a connected OAuth or token-based provider
 */
export interface Identity {
  /** Provider identifier */
  provider: OAuthProvider | string;
  /** Authentication type */
  authType?: AuthType;
  /** Display name for UI */
  displayName: string;
  /** Icon URL for UI */
  iconUrl?: string;
  /** Required OAuth scopes */
  scopes: string[];
  /** Whether this identity is currently connected */
  isConnected: boolean;
  /** Connection timestamp */
  connectedAt?: number;
  /** User info from provider (e.g., username, email) */
  userInfo?: ProviderUserInfo;
  /** Token (only available when connected) */
  token?: OAuthToken;
}

/**
 * User info from OAuth provider
 */
export interface ProviderUserInfo {
  /** Provider-specific user ID */
  id: string;
  /** Username or handle */
  username?: string;
  /** Display name */
  name?: string;
  /** Email address */
  email?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Profile URL */
  profileUrl?: string;
  /** Additional provider-specific data */
  raw?: Record<string, unknown>;
}

/**
 * OAuth provider configuration
 */
export interface OAuthProviderConfig {
  /** Provider identifier */
  provider: OAuthProvider | string;
  /** Display name */
  displayName: string;
  /** Icon URL */
  iconUrl?: string;
  /** OAuth client ID */
  clientId: string;
  /** Authorization endpoint */
  authorizationUrl: string;
  /** Token endpoint */
  tokenUrl: string;
  /** User info endpoint */
  userInfoUrl?: string;
  /** Revocation endpoint */
  revocationUrl?: string;
  /** Default scopes */
  defaultScopes: string[];
  /** Redirect URI */
  redirectUri: string;
  /** Additional OAuth parameters */
  additionalParams?: Record<string, string>;
}

/**
 * Pending authorization request
 */
export interface AuthorizationRequest {
  /** Request ID (for tracking) */
  requestId: string;
  /** Provider requiring authorization */
  provider: OAuthProvider | string;
  /** OAuth authorization URL (full URL with params) */
  authUrl: string;
  /** State parameter for CSRF protection */
  state: string;
  /** PKCE code verifier */
  codeVerifier: string;
  /** Requested scopes */
  scopes: string[];
  /** Request timestamp */
  requestedAt: number;
  /** Optional callback after authorization */
  onComplete?: (identity: Identity) => void;
  /** Optional callback on error */
  onError?: (error: Error) => void;
}

/**
 * Authorization callback parameters
 */
export interface AuthorizationCallback {
  /** Authorization code */
  code: string;
  /** State parameter (for CSRF verification) */
  state: string;
  /** Error code (if authorization failed) */
  error?: string;
  /** Error description */
  errorDescription?: string;
}

/**
 * Identity store state
 */
export interface IdentityState {
  /** Connected identities by provider */
  identities: Map<string, Identity>;
  /** Pending authorization request */
  pendingAuthorization: AuthorizationRequest | null;
  /** Provider configurations */
  providerConfigs: Map<string, OAuthProviderConfig>;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
}

/**
 * Identity store actions
 */
export interface IdentityActions {
  /** Configure an OAuth provider */
  configureProvider: (config: OAuthProviderConfig) => void;
  /** Start OAuth flow for a provider */
  startAuthorization: (
    provider: string,
    scopes?: string[],
    options?: {
      onComplete?: (identity: Identity) => void;
      onError?: (error: Error) => void;
    },
  ) => Promise<string>;
  /** Complete OAuth flow with callback params */
  completeAuthorization: (callback: AuthorizationCallback) => Promise<Identity>;
  /** Cancel pending authorization */
  cancelAuthorization: () => void;
  /** Connect with a token directly (for token-based providers like Kaggle) */
  connectWithToken: (
    provider: string,
    token: string,
    options?: {
      displayName?: string;
      iconUrl?: string;
      userInfo?: ProviderUserInfo;
    },
  ) => Promise<Identity>;
  /** Disconnect a provider (revoke tokens) */
  disconnect: (provider: string) => Promise<void>;
  /** Refresh token for a provider */
  refreshToken: (provider: string) => Promise<OAuthToken>;
  /** Get identity for a provider */
  getIdentity: (provider: string) => Identity | undefined;
  /** Check if provider is connected */
  isConnected: (provider: string) => boolean;
  /** Get token for a provider (refreshes if needed) */
  getToken: (provider: string) => Promise<OAuthToken | null>;
  /** Clear all identities */
  clearAll: () => void;
  /** Set error */
  setError: (error: Error | null) => void;
}

/**
 * Complete identity store type
 */
export type IdentityStore = IdentityState & IdentityActions;

/**
 * Built-in provider configurations
 *
 * These constants provide OAuth endpoint URLs and default scopes for common providers.
 * Each provider has specific OAuth behavior:
 * - GitHub: Requires client_secret for token exchange, returns user info from /user endpoint
 * - Google: Supports pure PKCE, has offline access mode
 * - Kaggle: Follows standard OAuth 2.1
 */

/**
 * GitHub OAuth provider configuration.
 * Note: GitHub requires client_secret for token exchange even with PKCE.
 * User info endpoint returns login, name, email, avatar_url fields.
 */
export const GITHUB_PROVIDER: Partial<OAuthProviderConfig> = {
  provider: 'github',
  displayName: 'GitHub',
  iconUrl: 'https://github.githubassets.com/favicons/favicon.svg',
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  userInfoUrl: 'https://api.github.com/user',
  revocationUrl: 'https://api.github.com/applications/{client_id}/token',
  defaultScopes: ['read:user', 'user:email'],
};

/**
 * Google OAuth provider configuration.
 * Supports offline access for refresh tokens with access_type=offline.
 */
export const GOOGLE_PROVIDER: Partial<OAuthProviderConfig> = {
  provider: 'google',
  displayName: 'Google',
  iconUrl: 'https://www.google.com/favicon.ico',
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
  revocationUrl: 'https://oauth2.googleapis.com/revoke',
  defaultScopes: ['openid', 'email', 'profile'],
  additionalParams: {
    access_type: 'offline',
    prompt: 'consent',
  },
};

/**
 * Kaggle OAuth provider configuration.
 * Note: Kaggle doesn't offer public OAuth app registration,
 * so this is only used when Kaggle provides OAuth internally (e.g., via MCP).
 * For Agent Runtimes identity, use token-based authentication instead.
 */
export const KAGGLE_PROVIDER: Partial<OAuthProviderConfig> = {
  provider: 'kaggle',
  displayName: 'Kaggle',
  iconUrl: 'https://www.kaggle.com/static/images/favicon.ico',
  authorizationUrl: 'https://www.kaggle.com/oauth/authorize',
  tokenUrl: 'https://www.kaggle.com/oauth/token',
  userInfoUrl: 'https://www.kaggle.com/api/v1/me',
  defaultScopes: ['datasets:read', 'notebooks:read'],
};

// ============================================================================
// Token-based Provider Configuration
// ============================================================================

/**
 * Token-based provider configuration.
 * For providers that don't support public OAuth app registration (like Kaggle).
 */
export interface TokenProviderConfig {
  /** Provider identifier */
  provider: OAuthProvider | string;
  /** Display name */
  displayName: string;
  /** Icon URL */
  iconUrl?: string;
  /** Profile URL template (use {username} placeholder) */
  profileUrlTemplate?: string;
  /** User info endpoint (called with Bearer token) */
  userInfoUrl?: string;
  /** Description for UI */
  description?: string;
}

/**
 * Kaggle token-based provider configuration.
 * Generate token at: https://www.kaggle.com/settings/account (API section)
 */
export const KAGGLE_TOKEN_PROVIDER: TokenProviderConfig = {
  provider: 'kaggle',
  displayName: 'Kaggle',
  iconUrl: 'https://www.kaggle.com/static/images/favicon.ico',
  profileUrlTemplate: 'https://www.kaggle.com/{username}',
  userInfoUrl: 'https://www.kaggle.com/api/v1/me',
  description: 'Access Kaggle datasets, notebooks, and competitions',
};

// ============================================================================
// Unified Identity Providers Configuration
// ============================================================================

/**
 * OAuth provider configuration for identity providers.
 */
export interface OAuthIdentityProviderConfig {
  /** Authentication type */
  type: 'oauth';
  /** OAuth client ID */
  clientId: string;
  /** OAuth scopes to request */
  scopes?: string[];
  /** Additional OAuth config */
  config?: Partial<OAuthProviderConfig>;
}

/**
 * Token-based provider configuration for identity providers.
 */
export interface TokenIdentityProviderConfig {
  /** Authentication type */
  type: 'token';
  /** API token or key */
  token: string;
  /** Display name override */
  displayName?: string;
  /** Icon URL override */
  iconUrl?: string;
}

/**
 * Unified identity provider configuration.
 * Supports both OAuth and token-based authentication.
 */
export type IdentityProviderConfig =
  | OAuthIdentityProviderConfig
  | TokenIdentityProviderConfig;

/**
 * Configuration for multiple identity providers.
 * Keys are provider names (e.g., 'github', 'kaggle').
 *
 * @example
 * ```typescript
 * const providers: IdentityProvidersConfig = {
 *   github: {
 *     type: 'oauth',
 *     clientId: 'your-github-client-id',
 *     scopes: ['read:user', 'repo'],
 *   },
 *   kaggle: {
 *     type: 'token',
 *     token: 'your-kaggle-api-key',
 *   },
 * };
 * ```
 */
export type IdentityProvidersConfig = {
  [provider: string]: IdentityProviderConfig;
};
