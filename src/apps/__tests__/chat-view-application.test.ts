/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An application's conversation in the workspace's chat (T-17, T-18,
 * T-19): its face in the empty state at the page's size of the three, and no
 * session controls under its composer — an agent's chat keeps them.
 *
 * Read from the source, as the other `ChatView` pins are: the view needs a
 * whole workspace to render.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loopShapeVars } from '@datalayer/primer-addons';

const chat = readFileSync(
  join(__dirname, '..', 'plugins/chat/ChatView.tsx'),
  'utf8',
);

describe('an application in the chat', () => {
  it('draws its face in the empty state at the page’s size', () => {
    expect(loopShapeVars['--loop-face-large']).toBe('72px');
    expect(chat).toContain(
      "const FACE_LARGE = parseInt(loopShapeVars['--loop-face-large'], 10);",
    );
    expect(chat).toMatch(/style=\{\{ fontSize: FACE_LARGE, lineHeight: 1 \}\}/);
    expect(chat).not.toContain('fontSize: 48');
  });

  it('keeps none of the session’s controls under its composer', () => {
    for (const control of [
      'showAgentsMenu',
      'showToolsMenu',
      'showSkillsMenu',
    ]) {
      expect(chat).toContain(`${control}: !presence,`);
    }
    expect(chat).toContain('showModelSelector: !presence && !ownRoutesOnly,');
  });

  /*
   * A deployment's runtime, and the visitors', answer only the application's
   * own routes (OwnRoutesOnly, the release gates, round 19): the
   * chat says so to ChatBase, which then opens no monitoring stream and no
   * sandbox socket (ownRoutesOnly.test), Stop is the session's
   * (appSessionStop.test), and the runtime-wide model is never switched.
   */
  it('on a deployment’s page, calls only the application’s own routes', () => {
    expect(chat).toContain(
      'const ownRoutesOnly = Boolean(deploymentUid || visitors);',
    );
    expect(chat).toMatch(
      /if \(ownRoutesOnly && !runsApp\) \{\s+throw new Error\(/,
    );
    expect(chat).toContain(
      'appSessions: `${agentServerUrl}/api/v1/apps/sessions`,',
    );
    expect(chat).toContain(
      '...(ownRoutesOnly ? { ownRoutesOnly: true } : {}),',
    );
    // The model switch is runtime-wide: refused before anything is sent.
    expect(chat).toMatch(
      /const selectModel = useCallback\(\s+async \(model: string\) => \{\s+if \(ownRoutesOnly\) \{\s+\/\/[^\n]*\n\s+throw new Error\(/,
    );
  });

  it('is switched off, with the reason, when its host says there is nothing to talk to (R-27)', () => {
    expect(chat).toContain('const ambient = useChatAvailability();');
    expect(chat).toMatch(
      /const chatDisabled =\s+gateBlocked \|\|\s+keyExpired \|\|\s+Boolean\(inPageRefusal\) \|\|\s+Boolean\(noRuntime\) \|\|\s+ambient\.disabled;/,
    );
    expect(chat).toContain(
      '(ambient.disabled ? ambient.disableReason : undefined)',
    );
  });

  it('says so, sends nothing and is not Ready while no runtime is assigned (P-24)', () => {
    // The chat's server is the runtime's, with no stand-in: on a hosted page
    // the host's was the page's own origin, which answered a question 404.
    expect(chat).toContain(
      'const agentServerUrl = agentServerOf(workspace.sandbox, workspace.serverUrl);',
    );
    expect(chat).toContain('noRuntimeSaid(workspace.sandbox, chatText)');
    // No protocol, so no connection and no send.
    expect(chat).toContain('useMemo<ProtocolConfig | undefined>(');
    expect(chat).toMatch(/: agentServerUrl !== undefined\s+\? \{/);
    expect(chat).toMatch(/presence && !noRuntime \? \(\s+<PresenceLine/);
  });

  it('speaks to its session API whether or not its plugin is up (D-15)', () => {
    // The host says it runs an application: while its runtime does not hold
    // it, its page plugin stands down, and its chat is still never sent to
    // the runtime's bare agent route.
    expect(chat).toMatch(
      /const hostCreatePayload =\s+reactor\.getConfig<AgentsConfig>\(AGENTS_PLUGIN_NAME\)\?\.datalayerCreatePayload;/,
    );
    expect(chat).toMatch(
      /const runsApp = Boolean\(\s+blueprintTurn\?\.createPayload\?\.app_spec \|\| hostCreatePayload\?\.app_spec,\s+\);/,
    );
  });
});
