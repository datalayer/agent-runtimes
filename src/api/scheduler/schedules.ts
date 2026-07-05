/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Scheduler schedules API functions for the Datalayer platform.
 *
 * Provides functions for listing, creating, and updating cron schedules that
 * trigger automated notebook executions.
 *
 * @module api/scheduler/schedules
 */

import { requestDatalayerAPI } from '@datalayer/core/lib/api/DatalayerApi';
import {
  API_BASE_PATHS,
  DEFAULT_SERVICE_URLS,
} from '@datalayer/core/lib/api/constants';

/**
 * Raw schedule document as returned by the scheduler service.
 *
 * Fields follow the Solr suffix convention (`_s`, `_b`, `_dt`, `_i`).
 */
export interface ScheduleDoc {
  uid?: string;
  type_s?: string;
  notebook_uid_s?: string;
  owner_uid_s?: string;
  cron_expression_s?: string;
  preset_s?: string;
  enabled_b?: boolean;
  [key: string]: unknown;
}

/**
 * Request payload to create or update a notebook schedule.
 */
export interface UpsertScheduleRequest {
  /** Target notebook uid. */
  notebookUid: string;
  /** Cron expression (e.g. `* * * * *`). */
  cronExpression: string;
  /** Optional preset identifier (e.g. `every-minute`, `hourly`, `daily`, `custom`). */
  preset?: string;
  /** Whether the schedule is enabled. Defaults to `true`. */
  enabled?: boolean;
}

/**
 * Request payload to update an existing schedule by uid.
 */
export interface UpdateScheduleRequest {
  cronExpression?: string;
  preset?: string;
  enabled?: boolean;
}

/**
 * Response shape for listing schedules.
 */
export interface ListSchedulesResponse {
  success: boolean;
  message: string;
  schedules: ScheduleDoc[];
}

/**
 * Response shape for a single schedule mutation.
 */
export interface ScheduleResponse {
  success: boolean;
  message: string;
  schedule: ScheduleDoc;
}

/**
 * List the schedules owned by the authenticated user.
 * @param token - Authentication token
 * @param baseUrl - Base URL for the scheduler service (defaults to production)
 * @param includeDisabled - Include disabled schedules in the result
 * @returns Promise resolving to the list of schedules
 */
export const listSchedules = async (
  token: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SCHEDULER,
  includeDisabled: boolean = false,
): Promise<ListSchedulesResponse> => {
  const query = includeDisabled ? '?includeDisabled=true' : '';
  return requestDatalayerAPI<ListSchedulesResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SCHEDULER}/schedules${query}`,
    method: 'GET',
    token,
  });
};

/**
 * Create or update the schedule for a notebook.
 * @param token - Authentication token
 * @param data - Schedule configuration
 * @param baseUrl - Base URL for the scheduler service (defaults to production)
 * @returns Promise resolving to the upserted schedule
 */
export const upsertSchedule = async (
  token: string,
  data: UpsertScheduleRequest,
  baseUrl: string = DEFAULT_SERVICE_URLS.SCHEDULER,
): Promise<ScheduleResponse> => {
  return requestDatalayerAPI<ScheduleResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SCHEDULER}/schedules`,
    method: 'POST',
    token,
    body: {
      enabled: true,
      preset: 'custom',
      ...data,
    },
  });
};

/**
 * Update an existing schedule by uid.
 * @param token - Authentication token
 * @param scheduleUid - The schedule uid
 * @param data - Fields to update
 * @param baseUrl - Base URL for the scheduler service (defaults to production)
 * @returns Promise resolving to the updated schedule
 */
export const updateSchedule = async (
  token: string,
  scheduleUid: string,
  data: UpdateScheduleRequest,
  baseUrl: string = DEFAULT_SERVICE_URLS.SCHEDULER,
): Promise<ScheduleResponse> => {
  return requestDatalayerAPI<ScheduleResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SCHEDULER}/schedules/${scheduleUid}`,
    method: 'PUT',
    token,
    body: data,
  });
};

/**
 * Disable a schedule by uid.
 * @param token - Authentication token
 * @param scheduleUid - The schedule uid
 * @param baseUrl - Base URL for the scheduler service (defaults to production)
 * @returns Promise resolving to the disabled schedule
 */
export const disableSchedule = async (
  token: string,
  scheduleUid: string,
  baseUrl: string = DEFAULT_SERVICE_URLS.SCHEDULER,
): Promise<ScheduleResponse> => {
  return requestDatalayerAPI<ScheduleResponse>({
    url: `${baseUrl}${API_BASE_PATHS.SCHEDULER}/schedules/${scheduleUid}/disable`,
    method: 'POST',
    token,
  });
};
