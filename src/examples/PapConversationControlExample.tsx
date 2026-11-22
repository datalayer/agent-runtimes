/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP Conversation Control, replayed from a PAP demo-world trace, as a Reactor workspace plugin. */

import React, { useMemo } from 'react';
import { Box, setupPrimerPortals } from '@datalayer/primer-addons';
import { AgentEmbed } from '../apps';
import { definePapExamplePlugin } from '../apps/plugins/pap-example';
import { ThemedProvider } from './utils/themedProvider';

setupPrimerPortals();

const PapConversationControlPlugin = definePapExamplePlugin({
  key: 'conversation-control',
  title: 'PAP Conversation Control',
  description: 'A Direct Conversation, a handoff to a person, and closing.',
  load: () => import('./pap/PapConversationControlView'),
});

const PapConversationControlExample: React.FC = () => {
  const plugins = useMemo(() => [PapConversationControlPlugin], []);
  return (
    <ThemedProvider>
      <Box height="100%" minHeight={0}>
        <AgentEmbed
          target="browser"
          agentId="agent-shell"
          defaultEditor="none"
          showHeader
          plugins={plugins}
        />
      </Box>
    </ThemedProvider>
  );
};

export default PapConversationControlExample;
