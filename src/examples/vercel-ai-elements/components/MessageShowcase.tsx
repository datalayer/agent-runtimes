/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  Message,
  MessageAction,
  MessageActions,
  MessageAttachment,
  MessageAttachments,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageContent,
  MessageResponse,
  MessageToolbar,
} from '@/components/vercel-ai-elements/message';
import {
  CopyIcon,
  RefreshCcwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { useState } from 'react';

export const MessageShowcase = () => {
  const [currentVersion, setCurrentVersion] = useState(0);
  const versions = [
    {
      id: nanoid(),
      content: `# React Hooks Guide

React hooks are functions that let you "hook into" React state and lifecycle features from function components.

## Core Hooks

### useState
Adds state to functional components:

\`\`\`jsx
const [count, setCount] = useState(0);
\`\`\`

### useEffect
Handles side effects (data fetching, subscriptions, DOM updates).`,
    },
    {
      id: nanoid(),
      content: `# React Hooks - Comprehensive Guide

Hooks revolutionized React by allowing function components to use state and other React features.

## Essential Hooks

1. **useState** - State management
2. **useEffect** - Side effects
3. **useContext** - Context consumption
4. **useReducer** - Complex state logic`,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">User Message</h3>
        <Message from="user">
          <MessageContent>
            How do React hooks work and when should I use them?
          </MessageContent>
        </Message>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          Assistant Message with Actions
        </h3>
        <Message from="assistant">
          <MessageContent>
            <MessageResponse>
              {versions[currentVersion].content}
            </MessageResponse>
          </MessageContent>
          <MessageToolbar>
            <MessageActions>
              <MessageAction
                label="Copy"
                onClick={() => console.log('Copy clicked')}
              >
                <CopyIcon />
              </MessageAction>
              <MessageAction
                label="Regenerate"
                onClick={() => console.log('Regenerate clicked')}
              >
                <RefreshCcwIcon />
              </MessageAction>
              <MessageAction
                label="Good response"
                onClick={() => console.log('Thumbs up clicked')}
              >
                <ThumbsUpIcon />
              </MessageAction>
              <MessageAction
                label="Bad response"
                onClick={() => console.log('Thumbs down clicked')}
              >
                <ThumbsDownIcon />
              </MessageAction>
            </MessageActions>
          </MessageToolbar>
        </Message>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          Message with Branches (Multiple Versions)
        </h3>
        <Message from="assistant">
          <MessageContent>
            <MessageBranch
              defaultBranch={currentVersion}
              onBranchChange={setCurrentVersion}
            >
              <MessageBranchContent>
                <MessageResponse>
                  {versions[currentVersion].content}
                </MessageResponse>
              </MessageBranchContent>
              <MessageBranchSelector from="assistant">
                <MessageBranchPrevious />
                <MessageBranchPage />
                <MessageBranchNext />
              </MessageBranchSelector>
            </MessageBranch>
          </MessageContent>
        </Message>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          User Message with Attachments
        </h3>
        <Message from="user">
          <MessageContent>
            Can you analyze this image and document?
          </MessageContent>
          <MessageAttachments>
            <MessageAttachment
              data={{
                type: 'file',
                url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop',
                mediaType: 'image/jpeg',
                filename: 'palace-of-fine-arts.jpg',
              }}
            />
            <MessageAttachment
              data={{
                type: 'file',
                url: '',
                mediaType: 'application/pdf',
                filename: 'react-hooks-guide.pdf',
              }}
            />
          </MessageAttachments>
        </Message>
      </div>
    </div>
  );
};
