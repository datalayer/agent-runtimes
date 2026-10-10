/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * *Agent Details…*, from the assistant's menu: the agent's `AgentDetails`
 * in a dialog over the page. On an agent-runtimes server it reads what that
 * server says of the agent (its spec, MCP servers, codemode, context); an
 * agent in the page, or a peer known by its A2A card, is described by what
 * its host knows: its Appspec, model and where it runs.
 *
 * Loaded when it is first opened, never with the character.
 *
 * @module chat/assistant/AgentDetailsDialog
 */

import type { JSX } from 'react';
import { useMemo } from 'react';
import { Dialog } from '@primer/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AgentDetails } from '../../agents/AgentDetails';
import type { AssistantAbout } from './AssistantStage';

export type AgentDetailsDialogProps = {
  about: AssistantAbout;
  /** The character's name, when the agent has none of its own. */
  name: string;
  onClose: () => void;
};

export function AgentDetailsDialog({
  about,
  name,
  onClose,
}: AgentDetailsDialogProps): JSX.Element {
  // AgentDetails reads the runtime through react-query; a page that shows
  // only a character has no client of its own.
  const queries = useMemo(() => new QueryClient(), []);
  const onRuntime = Boolean(about.agentId && about.apiBase);
  return (
    <Dialog
      title={`${about.name ?? name} · Agent Details`}
      onClose={onClose}
      width="xlarge"
      height="large"
    >
      <div data-assistant-agent-details="">
        <QueryClientProvider client={queries}>
          <AgentDetails
            name={about.name ?? name}
            protocol={
              about.protocol ?? (onRuntime ? 'agent-runtimes' : 'browser')
            }
            url={about.url ?? ''}
            messageCount={0}
            agentId={about.agentId}
            apiBase={about.apiBase}
            onBack={onClose}
            showBackHeader={false}
            showUsage={onRuntime}
            padded={false}
            runtime={onRuntime}
            summary={{
              spec: about.spec,
              model: about.model,
              where: about.where,
              description: about.description,
              skills: about.skills,
            }}
          />
        </QueryClientProvider>
      </div>
    </Dialog>
  );
}

export default AgentDetailsDialog;
