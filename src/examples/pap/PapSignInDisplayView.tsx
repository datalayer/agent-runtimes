/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The sign-in card as a display (RU-1), drawn as the chat draws it.
 *
 * A tool that starts a sign-in answers with a `PapSignIn` display
 * (`application/vnd.datalayer.pap.sign-in+json`). Agent Runtimes gives the
 * model the display's model view — no page to open, no code — and sends the
 * page the same result with the whole display in `_meta["reactor.ui/display"]`
 * (`agent_runtimes/transports/agui_displays.py`). The page finds it with
 * `resolveToolResult` and draws it with `ReactorDisplay`, which picks the
 * renderer the `pap-sign-in` plugin contributes. A plain `pap_sign_in` result,
 * with no display, is found through the plugin's tool binding instead.
 */

import React, { useMemo, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Heading, Label, SegmentedControl, Text } from '@primer/react';
import { useReactorPlatform } from '@datalayer/reactor/react';
import { DISPLAY_META_KEY, resolveToolResult } from '@datalayer/reactor/ui';
import { ReactorDisplay } from '@datalayer/reactor/ui/react';
import type { ToolCallRenderContext } from '../../types/chat';
import { PapExamplePage, PapResult } from './PapExamplePage';
import { PAP_SIGN_IN_CASES, modelRead } from './papSignInCases';

const PapSignInDisplayView: React.FC = () => {
  const platform = useReactorPlatform();
  const [index, setIndex] = useState(0);
  const chosen = PAP_SIGN_IN_CASES[index];
  const display = useMemo(
    () =>
      resolveToolResult(platform, {
        toolName: chosen.toolName,
        result: chosen.result,
        toolCallId: `call-${chosen.id}`,
      }),
    [platform, chosen],
  );
  const meta = chosen.result._meta as Record<string, unknown> | undefined;
  const embedded = meta !== undefined && DISPLAY_META_KEY in meta;
  const fallback = (
    <Text sx={{ color: 'fg.muted' }}>No renderer claimed this result.</Text>
  );
  const context: ToolCallRenderContext = {
    toolCallId: `call-${chosen.id}`,
    toolName: chosen.toolName,
    name: chosen.toolName,
    args: {},
    result: chosen.result,
    status: 'complete',
    defaultUI: fallback,
  };

  return (
    <PapExamplePage
      eyebrow="Reactor UI display"
      title="PAP Sign-In Display"
      description="A sign-in tool answers with a PapSignIn display. The model reads its model view; the page receives the whole display beside it and draws the Sign in at a company card with resolveToolResult and ReactorDisplay."
    >
      <SegmentedControl
        aria-label="Sign-in result"
        onChange={setIndex}
        sx={{ alignSelf: 'flex-start' }}
      >
        {PAP_SIGN_IN_CASES.map((item, at) => (
          <SegmentedControl.Button key={item.id} selected={at === index}>
            {item.label}
          </SegmentedControl.Button>
        ))}
      </SegmentedControl>
      <Text sx={{ color: 'fg.muted' }}>{chosen.explanation}</Text>
      <Box
        display="grid"
        gridTemplateColumns={['1fr', null, '1fr 1fr']}
        gap={3}
        alignItems="start"
      >
        <PapResult
          title="What the model read"
          value={modelRead(chosen.result)}
        />
        <Box
          border="1px solid"
          borderColor="border.default"
          borderRadius={2}
          bg="canvas.default"
          p={3}
          data-pap-sign-in-page={chosen.id}
        >
          <Box display="flex" alignItems="center" gap={2} mb={2}>
            <Heading as="h2" sx={{ fontSize: 2 }}>
              What the page drew
            </Heading>
            <Label variant={embedded ? 'success' : 'attention'}>
              {embedded ? 'embedded display' : 'tool binding'}
            </Label>
          </Box>
          {display ? (
            <ReactorDisplay
              display={display}
              context={context}
              fallback={fallback}
            />
          ) : (
            fallback
          )}
        </Box>
      </Box>
    </PapExamplePage>
  );
};

export default PapSignInDisplayView;
