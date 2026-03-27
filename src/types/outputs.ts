/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Output format specification.
 */
export interface OutputSpec {
  /** Unique output identifier */
  id: string;
  /** Version */
  version?: string;
  /** Display name */
  name: string;
  /** Description of the output format */
  description: string;
  /** Icon identifier */
  icon: string;
  /** Whether this format supports templates */
  supports_template: boolean;
  /** Whether this format supports storage paths */
  supports_storage: boolean;
  /** MIME types produced */
  mime_types: string[];
}

/**
 * Output configuration for an agent spec.
 */
export interface AgentOutputConfig {
  type?: string;
  formats?: string[];
  template?: string;
  storage?: string;
  [key: string]: unknown;
}

// ---- Output Artifacts ----

export interface OutputArtifact {
  /** Unique artifact ID */
  id: string;
  /** Agent that produced the artifact */
  agentId: string;
  /** Artifact type (e.g. 'pdf', 'csv') */
  type: string;
  /** Filename for download */
  filename: string;
  /** Download URL */
  url: string;
  /** Size in bytes */
  sizeBytes: number;
  /** MIME content type */
  contentType: string;
  /** When the artifact was generated */
  createdAt: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}
