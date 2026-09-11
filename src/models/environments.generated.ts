/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/* Generated from the Environment JSON Schema of code-sandboxes (schemas/environment-v1alpha1.json) by scripts/generate-environments-types.py. Do not edit. */

/** The `$id` of the JSON Schema these types are generated from. */
export const ENVIRONMENT_SCHEMA_ID =
  'https://datalayer.io/schemas/environments/v1alpha1/environment.json';

/** The sha256 of the schema text these types are generated from. */
export const ENVIRONMENT_SCHEMA_SHA256 =
  '76eb8c80d1e27f7c6519946a6f7022b53a717ff2645d993b34aaa54dea658201';

/** The `apiVersion` an Environment document carries. */
export const ENVIRONMENT_API_VERSION = 'environments.datalayer.io/v1alpha1';

/** The `kind` an Environment document carries. */
export const ENVIRONMENT_KIND = 'Environment';

export interface Accelerator {
  /** Minimum: 1. Default: `1`. */
  count?: number;
  cuda?: string | null;
  type: string;
}

export interface Base {
  channel: string;
  ref: string;
}

export interface BuildSecret {
  /** Pattern: `^dlsec_[0-9A-Za-z]+$`. */
  id: string;
  /** Default: `"env"`. */
  mountAs?: 'env' | 'file';
  /** Pattern: `^[A-Za-z0-9_.-]+$`. */
  name: string;
}

export interface BuildSpec {
  /** Default: `"packages"`. */
  source?: 'packages' | 'dependencyFile' | 'dockerfile' | 'image';
}

export interface Commands {
  postInstall?: string[];
}

export interface Compatibility {
  regions?: string[];
  variants?: VariantSet;
}

export interface EnvironmentSpec {
  base: Base;
  build?: BuildSpec;
  buildSecrets?: BuildSecret[];
  commands?: Commands;
  compatibility?: Compatibility;
  /** Default: `"sandbox-contract/v1"`. */
  contract?: string;
  env?: Record<string, string>;
  files?: FileEntry[];
  language: Language;
  packages?: Packages;
  platform?: Platform;
  resources?: Resources;
}

export interface FileEntry {
  contentRef: string;
  path: string;
  /** Pattern: `^[0-9a-f]{64}$`. */
  sha256?: string | null;
  /** Minimum: 0. */
  sizeBytes?: number | null;
}

export interface Language {
  name?: 'python';
  /** Pattern: `^3\.\d+$`. */
  version: string;
}

export interface Metadata {
  labels?: Record<string, string>;
  name: string;
  title?: string | null;
}

export interface Packages {
  python?: PythonPackages;
  system?: SystemPackages;
}

export interface Platform {
  architecture?: 'linux/amd64';
}

export interface PythonPackages {
  constraints?: string[];
  dependencies?: string[];
  indexes?: string[];
  /** Default: `"uv"`. */
  manager?: 'uv' | 'pip' | 'conda';
}

export interface ResourceHints {
  /** Greater than 0. */
  cpu?: number | null;
  /** Greater than 0. */
  diskGi?: number | null;
  /** Greater than 0. */
  memoryGi?: number | null;
}

export interface Resources {
  /** Default: `"none"`. */
  accelerator?: 'none' | Accelerator;
  hints?: ResourceHints;
  /** Default: `"small"`. */
  sizeClass?: string;
}

export interface SystemPackages {
  apt?: string[];
}

export interface VariantSet {
  optional?: string[];
  required?: string[];
}

/** A Datalayer Environment, environments.datalayer.io/v1alpha1. */
export interface Environment {
  apiVersion?: 'environments.datalayer.io/v1alpha1';
  kind?: 'Environment';
  metadata: Metadata;
  spec: EnvironmentSpec;
}
