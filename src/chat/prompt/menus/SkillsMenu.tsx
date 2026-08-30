/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Which skills are loaded, and which are merely available.
 *
 * @module chat/prompt/menus/SkillsMenu
 */

import {
  Text,
  Button,
  ActionMenu,
  ActionList,
  Tooltip,
  ToggleSwitch,
} from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { BriefcaseIcon } from '@primer/octicons-react';

import type { SkillInfo } from '../../../types';

export function SkillsMenu({
  skills,
  skillsLoading,
  enabledSkills,
  onToggleSkill,
  onToggleAllSkills,
  approvedSkills,
  onToggleSkillApproval,
}: {
  skills: SkillInfo[];
  skillsLoading: boolean;
  enabledSkills: Set<string>;
  onToggleSkill: (skillId: string) => void;
  onToggleAllSkills: (skillIds: string[], enable: boolean) => void;
  approvedSkills: Set<string>;
  onToggleSkillApproval: (skillId: string) => void;
}) {
  // A count, not a word — see `ToolsMenu`. The names go in the tooltip, which
  // is where a person asking "which skills?" is already looking.
  const summary = skillsLoading
    ? 'loading…'
    : skills.length === 0
      ? 'none loaded'
      : `${enabledSkills.size} of ${skills.length} enabled`;

  return (
    <ActionMenu>
      <ActionMenu.Anchor>
        <Tooltip text={`Skills — ${summary}`} direction="n">
          <Button
            type="button"
            variant="invisible"
            size="small"
            aria-label={`Skills — ${summary}`}
            leadingVisual={BriefcaseIcon}
          >
            <Text sx={{ fontSize: 0 }}>{skills.length}</Text>
          </Button>
        </Tooltip>
      </ActionMenu.Anchor>
      <ActionMenu.Overlay side="outside-top" align="start" width="large">
        <Box sx={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <ActionList>
            {skillsLoading ? (
              <ActionList.Item disabled>
                <Text sx={{ color: 'fg.muted' }}>Loading skills...</Text>
              </ActionList.Item>
            ) : skills.length > 0 ? (
              <>
                {/* Enable all toggle */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 3,
                    py: 2,
                    borderBottom: '1px solid',
                    borderColor: 'border.muted',
                  }}
                >
                  <Text
                    id="toggle-all-skills"
                    sx={{
                      fontSize: 0,
                      fontWeight: 'semibold',
                      color: 'fg.muted',
                    }}
                  >
                    Enable all ({enabledSkills.size}/{skills.length})
                  </Text>
                  <ToggleSwitch
                    size="small"
                    checked={enabledSkills.size === skills.length}
                    onClick={() =>
                      onToggleAllSkills(
                        skills.map(s => s.id),
                        enabledSkills.size !== skills.length,
                      )
                    }
                    aria-labelledby="toggle-all-skills"
                  />
                </Box>
                {skills.map(skill => (
                  <Box
                    key={skill.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 3,
                      py: 2,
                      '&:hover': {
                        backgroundColor: 'canvas.subtle',
                      },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <Text
                          id={`toggle-skill-${skill.id}`}
                          sx={{ fontWeight: 'semibold' }}
                        >
                          {skill.name}
                        </Text>
                        {skill.status && (
                          <Text
                            sx={{
                              fontSize: '10px',
                              px: 1,
                              borderRadius: 2,
                              bg:
                                skill.status === 'loaded'
                                  ? 'success.subtle'
                                  : skill.status === 'enabled'
                                    ? 'attention.subtle'
                                    : 'neutral.subtle',
                              color:
                                skill.status === 'loaded'
                                  ? 'success.fg'
                                  : skill.status === 'enabled'
                                    ? 'attention.fg'
                                    : 'fg.muted',
                            }}
                          >
                            {skill.status}
                          </Text>
                        )}
                      </Box>
                      {skill.description && (
                        <Text
                          sx={{
                            display: 'block',
                            fontSize: 0,
                            color: 'fg.muted',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {skill.description}
                        </Text>
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                        }}
                      >
                        <Text sx={{ fontSize: '10px', color: 'fg.muted' }}>
                          Enabled
                        </Text>
                        <ToggleSwitch
                          size="small"
                          checked={enabledSkills.has(skill.id)}
                          onClick={() => onToggleSkill(skill.id)}
                          aria-labelledby={`toggle-skill-${skill.id}`}
                        />
                      </Box>
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                        }}
                      >
                        <Text sx={{ fontSize: '10px', color: 'fg.muted' }}>
                          Approved
                        </Text>
                        <ToggleSwitch
                          size="small"
                          checked={approvedSkills.has(skill.id)}
                          onClick={() => onToggleSkillApproval(skill.id)}
                          aria-labelledby={`toggle-skill-${skill.id}`}
                        />
                      </Box>
                    </Box>
                  </Box>
                ))}
              </>
            ) : (
              <ActionList.Item disabled>
                <Text sx={{ color: 'fg.muted', fontStyle: 'italic' }}>
                  No skills available
                </Text>
              </ActionList.Item>
            )}
          </ActionList>
        </Box>
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}
