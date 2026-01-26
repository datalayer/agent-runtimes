/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentIdentity component - Shows connected identity providers with token status.
 * Displays expiration details and allows reconnection if token expired.
 *
 * @module components/chat/components/AgentIdentity
 */

import React, { useCallback, useMemo } from 'react';
import {
  Box,
  Text,
  Button,
  Label,
  Avatar,
  Flash,
  Tooltip,
} from '@primer/react';
import {
  MarkGithubIcon,
  LinkIcon,
  UnlinkIcon,
  CheckCircleFillIcon,
  AlertIcon,
  ClockIcon,
  SyncIcon,
  KeyIcon,
} from '@primer/octicons-react';
import { useIdentity, IdentityButton } from '../../../identity';
import type {
  OAuthProvider,
  OAuthProviderConfig,
  Identity,
} from '../../../identity';
import {
  GITHUB_PROVIDER,
  GOOGLE_PROVIDER,
  KAGGLE_PROVIDER,
} from '../../../identity';

/**
 * Provider display configuration
 */
interface ProviderDisplay {
  name: string;
  icon: React.ElementType;
  color: string;
  description: string;
}

const PROVIDER_DISPLAY: Record<OAuthProvider, ProviderDisplay> = {
  github: {
    name: 'GitHub',
    icon: MarkGithubIcon,
    color: '#24292f',
    description: 'Access GitHub repositories and APIs',
  },
  google: {
    name: 'Google',
    icon: KeyIcon,
    color: '#4285f4',
    description: 'Access Google services and APIs',
  },
  kaggle: {
    name: 'Kaggle',
    icon: KeyIcon,
    color: '#20beff',
    description: 'Access Kaggle datasets and notebooks',
  },
  linkedin: {
    name: 'LinkedIn',
    icon: KeyIcon,
    color: '#0077b5',
    description: 'Access LinkedIn profile',
  },
  slack: {
    name: 'Slack',
    icon: KeyIcon,
    color: '#4a154b',
    description: 'Access Slack workspaces',
  },
  notion: {
    name: 'Notion',
    icon: KeyIcon,
    color: '#000000',
    description: 'Access Notion pages',
  },
  custom: {
    name: 'Custom',
    icon: LinkIcon,
    color: '#6f42c1',
    description: 'Custom OAuth provider',
  },
};

const DEFAULT_SCOPES: Record<OAuthProvider, string[]> = {
  github: ['read:user', 'user:email', 'repo'],
  google: ['openid', 'profile', 'email'],
  kaggle: ['read'],
  linkedin: ['r_liteprofile', 'r_emailaddress'],
  slack: ['users:read', 'channels:read'],
  notion: ['read_content'],
  custom: [],
};

/**
 * Token status information
 */
export interface TokenStatus {
  isExpired: boolean;
  isExpiringSoon: boolean;
  expiresAt?: Date;
  timeUntilExpiry?: number; // milliseconds
  timeSinceExpiry?: number; // milliseconds
}

/**
 * Calculate token status from expiration timestamp
 */
