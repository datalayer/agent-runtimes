/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useCallback } from 'react';
import {
  Box,
  Text,
  Button,
  Label,
  Flash,
  ActionList,
  ActionMenu,
  Avatar,
} from '@primer/react';
import {
  MarkGithubIcon,
  LinkIcon,
  UnlinkIcon,
  CheckCircleFillIcon,
  AlertIcon,
  KeyIcon,
} from '@primer/octicons-react';
import { useIdentity } from './useIdentity';
import type { OAuthProvider, OAuthProviderConfig, Identity } from './types';
import { GITHUB_PROVIDER, GOOGLE_PROVIDER, KAGGLE_PROVIDER } from './types';

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
    icon: KeyIcon, // Would use Google icon if available
    color: '#4285f4',
    description: 'Access Google services and APIs',
  },
  kaggle: {
    name: 'Kaggle',
    icon: KeyIcon, // Would use Kaggle icon if available
    color: '#20beff',
    description: 'Access Kaggle datasets and notebooks',
  },
  linkedin: {
    name: 'LinkedIn',
    icon: KeyIcon,
    color: '#0077b5',
    description: 'Access LinkedIn profile and connections',
  },
  slack: {
    name: 'Slack',
    icon: KeyIcon,
    color: '#4a154b',
    description: 'Access Slack workspaces and channels',
  },
  notion: {
    name: 'Notion',
    icon: KeyIcon,
    color: '#000000',
    description: 'Access Notion pages and databases',
  },
  custom: {
    name: 'Custom',
    icon: LinkIcon,
    color: '#6f42c1',
    description: 'Custom OAuth provider',
  },
};

/**
 * Default scopes for common providers
 */
const DEFAULT_SCOPES: Record<OAuthProvider, string[]> = {
  github: ['read:user', 'user:email'],
  google: ['openid', 'profile', 'email'],
  kaggle: ['read'],
  linkedin: ['r_liteprofile', 'r_emailaddress'],
  slack: ['users:read', 'channels:read'],
  notion: ['read_content'],
  custom: [],
};

/**
 * Props for IdentityButton component
 */
export interface IdentityButtonProps {
  /** Provider type */
  provider: OAuthProvider;
  /** OAuth client ID (required for connecting) */
  clientId?: string;
  /** Custom provider configuration (for custom providers) */
  providerConfig?: Partial<OAuthProviderConfig>;
  /** Scopes to request (defaults to provider defaults) */
  scopes?: string[];
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Show full provider info or just icon */
  variant?: 'full' | 'compact' | 'icon';
  /** Callback when connection completes */
  onConnect?: (identity: Identity) => void;
  /** Callback when disconnection completes */
  onDisconnect?: (provider: OAuthProvider) => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
}

/**
 * Single provider connect/disconnect button
 */
