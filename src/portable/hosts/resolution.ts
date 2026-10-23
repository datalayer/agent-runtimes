/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which application a host's turn runs (S-202): the
 * thread's own, else an explicit choice, else the one chosen for the
 * thread's next session, else the channel's, else the installation's
 * default; then that application allowed here and in this kind of
 * conversation. Datalayer's exchange checks the person may open it at every
 * turn: nothing here authorizes alone. The host says each refusal in its own
 * words. Moved from the Slack service (DC-004).
 *
 * @module portable/hosts/resolution
 */

/** An application the installation allows, as a host keeps it to show and choose from. */
export type AllowanceView = Readonly<{
  applicationId: string;
  name: string;
  enabled: boolean;
  /** Whether it answers in channels, or in direct messages only. */
  channelPolicy: 'channels' | 'direct-only';
}>;

/** A channel's own rule: denied, or its default application. */
export type ChannelRule = Readonly<{
  state: 'allow' | 'deny';
  applicationId?: string;
}>;

export type ApplicationRefusal =
  'channel-denied' | 'no-application' | 'not-allowed' | 'direct-only';

export type ApplicationResolution<A extends AllowanceView> =
  | Readonly<{ ok: true; applicationId: string; allowance?: A }>
  | Readonly<{ ok: false; refusal: ApplicationRefusal; allowance?: A }>;

/**
 * The application a turn runs, or why none does. The lookups are read only
 * when the order reaches them. With no allowance kept, any application is
 * taken (Datalayer's exchange still decides).
 */
export async function resolveApplication<A extends AllowanceView>(input: {
  visibility: 'channel' | 'direct';
  /** The thread's application once it has a session: switching is explicit (S-208). */
  threadApplication?: string;
  /** The application chosen with this very prompt. */
  explicit?: string;
  /** The application chosen for the thread's next session. */
  next: () => Promise<string | undefined>;
  /** The channel's own rule; never read in a direct conversation. */
  channel: () => Promise<ChannelRule | undefined>;
  defaultApplication: () => Promise<string | undefined>;
  allowances: readonly A[];
}): Promise<ApplicationResolution<A>> {
  let applicationId: string | undefined;
  if (input.threadApplication) {
    applicationId = input.threadApplication;
  } else if (input.explicit) {
    applicationId = input.explicit;
  } else {
    applicationId = await input.next();
    if (!applicationId) {
      const channel =
        input.visibility === 'channel' ? await input.channel() : undefined;
      if (channel?.state === 'deny') {
        return { ok: false, refusal: 'channel-denied' };
      }
      applicationId =
        channel?.applicationId ?? (await input.defaultApplication());
    }
  }
  if (!applicationId) {
    return { ok: false, refusal: 'no-application' };
  }
  const allowance = input.allowances.find(
    one => one.applicationId === applicationId && one.enabled,
  );
  if (input.allowances.length > 0 && !allowance) {
    return { ok: false, refusal: 'not-allowed' };
  }
  if (
    allowance?.channelPolicy === 'direct-only' &&
    input.visibility === 'channel'
  ) {
    return { ok: false, refusal: 'direct-only', allowance };
  }
  return { ok: true, applicationId, allowance };
}

/** The applications a person may choose from here: enabled, and answering in this kind of conversation. */
export function usableAllowances<A extends AllowanceView>(
  allowances: readonly A[],
  visibility: 'channel' | 'direct',
): A[] {
  return allowances.filter(
    one =>
      one.enabled &&
      (one.channelPolicy === 'channels' || visibility === 'direct'),
  );
}
