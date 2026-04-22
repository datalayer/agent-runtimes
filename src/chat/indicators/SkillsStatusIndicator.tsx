/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * SkillsStatusIndicator — Round status dot representing skill state.
 *
 * Aggregate logic:
 * - no skills configured -> none (gray)
 * - skills loading       -> loading (amber, pulsing)
 * - some enabled         -> active (green)
 * - none enabled         -> inactive (gray)
 */

import { useEffect, useMemo } from 'react';
import { Tooltip } from '@primer/react';
import { Box } from '@datalayer/primer-addons';

export interface SkillsStatusIndicatorProps {
  skillsCount: number;
  enabledCount: number;
  loading?: boolean;
}

type SkillsAggregateStatus = 'none' | 'loading' | 'inactive' | 'active';

const SKILLS_STATUS_COLORS: Record<SkillsAggregateStatus, string> = {
  none: '#8b949e',
  loading: '#d29922',
  inactive: '#8b949e',
  active: '#3fb950',
};

const SKILLS_PULSE_KEYFRAMES = `
@keyframes skills-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;

function useInjectKeyframes() {
  useEffect(() => {
    const id = '__skills-pulse-keyframes__';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = SKILLS_PULSE_KEYFRAMES;
    document.head.appendChild(style);
  }, []);
}

function deriveAggregate(
  skillsCount: number,
  enabledCount: number,
  loading: boolean,
): SkillsAggregateStatus {
  if (skillsCount <= 0) return 'none';
  if (loading) return 'loading';
  if (enabledCount > 0) return 'active';
  return 'inactive';
}

function buildTooltip(
  aggregate: SkillsAggregateStatus,
  skillsCount: number,
  enabledCount: number,
): string {
  if (aggregate === 'none') return 'No Skills defined';
  if (aggregate === 'loading') {
    return `Skills loading (${enabledCount}/${skillsCount} enabled)`;
  }
  if (aggregate === 'active') {
    return `Skills active (${enabledCount}/${skillsCount} enabled)`;
  }
  return `Skills available (${enabledCount}/${skillsCount} enabled)`;
}

export function SkillsStatusIndicator({
  skillsCount,
  enabledCount,
  loading = false,
}: SkillsStatusIndicatorProps) {
  useInjectKeyframes();

  const aggregate = useMemo(
    () => deriveAggregate(skillsCount, enabledCount, loading),
    [skillsCount, enabledCount, loading],
  );

  const tooltipText = useMemo(
    () => buildTooltip(aggregate, skillsCount, enabledCount),
    [aggregate, skillsCount, enabledCount],
  );

  return (
    <Tooltip text={tooltipText} direction="n">
      <button
        type="button"
        aria-label={tooltipText}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          padding: 0,
          border: 'none',
          background: 'none',
          cursor: 'default',
          lineHeight: 0,
        }}
      >
        <Box
          as="span"
          sx={{
            display: 'inline-block',
            width: 12,
            height: 12,
            borderRadius: '50%',
            bg: SKILLS_STATUS_COLORS[aggregate],
            flexShrink: 0,
            ...(aggregate === 'loading' && {
              animation: 'skills-pulse 1.5s ease-in-out infinite',
            }),
          }}
        />
      </button>
    </Tooltip>
  );
}

export default SkillsStatusIndicator;
