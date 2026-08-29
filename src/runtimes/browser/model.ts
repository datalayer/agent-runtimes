/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/*
 * Copyright (c) 2023-2026 Datalayer, Inc.
 *
 * MIT License
 */

/**
 * The model a browser agent talks to.
 *
 * A page cannot hold a Bedrock credential, so an in-browser agent does not
 * reach a provider directly — it reaches the Datalayer inference service,
 * which is OpenAI-compatible and holds the credentials on the other side. The
 * SDK's OpenAI provider pointed at that base URL is the whole of it.
 *
 * The model *name* needs no translation either. A spec writes
 * `bedrock:us.anthropic.claude-sonnet-4-6`, and the inference service already
 * normalises that prefix for LiteLLM — the same string the server-side harness
 * sends. Both harnesses name a model identically, which is what keeps one spec
 * runnable in either.
 *
 * @module runtimes/browser/model
 */

import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

/** Where the inference service's OpenAI-compatible API lives under its host. */
export const INFERENCE_API_PATH = '/api/ai-inference/v1';

/**
 * The model a spec asks for when it says nothing.
 *
 * Matches the specs written for this harness rather than being a general
 * default, so a caller that forgets to pass one still gets a working agent
 * instead of a 404 from a model nobody provisioned.
 */
export const DEFAULT_BROWSER_MODEL = 'bedrock:us.anthropic.claude-sonnet-4-6';

export type BrowserModelOptions = {
  /**
   * Base URL of the inference service — `configuration.aiInferenceUrl`.
   *
   * The `/api/ai-inference/v1` suffix is added when it is not already there,
   * so a caller can pass either the host or the full API root.
   */
  inferenceUrl: string;
  /** The model id, as a spec spells it. */
  model?: string;
  /** Datalayer token. Sent as a bearer token, which is what the service reads. */
  token?: string;
  /** Extra headers, for a host that authenticates some other way. */
  headers?: Record<string, string>;
  /** Custom fetch, for tests and for hosts that wrap the network. */
  fetch?: typeof globalThis.fetch;
};

/** The API root for an inference host, given either form of the URL. */
export function inferenceApiUrl(inferenceUrl: string): string {
  const trimmed = inferenceUrl.replace(/\/+$/, '');
  return trimmed.endsWith(INFERENCE_API_PATH)
    ? trimmed
    : `${trimmed}${INFERENCE_API_PATH}`;
}

/**
 * A language model that answers from the inference service.
 *
 * `.chat()` rather than the provider's default: that is the
 * `/chat/completions` endpoint, which is the one the inference service
 * normalises tools and model names for.
 */
export function createBrowserModel(
  options: BrowserModelOptions,
): LanguageModel {
  const provider = createOpenAI({
    name: 'datalayer-ai-inference',
    baseURL: inferenceApiUrl(options.inferenceUrl),
    // The provider requires a key and would otherwise look for one in an
    // environment that does not exist in a browser. The service authenticates
    // on the bearer token, so an anonymous caller sends a placeholder and is
    // refused by the service rather than by the SDK.
    apiKey: options.token || 'datalayer',
    headers: options.headers,
    fetch: options.fetch,
  });
  return provider.chat(options.model || DEFAULT_BROWSER_MODEL);
}
