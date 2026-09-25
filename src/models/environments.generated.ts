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
  '3aa1a84206afd2d5d04d3a2eab28abca1d60e1a6a6ab8c14a94ace62b39e6015';

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
  dependencyFile?: DependencyFileSpec | null;
  dockerfile?: DockerfileSpec | null;
  image?: ImageSourceSpec | null;
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

/** One immutable file the Environment bakes from an external source. */
export interface ContentsBuildEntry {
  path: string;
  /** Pattern: `^[0-9a-f]{64}$`. */
  sha256: string;
  /** Minimum: 0. */
  sizeBytes?: number | null;
  source: string;
}

/** A `requirements.txt`, a `pyproject.toml` with its `uv.lock`, or a conda `environment.yml` (E3-01, E3-02). */
export interface DependencyFileSpec {
  /** Default: `""`. */
  content?: string;
  /** Default: `""`. */
  lockContent?: string;
  /** Default: `"requirements"`. */
  sourceFormat?: 'requirements' | 'pyproject' | 'conda';
}

/** The Dockerfile a `dockerfile`-sourced version builds from (E3-03). */
export interface DockerfileSpec {
  /** Default: `""`. */
  content?: string;
}

export interface EnvironmentSpec {
  base: Base;
  build?: BuildSpec;
  buildSecrets?: BuildSecret[];
  commands?: Commands;
  compatibility?: Compatibility;
  contentsBuild?: ContentsBuildEntry[];
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

/** An existing OCI image, imported as the build's base (E3-04). */
export interface ImageSourceSpec {
  /** Pattern: `^dlsec_[0-9A-Za-z]+$`. */
  credentialSecretId?: string | null;
  /** Default: `""`. */
  reference?: string;
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
