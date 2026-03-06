/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Message part renderer component.
 * Routes message parts to appropriate display components based on type.
 *
 * @module components/chat/components/elements/MessagePart
 */

import type { UIDataTypes, UIMessagePart, UITools, UIMessage } from 'ai';
import { TextPart } from '../parts/TextPart';
import { ReasoningPart } from '../parts/ReasoningPart';
import { ToolPart } from '../parts/ToolPart';
import { DynamicToolPart } from '../parts/DynamicToolPart';

/**
 * MessagePart props
 */
export interface MessagePartProps {
  /** The message part to render */
  part: UIMessagePart<UIDataTypes, UITools>;
  /** Parent message object */
  message: UIMessage;
  /** Current streaming status */
  status: string;
  /** Callback to regenerate the message */
  regen: (id: string) => void;
  /** Index of this part in the message */
  index: number;
  /** Whether this is the last message in the conversation */
  lastMessage: boolean;
}

/**
 * MessagePart component - routes to appropriate display component based on part type.
 *
 * Supports:
 * - text: Regular text content with markdown
 * - reasoning: AI thinking/reasoning content (collapsible)
 * - dynamic-tool: Dynamic tool UI parts
 * - tool-call (via toolCallId): Tool execution display
 *
 * @example
 * ```tsx
 * {message.parts.map((part, index) => (
 *   <MessagePart
 *     key={index}
 *     part={part}
 *     message={message}
 *     status={status}
 *     regen={handleRegenerate}
 *     index={index}
 *     lastMessage={isLastMessage}
 *   />
 * ))}
 * ```
 */
export function MessagePart({
  part,
  message,
  status,
  regen,
  index,
  lastMessage,
}: MessagePartProps) {
  if (part.type === 'text') {
    return (
      <TextPart
        text={part.text}
        message={message}
        isLastPart={index === message.parts.length - 1}
        onRegenerate={regen}
      />
    );
  } else if (part.type === 'reasoning') {
    const isStreaming =
      status === 'streaming' &&
      index === message.parts.length - 1 &&
      lastMessage;
    return <ReasoningPart text={part.text} isStreaming={isStreaming} />;
  } else if (part.type === 'dynamic-tool') {
    return <DynamicToolPart part={part} />;
  } else if ('toolCallId' in part) {
    return <ToolPart part={part} />;
  }

  return null;
}

export default MessagePart;
