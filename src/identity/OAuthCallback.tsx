/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, Spinner, Flash, Button } from '@primer/react';
import {
  CheckCircleFillIcon,
  AlertIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import { useIdentityStore } from './identityStore';

/**
 * Status of the OAuth callback handling
 */
type CallbackStatus = 'processing' | 'success' | 'error';

/**
 * Props for OAuthCallback component
 */
export interface OAuthCallbackProps {
  /**
   * Custom success message
   */
  successMessage?: string;

  /**
   * Custom error message prefix
   */
  errorMessagePrefix?: string;

  /**
   * Whether to automatically close the window/tab on success
   * @default true for popup flow, false for redirect flow
   */
  autoClose?: boolean;

  /**
   * Delay before auto-closing (in ms)
   * @default 1500
   */
  autoCloseDelay?: number;

  /**
   * Callback when processing completes successfully
   */
  onSuccess?: (provider: string) => void;

  /**
   * Callback when processing fails
   */
  onError?: (error: Error) => void;

  /**
   * URL to redirect to after success (for redirect flow)
   * If not provided, will try to use window.opener for popup flow
   */
  redirectUrl?: string;

  /**
   * Whether to show the close button
   * @default true
   */
  showCloseButton?: boolean;
}

/**
 * OAuth callback handler component.
 *
 * This component should be rendered on the OAuth callback URL (e.g., /oauth/callback).
 * It handles the authorization code exchange and token storage.
 *
 * @example
 * // For redirect flow - mount at /oauth/callback
 * <Route path="/oauth/callback" element={<OAuthCallback redirectUrl="/" />} />
 *
 * @example
 * // For popup flow - mount at /oauth/callback
 * <Route path="/oauth/callback" element={<OAuthCallback autoClose />} />
 */
export const OAuthCallback: React.FC<OAuthCallbackProps> = ({
  successMessage = 'Account connected successfully!',
  errorMessagePrefix = 'Failed to connect account',
  autoClose,
  autoCloseDelay = 1500,
  onSuccess,
  onError,
  redirectUrl,
  showCloseButton = true,
}) => {
  const [status, setStatus] = useState<CallbackStatus>('processing');
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [storeHydrated, setStoreHydrated] = useState(false);

  const completeAuthorization = useIdentityStore(
    state => state.completeAuthorization,
  );
  const pendingAuth = useIdentityStore(state => state.pendingAuthorization);

  // Detect if we're in a popup
  const isPopup = window.opener !== null;

  // Determine auto-close behavior
  const shouldAutoClose = autoClose ?? isPopup;

  // Wait for Zustand store to hydrate from localStorage
  useEffect(() => {
    // Check if store has rehydrated by checking for any data or with a small delay
    const checkHydration = () => {
      // Give zustand-persist time to hydrate from localStorage
      const stored = localStorage.getItem('agent-runtimes-identity');
      if (stored) {
        // Store exists - give it a moment to hydrate
        setTimeout(() => setStoreHydrated(true), 50);
      } else {
        // No stored data, proceed immediately
        setStoreHydrated(true);
      }
    };
    checkHydration();
  }, []);

  useEffect(() => {
    // Wait for store to hydrate before processing callback
    if (!storeHydrated) return;

    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const errorParam = urlParams.get('error');
      const errorDescription = urlParams.get('error_description');

      // Handle OAuth error response
      if (errorParam) {
        const errorMsg = errorDescription || errorParam;
        setError(errorMsg);
        setStatus('error');
        onError?.(new Error(errorMsg));
        return;
      }

      // Validate required parameters
      if (!code || !state) {
        const errorMsg = 'Missing authorization code or state parameter';
        setError(errorMsg);
        setStatus('error');
        onError?.(new Error(errorMsg));
        return;
      }

      // Validate state matches pending authorization
      if (!pendingAuth || pendingAuth.state !== state) {
        const errorMsg = 'Invalid state parameter - possible CSRF attack';
        setError(errorMsg);
        setStatus('error');
        onError?.(new Error(errorMsg));
        return;
      }

      setProvider(pendingAuth.provider);

      try {
        // Complete the authorization - this returns the identity
        const identity = await completeAuthorization({
          code,
          state,
        });
        setStatus('success');
        onSuccess?.(pendingAuth.provider);

        // Handle popup flow - notify parent and close
        if (isPopup && window.opener) {
          // Small delay to ensure localStorage is fully written by Zustand persist
          // before notifying the parent window
          setTimeout(() => {
            console.log(
              '[OAuthCallback] Posting success message to parent with identity',
            );
            // Post message to parent window - include identity so parent doesn't need to read from localStorage
            window.opener.postMessage(
              {
                type: 'oauth-callback-success',
                provider: pendingAuth.provider,
                identity: identity,
              },
              window.location.origin,
            );

            if (shouldAutoClose) {
              setTimeout(() => {
                window.close();
              }, autoCloseDelay);
            }
          }, 50);
        }
        // Handle redirect flow
        else if (redirectUrl) {
          if (shouldAutoClose) {
            setTimeout(() => {
              window.location.href = redirectUrl;
            }, autoCloseDelay);
          }
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : 'Unknown error occurred';
        setError(errorMsg);
        setStatus('error');
        onError?.(err instanceof Error ? err : new Error(errorMsg));

        // Notify popup parent of error
        if (isPopup && window.opener) {
          window.opener.postMessage(
            {
              type: 'oauth-callback-error',
              error: errorMsg,
              provider: pendingAuth.provider,
            },
            window.location.origin,
          );
        }
      }
    };

    handleCallback();
  }, [
    storeHydrated,
    completeAuthorization,
    pendingAuth,
    onSuccess,
    onError,
    shouldAutoClose,
    autoCloseDelay,
    redirectUrl,
    isPopup,
  ]);

  const handleClose = () => {
    if (isPopup) {
      window.close();
    } else if (redirectUrl) {
      window.location.href = redirectUrl;
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: 4,
        backgroundColor: 'canvas.default',
      }}
    >
      <Box
        sx={{
          maxWidth: 400,
          width: '100%',
          padding: 4,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'border.default',
          backgroundColor: 'canvas.subtle',
          textAlign: 'center',
        }}
      >
        {status === 'processing' && (
          <>
            <Spinner size="large" />
            <Text
              sx={{
                display: 'block',
                marginTop: 3,
                fontSize: 2,
                fontWeight: 'bold',
              }}
            >
              Connecting your account...
            </Text>
            <Text sx={{ display: 'block', marginTop: 2, color: 'fg.muted' }}>
              Please wait while we complete the authorization.
            </Text>
          </>
        )}

        {status === 'success' && (
          <>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: 'success.subtle',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
              }}
            >
              <Box sx={{ color: 'success.fg' }}>
                <CheckCircleFillIcon size={32} />
              </Box>
            </Box>
            <Text
              sx={{
                display: 'block',
                marginTop: 3,
                fontSize: 2,
                fontWeight: 'bold',
                color: 'success.fg',
              }}
            >
              {successMessage}
            </Text>
            {provider && (
              <Text sx={{ display: 'block', marginTop: 2, color: 'fg.muted' }}>
                Your {provider} account has been connected.
              </Text>
            )}
            {shouldAutoClose && (
              <Text
                sx={{
                  display: 'block',
                  marginTop: 3,
                  fontSize: 0,
                  color: 'fg.muted',
                }}
              >
                {isPopup
                  ? 'This window will close automatically...'
                  : 'Redirecting...'}
              </Text>
            )}
            {showCloseButton && !shouldAutoClose && (
              <Button
                variant="primary"
                onClick={handleClose}
                sx={{ marginTop: 3 }}
              >
                {isPopup ? 'Close' : 'Continue'}
              </Button>
            )}
          </>
        )}

        {status === 'error' && (
          <>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: 'danger.subtle',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
              }}
            >
              <Box sx={{ color: 'danger.fg' }}>
                <XCircleIcon size={32} />
              </Box>
            </Box>
            <Text
              sx={{
                display: 'block',
                marginTop: 3,
                fontSize: 2,
                fontWeight: 'bold',
                color: 'danger.fg',
              }}
            >
              Connection Failed
            </Text>
            <Flash variant="danger" sx={{ marginTop: 3, textAlign: 'left' }}>
              <Box
                as="span"
                sx={{
                  mr: 2,
                  display: 'inline-flex',
                  verticalAlign: 'text-bottom',
                }}
              >
                <AlertIcon size={16} />
              </Box>
              {errorMessagePrefix}: {error}
            </Flash>
            {showCloseButton && (
              <Button
                variant="danger"
                onClick={handleClose}
                sx={{ marginTop: 3 }}
              >
                {isPopup ? 'Close' : 'Go Back'}
              </Button>
            )}
          </>
        )}
      </Box>
    </Box>
  );
};

export default OAuthCallback;
