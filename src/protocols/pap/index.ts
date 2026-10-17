/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Personal Agent Protocol as a Reactor Plugin of the `agent-protocols`
 * Extension. PAP's own plugins and points (`pap.*`, `pap.company.*`) come
 * with its SDK, registered on the PAP Reactor a personal agent or a company
 * builds; this plugin says what a runtime implements of PAP on
 * `protocols.description`. It declares no point here: the one the Python
 * runtime adds, `pap.company.operationTickets`, is where a perform turn
 * redeems its ticket, and a TypeScript runtime performs no company
 * operation. The twin of `agent_runtimes.protocols.pap`.
 *
 * @module protocols/pap
 */

import { contribution, definePlugin } from '@datalayer/reactor';
import { DEFAULT_ORDER, ProtocolDescriptions } from '../core';

export const PAP_PLUGIN = 'agent-runtimes.protocols.pap';
/** The PAP draft the SDK implements (its `PROTOCOL_PROFILE`; Python reads it from the SDK). */
export const PAP_PROTOCOL_PROFILE = '0.1';

export const PapPlugin = definePlugin({
  name: PAP_PLUGIN,
  version: '1.0.0',
  description:
    "Personal Agent Protocol: a person's agent at companies, and an application as a company, over the PAP SDK.",
  contributionPoints: [],
  contributes: [
    contribution(
      ProtocolDescriptions,
      {
        id: 'pap',
        name: 'Personal Agent Protocol',
        layer: 'consent',
        version: PAP_PROTOCOL_PROFILE,
        roles: ['personal-agent', 'company'],
        status: 'implemented',
        specification: 'https://personalagentprotocol.org/docs/spec',
        plugin: PAP_PLUGIN,
        catalogue: 'pap',
        points: [],
      },
      { id: 'pap', order: DEFAULT_ORDER },
    ),
  ],
});
