/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * What a chat host service (Slack, Discord) shares, on Node: the ai-agents
 * host contracts and client, the agent client over the session API, the
 * semantic events a turn is reduced to, approval renderers, deliveries, the
 * turn's state, application resolution, the durable queue, quotas, secrets
 * at rest, observability, dead letters, health, the shared schema and the
 * forbidden-graph gate (plans/DISCORD.md §4.2, DC-004, DC-005).
 *
 * Imported as `@datalayer/agent-runtimes/lib/portable/hosts`, and only by a
 * Node service, which bundles it with esbuild. It reaches `src/portable/` and
 * this folder only, and the packages `zod`, `node:crypto` and `node:http`;
 * never React, DOM, Jupyter, Lumino, Primer, Reactor, `pg` or another folder
 * of Agent Runtimes (`src/__tests__/portable.unit.test.ts` holds it to that).
 * It imports its siblings by name, never `'../index'`, whose types reach
 * Reactor; so a service never imports `@datalayer/agent-runtimes/lib/portable`
 * itself: what it needs of it is re-exported here.
 *
 * @module portable/hosts
 */

// The run stream and its reduction, from the portable entry's own modules.
export { AgUiFrames, readRunStream, type AgUiEvent } from '../agui';
export * from '../semantic';
export {
  askQuestionOf,
  semanticOf,
  turnOf,
  type TurnInfo,
} from '../semanticOfAgUi';

export * from './contracts';
export {
  DatalayerHostClient,
  HostRefusedError,
  type BoundHost,
  type HostSelf,
} from './client';
export {
  agUiEventsOf,
  assertTrustedStreamUrl,
  DevelopmentCredentials,
  HostKeyCredentials,
  hostSessionOf,
  HostStarters,
  HttpAgentClient,
  InstallationCredentials,
  lastAnswer,
  type AgentClient,
  type HostCredentials,
  type HostKeyLookup,
  type HostSession,
  type HostShape,
  type HostTurnRequest,
  type Place,
  type SessionBinder,
  type Starter,
  type StarterSource,
  type TurnProvenance,
  type TurnStream,
} from './agentClient';
export { hostSessionUid } from './sessionUid';
export {
  DATALAYER_ONLY,
  MAIL_WORDS,
  RENDERERS,
  renderApproval,
  type RenderedAction,
  type RenderedField,
} from './approvalRenderers';
export {
  DELIVERY_PATH,
  DELIVERY_ROUTE,
  DeliveryPoller,
  deliveryRoute,
  receiveDelivery,
  type BoundHostKey,
  type DeliveryClaimStore,
  type DeliveryJob,
  type DeliverySink,
} from './deliveries';
export {
  TurnState,
  type TurnEnding,
  type TurnFile,
  type TurnTool,
} from './turnState';
export {
  resolveApplication,
  usableAllowances,
  type AllowanceView,
  type ApplicationRefusal,
  type ApplicationResolution,
  type ChannelRule,
} from './resolution';
export {
  MemoryWorkQueue,
  tablePrefixOf,
  type ConnectionPool,
  type Queryable,
  type QueryAnswer,
  type WorkQueue,
} from './queue';
export { PostgresWorkQueue } from './postgresQueue';
export {
  DEFAULT_QUOTAS,
  MemoryQuotaStore,
  PostgresQuotaStore,
  quotaEntries,
  quotaWords,
  resetOf,
  userQuotaKey,
  windowOf,
  type QuotaEntry,
  type QuotaLimits,
  type QuotaScope,
  type QuotaStore,
  type QuotaTake,
  type QuotaTaken,
} from './quotas';
export { SecretCipher, type EncryptedSecret } from './secretCipher';
export {
  Logger,
  LogTracer,
  noTracer,
  pseudonym,
  redact,
  redactCredentials,
  REDACTED,
  TOKEN_PATTERNS,
  type LogSink,
  type Tracer,
} from './observability';
export {
  DEAD_LETTERS_USAGE,
  DeadLetters,
  deadLetters,
  payloadHash,
  runDeadLettersCli,
  type CliOutput,
  type DeadLetter,
} from './deadLetters';
export {
  answerHealth,
  HEALTH_PATHS,
  healthServer,
  readiness,
  REQUEST_WINDOW_SECONDS,
  timestampWithinWindow,
  type ReadinessChecks,
} from './health';
export { systemClock, type Clock } from './rateLimit';
export { applyHostSchema, hostSchemaSql, hostTables } from './schema';
export {
  FORBIDDEN,
  forbiddenInBundle,
  forbiddenInGraph,
  forbiddenInInstalled,
  importsOf,
  installedGraph,
  isForbidden,
  packageOf,
  productionGraph,
  type BundleMetafile,
  type InstalledTree,
  type Lockfile,
  type Reached,
} from './forbiddenGraph';
