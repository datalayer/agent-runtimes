/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Replay a redacted PAP trace, step by step.
 *
 * The traces are generated from the PAP Python SDK's demo worlds by
 * `examples/personal-agent-protocol/traces/generate.py`: real keys, proofs
 * and HTTP between the parties, recorded and redacted. The TypeScript SDK
 * does not implement these features yet, so this view calls no SDK function:
 * it shows what the user sees, what each party holds, and the sequence of
 * exchanges between them, all synchronized on one step.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box } from '@datalayer/primer-addons';
import { Button, Heading, IconButton, Label, Text } from '@primer/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@primer/octicons-react';
import { PapExamplePage } from './PapExamplePage';

export type PapTraceParty = {
  id: string;
  name: string;
  role: string;
  initial: string;
  domain?: string;
};

export type PapTraceChat = {
  speaker: string;
  kind: 'message' | 'delta' | 'page' | 'approval' | 'result';
  text: string;
  title?: string;
};

export type PapTraceMessage = {
  headers: Record<string, string>;
  body?: unknown;
  encoding?: 'form' | 'sse';
};

export type PapTraceHttp = {
  kind: 'http';
  from: string;
  to: string;
  method: string;
  url: string;
  status: number | null;
  request: PapTraceMessage;
  response?: PapTraceMessage;
};

export type PapTraceAction = {
  kind: 'action';
  from: string;
  to: string;
  label: string;
};

export type PapTraceFact = { label: string; value: string; group?: string };

export type PapTraceStep = {
  title: string;
  channel: string;
  summary: string;
  chat: PapTraceChat[];
  views: Record<string, PapTraceFact[]>;
  sequence: (PapTraceHttp | PapTraceAction)[];
};

export type PapTrace = {
  slug: string;
  title: string;
  description: string;
  generator: string;
  parties: PapTraceParty[];
  steps: PapTraceStep[];
};

/** Refuse a trace that is not shaped like one, rather than render half of it. */
export function parsePapTrace(value: unknown): PapTrace {
  const trace = value as Partial<PapTrace> | null;
  if (
    !trace ||
    typeof trace.slug !== 'string' ||
    !Array.isArray(trace.parties) ||
    !Array.isArray(trace.steps) ||
    trace.steps.length === 0
  ) {
    throw new Error('Not a PAP trace');
  }
  const parties = new Set(trace.parties.map(party => party.id));
  for (const step of trace.steps) {
    for (const item of step.sequence) {
      if (!parties.has(item.from) || !parties.has(item.to)) {
        throw new Error(`Unknown party in trace step "${step.title}"`);
      }
    }
  }
  return trace as PapTrace;
}

type Tone = 'attention' | 'accent' | 'success' | 'done' | 'severe';
const TONES: readonly Tone[] = [
  'attention',
  'accent',
  'success',
  'done',
  'severe',
];

const toneOf = (parties: readonly PapTraceParty[], id: string): Tone =>
  TONES[
    Math.max(
      0,
      parties.findIndex(party => party.id === id),
    ) % TONES.length
  ];

const Avatar: React.FC<{
  party?: PapTraceParty;
  tone: Tone;
  size?: number;
}> = ({ party, tone, size = 24 }) => (
  <Box
    width={size}
    height={size}
    flexShrink={0}
    borderRadius="50%"
    bg={`${tone}.emphasis`}
    color="fg.onEmphasis"
    display="flex"
    alignItems="center"
    justifyContent="center"
    fontWeight={700}
    sx={{ fontSize: size > 24 ? 1 : 0 }}
    aria-hidden
  >
    {party?.initial ?? '?'}
  </Box>
);

const pathOf = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
};

const formatBody = (message?: PapTraceMessage): string => {
  if (!message || message.body === undefined) return '';
  if (message.encoding === 'form' && message.body) {
    return Object.entries(message.body as Record<string, string>)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  }
  if (typeof message.body === 'string') return message.body;
  return JSON.stringify(message.body, null, 2);
};

