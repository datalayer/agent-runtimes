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
 * Where an in-page agent asks its model, and as whom.
 *
 * A browser agent needs no runtime, but it does need an account: a page cannot
 * hold an AWS credential, so the model is reached through the Datalayer
 * inference service, which holds them, routes to Bedrock, and admits signed-in
 * members only.
 *
 * Its own hook because two callers need the identical answer — the examples
 * shell and the LOOP workspace — and neither should be reading stores to work
 * out a host.
 *
 * @module hooks/useBrowserInference
 */

import { useMemo } from 'react';

import { useCoreStore, useIAMStore } from '../state';
import {
  browserModelRequiresSignIn,
  useAnonymousInferenceSession,
  type AnonymousSession,
  type BrowserModelOptions,
} from '../runtimes/browser';

/**
 * The control plane, not the runtimes plane.
 *
 * Used only when nothing is configured. r1 serves runtimes and does not serve
 * this route at all, so a browser agent pointed there fails its CORS preflight
 * on a host that was never going to answer.
 */
const DEFAULT_INFERENCE_URL = 'https://prod1.datalayer.run';

export type BrowserInference = {
  /** Where to reach the inference service, and with whose token. */
  inference: Omit<BrowserModelOptions, 'model'>;
  /** Whether the agent would be refused for want of a sign-in. */
  needsSignIn: boolean;
  /**
   * The visitor's trial key, when they are on one.
   *
   * `status: 'idle'` for a signed-in member, which is the answer a caller
   * wants for "is this person on a clock?" — nobody is. Passed on so the
   * workspace can draw the time left and say what happens when it runs out.
   */
  anonymous: AnonymousSession;
  /** Where the inference service is, for whoever needs to name it. */
  inferenceUrl: string;
};

/**
 * The inference endpoint for an in-page agent.
 *
 * @param enabled Whether an in-page agent is actually going to ask for
 *   inference. False for a workspace on a server-backed agent, which
 *   authenticates itself: minting a visitor's one trial key for an agent that
 *   will never spend it starts a clock nobody is watching.
 */
export function useBrowserInference(enabled = true): BrowserInference {
  const { configuration } = useCoreStore();
  const memberToken = useIAMStore(state => state.token);
  const inferenceUrl = configuration?.aiInferenceUrl || DEFAULT_INFERENCE_URL;

  /*
   * A visitor with no account still gets to try the thing.
   *
   * The service admits members only, so an anonymous page was refused with a
   * flat 401 and the agent looked broken rather than gated. It mints the
   * short-lived token the service offers for exactly this — worth a minute of
   * inference and nothing else. One of them, not a rolling supply: the trial
   * ends, and the workspace says so rather than quietly renewing it. A
   * member's own token is strictly better, so this only runs when there is
   * not one.
   */
  const anonymous = useAnonymousInferenceSession(
    inferenceUrl,
    enabled && !memberToken,
  );
  const token = memberToken || anonymous.token;

  const inference = useMemo(
    () => ({
      inferenceUrl,
      // The signed-in person's token, forwarded so the completion is made as
      // them and metered to them — or the anonymous one, which names nobody.
      token: token || undefined,
    }),
    [inferenceUrl, token],
  );

  return {
    inference,
    needsSignIn: browserModelRequiresSignIn(inference),
    anonymous,
    inferenceUrl,
  };
}

export default useBrowserInference;
