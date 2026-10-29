/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP Two Companies: a redacted trace replayed step by step (see `traces/two-companies.json`). */

import React from 'react';
import { PapTraceView, parsePapTrace } from './PapTraceView';
import trace from './traces/two-companies.json';

const TRACE = parsePapTrace(trace);

const PapTwoCompaniesView: React.FC = () => <PapTraceView trace={TRACE} />;

export default PapTwoCompaniesView;
