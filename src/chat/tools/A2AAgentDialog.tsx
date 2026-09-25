/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The overlay behind "card" on an A2A run.
 *
 * Everything the run's events said about the agent — where it was launched,
 * its endpoint, its task and state — and the agent card fetched live from the
 * agent itself, laid out field by field with the raw JSON underneath, and a
 * link out to the card's URL for whoever wants the tab after all.
 *
 * @module chat/tools/A2AAgentDialog
 */

import React, { useEffect, useState } from 'react';
import { Heading, Label, Link, Spinner, Text } from '@primer/react';
import { Dialog } from '@primer/react/experimental';
import { LinkExternalIcon } from '@primer/octicons-react';
import { Box } from '@datalayer/primer-addons';
import type { AgentStreamSubagentPayload } from '../../types/stream';

/** What is known about an agent reached over A2A, from the run's events. */
export interface A2AAgentDetails {
  /** The subagent name the parent delegates to. */
  name: string;
  /** The agent's JSON-RPC endpoint. */
  url?: string;
  /** `local`, `cloud`, `remote`, or `auto` while undecided. */
  launch?: string;
  /** Where the run stands: `launching`, `ready`, then the A2A task states. */
  state?: string;
  taskId?: string | null;
  runtimeUid?: string;
  /** The card summary the server sent when it resolved the agent. */
  card?: AgentStreamSubagentPayload['agentCard'];
  /** The agentspec it was launched from, as `<id>:<version>`. */
  ref?: string;
  description?: string;
}

/**
 * The agent behind a delegated run, or `null` when the run is not over A2A.
 * Later events win, except the name, which is the first one's.
 */
export function a2aAgentDetails(
  events: readonly AgentStreamSubagentPayload[],
  fallbackName?: string,
): A2AAgentDetails | null {
  if (!events.some(event => event.transport === 'a2a')) {
    return null;
  }
  const details: A2AAgentDetails = {
    name: events[0]?.subagentName ?? fallbackName ?? 'agent',
  };
  for (const event of events) {
    if (event.url) details.url = event.url;
    if (event.launch && event.launch !== 'auto') details.launch = event.launch;
    if (event.phase === 'status' && event.state) details.state = event.state;
    if (event.taskId) details.taskId = event.taskId;
    if (event.runtimeUid) details.runtimeUid = event.runtimeUid;
    if (event.agentCard) details.card = event.agentCard;
  }
  return details;
}

/** Where an A2A agent publishes its card. */
export function agentCardUrl(url: string): string {
  return `${url.replace(/\/+$/, '')}/.well-known/agent-card.json`;
}

export type AgentCardFetch =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; card: Record<string, unknown> }
  | { status: 'error'; error: string };