export function getTokenStatus(expiresAt?: number): TokenStatus {
  if (!expiresAt) {
    return { isExpired: false, isExpiringSoon: false };
  }

  const now = Date.now();
  const expiresAtDate = new Date(expiresAt);
  const timeUntilExpiry = expiresAt - now;
  const timeSinceExpiry = now - expiresAt;

  // Token expires within 5 minutes - considered "expiring soon"
  const EXPIRING_SOON_THRESHOLD = 5 * 60 * 1000;

  return {
    isExpired: timeUntilExpiry < 0,
    isExpiringSoon:
      timeUntilExpiry > 0 && timeUntilExpiry < EXPIRING_SOON_THRESHOLD,
    expiresAt: expiresAtDate,
    timeUntilExpiry: timeUntilExpiry > 0 ? timeUntilExpiry : undefined,
    timeSinceExpiry: timeUntilExpiry < 0 ? timeSinceExpiry : undefined,
  };
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (hours > 0) {
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  if (minutes > 0) {
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

/**
 * Format expiration status text
 */
export function formatExpirationStatus(status: TokenStatus): string {
  if (status.isExpired && status.timeSinceExpiry) {
    return `Expired ${formatDuration(status.timeSinceExpiry)} ago`;
  }
  if (status.timeUntilExpiry) {
    if (status.isExpiringSoon) {
      return `Expires in ${formatDuration(status.timeUntilExpiry)}`;
    }
    return `Expires in ${formatDuration(status.timeUntilExpiry)}`;
  }
  // Token has no expiration info - likely a long-lived token
  return 'Token does not expire';
}

/**
 * Props for IdentityCard component
 */
export interface IdentityCardProps {
  /** Identity to display */
  identity: Identity;
  /** Provider configuration */
  providerConfig?: {
    clientId: string;
    scopes?: string[];
    config?: Partial<OAuthProviderConfig>;
  };
  /** Show detailed expiration info */
  showExpirationDetails?: boolean;
  /** Allow reconnection */
  allowReconnect?: boolean;
  /** Callback when connected */
  onConnect?: (identity: Identity) => void;
  /** Callback when disconnected */
  onDisconnect?: (provider: OAuthProvider) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

/**
 * Single identity card with status and actions
 */
export function IdentityCard({
  identity,
  providerConfig,
  showExpirationDetails = true,
  allowReconnect = true,
  onConnect: _onConnect,
  onDisconnect,
  onError,
}: IdentityCardProps) {
  const { connect, disconnect, configureProvider, isAuthorizing } =
    useIdentity();
  const provider = identity.provider as OAuthProvider;
  const display = PROVIDER_DISPLAY[provider] || PROVIDER_DISPLAY.custom;
  const tokenStatus = useMemo(
    () => getTokenStatus(identity.token?.expiresAt),
    [identity.token?.expiresAt],
  );

  // Configure provider on mount if config is provided
  React.useEffect(() => {
    if (providerConfig?.clientId) {
      const baseConfig =
        provider === 'github'
          ? GITHUB_PROVIDER
          : provider === 'google'
            ? GOOGLE_PROVIDER
            : provider === 'kaggle'
              ? KAGGLE_PROVIDER
              : undefined;

      if (baseConfig) {
        const redirectUri =
          providerConfig.config?.redirectUri ||
          (typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}`
            : '');

        configureProvider({
          ...baseConfig,
          ...providerConfig.config,
          provider,
          clientId: providerConfig.clientId,
          redirectUri,
        } as OAuthProviderConfig);
      }
    }
  }, [providerConfig, provider, configureProvider]);

  const handleReconnect = useCallback(async () => {
    try {
      const scopes = providerConfig?.scopes || DEFAULT_SCOPES[provider];
      await connect(provider, scopes);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [provider, providerConfig?.scopes, connect, onError]);

  const handleDisconnect = useCallback(async () => {
    try {
      await disconnect(provider);
      onDisconnect?.(provider);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [provider, disconnect, onDisconnect, onError]);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        p: 3,
        border: '1px solid',
        borderColor: tokenStatus.isExpired
          ? 'danger.muted'
          : tokenStatus.isExpiringSoon
            ? 'attention.muted'
            : 'success.muted',
        borderRadius: 2,
        backgroundColor: tokenStatus.isExpired
          ? 'danger.subtle'
          : tokenStatus.isExpiringSoon
            ? 'attention.subtle'
            : 'success.subtle',
      }}
    >
      {/* Header row with provider info */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* Provider Icon */}
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: display.color,
            color: 'white',
            flexShrink: 0,
          }}
        >
          <display.icon size={16} />
        </Box>
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Text sx={{ fontWeight: 'semibold', fontSize: 1 }}>
            {display.name}
          </Text>
          {/* Show auth type badge */}
          <Label size="small" variant="secondary">
            {identity.authType === 'token' ? 'API Key' : 'OAuth'}
          </Label>
        </Box>
        {tokenStatus.isExpired ? (
          <Label variant="danger" size="small">
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <AlertIcon size={12} /> Expired
            </Box>
          </Label>
        ) : tokenStatus.isExpiringSoon ? (
          <Label variant="attention" size="small">
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <ClockIcon size={12} /> Expiring Soon
            </Box>
          </Label>
        ) : (
          <Label variant="success" size="small">
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleFillIcon size={12} /> Connected
            </Box>
          </Label>
        )}
      </Box>

      {/* User info row with avatar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {/* Avatar */}
        {identity.userInfo?.avatarUrl && (
          <a
            href={
              identity.userInfo.profileUrl ||
              (provider === 'github'
                ? `https://github.com/${identity.userInfo.username}`
                : undefined)
            }
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'block', lineHeight: 0, flexShrink: 0 }}
          >
            <Avatar
              src={identity.userInfo.avatarUrl}
              size={32}
              alt={
                identity.userInfo.name ||
                identity.userInfo.username ||
                display.name
              }
              sx={{ cursor: 'pointer' }}
            />
          </a>
        )}

        {/* Identity Info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Name */}
          {identity.userInfo?.name && (
            <Text
              sx={{ fontWeight: 'semibold', fontSize: 1, display: 'block' }}
            >
              {identity.userInfo.name}
            </Text>
          )}

          {/* Username / Email */}
          {(identity.userInfo?.username || identity.userInfo?.email) && (
            <a
              href={
                identity.userInfo.profileUrl ||
                (provider === 'github'
                  ? `https://github.com/${identity.userInfo.username}`
                  : undefined)
              }
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <Text
                sx={{
                  fontSize: 0,
                  color: 'fg.muted',
                  display: 'block',
                  ':hover': { textDecoration: 'underline' },
                }}
              >
                {identity.userInfo.username
                  ? `@${identity.userInfo.username}`
                  : identity.userInfo.email}
              </Text>
            </a>
          )}
        </Box>
      </Box>

      {/* Expiration Details */}
      {showExpirationDetails && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <ClockIcon size={12} />
          <Text
            sx={{
              fontSize: 0,
              color: tokenStatus.isExpired
                ? 'danger.fg'
                : tokenStatus.isExpiringSoon
                  ? 'attention.fg'
                  : 'fg.muted',
            }}
          >
            {formatExpirationStatus(tokenStatus)}
          </Text>
        </Box>
      )}

      {/* Scopes */}
      {identity.scopes && identity.scopes.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          {identity.scopes.map(scope => (
            <Label key={scope} size="small" variant="secondary">
              {scope}
            </Label>
          ))}
        </Box>
      )}

      {/* Actions */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          mt: 1,
        }}
      >
        {tokenStatus.isExpired &&
          allowReconnect &&
          providerConfig?.clientId && (
            <Tooltip text="Reconnect to refresh token">
              <Button
                variant="primary"
                size="small"
                leadingVisual={SyncIcon}
                onClick={handleReconnect}
                disabled={isAuthorizing}
              >
                {isAuthorizing ? 'Connecting...' : 'Reconnect'}
              </Button>
            </Tooltip>
          )}
        <Button
          variant={tokenStatus.isExpired ? 'invisible' : 'danger'}
          size="small"
          leadingVisual={UnlinkIcon}
          onClick={handleDisconnect}
          disabled={isAuthorizing}
        >
          Disconnect from {display.name}
        </Button>
      </Box>
    </Box>
  );
}

