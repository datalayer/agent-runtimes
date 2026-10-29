/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP Conversation Streaming: a redacted trace replayed step by step (see `traces/conversation-streaming.json`). */

import React from 'react';
import { PapTraceView, parsePapTrace } from './PapTraceView';
import trace from './traces/conversation-streaming.json';

const TRACE = parsePapTrace(trace);

const PapConversationStreamingView: React.FC = () => (
  <PapTraceView trace={TRACE} />
);

export default PapConversationStreamingView;
