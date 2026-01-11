/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Stub for keytar module in browser environments.
 * keytar is a native Node.js module for system keychain access
 * and cannot run in the browser.
 */

export const getPassword = async (
  _service: string,
  _account: string,
): Promise<string | null> => null;
export const setPassword = async (
  _service: string,
  _account: string,
  _password: string,
): Promise<void> => {};
export const deletePassword = async (
  _service: string,
  _account: string,
): Promise<boolean> => false;
export const findPassword = async (_service: string): Promise<string | null> =>
  null;
export const findCredentials = async (
  _service: string,
): Promise<Array<{ account: string; password: string }>> => [];

// Sync versions (if any code tries to use them)
export const getPasswordSync = (
  _service: string,
  _account: string,
): string | null => null;
export const setPasswordSync = (
  _service: string,
  _account: string,
  _password: string,
): void => {};
export const deletePasswordSync = (
  _service: string,
  _account: string,
): boolean => false;

export default {
  getPassword,
  setPassword,
  deletePassword,
  findPassword,
  findCredentials,
  getPasswordSync,
  setPasswordSync,
  deletePasswordSync,
};
