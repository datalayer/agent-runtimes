/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Execution types for code/skills execution results.
 * Maps to the Python code-sandboxes ExecutionResult model.
 *
 * @module components/chat/types/execution
 */

/**
 * Code error information when Python code raises an exception.
 */
export interface CodeError {
  /** Exception class name (e.g., 'ValueError', 'TypeError') */
  name: string;
  /** Exception message/value */
  value: string;
  /** Python traceback string */
  traceback?: string;
}

/**
 * Result from code or skill execution.
 * This maps to the Python ExecutionResult model from code-sandboxes.
 *
 * Distinguishes between three levels of outcome:
 * 1. Execution-level failure (execution_ok=false): Infrastructure/sandbox failed
 * 2. Code-level error (code_error present): User code raised Python exception
 * 3. Exit code (exit_code present): User code called sys.exit() with a code
 */
export interface ExecutionResult {
  /** Whether overall execution succeeded (no infrastructure or code errors) */
  success: boolean;

  /** Whether the sandbox infrastructure executed the code successfully */
  execution_ok: boolean;

  /** Infrastructure error details when execution_ok is false */
  execution_error?: string | null;

  /** Python exception details when code raised an error */
  code_error?: CodeError | null;

  /** Exit code when code called sys.exit() - not a failure, but an intentional exit */
  exit_code?: number | null;

  /** Execution results (display outputs, return values) */
  result?: unknown[];

  /** Standard output text */
  output?: string;

  /** Backwards-compatible error message (derived from execution_error or code_error) */
  error?: string | null;

  /** Execution timing in seconds */
  duration?: number;

  /** Whether execution was interrupted/cancelled */
  interrupted?: boolean;
}

/**
 * Check if an execution result indicates infrastructure failure.
 */
export function isExecutionFailure(result: ExecutionResult): boolean {
  return !result.execution_ok;
}

/**
 * Check if an execution result indicates a code/script error.
 */
export function isCodeError(result: ExecutionResult): boolean {
  return result.execution_ok && result.code_error != null;
}

/**
 * Check if an execution result has a non-zero exit code (intentional exit).
 */
export function hasNonZeroExitCode(result: ExecutionResult): boolean {
  return result.exit_code != null && result.exit_code !== 0;
}

/**
 * Check if an execution result is truly successful (no errors AND exit_code is 0 or null).
 */
export function isFullySuccessful(result: ExecutionResult): boolean {
  return (
    result.execution_ok &&
    result.code_error == null &&
    !result.interrupted &&
    (result.exit_code == null || result.exit_code === 0)
  );
}

/**
 * Get a human-readable error message from an execution result.
 * Returns null if no error or intentional exit.
 */
export function getExecutionErrorMessage(
  result: ExecutionResult,
): string | null {
  if (!result.execution_ok) {
    return `Execution failed: ${result.execution_error || 'Unknown error'}`;
  }
  if (result.code_error) {
    return `${result.code_error.name}: ${result.code_error.value}`;
  }
  return null;
}

/**
 * Get exit code message if present and non-zero.
 * Returns null if no exit code or exit code is 0.
 */
export function getExitCodeMessage(result: ExecutionResult): string | null {
  if (result.exit_code != null && result.exit_code !== 0) {
    return `Process exited with code ${result.exit_code}`;
  }
  return null;
}

/**
 * Format a code error for display, optionally including traceback.
 */
export function formatCodeError(
  error: CodeError,
  includeTraceback: boolean = false,
): string {
  let message = `${error.name}: ${error.value}`;
  if (includeTraceback && error.traceback) {
    message += `\n\n${error.traceback}`;
  }
  return message;
}
