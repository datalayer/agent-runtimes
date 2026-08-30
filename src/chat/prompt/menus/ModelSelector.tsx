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
          <Tooltip
            text={
              isA2AProtocol
                ? 'This protocol does not take a model override'
                : `Model — ${active?.name ?? 'none selected'}`
            }
            direction="n"
          >
            <Button
              type="button"
              variant="invisible"
              size="small"
              aria-label={`Model — ${active?.name ?? 'none selected'}`}
              leadingVisual={AiModelIcon}
              disabled={isA2AProtocol}
              sx={
                isA2AProtocol
                  ? { opacity: 0.5, cursor: 'not-allowed' }
                  : undefined
              }
            >
              {/* No name beside the icon. A model id is the longest label on
                the row and it changes width as the model changes, which
                pushes everything beside it about; the tooltip says which. */}
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
                    Missing API key
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
