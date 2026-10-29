/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP User with a Company: a redacted trace replayed step by step (see `traces/user-with-a-company.json`). */

import React from 'react';
import { PapTraceView, parsePapTrace } from './PapTraceView';
import trace from './traces/user-with-a-company.json';

const TRACE = parsePapTrace(trace);

const PapUserWithACompanyView: React.FC = () => <PapTraceView trace={TRACE} />;

export default PapUserWithACompanyView;
