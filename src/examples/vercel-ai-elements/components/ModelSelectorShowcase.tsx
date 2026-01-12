/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@/components/vercel-ai-elements/model-selector';
import { useState } from 'react';

const models = [
  { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI', logo: '🤖' },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'OpenAI',
    logo: '🤖',
  },
  {
    id: 'claude-3-opus',
    name: 'Claude 3 Opus',
    provider: 'Anthropic',
    logo: '🧠',
  },
  {
    id: 'claude-3-sonnet',
    name: 'Claude 3 Sonnet',
    provider: 'Anthropic',
    logo: '🧠',
  },
  { id: 'gemini-pro', name: 'Gemini Pro', provider: 'Google', logo: '✨' },
  { id: 'llama-2-70b', name: 'Llama 2 70B', provider: 'Meta', logo: '🦙' },
];

export const ModelSelectorShowcase = () => {
  const [selectedModel, setSelectedModel] = useState('gpt-4');
  const [searchQuery, setSearchQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filteredModels = models.filter(
    model =>
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.provider.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const groupedModels = filteredModels.reduce(
    (acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = [];
      }
      acc[model.provider].push(model);
      return acc;
    },
    {} as Record<string, typeof models>,
  );

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold mb-4">Model Selector</h3>
        <ModelSelector open={open} onOpenChange={setOpen}>
          <ModelSelectorTrigger>
            <ModelSelectorLogo
              provider={
                (models
                  .find(m => m.id === selectedModel)
                  ?.provider.toLowerCase() as any) || 'openai'
              }
            />
            <ModelSelectorName>
              {models.find(m => m.id === selectedModel)?.name}
            </ModelSelectorName>
          </ModelSelectorTrigger>
          <ModelSelectorContent>
            <ModelSelectorInput
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="Search models..."
            />
            <ModelSelectorList>
              {Object.keys(groupedModels).length === 0 ? (
                <ModelSelectorEmpty>No models found</ModelSelectorEmpty>
              ) : (
                Object.entries(groupedModels).map(
                  ([provider, providerModels]) => (
                    <ModelSelectorGroup key={provider} heading={provider}>
                      {providerModels.map(model => (
                        <ModelSelectorItem
                          key={model.id}
                          value={model.id}
                          onSelect={() => {
                            setSelectedModel(model.id);
                            setOpen(false);
                          }}
                        >
                          <ModelSelectorLogoGroup>
                            <ModelSelectorLogo
                              provider={model.provider.toLowerCase() as any}
                            />
                            <ModelSelectorName>{model.name}</ModelSelectorName>
                          </ModelSelectorLogoGroup>
                        </ModelSelectorItem>
                      ))}
                    </ModelSelectorGroup>
                  ),
                )
              )}
            </ModelSelectorList>
          </ModelSelectorContent>
        </ModelSelector>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">Selected Model</h3>
        <div className="p-4 border rounded-md bg-muted">
          <p className="text-sm">
            <strong>Model ID:</strong> {selectedModel}
          </p>
          <p className="text-sm">
            <strong>Name:</strong>{' '}
            {models.find(m => m.id === selectedModel)?.name}
          </p>
          <p className="text-sm">
            <strong>Provider:</strong>{' '}
            {models.find(m => m.id === selectedModel)?.provider}
          </p>
        </div>
      </div>
    </div>
  );
};
