/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgentCodeSandboxesExample
 *
 * The code sandbox variants, one agent each: choose where Python should run
 * — in-process eval, a Jupyter kernel, a container, a cloud runtime — and the
 * Loop creates an agent on that sandbox from the variant's capacity plugin.
 * Its first opener asks the code where it ran, which is the proof.
 *
 * @module examples/AgentCodeSandboxesExample
 */

/// <reference types="vite/client" />

import React, { useMemo, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Button, Heading, Label, Text } from '@primer/react';
import { CodespacesIcon, SyncIcon } from '@primer/octicons-react';
import { ThemedProvider } from './utils/themedProvider';
import { uniqueAgentId } from './utils/agentId';
import { resolveExampleAgentRuntimesUrl } from './utils/useExampleAgentRuntimesUrl';
import { LoopEmbed } from '../loop';
import {
  SANDBOX_CAPACITIES,
  SandboxCapacityPlugins,
} from '../loop/plugins/agent-code-sandboxes';

/** A variant launched: the capacity behind it and the agent made for it. */
interface LaunchedSandbox {
  key: string;
  agentId: string;
}

const AgentCodeSandboxesInner: React.FC = () => {
  const serverUrl = useMemo(() => resolveExampleAgentRuntimesUrl('local'), []);
  const [selectedKey, setSelectedKey] = useState<string>(
    SANDBOX_CAPACITIES[0].key,
  );
  const [launched, setLaunched] = useState<LaunchedSandbox | null>(null);

  const selected =
    SANDBOX_CAPACITIES.find(capacity => capacity.key === selectedKey) ??
    SANDBOX_CAPACITIES[0];
  const active = launched
    ? (SANDBOX_CAPACITIES.find(capacity => capacity.key === launched.key) ??
      selected)
    : selected;

  // One plugin per launch: the variant's capacity, whose blueprint pins the
  // sandbox_variant the agent is created with.
  const plugins = useMemo(
    () => (launched ? [SandboxCapacityPlugins[launched.key]] : []),
    [launched],
  );

  if (!launched) {
    return (
      <Box
        data-sandboxes-chooser
        sx={{
          maxWidth: 840,
          mx: 'auto',
          mt: 6,
          px: 3,
          py: 3,
          border: '1px solid',
          borderColor: 'border.default',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          bg: 'canvas.default',
        }}
      >
        <Text sx={{ fontSize: 0, fontWeight: 'bold', color: 'fg.muted' }}>
          SANDBOX VARIANT DEMO
        </Text>
        <Heading as="h2" sx={{ fontSize: 3 }}>
          Agent Code Sandboxes
        </Heading>
        <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
          Choose where the agent&apos;s Python should run, launch it, then ask
          the code where it ran to compare the sandboxes.
        </Text>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Label variant="accent">Spec: {selected.specId}</Label>
          <Label variant="secondary">Variant: {selected.variant}</Label>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Text sx={{ fontSize: 1, fontWeight: 600 }}>Sandbox Variant</Text>
          <select
            value={selectedKey}
            data-sandboxes-select
            onChange={event => setSelectedKey(event.target.value)}
            style={{
              width: '100%',
              maxWidth: 420,
              padding: '8px 10px',
              borderRadius: '6px',
              border: '1px solid var(--borderColor-default)',
              background: 'var(--bgColor-default)',
              color: 'var(--fgColor-default)',
            }}
          >
            {SANDBOX_CAPACITIES.map(capacity => (
              <option key={capacity.key} value={capacity.key}>
                {capacity.displayName} ({capacity.variant})
              </option>
            ))}
          </select>
          <Text sx={{ color: 'fg.muted', fontSize: 0 }}>
            {selected.description}
          </Text>
        </Box>

        <Button
          variant="primary"
          data-sandboxes-launch
          onClick={() =>
            setLaunched({
              key: selected.key,
              agentId: uniqueAgentId(`code-sandbox-${selected.variant}`),
            })
          }
          sx={{ width: '100%', maxWidth: 420 }}
        >
          Launch {selected.displayName}
        </Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bg: 'canvas.default',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 3,
          py: 2,
          borderBottom: '1px solid',
          borderColor: 'border.default',
          flexShrink: 0,
        }}
      >
        <CodespacesIcon size={16} />
        <Heading as="h3" sx={{ fontSize: 2, flex: 1 }}>
          Code Sandboxes Demo
        </Heading>
        <Label variant="accent">local</Label>
        <Label variant="accent" data-sandboxes-active={active.variant}>
          {active.displayName} · {active.variant}
        </Label>
        <Button
          size="small"
          leadingVisual={SyncIcon}
          data-sandboxes-change
          onClick={() => {
            setSelectedKey(active.key);
            setLaunched(null);
          }}
        >
          Change sandbox
        </Button>
      </Box>
      {/* The Loop creates the agent on the Local target from the variant's
          capacity plugin; a new launch is a new agent, hence the key. The
          variants stay visible so the agent is not pinned to the page. */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <LoopEmbed
          key={launched.agentId}
          serverUrl={serverUrl}
          target="local"
          showAgentVariants
          agentId={launched.agentId}
          editors={false}
          showHeader
          plugins={plugins}
        />
      </Box>
    </Box>
  );
};

const AgentCodeSandboxesExample: React.FC = () => (
  <ThemedProvider>
    <AgentCodeSandboxesInner />
  </ThemedProvider>
);

export default AgentCodeSandboxesExample;
