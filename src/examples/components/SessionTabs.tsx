/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import { Text } from '@primer/react';
import { Box } from '@datalayer/primer-addons';

export interface Session {
  id: string;
  name: string;
  active: boolean;
}

export interface SessionTabsProps {
  sessions: Session[];
  activeSession: string;
  agentName?: string;
  agentDescription?: string;
  onSessionChange: (sessionId: string) => void;
  onAddSession: () => void;
}

/**
 * Session Tabs Component
 *
 * Displays the current session name.
 */
export const SessionTabs: React.FC<SessionTabsProps> = ({
  sessions: _sessions,
  activeSession: _activeSession,
  agentName = 'Earthquake Detector',
  agentDescription,
  onSessionChange: _onSessionChange,
  onAddSession: _onAddSession,
}) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Text sx={{ fontWeight: 'bold', fontSize: 2 }}>{agentName}</Text>
      {agentDescription && (
        <Text sx={{ fontSize: 1, color: 'fg.muted' }}>{agentDescription}</Text>
      )}
    </Box>
  );
};
