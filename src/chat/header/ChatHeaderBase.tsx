/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * ChatHeader — Header bar for the ChatBase component.
 *
 * Renders title, brand icon, sandbox status indicator, action buttons
 * (new chat, clear, settings), view-mode segmented toggle, and custom
 * header actions / content.
 *
 * The actions side is a primer-addons `Toolbar` (the user, 15 November
 * 2026: "the chat header is actually a primer addons toolbar"): the chat's
 * own controls, the items the agent's UI plugins and the host add
 * (`headerItems`), and the host's `headerActions`, each an item of one bar.
 * What does not fit a narrow chat (the Personal page's column, an embed)
 * moves into its "…" menu — the plugins' chips first, the host's actions,
 * the kernel indicator and what a host pins never.
 *
 * @module chat/header/ChatHeaderBase
 */

import { type ReactNode } from 'react';
import { Heading, IconButton, Text, Truncate } from '@primer/react';
import { Box, Toolbar, type ToolbarItem } from '@datalayer/primer-addons';
import {
  KernelIndicator,
  type ExecutionState,
  type KernelIndicatorPosition,
} from '@datalayer/jupyter-react';
import type { IKernelConnection } from '@jupyterlab/services/lib/kernel/kernel';
import {
  PlusIcon,
  TrashIcon,
  GearIcon,
  InfoIcon,
} from '@primer/octicons-react';
import { ChatViewModeToggle } from './ChatViewModeToggle';
import { AiAgentIcon } from '@datalayer/icons-react';

import type {
  ChatViewMode,
  EphemeralSurfaceMode,
  HeaderButtonsConfig,
} from '../../types/chat';
import type { SandboxStatusData } from '../../types/context';
import type { SandboxWsStatus } from '../../types/sandbox';
import { EphemeralSurfaceControl } from '../EphemeralSurfaceControl';

type RuntimeStatus = SandboxStatusData | SandboxWsStatus;

export function toRuntimeExecutionState(
  runtimeStatus?: RuntimeStatus | null,
): ExecutionState | undefined {
  if (!runtimeStatus) {
    return undefined;
  }

  if ('available' in runtimeStatus && runtimeStatus.available === false) {
    return undefined;
  }

  if (
    runtimeStatus.variant === 'unavailable' ||
    runtimeStatus.variant === 'error'
  ) {
    return undefined;
  }

  if (runtimeStatus.sandbox_running === false) {
    return 'disconnected';
  }

  if (runtimeStatus.is_executing === true) {
    return 'connected-busy';
  }

  if (runtimeStatus.sandbox_running === true) {
    return 'connected-idle';
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatBaseHeaderProps {
  title?: string;
  subtitle?: string;
  /**
   * Why the chat is off, shown beside the title.
   *
   * The header is where someone looks when a control does not respond, so the
   * reason belongs here rather than in a tooltip they would have to find.
   */
  disableReason?: string;
  brandIcon?: ReactNode;
  headerContent?: ReactNode;
  headerActions?: ReactNode;
  /**
   * Items of the actions toolbar, after the chat's own controls: the agent's
   * UI plugins' header chrome, the session menu… — see `ChatCommonProps`.
   */
  headerItems?: ToolbarItem[];
  showInformation?: boolean;
  onInformationClick?: () => void;
  padding: number;
  /** Optional kernel indicator state override from notebook runtime. */
  kernelIndicatorState?: ExecutionState;
  /** Horizontal placement for the kernel indicator in the title row. */
  kernelIndicatorPlacement?: 'left' | 'center' | 'right';
  /** Where the kernel indicator's details open (`s`, `se`, …). */
  kernelIndicatorPosition?: KernelIndicatorPosition;
  /**
   * Runtime status from agent-runtimes sandbox status stream.
   * Uses the same execution-state model as KernelIndicator.
   */
  runtimeStatus?: RuntimeStatus | null;
  /**
   * Live kernel connection from the notebook runtime. When provided,
   * the chat header renders the same `<KernelIndicator>` as the notebook
   * toolbar — subscribing to the kernel's live signals so the colour and
   * tooltip stay in sync with the notebook indicator.
   */
  kernel?: IKernelConnection | null;
  /** Optional environment name shown in indicator details. */
  kernelEnvironmentName?: string;
  /** Optional CPU info shown in indicator details. */
  kernelCpu?: string;
  /** Optional memory info shown in indicator details. */
  kernelMemory?: string;
  /** Optional GPU info shown in indicator details. */
  kernelGpu?: string;
  /** Header button configuration */
  headerButtons?: HeaderButtonsConfig;
  /** Current count of messages (used to conditionally show clear button) */
  messageCount: number;
  /** Callback when new chat is triggered */
  onNewChat: () => void;
  /** Callback when clear is triggered */
  onClear: () => void;
  /** Current chat view mode */
  chatViewMode?: ChatViewMode;
  /** Callback when view mode changes */
  onChatViewModeChange?: (mode: ChatViewMode) => void;
  /** Modes shown greyed out: the sidebar, when the host has no mount point. */
  disabledViewModes?: readonly ChatViewMode[];
  /** The modes the toggle offers; all of them when unsaid. */
  offeredViewModes?: readonly ChatViewMode[];
  /** Show the companion-surface segmented control (None / Notebook / Document). */
  showEphemeralSurfaceControl?: boolean;
  /** Whether the Notebook option is available in the surface control. */
  enableEphemeralNotebookOption?: boolean;
  /** Whether the Document option is available in the surface control. */
  enableEphemeralDocumentOption?: boolean;
  /** Current companion-surface mode. */
  ephemeralSurfaceMode?: EphemeralSurfaceMode;
  /** Callback fired when the user changes the companion-surface mode. */
  onEphemeralSurfaceModeChange?: (mode: EphemeralSurfaceMode) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatBaseHeader({
  title,
  subtitle,
  disableReason,
  brandIcon,
  headerContent,
  headerActions,
  headerItems,
  showInformation,
  onInformationClick,
  padding,
  kernelIndicatorState,
  kernelIndicatorPlacement = 'left',
  kernelIndicatorPosition = 's',
  runtimeStatus,
  kernel,
  kernelEnvironmentName,
  kernelCpu,
  kernelMemory,
  kernelGpu,
  headerButtons,
  messageCount,
  onNewChat,
  onClear,
  chatViewMode,
  onChatViewModeChange,
  disabledViewModes = [],
  offeredViewModes,
  showEphemeralSurfaceControl = false,
  enableEphemeralNotebookOption = false,
  enableEphemeralDocumentOption = false,
  ephemeralSurfaceMode = 'none',
  onEphemeralSurfaceModeChange,
}: ChatBaseHeaderProps) {
  const effectiveIndicatorState =
    kernelIndicatorState ?? toRuntimeExecutionState(runtimeStatus);
  /*
   * No indicator where there is nothing to indicate.
   *
   * It used to fall back to `'undefined'` with no kernel and no state, which
   * draws a full control — dot, label and a details overlay reading
   * "State: undefined, Kernel: unknown-kernel, Server: unknown-url" down to
   * the last field. A reader cannot tell that apart from a runtime that has
   * genuinely gone wrong, so a host that simply never wired the indicator up
   * was reporting a broken sandbox on every page.
   *
   * A host with something to say passes a `kernel`, a state, or a runtime
   * status. Passing none of the three is not a state; it is silence, and the
   * honest rendering of silence is nothing at all.
   */
  const kernelIndicatorElement = kernel ? (
    <KernelIndicator
      kernel={kernel}
      environmentName={kernelEnvironmentName}
      cpu={kernelCpu}
      memory={kernelMemory}
      gpu={kernelGpu}
      position={kernelIndicatorPosition}
      bordered={false}
    />
  ) : effectiveIndicatorState ? (
    <KernelIndicator
      state={effectiveIndicatorState}
      environmentName={kernelEnvironmentName}
      cpu={kernelCpu}
      memory={kernelMemory}
      gpu={kernelGpu}
      position={kernelIndicatorPosition}
      bordered={false}
    />
  ) : null;

  /*
   * The actions toolbar: a leading spacer keeps them on the trailing edge,
   * then the chat's controls, the given items, and the host's own actions —
   * pinned, since a host puts its close button there.
   */
  const toolbarItems: ToolbarItem[] = [
    { key: 'chat-header-lead', type: 'spacer' },
  ];
  if (kernelIndicatorPlacement === 'right' && kernelIndicatorElement) {
    toolbarItems.push({
      key: 'chat-header-kernel',
      type: 'custom',
      pinned: true,
      render: () => kernelIndicatorElement,
    });
  }
  if (headerButtons?.showNewChat) {
    toolbarItems.push({
      key: 'chat-header-new',
      type: 'button',
      icon: PlusIcon,
      ariaLabel: 'New chat',
      title: 'New chat',
      onClick: onNewChat,
    });
  }
  if (headerButtons?.showClear && messageCount > 0) {
    toolbarItems.push({
      key: 'chat-header-clear',
      type: 'button',
      icon: TrashIcon,
      ariaLabel: 'Clear messages',
      title: 'Clear messages',
      onClick: onClear,
    });
  }
  if (headerButtons?.showSettings) {
    toolbarItems.push({
      key: 'chat-header-settings',
      type: 'button',
      icon: GearIcon,
      ariaLabel: 'Settings',
      title: 'Settings',
      onClick: () => headerButtons?.onSettings?.(),
    });
  }
  // Companion surface control (Chat only / Notebook / Document).
  if (showEphemeralSurfaceControl) {
    toolbarItems.push({
      key: 'chat-header-surface',
      type: 'custom',
      render: () => (
        <EphemeralSurfaceControl
          mode={ephemeralSurfaceMode}
          onChange={onEphemeralSurfaceModeChange}
          enableNotebook={enableEphemeralNotebookOption}
          enableDocument={enableEphemeralDocumentOption}
        />
      ),
    });
  }
  // View mode segmented toggle — the same control a floating composer
  // carries in its footer; see `ChatViewModeToggle`.
  if (chatViewMode && onChatViewModeChange) {
    toolbarItems.push({
      key: 'chat-header-view-mode',
      type: 'custom',
      render: () => (
        <ChatViewModeToggle
          value={chatViewMode}
          onChange={onChatViewModeChange}
          disabledModes={disabledViewModes}
          modes={offeredViewModes}
        />
      ),
    });
  }
  if (headerItems?.length) {
    toolbarItems.push(...headerItems);
  }
  if (headerActions) {
    toolbarItems.push({
      key: 'chat-header-actions',
      type: 'custom',
      pinned: true,
      render: () => headerActions,
    });
  }

  return (
    <Box
      display="flex"
      flexDirection="column"
      bg="canvas.default"
      borderBottom="1px solid"
      borderColor="border.default"
    >
      {/* Title row */}
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        p={padding}
      >
        <Box
          display="flex"
          alignItems="center"
          gap={2}
          minWidth={0}
          maxWidth="65%"
          flex="0 1 auto"
        >
          {kernelIndicatorPlacement === 'left' && kernelIndicatorElement}
          {brandIcon || <AiAgentIcon colored size={20} />}
          {(title || subtitle) && (
            <Box
              display="flex"
              flexDirection="column"
              minWidth={0}
              maxWidth="100%"
            >
              {title && (
                <Heading
                  as="h3"
                  sx={{
                    fontSize: 2,
                    fontWeight: 'semibold',
                    minWidth: 0,
                    maxWidth: '100%',
                  }}
                >
                  <Truncate title={title} maxWidth="28ch">
                    {title}
                  </Truncate>
                </Heading>
              )}
              {subtitle && (
                <Text
                  sx={{
                    fontSize: 0,
                    color: 'fg.muted',
                    minWidth: 0,
                    maxWidth: '100%',
                  }}
                >
                  <Truncate title={subtitle} maxWidth="40ch">
                    {subtitle}
                  </Truncate>
                </Text>
              )}
            </Box>
          )}
          {/* Inline header content (e.g., protocol label) */}
          {headerContent}
          {showInformation && (
            <IconButton
              icon={InfoIcon}
              aria-label="Information"
              variant="invisible"
              size="small"
              onClick={onInformationClick}
            />
          )}
          {kernelIndicatorPlacement === 'center' && kernelIndicatorElement}
        </Box>

        {/* A box of its own: its width, what the row leaves after the
            title, is the room the toolbar measures. */}
        <Box flex="1 1 0" minWidth="40px" ml={2}>
          <Toolbar
            items={toolbarItems}
            variant="inline"
            gap={4}
            ariaLabel="Chat actions"
            overflowAriaLabel="More chat actions"
          />
        </Box>
      </Box>
      {/* Why the chat is off, under what it is, wrapped on its own line.
          Said plainly rather than implied by a dead input box. In the title
          row a long sentence that would not shrink squeezed the title to
          nothing and was drawn over it ("arketer", 14 November 2026). */}
      {disableReason && (
        <Box px={padding} pb={2} mt={-1}>
          <Text
            role="status"
            data-chat-disable-reason=""
            sx={{
              display: 'block',
              fontSize: 1,
              color: 'attention.fg',
              overflowWrap: 'anywhere',
            }}
          >
            {disableReason}
          </Text>
        </Box>
      )}
    </Box>
  );
}
