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
 * A page cannot hold an AWS credential, so an in-browser agent does not reach
 * Bedrock directly — it reaches the Datalayer inference service, which is
 * OpenAI-compatible, holds the AWS credentials on the other side, and routes
 * to Bedrock through LiteLLM. The SDK's OpenAI provider pointed at that base
 * URL is the whole of it.
 *
 * **The service authenticates.** Every route on it requires a platform member,
 * so a browser agent needs the signed-in person's Datalayer token and is
 * refused with a 401 without one. This is the one thing an in-browser agent
 * cannot do without a server: no runtime, no sandbox, but still an account.
 * {@link createBrowserModel} sends the token as the bearer credential, so the
 * request is attributed to the person making it and their usage is metered
 * like any other.
 *
 * The model *name* needs no translation. A spec writes
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
  /**
   * The signed-in person's Datalayer token.
   *
   * Required in practice: the inference service admits platform members only.
   * Optional in the type so a host can build the model before the token has
   * arrived, and {@link browserModelRequiresSignIn} is the check to make
   * before offering the agent rather than letting it fail on the first turn.
   */
  token?: string;
  /** Extra headers, for a host that authenticates some other way. */
  headers?: Record<string, string>;
  /** Custom fetch, for tests and for hosts that wrap the network. */
  fetch?: typeof globalThis.fetch;
};

/**
 * Whether this agent would be refused for want of a sign-in.
 *
 * Worth asking before showing a chat: an agent that answers every message with
 * a 401 is worse than one a host had the sense not to offer.
 */
export function browserModelRequiresSignIn(
  options: Pick<BrowserModelOptions, 'token'>,
): boolean {
  return !options.token?.trim();
}

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
    // Sent as `Authorization: Bearer <token>`, which is what the service's
    // bearer scheme reads — so the completion is made as the signed-in person
    // and attributed to them.
    //
    // The placeholder is for the signed-out case, where the provider would
    // otherwise go looking for a key in an environment a browser does not
    // have: the refusal then comes from the service, as a 401 a host can
    // report, rather than from the SDK as a missing-configuration throw.
    apiKey: options.token?.trim() || 'anonymous',
    headers: options.headers,
    fetch: options.fetch,
  });
  return provider.chat(options.model || DEFAULT_BROWSER_MODEL);
}
