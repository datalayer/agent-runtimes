/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

const NON_REMOTE_LOCATION = ['browser', 'local'];

/**
 * Check whether the location is remote or not.
 *
 * @param location The location to test
 * @returns The result
 */
export function isRuntimeRemote(location: string): boolean {
  return !NON_REMOTE_LOCATION.includes(location);
}
