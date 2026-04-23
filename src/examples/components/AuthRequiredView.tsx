/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useCallback } from 'react';
import { Box } from '@datalayer/primer-addons';
import { HomeIcon } from '@primer/octicons-react';
import { SignInSimple } from '@datalayer/core/lib/views/iam';
import { useSimpleAuthStore } from '@datalayer/core/lib/views/otel';

/**
 * Full-page auth gate content for examples that require a token.
 */
export const AuthRequiredView: React.FC = () => {
  const setAuth = useSimpleAuthStore(s => s.setAuth);

  const syncTokenToIamStore = useCallback((token: string | undefined) => {
    import('@datalayer/core/lib/state').then(({ iamStore }) => {
      iamStore.setState({ token });
    });
  }, []);

  const handleSignIn = useCallback(
    (newToken: string, handle: string) => {
      setAuth(newToken, handle);
      syncTokenToIamStore(newToken);
    },
    [setAuth, syncTokenToIamStore],
  );

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
      }}
    >
      <Box sx={{ width: '100%', maxWidth: 640 }}>
        <SignInSimple
          onSignIn={handleSignIn}
          onApiKeySignIn={apiKey => handleSignIn(apiKey, 'api-key-user')}
          title="Agent Runtimes Examples"
          description="Sign in to run authenticated examples and tools."
          leadingIcon={<HomeIcon size={24} />}
        />
      </Box>
    </Box>
  );
};

export default AuthRequiredView;
