/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * An agent's page at its address (`{name}.web.<domain>`): what it is and how it
 * is reached, in its application's own theme and accent (primer-addons).
 *
 * The runtime's web server writes what to show into the page
 * (`agent_runtimes.addresses.web.agent_view`, the script tag
 * `agent-runtimes-agent-view`): what it does, its agent (model, MCP servers,
 * skills, tools), its operations with their inputs and outputs, its protocols,
 * who may open it, and its four addresses.
 *
 * @module addresses/AgentWebPage
 */

import { useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { Box, Card, useSystemColorMode } from '@datalayer/primer-addons';
import { Button, Heading, Label, Text } from '@primer/react';
import { EmbedThemed } from '../apps/embed/AppEmbed';
import type { AppAccent, AppThemeVariant } from '../types/agentspecs';

/** A JSON schema, as an operation's inputs or answer say it. */
export type JsonSchema = {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
};

/** One operation of the agent's `openapi`. */
export interface AgentViewOperation {
  operation_id: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  inputs: JsonSchema;
  output: JsonSchema;
  pap: { action?: string; summary?: string; scope?: string } | null;
}

/** What the page shows: `agent_view` of the runtime's web server. */
export interface AgentView {
  id: string;
  name: string;
  description: string;
  emoji: string;
  kind: string;
  role: 'company' | 'personal' | 'app';
  acts_for: string;
  agent: {
    id: string;
    name: string;
    description: string;
    model: string;
    mcp_servers: string[];
    skills: string[];
    tools: { name: string; description: string }[];
  };
  operations: AgentViewOperation[];
  declares_openapi: boolean;
  protocols: string[];
  visibility: 'public' | 'private';
  addresses: Record<
    'agent' | 'mcp' | 'api' | 'web',
    { host: string; url: string }
  > | null;
  interface: {
    accent: string;
    theme: { variant?: string; mode?: string } | null;
  };
}

/** The script tag the runtime writes the view in. */
export const AGENT_VIEW_ID = 'agent-runtimes-agent-view';

/** The view written into the page; an error when there is none. */
export function readAgentView(doc: Document = document): AgentView {
  const tag = doc.getElementById(AGENT_VIEW_ID);
  if (!tag?.textContent) {
    throw new Error(
      `This page is served by an agent's web server, which writes #${AGENT_VIEW_ID}.`,
    );
  }
  return JSON.parse(tag.textContent) as AgentView;
}

/** What the agent is, as a person reads it. */
export function roleOf(view: Pick<AgentView, 'role' | 'acts_for'>): string {
  if (view.role === 'company') {
    return 'A company’s agent';
  }
  if (view.role === 'personal') {
    return `${view.acts_for}’s own agent`;
  }
  return 'An application';
}

/** Who may open it, as a person reads it. */
export function visibilityOf(visibility: AgentView['visibility']): string {
  return visibility === 'public'
    ? 'Anyone, under its spend limit and a rate cap per caller.'
    : 'Only the people its owner allowed: with a Datalayer API key or their sign-in.';
}

/** The four addresses, in the order they are said, each with what it is for. */
export const ADDRESS_KINDS: {
  kind: 'agent' | 'mcp' | 'api' | 'web';
  label: string;
  says: string;
}[] = [
  { kind: 'agent', label: 'Agent', says: 'A2A, its chat, poppy.json' },
  { kind: 'mcp', label: 'MCP', says: 'Its operations as MCP tools' },
  { kind: 'api', label: 'API', says: 'Its operations as REST, /openapi.json' },
  { kind: 'web', label: 'Web', says: 'This page' },
];

function SchemaFields({ schema }: { schema: JsonSchema }): JSX.Element {
  const properties = Object.entries(schema.properties ?? {});
  if (properties.length === 0) {
    return (
      <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
        {schema.type ? `A ${schema.type}.` : 'Nothing.'}
      </Text>
    );
  }
  const required = new Set(schema.required ?? []);
  return (
    <Box as="ul" sx={{ m: 0, pl: 3 }}>
      {properties.map(([name, field]) => (
        <Box as="li" key={name} sx={{ fontSize: 1, mb: 1 }}>
          <Text sx={{ fontFamily: 'mono', fontWeight: 'bold' }}>{name}</Text>{' '}
          <Text sx={{ color: 'fg.muted' }}>
            {field.type ?? 'any'}
            {required.has(name) ? ', required' : ''}
          </Text>
          {field.description ? <Text> — {field.description}</Text> : null}
        </Box>
      ))}
    </Box>
  );
}

function Operation({
  operation,
}: {
  operation: AgentViewOperation;
}): JSX.Element {
  return (
    <Card sx={{ p: 3, gap: 2 }}>
      <Box
        sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Label variant="accent">{operation.method}</Label>
        <Text sx={{ fontFamily: 'mono' }}>{operation.path}</Text>
        <Text sx={{ fontFamily: 'mono', color: 'fg.muted' }}>
          {operation.operation_id}
        </Text>
        {operation.pap ? (
          <Label variant="attention">
            The person approves
            {operation.pap.scope ? ` · ${operation.pap.scope}` : ''}
          </Label>
        ) : null}
      </Box>
      <Text sx={{ fontWeight: 'bold' }}>{operation.summary}</Text>
      {operation.description ? <Text>{operation.description}</Text> : null}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: ['1fr', '1fr 1fr'],
          gap: 3,
        }}
      >
        <Box>
          <Text sx={{ fontSize: 1, color: 'fg.muted' }}>It takes</Text>
          <SchemaFields schema={operation.inputs} />
        </Box>
        <Box>
          <Text sx={{ fontSize: 1, color: 'fg.muted' }}>It answers</Text>
          <SchemaFields schema={operation.output} />
        </Box>
      </Box>
    </Card>
  );
}

