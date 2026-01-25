/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Dynamic Client Registration (DCR) for OAuth 2.1
 *
 * Implements RFC 7591 - OAuth 2.0 Dynamic Client Registration Protocol
 * https://oauth.net/2/dynamic-client-registration/
 *
 * DCR allows OAuth clients to register themselves dynamically without
 * manual setup, which is essential for AI agents that need to connect
 * to OAuth providers discovered at runtime.
 *
 * @module identity/dcr
 */

/**
 * OAuth 2.0 Authorization Server Metadata
 * Based on RFC 8414
 */
export interface AuthorizationServerMetadata {
  /** The authorization server's issuer identifier */
  issuer: string;
  /** URL of the authorization endpoint */
  authorization_endpoint: string;
  /** URL of the token endpoint */
  token_endpoint: string;
  /** URL of the registration endpoint (for DCR) */
  registration_endpoint?: string;
  /** URL of the token revocation endpoint */
  revocation_endpoint?: string;
  /** URL of the userinfo endpoint (OpenID Connect) */
  userinfo_endpoint?: string;
  /** URL of the JWKS endpoint */
  jwks_uri?: string;
  /** Supported response types */
  response_types_supported: string[];
  /** Supported grant types */
  grant_types_supported?: string[];
  /** Supported scopes */
  scopes_supported?: string[];
  /** Supported token endpoint auth methods */
  token_endpoint_auth_methods_supported?: string[];
  /** Supported code challenge methods (PKCE) */
  code_challenge_methods_supported?: string[];
  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Client registration request per RFC 7591
 */
export interface ClientRegistrationRequest {
  /** Array of redirection URI strings */
  redirect_uris: string[];
  /** Requested authentication method for the token endpoint */
  token_endpoint_auth_method?:
    | 'none'
    | 'client_secret_basic'
    | 'client_secret_post'
    | 'private_key_jwt';
  /** Array of grant types the client will use */
  grant_types?: string[];
  /** Array of response types the client will use */
  response_types?: string[];
  /** Human-readable name of the client */
  client_name?: string;
  /** URL of the client's home page */
  client_uri?: string;
  /** URL of the client's logo */
  logo_uri?: string;
  /** Space-separated list of scope values */
  scope?: string;
  /** Array of email addresses of people responsible for this client */
  contacts?: string[];
  /** URL of the terms of service */
  tos_uri?: string;
  /** URL of the privacy policy */
  policy_uri?: string;
  /** URL of the JWKS for the client (for private_key_jwt) */
  jwks_uri?: string;
  /** JWKS document (inline, alternative to jwks_uri) */
  jwks?: { keys: unknown[] };
  /** Software identifier (for software statement) */
  software_id?: string;
  /** Software version */
  software_version?: string;
  /** Software statement JWT */
  software_statement?: string;
  /** Additional registration parameters */
  [key: string]: unknown;
}

/**
 * Client registration response per RFC 7591
 */
export interface ClientRegistrationResponse {
  /** OAuth 2.0 client identifier */
  client_id: string;
  /** OAuth 2.0 client secret (if confidential client) */
  client_secret?: string;
  /** Time at which the client identifier was issued (Unix timestamp) */
  client_id_issued_at?: number;
  /** Time at which the client secret will expire (Unix timestamp, 0 = never) */
  client_secret_expires_at?: number;
  /** Registration access token (for client configuration endpoint) */
  registration_access_token?: string;
  /** Location of the client configuration endpoint */
  registration_client_uri?: string;
  /** All other fields from the registration request echoed back */
  redirect_uris: string[];
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
  client_name?: string;
  client_uri?: string;
  logo_uri?: string;
  scope?: string;
  contacts?: string[];
  tos_uri?: string;
  policy_uri?: string;
  jwks_uri?: string;
  jwks?: { keys: unknown[] };
  software_id?: string;
  software_version?: string;
}

/**
 * DCR error response per RFC 7591
 */
export interface ClientRegistrationError {
  /** Error code */
  error:
    | 'invalid_redirect_uri'
    | 'invalid_client_metadata'
    | 'invalid_software_statement'
    | 'unapproved_software_statement'
    | string;
  /** Human-readable error description */
  error_description?: string;
}

/**
 * Stored DCR client information
 */
export interface DynamicClient {
  /** Provider/issuer identifier */
  issuer: string;
  /** Registered client ID */
  clientId: string;
  /** Registered client secret (if any) */
  clientSecret?: string;
  /** Client secret expiration (if any) */
  clientSecretExpiresAt?: number;
  /** Registration access token (for updates) */
  registrationAccessToken?: string;
  /** Registration client URI (for updates) */
  registrationClientUri?: string;
  /** Registration timestamp */
  registeredAt: number;
  /** Configured redirect URIs */
  redirectUris: string[];
  /** Granted scopes */
  scopes: string[];
  /** Server metadata */
  serverMetadata: AuthorizationServerMetadata;
}

/**
 * Well-known paths for OAuth discovery
 */
const WELL_KNOWN_PATHS = [
  '/.well-known/oauth-authorization-server',
  '/.well-known/openid-configuration',
];

/**
 * Storage key for DCR clients
 */
const DCR_STORAGE_KEY = 'agent-runtimes:dcr-clients';

/**
 * Discover OAuth authorization server metadata
 *
 * @param issuerUrl - The issuer URL (e.g., https://accounts.google.com)
 * @returns Authorization server metadata or null if not found
 */
export async function discoverAuthorizationServer(
  issuerUrl: string,
): Promise<AuthorizationServerMetadata | null> {
  const baseUrl = issuerUrl.replace(/\/$/, '');

  for (const path of WELL_KNOWN_PATHS) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const metadata = await response.json();
        return metadata as AuthorizationServerMetadata;
      }
    } catch {
      // Try next path
      continue;
    }
  }

  return null;
}

