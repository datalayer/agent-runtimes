/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The Composer: the editors an application is built with, one Appspec under
 * all of them — its **Canvas** (`AppCanvasEditor`: the agent and its parts
 * on a graph, dragged from a toolbox and dropped on it, with their
 * properties drawn from the Appspec's schema), its **layout**
 * (`AppLayoutEditor`: the page a person meets, block by block, dragged into
 * place), its **YAML** (`AppYamlEditor`, with the instant checks) and its
 * **Python** (`AppPythonEditor`, its `app.py`).
 *
 * Each is handed the application (`AppDraft`) and hands back a change; a
 * host keeps it, saves it and versions it. Read only, each draws without a
 * change handler (or, for the Canvas, as a picture: `mock`).
 *
 * @module apps/composer
 */

export { AppCanvasEditor } from './AppCanvasEditor';
export type {
  AppCanvasEditorProps,
  AppCanvasEditorEditProps,
  AppCanvasEditorMockProps,
} from './AppCanvasEditor';
export { AppLayoutEditor, type AppLayoutEditorProps } from './AppLayoutEditor';
export {
  AppYamlEditor,
  readAppYaml,
  type AppYamlEditorProps,
  type AppYamlRead,
} from './AppYamlEditor';
export {
  AppPythonEditor,
  markedLine,
  type AppPythonEditorProps,
} from './AppPythonEditor';
export { AppEditorWithPreview } from './AppEditorWithPreview';
export { CodeEditor, type CodeEditorProps } from './CodeEditor';
export { KeptWhileHidden } from './KeptWhileHidden';
export { draftOfAppspec, type AppDraft } from './draft';
export type { AppCode, AppCodeFile, CodeMark } from './appCode';
export type { AppInterface, InterfaceComponent } from './appInterface';
export type { AskModel, ChatMessage } from './canvasAsk';