const formatMessage = (message?: PapTraceMessage): string => {
  if (!message) return '';
  const headers = Object.entries(message.headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n');
  const body = formatBody(message);
  return body ? `${headers}\n\n${body}` : headers;
};

const ChatItem: React.FC<{
  item: PapTraceChat;
  parties: readonly PapTraceParty[];
  current: boolean;
}> = ({ item, parties, current }) => {
  const party = parties.find(candidate => candidate.id === item.speaker);
  const tone = toneOf(parties, item.speaker);
  const mine = item.speaker === parties[0]?.id;
  const frame = {
    opacity: current ? 1 : 0.62,
    transition: 'opacity 160ms ease',
  };
  if (item.kind === 'page') {
    return (
      <Box
        border="1px solid"
        borderColor={`${tone}.emphasis`}
        borderRadius={2}
        overflow="hidden"
        bg="canvas.default"
        sx={frame}
      >
        <Box
          bg={`${tone}.emphasis`}
          color="fg.onEmphasis"
          px={2}
          py={1}
          sx={{ fontSize: 0, fontFamily: 'mono' }}
        >
          {item.title}
        </Box>
        <Text as="p" sx={{ m: 0, p: 2, fontSize: 1 }}>
          {item.text}
        </Text>
      </Box>
    );
  }
  if (item.kind === 'approval' || item.kind === 'result') {
    const approved = item.title?.includes('approved');
    return (
      <Box
        border="1px solid"
        borderColor={
          item.kind === 'result'
            ? 'success.emphasis'
            : approved
              ? 'accent.emphasis'
              : 'attention.emphasis'
        }
        borderRadius={2}
        bg="canvas.default"
        p={2}
        sx={frame}
      >
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <Label
            variant={
              item.kind === 'result'
                ? 'success'
                : approved
                  ? 'accent'
                  : 'attention'
            }
          >
            {item.kind === 'result' ? 'Result' : 'Operation'}
          </Label>
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
            {item.kind === 'result' ? party?.name : item.title}
          </Text>
        </Box>
        <Text as="p" sx={{ m: 0, fontSize: 1 }}>
          {item.text}
        </Text>
      </Box>
    );
  }
  return (
    <Box
      display="flex"
      flexDirection={mine ? 'row-reverse' : 'row'}
      gap={2}
      alignItems="flex-end"
      sx={frame}
    >
      <Avatar party={party} tone={tone} />
      <Box maxWidth="80%">
        <Text
          as="div"
          sx={{
            fontSize: 0,
            color: 'fg.muted',
            textAlign: mine ? 'right' : 'left',
          }}
        >
          {party?.name}
          {item.kind === 'delta' ? ' · streaming, display only' : ''}
        </Text>
        <Box
          px={2}
          py={1}
          borderRadius={2}
          bg={mine ? 'accent.subtle' : 'canvas.default'}
          border="1px solid"
          borderColor={mine ? 'accent.muted' : 'border.default'}
          sx={{
            fontSize: 1,
            fontStyle: item.kind === 'delta' ? 'italic' : 'normal',
            borderStyle: item.kind === 'delta' ? 'dashed' : 'solid',
          }}
        >
          {item.text}
          {item.kind === 'delta' ? '…' : ''}
        </Box>
      </Box>
    </Box>
  );
};

const Phone: React.FC<{
  trace: PapTrace;
  stepIndex: number;
}> = ({ trace, stepIndex }) => {
  const endRef = useRef<HTMLDivElement>(null);
  const agent = trace.parties[1];
  const items = useMemo(
    () =>
      trace.steps.slice(0, stepIndex + 1).flatMap((step, index) =>
        step.chat.map((item, position) => ({
          item,
          key: `${index}-${position}`,
          current: index === stepIndex,
        })),
      ),
    [trace, stepIndex],
  );
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [stepIndex]);

  return (
    <Box
      width="100%"
      maxWidth={360}
      height={600}
      mx="auto"
      border="7px solid"
      borderColor="fg.default"
      borderRadius={20}
      bg="canvas.default"
      overflow="hidden"
      boxShadow="shadow.large"
      display="flex"
      flexDirection="column"
    >
      <Box
        px={3}
        py={2}
        display="flex"
        gap={2}
        alignItems="center"
        borderBottom="1px solid"
        borderColor="border.default"
      >
        <Avatar
          party={agent}
          tone={toneOf(trace.parties, agent?.id ?? '')}
          size={30}
        />
        <Box>
          <Text as="div" sx={{ fontWeight: 700 }}>
            {agent?.name}
          </Text>
          <Text as="div" sx={{ fontSize: 0, color: 'fg.muted' }}>
            What {trace.parties[0]?.name} sees
          </Text>
        </Box>
      </Box>
      <Box
        flex={1}
        overflow="auto"
        bg="canvas.subtle"
        p={2}
        display="flex"
        flexDirection="column"
        gap={2}
      >
        {items.map(({ item, key, current }) => (
          <ChatItem
            key={key}
            item={item}
            parties={trace.parties}
            current={current}
          />
        ))}
        <div ref={endRef} />
      </Box>
    </Box>
  );
};