/** The agent card at `url`, fetched when the URL is known and refetched when it changes. */
export function useAgentCard(url: string | undefined): AgentCardFetch {
  const [state, setState] = useState<AgentCardFetch>({
    status: url ? 'loading' : 'idle',
  });
  useEffect(() => {
    if (!url) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetch(agentCardUrl(url), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`.trim());
        }
        const body: unknown = await response.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          throw new Error('The agent card is not a JSON object');
        }
        setState({ status: 'loaded', card: body as Record<string, unknown> });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          error: reason instanceof Error ? reason.message : String(reason),
        });
      });
    return () => controller.abort();
  }, [url]);
  return state;
}

// ---------------------------------------------------------------------------
// Reading a card without trusting its shape
// ---------------------------------------------------------------------------

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const items = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.map(record).filter((v): v is Record<string, unknown> => !!v)
    : [];
const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Heading as="h4" sx={{ fontSize: 1, m: 0 }}>
        {title}
      </Heading>
      {children}
    </Box>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '112px 1fr',
        gap: 2,
        alignItems: 'baseline',
        fontSize: 0,
      }}
    >
      <Text sx={{ color: 'fg.muted', fontSize: 0 }}>{label}</Text>
      <Box sx={{ minWidth: 0, wordBreak: 'break-all' }}>{children}</Box>
    </Box>
  );
}

function External({
  href,
  children,
}: {
  href: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      sx={{
        fontSize: 0,
        fontFamily: 'mono',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
      }}
    >
      {children ?? href}
      <LinkExternalIcon size={12} />
    </Link>
  );
}

function Mono({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text sx={{ fontSize: 0, fontFamily: 'mono' }}>{children}</Text>;
}

/** camelCase or snake_case, as words, for a key the card renderer never heard of. */
function humanize(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const isUrl = (value: string): boolean => /^https?:\/\//.test(value);

const None = ({ word = 'none' }: { word?: string }): React.ReactElement => (
  <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{word}</Text>
);

/**
 * Any JSON value, laid out: scalars as text (URLs as links, booleans as
 * yes/no), arrays as lists, objects as key/value rows — three levels deep,
 * compact JSON below that. A key the card renderer never heard of still
 * reads as information rather than as a blob to open the raw JSON for.
 */
function ValueView({
  value,
  depth = 0,
}: {
  value: unknown;
  depth?: number;
}): React.ReactElement {
  if (value === null || value === undefined) {
    return <None word="—" />;
  }
  if (typeof value === 'boolean') {
    return (
      <Label size="small" variant={value ? 'success' : 'secondary'}>
        {value ? 'yes' : 'no'}
      </Label>
    );
  }
  if (typeof value === 'number') {
    return <Mono>{String(value)}</Mono>;
  }
  if (typeof value === 'string') {
    return isUrl(value) ? (
      <External href={value} />
    ) : (
      <Text sx={{ fontSize: 0 }}>{value}</Text>
    );
  }
  if (depth >= 3) {
    return <Mono>{JSON.stringify(value)}</Mono>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <None />;
    }
    if (value.every(item => typeof item !== 'object' || item === null)) {
      return (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {value.map((item, index) => (
            <ValueView key={index} value={item} depth={depth + 1} />
          ))}
        </Box>
      );
    }
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {value.map((item, index) => (
          <Box
            key={index}
            sx={{ pl: 2, borderLeft: '2px solid', borderColor: 'border.muted' }}
          >
            <ValueView value={item} depth={depth + 1} />
          </Box>
        ))}
      </Box>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return <None word="empty" />;
  }
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'max-content 1fr',
        columnGap: 2,
        rowGap: 1,
        alignItems: 'baseline',
      }}
    >
      {entries.map(([key, entry]) => (
        <React.Fragment key={key}>
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>{humanize(key)}</Text>
          <Box sx={{ minWidth: 0, wordBreak: 'break-all' }}>
            <ValueView value={entry} depth={depth + 1} />
          </Box>
        </React.Fragment>
      ))}
    </Box>
  );
}

/** The keys laid out by hand below; every other top-level key gets a row of its own. */
const HANDLED_KEYS = new Set([
  'name',
  'description',
  'version',
  'protocolVersion',
  'url',
  'documentationUrl',
  'iconUrl',
  'provider',
  'supportedInterfaces',
  'capabilities',
  'skills',
  'defaultInputModes',
  'defaultOutputModes',
]);

/**
 * The card, field by field: the fields the A2A card schema names, laid out
 * the way a reader wants them, then every other top-level key the agent
 * chose to publish — nothing is left to the raw JSON alone.
 */
function CardFields({
  card,
}: {
  card: Record<string, unknown>;
}): React.ReactElement {
  const provider = record(card.provider);
  const capabilities = record(card.capabilities);
  const capabilityEntries = Object.entries(capabilities ?? {});
  const extensions = items(capabilities?.extensions);
  const interfaces = items(card.supportedInterfaces);
  const skills = items(card.skills);
  const inputs = strings(card.defaultInputModes);
  const outputs = strings(card.defaultOutputModes);
  const others = Object.entries(card).filter(([key]) => !HANDLED_KEYS.has(key));
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Text sx={{ fontSize: 1, fontWeight: 'bold' }}>
          {text(card.name) ?? 'Unnamed agent'}
        </Text>
        {text(card.version) ? (
          <Text sx={{ fontSize: 0, color: 'fg.muted', ml: 2 }}>
            v{text(card.version)}
          </Text>
        ) : null}
        {text(card.protocolVersion) ? (
          <Text sx={{ fontSize: 0, color: 'fg.muted', ml: 2 }}>
            A2A {text(card.protocolVersion)}
          </Text>
        ) : null}
        {text(card.description) ? (
          <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', mt: 1, mb: 0 }}>
            {text(card.description)}
          </Text>
        ) : null}
      </Box>
      {text(card.url) ? (
        <Row label="Endpoint">
          <External href={text(card.url) as string} />
        </Row>
      ) : null}
      {text(card.documentationUrl) ? (
        <Row label="Documentation">
          <External href={text(card.documentationUrl) as string} />
        </Row>
      ) : null}
      {text(card.iconUrl) ? (
        <Row label="Icon">
          <External href={text(card.iconUrl) as string} />
        </Row>
      ) : null}
      {provider ? (
        <Row label="Provider">
          <ValueView value={provider} depth={1} />
        </Row>
      ) : null}
      {card.supportedInterfaces !== undefined ? (
        <Row label="Interfaces">
          {interfaces.length === 0 ? (
            <None />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {interfaces.map((entry, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    gap: 2,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <Label size="small">
                    {text(entry.protocolBinding) ?? 'binding'}
                  </Label>
                  {text(entry.url) ? <Mono>{text(entry.url)}</Mono> : null}
                  {text(entry.protocolVersion) ? (
                    <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                      v{text(entry.protocolVersion)}
                    </Text>
                  ) : null}
                </Box>
              ))}
            </Box>
          )}
        </Row>
      ) : null}
      {capabilities !== undefined ? (
        <Row label="Capabilities">
          {capabilityEntries.length === 0 ? (
            <None />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {/* Every flag, on or off: an absent "no" reads as unknown. */}
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {capabilityEntries
                  .filter(([, flag]) => typeof flag === 'boolean')
                  .map(([key, flag]) => (
                    <Label
                      key={key}
                      size="small"
                      variant={flag ? 'success' : 'secondary'}
                    >
                      {key}: {flag ? 'yes' : 'no'}
                    </Label>
                  ))}
              </Box>
              {extensions.map((extension, index) => (
                <Box
                  key={index}
                  sx={{
                    display: 'flex',
                    gap: 2,
                    alignItems: 'baseline',
                    flexWrap: 'wrap',
                  }}
                >
                  <Mono>{text(extension.uri) ?? 'extension'}</Mono>
                  {extension.required === true ? (
                    <Label size="small" variant="attention">
                      required
                    </Label>
                  ) : null}
                  {text(extension.description) ? (
                    <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                      {text(extension.description)}
                    </Text>
                  ) : null}
                </Box>
              ))}
              {capabilityEntries
                .filter(
                  ([key, entry]) =>
                    typeof entry !== 'boolean' && key !== 'extensions',
                )
                .map(([key, entry]) => (
                  <Box key={key} sx={{ display: 'flex', gap: 2 }}>
                    <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                      {humanize(key)}
                    </Text>
                    <ValueView value={entry} depth={1} />
                  </Box>
                ))}
            </Box>
          )}
        </Row>
      ) : null}
      {card.skills !== undefined ? (
        <Row label="Skills">
          {skills.length === 0 ? (
            <None />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {skills.map((skill, index) => (
                <Box key={index}>
                  <Text sx={{ fontSize: 0, fontWeight: 'bold' }}>
                    {text(skill.name) ?? text(skill.id) ?? 'skill'}
                  </Text>
                  {text(skill.description) ? (
                    <Text sx={{ fontSize: 0, color: 'fg.muted', ml: 2 }}>
                      {text(skill.description)}
                    </Text>
                  ) : null}
                  {strings(skill.tags).length > 0 ? (
                    <Box sx={{ display: 'inline-flex', gap: 1, ml: 2 }}>
                      {strings(skill.tags).map(tag => (
                        <Label key={tag} size="small">
                          {tag}
                        </Label>
                      ))}
                    </Box>
                  ) : null}
                </Box>
              ))}
            </Box>
          )}
        </Row>
      ) : null}
      {card.defaultInputModes !== undefined ? (
        <Row label="Input modes">
          {inputs.length ? <Mono>{inputs.join(', ')}</Mono> : <None />}
        </Row>
      ) : null}
      {card.defaultOutputModes !== undefined ? (
        <Row label="Output modes">
          {outputs.length ? <Mono>{outputs.join(', ')}</Mono> : <None />}
        </Row>
      ) : null}
      {others.map(([key, value]) => (
        <Row key={key} label={humanize(key)}>
          <ValueView value={value} />
        </Row>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// The dialog
// ---------------------------------------------------------------------------

export interface A2AAgentDialogProps {
  details: A2AAgentDetails;
  onClose: () => void;
}

const LAUNCH_LABEL: Record<string, string> = {
  local: 'launched on the local agent-runtimes server',
  cloud: 'launched on a Datalayer runtime',
  remote: 'reached at a URL the spec named',
  auto: 'launch not decided yet',
};

/**
 * Everything about the agent behind an A2A run: the run's own facts, the
 * card fetched from the agent, the raw JSON, and the way out to the URL.
 */
export function A2AAgentDialog({
  details,
  onClose,
}: A2AAgentDialogProps): React.ReactElement {
  const fetched = useAgentCard(details.url);
  const cardUrl = details.url ? agentCardUrl(details.url) : undefined;
  const openCard = () => {
    if (cardUrl) window.open(cardUrl, '_blank', 'noopener,noreferrer');
  };
  return (
    <Dialog
      onClose={onClose}
      title={`A2A agent · ${details.name}`}
      subtitle="A separate agent, reached over the A2A protocol"
      width="large"
      footerButtons={[
        ...(cardUrl
          ? [{ content: 'Open agent card', onClick: openCard } as const]
          : []),
        { content: 'Close', onClick: onClose, buttonType: 'primary' as const },
      ]}
    >
      <Box
        data-a2a-agent-dialog={details.name}
        data-a2a-card-status={fetched.status}
        sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}
      >
        <Section title="This run">
          {details.description ? (
            <Text as="p" sx={{ fontSize: 0, color: 'fg.muted', m: 0 }}>
              {details.description}
            </Text>
          ) : null}
          <Row label="Launch">
            <Text sx={{ fontSize: 0 }}>
              {details.launch ?? 'auto'}
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                {' '}
                — {LAUNCH_LABEL[details.launch ?? 'auto'] ?? ''}
              </Text>
            </Text>
          </Row>
          {details.ref ? (
            <Row label="Agentspec">
              <Mono>{details.ref}</Mono>
            </Row>
          ) : null}
          <Row label="State">
            <Text sx={{ fontSize: 0 }}>{details.state ?? 'unknown'}</Text>
          </Row>
          {details.taskId ? (
            <Row label="Task">
              <Mono>{details.taskId}</Mono>
            </Row>
          ) : null}
          {details.runtimeUid ? (
            <Row label="Runtime">
              <Mono>{details.runtimeUid}</Mono>
            </Row>
          ) : null}
          {details.url ? (
            <Row label="Endpoint">
              <External href={details.url} />
            </Row>
          ) : null}
          {cardUrl ? (
            <Row label="Agent card">
              <External href={cardUrl} />
            </Row>
          ) : null}
        </Section>

        <Section title="Agent card">
          {fetched.status === 'idle' ? (
            <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
              No endpoint known yet: the card can be fetched once the agent is
              launched.
            </Text>
          ) : null}
          {fetched.status === 'loading' ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Spinner size="small" />
              <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
                Fetching {cardUrl}…
              </Text>
            </Box>
          ) : null}
          {fetched.status === 'error' ? (
            <Text sx={{ fontSize: 0, color: 'danger.fg' }}>
              The card could not be fetched from here ({fetched.error}). It may
              still open in a tab through the link above.
            </Text>
          ) : null}
          {fetched.status === 'loaded' ? (
            <>
              <CardFields card={fetched.card} />
              <Box as="details" sx={{ fontSize: 0 }}>
                <Box as="summary" sx={{ cursor: 'pointer', color: 'fg.muted' }}>
                  Raw JSON
                </Box>
                <Box
                  as="pre"
                  data-a2a-card-json
                  sx={{
                    mt: 2,
                    p: 2,
                    bg: 'canvas.subtle',
                    border: '1px solid',
                    borderColor: 'border.default',
                    borderRadius: 2,
                    overflow: 'auto',
                    maxHeight: 280,
                    fontSize: 0,
                    m: 0,
                  }}
                >
                  {JSON.stringify(fetched.card, null, 2)}
                </Box>
              </Box>
            </>
          ) : null}
        </Section>

        {details.card && fetched.status !== 'loaded' ? (
          <Section title="Card, as the server saw it at launch">
            <Row label="Name">
              <Text sx={{ fontSize: 0 }}>
                {details.card.name ?? '—'}
                {details.card.version ? ` v${details.card.version}` : ''}
              </Text>
            </Row>
            {details.card.description ? (
              <Row label="Description">
                <Text sx={{ fontSize: 0 }}>{details.card.description}</Text>
              </Row>
            ) : null}
            {details.card.skills && details.card.skills.length > 0 ? (
              <Row label="Skills">
                <Text sx={{ fontSize: 0 }}>
                  {details.card.skills.join(', ')}
                </Text>
              </Row>
            ) : null}
          </Section>
        ) : null}
      </Box>
    </Dialog>
  );
}

export default A2AAgentDialog;
