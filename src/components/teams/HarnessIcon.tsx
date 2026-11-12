/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * A harness's mark, from Datalayer's icons.
 *
 * @module components/teams/HarnessIcon
 */

import type { ComponentType, JSX } from 'react';
import {
  AiAgentIcon,
  ClaudeCodeIcon,
  CodexIcon,
  GeminiCliIcon,
  GooseIcon,
  OpencodeIcon,
  OpenhandsIcon,
  PiCodingAgentIcon,
  PydanticIcon,
} from '@datalayer/icons-react';

const HARNESS_ICONS: Record<
  string,
  ComponentType<{ size?: number | 'small' | 'medium' | 'large' }>
> = {
  'claude-code': ClaudeCodeIcon,
  codex: CodexIcon,
  'gemini-cli': GeminiCliIcon,
  goose: GooseIcon,
  opencode: OpencodeIcon,
  openhands: OpenhandsIcon,
  pi: PiCodingAgentIcon,
  'pydantic-ai': PydanticIcon,
};

/** A harness's mark; the agent's own for one that has none. */
export function HarnessIcon({
  id,
  size = 14,
}: {
  id: string;
  size?: number;
}): JSX.Element {
  const Icon = HARNESS_ICONS[id] ?? AiAgentIcon;
  return <Icon size={size} />;
}