function Address({
  label,
  says,
  url,
}: {
  label: string;
  says: string;
  url: string;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}
    >
      <Text sx={{ fontWeight: 'bold', minWidth: 56 }}>{label}</Text>
      <Text sx={{ fontFamily: 'mono', wordBreak: 'break-all' }}>{url}</Text>
      <Text sx={{ color: 'fg.muted', fontSize: 1 }}>{says}</Text>
      <Button
        size="small"
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          setCopied(true);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </Box>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <Box as="section" sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Heading as="h2" sx={{ fontSize: 3 }}>
        {title}
      </Heading>
      {children}
    </Box>
  );
}

/** The page: the agent, in its own theme. */
export function AgentWebPage({ view }: { view: AgentView }): JSX.Element {
  const system = useSystemColorMode();
  const mode = view.interface.theme?.mode;
  const colorMode = mode === 'light' || mode === 'dark' ? mode : system;
  const variant = (view.interface.theme?.variant || 'loop') as AppThemeVariant;
  const accent = (view.interface.accent || undefined) as AppAccent | undefined;
  const { agent } = view;
  return (
    <EmbedThemed accent={accent} colorMode={colorMode} variant={variant}>
      <Box
        as="main"
        sx={{
          maxWidth: 960,
          mx: 'auto',
          px: 3,
          py: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          bg: 'canvas.default',
          minHeight: '100vh',
        }}
      >
        <Box as="header" sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <Text sx={{ fontSize: 6 }} aria-hidden>
            {view.emoji}
          </Text>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Heading as="h1">{view.name}</Heading>
            <Text sx={{ color: 'fg.muted' }}>{roleOf(view)}</Text>
          </Box>
        </Box>
        {view.description ? (
          <Text sx={{ fontSize: 2 }}>{view.description}</Text>
        ) : null}

        {view.addresses ? (
          <Section title="Where it is">
            <Card sx={{ p: 3, gap: 2 }}>
              {ADDRESS_KINDS.map(({ kind, label, says }) => (
                <Address
                  key={kind}
                  label={label}
                  says={says}
                  url={view.addresses![kind].url}
                />
              ))}
            </Card>
          </Section>
        ) : null}

        <Section title="Who may open it">
          <Text>{visibilityOf(view.visibility)}</Text>
        </Section>

        <Section title="What it answers">
          {!view.declares_openapi ? (
            <Text sx={{ color: 'fg.muted' }}>
              It declares no operations of its own: ask it anything.
            </Text>
          ) : null}
          {view.operations.map(operation => (
            <Operation key={operation.operation_id} operation={operation} />
          ))}
        </Section>

        <Section title="Its agent">
          <Card sx={{ p: 3, gap: 2 }}>
            <Text sx={{ fontWeight: 'bold' }}>{agent.name}</Text>
            {agent.description ? <Text>{agent.description}</Text> : null}
            {agent.model ? (
              <Text sx={{ fontSize: 1 }}>
                Model <Text sx={{ fontFamily: 'mono' }}>{agent.model}</Text>
              </Text>
            ) : null}
            {[
              ['MCP servers', agent.mcp_servers],
              ['Skills', agent.skills],
              ['Tools', agent.tools.map(tool => tool.name)],
            ].map(([label, items]) =>
              (items as string[]).length > 0 ? (
                <Box
                  key={label as string}
                  sx={{
                    display: 'flex',
                    gap: 1,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                  }}
                >
                  <Text sx={{ fontSize: 1, color: 'fg.muted', mr: 1 }}>
                    {label as string}
                  </Text>
                  {(items as string[]).map(item => (
                    <Label key={item}>{item}</Label>
                  ))}
                </Box>
              ) : null,
            )}
          </Card>
        </Section>

        {view.protocols.length > 0 ? (
          <Section title="The protocols it speaks">
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {view.protocols.map(protocol => (
                <Label key={protocol} variant="accent">
                  {protocol}
                </Label>
              ))}
            </Box>
          </Section>
        ) : null}
      </Box>
    </EmbedThemed>
  );
}

export default AgentWebPage;
