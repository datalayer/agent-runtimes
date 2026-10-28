/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Loop plugins of the outputs example (`AgentOutputsExample`): the
 * `example-output` agent, the chat's spreadsheet renderer, and the Cells
 * agent tools on the last spreadsheet answered. The agent runs on a server,
 * so the page names the bundle whose tools it hands it — `cells`, the grid's
 * tools, run on this page's reactor — through the chat extras.
 *
 * Apart from the page, so a test reads the list without mounting the Loop.
 *
 * @module examples/utils/agentOutputsPlugins
 */

import { AgentOutputsPlugin } from '../../apps/plugins/agent-outputs';
import {
  AgentOutputsSheetsPlugin,
  AgentOutputsSheetToolsPlugin,
} from '../../apps/plugins/agent-outputs/sheets';
import { createChatExtrasPlugin } from '../../apps/plugins/chat-extras';

const SHEET_EXTRAS = createChatExtrasPlugin();
SHEET_EXTRAS.setExtras({ agentToolBundles: ['cells'] });

/** The Loop's plugins on the outputs page: the agent, the chat's grids, the grid's tools. */
export const AGENT_OUTPUTS_LOOP_PLUGINS = [
  AgentOutputsPlugin,
  AgentOutputsSheetsPlugin,
  AgentOutputsSheetToolsPlugin,
  SHEET_EXTRAS.plugin,
];
