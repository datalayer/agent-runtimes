/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The kinds of code sandbox, as the Python `code_sandboxes` package names them.
 *
 * A sandbox is a place code runs, and the VARIANT names the kind of place:
 * the Datalayer platform, a Jupyter Server, Kaggle, Modal, and so on. The
 * values mirror `code_sandboxes.models.SandboxVariant` verbatim — one naming
 * for the CLI, the services and the applications, so an environment tagged
 * `kaggle` by the operator reads as `kaggle` here and nowhere becomes a
 * synonym.
 *
 * @module models/CodeSandboxVariant
 */

/** The kinds of code sandbox, by the value the platform tags them with. */
export enum CodeSandboxVariant {
  /** In-process evaluation: tests and examples, isolates nothing. */
  Eval = 'eval',
  /** A container on the Docker daemon of a machine. */
  Docker = 'docker',
  /** A kernel of a Jupyter Server. */
  JupyterServer = 'jupyter-server',
  /** A runtime of the Datalayer platform. */
  Datalayer = 'datalayer',
  /** A Google Colab runtime. */
  GoogleColab = 'google-colab',
  /** A Kaggle notebook session. */
  Kaggle = 'kaggle',
  /** The Monty in-browser interpreter. */
  Monty = 'monty',
  /** A container on Modal. */
  Modal = 'modal',
  /** A sandbox on Daytona, with an optional GPU. */
  Daytona = 'daytona',
  /** A container on Cloudflare's edge, behind a bridge Worker. */
  Cloudflare = 'cloudflare',
  /** A container on CoreWeave, with an optional GPU. */
  CoreWeave = 'coreweave',
  /** A Firecracker microVM on E2B. */
  E2B = 'e2b',
}

/** What each variant is called where a person reads it. */
export const CODE_SANDBOX_VARIANT_TITLES: Record<CodeSandboxVariant, string> = {
  [CodeSandboxVariant.Eval]: 'Eval',
  [CodeSandboxVariant.Docker]: 'Docker',
  [CodeSandboxVariant.JupyterServer]: 'Jupyter Server',
  [CodeSandboxVariant.Datalayer]: 'Datalayer',
  [CodeSandboxVariant.GoogleColab]: 'Google Colab',
  [CodeSandboxVariant.Kaggle]: 'Kaggle',
  [CodeSandboxVariant.Monty]: 'Monty',
  [CodeSandboxVariant.Modal]: 'Modal',
  [CodeSandboxVariant.Daytona]: 'Daytona',
  [CodeSandboxVariant.Cloudflare]: 'Cloudflare',
  [CodeSandboxVariant.CoreWeave]: 'CoreWeave',
  [CodeSandboxVariant.E2B]: 'E2B',
};

/**
 * The variant an environment belongs to, read off its `owner` tag.
 *
 * The operator tags an external environment with its provider through the
 * environment's `owner` — `kaggle`, `modal`, `e2b` — while the platform's own
 * carry `datalayer`. An owner nothing here recognises reads as Datalayer,
 * which is what every environment was before providers existed.
 */
export function codeSandboxVariantOf(
  owner?: string | null,
): CodeSandboxVariant {
  const normalized = (owner ?? '').replace('_', '-').toLowerCase();
  const match = (Object.values(CodeSandboxVariant) as string[]).find(
    value => value.replace('_', '-') === normalized,
  );
  return (match as CodeSandboxVariant) ?? CodeSandboxVariant.Datalayer;
}

/** A short label for the chip beside an environment's name. */
export function codeSandboxVariantTitle(variant: CodeSandboxVariant): string {
  return CODE_SANDBOX_VARIANT_TITLES[variant] ?? variant;
}

export default CodeSandboxVariant;