/**
 * Check if an authorization server supports Dynamic Client Registration
 *
 * @param metadata - Authorization server metadata
 * @returns True if DCR is supported
 */
export function supportsDCR(metadata: AuthorizationServerMetadata): boolean {
  return !!metadata.registration_endpoint;
}

/**
 * Register a new OAuth client dynamically
 *
 * @param registrationEndpoint - The DCR endpoint URL
 * @param request - Client registration request
 * @param accessToken - Optional access token (for protected registration endpoints)
 * @returns Client registration response
 * @throws Error if registration fails
 */
export async function registerClient(
  registrationEndpoint: string,
  request: ClientRegistrationRequest,
  accessToken?: string,
): Promise<ClientRegistrationResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(registrationEndpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ClientRegistrationError;
    throw new Error(
      `DCR registration failed: ${error.error}${error.error_description ? ` - ${error.error_description}` : ''}`,
    );
  }

  return data as ClientRegistrationResponse;
}

/**
 * Update an existing client registration
 *
 * @param registrationClientUri - The client configuration endpoint
 * @param registrationAccessToken - The registration access token
 * @param updates - Fields to update
 * @returns Updated client registration
 */
export async function updateClientRegistration(
  registrationClientUri: string,
  registrationAccessToken: string,
  updates: Partial<ClientRegistrationRequest>,
): Promise<ClientRegistrationResponse> {
  const response = await fetch(registrationClientUri, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${registrationAccessToken}`,
    },
    body: JSON.stringify(updates),
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ClientRegistrationError;
    throw new Error(
      `DCR update failed: ${error.error}${error.error_description ? ` - ${error.error_description}` : ''}`,
    );
  }

  return data as ClientRegistrationResponse;
}

/**
 * Delete a client registration
 *
 * @param registrationClientUri - The client configuration endpoint
 * @param registrationAccessToken - The registration access token
 */
export async function deleteClientRegistration(
  registrationClientUri: string,
  registrationAccessToken: string,
): Promise<void> {
  const response = await fetch(registrationClientUri, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${registrationAccessToken}`,
    },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(
      `DCR delete failed: ${response.status} ${response.statusText}`,
    );
  }
}

/**
 * Get or create a dynamic client for an OAuth provider
 *
 * This is the main entry point for DCR. It:
 * 1. Checks if we already have a registered client for this issuer
 * 2. If not, discovers the authorization server metadata
 * 3. If DCR is supported, registers a new client
 * 4. Stores the client for future use
 *
 * @param issuerUrl - The OAuth provider's issuer URL
 * @param options - Registration options
 * @returns The dynamic client information
 * @throws Error if DCR is not supported or registration fails
 */