/**
 * Props for AgentIdentity component
 */
export interface AgentIdentityProps {
  /** Provider configurations with client IDs */
  providers?: {
    [K in OAuthProvider]?: {
      clientId: string;
      scopes?: string[];
      config?: Partial<OAuthProviderConfig>;
    };
  };
  /** Title for the section */
  title?: string;
  /** Show header */
  showHeader?: boolean;
  /** Show description */
  showDescription?: boolean;
  /** Description text */
  description?: string;
  /** Show expiration details */
  showExpirationDetails?: boolean;
  /** Allow reconnection */
  allowReconnect?: boolean;
  /** Callback when identity connects */
  onConnect?: (identity: Identity) => void;
  /** Callback when identity disconnects */
  onDisconnect?: (provider: OAuthProvider) => void;
  /** Callback on error */
  onError?: (provider: OAuthProvider, error: Error) => void;
}

/**
 * AgentIdentity component - Displays all connected identities with status
 *
 * Features:
 * - Shows connected OAuth identities (GitHub, Google, Kaggle, etc.)
 * - Displays token expiration status with detailed timing
 * - Allows reconnection if token expired
 * - Reusable across AgentDetails, AgentConfiguration, etc.
 */
export function AgentIdentity({
  providers,
  title = 'Connected Accounts',
  showHeader = true,
  showDescription = true,
  description = 'Connected identities for this agent. Agents can use these to access external services on your behalf.',
  showExpirationDetails = true,
  allowReconnect = true,
  onConnect,
  onDisconnect,
  onError,
}: AgentIdentityProps) {
  const { identities, error } = useIdentity();

  // Filter to show configured providers AND any token-based connected identities
  // Token-based identities (like Kaggle) should always be shown if connected
  const displayIdentities = useMemo(() => {
    if (providers) {
      const providerKeys = Object.keys(providers) as OAuthProvider[];
      // Include configured providers AND any token-based connected identities
      return identities.filter(
        id =>
          providerKeys.includes(id.provider as OAuthProvider) ||
          (id.authType === 'token' && id.isConnected),
      );
    }
    return identities;
  }, [identities, providers]);

  // Get list of connected provider names
  const connectedProviderNames = useMemo(
    () => new Set(identities.map(id => id.provider)),
    [identities],
  );

  // Get providers that are NOT yet connected (to show connect buttons)
  const unconnectedProviders = useMemo(() => {
    if (!providers) return {};
    const providerKeys = Object.keys(providers) as OAuthProvider[];
    const unconnected: typeof providers = {};
    for (const provider of providerKeys) {
      if (!connectedProviderNames.has(provider)) {
        unconnected[provider] = providers[provider];
      }
    }
    return unconnected;
  }, [providers, connectedProviderNames]);

  const hasUnconnected = Object.keys(unconnectedProviders).length > 0;

  const handleError = useCallback(
    (provider: OAuthProvider) => (err: Error) => {
      onError?.(provider, err);
    },
    [onError],
  );

  // No identities and no providers configured
  if (displayIdentities.length === 0 && !providers) {
    return null;
  }

  return (
    <Box>
      {showHeader && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            mb: 2,
          }}
        >
          <KeyIcon size={16} />
          <Text sx={{ fontSize: 1, fontWeight: 'semibold', color: 'fg.muted' }}>
            {title}
          </Text>
        </Box>
      )}

      <Box
        sx={{
          p: 3,
          bg: 'canvas.subtle',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'border.default',
        }}
      >
        {showDescription && (
          <Text
            sx={{
              fontSize: 0,
              color: 'fg.muted',
              display: 'block',
              mb: displayIdentities.length > 0 ? 3 : 0,
            }}
          >
            {description}
          </Text>
        )}

        {error && (
          <Flash variant="danger" sx={{ mb: 3 }}>
            {error instanceof Error ? error.message : String(error)}
          </Flash>
        )}

        {displayIdentities.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {displayIdentities.map(identity => (
              <IdentityCard
                key={identity.provider}
                identity={identity}
                providerConfig={providers?.[identity.provider as OAuthProvider]}
                showExpirationDetails={showExpirationDetails}
                allowReconnect={allowReconnect}
                onConnect={onConnect}
                onDisconnect={onDisconnect}
                onError={handleError(identity.provider as OAuthProvider)}
              />
            ))}
          </Box>
        ) : !hasUnconnected ? (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              color: 'fg.muted',
            }}
          >
            <LinkIcon size={16} />
            <Text sx={{ fontSize: 1 }}>No connected accounts</Text>
          </Box>
        ) : null}

        {/* Show connect buttons for unconnected providers */}
        {hasUnconnected && (
          <Box sx={{ mt: displayIdentities.length > 0 ? 3 : 0 }}>
            {displayIdentities.length > 0 && (
              <Text
                sx={{
                  fontSize: 0,
                  color: 'fg.muted',
                  display: 'block',
                  mb: 2,
                }}
              >
                Connect additional accounts:
              </Text>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(Object.keys(unconnectedProviders) as OAuthProvider[]).map(
                provider => {
                  const config = unconnectedProviders[provider]!;
                  return (
                    <IdentityButton
                      key={provider}
                      provider={provider}
                      clientId={config.clientId}
                      scopes={config.scopes}
                      providerConfig={config.config}
                      size="medium"
                      variant="full"
                      onConnect={onConnect}
                      onDisconnect={onDisconnect}
                      onError={handleError(provider)}
                    />
                  );
                },
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default AgentIdentity;
