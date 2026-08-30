/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * Prompt components barrel export.
 *
 * @module chat/prompt
 */

export {
  InputPrompt,
  type InputPromptProps,
} from './InputPrompt';
export {
  InputPromptBase,
  type InputPromptBaseProps,
  type InputPromptVariant,
} from './InputPromptBase';
export {
  InputPromptHeader,
  type InputPromptHeaderProps,
} from './InputPromptHeader';
export {
  InputPromptFooter,
  type InputPromptFooterProps,
} from './InputPromptFooter';
export { InputPromptText, type InputPromptTextProps } from './InputPromptText';
export {
  InputPromptLexical,
  type InputPromptLexicalProps,
} from './InputPromptLexical';
export * from './menus';
export * from './plugins/AgentMentionPlugin';