const SequenceRow: React.FC<{
  item: PapTraceHttp | PapTraceAction;
  parties: readonly PapTraceParty[];
  open: boolean;
  onToggle: () => void;
}> = ({ item, parties, open, onToggle }) => {
  const from = parties.findIndex(party => party.id === item.from);
  const to = parties.findIndex(party => party.id === item.to);
  const left = Math.min(from, to);
  const right = Math.max(from, to);
  const rightward = to >= from;
  const tone = toneOf(parties, item.from);
  const label =
    item.kind === 'http'
      ? `${item.method} ${pathOf(item.url)} → ${item.status ?? '…'}`
      : item.label;
  const failed = item.kind === 'http' && (item.status ?? 0) >= 400;
  return (
    <>
      <Box
        as={item.kind === 'http' ? 'button' : 'div'}
        onClick={item.kind === 'http' ? onToggle : undefined}
        aria-expanded={item.kind === 'http' ? open : undefined}
        sx={{
          gridColumn: `${left + 1} / ${right + 2}`,
          mx: '12%',
          px: 0,
          py: '2px',
          border: 0,
          bg: 'transparent',
          textAlign: 'center',
          cursor: item.kind === 'http' ? 'pointer' : 'default',
          color: 'fg.default',
          minWidth: 0,
        }}
      >
        <Text
          as="div"
          sx={{
            fontFamily: item.kind === 'http' ? 'mono' : 'normal',
            fontSize: 0,
            fontStyle: item.kind === 'action' ? 'italic' : 'normal',
            color: failed ? 'attention.fg' : 'fg.default',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={label}
        >
          {label}
        </Text>
        <Box display="flex" alignItems="center" aria-hidden>
          {!rightward ? (
            <Text sx={{ color: `${tone}.fg`, lineHeight: 1 }}>◀</Text>
          ) : null}
          <Box
            flex={1}
            sx={{
              borderTopWidth: 2,
              borderTopStyle: item.kind === 'action' ? 'dashed' : 'solid',
              borderTopColor: `${tone}.emphasis`,
            }}
          />
          {rightward ? (
            <Text sx={{ color: `${tone}.fg`, lineHeight: 1 }}>▶</Text>
          ) : null}
        </Box>
      </Box>
      {open && item.kind === 'http' ? (
        <Box
          sx={{ gridColumn: '1 / -1' }}
          bg="#0d1117"
          color="#c9d1d9"
          borderRadius={2}
          p={3}
          my={1}
          maxHeight={320}
          overflow="auto"
        >
          <Text
            as="div"
            sx={{ fontFamily: 'mono', fontWeight: 700, color: '#ff7b72' }}
          >
            {item.method} {item.url}
          </Text>
          <Box
            as="pre"
            mt={2}
            mb={3}
            sx={{ fontFamily: 'mono', fontSize: 0, whiteSpace: 'pre-wrap' }}
          >
            {formatMessage(item.request)}
          </Box>
          <Text
            as="div"
            sx={{ fontFamily: 'mono', fontWeight: 700, color: '#7ee787' }}
          >
            {item.status}
          </Text>
          <Box
            as="pre"
            mt={2}
            mb={0}
            sx={{ fontFamily: 'mono', fontSize: 0, whiteSpace: 'pre-wrap' }}
          >
            {formatMessage(item.response)}
          </Box>
        </Box>
      ) : null}
    </>
  );
};

const Sequence: React.FC<{ trace: PapTrace; step: PapTraceStep }> = ({
  trace,
  step,
}) => {
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => setOpen(null), [step]);
  const columns = `repeat(${trace.parties.length}, minmax(0, 1fr))`;
  return (
    <Box
      border="1px solid"
      borderColor="border.default"
      borderRadius={2}
      bg="canvas.default"
      p={3}
    >
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="baseline"
        mb={2}
      >
        <Text sx={{ fontWeight: 700 }}>Sequence</Text>
        <Text sx={{ fontSize: 0, color: 'fg.muted' }}>
          {step.sequence.filter(item => item.kind === 'http').length} HTTP
          exchanges · select one for the redacted wire
        </Text>
      </Box>
      <Box
        display="grid"
        sx={{ gridTemplateColumns: columns, rowGap: 1, columnGap: 0 }}
      >
        {trace.parties.map(party => (
          <Box
            key={party.id}
            display="flex"
            flexDirection="column"
            alignItems="center"
            gap={1}
            pb={2}
            borderBottom="1px solid"
            borderColor="border.muted"
            minWidth={0}
          >
            <Avatar party={party} tone={toneOf(trace.parties, party.id)} />
            <Text
              sx={{
                fontSize: 0,
                fontWeight: 600,
                textAlign: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '100%',
              }}
            >
              {party.name}
            </Text>
          </Box>
        ))}
        {step.sequence.length === 0 ? (
          <Text
            sx={{ gridColumn: '1 / -1', color: 'fg.muted', fontSize: 1, py: 2 }}
          >
            Nothing crosses the network in this step.
          </Text>
        ) : (
          step.sequence.map((item, index) => (
            <SequenceRow
              key={index}
              item={item}
              parties={trace.parties}
              open={open === index}
              onToggle={() => setOpen(open === index ? null : index)}
            />
          ))
        )}
      </Box>
    </Box>
  );
};

const PartyView: React.FC<{
  party: PapTraceParty;
  tone: Tone;
  facts: readonly PapTraceFact[];
  active: boolean;
}> = ({ party, tone, facts, active }) => {
  const groups = useMemo(() => {
    const byGroup = new Map<string, PapTraceFact[]>();
    for (const fact of facts) {
      const key = fact.group ?? '';
      byGroup.set(key, [...(byGroup.get(key) ?? []), fact]);
    }
    return [...byGroup.entries()];
  }, [facts]);
  return (
    <Box
      border="1px solid"
      borderColor={active ? `${tone}.emphasis` : 'border.default'}
      borderRadius={2}
      bg="canvas.default"
      overflow="hidden"
    >
      <Box
        px={3}
        py={2}
        display="flex"
        gap={2}
        alignItems="center"
        borderBottom="1px solid"
        borderColor="border.default"
      >
        <Avatar party={party} tone={tone} />
        <Box minWidth={0}>
          <Text as="div" sx={{ fontWeight: 700 }}>
            What {party.name} holds
          </Text>
          <Text as="div" sx={{ fontSize: 0, color: 'fg.muted' }}>
            {party.role}
            {party.domain ? ` · ${party.domain}` : ''}
          </Text>
        </Box>
      </Box>
      {groups.map(([group, items]) => (
        <Box key={group || 'facts'} px={3} pb={1}>
          {group ? (
            <Text
              as="div"
              sx={{ fontSize: 0, fontWeight: 600, color: 'fg.muted', pt: 2 }}
            >
              {group}
            </Text>
          ) : null}
          {items.map((fact, index) => (
            <Box
              key={`${fact.label}-${index}`}
              display="flex"
              justifyContent="space-between"
              gap={3}
              py={1}
              borderBottom="1px solid"
              borderColor="border.muted"
              sx={{ '&:last-child': { borderBottom: 0 } }}
            >
              <Text sx={{ color: 'fg.muted', fontSize: 1 }}>{fact.label}</Text>
              <Text textAlign="right" sx={{ fontWeight: 600, fontSize: 1 }}>
                {fact.value}
              </Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
};

/** A step-by-step replay: user view, party views, and the redacted sequence. */
export const PapTraceView: React.FC<{ trace: PapTrace; eyebrow?: string }> = ({
  trace,
  eyebrow = 'PAP · Replayed trace',
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const step = trace.steps[stepIndex] ?? trace.steps[0];
  const go = (next: number) =>
    setStepIndex(Math.max(0, Math.min(trace.steps.length - 1, next)));
  const active = new Set(step.sequence.flatMap(item => [item.from, item.to]));
  const observers = trace.parties.slice(1);

  return (
    <PapExamplePage
      eyebrow={eyebrow}
      title={trace.title}
      description={`${trace.description} Replayed from a trace the PAP Python SDK's demo world generated (${trace.generator}); every token, code, proof and assertion is a placeholder. These features need the PAP release after 0.3.3.`}
      maxWidth={1240}
    >
      <Box
        display="flex"
        gap={2}
        flexWrap="wrap"
        p={3}
        bg="canvas.default"
        border="1px solid"
        borderColor="border.default"
        borderRadius={2}
      >
        {trace.parties.map(party => (
          <Box key={party.id} display="flex" gap={2} alignItems="center" mr={3}>
            <Avatar party={party} tone={toneOf(trace.parties, party.id)} />
            <Box>
              <Text as="div" sx={{ fontWeight: 700, fontSize: 1 }}>
                {party.name}
              </Text>
              <Text as="div" sx={{ fontSize: 0, color: 'fg.muted' }}>
                {party.role}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>

      <Box display="flex" gap={2} alignItems="center">
        <IconButton
          icon={ChevronLeftIcon}
          aria-label="Previous step"
          disabled={stepIndex === 0}
          onClick={() => go(stepIndex - 1)}
        />
        <Box
          display="flex"
          gap={2}
          overflow="auto"
          flex={1}
          aria-label="Trace steps"
        >
          {trace.steps.map((candidate, index) => (
            <Button
              key={candidate.title}
              variant={index === stepIndex ? 'primary' : 'default'}
              onClick={() => go(index)}
              sx={{ flexShrink: 0 }}
            >
              {index + 1}. {candidate.title}
            </Button>
          ))}
        </Box>
        <IconButton
          icon={ChevronRightIcon}
          aria-label="Next step"
          disabled={stepIndex === trace.steps.length - 1}
          onClick={() => go(stepIndex + 1)}
        />
      </Box>

      <Box
        display="grid"
        sx={{
          gridTemplateColumns: ['1fr', '1fr', 'minmax(300px, 0.7fr) 1.5fr'],
        }}
        gap={4}
        alignItems="start"
      >
        <Phone trace={trace} stepIndex={stepIndex} />
        <Box display="flex" flexDirection="column" gap={3} minWidth={0}>
          <Box
            p={3}
            bg="canvas.default"
            border="1px solid"
            borderColor="border.default"
            borderRadius={2}
          >
            <Text as="div" sx={{ fontSize: 0, color: 'fg.muted' }}>
              Step {stepIndex + 1} of {trace.steps.length} · {step.channel}
            </Text>
            <Heading as="h2" sx={{ mt: 1, fontSize: 3 }}>
              {step.title}
            </Heading>
            <Text as="p" sx={{ mt: 2, mb: 0, color: 'fg.muted' }}>
              {step.summary}
            </Text>
          </Box>
          <Sequence trace={trace} step={step} />
          <Box
            display="grid"
            sx={{
              gridTemplateColumns: [
                '1fr',
                `repeat(${Math.min(observers.length, 3)}, minmax(0, 1fr))`,
              ],
            }}
            gap={3}
          >
            {observers.map(party => (
              <PartyView
                key={party.id}
                party={party}
                tone={toneOf(trace.parties, party.id)}
                facts={step.views[party.id] ?? []}
                active={active.has(party.id)}
              />
            ))}
          </Box>
        </Box>
      </Box>

      <Box display="flex" alignItems="center" justifyContent="center" gap={3}>
        <Button disabled={stepIndex === 0} onClick={() => go(stepIndex - 1)}>
          Previous
        </Button>
        <Text sx={{ color: 'fg.muted', fontSize: 1 }}>
          {stepIndex + 1} / {trace.steps.length}
        </Text>
        <Button
          variant={stepIndex === trace.steps.length - 1 ? 'default' : 'primary'}
          disabled={stepIndex === trace.steps.length - 1}
          onClick={() => go(stepIndex + 1)}
        >
          Next step
        </Button>
      </Box>
    </PapExamplePage>
  );
};

export default PapTraceView;
