/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { UIDataTypes, UIMessagePart, UITools, UIMessage } from 'ai';
import { TextPart } from './display/TextPart';
import { ReasoningPart } from './display/ReasoningPart';
import { ToolPart } from './display/ToolPart';
import { DynamicToolPart } from './display/DynamicToolPart';

interface IMessagePartProps {
  part: UIMessagePart<UIDataTypes, UITools>;
  message: UIMessage;
  status: string;
  regen: (id: string) => void;
  index: number;
  lastMessage: boolean;
}

export function MessagePart({
  part,
  message,
  status,
  regen,
  index,
  lastMessage,
}: IMessagePartProps) {
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
