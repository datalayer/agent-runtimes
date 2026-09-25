/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A delegated run shows in the conversation as a box of its own under the
 * tool card — whichever way the delegation was spelled — named for the
 * subagent and coloured for its state.
 */

// @vitest-environment jsdom

import React, { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChatMessageList } from '../ChatMessageList';
import { agentRuntimeStore } from '../../../stores';
import type { DisplayItem } from '../../../types/chat';
import type { AgentStreamSubagentPayload } from '../../../types/stream';

const call = (
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown> = {},
) =>
  ({
    id: `m-${toolCallId}`,
    type: 'tool-call',
    toolCallId,
    toolName,
    args,
    status: 'complete',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }) as unknown as DisplayItem;

async function render(displayItems: DisplayItem[]) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ChatMessageList
        displayItems={displayItems}
        isLoading={false}
        isStreaming={false}
        showLoadingIndicator={false}
        hideMessagesAfterToolUI={false}
        avatarConfig={{
          userAvatar: 'me',
          assistantAvatar: 'ai',
          showAvatars: false,
          avatarSize: 24,
          userAvatarBg: 'accent.subtle',
          assistantAvatarBg: 'accent.emphasis',
        }}
        padding={3}
        emptyContent={null}
        messagesEndRef={createRef<HTMLDivElement>() as never}
        onRespond={async () => {}}
      />,
    );
  });
  return { container, root };
}

const append = async (event: AgentStreamSubagentPayload) =>
  act(async () => {
    agentRuntimeStore.getState().appendSubagentEvent(event);
  });

describe('the subagent box in the conversation', () => {
  beforeEach(() => {
    agentRuntimeStore.getState().clearSubagentActivity();
  });

  it('boxes an in-page delegation — a tool named after the subagent — once it reports', async () => {
    const { container, root } = await render([
      call('call-1', 'researcher', { task: 'look' }),
    ]);
    expect(container.querySelector('[data-subagent-panel]')).toBeNull();
    await append({
      subagentName: 'researcher',
      toolCallId: 'call-1',
      phase: 'start',
      task: 'look',
    });
    await append({
      subagentName: 'researcher',
      toolCallId: 'call-1',
      phase: 'text',
      text: 'Found it.',
    });
    const panel = container.querySelector('[data-subagent-panel]');
    expect(panel?.getAttribute('data-subagent-panel')).toBe('researcher');
    expect(panel?.textContent).toContain('Subagent');
    expect(panel?.textContent).toContain('working');
    await append({
      subagentName: 'researcher',
      toolCallId: 'call-1',
      phase: 'end',
      output: 'Found it.',
    });
    expect(
      container.querySelector('[data-subagent-panel]')?.textContent,
    ).toContain('done');
    await act(async () => root.unmount());
  });

  it('boxes a server delegation by its tool name, naming the subagent from the arguments', async () => {
    const { container, root } = await render([
      call('call-2', 'delegate_task', {
        subagent_name: 'writer',
        task: 'write',
      }),
    ]);
    await append({
      subagentName: 'writer',
      toolCallId: 'call-2',
      phase: 'start',
      task: 'write',
    });
    expect(
      container
        .querySelector('[data-subagent-panel]')
        ?.getAttribute('data-subagent-panel'),
    ).toBe('writer');
    await act(async () => root.unmount());
  });

  it('leaves an ordinary tool call alone', async () => {
    const { container, root } = await render([call('call-3', 'readAllCells')]);
    expect(container.querySelector('[data-subagent-panel]')).toBeNull();
    await act(async () => root.unmount());
  });
});