export const IdentityButton: React.FC<IdentityButtonProps> = ({
  provider,
  clientId,
  providerConfig,
  scopes,
  disabled = false,
  size = 'medium',
  variant = 'full',
  onConnect,
  onDisconnect,
  onError,
}) => {
  const {
    identities,
    isAuthorizing,
    error,
    connect,
    disconnect,
    configureProvider,
  } = useIdentity();

  const display = PROVIDER_DISPLAY[provider] || PROVIDER_DISPLAY.custom;
  const identity = identities.find(id => id.provider === provider);
  const isConnected = !!identity;
  const isPending = isAuthorizing;

  // Configure provider on mount if clientId is provided
  React.useEffect(() => {
    if (clientId) {
      const baseConfig =
        provider === 'github'
          ? GITHUB_PROVIDER
          : provider === 'google'
            ? GOOGLE_PROVIDER
            : provider === 'kaggle'
              ? KAGGLE_PROVIDER
              : undefined;

      if (baseConfig) {
        // Build redirect URI from current page URL (without query params) if not provided
        // This allows OAuth callback to return to the same page that initiated the flow
        const redirectUri =
          providerConfig?.redirectUri ||
          (typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}`
            : '');

        configureProvider({
          ...baseConfig,
          ...providerConfig,
          provider,
          clientId,
          redirectUri,
        } as OAuthProviderConfig);
      }
    }
  }, [clientId, provider, providerConfig, configureProvider]);

  const handleClick = useCallback(async () => {
    try {
      if (isConnected) {
        await disconnect(provider);
        onDisconnect?.(provider);
      } else {
        await connect(provider, scopes || DEFAULT_SCOPES[provider]);
        // If we get here without error, connection succeeded
        // The identity will be updated in the store
      }
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [
    isConnected,
    provider,
    scopes,
    connect,
    disconnect,
    onConnect,
    onDisconnect,
    onError,
  ]);

  // Handle error display
  React.useEffect(() => {
    if (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [error, onError]);

  const buttonProps = {
    onClick: handleClick,
    disabled: disabled || isPending || (!clientId && !isConnected),
    size: size === 'large' ? 'large' : size === 'small' ? 'small' : 'medium',
  } as const;

  if (variant === 'icon') {
    return (
      <Button
        {...buttonProps}
        variant={isConnected ? 'primary' : 'default'}
        aria-label={
          isConnected ? `Disconnect ${display.name}` : `Connect ${display.name}`
        }
        sx={{
          width: size === 'small' ? 28 : size === 'large' ? 44 : 36,
          height: size === 'small' ? 28 : size === 'large' ? 44 : 36,
          p: 0,
        }}
      >
        {isPending ? (
          <Box
            as="span"
            className="anim-rotate"
            sx={{ display: 'inline-block' }}
          >
            ⏳
          </Box>
        ) : (
          <display.icon size={size === 'small' ? 14 : 18} />
        )}
      </Button>
    );
  }

  if (variant === 'compact') {
    return (
      <Button
        {...buttonProps}
        variant={isConnected ? 'primary' : 'default'}
        leadingVisual={display.icon}
        trailingVisual={isConnected ? CheckCircleFillIcon : undefined}
      >
        {isPending ? 'Connecting...' : display.name}
      </Button>
    );
  }

  // Full variant
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        border: '1px solid',
        borderColor: isConnected ? 'success.muted' : 'border.default',
        borderRadius: 2,
        backgroundColor: isConnected ? 'success.subtle' : 'canvas.subtle',
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: display.color,
          color: 'white',
        }}
      >
        <display.icon size={20} />
      </Box>
      <Box sx={{ flex: 1 }}>
        <Text sx={{ fontWeight: 'bold', display: 'block' }}>
          {display.name}
        </Text>
        <Text sx={{ fontSize: 0, color: 'fg.muted', display: 'block' }}>
          {isConnected && identity?.userInfo
            ? `Connected as ${identity.userInfo.name || identity.userInfo.email}`
            : display.description}
        </Text>
      </Box>
      <Button
        {...buttonProps}
        variant={isConnected ? 'danger' : 'primary'}
        leadingVisual={isConnected ? UnlinkIcon : LinkIcon}
      >
        {isPending ? 'Working...' : isConnected ? 'Disconnect' : 'Connect'}
      </Button>
    </Box>
  );
};

/**
 * Props for IdentityConnect component
 */
export interface IdentityConnectProps {
  /** Provider configurations with client IDs */
  providers: {
    [K in OAuthProvider]?: {
      clientId: string;
      scopes?: string[];
      config?: Partial<OAuthProviderConfig>;
    };
  };
  /** Layout variant */
  layout?: 'list' | 'grid' | 'inline';
  /** Show title/header */
  showHeader?: boolean;
  /** Custom title */
  title?: string;
  /** Size variant */
  size?: 'small' | 'medium' | 'large';
  /** Whether to show descriptions */
  showDescriptions?: boolean;
  /** Callback when any identity connects */
  onConnect?: (identity: Identity) => void;
  /** Callback when any identity disconnects */
  onDisconnect?: (provider: OAuthProvider) => void;
  /** Callback when error occurs */
  onError?: (provider: OAuthProvider, error: Error) => void;
  /** Whether all buttons are disabled */
  disabled?: boolean;
}

/**
 * Multi-provider identity connection panel
 */
export const IdentityConnect: React.FC<IdentityConnectProps> = ({
  providers,
  layout = 'list',
  showHeader = true,
  title = 'Connected Accounts',
  size = 'medium',
  showDescriptions = true,
  onConnect,
  onDisconnect,
  onError,
  disabled = false,
}) => {
  const { identities, error } = useIdentity();
  const connectedCount = identities.length;
  const providerKeys = Object.keys(providers) as OAuthProvider[];

  const handleConnect = useCallback(
    (identity: Identity) => {
      onConnect?.(identity);
    },
    [onConnect],
  );

  const handleDisconnect = useCallback(
    (provider: OAuthProvider) => {
      onDisconnect?.(provider);
    },
    [onDisconnect],
  );

  const handleError = useCallback(
    (provider: OAuthProvider) => (err: Error) => {
      onError?.(provider, err);
    },
    [onError],
  );

  if (layout === 'inline') {
    return (
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        {showHeader && (
          <Text sx={{ fontSize: 1, color: 'fg.muted', mr: 2 }}>{title}:</Text>
        )}
        {providerKeys.map(provider => {
          const config = providers[provider]!;
          return (
            <IdentityButton
              key={provider}
              provider={provider}
              clientId={config.clientId}
              scopes={config.scopes}
              providerConfig={config.config}
              size={size}
              variant="icon"
              disabled={disabled}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onError={handleError(provider)}
            />
          );
        })}
        {connectedCount > 0 && (
          <Label variant="success">
            <Box
              as="span"
              sx={{
                mr: 1,
                display: 'inline-flex',
                verticalAlign: 'text-bottom',
              }}
            >
              <CheckCircleFillIcon size={12} />
            </Box>
            {connectedCount} connected
          </Label>
        )}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        backgroundColor: 'canvas.default',
        overflow: 'hidden',
      }}
    >
      {showHeader && (
        <Box
          sx={{
            px: 3,
            py: 2,
            borderBottom: '1px solid',
            borderColor: 'border.default',
            backgroundColor: 'canvas.subtle',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text sx={{ fontWeight: 'bold' }}>{title}</Text>
          {connectedCount > 0 && (
            <Label variant="success">
              <Box
                as="span"
                sx={{
                  mr: 1,
                  display: 'inline-flex',
                  verticalAlign: 'text-bottom',
                }}
              >
                <CheckCircleFillIcon size={12} />
              </Box>
              {connectedCount} connected
            </Label>
          )}
        </Box>
      )}

      {error && (
        <Flash variant="danger" sx={{ m: 2, borderRadius: 1 }}>
          <Box
            as="span"
            sx={{ mr: 2, display: 'inline-flex', verticalAlign: 'text-bottom' }}
          >
            <AlertIcon size={16} />
          </Box>
          {error instanceof Error ? error.message : String(error)}
        </Flash>
      )}

      <Box
        sx={{
          p: 2,
          display: layout === 'grid' ? 'grid' : 'flex',
          flexDirection: layout === 'list' ? 'column' : undefined,
          gridTemplateColumns:
            layout === 'grid'
              ? 'repeat(auto-fill, minmax(250px, 1fr))'
              : undefined,
          gap: 2,
        }}
      >
        {providerKeys.map(provider => {
          const config = providers[provider]!;
          return (
            <IdentityButton
              key={provider}
              provider={provider}
              clientId={config.clientId}
              scopes={config.scopes}
              providerConfig={config.config}
              size={size}
              variant={showDescriptions ? 'full' : 'compact'}
              disabled={disabled}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onError={handleError(provider)}
            />
          );
        })}
      </Box>
    </Box>
  );
};

/**
 * Props for IdentityMenu component
 */
export interface IdentityMenuProps {
  /** Provider configurations with client IDs */
  providers: {
    [K in OAuthProvider]?: {
      clientId: string;
      scopes?: string[];
      config?: Partial<OAuthProviderConfig>;
    };
  };
  /** Callback when any identity connects */
  onConnect?: (identity: Identity) => void;
  /** Callback when any identity disconnects */
  onDisconnect?: (provider: OAuthProvider) => void;
  /** Whether the menu is disabled */
  disabled?: boolean;
}

/**
 * Dropdown menu for identity management
 */
export const IdentityMenu: React.FC<IdentityMenuProps> = ({
  providers,
  onConnect,
  onDisconnect,
  disabled = false,
}) => {
  const { identities, connect, disconnect, configureProvider, isAuthorizing } =
    useIdentity();
  const providerKeys = Object.keys(providers) as OAuthProvider[];
  const connectedCount = identities.length;

  // Configure all providers on mount
  React.useEffect(() => {
    providerKeys.forEach(provider => {
      const config = providers[provider]!;
      const baseConfig =
        provider === 'github'
          ? GITHUB_PROVIDER
          : provider === 'google'
            ? GOOGLE_PROVIDER
            : provider === 'kaggle'
              ? KAGGLE_PROVIDER
              : undefined;

      if (baseConfig) {
        // Build redirect URI from current page URL
        const redirectUri =
          typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}`
            : '';

        configureProvider({
          ...baseConfig,
          ...config.config,
          provider,
          clientId: config.clientId,
          redirectUri,
        } as OAuthProviderConfig);
      }
    });
  }, [providerKeys, providers, configureProvider]);

  const handleProviderClick = useCallback(
    async (provider: OAuthProvider) => {
      const identity = identities.find(id => id.provider === provider);
      const config = providers[provider];

      if (identity) {
        await disconnect(provider);
        onDisconnect?.(provider);
      } else if (config) {
        await connect(provider, config.scopes || DEFAULT_SCOPES[provider]);
        // Connection initiated, identity will be updated in store after callback
      }
    },
    [identities, providers, connect, disconnect, onConnect, onDisconnect],
  );

  return (
    <ActionMenu>
      <ActionMenu.Button
        disabled={disabled}
        variant={connectedCount > 0 ? 'primary' : 'default'}
        leadingVisual={KeyIcon}
      >
        Identities
        {connectedCount > 0 && (
          <Label variant="accent" sx={{ ml: 2 }}>
            {connectedCount}
          </Label>
        )}
      </ActionMenu.Button>
      <ActionMenu.Overlay>
        <ActionList>
          <ActionList.Group title="OAuth Providers">
            {providerKeys.map(provider => {
              const display =
                PROVIDER_DISPLAY[provider] || PROVIDER_DISPLAY.custom;
              const identity = identities.find(id => id.provider === provider);
              const isConnected = !!identity;

              return (
                <ActionList.Item
                  key={provider}
                  onSelect={() => handleProviderClick(provider)}
                  disabled={isAuthorizing}
                >
                  <ActionList.LeadingVisual>
                    <display.icon size={16} />
                  </ActionList.LeadingVisual>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Text>{display.name}</Text>
                    {isConnected && (
                      <>
                        {identity?.userInfo?.avatarUrl && (
                          <Avatar src={identity.userInfo.avatarUrl} size={16} />
                        )}
                        <Label variant="success" sx={{ ml: 1 }}>
                          Connected
                        </Label>
                      </>
                    )}
                  </Box>
                  <ActionList.TrailingVisual>
                    {isConnected ? (
                      <UnlinkIcon size={16} />
                    ) : (
                      <LinkIcon size={16} />
                    )}
                  </ActionList.TrailingVisual>
                </ActionList.Item>
              );
            })}
          </ActionList.Group>
        </ActionList>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
};

export default IdentityConnect;