export async function getOrCreateDynamicClient(
  issuerUrl: string,
  options: {
    /** Application name */
    clientName?: string;
    /** Redirect URIs */
    redirectUris: string[];
    /** Requested scopes */
    scopes?: string[];
    /** Force re-registration even if client exists */
    forceNew?: boolean;
    /** Optional initial access token for protected endpoints */
    initialAccessToken?: string;
  },
): Promise<DynamicClient> {
  const normalizedIssuer = issuerUrl.replace(/\/$/, '');

  // Check for existing client
  if (!options.forceNew) {
    const existingClient = loadDynamicClient(normalizedIssuer);
    if (existingClient) {
      // Check if client secret has expired
      if (
        existingClient.clientSecretExpiresAt &&
        existingClient.clientSecretExpiresAt > 0 &&
        existingClient.clientSecretExpiresAt * 1000 < Date.now()
      ) {
        console.log('[DCR] Client secret expired, re-registering');
      } else {
        return existingClient;
      }
    }
  }

  // Discover authorization server
  const metadata = await discoverAuthorizationServer(normalizedIssuer);
  if (!metadata) {
    throw new Error(
      `Could not discover authorization server at ${normalizedIssuer}`,
    );
  }

  // Check for DCR support
  if (!supportsDCR(metadata)) {
    throw new Error(
      `Authorization server at ${normalizedIssuer} does not support Dynamic Client Registration`,
    );
  }

  // Build registration request
  const request: ClientRegistrationRequest = {
    redirect_uris: options.redirectUris,
    client_name: options.clientName || 'Agent Runtimes Client',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none', // Public client (PKCE)
  };

  if (options.scopes?.length) {
    request.scope = options.scopes.join(' ');
  }

  // Register client
  const registrationResponse = await registerClient(
    metadata.registration_endpoint!,
    request,
    options.initialAccessToken,
  );

  // Build dynamic client object
  const dynamicClient: DynamicClient = {
    issuer: normalizedIssuer,
    clientId: registrationResponse.client_id,
    clientSecret: registrationResponse.client_secret,
    clientSecretExpiresAt: registrationResponse.client_secret_expires_at,
    registrationAccessToken: registrationResponse.registration_access_token,
    registrationClientUri: registrationResponse.registration_client_uri,
    registeredAt: Date.now(),
    redirectUris: options.redirectUris,
    scopes: options.scopes || [],
    serverMetadata: metadata,
  };

  // Store for future use
  saveDynamicClient(dynamicClient);

  return dynamicClient;
}

/**
 * Load a dynamic client from storage
 */
export function loadDynamicClient(issuer: string): DynamicClient | null {
  try {
    const stored = localStorage.getItem(DCR_STORAGE_KEY);
    if (!stored) return null;

    const clients = JSON.parse(stored) as Record<string, DynamicClient>;
    return clients[issuer] || null;
  } catch {
    return null;
  }
}

/**
 * Save a dynamic client to storage
 */
export function saveDynamicClient(client: DynamicClient): void {
  try {
    const stored = localStorage.getItem(DCR_STORAGE_KEY);
    const clients = stored ? JSON.parse(stored) : {};
    clients[client.issuer] = client;
    localStorage.setItem(DCR_STORAGE_KEY, JSON.stringify(clients));
  } catch (error) {
    console.error('[DCR] Failed to save client:', error);
  }
}

/**
 * Remove a dynamic client from storage
 */
export function removeDynamicClient(issuer: string): void {
  try {
    const stored = localStorage.getItem(DCR_STORAGE_KEY);
    if (!stored) return;

    const clients = JSON.parse(stored) as Record<string, DynamicClient>;
    delete clients[issuer];
    localStorage.setItem(DCR_STORAGE_KEY, JSON.stringify(clients));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get all stored dynamic clients
 */
export function getAllDynamicClients(): DynamicClient[] {
  try {
    const stored = localStorage.getItem(DCR_STORAGE_KEY);
    if (!stored) return [];

    const clients = JSON.parse(stored) as Record<string, DynamicClient>;
    return Object.values(clients);
  } catch {
    return [];
  }
}

/**
 * Clear all stored dynamic clients
 */
export function clearAllDynamicClients(): void {
  try {
    localStorage.removeItem(DCR_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Build OAuth provider config from a dynamic client
 *
 * This converts a DynamicClient into an OAuthProviderConfig that can be
 * used with the rest of the identity system.
 */
export function dynamicClientToProviderConfig(
  client: DynamicClient,
  displayName?: string,
): {
  provider: string;
  displayName: string;
  clientId: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl?: string;
  revocationUrl?: string;
  defaultScopes: string[];
  redirectUri: string;
} {
  return {
    provider: client.issuer,
    displayName: displayName || new URL(client.issuer).hostname,
    clientId: client.clientId,
    authorizationUrl: client.serverMetadata.authorization_endpoint,
    tokenUrl: client.serverMetadata.token_endpoint,
    userInfoUrl: client.serverMetadata.userinfo_endpoint,
    revocationUrl: client.serverMetadata.revocation_endpoint,
    defaultScopes: client.scopes,
    redirectUri: client.redirectUris[0],
  };
}
