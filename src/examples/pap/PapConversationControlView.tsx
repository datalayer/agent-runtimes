/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP Conversation Control: a redacted trace replayed step by step (see `traces/conversation-control.json`). */

import React from 'react';
import { PapTraceView, parsePapTrace } from './PapTraceView';
import trace from './traces/conversation-control.json';

const TRACE = parsePapTrace(trace);

const PapConversationControlView: React.FC = () => (
  <PapTraceView trace={TRACE} />
);

export default PapConversationControlView;
