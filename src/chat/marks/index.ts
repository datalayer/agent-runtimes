/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The marks of the catalogues: icons by package, emoji, and whose a tool call is.
 *
 * @module chat/marks
 */

export {
  ICON_PACKAGES,
  exportNameOf,
  parseIconRef,
  type IconPackage,
  type IconRef,
} from './iconRef';
export {
  SpecMark,
  hasMark,
  iconOf,
  loadIconPackage,
  useMarkIcon,
  type MarkIcon,
  type SpecMarkProps,
} from './SpecMark';
export {
  SKILL_TOOLS,
  marksOfFrontendTool,
  marksOfMcpServer,
  marksOfRuntimeTool,
  marksOfSkill,
  marksOfToolCall,
  skillIdOfCall,
  type MarkedMcpServer,
  type Marks,
  type ToolKind,
  type ToolMarks,
} from './toolMarks';
