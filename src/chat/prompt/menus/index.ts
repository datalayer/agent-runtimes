/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The menus under the prompt.
 *
 * One file each, and exported from here so the prompt imports a folder rather
 * than four paths. They were private sub-components of one 1100-line module,
 * which made the file hard to read and each menu hard to find.
 *
 * @module chat/prompt/menus
 */

export { AgentsMenu } from './AgentsMenu';
export { InlineAgentsMenu } from './InlineAgentsMenu';
export { ToolsMenu } from './ToolsMenu';
export { SkillsMenu } from './SkillsMenu';
export { ModelSelector } from './ModelSelector';
export { SuggestionsMenu } from './SuggestionsMenu';
