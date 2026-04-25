/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import type {
  ExampleAgent,
  ExampleAgentStatus,
  ExampleAgentsState,
  Protocol,
} from '../../types';
import { listPersonas } from '../../specs/personas';

// Per-persona presentation metadata used by the example dropdown.
// The four migrated personas (sentinel, marketing, forecaster, trader)
// keep links to the notebook/lexical seed files in `./agents/`.
interface PersonaPresentation {
  author: string;
  lastEdited: string;
  screenshot: string;
  status: ExampleAgentStatus;
  protocol: Protocol;
  avatarUrl: string;
  notebookFile: string;
  lexicalFile: string;
  stars: number;
  notifications: number;
}

const DEFAULT_PRESENTATION: PersonaPresentation = {
  author: 'Datalayer',
  lastEdited: 'just now',
  screenshot:
    'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=300&h=150&fit=crop',
  status: 'paused',
  protocol: 'vercel-ai',
  avatarUrl: 'https://avatars.githubusercontent.com/datalayer',
  notebookFile: '',
  lexicalFile: '',
  stars: 0,
  notifications: 0,
};

const PERSONA_PRESENTATIONS: Record<string, Partial<PersonaPresentation>> = {
  sentinel: {
    author: 'Eric Charles',
    lastEdited: '53 minutes ago',
    screenshot:
      'https://images.unsplash.com/photo-1589519160732-57fc498494f8?w=300&h=150&fit=crop',
    status: 'paused',
    protocol: 'ag-ui',
    avatarUrl: 'https://avatars.githubusercontent.com/atom',
    notebookFile: 'earthquake-detector.ipynb.json',
    lexicalFile: 'earthquake-detector.lexical.json',
    stars: 4,
  },
  trader: {
    author: 'Gonzalo Peña-Castellanos',
    lastEdited: '3 days ago',
    screenshot:
      'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=300&h=150&fit=crop',
    status: 'paused',
    protocol: 'acp',
    avatarUrl: 'https://avatars.githubusercontent.com/desktop',
    notebookFile: 'stock-market.ipynb.json',
    lexicalFile: 'stock-market.lexical.json',
    stars: 1,
  },
  forecaster: {
    author: 'Eric Charles',
    lastEdited: '1 hour ago',
    screenshot:
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=300&h=150&fit=crop',
    status: 'running',
    protocol: 'vercel-ai',
    avatarUrl: 'https://avatars.githubusercontent.com/github',
    notebookFile: 'sales-forecaster.ipynb.json',
    lexicalFile: 'sales-forecaster.lexical.json',
    stars: 5,
    notifications: 2,
  },
  marketing: {
    author: 'Eric Charles',
    lastEdited: '2 hours ago',
    screenshot:
      'https://images.unsplash.com/photo-1611926653458-09294b3142bf?w=300&h=150&fit=crop',
    status: 'paused',
    protocol: 'ag-ui',
    avatarUrl: 'https://avatars.githubusercontent.com/primer',
    notebookFile: 'social-post-generator.ipynb.json',
    lexicalFile: 'social-post-generator.lexical.json',
    stars: 3,
    notifications: 1,
  },
};

// Build the agent list from the generated personas catalogue.
const initialAgents: ExampleAgent[] = listPersonas().map(persona => {
  const presentation: PersonaPresentation = {
    ...DEFAULT_PRESENTATION,
    ...(PERSONA_PRESENTATIONS[persona.id] ?? {}),
  };
  return {
    id: persona.id,
    name: persona.name,
    description: persona.description,
    author: presentation.author,
    lastEdited: presentation.lastEdited,
    screenshot: presentation.screenshot,
    status: presentation.status,
    protocol: presentation.protocol,
    avatarUrl: presentation.avatarUrl,
    notebookFile: presentation.notebookFile,
    lexicalFile: presentation.lexicalFile,
    stars: presentation.stars,
    notifications: presentation.notifications,
  };
});

export const agentsStore = createStore<ExampleAgentsState>(set => ({
  agents: initialAgents,
  getAgentById: (id: string) => {
    const state = agentsStore.getState();
    return state.agents.find(agent => agent.id === id);
  },
  updateAgentStatus: (id: string, status: ExampleAgentStatus) => {
    set(state => ({
      agents: state.agents.map(agent =>
        agent.id === id ? { ...agent, status } : agent,
      ),
    }));
  },
  toggleAgentStatus: (id: string) => {
    set(state => ({
      agents: state.agents.map(agent =>
        agent.id === id
          ? {
              ...agent,
              status: agent.status === 'running' ? 'paused' : 'running',
            }
          : agent,
      ),
    }));
  },
}));

export function useAgentsStore(): ExampleAgentsState;
export function useAgentsStore<T>(
  selector: (state: ExampleAgentsState) => T,
): T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useAgentsStore(selector?: any) {
  return useStore(agentsStore, selector);
}
