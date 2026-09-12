/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import '@datalayer/jupyter-react/lib/css/PrismCss';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { $getRoot, $createParagraphNode, EditorState } from 'lexical';
import { LexicalExtensionComposer } from '@lexical/react/LexicalExtensionComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import type { ServiceManager } from '@jupyterlab/services';
import { Box } from '@datalayer/primer-addons';
import { JupyterReactTheme, useJupyter } from '@datalayer/jupyter-react';
import {
  ComponentPickerMenuPlugin,
  JupyterInputOutputPlugin,
  DraggableBlockPlugin,
  LexicalConfigProvider,
  LexicalStatePlugin,
  FloatingTextFormatToolbarPlugin,
  CodeActionMenuPlugin,
} from '@datalayer/jupyter-lexical';
import type { ToolbarItem } from '@datalayer/primer-addons';
import { editorExtension } from '../lexical/editorConfig';

import '@datalayer/jupyter-lexical/style/index.css';
import '../lexical/lexical-theme.css';

const LEXICAL_ID = 'agent-runtime-lexical-editor';
const INITIAL_CONTENT = undefined;

/**
 * Lexical plugin for loading initial content into the editor.
 */
function LoadContentPlugin({ content }: { content?: string }) {
  const [editor] = useLexicalComposerContext();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!content || !isFirstRender.current) {
      return;
    }

    isFirstRender.current = false;
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && parsed.root) {
        const editorState = editor.parseEditorState(content);
        editor.setEditorState(editorState, {
          tag: 'history-merge',
        });
      } else {
        throw new Error('Invalid Lexical editor state format');
      }
    } catch {
      editor.update(
        () => {
          const root = $getRoot();
          root.clear();
          const paragraph = $createParagraphNode();
          root.append(paragraph);
        },
        {
          tag: 'history-merge',
        },
      );
    }
  }, [content, editor]);

  return null;
}

/**
 * Wrapper component for kernel-dependent Simple plugins.
 */
function SimpleKernelPluginsInner() {
  const { defaultKernel } = useJupyter();

  return (
    <>
      <ComponentPickerMenuPlugin kernel={defaultKernel} />
      <JupyterInputOutputPlugin kernel={defaultKernel} />
    </>
  );
}

export interface LexicalEditorProps {
  content?: string;
  serviceManager?: ServiceManager.IManager;
  /** Optional extra toolbar items (e.g. AI actions from useChatInlineToolbarItems) */
  extraItems?: ToolbarItem[];
  /** Optional additional children to render inside the composer */
  children?: React.ReactNode;
}

/**
 * Lexical Editor Component
 *
 * Rich text editor with Simple integration.
 */
export const LexicalEditor: React.FC<LexicalEditorProps> = ({
  content = INITIAL_CONTENT,
  serviceManager,
  extraItems,
  children,
}) => {
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);
  const [_isLinkEditMode, setIsLinkEditMode] = useState(false);

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem);
    }
  };

  const handleChange = useCallback((_editorState: EditorState) => {
    // onChange handler - can be used for tracking changes
  }, []);

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'border.default',
        borderRadius: 2,
        padding: 3,
        backgroundColor: 'canvas.default',
        minHeight: '600px',
      }}
    >
      <LexicalConfigProvider
        lexicalId={LEXICAL_ID}
        serviceManager={serviceManager}
      >
        <LexicalExtensionComposer
          extension={editorExtension}
          contentEditable={null}
        >
          <div className="lexical-editor-inner" ref={onRef}>
            <LexicalStatePlugin />
            <ContentEditable
              className="lexical-editor-content"
              aria-label="Lexical Editor"
            />
            <OnChangePlugin onChange={handleChange} />
            <LoadContentPlugin content={content} />
            <JupyterReactTheme useBaseStyles={false}>
              <SimpleKernelPluginsInner />
            </JupyterReactTheme>
            {floatingAnchorElem && (
              <>
                <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
                <FloatingTextFormatToolbarPlugin
                  anchorElem={floatingAnchorElem}
                  setIsLinkEditMode={setIsLinkEditMode}
                  extraItems={extraItems}
                />
                <CodeActionMenuPlugin anchorElem={floatingAnchorElem} />
              </>
            )}
            {children}
          </div>
        </LexicalExtensionComposer>
      </LexicalConfigProvider>
    </Box>
  );
};
