/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP Account Tokens: a redacted trace replayed step by step (see `traces/account-tokens.json`). */

import React from 'react';
import { PapTraceView, parsePapTrace } from './PapTraceView';
import trace from './traces/account-tokens.json';

const TRACE = parsePapTrace(trace);

const PapAccountTokensView: React.FC = () => <PapTraceView trace={TRACE} />;

export default PapAccountTokensView;
