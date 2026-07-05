/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { Label, Link } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { Banner } from '@primer/react/experimental';
import { useCoreStore, useRuntimesStore } from '../../state/substates';
import { useNavigate } from '@datalayer/core/lib/hooks';

export const FlashDisclaimer = () => {
  const { configuration } = useCoreStore();
  const { showDisclaimer, setShowDisclaimer } = useRuntimesStore();
  const navigate = useNavigate();
  return (
    <>
      {configuration?.whiteLabel === false && showDisclaimer && (
        <Banner
          variant="info"
          title="AI Agents for Data Analysis"
          description={
            <Box>
              <Label style={{ marginRight: 10 }}>PRIVATE BETA</Label>
              Create Kernels and use them from your JupyterLab, VS Code or CLI.
              Read the{' '}
              <Link
                href="javascript: return false;"
                onClick={e => navigate('/docs', e)}
              >
                documentation
              </Link>{' '}
              for any question or{' '}
              <Link
                href="javascript: return false;"
                onClick={e => navigate('/support/request', e)}
              >
                contact us for support
              </Link>
              .
            </Box>
          }
          onDismiss={() => setShowDisclaimer(false)}
        />
      )}
    </>
  );
};

export default FlashDisclaimer;
