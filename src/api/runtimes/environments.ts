/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Computing environments API functions for the Datalayer platform.
 *
 * `GET /environments` lists the platform's environments and the user
 * environments the caller may use. The registry beside it (PLAN_ENV.md,
 * section 9, served by Runtimes since E1-01) creates environments, their
 * versions, builds and artifacts, and serves build logs. The specification a
 * version carries is typed from the JSON Schema `code-sandboxes` exports
 * (D-14), in `models/environments.generated.ts`.
 *
 * A conditional write names the record it replaces with `If-Match`, the
 * `etag` every record carries. A keyed create is replayed with the same
 * `Idempotency-Key`. Every call may carry the caller's `X-Correlation-Id`,
 * which a refusal answers in its section 10 body: `asEnvironmentsError` reads
 * that body from the error a call rejects with.
 *
 * @module api/runtimes/environments
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';
import {
  validateRequiredString,
  validateToken,
} from '@datalayer/core/lib/api/utils/validation';
import type {
  EnvironmentData,
  ListEnvironmentsResponse,
} from '../../models/EnvironmentDTO';
import type {
  ICreateEnvironmentBuildsRequest,
  ICreateEnvironmentRequest,
  ICreateEnvironmentVersionRequest,
  IDatalayerEnvironment,
  IEnvironmentArtifactsPage,
  IEnvironmentBuildLogChunk,
  IEnvironmentBuildLogPage,
  IEnvironmentBuildRecord,
  IEnvironmentBuildsCreated,
  IEnvironmentBuildsPage,
  IEnvironmentRecord,
  IEnvironmentsError,
  IEnvironmentsPageQuery,
  IEnvironmentTrial,
  IEnvironmentValidationReport,
  IEnvironmentVersionRecord,
  IEnvironmentVersionsPage,
  IListEnvironmentsQuery,
  IPromoteEnvironmentVersionRequest,
  ITrialEnvironmentVersionRequest,
  IUpdateEnvironmentRequest,
  IUpdateEnvironmentVersionRequest,
  IValidateEnvironmentVersionRequest,
} from '../../models/Environment';

/** What every environments call may carry. */
export interface IEnvironmentsRequestOptions {
  /** Sent as `X-Correlation-Id`; a refusal answers with it. */
  correlationId?: string;
  /** Cancels the request. */
  signal?: AbortSignal;
}

/** A create the service replays: the same key answers the first resource. */
export interface IEnvironmentsIdempotentOptions extends IEnvironmentsRequestOptions {
  /** Sent as `Idempotency-Key`. */
  idempotencyKey?: string;
}

/** A write that may name the record it replaces. */
export interface IEnvironmentsConditionalOptions extends IEnvironmentsRequestOptions {
  /** Sent as `If-Match`: the `etag` of the record read. */
  ifMatch?: string;
}

/**
 * A page of `GET /environments`: the platform's entries, on the first page
 * only, then the user environments the caller may use.
 */
export type ListEnvironmentsPage = Omit<
  ListEnvironmentsResponse,
  'environments'
> & {
  environments: Array<
    EnvironmentData &
      Pick<
        IDatalayerEnvironment,
        'uid' | 'origin' | 'owner' | 'promotedVersion' | 'variants'
      >
  >;
  /** The cursor of the next page; absent on the last one. */
  nextCursor?: string;
};

type Query = Record<string, string | number | boolean | undefined>;

const registryUrl = (baseUrl: string, path: string, query: Query = {}) => {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') {
      params.set(name, String(value));
    }
  }
  const search = params.toString();
  return `${baseUrl}${API_BASE_PATHS.RUNTIMES}${path}${search ? `?${search}` : ''}`;
};

const segment = (value: string, label: string): string => {
  validateRequiredString(value, label);
  return encodeURIComponent(value);
};

