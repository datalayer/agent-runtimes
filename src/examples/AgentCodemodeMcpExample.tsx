/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React from 'react';
import AgentSpaceFormExample from './AgentSpaceFormExample';

const AgentCodemodeMcpExample: React.FC = () => {
  return (
    <AgentSpaceFormExample
      initialEnableCodemode
      initialAllowDirectToolCalls={false}
      initialEnableToolReranker={false}
      autoSelectMcpServers
    />
  );
};

export default AgentCodemodeMcpExample;
