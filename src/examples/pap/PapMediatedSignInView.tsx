/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/** PAP Mediated Sign-In: a redacted trace replayed step by step (see `traces/mediated-sign-in.json`). */

import React from 'react';
import { PapTraceView, parsePapTrace } from './PapTraceView';
import trace from './traces/mediated-sign-in.json';

const TRACE = parsePapTrace(trace);

const PapMediatedSignInView: React.FC = () => <PapTraceView trace={TRACE} />;

export default PapMediatedSignInView;
