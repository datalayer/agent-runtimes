/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A conversation's switches over the session API, for a chat whose runtime
 * opens no monitoring stream (the user, 19 November 2026: the switches of an
 * application's page work on its runtime, for visitors and people signed in
 * alike).
 *
 * `GET /api/v1/apps/sessions/{uid}/switches` says what the conversation
 * switched — read once its session is held, and again after each turn —
 * and each switch is a `PUT` of it, answered with the conversation's
 * switches. A refused switch is said (`refusal`, the runtime's sentence),
 * never dropped. Until the runtime holds the session (before a first
 * message), `started` is false: there is nothing to switch yet.
 *
 * @module hooks/useConversationSwitches
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AppSessionsClient,
  ConversationSwitch,
  ConversationSwitchesState,
} from '../portable/sessions';

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function useConversationSwitches({
  client,
  uid,
  held,
  refresh,
  skillOn,
}: {
  /** The session API, or none where switches do not go through it. */
  client: Pick<AppSessionsClient, 'switches' | 'switchIn'> | undefined;
  /** The conversation's session. */
  uid: string;
  /** Whether the runtime holds that session yet. */
  held: boolean;
  /** Read again when this changes: after each turn. */
  refresh?: unknown;
  /** Whether a skill the conversation has not switched is on: its agent's word. */
  skillOn: (skillId: string) => boolean;
}) {
  const [state, setState] = useState<ConversationSwitchesState>();
  const [refusal, setRefusal] = useState<string>();
  useEffect(() => {
    setRefusal(undefined);
    if (!client || !uid || !held) {
      setState(undefined);
      return undefined;
    }
    let current = true;
    client.switches(uid).then(
      answer => {
        if (current) {
          setState(answer);
        }
      },
      error => {
        if (current) {
          setState(undefined);
          setRefusal(said(error));
        }
      },
    );
    return () => {
      current = false;
    };
  }, [client, uid, held, refresh]);

  const send = useCallback(
    (switched: ConversationSwitch) => {
      if (!client || !state) {
        throw new Error(
          'This conversation is not held by its runtime yet: nothing to switch.',
        );
      }
      client.switchIn(uid, switched).then(
        answer => {
          setState(answer);
          setRefusal(undefined);
        },
        error => setRefusal(said(error)),
      );
    },
    [client, state, uid],
  );

  const enabledMcpTools = useMemo(
    () =>
      new Map(
        Object.entries(state?.mcp_tools ?? {}).map(([server, tools]) => [
          server,
          new Set(tools),
        ]),
      ),
    [state],
  );
  const approvedMcpTools = useMemo(
    () =>
      new Map(
        Object.entries(state?.mcp_approved ?? {}).map(([server, tools]) => [
          server,
          new Set(tools),
        ]),
      ),
    [state],
  );
  const approvedSkills = useMemo(
    () =>
      new Set(
        Object.entries(state?.skills_approved ?? {})
          .filter(([, approved]) => approved)
          .map(([skill]) => skill),
      ),
    [state],
  );

  return {
    /** Whether the runtime holds the conversation: its switches can be used. */
    started: state !== undefined,
    /** The runtime's sentence for the last switch it refused. */
    refusal,
    enabledMcpTools,
    approvedMcpTools,
    /** The skills the conversation switched, on or off. */
    skillsSwitched: state?.skills ?? {},
    approvedSkills,
    onToggleMcpTool: (server: string, tool: string) =>
      send({
        kind: 'tool',
        server,
        tool,
        // On unless the conversation switched its server without it.
        enabled: !(enabledMcpTools.get(server)?.has(tool) ?? true),
      }),
    onToggleAllMcpServerTools: (
      server: string,
      _tools: string[],
      enabled: boolean,
    ) => send({ kind: 'server', server, enabled }),
    onToggleMcpToolApproval: (server: string, tool: string) =>
      send({
        kind: 'tool_approval',
        server,
        tool,
        approved: !(approvedMcpTools.get(server)?.has(tool) ?? false),
      }),
    onToggleSkill: (skill: string) =>
      send({
        kind: 'skill',
        skill,
        enabled: !(state?.skills[skill] ?? skillOn(skill)),
      }),
    onToggleAllSkills: (skills: string[], enabled: boolean) =>
      send({ kind: 'skills', skills, enabled }),
    onToggleSkillApproval: (skill: string) =>
      send({
        kind: 'skill_approval',
        skill,
        approved: !approvedSkills.has(skill),
      }),
  };
}
