/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/vercel-ai-elements/prompt-input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GlobeIcon, MicIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

export const PromptInputShowcase = () => {
  const [value, setValue] = useState('');

  const handleSubmit = (message: { text: string; files: any[] }) => {
    console.log('Submitted:', message);
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">Basic Prompt Input</h3>
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Ask me anything..."
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">
          Prompt Input with Actions
        </h3>
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Ask me anything..."
            />
          </PromptInputBody>
          <PromptInputFooter>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <PromptInputButton>
                  <PlusIcon className="size-4" />
                </PromptInputButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => console.log('Voice')}>
                  <MicIcon />
                  Voice Input
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => console.log('Search')}>
                  <GlobeIcon />
                  Web Search
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <PromptInputActionAddAttachments
              onClick={() => console.log('Add attachment')}
            />
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Prompt Input with Tools</h3>
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputHeader>
            <PromptInputTools>
              <PromptInputButton onClick={() => console.log('Search')}>
                <GlobeIcon />
              </PromptInputButton>
              <PromptInputButton onClick={() => console.log('Voice')}>
                <MicIcon />
              </PromptInputButton>
            </PromptInputTools>
          </PromptInputHeader>
          <PromptInputBody>
            <PromptInputTextarea
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Ask me anything..."
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
};