const send = <T>(
  token: string,
  method: string,
  url: string,
  options: IEnvironmentsRequestOptions & {
    idempotencyKey?: string;
    ifMatch?: string;
  },
  body?: unknown,
): Promise<T> => {
  const headers: Record<string, string> = {};
  if (options.ifMatch) {
    headers['If-Match'] = options.ifMatch;
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }
  if (options.correlationId) {
    headers['X-Correlation-Id'] = options.correlationId;
  }
  return requestDatalayerAPI<T>({
    url,
    method,
    token,
    headers,
    signal: options.signal,
    ...(body === undefined ? {} : { body }),
  });
};

/**
 * The section 10 body of a refusal, from the error a call rejected with.
 *
 * @param error - What an environments call rejected with
 * @returns The body, with its `code` and `correlationId`; `undefined` when the
 *   error is not a refusal that carries one
 */
export const asEnvironmentsError = async (
  error: unknown,
): Promise<IEnvironmentsError | undefined> => {
  const response = (error as { response?: { json?: () => Promise<unknown> } })
    ?.response;
  if (typeof response?.json !== 'function') {
    return undefined;
  }
  try {
    const body = await response.json();
    return body &&
      typeof body === 'object' &&
      typeof (body as { code?: unknown }).code === 'string'
      ? (body as IEnvironmentsError)
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * List the environments the caller may use: the platform's, then its own and
 * its organizations'.
 * @param token - Authentication token
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @param query - Filters, and the cursor of the page to read
 * @param options - Correlation id and abort signal
 * @returns Promise resolving to one page of environments
 * @throws {Error} If authentication token is missing or invalid
 */
export const listEnvironments = async (
  token: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
  query: IListEnvironmentsQuery = {},
  options: IEnvironmentsRequestOptions = {},
): Promise<ListEnvironmentsPage> => {
  validateToken(token);
  return send<ListEnvironmentsPage>(
    token,
    'GET',
    registryUrl(baseUrl, '/environments', { ...query }),
    options,
  );
};

/**
 * Create a user environment, for the caller's account or an organization it owns.
 * @param token - Authentication token
 * @param request - Its name, and optionally title, description, visibility and owner
 * @param options - Idempotency key, correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the environment created, or the one a replayed key created
 */
export const createEnvironment = async (
  token: string,
  request: ICreateEnvironmentRequest,
  options: IEnvironmentsIdempotentOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentRecord> => {
  validateToken(token);
  return send<IEnvironmentRecord>(
    token,
    'POST',
    registryUrl(baseUrl, '/environments'),
    options,
    request,
  );
};

/**
 * Get a user environment.
 * @param token - Authentication token
 * @param environmentUid - The environment's uid
 * @param options - Correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the environment
 */
export const getEnvironment = async (
  token: string,
  environmentUid: string,
  options: IEnvironmentsRequestOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentRecord> => {
  validateToken(token);
  return send<IEnvironmentRecord>(
    token,
    'GET',
    registryUrl(
      baseUrl,
      `/environments/${segment(environmentUid, 'Environment UID')}`,
    ),
    options,
  );
};

/**
 * Change an environment's title, description or visibility.
 * @param token - Authentication token
 * @param environmentUid - The environment's uid
 * @param changes - The fields to change
 * @param ifMatch - The `etag` of the environment read; a stale one is refused with 412
 * @param options - Correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the environment changed
 */
export const updateEnvironment = async (
  token: string,
  environmentUid: string,
  changes: IUpdateEnvironmentRequest,
  ifMatch: string,
  options: IEnvironmentsRequestOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentRecord> => {
  validateToken(token);
  validateRequiredString(ifMatch, 'If-Match');
  return send<IEnvironmentRecord>(
    token,
    'PATCH',
    registryUrl(
      baseUrl,
      `/environments/${segment(environmentUid, 'Environment UID')}`,
    ),
    { ...options, ifMatch },
    changes,
  );
};

/**
 * Delete an environment, softly. Refused with 409 `DL_ENV_CONFLICT` while a
 * version is promoted, an artifact is referenced, or a runtime still runs one
 * of its artifacts, whoever launched it: the refusal's `detail` is an
 * `IEnvironmentDeletionConflict`, whose `runtimes` name each one (E1-15).
 * Refused with 503 `DL_ENV_UNAVAILABLE` when the service cannot read which
 * runtimes run it; nothing is deleted then either.
 * @param token - Authentication token
 * @param environmentUid - The environment's uid
 * @param options - If-Match, correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving once the environment is deleted
 */
export const deleteEnvironment = async (
  token: string,
  environmentUid: string,
  options: IEnvironmentsConditionalOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<void> => {
  validateToken(token);
  await send<void>(
    token,
    'DELETE',
    registryUrl(
      baseUrl,
      `/environments/${segment(environmentUid, 'Environment UID')}`,
    ),
    options,
  );
};

/**
 * Archive an environment: kept and readable, no longer offered for launches.
 * @param token - Authentication token
 * @param environmentUid - The environment's uid
 * @param options - If-Match, correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the environment archived
 */
export const archiveEnvironment = async (
  token: string,
  environmentUid: string,
  options: IEnvironmentsConditionalOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentRecord> => {
  validateToken(token);
  return send<IEnvironmentRecord>(
    token,
    'POST',
    registryUrl(
      baseUrl,
      `/environments/${segment(environmentUid, 'Environment UID')}/archive`,
    ),
    options,
  );
};

/**
 * Promote a version, or none with `versionUid: null`; a rollback is the same
 * call with an older version, and builds nothing (E1-15).
 *
 * A partially ready version is promoted only when
 * `acknowledgeUnavailableVariants` names exactly its unavailable variants:
 * otherwise 409 `DL_ENV_CONFLICT`, whose `detail` is an
 * `IEnvironmentPromotionConflict` naming them. The promotion is recorded on
 * the version, as its `promotion`. Asking again for the version already
 * promoted writes nothing and answers the environment, even with a stale
 * `If-Match`; asking for another with a stale one is refused with 412.
 * @param token - Authentication token
 * @param environmentUid - The environment's uid
 * @param request - `{versionUid, acknowledgeUnavailableVariants}`
 * @param ifMatch - The `etag` of the environment read; a stale one is refused with 412
 * @param options - Correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the environment, naming its promoted version
 */
export const promoteEnvironmentVersion = async (
  token: string,
  environmentUid: string,
  request: IPromoteEnvironmentVersionRequest,
  ifMatch: string,
  options: IEnvironmentsRequestOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentRecord> => {
  validateToken(token);
  validateRequiredString(ifMatch, 'If-Match');
  return send<IEnvironmentRecord>(
    token,
    'PUT',
    registryUrl(
      baseUrl,
      `/environments/${segment(environmentUid, 'Environment UID')}/promoted-version`,
    ),
    { ...options, ifMatch },
    request,
  );
};

/**
 * Create a draft version of an environment from a specification.
 * @param token - Authentication token
 * @param environmentUid - The environment's uid
 * @param request - `{spec, label}`
 * @param options - Idempotency key, correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the draft, or the one a replayed key created
 */
export const createEnvironmentVersion = async (
  token: string,
  environmentUid: string,
  request: ICreateEnvironmentVersionRequest,
  options: IEnvironmentsIdempotentOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentVersionRecord> => {
  validateToken(token);
  return send<IEnvironmentVersionRecord>(
    token,
    'POST',
    registryUrl(
      baseUrl,
      `/environments/${segment(environmentUid, 'Environment UID')}/versions`,
    ),
    options,
    request,
  );
};

/**
 * List an environment's versions, newest first.
 * @param token - Authentication token
 * @param environmentUid - The environment's uid
 * @param page - The cursor of the page to read, and its size
 * @param options - Correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to one page of versions
 */
export const listEnvironmentVersions = async (
  token: string,
  environmentUid: string,
  page: IEnvironmentsPageQuery = {},
  options: IEnvironmentsRequestOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentVersionsPage> => {
  validateToken(token);
  return send<IEnvironmentVersionsPage>(
    token,
    'GET',
    registryUrl(
      baseUrl,
      `/environments/${segment(environmentUid, 'Environment UID')}/versions`,
      { ...page },
    ),
    options,
  );
};

/**
 * Get a version, with its specification and its status.
 * @param token - Authentication token
 * @param versionUid - The version's uid
 * @param options - Correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the version
 */
export const getEnvironmentVersion = async (
  token: string,
  versionUid: string,
  options: IEnvironmentsRequestOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentVersionRecord> => {
  validateToken(token);
  return send<IEnvironmentVersionRecord>(
    token,
    'GET',
    registryUrl(
      baseUrl,
      `/environment-versions/${segment(versionUid, 'Version UID')}`,
    ),
    options,
  );
};

/**
 * Edit a draft's specification or label.
 * @param token - Authentication token
 * @param versionUid - The version's uid
 * @param changes - `{spec, label}`, either or both
 * @param ifMatch - The `etag` of the version read; a stale one is refused with 412
 * @param options - Correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the draft changed
 */
export const updateEnvironmentVersion = async (
  token: string,
  versionUid: string,
  changes: IUpdateEnvironmentVersionRequest,
  ifMatch: string,
  options: IEnvironmentsRequestOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentVersionRecord> => {
  validateToken(token);
  validateRequiredString(ifMatch, 'If-Match');
  return send<IEnvironmentVersionRecord>(
    token,
    'PATCH',
    registryUrl(
      baseUrl,
      `/environment-versions/${segment(versionUid, 'Version UID')}`,
    ),
    { ...options, ifMatch },
    changes,
  );
};

/**
 * Validate a version: a dry run answering a capability report per variant.
 * @param token - Authentication token
 * @param versionUid - The version's uid
 * @param request - `{variants}`: the version's own variants when absent
 * @param options - Correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the report
 */
export const validateEnvironmentVersion = async (
  token: string,
  versionUid: string,
  request: IValidateEnvironmentVersionRequest = {},
  options: IEnvironmentsRequestOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentValidationReport> => {
  validateToken(token);
  return send<IEnvironmentValidationReport>(
    token,
    'POST',
    registryUrl(
      baseUrl,
      `/environment-versions/${segment(versionUid, 'Version UID')}/validate`,
    ),
    options,
    request,
  );
};

/**
 * Resolve a version into its lock. The service answers 501 until PLAN_ENV.md
 * E1-04 builds the resolver, whose answer this resolves to.
 * @param token - Authentication token
 * @param versionUid - The version's uid
 * @param options - Correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the service's answer
 */
export const resolveEnvironmentVersion = async (
  token: string,
  versionUid: string,
  options: IEnvironmentsRequestOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<unknown> => {
  validateToken(token);
  return send<unknown>(
    token,
    'POST',
    registryUrl(
      baseUrl,
      `/environment-versions/${segment(versionUid, 'Version UID')}/resolve`,
    ),
    options,
  );
};

/**
 * Queue a build per variant and region.
 * @param token - Authentication token
 * @param versionUid - The version's uid
 * @param request - `{variants, requiredVariants, regions, force}`
 * @param options - Idempotency key, correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the builds queued, or those a replayed key queued
 */
export const createEnvironmentBuilds = async (
  token: string,
  versionUid: string,
  request: ICreateEnvironmentBuildsRequest = {},
  options: IEnvironmentsIdempotentOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentBuildsCreated> => {
  validateToken(token);
  return send<IEnvironmentBuildsCreated>(
    token,
    'POST',
    registryUrl(
      baseUrl,
      `/environment-versions/${segment(versionUid, 'Version UID')}/builds`,
    ),
    options,
    request,
  );
};

/**
 * List a version's builds, newest first.
 * @param token - Authentication token
 * @param versionUid - The version's uid
 * @param page - The cursor of the page to read, and its size
 * @param options - Correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to one page of builds
 */
export const listEnvironmentBuilds = async (
  token: string,
  versionUid: string,
  page: IEnvironmentsPageQuery = {},
  options: IEnvironmentsRequestOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentBuildsPage> => {
  validateToken(token);
  return send<IEnvironmentBuildsPage>(
    token,
    'GET',
    registryUrl(
      baseUrl,
      `/environment-versions/${segment(versionUid, 'Version UID')}/builds`,
      { ...page },
    ),
    options,
  );
};

/**
 * List a version's artifacts, one per variant and region.
 * @param token - Authentication token
 * @param versionUid - The version's uid
 * @param page - The cursor of the page to read, and its size
 * @param options - Correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to one page of artifacts
 */
export const listEnvironmentArtifacts = async (
  token: string,
  versionUid: string,
  page: IEnvironmentsPageQuery = {},
  options: IEnvironmentsRequestOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentArtifactsPage> => {
  validateToken(token);
  return send<IEnvironmentArtifactsPage>(
    token,
    'GET',
    registryUrl(
      baseUrl,
      `/environment-versions/${segment(versionUid, 'Version UID')}/artifacts`,
      { ...page },
    ),
    options,
  );
};

/**
 * Launch a trial sandbox of a ready or partially ready version, before it is
 * promoted (E1-14).
 *
 * Only an owner tries a version. The runtime is launched as `POST /runtimes`
 * launches one, with the version pinned, a given name saying which version it
 * tries, and a credits limit no higher than the service's cap. A draft, a
 * failed or a deprecated version is refused with 409 `DL_ENV_CONFLICT`, and a
 * version with no artifact on the plane with 422 `DL_ENV_ARTIFACT_MISSING`.
 * @param token - Authentication token
 * @param versionUid - The version's uid
 * @param request - `{creditsLimit}`, lowered to the service's cap when higher
 * @param options - Correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the runtime launched, its environment naming the version and artifact
 */
export const trialEnvironmentVersion = async (
  token: string,
  versionUid: string,
  request: ITrialEnvironmentVersionRequest = {},
  options: IEnvironmentsRequestOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentTrial> => {
  validateToken(token);
  return send<IEnvironmentTrial>(
    token,
    'POST',
    registryUrl(
      baseUrl,
      `/environment-versions/${segment(versionUid, 'Version UID')}/trial`,
    ),
    options,
    request,
  );
};

/**
 * Deprecate a version: no new launches, and running sandboxes keep it.
 * @param token - Authentication token
 * @param versionUid - The version's uid
 * @param options - If-Match, correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the version deprecated
 */
export const deprecateEnvironmentVersion = async (
  token: string,
  versionUid: string,
  options: IEnvironmentsConditionalOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentVersionRecord> => {
  validateToken(token);
  return send<IEnvironmentVersionRecord>(
    token,
    'POST',
    registryUrl(
      baseUrl,
      `/environment-versions/${segment(versionUid, 'Version UID')}/deprecate`,
    ),
    options,
  );
};

/**
 * Get a build.
 * @param token - Authentication token
 * @param buildUid - The build's uid
 * @param options - Correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the build
 */
export const getEnvironmentBuild = async (
  token: string,
  buildUid: string,
  options: IEnvironmentsRequestOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentBuildRecord> => {
  validateToken(token);
  return send<IEnvironmentBuildRecord>(
    token,
    'GET',
    registryUrl(
      baseUrl,
      `/environment-builds/${segment(buildUid, 'Build UID')}`,
    ),
    options,
  );
};

/**
 * Read a build's stored log chunks after a cursor: the polling side of D-15.
 * @param token - Authentication token
 * @param buildUid - The build's uid
 * @param page - `cursor`, the sequence of the last chunk read, and the page size
 * @param options - Correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the chunks, the next cursor, and whether the log is complete
 */
export const getEnvironmentBuildLogs = async (
  token: string,
  buildUid: string,
  page: IEnvironmentsPageQuery = {},
  options: IEnvironmentsRequestOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentBuildLogPage> => {
  validateToken(token);
  return send<IEnvironmentBuildLogPage>(
    token,
    'GET',
    registryUrl(
      baseUrl,
      `/environment-builds/${segment(buildUid, 'Build UID')}/logs`,
      { ...page },
    ),
    options,
  );
};

/**
 * Cancel a build that has not ended.
 * @param token - Authentication token
 * @param buildUid - The build's uid
 * @param options - If-Match, correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the build cancelled
 */
export const cancelEnvironmentBuild = async (
  token: string,
  buildUid: string,
  options: IEnvironmentsConditionalOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentBuildRecord> => {
  validateToken(token);
  return send<IEnvironmentBuildRecord>(
    token,
    'POST',
    registryUrl(
      baseUrl,
      `/environment-builds/${segment(buildUid, 'Build UID')}/cancel`,
    ),
    options,
  );
};

/**
 * Queue the next attempt of a cancelled build, or of one that failed under a
 * retryable code, once however often it is asked for.
 *
 * A retryable failure — a timeout, a quota, a missing artifact, an unmapped
 * provider failure — reopens its version, `failed` back to `building`. Any
 * other failure is refused with `DL_ENV_CONFLICT` naming the code: a new
 * version is what changes it, not another attempt.
 * @param token - Authentication token
 * @param buildUid - The build's uid
 * @param options - Correlation id and abort signal
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns Promise resolving to the attempt queued
 */
export const retryEnvironmentBuild = async (
  token: string,
  buildUid: string,
  options: IEnvironmentsRequestOptions = {},
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): Promise<IEnvironmentBuildRecord> => {
  validateToken(token);
  return send<IEnvironmentBuildRecord>(
    token,
    'POST',
    registryUrl(
      baseUrl,
      `/environment-builds/${segment(buildUid, 'Build UID')}/retry`,
    ),
    options,
  );
};

// -- Following a build's log (D-15) --------------------------------------------

/** The event the log stream ends with, once the build is terminal and every chunk is sent. */
export const BUILD_LOG_END_EVENT = 'end';

/** The service refused to stream the log; asking again would be refused again. */
export class BuildLogSubscriptionRefused extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Following the build log was refused with ${status}: ${detail}`);
    this.name = 'BuildLogSubscriptionRefused';
  }
}

/** What `fetch` answers, as much of it as a subscription reads. */
export interface IBuildLogStreamResponse {
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}

export interface ISubscribeToBuildLogsOptions {
  /** The id of the last event already received, to resume after it. */
  lastEventId?: string;
  /** Each chunk once, in sequence, with the id the subscription resumes from. */
  onChunk: (chunk: IEnvironmentBuildLogChunk, lastEventId: string) => void;
  /** The stream ended because the build is terminal and every chunk was sent. */
  onEnd?: () => void;
  /** How many drops in a row, with no chunk between them, before giving up. */
  maxReconnects?: number;
  /** How long to wait before reconnecting, in milliseconds. */
  reconnectDelayMs?: number;
  signal?: AbortSignal;
  /** The `fetch` to use; the global one by default. */
  fetch?: (url: string, init: RequestInit) => Promise<IBuildLogStreamResponse>;
}

export interface IBuildLogSubscription {
  /** Settles when the stream ends, is aborted, or cannot be resumed. */
  done: Promise<void>;
  /** The id a later subscription resumes from. */
  lastEventId: () => string | undefined;
}

interface IServerSentEvent {
  id?: string;
  event: string;
  data: string;
}

/** The complete events of what has arrived, and the start of one still arriving. */
const readServerSentEvents = (
  buffer: string,
): { events: IServerSentEvent[]; rest: string } => {
  const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = blocks.pop() ?? '';
  const events = blocks
    .filter(block => block.trim() !== '')
    .map(block => {
      const framed: IServerSentEvent = { event: 'message', data: '' };
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) {
          continue;
        }
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const value =
          colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'id') {
          framed.id = value;
        } else if (field === 'event') {
          framed.event = value;
        } else if (field === 'data') {
          data.push(value);
        }
      }
      framed.data = data.join('\n');
      return framed;
    });
  return { events, rest };
};

const pause = (milliseconds: number, signal?: AbortSignal): Promise<void> =>
  new Promise(resolve => {
    if (milliseconds <= 0 || signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

/**
 * Follow a build's log until the build is terminal (D-15).
 *
 * Modelled on core's `subscribeToExecution`: the stream is Server-Sent Events
 * read with `fetch`, which unlike `EventSource` carries the bearer token. Each
 * event's id is the sequence of its chunk. A connection that drops, before the
 * service answered or in the middle of the stream, is resumed with the last id
 * received as `Last-Event-ID`, so no chunk is repeated; after `maxReconnects`
 * drops in a row with no chunk between them, `done` rejects. The stream ends
 * with `end` once the build is terminal and every chunk is sent (E1-16). A
 * refusal is not retried: `done` rejects with `BuildLogSubscriptionRefused`,
 * such as the 404 a caller who may not read the build is answered before the
 * stream opens. An abort ends the subscription quietly.
 *
 * @param token - Authentication token
 * @param buildUid - The build's uid
 * @param subscribe - The callbacks, the resume point and the reconnect bounds
 * @param baseUrl - Base URL for the API (defaults to production Runtimes URL)
 * @returns The subscription
 */
export const subscribeToBuildLogs = (
  token: string,
  buildUid: string,
  subscribe: ISubscribeToBuildLogsOptions,
  baseUrl: string = DEFAULT_SERVICE_URLS.RUNTIMES,
): IBuildLogSubscription => {
  validateToken(token);
  const url = registryUrl(
    baseUrl,
    `/environment-builds/${segment(buildUid, 'Build UID')}/logs`,
    { follow: true },
  );
  let lastEventId = subscribe.lastEventId;
  const fetcher =
    subscribe.fetch ??
    ((address: string, init: RequestInit) =>
      fetch(address, init) as Promise<IBuildLogStreamResponse>);
  const maxReconnects = subscribe.maxReconnects ?? 5;

  const run = async (): Promise<void> => {
    let dropsInARow = 0;
    for (;;) {
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      };
      if (lastEventId) {
        headers['Last-Event-ID'] = lastEventId;
      }
      let response: IBuildLogStreamResponse | undefined;
      try {
        response = await fetcher(url, {
          headers,
          signal: subscribe.signal,
          credentials: 'include',
        });
      } catch {
        if (subscribe.signal?.aborted) {
          return;
        }
      }
      if (response && !response.ok) {
        throw new BuildLogSubscriptionRefused(
          response.status,
          await response.text(),
        );
      }
      let ended = false;
      if (response?.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!ended) {
          let read: ReadableStreamReadResult<Uint8Array>;
          try {
            read = await reader.read();
          } catch {
            if (subscribe.signal?.aborted) {
              return;
            }
            break;
          }
          if (read.done) {
            break;
          }
          buffer += decoder.decode(read.value, { stream: true });
          const { events, rest } = readServerSentEvents(buffer);
          buffer = rest;
          for (const framed of events) {
            if (framed.event === BUILD_LOG_END_EVENT) {
              ended = true;
              break;
            }
            if (framed.data === '') {
              continue;
            }
            const chunk = JSON.parse(framed.data) as IEnvironmentBuildLogChunk;
            if (typeof chunk?.sequence !== 'number') {
              continue;
            }
            lastEventId = framed.id ? framed.id : String(chunk.sequence);
            subscribe.onChunk(chunk, lastEventId);
            dropsInARow = 0;
          }
        }
        if (ended) {
          await reader.cancel().catch(() => undefined);
        }
      }
      if (ended) {
        subscribe.onEnd?.();
        return;
      }
      if (subscribe.signal?.aborted) {
        return;
      }
      dropsInARow += 1;
      if (dropsInARow > maxReconnects) {
        throw new Error(
          `The log of build '${buildUid}' dropped ${dropsInARow} times with no chunk in between.`,
        );
      }
      await pause(subscribe.reconnectDelayMs ?? 1000, subscribe.signal);
    }
  };

  return { done: run(), lastEventId: () => lastEventId };
};
