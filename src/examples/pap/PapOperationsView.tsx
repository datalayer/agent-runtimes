/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP Operations: a redacted trace replayed step by step (see `traces/operations.json`). */

import React from 'react';
import { PapTraceView, parsePapTrace } from './PapTraceView';
import trace from './traces/operations.json';

const TRACE = parsePapTrace(trace);

const PapOperationsView: React.FC = () => <PapTraceView trace={TRACE} />;

export default PapOperationsView;
