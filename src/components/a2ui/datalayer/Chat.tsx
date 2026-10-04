/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Chat (LOOP C-18): the conversation with the application, drawn by the
 * chat's own parts — its transcript (`ChatMessageList`, the one every chat
 * draws its turns with), its welcome and starters (`ChatEmptyState`) and its
 * composer (`InputPromptText`) — from what the application publishes.
 *
 * It shows the messages its `messages` binding points at, each
 * `{role: 'user' | 'assistant', text}`, or `{role: 'tool', name, args,
 * result}` for a tool call, shown only while `show_tools` holds. Before the
 * first message it says its welcome and offers its starters. A message
 * written in the composer — or a starter chosen — is written where its
 * `message` binding points, then its action is dispatched (the application's
 * `send`), so the action's context reads the message just written, as a
 * basic input's action reads its value.
 *
 * @module components/a2ui/datalayer/Chat
 */

import { createRef, useMemo, useState } from 'react';
import { IconButton } from '@primer/react';
import {
  DependabotIcon,
  PaperAirplaneIcon,
  PersonIcon,
} from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import { ChatMessageList } from '../../../chat/messages/ChatMessageList';
import { ChatEmptyState } from '../../../chat/display/EmptyState';
import { InputPromptText } from '../../../chat/prompt/InputPromptText';
import type { DisplayItem } from '../../../types/chat';
import type { ChatMessage } from '../../../types/messages';
import { BlockFrame, CARD_RADIUS, Problem, asWords, isRecord } from './parts';
import { ownImplementation, type OwnCommon } from './implementation';

export type ChatProps = OwnCommon & {
  welcome?: string;
  placeholder?: string;
  starters?: string[];
  show_tools?: boolean;
  messages?: unknown;
  message?: unknown;
  setMessage: (message: string) => void;
};

/** The defaults the catalog gives. */
const PLACEHOLDER = 'Ask anything';

const AVATARS = {
  userAvatar: <PersonIcon size={14} />,
  assistantAvatar: <DependabotIcon size={14} />,
  showAvatars: true,
  avatarSize: 24,
  userAvatarBg: 'neutral.muted',
  assistantAvatarBg: 'accent.emphasis',
};

/** The epoch: a published message carries no time, and the transcript shows none. */
const NO_TIME = new Date(0);

/** The transcript a chat draws from what is published, or why it cannot. */
export function chatItems(
  messages: unknown,
  showTools: boolean,
): { items: DisplayItem[] } | { problem: string } {
  if (messages === undefined || messages === null) {
    return { items: [] };
  }
  if (!Array.isArray(messages)) {
    return { problem: 'What it shows is not a list of messages.' };
  }
  const items: DisplayItem[] = [];
  for (const [index, message] of messages.entries()) {
    const id = `m${index}`;
    if (!isRecord(message)) {
      return { problem: `Message ${index + 1} is not a message.` };
    }
    if (message.role === 'tool') {
      if (showTools) {
        items.push({
          id,
          type: 'tool-call',
          toolCallId: id,
          toolName: asWords(message.name) || 'tool',
          args: isRecord(message.args) ? message.args : {},
          result: message.result,
          status: 'complete',
        });
      }
      continue;
    }
    if (message.role !== 'user' && message.role !== 'assistant') {
      return {
        problem: `Message ${index + 1} is from ${asWords(message.role) || 'nobody'}: a message is the user's, the assistant's or a tool's.`,
      };
    }
    items.push({
      id,
      role: message.role,
      content: asWords(message.text ?? message.content),
      createdAt: NO_TIME,
    } as ChatMessage);
  }
  return { items };
}

export function ChatView({ props }: { props: ChatProps }) {
  const { welcome, starters = [], setMessage, action } = props;
  const placeholder = props.placeholder ?? PLACEHOLDER;
  const showTools = props.show_tools ?? true;
  const read = useMemo(
    () => chatItems(props.messages, showTools),
    [props.messages, showTools],
  );
  const [draft, setDraft] = useState('');
  const messagesEnd = useMemo(() => createRef<HTMLDivElement>(), []);
  const inputRef = useMemo(() => createRef<HTMLTextAreaElement>(), []);

  const send = (text: string) => {
    const message = text.trim();
    if (!message) {
      return;
    }
    setMessage(message);
    action?.();
    setDraft('');
  };

  return (
    <BlockFrame label="Chat" weight={props.weight} testId="a2ui-chat">
      {'problem' in read ? (
        <Problem>{read.problem}</Problem>
      ) : (
        <Box
          sx={{
            maxHeight: 420,
            overflowY: 'auto',
            borderRadius: CARD_RADIUS,
          }}
        >
          <ChatMessageList
            displayItems={read.items}
            isLoading={false}
            isStreaming={false}
            showLoadingIndicator={false}
            hideMessagesAfterToolUI={false}
            avatarConfig={AVATARS}
            padding={2}
            emptyContent={
              <ChatEmptyState
                description=""
                emptyState={{ title: welcome || 'Start a conversation' }}
                suggestions={starters.map(starter => ({
                  title: starter,
                  message: starter,
                }))}
                onSuggestionSubmit={suggestion => send(suggestion.message)}
              />
            }
            messagesEndRef={messagesEnd as never}
            onRespond={async () => undefined}
          />
        </Box>
      )}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 2,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <InputPromptText
            value={draft}
            onChange={setDraft}
            placeholder={placeholder}
            onSubmit={() => send(draft)}
            inputRef={inputRef}
          />
        </Box>
        <IconButton
          icon={PaperAirplaneIcon}
          aria-label="Send"
          variant="primary"
          disabled={!draft.trim()}
          onClick={() => send(draft)}
        />
      </Box>
    </BlockFrame>
  );
}

export const Chat = ownImplementation<ChatProps>('Chat', ChatView);
