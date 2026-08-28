/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which model is answering.
 *
 * The browser twin of `/models`: the same catalogue, the same per-session
 * selection, in the place a person looks when they wonder why an answer came
 * out the way it did. Local models are marked, because "this ran on my machine"
 * changes what the answer means.
 *
 * @module loop/plugins/models/ModelChip
 */

import { useCallback, useEffect, useState } from 'react';
import { ActionList, ActionMenu, Box, Text } from '@primer/react';
import type { LoopWorkspaceContext } from '../../core';

type CatalogModel = {
  id: string;
  name: string;
  provider: string;
  local?: boolean;
  available?: boolean;
  reachable?: boolean | null;
  warning?: string | null;
  missing_env_vars?: string[];
};

export function ModelChip({
  workspace,
}: {
  workspace: LoopWorkspaceContext;
}): JSX.Element | null {
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [active, setActive] = useState(workspace.model ?? '');

  useEffect(() => {
    let cancelled = false;
    void fetch(`${workspace.serverUrl}/api/v1/configure/models`)
      .then(response => (response.ok ? response.json() : { models: [] }))
      .then(payload => {
        if (!cancelled) {
          setModels(payload.models ?? []);
        }
      })
      .catch(() => {
        // No catalogue is not an error worth a banner: the chip shows the
        // active model and offers no menu.
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.serverUrl]);

  const choose = useCallback(
    async (modelId: string) => {
      setActive(modelId);
      await fetch(`${workspace.serverUrl}/api/v1/configure/inference/provider`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
      }).catch(() => undefined);
    },
    [workspace.serverUrl],
  );

  const current = models.find(model => model.id === active);
  const label = current?.name || active || 'Model';

  if (models.length === 0) {
    return <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{label}</Text>;
  }

  const local = models.filter(model => model.local);
  const hosted = models.filter(model => !model.local);

  const item = (model: CatalogModel) => (
    <ActionList.Item
      key={model.id}
      selected={model.id === active}
      // Unavailable is not hidden: a model whose key is missing should be
      // visible with the reason, or the reader wonders where it went.
      disabled={model.available === false}
      onSelect={() => void choose(model.id)}
    >
      {model.name}
      <ActionList.Description variant="block">
        {model.available === false
          ? model.local
            ? 'not reachable'
            : `missing ${(model.missing_env_vars ?? []).join(', ')}`
          : (model.warning ?? model.id)}
      </ActionList.Description>
    </ActionList.Item>
  );

  return (
    <Box sx={{ display: 'flex', alignItems: 'center' }}>
      <ActionMenu>
        <ActionMenu.Button variant="invisible" size="small">
          {current?.local ? '◆ ' : ''}
          {label}
        </ActionMenu.Button>
        <ActionMenu.Overlay width="large">
          <ActionList selectionVariant="single" showDividers>
            {local.length > 0 ? (
              <ActionList.Group>
                <ActionList.GroupHeading>On this machine</ActionList.GroupHeading>
                {local.map(item)}
              </ActionList.Group>
            ) : null}
            <ActionList.Group>
              <ActionList.GroupHeading>Cloud</ActionList.GroupHeading>
              {hosted.map(item)}
            </ActionList.Group>
          </ActionList>
        </ActionMenu.Overlay>
      </ActionMenu>
    </Box>
  );
}

export default ModelChip;
