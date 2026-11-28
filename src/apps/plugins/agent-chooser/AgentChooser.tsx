/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * The agent chooser: a launcher at the trailing end of the chat's title bar,
 * the apps grid and *Choose an agent (N)*, that opens the agents a host
 * offers, under their categories, in a modal dialog. Choosing one closes it
 * and tells the host (`onChoose`, with the agent's id); the agent at work is
 * marked *Open now*.
 *
 * The launcher is a button with `aria-haspopup="dialog"`, `aria-expanded`
 * and `aria-controls`; the dialog a modal named by its heading, the focus on
 * the agent at work when it opens, kept inside while it is open (Tab and
 * Shift+Tab wrap), back on the launcher when it closes, by Escape, by the
 * close button or by a click outside. The arrow keys, Home and End move
 * along the agents (`rovedIndex`). The page under it does not scroll while
 * it is open. Drawn over the page from a portal — into the element on full
 * screen when there is one, so that it is seen there too. Theme tokens only;
 * no motion under `prefers-reduced-motion`; one column on a phone, and the
 * launcher's words shortened to *Agents* in a narrow title bar.
 *
 * In its own file, loaded lazily: the plugin's module stays a manifest.
 *
 * @module apps/plugins/agent-chooser/AgentChooser
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@primer/octicons-react';
import AppsGridIcon from '@datalayer/icons-react/data1/AppsGridIcon';
import { FluentEmoji } from '@datalayer/core/lib/components/emoji';
import { getAgentPresentation } from '../../../specs/agentPresentations';
import type { AgentWorkspaceContext } from '../../core';
import {
  bareAgentId,
  useWorkspaceAgentId,
} from '../agent-identity/agentOfWorkspace';
import {
  AGENT_CHOOSER_WORDS,
  agentOrderOf,
  groupToneOf,
  rovedIndex,
  trappedIndex,
  type AgentChooserOptions,
} from './chooser';

/** The focusable elements of the dialog, in their order: what Tab walks. */
const FOCUSABLE =
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** Under this width of the title row, in pixels, the launcher says *Agents*. */
export const CHOOSER_SHORT = 560;

const CSS = `
.dla-agent-chooser-launcher { appearance: none; font: inherit; flex: none; display: inline-flex; align-items: center; gap: 8px; min-height: 32px; padding: 3px 12px 3px 4px; border-radius: 10px; border: 1px solid var(--borderColor-default); background: var(--bgColor-default); color: var(--fgColor-default); font-size: 13px; font-weight: 600; line-height: 20px; white-space: nowrap; cursor: pointer; box-shadow: var(--shadow-resting-small); transition: box-shadow 160ms ease-out, border-color 160ms ease-out; }
.dla-agent-chooser-launcher:hover { box-shadow: var(--shadow-resting-medium); border-color: var(--borderColor-accent-emphasis); }
.dla-agent-chooser-launcher:focus-visible { outline: 2px solid var(--focus-outlineColor, var(--fgColor-accent)); outline-offset: 2px; }
.dla-agent-chooser-launcher[aria-expanded="true"] { border-color: var(--borderColor-accent-emphasis); }
.dla-agent-chooser-mark { width: 24px; height: 24px; border-radius: 7px; display: inline-flex; align-items: center; justify-content: center; background: var(--bgColor-accent-muted); color: var(--fgColor-accent); transition: transform 240ms ease-out; }
.dla-agent-chooser-launcher:hover .dla-agent-chooser-mark, .dla-agent-chooser-launcher[aria-expanded="true"] .dla-agent-chooser-mark { transform: rotate(90deg); }
.dla-agent-chooser-short { display: none; }
@container (max-width: ${CHOOSER_SHORT - 1}px) {
  .dla-agent-chooser-long { display: none; }
  .dla-agent-chooser-short { display: inline; }
}
.dla-agent-chooser-backdrop[hidden] { display: none; }
.dla-agent-chooser-backdrop { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: color-mix(in srgb, var(--bgColor-emphasis) 38%, transparent); backdrop-filter: blur(6px); animation: dla-agent-chooser-fade 180ms ease-out; }
@keyframes dla-agent-chooser-fade { from { opacity: 0; } to { opacity: 1; } }
.dla-agent-chooser-dialog { box-sizing: border-box; position: relative; width: min(820px, 100%); max-height: calc(100vh - 32px); overflow: auto; padding: 24px; border-radius: 24px; border: 1px solid var(--borderColor-default); background: var(--overlay-bgColor, var(--bgColor-default)); box-shadow: var(--shadow-floating-xlarge); text-align: left; animation: dla-agent-chooser-rise 240ms cubic-bezier(0.2, 0.8, 0.2, 1); }
@keyframes dla-agent-chooser-rise { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: none; } }
.dla-agent-chooser-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
.dla-agent-chooser-title { margin: 0; font-size: 24px; font-weight: 600; line-height: 30px; letter-spacing: -0.015em; color: var(--fgColor-default); }
.dla-agent-chooser-says { margin: 4px 0 0; font-size: 14px; line-height: 20px; color: var(--fgColor-muted); }
.dla-agent-chooser-close { appearance: none; flex: none; width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--borderColor-default); background: transparent; color: var(--fgColor-muted); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.dla-agent-chooser-close:hover { color: var(--fgColor-default); background: var(--bgColor-muted); }
.dla-agent-chooser-close:focus-visible, .dla-agent-chooser-tile:focus-visible { outline: 2px solid var(--focus-outlineColor, var(--fgColor-accent)); outline-offset: 2px; }
.dla-agent-chooser-group + .dla-agent-chooser-group { margin-top: 20px; }
.dla-agent-chooser-group-name { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fgColor-muted); }
.dla-agent-chooser-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
.dla-agent-chooser-tile { appearance: none; font: inherit; box-sizing: border-box; width: 100%; height: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 14px; padding: 16px; border-radius: 16px; border: 1px solid var(--borderColor-muted); background: var(--bgColor-default); color: var(--fgColor-default); text-align: left; cursor: pointer; position: relative; overflow: hidden; opacity: 0; transform: translateY(10px); animation: dla-agent-chooser-tile-in 320ms ease-out forwards; transition: border-color 160ms ease-out, box-shadow 160ms ease-out, transform 160ms ease-out; }
@keyframes dla-agent-chooser-tile-in { to { opacity: 1; transform: none; } }
.dla-agent-chooser-tile::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: var(--dla-tone); opacity: 0.85; }
.dla-agent-chooser-tile:hover { border-color: var(--dla-tone); box-shadow: var(--shadow-resting-medium); transform: translateY(-2px); }
.dla-agent-chooser-tile[aria-current="true"] { border-color: var(--dla-tone); background: var(--dla-tone-subtle); }
.dla-agent-chooser-avatar { width: 56px; height: 56px; border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; background: var(--bgColor-muted); }
.dla-agent-chooser-tile[aria-current="true"] .dla-agent-chooser-avatar { background: var(--bgColor-default); }
.dla-agent-chooser-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--dla-tone); }
.dla-agent-chooser-name { display: block; margin-top: 2px; font-size: 18px; font-weight: 600; line-height: 24px; }
.dla-agent-chooser-role { display: block; margin-top: 4px; font-size: 14px; line-height: 20px; color: var(--fgColor-muted); }
.dla-agent-chooser-current { display: inline-block; margin-top: 8px; padding: 0 8px; border-radius: 999px; font-size: 12px; line-height: 20px; font-weight: 600; background: var(--bgColor-default); color: var(--fgColor-default); border: 1px solid var(--dla-tone); }
@media (max-width: 639px) {
  .dla-agent-chooser-dialog { padding: 16px; border-radius: 20px; }
  .dla-agent-chooser-tiles { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .dla-agent-chooser-tile { padding: 12px; gap: 12px; }
  .dla-agent-chooser-avatar { width: 44px; height: 44px; border-radius: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .dla-agent-chooser-backdrop, .dla-agent-chooser-dialog { animation: none; }
  .dla-agent-chooser-tile { animation: none; opacity: 1; transform: none; transition: none; }
  .dla-agent-chooser-tile:hover { transform: none; }
  .dla-agent-chooser-mark, .dla-agent-chooser-launcher { transition: none; }
  .dla-agent-chooser-launcher:hover .dla-agent-chooser-mark, .dla-agent-chooser-launcher[aria-expanded="true"] .dla-agent-chooser-mark { transform: none; }
}
`;

/** An agent's presentation; the plugin refused any agent without one when it was made. */
const presentationOf = (agentId: string) => getAgentPresentation(agentId)!;

/** Where the dialog is drawn: the element on full screen, else the page. */
const dialogHost = (): HTMLElement =>
  (document.fullscreenElement as HTMLElement | null) ?? document.body;

export function AgentChooser({
  workspace,
  options,
}: {
  workspace?: AgentWorkspaceContext;
  options: AgentChooserOptions;
}): JSX.Element {
  const { groups, onChoose } = options;
  const heading = options.heading ?? AGENT_CHOOSER_WORDS.heading;
  const base = useId();
  const dialogId = `${base}-agents`;
  const headingId = `${base}-heading`;
  const order = agentOrderOf(groups);
  const current = useWorkspaceAgentId(workspace);
  const [open, setOpen] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const tiles = useRef(new Map<string, HTMLButtonElement>());

  const close = useCallback(() => {
    setOpen(false);
    // Back where the person was.
    launcher.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    // The agent at work has the focus (the first one when it is not
    // offered), and the page under the dialog holds still.
    const atWork = order.find(agentId => bareAgentId(agentId) === current);
    tiles.current.get(atWork ?? order[0])?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
    // The focus is placed once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (agentId: string) => {
    close();
    onChoose(agentId);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The dialog is modal: its keys are its own. From a portal they would
    // still reach the title bar's toolbar, whose arrows walk its controls.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab') {
      const focusables = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
      if (focusables.length === 0) {
        return;
      }
      event.preventDefault();
      const at = focusables.indexOf(document.activeElement as HTMLElement);
      focusables[trappedIndex(at, focusables.length, event.shiftKey)].focus();
      return;
    }
    const from = (event.target as HTMLElement)
      .closest?.('[data-agent-chooser-agent]')
      ?.getAttribute('data-agent-chooser-agent');
    if (!from) {
      return;
    }
    const to = rovedIndex(event.key, order.indexOf(from), order.length);
    if (to === undefined) {
      return;
    }
    event.preventDefault();
    tiles.current.get(order[to])?.focus();
  };

  const label = AGENT_CHOOSER_WORDS.open(order.length);
  return (
    <>
      <style>{CSS}</style>
      <button
        ref={launcher}
        type="button"
        className="dla-agent-chooser-launcher"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
        data-agent-chooser-launcher=""
      >
        <span className="dla-agent-chooser-mark" aria-hidden="true">
          <AppsGridIcon size={16} />
        </span>
        <span className="dla-agent-chooser-long">{label}</span>
        <span className="dla-agent-chooser-short">
          {AGENT_CHOOSER_WORDS.openShort}
        </span>
      </button>
      {/* Always in the page, so that the launcher's aria-controls names it; hidden while closed. */}
      {createPortal(
        <div
          hidden={!open}
          className="dla-agent-chooser-backdrop"
          onMouseDown={event => {
            // A click outside the dialog closes it.
            if (event.target === event.currentTarget) {
              close();
            }
          }}
          data-agent-chooser-backdrop=""
        >
          <div
            ref={dialog}
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            className="dla-agent-chooser-dialog"
            onKeyDown={onKeyDown}
            data-agent-chooser-dialog=""
          >
            <div className="dla-agent-chooser-head">
              <div>
                <h2 id={headingId} className="dla-agent-chooser-title">
                  {heading}
                </h2>
                {options.says ? (
                  <p className="dla-agent-chooser-says">{options.says}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="dla-agent-chooser-close"
                aria-label={AGENT_CHOOSER_WORDS.close}
                onClick={close}
                data-agent-chooser-close=""
              >
                <XIcon size={16} />
              </button>
            </div>
            {groups.map((group, index) => {
              const tone = groupToneOf(index);
              const groupId = `${base}-group-${index}`;
              return (
                <section
                  key={group.name}
                  className="dla-agent-chooser-group"
                  aria-labelledby={groupId}
                  data-agent-chooser-group={group.name}
                >
                  <h3
                    id={groupId}
                    className="dla-agent-chooser-group-name"
                    style={{ '--dla-tone': tone.fg } as CSSProperties}
                  >
                    <span
                      className="dla-agent-chooser-dot"
                      aria-hidden="true"
                    />
                    {group.name}
                  </h3>
                  <ul className="dla-agent-chooser-tiles">
                    {group.agents.map(agentId => {
                      const agent = presentationOf(agentId);
                      const isCurrent = bareAgentId(agentId) === current;
                      return (
                        <li key={agentId}>
                          <button
                            ref={element => {
                              if (element) {
                                tiles.current.set(agentId, element);
                              } else {
                                tiles.current.delete(agentId);
                              }
                            }}
                            type="button"
                            className="dla-agent-chooser-tile"
                            aria-current={isCurrent ? 'true' : undefined}
                            onClick={() => choose(agentId)}
                            style={
                              {
                                '--dla-tone': tone.fg,
                                '--dla-tone-subtle': tone.subtle,
                                animationDelay: `${order.indexOf(agentId) * 40}ms`,
                              } as CSSProperties
                            }
                            data-agent-chooser-agent={agentId}
                          >
                            <span
                              className="dla-agent-chooser-avatar"
                              aria-hidden="true"
                            >
                              <FluentEmoji
                                emoji={agent.emoji}
                                size={32}
                                label=""
                              />
                            </span>
                            <span style={{ minWidth: 0 }}>
                              <span className="dla-agent-chooser-name">
                                {agent.name}
                              </span>
                              <span className="dla-agent-chooser-role">
                                {agent.tagline}
                              </span>
                              {isCurrent ? (
                                <span className="dla-agent-chooser-current">
                                  {AGENT_CHOOSER_WORDS.current}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>,
        open ? dialogHost() : document.body,
      )}
    </>
  );
}

export default AgentChooser;
