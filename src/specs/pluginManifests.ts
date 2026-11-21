/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The protocol and harness engine plugins as the Python Reactor lists them
 * (the user, 21 November 2026): what `list_plugins()` says of each plugin of
 * the `agent-protocols` and `agent-runtimes` Extensions whose manifest
 * carries a protocol or a harness spec, exported at build time
 * (`make specs-manifests`, `pluginManifests.generated.*`) — no server, no
 * runtime. What the Agentspecs pages show of a protocol or a harness engine
 * is read here, never from the spec catalogues.
 *
 * Each manifest is given in TypeScript's words (`displayName`,
 * `contributionPoints`…), its spec under `protocol` or `harness` in the shape
 * of the generated specs (`ProtocolSpec`, `HarnessSpec`), converted from the
 * Python's snake_case; agent-runtimes' plugin-manifests test holds each to
 * its generated spec, and every spec to a manifest.
 *
 * @module specs/pluginManifests
 */

import type { HarnessSpec, ProtocolSpec } from '../types/agentspecs';
import { PLUGIN_MANIFESTS } from './pluginManifests.generated';

/** A manifest as the Python `list_plugins()` gives it: its fields, snake_case. */
export interface PythonPluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  display_name: string;
  octicon: string;
  emoji: string;
  tags: string[];
  package: string;
  config_schema: Record<string, unknown>;
  metadata: Record<string, unknown>;
  dependencies: string[];
  extension: string;
  activation_events: string[];
  deactivation_events: string[];
  contribution_points: string[];
  frontend_dependencies: string[];
  optional_frontend_dependencies: string[];
  tenant_scopes: string[];
  compatibility: Record<string, unknown>;
}

/** What the export holds. */
export interface PluginManifestsExport {
  description: string;
  protocols: PythonPluginManifest[];
  harnesses: PythonPluginManifest[];
}

/** A backend plugin's manifest, in TypeScript's words. */
export interface BackendPluginManifest {
  name: string;
  version: string;
  displayName: string;
  description: string;
  octicon: string;
  emoji: string;
  /** The distribution that ships it (`agent-runtimes`). */
  package: string;
  tags: string[];
  configSchema: Record<string, unknown>;
  /** The extension that delivers it. */
  extension: string;
  /** The plugins it cannot be used without. */
  dependencies: string[];
  /** The contribution points it declares. */
  contributionPoints: string[];
  /** As declared, its spec included. */
  metadata: Record<string, unknown>;
}

/** A contribution point of a protocol plugin, as its `reactor-points.json` says it. */
export interface ProtocolPoint {
  id: string;
  /** An extension the protocol defines: its contributions implement it. */
  extension: boolean;
  /** `single`: the lowest order answers; `all`: every contribution is used. */
  resolution: 'single' | 'all';
  /** The extension's URI, when it has one. */
  uri?: string;
}

/** A protocol plugin's manifest, with its spec and its points. */
export type ProtocolManifest = BackendPluginManifest & {
  protocol: ProtocolSpec;
  points: ProtocolPoint[];
};

/** A harness engine plugin's manifest, with its spec. */
export type HarnessEngineManifest = BackendPluginManifest & {
  harness: HarnessSpec;
};

/** Keys the generated specs keep as written. */
const KEPT_KEYS = new Set(['unavailable_because']);
/** Maps whose keys are names (environment variables), kept as written. */
const NAME_MAPS = new Set(['env']);

const camel = (key: string): string =>
  key.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());

/**
 * A spec as the Python dumps it, in the generated specs' shape: keys in
 * camelCase (but a name map's and `unavailable_because`), nulls left out.
 */
export function specOfPython<T>(value: unknown, keepKeys = false): T {
  if (Array.isArray(value)) {
    return value.map(item => specOfPython(item)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (child === null || child === undefined) continue;
      const name = keepKeys || KEPT_KEYS.has(key) ? key : camel(key);
      out[name] = specOfPython(child, NAME_MAPS.has(key));
    }
    return out as T;
  }
  return value as T;
}

function backendManifestOf(raw: PythonPluginManifest): BackendPluginManifest {
  return {
    name: raw.name,
    version: raw.version,
    displayName: raw.display_name,
    description: raw.description,
    octicon: raw.octicon,
    emoji: raw.emoji,
    package: raw.package,
    tags: raw.tags,
    configSchema: raw.config_schema,
    extension: raw.extension,
    dependencies: raw.dependencies,
    contributionPoints: raw.contribution_points,
    metadata: raw.metadata,
  };
}

/** A protocol plugin's manifest, from what the Python lists. */
export function protocolManifestOfPython(
  raw: PythonPluginManifest,
): ProtocolManifest {
  const protocol = raw.metadata.protocol;
  if (!protocol) {
    throw new Error(`${raw.name}: its manifest carries no protocol spec`);
  }
  return {
    ...backendManifestOf(raw),
    protocol: specOfPython<ProtocolSpec>(protocol),
    points: (raw.metadata.points ?? []) as ProtocolPoint[],
  };
}

/** A harness engine plugin's manifest, from what the Python lists. */
export function harnessEngineManifestOfPython(
  raw: PythonPluginManifest,
): HarnessEngineManifest {
  const harness = raw.metadata.harness;
  if (!harness) {
    throw new Error(`${raw.name}: its manifest carries no harness spec`);
  }
  return {
    ...backendManifestOf(raw),
    harness: specOfPython<HarnessSpec>(harness),
  };
}

let protocols: ProtocolManifest[] | undefined;
let harnesses: HarnessEngineManifest[] | undefined;

/** Every protocol plugin's manifest, by protocol id. */
export function protocolManifests(): ProtocolManifest[] {
  protocols ??= PLUGIN_MANIFESTS.protocols.map(protocolManifestOfPython);
  return protocols;
}

/** The manifest of the plugin of the protocol `id`, or undefined. */
export function protocolManifestOf(id: string): ProtocolManifest | undefined {
  return protocolManifests().find(manifest => manifest.protocol.id === id);
}

/** Every harness engine plugin's manifest, by harness id. */
export function harnessEngineManifests(): HarnessEngineManifest[] {
  harnesses ??= PLUGIN_MANIFESTS.harnesses.map(harnessEngineManifestOfPython);
  return harnesses;
}

/** The manifest of the plugin of the harness `id`, or undefined. */
export function harnessEngineManifestOf(
  id: string,
): HarnessEngineManifest | undefined {
  return harnessEngineManifests().find(manifest => manifest.harness.id === id);
}
