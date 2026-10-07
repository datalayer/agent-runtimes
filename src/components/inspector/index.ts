/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Agent Inspector: what agents do — model turns, tool calls (MCP,
 * frontend, skills, codemode, runtime), A2A requests and what came back —
 * recorded as OpenTelemetry spans in the page's tracer (core's
 * `createOtelLiveTracer`) and drawn by core's OTEL view (`OtelLiveSpans`).
 *
 * @module components/inspector
 */

export * from './agentSpans';
export * from './classify';
export * from './chatSpans';
export * from './a2aSpans';
export * from './AgentInspector';
export * from './AgentInspectorDialog';
