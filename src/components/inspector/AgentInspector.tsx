/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Agent Inspector: what agents do, as the OpenTelemetry spans the page
 * records (`agentSpans`, `chatSpans`, `a2aSpans`), drawn by core's OTEL view
 * (`OtelLiveSpans`): each turn a trace, its tool calls and its A2A requests
 * under it, newest last; a span opens to its attributes (a call's arguments
 * and result, a request whole), its events (what the peer answered, event by
 * event) and its trace tree.
 *
 * One agent's own (`agent`): what it did, and what was sent to it — one A2A
 * request shows in the asker's and in the peer's. Filters by source (A2A,
 * MCP, frontend tool, skill, codemode, runtime tool, model), operation and
 * agent; *Pause*, *Clear*, *Export* as the OTEL view has them.
 *
 * @module components/inspector/AgentInspector
 */

import type { JSX } from 'react';
import type { OtelLiveTracer } from '@datalayer/core/lib/otel/live';
import type { OtelSpan } from '@datalayer/core/lib/otel/types';
import {
  OtelLiveSpans,
  type OtelSpanFacet,
} from '@datalayer/core/lib/otel/views/OtelLiveSpans';
import { SpecMark } from '../../chat/marks';
import {
  AGENT_SPAN_ATTRIBUTES,
  SPAN_SOURCE_LABELS,
  describeAgentSpan,
  sourceOfSpan,
} from './agentSpans';

export type AgentInspectorProps = {
  /** The record to show, kept current. */
  tracer?: OtelLiveTracer | null;
  /** Or its spans, as given. */
  spans?: readonly OtelSpan[];
  /** One agent's own record: what it did, and what was sent to it. */
  agent?: string;
  /** How tall the list grows before it scrolls. */
  maxHeight?: number | string;
  /** Narrower, the detail under the list: beside other content. */
  compact?: boolean;
  /** What is said while nothing is recorded. */
  emptyText?: string;
  /** The file the spans are exported as, without `.json`. */
  exportName?: string;
};

/** The Inspector's filters: where a span comes from, what it does, which agent. */
export const AGENT_INSPECTOR_FACETS: readonly OtelSpanFacet[] = [
  {
    label: 'Source',
    value: sourceOfSpan,
    name: value => SPAN_SOURCE_LABELS[value] ?? value,
  },
  {
    label: 'Operation',
    value: span => {
      const attributes = span.attributes ?? {};
      const operation =
        attributes[AGENT_SPAN_ATTRIBUTES.operation] ?? attributes['rpc.method'];
      return operation === undefined ? undefined : String(operation);
    },
  },
  { label: 'Agent', value: span => span.service_name },
];

/** A span's mark: its tool's, as the catalogue gives it. */
function spanMark(span: OtelSpan): JSX.Element | null {
  const icon = span.attributes?.[AGENT_SPAN_ATTRIBUTES.markIcon];
  const emoji = span.attributes?.[AGENT_SPAN_ATTRIBUTES.markEmoji];
  return icon || emoji ? (
    <SpecMark
      icon={typeof icon === 'string' ? icon : undefined}
      emoji={typeof emoji === 'string' ? emoji : undefined}
      size={14}
    />
  ) : null;
}

/** The Agent Inspector. */
export function AgentInspector({
  tracer,
  spans,
  agent,
  maxHeight = 420,
  compact = false,
  emptyText = 'Nothing recorded yet.',
  exportName = 'agent-inspector',
}: AgentInspectorProps): JSX.Element {
  return (
    <div data-agent-inspector={agent ?? ''}>
      <OtelLiveSpans
        tracer={tracer}
        spans={spans}
        service={agent}
        facets={AGENT_INSPECTOR_FACETS}
        compact={compact}
        maxHeight={maxHeight}
        detailPlacement="side"
        emptyText={emptyText}
        exportName={exportName}
        label={agent ? `${agent}'s Agent Inspector` : 'Agent Inspector'}
        renderSpanMark={spanMark}
        describeSpan={describeAgentSpan}
      />
    </div>
  );
}

export default AgentInspector;
