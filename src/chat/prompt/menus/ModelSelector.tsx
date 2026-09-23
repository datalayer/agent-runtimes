/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which model answers.
 *
 * @module chat/prompt/menus/ModelSelector
 */

import { Text, Button, ActionMenu, ActionList, Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { AiModelIcon } from '@primer/octicons-react';

import type { ModelConfig } from '../../../types';

export function ModelSelector({
  models,
  selectedModel,
  onModelSelect,
  isA2AProtocol,
}: {
  models: ModelConfig[];
  selectedModel: string;
  onModelSelect: (modelId: string) => void;
  isA2AProtocol: boolean;
}) {
  const active = models.find(model => model.id === selectedModel);
  /*
   * A count, not a name — the same trigger as tools, skills, agents and
   * suggestions beside it. The name is the longest label on the row and it
   * changes width as the model changes, which pushed everything beside it
   * about; the tooltip says which one, and how many there are to choose from.
   */
  const summary = isA2AProtocol
    ? 'set by the agent config'
    : `${active?.name ?? 'none selected'} · ${models.length} to choose from`;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
      }}
    >
      <ActionMenu>
        <ActionMenu.Anchor>
          <Tooltip text={`Model — ${summary}`} direction="n">
            <Button
              type="button"
              variant="invisible"
              size="small"
              aria-label={`Model — ${summary}`}
              leadingVisual={AiModelIcon}
              disabled={isA2AProtocol}
              sx={
                isA2AProtocol
                  ? { opacity: 0.5, cursor: 'not-allowed' }
                  : undefined
              }
            >
              <Text sx={{ fontSize: 0 }}>{models.length}</Text>
            </Button>
          </Tooltip>
        </ActionMenu.Anchor>
        <ActionMenu.Overlay side="outside-top" align="end">
          <ActionList selectionVariant="single">
            {models.map(modelItem => (
              <ActionList.Item
                key={modelItem.id}
                selected={selectedModel === modelItem.id}
                onSelect={() => onModelSelect(modelItem.id)}
                disabled={modelItem.isAvailable === false || isA2AProtocol}
                sx={
                  modelItem.isAvailable === false
                    ? { color: 'fg.muted' }
                    : undefined
                }
              >
                {modelItem.name}
                {modelItem.isAvailable === false && (
                  <ActionList.Description variant="block">
                    {/* The server's reason when it gave one. A missing key is
                        something the reader can go and fix; a model we are not
                        entitled to is not, and saying the second is the first
                        sends them off to do something pointless. */}
                    {modelItem.unavailableReason ?? 'Missing API key'}
                  </ActionList.Description>
                )}
              </ActionList.Item>
            ))}
          </ActionList>
        </ActionMenu.Overlay>
      </ActionMenu>
      {isA2AProtocol && (
        <Text sx={{ fontSize: 0, color: 'attention.fg', mt: 1 }}>
          A2A: Model set by agent config
        </Text>
      )}
    </Box>
  );
}
