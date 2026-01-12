/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/vercel-ai-elements/conversation';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/vercel-ai-elements/message';
import { nanoid } from 'nanoid';

const messages = [
  {
    id: nanoid(),
    role: 'user' as const,
    content: 'What is React and why should I use it?',
  },
  {
    id: nanoid(),
    role: 'assistant' as const,
    content: `React is a JavaScript library for building user interfaces, particularly single-page applications. Here's why you should consider using it:

## Key Benefits

1. **Component-Based Architecture** - Build encapsulated components that manage their own state
2. **Virtual DOM** - Efficient updates and rendering
3. **Rich Ecosystem** - Large community and many third-party libraries
4. **Learn Once, Write Anywhere** - Can be used for web, mobile (React Native), and more`,
  },
  {
    id: nanoid(),
    role: 'user' as const,
    content: 'Can you show me a simple example?',
  },
  {
    id: nanoid(),
    role: 'assistant' as const,
    content: `Here's a simple React component example:

\`\`\`jsx
function Welcome({ name }) {
  return <h1>Hello, {name}!</h1>;
}

// Usage
<Welcome name="Alice" />
\`\`\`

This component accepts a \`name\` prop and displays a greeting.`,
  },
];

export const ConversationShowcase = () => {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">Conversation Container</h3>
        <div className="border rounded-lg">
          <Conversation>
            <ConversationContent>
              {messages.map(message => (
                <Message key={message.id} from={message.role}>
                  <MessageContent>
                    <MessageResponse>{message.content}</MessageResponse>
                  </MessageContent>
                </Message>
              ))}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          Limited Height Conversation
        </h3>
        <div className="border rounded-lg" style={{ height: '400px' }}>
          <Conversation>
            <ConversationContent>
              {[...messages, ...messages].map((message, index) => (
                <Message key={`${message.id}-${index}`} from={message.role}>
                  <MessageContent>
                    <MessageResponse>{message.content}</MessageResponse>
                  </MessageContent>
                </Message>
              ))}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
        </div>
      </div>
    </div>
  );
};
